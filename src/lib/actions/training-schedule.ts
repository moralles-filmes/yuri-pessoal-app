"use server";

/**
 * Fase 17-B — Treinos · Server Actions do planejamento semanal.
 *
 * ⛔ QUATRO REGRAS PRÓPRIAS DESTA CAMADA:
 *
 * 1. **O planejamento original é preservado.** Reagendar grava `original_date` (a PRIMEIRA
 *    data, não a anterior) e o motivo. A linha nunca é reescrita como se sempre tivesse sido
 *    no dia novo. Quem decide isso é `rescheduleEntry`, função pura testada.
 *
 * 2. **"Concluído" não é gravado aqui.** Quem conclui um treino é a sessão ao vivo (17-C).
 *    O que esta subfase grava é `nao_realizado` (com justificativa) e `cancelado`.
 *
 * 3. **Nada é sobrescrito em silêncio.** Gerar recorrência ou duplicar semana sobre dias que
 *    já têm conteúdo exige escolher: pular o dia ocupado ou substituir. O padrão é PULAR.
 *
 * 4. **`hoje` vem de `hojeISO()`** (Brasília), nunca de `toISOString().slice(0,10)` — que
 *    devolveria o dia em UTC e, entre 21h e a meia-noite, trataria o treino de hoje como
 *    passado.
 *
 * ⛔ **Fase 17-F — o espelho na agenda é OPT-IN e nunca derruba a ação.** Toda escrita daqui
 * chama a sincronização, que sai na primeira consulta quando o envio está desligado (o padrão).
 * Excluir remove o evento ANTES do delete: a ponte é `on delete cascade` e, depois, o id do
 * evento já não existiria para ser apagado no Google.
 */
import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { hojeISO } from "@/lib/format";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import {
  duplicateWeek,
  generateScheduleEntries,
  rescheduleEntry,
  startOfWeekIso,
  weekDaysIso,
} from "@/lib/training/schedule";
import {
  removeScheduledWorkoutFromGoogle,
  syncScheduledWorkoutToGoogle,
  syncScheduledWorkoutsToGoogle,
} from "@/lib/training/calendar-sync";
import {
  scheduleDuplicateWeekSchema,
  scheduleEntrySchema,
  scheduleEntryUpdateSchema,
  scheduleGenerateSchema,
  scheduleOutcomeSchema,
  scheduleRescheduleSchema,
} from "@/lib/validators/training-routines";
import type { ActionResult } from "@/types/finance";

const CALENDAR_PATH = `${TRAINING_BASE_PATH}/calendario`;

function revalidateSchedule() {
  revalidatePath(TRAINING_BASE_PATH);
  revalidatePath(CALENDAR_PATH);
  revalidatePath(`${TRAINING_BASE_PATH}/hoje`);
}

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

/* ───────────────────────────── Criar / editar / excluir ───────────────────────────── */

export async function createScheduledWorkout(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = scheduleEntrySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: sameDay } = await ctx.supabase
    .from("training_scheduled_workouts")
    .select("id,entry_kind")
    .eq("user_id", ctx.userId)
    .eq("scheduled_date", data.scheduled_date);

  // Um índice único parcial garante no banco; aqui devolvemos a mensagem em pt-BR.
  if (data.entry_kind === "descanso" && (sameDay ?? []).some((row) => row.entry_kind === "descanso")) {
    return dbError("Este dia já está marcado como descanso.");
  }

  const { data: created, error } = await ctx.supabase
    .from("training_scheduled_workouts")
    .insert({
      user_id: ctx.userId,
      scheduled_date: data.scheduled_date,
      entry_kind: data.entry_kind,
      workout_id: data.entry_kind === "descanso" ? null : data.workout_id,
      program_id: data.program_id,
      title: data.title,
      planned_time: data.planned_time,
      planned_duration_minutes: data.planned_duration_minutes,
      notes: data.notes,
      position: sameDay?.length ?? 0,
      source: "manual",
    })
    .select("id")
    .single();

  if (error || !created) return dbError("Não foi possível salvar o dia planejado.");

  await syncScheduledWorkoutToGoogle(ctx, created.id);
  revalidateSchedule();
  return { ok: true, data: { id: created.id } };
}

