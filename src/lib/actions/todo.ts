"use server";

/**
 * Fase 15 — Módulo TO-DO · Server Actions de TAREFA.
 *
 * Segue à risca o molde de `src/lib/actions/accounts.ts`:
 *   1. authContext() → { supabase, userId }; `user_id` SEMPRE de auth.getUser().
 *   2. Zod safeParse no servidor (o formulário não é autoridade).
 *   3. Query Supabase (a RLS já restringe ao dono; os filtros por id são de escopo).
 *   4. revalidatePath + ActionResult.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import {
  todoBulkSchema,
  todoMoveSchema,
  todoQuickTaskSchema,
  todoTaskSchema,
} from "@/lib/validators/todo";
import { hojeISO } from "@/lib/format";
import { addDaysIso, materializeNext } from "@/lib/todo/recurrence";
import { logActivity, logActivityBulk, pick } from "@/lib/todo/activity";
import { removeTaskFromGoogle, syncTaskToGoogle } from "@/lib/todo/calendar-sync";
import type { ActionResult } from "@/types/finance";
import type { TodoSeriesScope } from "@/lib/todo/constants";

const TODO_PATH = "/todo";

/** Revalida o módulo e o que depende dele (contadores do dashboard e do sino). */
function revalidateTodo() {
  revalidatePath(TODO_PATH);
  revalidatePath("/dashboard");
}

/* ───────────────────────────── Helpers internos ───────────────────────────── */

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/** Próxima `position` livre dentro do escopo (fim da lista). */
async function nextPosition(
  ctx: Ctx,
  projectId: string | null,
  sectionId: string | null,
): Promise<number> {
  let query = ctx.supabase
    .from("todo_tasks")
    .select("position")
    .order("position", { ascending: false })
    .limit(1);

  query = projectId ? query.eq("project_id", projectId) : query.is("project_id", null);
  query = sectionId ? query.eq("section_id", sectionId) : query.is("section_id", null);

  const { data } = await query.maybeSingle();
  return (data?.position ?? -1) + 1;
}

/** Reescreve as etiquetas de uma tarefa (remove as que saíram, insere as que entraram). */
async function syncLabels(ctx: Ctx, taskId: string, labelIds: string[]) {
  const { data: current } = await ctx.supabase
    .from("todo_task_labels")
    .select("label_id")
    .eq("task_id", taskId);

  const currentIds = new Set((current ?? []).map((r) => r.label_id));
  const nextIds = new Set(labelIds);

  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));
  const toAdd = [...nextIds].filter((id) => !currentIds.has(id));

  if (toRemove.length) {
    await ctx.supabase
      .from("todo_task_labels")
      .delete()
      .eq("task_id", taskId)
      .in("label_id", toRemove);
  }
  if (toAdd.length) {
    await ctx.supabase.from("todo_task_labels").insert(
      toAdd.map((labelId) => ({ task_id: taskId, label_id: labelId, user_id: ctx.userId })),
    );
  }
}

/** Colunas de `todo_recurrences` gravadas a partir do formulário. */
type RecurrenceRow = {
  frequency: string;
  interval_count: number;
  days_of_week: number[] | null;
  day_of_month: number | null;
  month_of_year: number | null;
  week_of_month: number | null;
  business_day_rule: string | null;
  recurrence_mode: string;
  starts_on: string | null;
  ends_on: string | null;
  max_occurrences: number | null;
  is_paused: boolean;
};

/** Cria/atualiza/remove a recorrência 1:1 da tarefa. */
async function syncRecurrence(ctx: Ctx, taskId: string, rule: RecurrenceRow | null) {
  if (!rule) {
    await ctx.supabase.from("todo_recurrences").delete().eq("task_id", taskId);
    return;
  }
  // `upsert` pela unique (task_id) mantém `occurrences_created` sob controle da action
  // de conclusão — aqui só a REGRA muda.
  await ctx.supabase
    .from("todo_recurrences")
    .upsert({ ...rule, task_id: taskId, user_id: ctx.userId }, { onConflict: "task_id" });
}

/** Recorrência já validada pelo Zod (shape de `todoRecurrenceSchema`). */
type ParsedRecurrence = NonNullable<TodoTaskParsed["recurrence"]>;
type TodoTaskParsed = ReturnType<typeof todoTaskSchema.parse>;

