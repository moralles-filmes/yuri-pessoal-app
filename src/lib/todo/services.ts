import "server-only";

/**
 * Fase 18-C · Bloco 4 — TO-DO · Os SERVIÇOS de escrita, extraídos das Server Actions.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE ESTE ARQUIVO EXISTE, E POR QUE ELE NÃO É "USE SERVER".                        ║
 * ║                                                                                       ║
 * ║ A regra da fase é *nenhuma regra de negócio é reescrita*: a IA não pode ter uma        ║
 * ║ segunda forma de criar tarefa. Havia dois jeitos de honrar isso, e um deles é armadilha:║
 * ║                                                                                       ║
 * ║   ⛔ o command chamar `createTodoTask` — a Server Action. Ela roda `authContext()` de   ║
 * ║      novo e, pior, chama `revalidatePath` DE DENTRO do command. O desenho da 18-C manda ║
 * ║      o `revalidatePath` ficar exclusivamente na casca da action de confirmação, e um    ║
 * ║      command que revalida não é chamável de um teste.                                   ║
 * ║                                                                                       ║
 * ║   ✅ extrair o miolo para cá. A action fica sendo `auth + Zod + serviço + revalidate`,  ║
 * ║      e o command fica sendo `prever + serviço`. UMA implementação, dois chamadores.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ NADA AQUI VALIDA ENTRADA E NADA AQUI DECIDE PERMISSÃO. Quem chama já validou com o Zod
 * do módulo (o MESMO schema nos dois caminhos) e já tem `user_id` de `authContext()`. Este
 * arquivo é o efeito, e só.
 */

import { removeTaskFromGoogle, syncTaskToGoogle } from "@/lib/todo/calendar-sync";
import { logActivity } from "@/lib/todo/activity";
import { materializeNext } from "@/lib/todo/recurrence";
import type { AuthContext } from "@/lib/actions/helpers";
import type { TodoQuickTaskInput } from "@/lib/validators/todo";

/** O contexto mínimo de uma escrita: o client de SESSÃO (RLS vale) e o dono. */
export type TodoServiceContext = AuthContext;

/* ───────────────────────────── Helpers compartilhados ───────────────────────────── */