export async function updateScheduledWorkout(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = scheduleEntryUpdateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, ...data } = parsed.data;

  const { error } = await ctx.supabase
    .from("training_scheduled_workouts")
    .update({
      scheduled_date: data.scheduled_date,
      entry_kind: data.entry_kind,
      workout_id: data.entry_kind === "descanso" ? null : data.workout_id,
      program_id: data.program_id,
      title: data.title,
      planned_time: data.planned_time,
      planned_duration_minutes: data.planned_duration_minutes,
      notes: data.notes,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível salvar o dia planejado.");

  await syncScheduledWorkoutToGoogle(ctx, id);
  revalidateSchedule();
  return { ok: true, data: null };
}

export async function deleteScheduledWorkout(id: string): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  // ⛔ ANTES do delete: a ponte é `on delete cascade` e, depois, o id do evento no Google já
  // não existiria para ser apagado — o evento ficaria órfão no calendário do usuário.
  await removeScheduledWorkoutFromGoogle(ctx, id);

  const { error } = await ctx.supabase
    .from("training_scheduled_workouts")
    .delete()
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível remover o dia planejado.");

  revalidateSchedule();
  return { ok: true, data: null };
}

/* ───────────────────────────── Reagendar ───────────────────────────── */

/**
 * Move um dia planejado (arrastar no calendário ou escolher a data).
 *
 * A decisão de qual data guardar como original é da função pura `rescheduleEntry` — a action
 * só persiste o resultado. É o que garante que a interface e o banco contem a mesma história.
 */
export async function rescheduleScheduledWorkout(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = scheduleRescheduleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, scheduled_date, reason } = parsed.data;

  const { data: entry } = await ctx.supabase
    .from("training_scheduled_workouts")
    .select("id,scheduled_date,original_date,entry_kind")
    .eq("id", id)
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (!entry) return dbError("Dia planejado não encontrado.");

  const patch = rescheduleEntry(
    { scheduledDate: entry.scheduled_date, originalDate: entry.original_date },
    scheduled_date,
    reason,
  );
  if (!patch) return { ok: true, data: null };

  if (entry.entry_kind === "descanso") {
    const { data: conflict } = await ctx.supabase
      .from("training_scheduled_workouts")
      .select("id")
      .eq("user_id", ctx.userId)
      .eq("scheduled_date", scheduled_date)
      .eq("entry_kind", "descanso")
      .maybeSingle();
    if (conflict) return dbError("O dia de destino já está marcado como descanso.");
  }

  const { error } = await ctx.supabase
    .from("training_scheduled_workouts")
    .update({
      scheduled_date: patch.scheduledDate,
      original_date: patch.originalDate,
      reschedule_reason: patch.rescheduleReason,
      status: patch.status,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível reagendar.");

  // O MESMO evento é movido (a ponte é por linha planejada), nunca duplicado.
  await syncScheduledWorkoutToGoogle(ctx, id);
  revalidateSchedule();
  return { ok: true, data: null };
}

/* ───────────────────────────── Desfecho ───────────────────────────── */

/**
 * Marca "não realizado" (com justificativa), "cancelado" ou devolve ao estado pendente.
 *
 * **"Concluído" não passa por aqui** — quem conclui um treino é a sessão ao vivo (17-C).
 * Permitir marcar "feito" à mão criaria histórico sem execução, e a 17-D teria de reconciliar
 * dois "concluídos" que não significam a mesma coisa.
 */
export async function setScheduledWorkoutOutcome(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = scheduleOutcomeSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { id, status, reason } = parsed.data;

  const { error } = await ctx.supabase
    .from("training_scheduled_workouts")
    .update({
      status,
      // Voltar a "planejado" também limpa a justificativa: ela pertencia ao desfecho anterior.
      skip_reason: status === "planejado" ? null : reason,
    })
    .eq("id", id)
    .eq("user_id", ctx.userId);

  if (error) return dbError("Não foi possível registrar.");

  // Cancelar remove o evento (o mapeamento puro devolve `null`); voltar a "planejado" o recria.
  await syncScheduledWorkoutToGoogle(ctx, id);
  revalidateSchedule();
  return { ok: true, data: null };
}

/* ───────────────────────────── Gerar / duplicar ───────────────────────────── */

export type ScheduleWriteOutcome = {
  created: number;
  /** Dias que já tinham conteúdo e foram preservados. */
  skipped: number;
  replaced: number;
};

/**
 * Gera o planejamento de um período a partir de dias da semana + rodízio de treinos.
 *
 * A aritmética inteira (quais dias, qual treino em cada dia, ciclo de N semanas) sai da função
 * pura `generateScheduleEntries` — a action só grava. É o que permite testar rodízio e virada
 * de ano sem banco nenhum.
 */
export async function generateTrainingSchedule(
  input: unknown,
): Promise<ActionResult<ScheduleWriteOutcome>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = scheduleGenerateSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const weekStartsOn = await getWeekStartsOn(ctx);

  const generated = generateScheduleEntries({
    from: data.from,
    to: data.to,
    weekdays: data.weekdays,
    workoutIds: data.workout_ids,
    weekInterval: data.week_interval,
    includeRestDays: data.include_rest_days,
    plannedTime: data.planned_time,
    weekStartsOn,
  });

  if (generated.length === 0) {
    return { ok: true, data: { created: 0, skipped: 0, replaced: 0 } };
  }

  return writeGenerated(
    ctx,
    generated.map((entry) => ({
      ...entry,
      programId: data.program_id ?? null,
      plannedDurationMinutes: null,
      title: null,
      notes: null,
    })),
    data.conflict,
    "recorrencia",
  );
}

