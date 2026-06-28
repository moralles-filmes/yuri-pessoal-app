"use server";

import { revalidatePath } from "next/cache";
import {
  routineItemSchema,
  routineLogSchema,
  routineSchema,
} from "@/lib/validators/routine";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { reorderedPositions } from "@/lib/shared/reorder";
import type { ActionResult } from "@/types/finance";
import type { RoutineType } from "@/lib/tasks/constants";

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

function revalidate() {
  revalidatePath("/rotinas");
  revalidatePath("/tarefas");
}

/* ───────────────────────────── Rotinas ───────────────────────────── */

export async function createRoutine(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = routineSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { data: last } = await ctx.supabase
    .from("routines")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data, error } = await ctx.supabase
    .from("routines")
    .insert({
      user_id: ctx.userId,
      name: d.name,
      type: d.type,
      description: d.description,
      color: d.color,
      icon: d.icon,
      frequency: d.frequency,
      weekdays: d.weekdays,
      time_of_day: d.time_of_day,
      is_active: d.is_active,
      position,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar a rotina.");
  revalidate();
  return { ok: true, data: { id: data.id } };
}

export async function updateRoutine(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = routineSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("routines")
    .update({
      name: d.name,
      type: d.type,
      description: d.description,
      color: d.color,
      icon: d.icon,
      frequency: d.frequency,
      weekdays: d.weekdays,
      time_of_day: d.time_of_day,
      is_active: d.is_active,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar a rotina.");
  revalidate();
  return { ok: true, data: undefined };
}

export async function toggleRoutineActive(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("routines")
    .update({ is_active: active })
    .eq("id", id);
  if (error) return dbError("Não foi possível atualizar a rotina.");
  revalidate();
  return { ok: true, data: undefined };
}

export async function deleteRoutine(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase.from("routines").delete().eq("id", id);
  if (error) return dbError("Não foi possível excluir a rotina.");
  revalidate();
  return { ok: true, data: undefined };
}

/**
 * Reordena as rotinas: grava `position = índice` para cada id na ordem recebida.
 * Single-user com poucas rotinas → updates em paralelo (sem RPC/migration). RLS
 * garante que cada update só atinge linhas do próprio usuário.
 */
export async function reorderRoutines(
  orderedIds: string[],
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== "string")) {
    return invalid({ orderedIds: ["Lista de rotinas inválida."] });
  }

  const updates = reorderedPositions(orderedIds);
  const results = await Promise.all(
    updates.map(({ id, position }) =>
      ctx.supabase
        .from("routines")
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

/* ───────────────────────────── Itens da rotina ───────────────────────────── */

export async function addRoutineItem(
  routineId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = routineItemSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data: last } = await ctx.supabase
    .from("routine_items")
    .select("position")
    .eq("routine_id", routineId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data, error } = await ctx.supabase
    .from("routine_items")
    .insert({
      user_id: ctx.userId,
      routine_id: routineId,
      label: parsed.data.label,
      position,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível adicionar o passo.");
  revalidate();
  return { ok: true, data: { id: data.id } };
}

export async function deleteRoutineItem(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("routine_items")
    .delete()
    .eq("id", id);
  if (error) return dbError("Não foi possível remover o passo.");
  revalidate();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Check-in diário ───────────────────────────── */

/** Lê o log do dia (ou cria a base) para um check-in idempotente. */
async function getDayLog(ctx: Ctx, routineId: string, logDate: string) {
  const { data } = await ctx.supabase
    .from("routine_logs")
    .select("id, is_done, completed_items, notes")
    .eq("routine_id", routineId)
    .eq("log_date", logDate)
    .maybeSingle();
  return data;
}

/** Marca a rotina inteira como feita/não-feita no dia (upsert por (rotina, dia)). */
export async function setRoutineDone(
  routineId: string,
  logDate: string,
  isDone: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const existing = await getDayLog(ctx, routineId, logDate);
  const { error } = await ctx.supabase.from("routine_logs").upsert(
    {
      user_id: ctx.userId,
      routine_id: routineId,
      log_date: logDate,
      is_done: isDone,
      completed_items: (existing?.completed_items as string[] | null) ?? [],
      notes: (existing?.notes as string | null) ?? null,
    },
    { onConflict: "user_id,routine_id,log_date" },
  );

  if (error) return dbError("Não foi possível registrar o check-in.");
  revalidate();
  return { ok: true, data: undefined };
}

/**
 * Marca/desmarca um passo da rotina no dia. Quando todos os passos ficam marcados,
 * a rotina é automaticamente considerada feita (is_done = true).
 */
export async function setRoutineItemDone(
  routineId: string,
  logDate: string,
  itemId: string,
  done: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const existing = await getDayLog(ctx, routineId, logDate);
  const current = new Set<string>(
    (existing?.completed_items as string[] | null) ?? [],
  );
  if (done) current.add(itemId);
  else current.delete(itemId);
  const completed = [...current];

  const { count } = await ctx.supabase
    .from("routine_items")
    .select("id", { count: "exact", head: true })
    .eq("routine_id", routineId);
  const total = count ?? 0;
  const isDone = total > 0 && completed.length >= total;

  const { error } = await ctx.supabase.from("routine_logs").upsert(
    {
      user_id: ctx.userId,
      routine_id: routineId,
      log_date: logDate,
      is_done: isDone,
      completed_items: completed,
      notes: (existing?.notes as string | null) ?? null,
    },
    { onConflict: "user_id,routine_id,log_date" },
  );

  if (error) return dbError("Não foi possível registrar o passo.");
  revalidate();
  return { ok: true, data: undefined };
}

/** Check-in completo (rotina + passos + observações) num dia. */
export async function checkInRoutine(
  routineId: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = routineLogSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase.from("routine_logs").upsert(
    {
      user_id: ctx.userId,
      routine_id: routineId,
      log_date: d.log_date,
      is_done: d.is_done,
      completed_items: d.completed_items,
      notes: d.notes,
    },
    { onConflict: "user_id,routine_id,log_date" },
  );

  if (error) return dbError("Não foi possível registrar o check-in.");
  revalidate();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Seed de rotinas sugeridas ───────────────────────────── */

type SeedRoutine = {
  name: string;
  type: RoutineType;
  icon: string;
  items: string[];
};

const DEFAULT_ROUTINES: SeedRoutine[] = [
  {
    name: "Rotina da Manhã",
    type: "manha",
    icon: "Sunrise",
    items: ["Beber água", "Alongar", "Revisar a agenda do dia"],
  },
  {
    name: "Rotina da Noite",
    type: "noite",
    icon: "Moon",
    items: ["Planejar o amanhã", "Sem telas 30min antes de dormir", "Leitura"],
  },
  {
    name: "Trabalho",
    type: "trabalho",
    icon: "Briefcase",
    items: ["Definir 3 prioridades", "Revisar e-mails", "Fechar pendências"],
  },
  {
    name: "Estudos",
    type: "estudos",
    icon: "GraduationCap",
    items: ["Revisar o que aprendi ontem", "Sessão focada de estudo"],
  },
  {
    name: "Exercícios",
    type: "exercicios",
    icon: "Dumbbell",
    items: ["Aquecimento", "Treino", "Alongamento final"],
  },
];

/**
 * Cria as rotinas sugeridas (Manhã/Noite/Trabalho/Estudos/Exercícios) com seus
 * passos. Só age quando o usuário ainda não tem rotina alguma (evita duplicar).
 */
export async function seedDefaultRoutines(): Promise<
  ActionResult<{ created: number }>
> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const { count } = await ctx.supabase
    .from("routines")
    .select("id", { count: "exact", head: true });
  if ((count ?? 0) > 0) {
    return { ok: true, data: { created: 0 } };
  }

  let created = 0;
  for (let i = 0; i < DEFAULT_ROUTINES.length; i++) {
    const r = DEFAULT_ROUTINES[i];
    const { data: routine, error } = await ctx.supabase
      .from("routines")
      .insert({
        user_id: ctx.userId,
        name: r.name,
        type: r.type,
        icon: r.icon,
        frequency: "diaria",
        weekdays: [],
        is_active: true,
        position: i,
      })
      .select("id")
      .single();
    if (error || !routine) continue;
    created++;
    await ctx.supabase.from("routine_items").insert(
      r.items.map((label, idx) => ({
        user_id: ctx.userId,
        routine_id: routine.id,
        label,
        position: idx,
      })),
    );
  }

  revalidate();
  return { ok: true, data: { created } };
}