/** Converte a recorrência validada nas colunas da tabela. */
function buildRecurrenceRow(recurrence: ParsedRecurrence | null): RecurrenceRow | null {
  if (!recurrence) return null;
  return {
    frequency: recurrence.frequency,
    interval_count: recurrence.interval_count,
    days_of_week: recurrence.days_of_week,
    day_of_month: recurrence.day_of_month,
    month_of_year: recurrence.month_of_year,
    week_of_month: recurrence.week_of_month,
    business_day_rule: recurrence.business_day_rule,
    recurrence_mode: recurrence.recurrence_mode,
    starts_on: recurrence.starts_on,
    ends_on: recurrence.ends_on,
    max_occurrences: recurrence.max_occurrences,
    is_paused: recurrence.is_paused,
  };
}

/** Linha crua de `todo_recurrences` como o embed a devolve. */
type RawRecurrenceRow = RecurrenceRow & { id: string; occurrences_created: number };

/** Carrega a tarefa + regra de recorrência (já no formato do módulo puro). */
async function loadTaskWithRule(ctx: Ctx, taskId: string) {
  const { data } = await ctx.supabase
    .from("todo_tasks")
    .select(
      `id, title, status, scheduled_date, deadline_at, project_id, section_id,
       parent_task_id, priority, position, completed_at, series_id,
       recurrence:todo_recurrences(*)`,
    )
    .eq("id", taskId)
    .maybeSingle();

  if (!data) return null;

  const embed = (data as { recurrence?: RawRecurrenceRow | RawRecurrenceRow[] | null })
    .recurrence;
  const raw = (Array.isArray(embed) ? embed[0] : embed) ?? null;

  const rule = raw
    ? {
        frequency: raw.frequency as "diaria" | "semanal" | "mensal" | "anual",
        intervalCount: raw.interval_count,
        daysOfWeek: raw.days_of_week,
        dayOfMonth: raw.day_of_month,
        monthOfYear: raw.month_of_year,
        weekOfMonth: raw.week_of_month,
        businessDayRule: raw.business_day_rule as
          | "primeiro_dia_util"
          | "ultimo_dia_util"
          | "apenas_dias_uteis"
          | null,
        mode: raw.recurrence_mode as "fixo" | "apos_conclusao",
        startsOn: raw.starts_on,
        endsOn: raw.ends_on,
        maxOccurrences: raw.max_occurrences,
        occurrencesCreated: raw.occurrences_created,
        isPaused: raw.is_paused,
      }
    : null;

  return { task: data, rule, recurrenceId: raw?.id };
}

/* ───────────────────────────── Criação ───────────────────────────── */