/** Próxima `position` livre dentro do escopo (fim da lista). */
export async function nextPosition(
  ctx: TodoServiceContext,
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
export async function syncLabels(
  ctx: TodoServiceContext,
  taskId: string,
  labelIds: string[],
) {
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
export type RecurrenceRow = {
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
export async function syncRecurrence(
  ctx: TodoServiceContext,
  taskId: string,
  rule: RecurrenceRow | null,
) {
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

/** Converte a recorrência validada nas colunas da tabela. */
export function buildRecurrenceRow(
  recurrence: TodoQuickTaskInput["recurrence"],
): RecurrenceRow | null {
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

/* ───────────────────────────── Criação ───────────────────────────── */

export type CriarTarefaResultado =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly erro: string };

/**
 * Cria a tarefa. É o miolo de `createTodoTask` — sem `authContext`, sem Zod e sem
 * `revalidatePath`, que são da casca.
 *
 * A ordem importa e é a original: insere, depois etiquetas, depois recorrência, depois a
 * atividade, depois o Google. Falha do Google nunca derruba a criação (invariante do módulo).
 */
export async function criarTarefaNoTodo(
  ctx: TodoServiceContext,
  d: TodoQuickTaskInput,
): Promise<CriarTarefaResultado> {
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

  if (error || !data) return { ok: false, erro: "Não foi possível criar a tarefa." };

  if (d.label_ids.length) await syncLabels(ctx, data.id, d.label_ids);
  const rule = buildRecurrenceRow(d.recurrence);
  if (rule) await syncRecurrence(ctx, data.id, rule);

  await logActivity(ctx.supabase, ctx.userId, data.id, "criada", null, { title: d.title });
  await syncTaskToGoogle(ctx, data.id);

  return { ok: true, id: data.id };
}

/* ───────────────────────────── Conclusão ───────────────────────────── */

/** Linha crua de `todo_recurrences` como o embed a devolve. */
type RawRecurrenceRow = RecurrenceRow & { id: string; occurrences_created: number };

/** Carrega a tarefa + a regra de recorrência (já no formato do módulo puro). */
export async function carregarTarefaComRegra(ctx: TodoServiceContext, taskId: string) {
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

export type ConcluirResultado =
  | {
      readonly ok: true;
      /** A tarefa era recorrente e AVANÇOU em vez de fechar. */
      readonly recurred: boolean;
      readonly nextDate: string | null;
      /** A ocorrência que foi dada como feita — a chave de `todo_completions`. */
      readonly scheduledFor: string;
    }
  | { readonly ok: false; readonly erro: string };

/**
 * Conclui a tarefa. Miolo de `completeTodoTask`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A IDEMPOTÊNCIA AQUI É ANTERIOR À IA, E É O QUE TORNA ESTE COMMAND SEGURO.             ║
 * ║                                                                                       ║
 * ║ `todo_completions` tem unique `(user_id, task_id, scheduled_for)`, e o `upsert` usa    ║
 * ║ `ignoreDuplicates`. Concluir duas vezes a MESMA ocorrência não gera ocorrência extra   ║
 * ║ nem entrada dupla no histórico — a invariante do TO-DO desde a Fase 15.                ║
 * ║                                                                                       ║
 * ║ ⚠️ Mas ela NÃO substitui a trava da 18-C. Se a tarefa for recorrente e a primeira      ║
 * ║ conclusão a fizer AVANÇAR para a próxima data, uma segunda conclusão fecharia a        ║
 * ║ ocorrência SEGUINTE — `scheduled_for` já é outro. Quem impede isso é a aprovação de    ║
 * ║ uso único no banco, não este `upsert`. As duas travas resolvem coisas diferentes.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `hoje` é INJETADO: a decisão de qual ocorrência foi concluída depende do dia, e um
 * `hojeISO()` aqui dentro tornaria o serviço não testável e sensível ao fuso do processo.
 */
export async function concluirTarefaNoTodo(
  ctx: TodoServiceContext,
  taskId: string,
  hoje: string,
  opcoes: {
    cascade?: boolean;
    source?: "manual" | "rapido" | "massa" | "notificacao" | "ia";
  } = {},
): Promise<ConcluirResultado> {
  const loaded = await carregarTarefaComRegra(ctx, taskId);
  if (!loaded) return { ok: false, erro: "Tarefa não encontrada." };
  const { task, rule } = loaded;

  const scheduledFor = task.scheduled_date ?? hoje;

  await ctx.supabase.from("todo_completions").upsert(
    {
      user_id: ctx.userId,
      task_id: taskId,
      scheduled_for: scheduledFor,
      completion_source: opcoes.source ?? "manual",
    },
    { onConflict: "user_id,task_id,scheduled_for", ignoreDuplicates: true },
  );

  if (opcoes.cascade) {
    await ctx.supabase
      .from("todo_tasks")
      .update({ status: "concluida", completed_at: new Date().toISOString() })
      .eq("parent_task_id", taskId)
      .in("status", ["pendente", "em_andamento"]);
  }

  // Recorrente e ativa → avança para a próxima ocorrência (a MESMA linha muda de data).
  if (rule && !rule.isPaused) {
    const next = materializeNext(
      rule,
      { scheduledDate: task.scheduled_date, deadlineAt: task.deadline_at },
      hoje,
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
        .eq("id", taskId);
      if (error) return { ok: false, erro: "Não foi possível avançar a recorrência." };

      await ctx.supabase
        .from("todo_recurrences")
        .update({ occurrences_created: (rule.occurrencesCreated ?? 0) + 1 })
        .eq("task_id", taskId);

      await logActivity(ctx.supabase, ctx.userId, taskId, "concluida", null, {
        scheduled_for: scheduledFor,
        next: next.scheduledDate,
      });
      // A linha avançou para a próxima ocorrência: move o MESMO evento no Google.
      await syncTaskToGoogle(ctx, taskId);
      return { ok: true, recurred: true, nextDate: next.scheduledDate, scheduledFor };
    }
    // Série encerrada (passou de `until`/`max_occurrences`) → conclui de vez.
  }

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({ status: "concluida", completed_at: new Date().toISOString() })
    .eq("id", taskId);
  if (error) return { ok: false, erro: "Não foi possível concluir a tarefa." };

  await logActivity(ctx.supabase, ctx.userId, taskId, "concluida", null, {
    scheduled_for: scheduledFor,
  });
  return { ok: true, recurred: false, nextDate: null, scheduledFor };
}

/**
 * Reabre a tarefa. Miolo de `reopenTodoTask`, e o `undo` declarado de `concluirTarefaTodo`.
 *
 * ⚠️ Numa recorrente, ele remove a ÚLTIMA conclusão e devolve a data daquela ocorrência,
 * revertendo o contador. É o que impede a duplicação clássica "reabri e agora tenho duas
 * ocorrências" — o estado volta exatamente ao de antes, e é por isso que o desfazer da IA
 * pode usar este caminho sem inventar nada.
 */
export async function reabrirTarefaNoTodo(
  ctx: TodoServiceContext,
  taskId: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const loaded = await carregarTarefaComRegra(ctx, taskId);
  if (!loaded) return { ok: false, erro: "Tarefa não encontrada." };
  const { rule } = loaded;

  if (rule) {
    const { data: last } = await ctx.supabase
      .from("todo_completions")
      .select("id, scheduled_for")
      .eq("task_id", taskId)
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
        .eq("task_id", taskId);

      const { error } = await ctx.supabase
        .from("todo_tasks")
        .update({
          status: "pendente",
          completed_at: null,
          scheduled_date: last.scheduled_for,
        })
        .eq("id", taskId);
      if (error) return { ok: false, erro: "Não foi possível reabrir a tarefa." };

      await logActivity(ctx.supabase, ctx.userId, taskId, "reaberta", null, {
        scheduled_for: last.scheduled_for,
      });
      await syncTaskToGoogle(ctx, taskId);
      return { ok: true };
    }
  }

  // Não recorrente (ou sem histórico): reabertura simples.
  await ctx.supabase.from("todo_completions").delete().eq("task_id", taskId);
  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({ status: "pendente", completed_at: null })
    .eq("id", taskId);
  if (error) return { ok: false, erro: "Não foi possível reabrir a tarefa." };

  await logActivity(ctx.supabase, ctx.userId, taskId, "reaberta");
  await syncTaskToGoogle(ctx, taskId);
  return { ok: true };
}

/* ───────────────────────────── Reagendamento ───────────────────────────── */

export type ReagendarResultado =
  | {
      readonly ok: true;
      /** A data que a tarefa TINHA. É o que o desfazer da 18-C precisa para voltar atrás. */
      readonly dataAnterior: string | null;
      readonly dataNova: string | null;
    }
  | { readonly ok: false; readonly erro: string };

/**
 * Reagenda uma tarefa. Miolo de `rescheduleTodoTask`; `null` TIRA a data (e o evento do
 * Google some junto, porque `syncTaskToGoogle` decide isso).
 *
 * ⚠️ Ela mexe SÓ em `scheduled_date`. O prazo final (`deadline_at`) não é tocado de
 * propósito: adiar a execução não muda o compromisso, e mover os dois juntos apagaria a
 * informação de que a tarefa passou a ficar atrasada em relação ao prazo.
 *
 * ⚠️ A leitura do `scheduled_date` ANTERIOR é a única coisa que este serviço acrescentou à
 * action original — que passava `null` como estado anterior para `logActivity`. Não é regra
 * nova: `snoozeTodoTask`, no mesmo arquivo, já registrava o antes. O desfazer da 18-C precisa
 * dessa data, e um `changed_fields` que diz "de X para Y" sem saber o X seria meia verdade.
 */
export async function reagendarTarefaNoTodo(
  ctx: TodoServiceContext,
  taskId: string,
  novaData: string | null,
): Promise<ReagendarResultado> {
  const { data: antes } = await ctx.supabase
    .from("todo_tasks")
    .select("scheduled_date")
    .eq("id", taskId)
    .maybeSingle();

  if (!antes) return { ok: false, erro: "Tarefa não encontrada." };

  const { error } = await ctx.supabase
    .from("todo_tasks")
    .update({ scheduled_date: novaData })
    .eq("id", taskId);

  if (error) return { ok: false, erro: "Não foi possível reagendar a tarefa." };

  await logActivity(
    ctx.supabase,
    ctx.userId,
    taskId,
    "data_alterada",
    { scheduled_date: antes.scheduled_date },
    { scheduled_date: novaData },
  );
  // Tirar a data remove o evento; trocar a data move o evento existente.
  await syncTaskToGoogle(ctx, taskId);

  return { ok: true, dataAnterior: antes.scheduled_date, dataNova: novaData };
}

/* ───────────────────────────── Exclusão (o desfazer da criação) ───────────────────────── */

/**
 * Apaga uma tarefa avulsa. Miolo do caminho simples de `deleteTodoTask`.
 *
 * ⚠️ `removeTaskFromGoogle` roda ANTES do delete: a ponte `todo_calendar_sync` é
 * `on delete cascade`, e apagar a tarefa primeiro levaria embora a linha que diz qual evento
 * do Google remover — deixando um evento órfão no calendário do usuário para sempre.
 *
 * Este serviço é a metade "desfazer" de `criarTarefaNoTodo`, e é por isso que ele NÃO trata
 * série recorrente: o desfazer da 18-C só alcança o que a IA acabou de criar.
 */
export async function excluirTarefaDoTodo(
  ctx: TodoServiceContext,
  taskId: string,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  await removeTaskFromGoogle(ctx, taskId);

  const { error } = await ctx.supabase.from("todo_tasks").delete().eq("id", taskId);
  if (error) return { ok: false, erro: "Não foi possível excluir a tarefa." };
  return { ok: true };
}