/** Duplica a semana inteira para outra semana. Copia intenção, nunca desfecho. */
export async function duplicateTrainingWeek(
  input: unknown,
): Promise<ActionResult<ScheduleWriteOutcome>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = scheduleDuplicateWeekSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const { from_week, to_week, conflict } = parsed.data;

  const weekStartsOn = await getWeekStartsOn(ctx);
  const sourceDays = weekDaysIso(from_week, weekStartsOn);

  const { data: rows } = await ctx.supabase
    .from("training_scheduled_workouts")
    .select(
      "scheduled_date,workout_id,entry_kind,planned_time,planned_duration_minutes,program_id,title,notes,position",
    )
    .eq("user_id", ctx.userId)
    .in("scheduled_date", sourceDays);

  if (!rows?.length) {
    return dbError("A semana escolhida não tem nada planejado para copiar.");
  }

  const copies = duplicateWeek(
    rows.map((row) => ({
      scheduledDate: row.scheduled_date,
      workoutId: row.workout_id,
      entryKind: row.entry_kind === "descanso" ? "descanso" : "treino",
      plannedTime: row.planned_time,
      plannedDurationMinutes: row.planned_duration_minutes,
      programId: row.program_id,
      title: row.title,
      notes: row.notes,
      position: row.position,
    })),
    from_week,
    to_week,
    weekStartsOn,
  );

  if (copies.length === 0) {
    return dbError("Escolha uma semana de destino diferente da de origem.");
  }

  return writeGenerated(
    ctx,
    copies.map((copy) => ({
      scheduledDate: copy.scheduledDate,
      workoutId: copy.workoutId,
      entryKind: copy.entryKind,
      plannedTime: copy.plannedTime,
      position: copy.position,
      programId: copy.programId,
      plannedDurationMinutes: copy.plannedDurationMinutes,
      title: copy.title,
      notes: copy.notes,
    })),
    conflict,
    "duplicacao",
  );
}

type WritableEntry = {
  scheduledDate: string;
  workoutId: string | null;
  entryKind: "treino" | "descanso";
  plannedTime: string | null;
  position: number;
  programId: string | null;
  plannedDurationMinutes: number | null;
  title: string | null;
  notes: string | null;
};

/**
 * Grava as linhas geradas resolvendo o conflito de forma EXPLÍCITA.
 *
 * `pular` preserva o que já existe; `substituir` apaga as linhas daquele dia antes de inserir
 * — e mesmo assim nunca toca em dia que já teve desfecho (concluído/não realizado), porque
 * isso seria reescrever o passado.
 */
