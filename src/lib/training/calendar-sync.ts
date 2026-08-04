/**
 * Fase 17-F — Treinos → Google Agenda · camada de I/O. APENAS servidor.
 *
 * Reaproveita por inteiro a integração da Fase 08 (os mesmos tokens em `google_integrations`,
 * escopo `calendar.events`, e o mesmo cliente HTTP `lib/google/calendar.ts`) e o contrato que a
 * Fase 15 provou funcionar no TO-DO. Nada aqui é simulado.
 *
 * GARANTIAS:
 *  • **Opt-in.** Só roda com `google_integrations.training_sync_enabled = true`. Desligado
 *    (o padrão), nenhum treino sai daqui.
 *  • **Best-effort.** Falha de rede/Google NUNCA derruba a ação: o planejamento é salvo do
 *    mesmo jeito e o erro fica em `training_calendar_sync.last_error`.
 *  • **Idempotente.** A ponte tem unique por (scheduled_workout_id, provider): repetir o envio
 *    atualiza o MESMO evento em vez de criar outro.
 *  • **Sentido único (Treinos → Google).** Não lemos eventos de volta para virar treino; isso
 *    duplicaria com a importação da agenda (Fase 08).
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
import {
  scheduledWorkoutToGoogleEvent,
  type TrainingGoogleEventInput,
} from "@/lib/training/google-event";

const PROVIDER = "google";

/** Colunas do dia planejado necessárias para montar o evento. */
const ENTRY_FIELDS =
  "id, scheduled_date, planned_time, planned_duration_minutes, entry_kind, status, title, notes, workout_id, program_id";

interface EntryRow {
  id: string;
  scheduled_date: string;
  planned_time: string | null;
  planned_duration_minutes: number | null;
  entry_kind: string;
  status: string;
  title: string | null;
  notes: string | null;
  workout_id: string | null;
  program_id: string | null;
}

/** Mensagem curta e segura para `last_error` (nunca token, nunca corpo de resposta). */
function safeError(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 300);
  return "Falha desconhecida ao falar com o Google.";
}

/**
 * Integração ativa E com envio de treinos ligado. Devolve null quando não há nada a fazer —
 * é o atalho que mantém custo zero para quem não usa o recurso.
 */
async function activeSync(
  ctx: AuthContext,
): Promise<{ accessToken: string; calendarId: string } | null> {
  const { data } = await ctx.supabase
    .from("google_integrations")
    .select("training_sync_enabled")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (!data?.training_sync_enabled) return null;
  return getValidAccessToken(ctx);
}

async function getBridge(ctx: AuthContext, entryId: string) {
  const { data } = await ctx.supabase
    .from("training_calendar_sync")
    .select("id, external_event_id, external_calendar_id")
    .eq("scheduled_workout_id", entryId)
    .eq("provider", PROVIDER)
    .maybeSingle();
  return data ?? null;
}

async function markBridge(
  ctx: AuthContext,
  entryId: string,
  patch: {
    external_event_id?: string | null;
    external_calendar_id?: string | null;
    sync_status: string;
    last_error?: string | null;
  },
): Promise<void> {
  await ctx.supabase.from("training_calendar_sync").upsert(
    {
      user_id: ctx.userId,
      scheduled_workout_id: entryId,
      provider: PROVIDER,
      last_synced_at: new Date().toISOString(),
      last_error: null,
      ...patch,
    },
    { onConflict: "scheduled_workout_id,provider" },
  );
}

type Token = { accessToken: string; calendarId: string };

