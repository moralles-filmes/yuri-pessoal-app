"use server";

import { revalidatePath } from "next/cache";
import { habitLogSchema, habitSchema } from "@/lib/validators/habit";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import {
  desfazerCheckIn,
  logDoDia,
  metaDoHabito,
  registrarCheckIn,
} from "@/lib/habits/services";
import { reorderedPositions } from "@/lib/shared/reorder";
import type { ActionResult } from "@/types/finance";
import type { HabitCategory, HabitUnit } from "@/lib/habits/constants";

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

function revalidate() {
  revalidatePath("/habitos");
}

/* ───────────────────────────── CRUD de hábitos ───────────────────────────── */

export async function createHabit(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = habitSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { data: last } = await ctx.supabase
    .from("habits")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data, error } = await ctx.supabase
    .from("habits")
    .insert({
      user_id: ctx.userId,
      name: d.name,
      category: d.category,
      description: d.description,
      frequency: d.frequency,
      weekdays: d.weekdays,
      target_value: d.target_value,
      unit: d.unit,
      time_of_day: d.time_of_day,
      reminder_at: d.reminder_at,
      color: d.color,
      icon: d.icon,
      is_active: d.is_active,
      position,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar o hábito.");
  revalidate();
  return { ok: true, data: { id: data.id } };
}

export async function updateHabit(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = habitSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("habits")
    .update({
      name: d.name,
      category: d.category,
      description: d.description,
      frequency: d.frequency,
      weekdays: d.weekdays,
      target_value: d.target_value,
      unit: d.unit,
      time_of_day: d.time_of_day,
      reminder_at: d.reminder_at,
      color: d.color,
      icon: d.icon,
      is_active: d.is_active,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar o hábito.");
  revalidate();
  return { ok: true, data: undefined };
}

export async function toggleHabitActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("habits")
    .update({ is_active: active })
    .eq("id", id);
  if (error) return dbError("Não foi possível atualizar o hábito.");
  revalidate();
  return { ok: true, data: undefined };
}

/**
 * Atualiza só a `description` do hábito — usada pelos editores inline das telas
 * especializadas ("Livro atual" na leitura, "Tipo de exercício" nos exercícios).
 */
export async function setHabitDescription(
  id: string,
  description: string,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const value = description.trim().slice(0, 1000);
  const { error } = await ctx.supabase
    .from("habits")
    .update({ description: value.length ? value : null })
    .eq("id", id);
  if (error) return dbError("Não foi possível salvar.");
  revalidate();
  return { ok: true, data: undefined };
}

export async function deleteHabit(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase.from("habits").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir o hábito.");
  revalidate();
  return { ok: true, data: undefined };
}

/**
 * Reordena os hábitos: grava `position = índice` para cada id na ordem recebida.
 * Single-user com poucos hábitos → updates em paralelo (sem RPC/migration). RLS
 * garante que cada update só atinge linhas do próprio usuário.
 */
export async function reorderHabits(
  orderedIds: string[],
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
    return invalid({ orderedIds: ["Lista de hábitos inválida."] });
  }

  const updates = reorderedPositions(orderedIds);
  const results = await Promise.all(
    updates.map(({ id, position }) =>
      ctx.supabase
        .from("habits")
        .update({ position })
        .eq("id", id)
        .eq("user_id", ctx.userId),
    ),
  );

  if (results.some((r) => r.error)) {
    return dbError("Não foi possível salvar a nova ordem.");
  }
  revalidate();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Check-in diário ───────────────────────────── */

/**
 * ⚠️ 18-C · Bloco 4 — O MIOLO DO CHECK-IN MORA EM `habits/services.ts`.
 *
 * Esta casca só acrescenta o `revalidatePath` e a tradução para `ActionResult`. O command
 * `registrarHabito` chama o MESMO serviço, sem a casca — é o que faz "nenhuma regra de negócio
 * é reescrita" ser um fato do código.
 */
async function upsertLog(
  ctx: Ctx,
  habitId: string,
  fields: { logDate: string; value: number; notes?: string | null; isDone?: boolean },
): Promise<ActionResult> {
  const r = await registrarCheckIn(ctx, habitId, fields);
  if (!r.ok) return dbError(r.erro);
  revalidate();
  return { ok: true, data: undefined };
}

/** Define o valor EXATO do dia (ex.: registrar 12 páginas, 30 min). */
export async function setHabitValue(
  habitId: string,
  logDate: string,
  value: number,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  return upsertLog(ctx, habitId, { logDate, value });
}

/**
 * INCREMENTA o valor do dia por `delta` (ex.: +1 copo, +250 ml). Lê o valor atual
 * e soma; o resultado nunca fica negativo. `is_done` é derivado da meta.
 */
export async function incrementHabit(
  habitId: string,
  logDate: string,
  delta: number,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const existing = await logDoDia(ctx, habitId, logDate);
  const current = existing ? Number(existing.value) : 0;
  return upsertLog(ctx, habitId, {
    logDate,
    value: current + delta,
    notes: (existing?.notes as string | null) ?? null,
  });
}

/**
 * Marca/desmarca o hábito do dia como CONCLUÍDO (check-in booleano). Concluir grava
 * `value = meta`; desmarcar zera. Útil para hábitos "sim/não" (ex.: dormir bem).
 */
export async function setHabitDone(
  habitId: string,
  logDate: string,
  done: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const target = await metaDoHabito(ctx, habitId);
  if (target === null) return dbError("Hábito não encontrado.");
  const existing = await logDoDia(ctx, habitId, logDate);
  return upsertLog(ctx, habitId, {
    logDate,
    value: done ? target : 0,
    isDone: done,
    notes: (existing?.notes as string | null) ?? null,
  });
}

/** Check-in completo via formulário (valor + observações + meta opcional). */
export async function logHabit(
  habitId: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = habitLogSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  return upsertLog(ctx, habitId, {
    logDate: d.log_date,
    value: d.value,
    notes: d.notes,
    isDone: d.is_done,
  });
}

/** Desfaz o check-in do dia (remove o registro de habit_logs daquele dia). */
export async function undoHabitCheckIn(
  habitId: string,
  logDate: string,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const r = await desfazerCheckIn(ctx, habitId, logDate);
  if (!r.ok) return dbError(r.erro);
  revalidate();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Seed de hábitos sugeridos ───────────────────────────── */

type SeedHabit = {
  name: string;
  category: HabitCategory;
  icon: string;
  target_value: number;
  unit: HabitUnit;
  time_of_day?: string;
};

const DEFAULT_HABITS: SeedHabit[] = [
  { name: "Beber água", category: "agua", icon: "💧", target_value: 8, unit: "vezes", time_of_day: "09:00" },
  { name: "Ler", category: "leitura", icon: "📖", target_value: 10, unit: "paginas", time_of_day: "21:00" },
  { name: "Exercícios", category: "exercicios", icon: "🏋️", target_value: 30, unit: "minutos", time_of_day: "07:00" },
  { name: "Dormir bem", category: "sono", icon: "😴", target_value: 8, unit: "horas", time_of_day: "23:00" },
];

/**
 * Cria os hábitos sugeridos (Água/Leitura/Exercícios/Sono). Só age quando o usuário
 * ainda não tem hábito algum (evita duplicar). O usuário pode editar/excluir depois.
 */
export async function seedDefaultHabits(): Promise<
  ActionResult<{ created: number }>
> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { count } = await ctx.supabase
    .from("habits")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    return { ok: true, data: { created: 0 } };
  }

  const rows = DEFAULT_HABITS.map((h, i) => ({
    user_id: ctx.userId,
    name: h.name,
    category: h.category,
    icon: h.icon,
    target_value: h.target_value,
    unit: h.unit,
    frequency: "diaria" as const,
    weekdays: [],
    time_of_day: h.time_of_day ?? null,
    is_active: true,
    position: i,
  }));

  const { error } = await ctx.supabase.from("habits").insert(rows);
  if (error) return dbError("Não foi possível adicionar os hábitos sugeridos.");

  revalidate();
  return { ok: true, data: { created: rows.length } };
}