async function writeGenerated(
  ctx: Ctx,
  entries: WritableEntry[],
  conflict: "pular" | "substituir",
  source: "recorrencia" | "duplicacao",
): Promise<ActionResult<ScheduleWriteOutcome>> {
  const dates = [...new Set(entries.map((entry) => entry.scheduledDate))];

  const { data: existingRows } = await ctx.supabase
    .from("training_scheduled_workouts")
    .select("id,scheduled_date,status")
    .eq("user_id", ctx.userId)
    .in("scheduled_date", dates);

  const byDate = new Map<string, { id: string; status: string }[]>();
  for (const row of existingRows ?? []) {
    const list = byDate.get(row.scheduled_date) ?? [];
    list.push({ id: row.id, status: row.status });
    byDate.set(row.scheduled_date, list);
  }

  let skipped = 0;
  let replaced = 0;
  const toInsert: WritableEntry[] = [];
  const toDelete: string[] = [];

  for (const entry of entries) {
    const existing = byDate.get(entry.scheduledDate) ?? [];
    if (existing.length === 0) {
      toInsert.push(entry);
      continue;
    }

    if (conflict === "pular") {
      skipped += 1;
      continue;
    }

    // Substituir só alcança o que continua pendente. Dia com desfecho é história.
    const removable = existing.filter((row) => row.status === "planejado");
    if (removable.length < existing.length) {
      skipped += 1;
      continue;
    }
    toDelete.push(...removable.map((row) => row.id));
    replaced += 1;
    toInsert.push(entry);
  }

  if (toDelete.length > 0) {
    // Remove o espelho ANTES do delete (a ponte é cascade).
    for (const id of toDelete) await removeScheduledWorkoutFromGoogle(ctx, id);
    const { error } = await ctx.supabase
      .from("training_scheduled_workouts")
      .delete()
      .in("id", toDelete)
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível substituir os dias já planejados.");
  }

  const insertedIds: string[] = [];
  if (toInsert.length > 0) {
    const { data: inserted, error } = await ctx.supabase
      .from("training_scheduled_workouts")
      .insert(
        toInsert.map((entry) => ({
          user_id: ctx.userId,
          scheduled_date: entry.scheduledDate,
          entry_kind: entry.entryKind,
          workout_id: entry.entryKind === "descanso" ? null : entry.workoutId,
          program_id: entry.programId,
          planned_time: entry.plannedTime,
          planned_duration_minutes: entry.plannedDurationMinutes,
          title: entry.title,
          notes: entry.notes,
          position: entry.position,
          status: "planejado",
          source,
        })),
      )
      .select("id");
    if (error) return dbError("Não foi possível gravar o planejamento.");
    insertedIds.push(...(inserted ?? []).map((row) => row.id));
  }

  await syncScheduledWorkoutsToGoogle(ctx, insertedIds);
  revalidateSchedule();
  return { ok: true, data: { created: toInsert.length, skipped, replaced } };
}

/** Primeiro dia da semana das preferências do módulo. Sem linha, segunda-feira. */
async function getWeekStartsOn(ctx: Ctx): Promise<number> {
  const { data } = await ctx.supabase
    .from("training_preferences")
    .select("week_starts_on")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  return data?.week_starts_on ?? 1;
}

/* ───────────────────────────── Aplicar um programa à semana ───────────────────────────── */

/**
 * Aplica um programa a um período: usa os treinos do programa como rodízio e os dias sugeridos
 * de cada treino como dias da semana. É o atalho de "montar a semana" sem digitar nada.
 *
 * Quando nenhum treino do programa sugere dia da semana, a action recusa em vez de escolher
 * dias por conta própria — chutar segunda/quarta/sexta seria decidir a rotina pelo usuário.
 */
