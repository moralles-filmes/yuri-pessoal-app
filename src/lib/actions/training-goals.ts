"use server";

/**
 * Fase 17-E — Treinos · Server Actions das metas.
 *
 * Molde do projeto: `authContext()` → Zod (`safeParse`) → query com `user_id` explícito →
 * `revalidatePath` → `ActionResult`. Nenhum id vem do client sem passar por `.eq("user_id", …)`.
 *
 * ═══════════════════════ AS TRÊS REGRAS QUE ESTAS ACTIONS GARANTEM ═══════════════════════
 *
 * 1. **ALTERAR UMA META NÃO REESCREVE O PASSADO.** Cada campo que muda vira uma LINHA em
 *    `training_goal_progress`, com valor anterior, valor novo, data e origem. O alvo de hoje
 *    não apaga o alvo de março.
 * 2. **O VALOR ATUAL NÃO VEM DO CLIENTE.** Ele é derivado de `metrics.ts` e das medidas
 *    corporais na leitura. A ÚNICA escrita de valor aceita é a da meta `personalizada`, cuja
 *    natureza é ser registrada à mão — e a action confere o tipo antes de gravar.
 * 3. **NENHUMA EXCLUSÃO SILENCIOSA.** Excluir exige `confirm: true` (o schema não tem valor
 *    padrão) e a tela avisa que o histórico da meta vai junto.
 *
 * ⛔ **SEM PRESCRIÇÃO.** Nada aqui sugere alvo, prazo, direção ou carga. Tudo é digitado pelo
 * usuário; o servidor valida e grava.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { hojeISO } from "@/lib/format";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import {
  GOAL_DIRECTION_LABELS,
  GOAL_PERIOD_LABELS,
  GOAL_STATUS_LABELS,
  METRICS_BY_KIND,
  serializeMilestones,
  type GoalMilestone,
} from "@/lib/training/goals";
import {
  goalProgressEntrySchema,
  trainingGoalDeleteSchema,
  trainingGoalSchema,
  trainingGoalStatusSchema,
  trainingGoalUpdateSchema,
  type TrainingGoalInput,
} from "@/lib/validators/training-goals";
import type { ActionResult } from "@/types/finance";

const GOALS_PATH = `${TRAINING_BASE_PATH}/metas`;

function revalidateGoals() {
  revalidatePath(TRAINING_BASE_PATH);
  revalidatePath(GOALS_PATH);
  revalidatePath(`${TRAINING_BASE_PATH}/evolucao`);
  revalidatePath(`${TRAINING_BASE_PATH}/relatorios`);
}

type GoalRow = {
  goal_kind: TrainingGoalInput["goal_kind"];
  metric: TrainingGoalInput["metric"];
  direction: TrainingGoalInput["direction"];
  period: TrainingGoalInput["period"];
  starts_on: string;
  ends_on: string | null;
  start_value: number | null;
  target_value: number;
  unit: string;
  status: TrainingGoalInput["status"];
  name: string;
};

/** Só os campos que a meta realmente usa. Um alvo herdado de outro tipo confundiria a leitura. */
function scopedTargets(input: TrainingGoalInput) {
  return {
    exercise_id: input.metric === "medida_corporal" ? null : input.exercise_id,
    muscle_group_id: input.metric === "series_grupo_muscular" ? input.muscle_group_id : null,
    program_id: input.goal_kind === "organizacao" ? input.program_id : null,
    body_measurement_type_id:
      input.metric === "medida_corporal" ? input.body_measurement_type_id : null,
  };
}

const milestonesFor = (input: TrainingGoalInput) =>
  serializeMilestones(
    input.milestones.map(
      (milestone): GoalMilestone => ({
        value: milestone.value,
        label: milestone.label,
        dueOn: milestone.due_on,
      }),
    ),
  );

/* ═══════════════════════════ Criar ═══════════════════════════ */