/** Criação rápida (poucos campos) — a usada pelo campo "Adicionar tarefa" e pelo quick-add. */
export async function createTodoTask(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoQuickTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const position = await nextPosition(ctx, d.project_id, d.section_id);

  const { data, error } = await ctx.supabase
    .from("todo_tasks")
    .insert({
      user_id: ctx.userId,
      title: d.title,
      project_id: d.project_id,
      section_id: d.section_id,
      parent_task_id: d.parent_task_id,
      scheduled_date: d.scheduled_date,
      scheduled_time: d.scheduled_time,
      deadline_at: d.deadline_at,
      is_all_day: !d.scheduled_time,
      priority: d.priority,
      position,
      source: "manual",
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar a tarefa.");

  if (d.label_ids.length) await syncLabels(ctx, data.id, d.label_ids);
  const rule = buildRecurrenceRow(d.recurrence);
  if (rule) await syncRecurrence(ctx, data.id, rule);

  await logActivity(ctx.supabase, ctx.userId, data.id, "criada", null, { title: d.title });
  await syncTaskToGoogle(ctx, data.id);
  revalidateTodo();
  return { ok: true, data: { id: data.id } };
}

/* ───────────────────────────── Atualização ───────────────────────────── */

/**
 * Atualiza a tarefa completa (painel de detalhes).
 *
 * `scope` controla o alcance numa série recorrente:
 *  • 'ocorrencia' — muda só esta linha e **desliga** a recorrência dela (vira avulsa),
 *    para a série original seguir intacta a partir da próxima ocorrência.
 *  • 'futuras' / 'serie' — muda esta linha e a regra de recorrência.
 * Como cada série vive numa única linha que avança no tempo (ver doc da fase),
 * 'futuras' e 'serie' têm o mesmo efeito prático; o histórico anterior fica preservado
 * em `todo_completions` e não é reescrito em nenhum dos casos.
 */
export async function updateTodoTask(
  id: string,
  input: unknown,
  scope: TodoSeriesScope = "serie",
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoTaskSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { data: before } = await ctx.supabase
    .from("todo_tasks")
    .select("title, description, project_id, section_id, scheduled_date, deadline_at, priority")
    .eq("id", id)
    .maybeSingle();

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({
      title: d.title,
      description: d.description,
      project_id: d.project_id,
      section_id: d.section_id,
      parent_task_id: d.parent_task_id,
      status: d.status,
      priority: d.priority,
      scheduled_date: d.scheduled_date,
      scheduled_time: d.scheduled_time,
      duration_minutes: d.duration_minutes,
      deadline_at: d.deadline_at,
      is_all_day: !d.scheduled_time,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível salvar a tarefa.");

  await syncLabels(ctx, id, d.label_ids);

  if (scope === "ocorrencia") {
    // Esta ocorrência deixa de repetir; a série não é apagada nem alterada.
    await ctx.supabase.from("todo_recurrences").delete().eq("task_id", id);
  } else {
    await syncRecurrence(ctx, id, buildRecurrenceRow(d.recurrence));
  }

  await logActivity(
    ctx.supabase,
    ctx.userId,
    id,
    "titulo_alterado",
    pick(before ?? undefined, ["title", "priority", "scheduled_date", "deadline_at"]),
    { title: d.title, priority: d.priority, scheduled_date: d.scheduled_date },
  );

  await syncTaskToGoogle(ctx, id);
  revalidateTodo();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Conclusão / reabertura ───────────────────────────── */

/**
 * Conclui uma tarefa.
 *
 * REGRA CRÍTICA DA FASE (não duplicar ocorrência): a conclusão é registrada em
 * `todo_completions` com unique `(user_id, task_id, scheduled_for)`. Concluir duas
 * vezes a MESMA data programada é ignorado pelo banco — rodar de novo não gera
 * ocorrência extra nem entrada dupla no histórico.
 *
 * Tarefa recorrente **avança a própria linha** para a próxima data em vez de criar uma
 * nova: projeto, seção, prioridade, etiquetas e lembretes vêm junto sem precisar copiar
 * nada, e o histórico das conclusões fica em `todo_completions`.
 *
 * `cascade = true` conclui também as subtarefas pendentes (a UI pergunta antes).
 */
export async function completeTodoTask(
  id: string,
  cascade = false,
  source: "manual" | "rapido" | "massa" | "notificacao" = "manual",
): Promise<ActionResult<{ recurred: boolean; nextDate: string | null }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const loaded = await loadTaskWithRule(ctx, id);
  if (!loaded) return dbError("Tarefa não encontrada.");
  const { task, rule } = loaded;

  const today = hojeISO();
  const scheduledFor = task.scheduled_date ?? today;

  // Idempotência: a unique key rejeita a segunda conclusão da mesma ocorrência.
  await ctx.supabase
    .from("todo_completions")
    .upsert(
      {
        user_id: ctx.userId,
        task_id: id,
        scheduled_for: scheduledFor,
        completion_source: source,
      },
      { onConflict: "user_id,task_id,scheduled_for", ignoreDuplicates: true },
    );

  if (cascade) {
    await ctx.supabase
      .from("todo_tasks")
      .update({ status: "concluida", completed_at: new Date().toISOString() })
      .eq("parent_task_id", id)
      .in("status", ["pendente", "em_andamento"]);
  }

  // Recorrente e ativa → avança para a próxima ocorrência.
  if (rule && !rule.isPaused) {
    const next = materializeNext(
      rule,
      { scheduledDate: task.scheduled_date, deadlineAt: task.deadline_at },
      today,
    );

    if (next) {
      const { error } = await ctx.supabase
        .from("todo_tasks")
        .update({
          scheduled_date: next.scheduledDate,
          deadline_at: next.deadlineAt,
          status: "pendente",
          completed_at: null,
        })
        .eq("id", id);
      if (error) return dbError("Não foi possível avançar a recorrência.");

      await ctx.supabase
        .from("todo_recurrences")
        .update({ occurrences_created: (rule.occurrencesCreated ?? 0) + 1 })
        .eq("task_id", id);

      await logActivity(ctx.supabase, ctx.userId, id, "concluida", null, {
        scheduled_for: scheduledFor,
        next: next.scheduledDate,
      });
      // A linha avançou para a próxima ocorrência: move o MESMO evento no Google.
      await syncTaskToGoogle(ctx, id);
      revalidateTodo();
      return { ok: true, data: { recurred: true, nextDate: next.scheduledDate } };
    }
    // Série encerrada (passou de `until`/`max_occurrences`) → conclui de vez.
  }

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({ status: "concluida", completed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return dbError("Não foi possível concluir a tarefa.");

  await logActivity(ctx.supabase, ctx.userId, id, "concluida", null, {
    scheduled_for: scheduledFor,
  });
  revalidateTodo();
  return { ok: true, data: { recurred: false, nextDate: null } };
}

/**
 * Reabre uma tarefa.
 *
 * Numa recorrente, remove a ÚLTIMA conclusão registrada e devolve a data programada
 * para aquela ocorrência, revertendo o contador. É o que impede a duplicação clássica
 * "reabri e agora tenho duas ocorrências" — o estado volta exatamente ao de antes.
 */
export async function reopenTodoTask(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const loaded = await loadTaskWithRule(ctx, id);
  if (!loaded) return dbError("Tarefa não encontrada.");
  const { rule } = loaded;

  if (rule) {
    const { data: last } = await ctx.supabase
      .from("todo_completions")
      .select("id, scheduled_for")
      .eq("task_id", id)
      .order("scheduled_for", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (last) {
      await ctx.supabase.from("todo_completions").delete().eq("id", last.id);
      await ctx.supabase
        .from("todo_recurrences")
        .update({
          occurrences_created: Math.max(0, (rule.occurrencesCreated ?? 0) - 1),
        })
        .eq("task_id", id);

      const { error } = await ctx.supabase
        .from("todo_tasks")
        .update({
          status: "pendente",
          completed_at: null,
          scheduled_date: last.scheduled_for,
        })
        .eq("id", id);
      if (error) return dbError("Não foi possível reabrir a tarefa.");

      await logActivity(ctx.supabase, ctx.userId, id, "reaberta", null, {
        scheduled_for: last.scheduled_for,
      });
      await syncTaskToGoogle(ctx, id);
      revalidateTodo();
      return { ok: true, data: undefined };
    }
  }

  // Não recorrente (ou sem histórico): reabertura simples.
  await ctx.supabase.from("todo_completions").delete().eq("task_id", id);
  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({ status: "pendente", completed_at: null })
    .eq("id", id);
  if (error) return dbError("Não foi possível reabrir a tarefa.");

  await logActivity(ctx.supabase, ctx.userId, id, "reaberta");
  await syncTaskToGoogle(ctx, id);
  revalidateTodo();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Estado ───────────────────────────── */

/** Marca como cancelada (mantém o registro, ao contrário de excluir). */
export async function cancelTodoTask(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({ status: "cancelada", cancelled_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return dbError("Não foi possível cancelar a tarefa.");

  await logActivity(ctx.supabase, ctx.userId, id, "cancelada");
  // Cancelada some do calendário (o sync remove o evento).
  await syncTaskToGoogle(ctx, id);
  revalidateTodo();
  return { ok: true, data: undefined };
}

/** Arquiva / restaura. Arquivar tira das visões sem apagar nada. */
export async function archiveTodoTask(
  id: string,
  archived: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({
      status: archived ? "arquivada" : "pendente",
      archived_at: archived ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return dbError("Não foi possível arquivar a tarefa.");

  await logActivity(ctx.supabase, ctx.userId, id, archived ? "arquivada" : "restaurada");
  // Arquivar remove o evento; restaurar recria.
  await syncTaskToGoogle(ctx, id);
  revalidateTodo();
  return { ok: true, data: undefined };
}

/**
 * Exclui uma tarefa.
 *
 * As SUBTAREFAS caem junto (FK `on delete cascade`) — a UI avisa o número de subtarefas
 * antes de confirmar. Numa série recorrente, `scope`:
 *  • 'ocorrencia' — só remove a recorrência (a tarefa vira avulsa e permanece);
 *  • 'serie'      — apaga a tarefa e todo o histórico de conclusões junto.
 * Nunca há exclusão silenciosa de série: quem escolhe é a UI, e o default é o mais
 * conservador.
 */
export async function deleteTodoTask(
  id: string,
  scope: TodoSeriesScope = "ocorrencia",
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const loaded = await loadTaskWithRule(ctx, id);
  if (!loaded) return dbError("Tarefa não encontrada.");

  if (loaded.rule && scope === "ocorrencia") {
    // Só desliga a repetição — a tarefa continua existindo como avulsa.
    const { error } = await ctx.supabase.from("todo_recurrences").delete().eq("task_id", id);
    if (error) return dbError("Não foi possível remover a recorrência.");
    await logActivity(ctx.supabase, ctx.userId, id, "recorrencia_alterada", null, {
      removida: true,
    });
    revalidateTodo();
    return { ok: true, data: undefined };
  }

  // ANTES do delete: `todo_calendar_sync.task_id` é ON DELETE CASCADE, então depois
  // daqui o id do evento no Google já teria sumido e o evento ficaria órfão.
  await removeTaskFromGoogle(ctx, id);

  const { error } = await ctx.supabase.from("todo_tasks").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a tarefa.");

  revalidateTodo();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Movimentação ───────────────────────────── */

/** Move a tarefa para outro projeto/seção e posição (drag-and-drop e menu). */
export async function moveTodoTask(id: string, input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoMoveSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({
      project_id: d.project_id,
      section_id: d.section_id,
      position: d.position,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível mover a tarefa.");

  await logActivity(ctx.supabase, ctx.userId, id, "movida", null, {
    project_id: d.project_id,
    section_id: d.section_id,
  });
  revalidateTodo();
  return { ok: true, data: undefined };
}

/** Persiste a nova ordem (drag). `ids` já vem na ordem desejada. */
export async function reorderTodoTasks(ids: string[]): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!Array.isArray(ids) || ids.length === 0) return { ok: true, data: undefined };

  // Single-user com poucos itens: updates em paralelo bastam (mesmo padrão de
  // `reorderHabits`/`reorderRoutines`). A RLS garante que só o dono altera.
  const results = await Promise.all(
    ids.map((taskId, index) =>
      ctx.supabase.from("todo_tasks").update({ position: index }).eq("id", taskId),
    ),
  );
  if (results.some((r) => r.error)) return dbError("Não foi possível salvar a ordem.");

  revalidateTodo();
  return { ok: true, data: undefined };
}

/** Adia a tarefa em N dias a partir da data atual (ou de hoje, se não tiver data). */
export async function snoozeTodoTask(id: string, days = 1): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: task } = await ctx.supabase
    .from("todo_tasks")
    .select("scheduled_date")
    .eq("id", id)
    .maybeSingle();
  if (!task) return dbError("Tarefa não encontrada.");

  const base = task.scheduled_date ?? hojeISO();
  const next = addDaysIso(base, Math.max(1, Math.floor(days)));

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({ scheduled_date: next })
    .eq("id", id);
  if (error) return dbError("Não foi possível adiar a tarefa.");

  await logActivity(ctx.supabase, ctx.userId, id, "data_alterada", { scheduled_date: base }, {
    scheduled_date: next,
  });
  await syncTaskToGoogle(ctx, id);
  revalidateTodo();
  return { ok: true, data: undefined };
}

/** Reagenda para uma data específica (calendário / menu de contexto). */
export async function rescheduleTodoTask(
  id: string,
  dateIso: string | null,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (dateIso !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
    return invalid({ scheduled_date: ["Data inválida"] });
  }

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({ scheduled_date: dateIso })
    .eq("id", id);
  if (error) return dbError("Não foi possível reagendar a tarefa.");

  await logActivity(ctx.supabase, ctx.userId, id, "data_alterada", null, {
    scheduled_date: dateIso,
  });
  // Tirar a data remove o evento; trocar a data move o evento existente.
  await syncTaskToGoogle(ctx, id);
  revalidateTodo();
  return { ok: true, data: undefined };
}

/** Altera só a prioridade (ação rápida do card e do menu). */
export async function setTodoPriority(
  id: string,
  priority: number,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const p = Math.floor(Number(priority));
  if (![1, 2, 3, 4].includes(p)) return invalid({ priority: ["Prioridade inválida"] });

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({ priority: p })
    .eq("id", id);
  if (error) return dbError("Não foi possível alterar a prioridade.");

  await logActivity(ctx.supabase, ctx.userId, id, "prioridade_alterada", null, { priority: p });
  revalidateTodo();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Hierarquia ───────────────────────────── */

/**
 * Transforma a tarefa em subtarefa de outra (`parentId`) ou a promove a principal
 * (`parentId = null`). Bloqueia auto-referência e ciclos diretos.
 */
export async function setTodoParent(
  id: string,
  parentId: string | null,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (parentId === id) return dbError("Uma tarefa não pode ser subtarefa dela mesma.");

  if (parentId) {
    // Impede o ciclo mais comum: virar filha de uma das próprias filhas.
    const { data: parent } = await ctx.supabase
      .from("todo_tasks")
      .select("id, parent_task_id, project_id, section_id")
      .eq("id", parentId)
      .maybeSingle();
    if (!parent) return dbError("Tarefa principal não encontrada.");
    if (parent.parent_task_id === id) {
      return dbError("Essa tarefa já é subtarefa da que você escolheu.");
    }

    // A subtarefa acompanha o projeto/seção da mãe (não fica órfã em outro contexto).
    const { error } = await ctx.supabase
      .from("todo_tasks")
      .update({
        parent_task_id: parentId,
        project_id: parent.project_id,
        section_id: parent.section_id,
      })
      .eq("id", id);
    if (error) return dbError("Não foi possível converter em subtarefa.");

    await logActivity(ctx.supabase, ctx.userId, id, "rebaixada", null, { parent_task_id: parentId });
  } else {
    const { error } = await ctx.supabase
      .from("todo_tasks")
      .update({ parent_task_id: null })
      .eq("id", id);
    if (error) return dbError("Não foi possível promover a tarefa.");
    await logActivity(ctx.supabase, ctx.userId, id, "promovida");
  }

  revalidateTodo();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Duplicação ───────────────────────────── */

/**
 * Duplica a tarefa (sem histórico, sem conclusões e sem comentários — a cópia começa
 * limpa). As etiquetas e a regra de recorrência vêm junto, que é o que faz a cópia ser
 * útil de verdade.
 */
export async function duplicateTodoTask(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: original } = await ctx.supabase
    .from("todo_tasks")
    .select("*, labels:todo_task_labels(label_id), recurrence:todo_recurrences(*)")
    .eq("id", id)
    .maybeSingle();
  if (!original) return dbError("Tarefa não encontrada.");

  const position = await nextPosition(ctx, original.project_id, original.section_id);

  const { data: copy, error } = await ctx.supabase
    .from("todo_tasks")
    .insert({
      user_id: ctx.userId,
      project_id: original.project_id,
      section_id: original.section_id,
      parent_task_id: original.parent_task_id,
      title: `${original.title} (cópia)`,
      description: original.description,
      status: "pendente",
      priority: original.priority,
      scheduled_date: original.scheduled_date,
      scheduled_time: original.scheduled_time,
      duration_minutes: original.duration_minutes,
      deadline_at: original.deadline_at,
      is_all_day: original.is_all_day,
      position,
      source: original.source,
    })
    .select("id")
    .single();

  if (error || !copy) return dbError("Não foi possível duplicar a tarefa.");

  const labelIds = (original.labels ?? []).map((l: { label_id: string }) => l.label_id);
  if (labelIds.length) await syncLabels(ctx, copy.id, labelIds);

  const rawRec = Array.isArray(original.recurrence)
    ? original.recurrence[0]
    : original.recurrence;
  if (rawRec) {
    await ctx.supabase.from("todo_recurrences").insert({
      user_id: ctx.userId,
      task_id: copy.id,
      frequency: rawRec.frequency,
      interval_count: rawRec.interval_count,
      days_of_week: rawRec.days_of_week,
      day_of_month: rawRec.day_of_month,
      month_of_year: rawRec.month_of_year,
      week_of_month: rawRec.week_of_month,
      business_day_rule: rawRec.business_day_rule,
      recurrence_mode: rawRec.recurrence_mode,
      starts_on: rawRec.starts_on,
      ends_on: rawRec.ends_on,
      max_occurrences: rawRec.max_occurrences,
      is_paused: rawRec.is_paused,
      // Contador zerado: a cópia é uma série nova.
      occurrences_created: 0,
    });
  }

  await logActivity(ctx.supabase, ctx.userId, copy.id, "duplicada", null, { origem: id });
  revalidateTodo();
  return { ok: true, data: { id: copy.id } };
}

/* ───────────────────────────── Ações em massa ───────────────────────────── */

/**
 * Aplica uma ação a várias tarefas. As destrutivas ('excluir') exigem confirmação na
 * UI antes de chegar aqui. 'concluir' passa pela action individual para não furar a
 * regra de recorrência/idempotência.
 */
export async function bulkTodoTasks(input: unknown): Promise<ActionResult<{ count: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = todoBulkSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;
  const ids = d.ids;

  switch (d.action) {
    case "concluir": {
      // Sequencial de propósito: cada conclusão pode avançar uma recorrência.
      for (const id of ids) await completeTodoTask(id, false, "massa");
      break;
    }
    case "reabrir": {
      for (const id of ids) await reopenTodoTask(id);
      break;
    }
    case "mover_projeto": {
      const { error } = await ctx.supabase
        .from("todo_tasks")
        // Trocar de projeto invalida a seção antiga (ela pertence ao projeto anterior).
        .update({ project_id: d.project_id, section_id: null })
        .in("id", ids);
      if (error) return dbError("Não foi possível mover as tarefas.");
      await logActivityBulk(ctx.supabase, ctx.userId, ids, "movida", {
        project_id: d.project_id,
      });
      break;
    }
    case "mover_secao": {
      const { error } = await ctx.supabase
        .from("todo_tasks")
        .update({ section_id: d.section_id })
        .in("id", ids);
      if (error) return dbError("Não foi possível mover as tarefas.");
      await logActivityBulk(ctx.supabase, ctx.userId, ids, "movida", {
        section_id: d.section_id,
      });
      break;
    }
    case "prioridade": {
      // O superRefine do schema garante que `priority` não é nulo nesta ação.
      const { error } = await ctx.supabase
        .from("todo_tasks")
        .update({ priority: d.priority as number })
        .in("id", ids);
      if (error) return dbError("Não foi possível alterar a prioridade.");
      await logActivityBulk(ctx.supabase, ctx.userId, ids, "prioridade_alterada", {
        priority: d.priority,
      });
      break;
    }
    case "adicionar_etiqueta": {
      const { error } = await ctx.supabase.from("todo_task_labels").upsert(
        ids.map((taskId) => ({
          task_id: taskId,
          label_id: d.label_id as string,
          user_id: ctx.userId,
        })),
        { onConflict: "task_id,label_id", ignoreDuplicates: true },
      );
      if (error) return dbError("Não foi possível aplicar a etiqueta.");
      break;
    }
    case "remover_etiqueta": {
      const { error } = await ctx.supabase
        .from("todo_task_labels")
        .delete()
        .in("task_id", ids)
        .eq("label_id", d.label_id as string);
      if (error) return dbError("Não foi possível remover a etiqueta.");
      break;
    }
    case "data": {
      const { error } = await ctx.supabase
        .from("todo_tasks")
        .update({ scheduled_date: d.scheduled_date })
        .in("id", ids);
      if (error) return dbError("Não foi possível alterar a data.");
      await logActivityBulk(ctx.supabase, ctx.userId, ids, "data_alterada", {
        scheduled_date: d.scheduled_date,
      });
      for (const id of ids) await syncTaskToGoogle(ctx, id);
      break;
    }
    case "adiar": {
      // Cada tarefa adia a partir da PRÓPRIA data — por isso não dá para um update só.
      for (const id of ids) await snoozeTodoTask(id, d.days);
      break;
    }
    case "arquivar": {
      const { error } = await ctx.supabase
        .from("todo_tasks")
        .update({ status: "arquivada", archived_at: new Date().toISOString() })
        .in("id", ids);
      if (error) return dbError("Não foi possível arquivar as tarefas.");
      await logActivityBulk(ctx.supabase, ctx.userId, ids, "arquivada");
      for (const id of ids) await syncTaskToGoogle(ctx, id);
      break;
    }
    case "excluir": {
      // Antes do delete — a ponte de sync some junto com a tarefa (cascade).
      for (const id of ids) await removeTaskFromGoogle(ctx, id);
      const { error } = await ctx.supabase.from("todo_tasks").delete().in("id", ids);
      if (error) return dbError("Não foi possível excluir as tarefas.");
      break;
    }
  }

  revalidateTodo();
  return { ok: true, data: { count: ids.length } };
}
