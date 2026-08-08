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
import { addDaysIso } from "@/lib/todo/recurrence";
import { logActivity, logActivityBulk, pick } from "@/lib/todo/activity";
import { removeTaskFromGoogle, syncTaskToGoogle } from "@/lib/todo/calendar-sync";
/**
 * ⚠️ 18-C · Bloco 4 — O MIOLO DAS ESCRITAS QUE A IA ALCANÇA MORA EM `todo/services.ts`.
 *
 * Esta action passou a ser casca: `authContext` + Zod + serviço + `revalidatePath`. O command
 * `criarTarefaTodo` chama exatamente o mesmo serviço, sem a casca — é o que faz "nenhuma
 * regra de negócio é reescrita" ser um fato do código, e não uma promessa. Mexer na regra
 * aqui em cima do serviço (em vez de dentro dele) reabre a divergência que a extração fechou.
 */
import {
  buildRecurrenceRow,
  carregarTarefaComRegra,
  concluirTarefaNoTodo,
  criarTarefaNoTodo,
  nextPosition,
  reabrirTarefaNoTodo,
  reagendarTarefaNoTodo,
  syncLabels,
  syncRecurrence,
} from "@/lib/todo/services";
import type { ActionResult } from "@/types/finance";
import type { TodoSeriesScope } from "@/lib/todo/constants";

const TODO_PATH = "/todo";

/** Revalida o módulo e o que depende dele (contadores do dashboard e do sino). */
function revalidateTodo() {
  revalidatePath(TODO_PATH);
  revalidatePath("/dashboard");
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

  const resultado = await criarTarefaNoTodo(ctx, parsed.data);
  if (!resultado.ok) return dbError(resultado.erro);

  revalidateTodo();
  return { ok: true, data: { id: resultado.id } };
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

  const r = await concluirTarefaNoTodo(ctx, id, hojeISO(), { cascade, source });
  if (!r.ok) return dbError(r.erro);

  revalidateTodo();
  return { ok: true, data: { recurred: r.recurred, nextDate: r.nextDate } };
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

  const r = await reabrirTarefaNoTodo(ctx, id);
  if (!r.ok) return dbError(r.erro);

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

  const loaded = await carregarTarefaComRegra(ctx, id);
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

  const resultado = await reagendarTarefaNoTodo(ctx, id, dateIso);
  if (!resultado.ok) return dbError(resultado.erro);

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