export async function createTrainingGoal(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingGoalSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: created, error } = await ctx.supabase
    .from("training_goals")
    .insert({
      user_id: ctx.userId,
      name: data.name,
      description: data.description,
      goal_kind: data.goal_kind,
      metric: data.metric,
      ...scopedTargets(data),
      direction: data.direction,
      period: data.period,
      starts_on: data.starts_on,
      ends_on: data.ends_on,
      start_value: data.start_value,
      target_value: data.target_value,
      unit: data.unit,
      milestones: milestonesFor(data),
      status: data.status,
      notes: data.notes,
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível criar a meta.");

  // A criação também vira histórico: é o marco zero contra o qual toda alteração é comparada.
  await ctx.supabase.from("training_goal_progress").insert({
    user_id: ctx.userId,
    goal_id: created.id,
    entry_kind: "mudanca_status",
    recorded_on: hojeISO(),
    field: "criacao",
    new_text: GOAL_STATUS_LABELS[data.status],
    source: "manual",
    note: "Meta criada.",
  });

  revalidateGoals();
  return { ok: true, data: { id: created.id } };
}

/* ═══════════════════════════ Atualizar ═══════════════════════════ */

/**
 * Cada campo alterado vira uma linha de histórico.
 *
 * Só compara o que muda o SIGNIFICADO da meta (alvo, partida, prazo, direção, período,
 * unidade e o que ela mede). Renomear a meta ou corrigir a descrição não polui o histórico —
 * mas mudar o alvo, sim, porque isso muda a leitura de todo o progresso anterior.
 */
function goalChanges(before: GoalRow, after: TrainingGoalInput) {
  const rows: {
    field: string;
    previous_text: string | null;
    new_text: string | null;
    previous_value: number | null;
    new_value: number | null;
  }[] = [];

  const push = (
    field: string,
    previousText: string | null,
    newText: string | null,
    previousValue: number | null = null,
    newValue: number | null = null,
  ) => rows.push({ field, previous_text: previousText, new_text: newText, previous_value: previousValue, new_value: newValue });

  const beforeTarget = Number(before.target_value);
  if (beforeTarget !== after.target_value) {
    push("valor_alvo", String(beforeTarget), String(after.target_value), beforeTarget, after.target_value);
  }

  const beforeStart = before.start_value === null ? null : Number(before.start_value);
  if (beforeStart !== after.start_value) {
    push(
      "valor_inicial",
      beforeStart === null ? "primeiro valor observado" : String(beforeStart),
      after.start_value === null ? "primeiro valor observado" : String(after.start_value),
      beforeStart,
      after.start_value,
    );
  }

  if (before.ends_on !== after.ends_on) {
    push("prazo", before.ends_on ?? "sem prazo", after.ends_on ?? "sem prazo");
  }
  if (before.starts_on !== after.starts_on) {
    push("inicio", before.starts_on, after.starts_on);
  }
  if (before.direction !== after.direction) {
    push("direcao", GOAL_DIRECTION_LABELS[before.direction], GOAL_DIRECTION_LABELS[after.direction]);
  }
  if (before.period !== after.period) {
    push("periodo", GOAL_PERIOD_LABELS[before.period], GOAL_PERIOD_LABELS[after.period]);
  }
  if (before.metric !== after.metric) {
    push("medicao", before.metric, after.metric);
  }
  if (before.unit !== after.unit) {
    push("unidade", before.unit, after.unit);
  }
  if (before.status !== after.status) {
    push("situacao", GOAL_STATUS_LABELS[before.status], GOAL_STATUS_LABELS[after.status]);
  }

  return rows;
}

export async function updateTrainingGoal(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingGoalUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, ...data } = parsed.data;

  const { data: before } = await ctx.supabase
    .from("training_goals")
    .select("name,goal_kind,metric,direction,period,starts_on,ends_on,start_value,target_value,unit,status")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!before) return dbError("Meta não encontrada.");

  const { error } = await ctx.supabase
    .from("training_goals")
    .update({
      name: data.name,
      description: data.description,
      goal_kind: data.goal_kind,
      metric: data.metric,
      ...scopedTargets(data),
      direction: data.direction,
      period: data.period,
      starts_on: data.starts_on,
      ends_on: data.ends_on,
      start_value: data.start_value,
      target_value: data.target_value,
      unit: data.unit,
      milestones: milestonesFor(data),
      status: data.status,
      notes: data.notes,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível salvar a meta.");

  // ⛔ O passado não é reescrito: cada mudança de significado vira linha de histórico.
  const changes = goalChanges(before as unknown as GoalRow, data);
  if (changes.length > 0) {
    const hoje = hojeISO();
    await ctx.supabase.from("training_goal_progress").insert(
      changes.map((change) => ({
        user_id: ctx.userId,
        goal_id: id,
        entry_kind: "alteracao_meta" as const,
        recorded_on: hoje,
        source: "manual" as const,
        ...change,
      })),
    );
  }

  revalidateGoals();
  return { ok: true, data: { id } };
}

/* ═══════════════════════════ Situação ═══════════════════════════ */

/**
 * Pausar, retomar, concluir ou cancelar.
 *
 * `atingida` e `expirada` **não passam por aqui** — o schema não os aceita, porque eles são
 * derivados de valor × alvo × prazo na leitura. Gravá-los faria a meta "descongelar" errado
 * na primeira medição nova.
 */
export async function setTrainingGoalStatus(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingGoalStatusSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, status, note } = parsed.data;

  const { data: before } = await ctx.supabase
    .from("training_goals")
    .select("status")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!before) return dbError("Meta não encontrada.");

  const { error } = await ctx.supabase
    .from("training_goals")
    .update({ status })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível alterar a situação da meta.");

  await ctx.supabase.from("training_goal_progress").insert({
    user_id: ctx.userId,
    goal_id: id,
    entry_kind: "mudanca_status",
    recorded_on: hojeISO(),
    field: "situacao",
    previous_text: GOAL_STATUS_LABELS[before.status as keyof typeof GOAL_STATUS_LABELS] ?? before.status,
    new_text: GOAL_STATUS_LABELS[status],
    source: "manual",
    note,
  });

  revalidateGoals();
  return { ok: true, data: { id } };
}

