"use server";

import { revalidatePath } from "next/cache";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import {
  courseSchema,
  lessonSchema,
  moduleSchema,
  practiceSchema,
  sessionSchema,
  vocabularySchema,
} from "@/lib/validators/study";
import { courseProgress } from "@/lib/studies/progress";
import type { ActionResult } from "@/types/finance";
import type { VocabMastery } from "@/lib/studies/constants";

type Ctx = NonNullable<Awaited<ReturnType<typeof authContext>>>;

function revalidate(courseId?: string) {
  revalidatePath("/estudos");
  if (courseId) revalidatePath(`/estudos/${courseId}`);
}

/* ───────────────────────────── Helpers de propriedade ───────────────────────────── */

/** Curso do usuário (RLS-scoped). Null = não existe ou não é dele. */
async function getOwnedCourse(ctx: Ctx, courseId: string) {
  const { data } = await ctx.supabase
    .from("study_courses")
    .select("id")
    .eq("id", courseId)
    .maybeSingle();
  return data;
}

/** Módulo do usuário (RLS-scoped) com seu course_id. */
async function getOwnedModule(ctx: Ctx, moduleId: string) {
  const { data } = await ctx.supabase
    .from("study_modules")
    .select("id, course_id")
    .eq("id", moduleId)
    .maybeSingle();
  return data;
}

/** course_id de uma aula do usuário (RLS-scoped). */
async function getLessonCourseId(ctx: Ctx, lessonId: string): Promise<string | null> {
  const { data } = await ctx.supabase
    .from("study_lessons")
    .select("course_id")
    .eq("id", lessonId)
    .maybeSingle();
  return data?.course_id ?? null;
}

/**
 * Recalcula e PERSISTE `progress` (razão de aulas concluídas) e `studied_minutes`
 * (soma das sessões) do curso. Fonte única — chamado após qualquer mudança em aulas
 * ou sessões. Nunca soma aulas + sessões (evita dupla contagem).
 */
async function recomputeCourseStats(ctx: Ctx, courseId: string): Promise<void> {
  const [{ data: lessons }, { data: sessions }] = await Promise.all([
    ctx.supabase.from("study_lessons").select("is_done").eq("course_id", courseId),
    ctx.supabase
      .from("study_sessions")
      .select("duration_minutes")
      .eq("course_id", courseId),
  ]);
  const total = lessons?.length ?? 0;
  const done = (lessons ?? []).filter((l) => l.is_done).length;
  const studied = (sessions ?? []).reduce(
    (acc, s) => acc + Math.max(0, s.duration_minutes ?? 0),
    0,
  );
  await ctx.supabase
    .from("study_courses")
    .update({ progress: courseProgress(total, done), studied_minutes: studied })
    .eq("id", courseId);
}

/**
 * Reordena (sobe/desce) trocando a `position` com o vizinho. Posições são únicas
 * (criadas como max+1), então a troca simples é estável. `scopeCol`/`scopeVal`
 * delimitam os irmãos (curso para módulos, módulo para aulas).
 */