export async function applyProgramToSchedule(input: {
  program_id: string;
  from: string;
  to: string;
  conflict?: "pular" | "substituir";
  planned_time?: string | null;
}): Promise<ActionResult<ScheduleWriteOutcome>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: links } = await ctx.supabase
    .from("training_program_workouts")
    .select("workout_id,position,suggested_weekdays")
    .eq("program_id", input.program_id)
    .eq("user_id", ctx.userId)
    .order("position", { ascending: true });

  if (!links?.length) return dbError("Este programa ainda não tem treinos.");

  const weekdays = [
    ...new Set(links.flatMap((link) => (link.suggested_weekdays ?? []) as number[])),
  ].sort();

  if (weekdays.length === 0) {
    return dbError(
      "Defina os dias sugeridos de pelo menos um treino do programa antes de aplicar à agenda.",
    );
  }

  const weekStartsOn = await getWeekStartsOn(ctx);

  const generated = generateScheduleEntries({
    from: input.from,
    to: input.to,
    weekdays,
    workoutIds: links.map((link) => link.workout_id),
    plannedTime: input.planned_time ?? null,
    weekStartsOn,
  });

  if (generated.length === 0) {
    return { ok: true, data: { created: 0, skipped: 0, replaced: 0 } };
  }

  return writeGenerated(
    ctx,
    generated.map((entry) => ({
      ...entry,
      programId: input.program_id,
      plannedDurationMinutes: null,
      title: null,
      notes: null,
    })),
    input.conflict ?? "pular",
    "recorrencia",
  );
}

/* ───────────────────────────── Limpar semana ───────────────────────────── */

/**
 * Limpa uma semana. Só remove o que continua PENDENTE: dias com desfecho gravado ficam, e a
 * action devolve quantos foram preservados para a interface dizer a verdade.
 */
export async function clearTrainingWeek(
  weekReference: string,
): Promise<ActionResult<{ removed: number; kept: number }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const weekStartsOn = await getWeekStartsOn(ctx);
  const days = weekDaysIso(startOfWeekIso(weekReference, weekStartsOn), weekStartsOn);

  const { data: rows } = await ctx.supabase
    .from("training_scheduled_workouts")
    .select("id,status")
    .eq("user_id", ctx.userId)
    .in("scheduled_date", days);

  const removable = (rows ?? []).filter((row) => row.status === "planejado");
  const kept = (rows?.length ?? 0) - removable.length;

  if (removable.length > 0) {
    // Espelho removido ANTES do delete (ponte `on delete cascade`).
    for (const row of removable) await removeScheduledWorkoutFromGoogle(ctx, row.id);
    const { error } = await ctx.supabase
      .from("training_scheduled_workouts")
      .delete()
      .in(
        "id",
        removable.map((row) => row.id),
      )
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível limpar a semana.");
  }

  revalidateSchedule();
  return { ok: true, data: { removed: removable.length, kept } };
}

/** Marca (ou desmarca) um dia como descanso. Um dia tem no máximo um marcador. */
export async function toggleRestDay(date: string): Promise<ActionResult<{ isRest: boolean }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { data: existing } = await ctx.supabase
    .from("training_scheduled_workouts")
    .select("id")
    .eq("user_id", ctx.userId)
    .eq("scheduled_date", date)
    .eq("entry_kind", "descanso")
    .maybeSingle();

  if (existing) {
    const { error } = await ctx.supabase
      .from("training_scheduled_workouts")
      .delete()
      .eq("id", existing.id)
      .eq("user_id", ctx.userId);
    if (error) return dbError("Não foi possível desmarcar o descanso.");

    revalidateSchedule();
    return { ok: true, data: { isRest: false } };
  }

  const { error } = await ctx.supabase.from("training_scheduled_workouts").insert({
    user_id: ctx.userId,
    scheduled_date: date,
    entry_kind: "descanso",
    workout_id: null,
    status: "planejado",
    source: "manual",
    position: 99,
  });

  if (error) return dbError("Não foi possível marcar o descanso.");

  revalidateSchedule();
  return { ok: true, data: { isRest: true } };
}

/** "Hoje" no fuso de Brasília, para o client não calcular a data com o relógio do aparelho. */
export async function getTrainingToday(): Promise<string> {
  return hojeISO();
}