/* ═══════════════════════════ Excluir ═══════════════════════════ */

export async function deleteTrainingGoal(input: unknown): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = trainingGoalDeleteSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { error } = await ctx.supabase
    .from("training_goals")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível excluir a meta.");

  revalidateGoals();
  return { ok: true, data: undefined };
}

/* ═══════════════════════════ Registro manual ═══════════════════════════ */

/**
 * Registra um valor à mão.
 *
 * ⛔ Só para a meta `personalizada`. Numa meta de volume ou de frequência, o valor vem de
 * `metrics.ts`: aceitar um número digitado ali permitiria "atingir" a meta sem treinar, e o
 * gráfico passaria a discordar do histórico.
 */
export async function recordGoalProgress(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = goalProgressEntrySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { goal_id, recorded_on, value, note } = parsed.data;

  const { data: goal } = await ctx.supabase
    .from("training_goals")
    .select("id,metric,goal_kind")
    .eq("id", goal_id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!goal) return dbError("Meta não encontrada.");

  if (goal.metric !== "personalizada") {
    return {
      ok: false,
      error:
        "Esta meta é acompanhada automaticamente pelos treinos registrados. Só a meta personalizada aceita valor digitado.",
    };
  }

  const { data: created, error } = await ctx.supabase
    .from("training_goal_progress")
    .insert({
      user_id: ctx.userId,
      goal_id,
      entry_kind: "registro",
      recorded_on,
      value,
      source: "manual",
      note,
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível registrar o progresso.");

  revalidateGoals();
  return { ok: true, data: { id: created.id } };
}

/* ═══════════════════════════ Reordenar ═══════════════════════════ */

export async function reorderTrainingGoals(ids: string[]): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!Array.isArray(ids) || ids.length === 0) return dbError("Nada para reordenar.");

  const results = await Promise.all(
    ids.map((id, index) =>
      ctx.supabase
        .from("training_goals")
        .update({ position: index })
        .eq("id", id)
        .eq("user_id", ctx.userId),
    ),
  );

  if (results.some((result) => result.error)) return dbError("Não foi possível reordenar as metas.");

  revalidateGoals();
  return { ok: true, data: undefined };
}

/** Só para o formulário conferir a matriz do lado do servidor, sem duplicar a tabela. */
export async function metricsForKind(kind: keyof typeof METRICS_BY_KIND) {
  return [...METRICS_BY_KIND[kind]];
}