async function reorder(
  ctx: Ctx,
  table: "study_modules" | "study_lessons",
  id: string,
  direction: "up" | "down",
  scopeCol: "course_id" | "module_id",
  scopeVal: string,
): Promise<ActionResult> {
  const { data: items } = await ctx.supabase
    .from(table)
    .select("id, position")
    .eq(scopeCol as never, scopeVal)
    .order("position", { ascending: true });

  const list = items ?? [];
  const idx = list.findIndex((i) => i.id === id);
  if (idx < 0) return dbError("Item não encontrado.");
  const swapIdx = direction === "up" ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return { ok: true, data: undefined };

  const a = list[idx];
  const b = list[swapIdx];
  const [r1, r2] = await Promise.all([
    ctx.supabase.from(table).update({ position: b.position }).eq("id", a.id),
    ctx.supabase.from(table).update({ position: a.position }).eq("id", b.id),
  ]);
  if (r1.error || r2.error) return dbError("Não foi possível reordenar.");
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Cursos ───────────────────────────── */

export async function createCourse(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { data: last } = await ctx.supabase
    .from("study_courses")
    .select("position")
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data, error } = await ctx.supabase
    .from("study_courses")
    .insert({
      user_id: ctx.userId,
      title: d.title,
      platform: d.platform,
      url: d.url,
      category: d.category,
      status: d.status,
      priority: d.priority,
      workload_minutes: d.workload_minutes,
      weekly_goal_minutes: d.weekly_goal_minutes,
      start_date: d.start_date,
      target_date: d.target_date,
      notes: d.notes,
      materials: d.materials,
      is_language: d.is_language,
      cover_color: d.cover_color,
      icon: d.icon,
      position,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar o curso.");
  revalidate();
  return { ok: true, data: { id: data.id } };
}

export async function updateCourse(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = courseSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  const { error } = await ctx.supabase
    .from("study_courses")
    .update({
      title: d.title,
      platform: d.platform,
      url: d.url,
      category: d.category,
      status: d.status,
      priority: d.priority,
      workload_minutes: d.workload_minutes,
      weekly_goal_minutes: d.weekly_goal_minutes,
      start_date: d.start_date,
      target_date: d.target_date,
      notes: d.notes,
      materials: d.materials,
      is_language: d.is_language,
      cover_color: d.cover_color,
      icon: d.icon,
    })
    .eq("id", id);

  if (error) return dbError("Não foi possível atualizar o curso.");
  revalidate(id);
  return { ok: true, data: undefined };
}

/** Mudança rápida de status (cards / detalhe). */
export async function setCourseStatus(
  id: string,
  status: "nao_iniciado" | "em_andamento" | "pausado" | "concluido",
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("study_courses")
    .update({ status })
    .eq("id", id);
  if (error) return dbError("Não foi possível atualizar o status.");
  revalidate(id);
  return { ok: true, data: undefined };
}

/** Define a meta semanal de idioma (minutos). null limpa a meta. */
export async function setWeeklyGoal(
  id: string,
  minutes: number | null,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const value =
    minutes === null || !Number.isFinite(minutes) || minutes <= 0
      ? null
      : Math.round(minutes);
  const { error } = await ctx.supabase
    .from("study_courses")
    .update({ weekly_goal_minutes: value })
    .eq("id", id);
  if (error) return dbError("Não foi possível salvar a meta.");
  revalidate(id);
  return { ok: true, data: undefined };
}

export async function deleteCourse(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { error } = await ctx.supabase
    .from("study_courses")
    .delete()
    .eq("id", id);
  if (error) return dbError("Não foi possível excluir o curso.");
  revalidate();
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Módulos ───────────────────────────── */

export async function createModule(
  courseId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = moduleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  if (!(await getOwnedCourse(ctx, courseId))) return dbError("Curso não encontrado.");

  const { data: last } = await ctx.supabase
    .from("study_modules")
    .select("position")
    .eq("course_id", courseId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data, error } = await ctx.supabase
    .from("study_modules")
    .insert({
      user_id: ctx.userId,
      course_id: courseId,
      title: parsed.data.title,
      notes: parsed.data.notes,
      position,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar o módulo.");
  revalidate(courseId);
  return { ok: true, data: { id: data.id } };
}

export async function updateModule(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = moduleSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const mod = await getOwnedModule(ctx, id);
  const { error } = await ctx.supabase
    .from("study_modules")
    .update({ title: parsed.data.title, notes: parsed.data.notes })
    .eq("id", id);
  if (error) return dbError("Não foi possível atualizar o módulo.");
  revalidate(mod?.course_id);
  return { ok: true, data: undefined };
}

export async function deleteModule(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const mod = await getOwnedModule(ctx, id);
  const { error } = await ctx.supabase
    .from("study_modules")
    .delete()
    .eq("id", id);
  if (error) return dbError("Não foi possível excluir o módulo.");
  if (mod?.course_id) await recomputeCourseStats(ctx, mod.course_id);
  revalidate(mod?.course_id);
  return { ok: true, data: undefined };
}

export async function moveModule(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const mod = await getOwnedModule(ctx, id);
  if (!mod) return dbError("Módulo não encontrado.");
  const res = await reorder(ctx, "study_modules", id, direction, "course_id", mod.course_id);
  revalidate(mod.course_id);
  return res;
}

/* ───────────────────────────── Aulas ───────────────────────────── */

export async function createLesson(
  moduleId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const mod = await getOwnedModule(ctx, moduleId);
  if (!mod) return dbError("Módulo não encontrado.");

  const { data: last } = await ctx.supabase
    .from("study_lessons")
    .select("position")
    .eq("module_id", moduleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle();
  const position = (last?.position ?? -1) + 1;

  const { data, error } = await ctx.supabase
    .from("study_lessons")
    .insert({
      user_id: ctx.userId,
      module_id: moduleId,
      course_id: mod.course_id,
      title: parsed.data.title,
      url: parsed.data.url,
      duration_minutes: parsed.data.duration_minutes,
      notes: parsed.data.notes,
      position,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível criar a aula.");
  await recomputeCourseStats(ctx, mod.course_id);
  revalidate(mod.course_id);
  return { ok: true, data: { id: data.id } };
}

export async function updateLesson(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = lessonSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const courseId = await getLessonCourseId(ctx, id);
  const { error } = await ctx.supabase
    .from("study_lessons")
    .update({
      title: parsed.data.title,
      url: parsed.data.url,
      duration_minutes: parsed.data.duration_minutes,
      notes: parsed.data.notes,
    })
    .eq("id", id);
  if (error) return dbError("Não foi possível atualizar a aula.");
  revalidate(courseId ?? undefined);
  return { ok: true, data: undefined };
}

/** Marca/desmarca aula como concluída e recalcula o progresso do curso. */
export async function toggleLessonDone(
  id: string,
  done: boolean,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const courseId = await getLessonCourseId(ctx, id);
  if (!courseId) return dbError("Aula não encontrada.");
  const { error } = await ctx.supabase
    .from("study_lessons")
    .update({ is_done: done, completed_at: done ? new Date().toISOString() : null })
    .eq("id", id);
  if (error) return dbError("Não foi possível atualizar a aula.");
  await recomputeCourseStats(ctx, courseId);
  revalidate(courseId);
  return { ok: true, data: undefined };
}

export async function deleteLesson(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const courseId = await getLessonCourseId(ctx, id);
  const { error } = await ctx.supabase
    .from("study_lessons")
    .delete()
    .eq("id", id);
  if (error) return dbError("Não foi possível excluir a aula.");
  if (courseId) await recomputeCourseStats(ctx, courseId);
  revalidate(courseId ?? undefined);
  return { ok: true, data: undefined };
}

export async function moveLesson(
  id: string,
  direction: "up" | "down",
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { data: lesson } = await ctx.supabase
    .from("study_lessons")
    .select("module_id, course_id")
    .eq("id", id)
    .maybeSingle();
  if (!lesson) return dbError("Aula não encontrada.");
  const res = await reorder(ctx, "study_lessons", id, direction, "module_id", lesson.module_id);
  revalidate(lesson.course_id);
  return res;
}

/* ───────────────────────────── Sessões de estudo ───────────────────────────── */

/**
 * Registra uma sessão de estudo. Se `mark_lesson_done` e houver `lesson_id`, marca a
 * aula como concluída na mesma operação. Recalcula o progresso/tempo do curso.
 */
export async function createSession(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  if (!(await getOwnedCourse(ctx, d.course_id)))
    return dbError("Curso não encontrado.");

  // Valida que a aula (se informada) pertence ao mesmo curso do usuário.
  let lessonId = d.lesson_id;
  if (lessonId) {
    const lessonCourse = await getLessonCourseId(ctx, lessonId);
    if (lessonCourse !== d.course_id) lessonId = null;
  }

  const { data, error } = await ctx.supabase
    .from("study_sessions")
    .insert({
      user_id: ctx.userId,
      course_id: d.course_id,
      lesson_id: lessonId,
      session_date: d.session_date,
      duration_minutes: d.duration_minutes,
      what_i_learned: d.what_i_learned,
      next_action: d.next_action,
      difficulty: d.difficulty,
      task_id: d.task_id,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível registrar a sessão.");

  if (d.mark_lesson_done && lessonId) {
    await ctx.supabase
      .from("study_lessons")
      .update({ is_done: true, completed_at: new Date().toISOString() })
      .eq("id", lessonId);
  }

  await recomputeCourseStats(ctx, d.course_id);
  revalidate(d.course_id);
  return { ok: true, data: { id: data.id } };
}

export async function updateSession(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const d = parsed.data;

  let lessonId = d.lesson_id;
  if (lessonId) {
    const lessonCourse = await getLessonCourseId(ctx, lessonId);
    if (lessonCourse !== d.course_id) lessonId = null;
  }

  const { error } = await ctx.supabase
    .from("study_sessions")
    .update({
      course_id: d.course_id,
      lesson_id: lessonId,
      session_date: d.session_date,
      duration_minutes: d.duration_minutes,
      what_i_learned: d.what_i_learned,
      next_action: d.next_action,
      difficulty: d.difficulty,
      task_id: d.task_id,
    })
    .eq("id", id);
  if (error) return dbError("Não foi possível atualizar a sessão.");
  await recomputeCourseStats(ctx, d.course_id);
  revalidate(d.course_id);
  return { ok: true, data: undefined };
}

export async function deleteSession(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { data: session } = await ctx.supabase
    .from("study_sessions")
    .select("course_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await ctx.supabase
    .from("study_sessions")
    .delete()
    .eq("id", id);
  if (error) return dbError("Não foi possível excluir a sessão.");
  if (session?.course_id) await recomputeCourseStats(ctx, session.course_id);
  revalidate(session?.course_id);
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Vocabulário (idiomas) ───────────────────────────── */

export async function createVocabulary(
  courseId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = vocabularySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  if (!(await getOwnedCourse(ctx, courseId))) return dbError("Curso não encontrado.");

  const { data, error } = await ctx.supabase
    .from("study_vocabulary")
    .insert({
      user_id: ctx.userId,
      course_id: courseId,
      term: parsed.data.term,
      translation: parsed.data.translation,
      example: parsed.data.example,
      mastery: parsed.data.mastery,
      next_review_date: parsed.data.next_review_date,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível adicionar o termo.");
  revalidate(courseId);
  return { ok: true, data: { id: data.id } };
}

export async function updateVocabulary(
  id: string,
  input: unknown,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = vocabularySchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  const { data: vocab } = await ctx.supabase
    .from("study_vocabulary")
    .select("course_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await ctx.supabase
    .from("study_vocabulary")
    .update({
      term: parsed.data.term,
      translation: parsed.data.translation,
      example: parsed.data.example,
      mastery: parsed.data.mastery,
      next_review_date: parsed.data.next_review_date,
    })
    .eq("id", id);
  if (error) return dbError("Não foi possível atualizar o termo.");
  revalidate(vocab?.course_id);
  return { ok: true, data: undefined };
}

/** Mudança rápida de nível de domínio. */
export async function setVocabMastery(
  id: string,
  mastery: VocabMastery,
): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { data: vocab } = await ctx.supabase
    .from("study_vocabulary")
    .select("course_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await ctx.supabase
    .from("study_vocabulary")
    .update({ mastery })
    .eq("id", id);
  if (error) return dbError("Não foi possível atualizar o nível.");
  revalidate(vocab?.course_id);
  return { ok: true, data: undefined };
}

export async function deleteVocabulary(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { data: vocab } = await ctx.supabase
    .from("study_vocabulary")
    .select("course_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await ctx.supabase
    .from("study_vocabulary")
    .delete()
    .eq("id", id);
  if (error) return dbError("Não foi possível excluir o termo.");
  revalidate(vocab?.course_id);
  return { ok: true, data: undefined };
}

/* ───────────────────────────── Prática por habilidade (idiomas) ───────────────────────────── */

export async function createPractice(
  courseId: string,
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = practiceSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);

  if (!(await getOwnedCourse(ctx, courseId))) return dbError("Curso não encontrado.");

  const { data, error } = await ctx.supabase
    .from("study_language_practice")
    .insert({
      user_id: ctx.userId,
      course_id: courseId,
      practice_date: parsed.data.practice_date,
      skill: parsed.data.skill,
      duration_minutes: parsed.data.duration_minutes,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error || !data) return dbError("Não foi possível registrar a prática.");
  revalidate(courseId);
  return { ok: true, data: { id: data.id } };
}

export async function deletePractice(id: string): Promise<ActionResult> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;
  const { data: row } = await ctx.supabase
    .from("study_language_practice")
    .select("course_id")
    .eq("id", id)
    .maybeSingle();
  const { error } = await ctx.supabase
    .from("study_language_practice")
    .delete()
    .eq("id", id);
  if (error) return dbError("Não foi possível excluir a prática.");
  revalidate(row?.course_id);
  return { ok: true, data: undefined };
}
