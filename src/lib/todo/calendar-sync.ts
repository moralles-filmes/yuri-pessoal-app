/**
 * Fase 15 (iteração) — TO-DO → Google Agenda · camada de I/O. APENAS servidor.
 *
 * Reaproveita a integração da Fase 08 por inteiro: os mesmos tokens
 * (`google_integrations`, escopo `calendar.events`, que é de leitura E ESCRITA) e o
 * mesmo cliente HTTP (`lib/google/calendar.ts`). Nada aqui é simulado.
 *
 * GARANTIAS:
 *  • **Opt-in.** Só roda com `google_integrations.todo_sync_enabled = true`. Desligado
 *    (o padrão), nenhuma tarefa sai daqui.
 *  • **Best-effort.** Falha de rede/Google NUNCA derruba a ação do usuário: a tarefa é
 *    salva do mesmo jeito e o erro fica em `todo_calendar_sync.last_error`.
 *  • **Idempotente.** A ponte `todo_calendar_sync` tem unique por (task_id, provider),
 *    então repetir o push atualiza o MESMO evento em vez de criar outro.
 *  • **Sentido único (TO-DO → Google).** Não lemos eventos de volta para virar tarefa;
 *    isso duplicaria com a importação da agenda (Fase 08).
 *  • **Nada de token em log.** `last_error` guarda só a mensagem do cliente HTTP.
 */
import "server-only";
import type { AuthContext } from "@/lib/actions/helpers";
import {
  deleteEvent as googleDeleteEvent,
  insertEvent as googleInsertEvent,
  patchEvent as googlePatchEvent,
} from "@/lib/google/calendar";
import { getValidAccessToken } from "@/lib/google/tokens";
import { taskToGoogleEvent, type TodoGoogleEventInput } from "@/lib/todo/google-event";

const PROVIDER = "google";

/** Colunas da tarefa necessárias para montar o evento. */
const TASK_FIELDS =
  "id, title, description, scheduled_date, scheduled_time, duration_minutes, status, timezone";

interface TaskRow {
  id: string;
  title: string;
  description: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  duration_minutes: number | null;
  status: string;
  timezone: string | null;
}

function toEventInput(row: TaskRow): TodoGoogleEventInput {
  return {
    title: row.title,
    description: row.description,
    scheduledDate: row.scheduled_date,
    scheduledTime: row.scheduled_time,
    durationMinutes: row.duration_minutes,
    status: row.status,
    timezone: row.timezone || "America/Sao_Paulo",
  };
}

/** Mensagem curta e segura para `last_error` (nunca token, nunca corpo de resposta). */
function safeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return "Falha desconhecida ao falar com o Google.";
}

/**
 * Integração ativa E com envio de tarefas ligado. Devolve null quando não há nada a
 * fazer — é o atalho que mantém o custo zero para quem não usa o recurso.
 */
async function activeSync(
  ctx: AuthContext,
): Promise<{ accessToken: string; calendarId: string } | null> {
  const { data } = await ctx.supabase
    .from("google_integrations")
    .select("todo_sync_enabled")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!data?.todo_sync_enabled) return null;
  return getValidAccessToken(ctx);
}

/** Linha da ponte para a tarefa, se existir. */
async function getBridge(ctx: AuthContext, taskId: string) {
  const { data } = await ctx.supabase
    .from("todo_calendar_sync")
    .select("id, external_event_id, external_calendar_id")
    .eq("task_id", taskId)
    .eq("provider", PROVIDER)
    .maybeSingle();
  return data ?? null;
}

async function markBridge(
  ctx: AuthContext,
  taskId: string,
  patch: {
    external_event_id?: string | null;
    external_calendar_id?: string | null;
    sync_status: string;
    last_error?: string | null;
  },
): Promise<void> {
  await ctx.supabase.from("todo_calendar_sync").upsert(
    {
      user_id: ctx.userId,
      task_id: taskId,
      provider: PROVIDER,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      ...patch,
    },
    { onConflict: "task_id,provider" },
  );
}

type Token = { accessToken: string; calendarId: string };

/**
 * Núcleo da reconciliação, com o token já resolvido. Devolve `true` quando a tarefa
 * ficou no estado desejado (evento criado/atualizado, ou removido por não precisar
 * mais existir). Nunca lança.
 */