/** Nome do treino-modelo e do programa (o EVENTO é do planejamento, que é intenção). */
async function resolveNames(
  ctx: AuthContext,
  entry: EntryRow,
): Promise<{ workoutName: string | null; programName: string | null }> {
  const [workout, program] = await Promise.all([
    entry.workout_id
      ? ctx.supabase
          .from("training_workouts")
          .select("name")
          .eq("id", entry.workout_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    entry.program_id
      ? ctx.supabase
          .from("training_programs")
          .select("name")
          .eq("id", entry.program_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  return {
    workoutName: workout.data?.name ?? null,
    programName: program.data?.name ?? null,
  };
}

/**
 * Núcleo da reconciliação, com o token já resolvido. Devolve `true` quando o dia ficou no
 * estado desejado (evento criado/atualizado ou removido por não precisar mais existir).
 * Nunca lança.
 */
async function syncOne(ctx: AuthContext, entryId: string, token: Token): Promise<boolean> {
  try {
    const { data: entry } = await ctx.supabase
      .from("training_scheduled_workouts")
      .select(ENTRY_FIELDS)
      .eq("id", entryId)
      .maybeSingle<EntryRow>();
    if (!entry) return false;

    const bridge = await getBridge(ctx, entryId);
    const names = await resolveNames(ctx, entry);
    const input: TrainingGoogleEventInput = {
      entryKind: entry.entry_kind,
      scheduledDate: entry.scheduled_date,
      plannedTime: entry.planned_time,
      plannedDurationMinutes: entry.planned_duration_minutes,
      status: entry.status,
      workoutName: names.workoutName,
      title: entry.title,
      programName: names.programName,
      notes: entry.notes,
    };
    const resource = scheduledWorkoutToGoogleEvent(input);

    // O dia deixou de merecer um evento (virou descanso, foi cancelado).
    if (!resource) {
      if (bridge?.external_event_id) {
        await googleDeleteEvent(
          token.accessToken,
          bridge.external_calendar_id || token.calendarId,
          bridge.external_event_id,
        );
        await markBridge(ctx, entryId, {
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
      await markBridge(ctx, entryId, { sync_status: "sincronizado" });
      return true;
    }

    const created = await googleInsertEvent(token.accessToken, token.calendarId, resource);
    await markBridge(ctx, entryId, {
      external_event_id: created.id ?? null,
      external_calendar_id: token.calendarId,
      sync_status: created.id ? "sincronizado" : "erro",
    });
    return Boolean(created.id);
  } catch (error) {
    // Best-effort: registra e segue. O planejamento já está salvo.
    try {
      await markBridge(ctx, entryId, { sync_status: "erro", last_error: safeError(error) });
    } catch {
      // Se nem isso deu, não há o que fazer — jamais quebrar a ação do usuário.
    }
    return false;
  }
}

/**
 * Reconcilia UM dia planejado com o Google. Seguro chamar sempre — sai na primeira consulta
 * quando o envio está desligado. Nunca lança.
 */
export async function syncScheduledWorkoutToGoogle(
  ctx: AuthContext,
  entryId: string,
): Promise<void> {
  const token = await activeSync(ctx);
  if (!token) return;
  await syncOne(ctx, entryId, token);
}

/** Vários de uma vez (gerar recorrência, duplicar semana, aplicar programa). */
export async function syncScheduledWorkoutsToGoogle(
  ctx: AuthContext,
  entryIds: string[],
): Promise<void> {
  if (entryIds.length === 0) return;
  const token = await activeSync(ctx);
  if (!token) return;
  // Sequencial de propósito: a API do Google tem cota por minuto e um lote paralelo grande
  // vira 429 com facilidade. O token é resolvido UMA vez, fora do laço.
  for (const id of entryIds) await syncOne(ctx, id, token);
}

/**
 * Remove o evento ANTES de excluir o dia planejado. Precisa vir antes porque
 * `training_calendar_sync.scheduled_workout_id` é `on delete cascade`: depois do delete a
 * ponte (e o id do evento) já não existe, e o evento ficaria órfão no Google.
 */
export async function removeScheduledWorkoutFromGoogle(
  ctx: AuthContext,
  entryId: string,
): Promise<void> {
  try {
    const token = await activeSync(ctx);
    if (!token) return;

    const bridge = await getBridge(ctx, entryId);
    if (!bridge?.external_event_id) return;

    await googleDeleteEvent(
      token.accessToken,
      bridge.external_calendar_id || token.calendarId,
      bridge.external_event_id,
    );
    await ctx.supabase
      .from("training_calendar_sync")
      .update({ external_event_id: null, sync_status: "desativado" })
      .eq("scheduled_workout_id", entryId)
      .eq("provider", PROVIDER);
  } catch {
    // Best-effort — a exclusão local segue de qualquer forma.
  }
}

/**
 * Reconciliação em lote, usada pelo botão "Enviar treinos agora" e logo depois de ligar a
 * opção. Cobre uma janela à frente para não despejar anos de planejamento no calendário.
 */
export async function syncAllScheduledWorkoutsToGoogle(
  ctx: AuthContext,
  fromIso: string,
  toIso: string,
): Promise<{ synced: number; failed: number }> {
  const token = await activeSync(ctx);
  if (!token) return { synced: 0, failed: 0 };

  const { data: entries } = await ctx.supabase
    .from("training_scheduled_workouts")
    .select("id")
    .eq("entry_kind", "treino")
    .gte("scheduled_date", fromIso)
    .lte("scheduled_date", toIso)
    .in("status", ["planejado", "concluido", "nao_realizado"])
    .limit(500);

  let synced = 0;
  let failed = 0;
  for (const entry of entries ?? []) {
    if (await syncOne(ctx, entry.id, token)) synced += 1;
    else failed += 1;
  }
  return { synced, failed };
}