async function syncOne(
  ctx: AuthContext,
  taskId: string,
  token: Token,
): Promise<boolean> {
  try {
    const { data: task } = await ctx.supabase
      .from("todo_tasks")
      .select(TASK_FIELDS)
      .eq("id", taskId)
      .maybeSingle<TaskRow>();
    if (!task) return false;

    const bridge = await getBridge(ctx, taskId);
    const resource = taskToGoogleEvent(toEventInput(task));

    // A tarefa deixou de merecer um evento (perdeu a data, foi cancelada/arquivada).
    if (!resource) {
      if (bridge?.external_event_id) {
        await googleDeleteEvent(
          token.accessToken,
          bridge.external_calendar_id || token.calendarId,
          bridge.external_event_id,
        );
        await markBridge(ctx, taskId, {
          external_event_id: null,
          sync_status: "desativado",
        });
      }
      return true;
    }

    if (bridge?.external_event_id) {
      await googlePatchEvent(
        token.accessToken,
        bridge.external_calendar_id || token.calendarId,
        bridge.external_event_id,
        resource,
      );
      await markBridge(ctx, taskId, { sync_status: "sincronizado" });
      return true;
    }

    const created = await googleInsertEvent(token.accessToken, token.calendarId, resource);
    await markBridge(ctx, taskId, {
      external_event_id: created.id ?? null,
      external_calendar_id: token.calendarId,
      sync_status: created.id ? "sincronizado" : "erro",
    });
    return Boolean(created.id);
  } catch (error) {
    // Best-effort: registra e segue. A tarefa já está salva.
    try {
      await markBridge(ctx, taskId, {
        sync_status: "erro",
        last_error: safeError(error),
      });
    } catch {
      // Se nem isso deu, não há o que fazer — jamais quebrar a ação do usuário.
    }
    return false;
  }
}

/**
 * Reconcilia UMA tarefa com o Google. Seguro chamar sempre — sai na primeira consulta
 * quando o envio está desligado. Nunca lança, nunca derruba a ação do usuário.
 */
export async function syncTaskToGoogle(ctx: AuthContext, taskId: string): Promise<void> {
  const token = await activeSync(ctx);
  if (!token) return;
  await syncOne(ctx, taskId, token);
}

/**
 * Remove o evento ANTES de excluir a tarefa. Precisa vir antes porque
 * `todo_calendar_sync.task_id` é `on delete cascade`: depois do delete a ponte
 * (e o id do evento) já não existe, e o evento ficaria órfão no Google.
 */
export async function removeTaskFromGoogle(
  ctx: AuthContext,
  taskId: string,
): Promise<void> {
  try {
    const token = await activeSync(ctx);
    if (!token) return;

    const bridge = await getBridge(ctx, taskId);
    if (!bridge?.external_event_id) return;

    await googleDeleteEvent(
      token.accessToken,
      bridge.external_calendar_id || token.calendarId,
      bridge.external_event_id,
    );
    await ctx.supabase
      .from("todo_calendar_sync")
      .update({ external_event_id: null, sync_status: "desativado" })
      .eq("task_id", taskId)
      .eq("provider", PROVIDER);
  } catch {
    // Best-effort — a exclusão local segue de qualquer forma.
  }
}

/**
 * Reconciliação em lote, usada pelo botão "Enviar tarefas agora" e logo após ligar a
 * opção. Cobre as tarefas abertas com data numa janela à frente, para não despejar
 * anos de histórico no calendário de uma vez.
 */
export async function syncAllTasksToGoogle(
  ctx: AuthContext,
  fromIso: string,
  toIso: string,
): Promise<{ synced: number; failed: number }> {
  const token = await activeSync(ctx);
  if (!token) return { synced: 0, failed: 0 };

  const { data: tasks } = await ctx.supabase
    .from("todo_tasks")
    .select("id")
    .not("scheduled_date", "is", null)
    .gte("scheduled_date", fromIso)
    .lte("scheduled_date", toIso)
    .in("status", ["pendente", "em_andamento", "concluida"])
    .limit(500);

  let synced = 0;
  let failed = 0;
  // Sequencial de propósito: a API do Google tem cota por minuto e um lote paralelo
  // grande vira 429 com facilidade. O token é resolvido UMA vez, fora do laço.
  for (const task of tasks ?? []) {
    if (await syncOne(ctx, task.id, token)) synced += 1;
    else failed += 1;
  }
  return { synced, failed };
}
