/**
 * Camada de leitura de Estudos (Fase 11). Server-only. A RLS garante que cada query
 * retorna apenas o que é do usuário. As derivações (progresso, próxima aula, horas
 * semana/mês, streak, evolução) usam os módulos puros src/lib/studies/progress.ts e
 * streak.ts. Uma leitura agregada alimenta todas as visões da tela (sem N+1).
 */
import { addDays, format, startOfMonth, startOfWeek } from "date-fns";
import { createClient } from "@/lib/supabase/server";
import {
  courseOverdueReason,
  courseProgress,
  minutesInRange,
  nextLesson,
  sessionDateSet,
  type LessonLike,
} from "@/lib/studies/progress";
import { bestStudyStreak, studyStreak } from "@/lib/studies/streak";
import { LANGUAGE_SKILLS, type LanguageSkill } from "@/lib/studies/constants";
import type {
  LanguageWeekProgress,
  NextLessonItem,
  StudyCourseDetail,
  StudyCourseOption,
  StudyCourseRow,
  StudyCourseStats,
  StudyDashboard,
  StudyLessonRow,
  StudyMaterial,
  StudyModuleWithLessons,
  StudySessionWithRelations,
  StudyTaskOption,
  StudyVocabularyRow,
  StudyWeekPoint,
} from "@/types/database";

const ISO = "yyyy-MM-dd";
const WEEKLY_WEEKS = 8;

const STATUS_ORDER: Record<string, number> = {
  em_andamento: 0,
  nao_iniciado: 1,
  pausado: 2,
  concluido: 3,
};

/** Normaliza o jsonb `materials` para StudyMaterial[] (tolerante a dados antigos). */
function toMaterials(value: unknown): StudyMaterial[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (m): m is StudyMaterial =>
        Boolean(m) &&
        typeof (m as StudyMaterial).label === "string" &&
        typeof (m as StudyMaterial).url === "string",
    )
    .map((m) => ({ label: m.label, url: m.url }));
}

/** Converte uma linha crua de curso para StudyCourseRow (enums + materials tipados). */
function toCourseRow(raw: Record<string, unknown>): StudyCourseRow {
  return {
    ...(raw as unknown as StudyCourseRow),
    materials: toMaterials(raw.materials),
  };
}

type LessonLite = {
  id: string;
  course_id: string;
  module_id: string;
  title: string;
  is_done: boolean;
  position: number;
};
type ModuleLite = { id: string; course_id: string; title: string; position: number };
type SessionLite = {
  course_id: string;
  session_date: string;
  duration_minutes: number;
};

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const arr = map.get(k);
    if (arr) arr.push(item);
    else map.set(k, [item]);
  }
  return map;
}

/* ───────────────────────────── Dashboard / página ───────────────────────────── */

export async function getStudyDashboard(
  todayIso: string,
): Promise<StudyDashboard> {
  const supabase = await createClient();
  const today = new Date(`${todayIso}T00:00:00`);
  const windowStart = format(addDays(today, -364), ISO);
  const weekStartIso = format(startOfWeek(today, { weekStartsOn: 1 }), ISO);
  const monthStartIso = format(startOfMonth(today), ISO);

  const [
    { data: coursesData },
    { data: modulesData },
    { data: lessonsData },
    { data: sessionsData },
    { data: recentData },
    { data: practiceData },
    { data: tasksData },
  ] = await Promise.all([
    supabase.from("study_courses").select("*").order("position", { ascending: true }),
    supabase
      .from("study_modules")
      .select("id, course_id, title, position"),
    supabase
      .from("study_lessons")
      .select("id, course_id, module_id, title, is_done, position"),
    supabase
      .from("study_sessions")
      .select("course_id, session_date, duration_minutes")
      .gte("session_date", windowStart)
      .lte("session_date", todayIso),
    supabase
      .from("study_sessions")
      .select(
        "*, lesson:study_lessons(id,title), task:tasks(id,title), course:study_courses(title, cover_color)",
      )
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("study_language_practice")
      .select("course_id, duration_minutes")
      .gte("practice_date", weekStartIso)
      .lte("practice_date", todayIso),
    supabase
      .from("tasks")
      .select("id, title")
      .in("status", ["pendente", "em_andamento"])
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const courses = (coursesData ?? []).map((c) =>
    toCourseRow(c as Record<string, unknown>),
  );
  const modules = (modulesData ?? []) as ModuleLite[];
  const lessons = (lessonsData ?? []) as LessonLite[];
  const sessions = (sessionsData ?? []) as SessionLite[];

  const modulePos = new Map(modules.map((m) => [m.id, m.position]));
  const moduleTitle = new Map(modules.map((m) => [m.id, m.title]));
  const lessonsByCourse = groupBy(lessons, (l) => l.course_id);
  const sessionsByCourse = groupBy(sessions, (s) => s.course_id);

  const stats: StudyCourseStats[] = [];
  const nextLessons: NextLessonItem[] = [];

  for (const course of courses) {
    const cLessons = lessonsByCourse.get(course.id) ?? [];
    const total = cLessons.length;
    const done = cLessons.filter((l) => l.is_done).length;

    const likes = cLessons.map((l) => ({
      id: l.id,
      title: l.title,
      is_done: l.is_done,
      position: l.position,
      module_position: modulePos.get(l.module_id) ?? 0,
      module_id: l.module_id,
    }));
    const next = nextLesson(likes);

    const cSessions = sessionsByCourse.get(course.id) ?? [];
    const lastSessionDate = cSessions.reduce<string | null>(
      (max, s) => (max === null || s.session_date > max ? s.session_date : max),
      null,
    );
    const overdue = courseOverdueReason(course, lastSessionDate, todayIso);

    stats.push({
      ...course,
      totalLessons: total,
      doneLessons: done,
      progressPct: courseProgress(total, done),
      studiedMinutes: course.studied_minutes,
      lastSessionDate,
      nextLessonTitle: next?.title ?? null,
      overdue,
    });

    if (course.status === "em_andamento" && next) {
      nextLessons.push({
        courseId: course.id,
        courseTitle: course.title,
        coverColor: course.cover_color,
        category: course.category,
        icon: course.icon,
        lessonId: next.id!,
        lessonTitle: next.title!,
        moduleTitle: moduleTitle.get(next.module_id) ?? "",
      });
    }
  }

  stats.sort(
    (a, b) =>
      (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9) ||
      a.position - b.position,
  );

  // Agregados de tempo (janela carregada de sessões).
  const minutesWeek = minutesInRange(sessions, weekStartIso, todayIso);
  const minutesMonth = minutesInRange(sessions, monthStartIso, todayIso);
  const dates = sessionDateSet(sessions);
  const streak = studyStreak(dates, todayIso);
  const bestStreak = bestStudyStreak(dates, windowStart, todayIso);

  const weekly: StudyWeekPoint[] = [];
  for (let w = WEEKLY_WEEKS - 1; w >= 0; w--) {
    const ws = startOfWeek(addDays(today, -7 * w), { weekStartsOn: 1 });
    const wsIso = format(ws, ISO);
    const rawEnd = format(addDays(ws, 6), ISO);
    const weekEnd = rawEnd > todayIso ? todayIso : rawEnd;
    weekly.push({
      weekStart: wsIso,
      label: format(ws, "dd/MM"),
      minutes: minutesInRange(sessions, wsIso, weekEnd),
    });
  }

  // Prática de idioma na semana, por curso.
  const practiceWeekByCourse: Record<string, number> = {};
  for (const p of (practiceData ?? []) as {
    course_id: string;
    duration_minutes: number;
  }[]) {
    practiceWeekByCourse[p.course_id] =
      (practiceWeekByCourse[p.course_id] ?? 0) + Math.max(0, p.duration_minutes);
  }

  // Opções de curso (com aulas) para o formulário de sessão.
  const courseOptions: StudyCourseOption[] = courses.map((c) => ({
    id: c.id,
    title: c.title,
    is_language: c.is_language,
    lessons: (lessonsByCourse.get(c.id) ?? [])
      .slice()
      .sort(
        (a, b) =>
          (modulePos.get(a.module_id) ?? 0) - (modulePos.get(b.module_id) ?? 0) ||
          a.position - b.position,
      )
      .map((l) => ({ id: l.id, title: l.title })),
  }));

  const recentSessions = (recentData ?? []).map(mapSessionRow);

  const taskOptions = (tasksData ?? []) as StudyTaskOption[];

  return {
    courses: stats,
    totalCourses: courses.length,
    inProgress: courses.filter((c) => c.status === "em_andamento").length,
    completed: courses.filter((c) => c.status === "concluido").length,
    minutesWeek,
    minutesMonth,
    streak,
    bestStreak,
    nextLessons: nextLessons.slice(0, 6),
    overdue: stats.filter((s) => s.overdue),
    weekly,
    recentSessions,
    courseOptions,
    taskOptions,
    practiceWeekByCourse,
  };
}

/** Mapeia uma linha de sessão (com embeds) para StudySessionWithRelations. */
function mapSessionRow(raw: Record<string, unknown>): StudySessionWithRelations {
  const lesson = raw.lesson as { id: string; title: string } | null;
  const task = raw.task as { id: string; title: string } | null;
  const course = raw.course as { title: string; cover_color: string | null } | null;
  return {
    ...(raw as unknown as StudySessionWithRelations),
    lesson: lesson ?? null,
    task: task ?? null,
    courseTitle: course?.title,
    courseColor: course?.cover_color ?? null,
  };
}

/* ───────────────────────────── Detalhe do curso ───────────────────────────── */

export async function getCourseDetail(
  courseId: string,
  todayIso: string,
): Promise<StudyCourseDetail | null> {
  const supabase = await createClient();
  const today = new Date(`${todayIso}T00:00:00`);
  const weekStartIso = format(startOfWeek(today, { weekStartsOn: 1 }), ISO);

  const [
    { data: courseData },
    { data: modulesData },
    { data: lessonsData },
    { data: sessionsData },
    { data: vocabData },
    { data: practiceData },
    { data: tasksData },
  ] = await Promise.all([
    supabase.from("study_courses").select("*").eq("id", courseId).maybeSingle(),
    supabase
      .from("study_modules")
      .select("*")
      .eq("course_id", courseId)
      .order("position", { ascending: true }),
    supabase
      .from("study_lessons")
      .select("*")
      .eq("course_id", courseId)
      .order("position", { ascending: true }),
    supabase
      .from("study_sessions")
      .select("*, lesson:study_lessons(id,title), task:tasks(id,title)")
      .eq("course_id", courseId)
      .order("session_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("study_vocabulary")
      .select("*")
      .eq("course_id", courseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("study_language_practice")
      .select("*")
      .eq("course_id", courseId)
      .order("practice_date", { ascending: false })
      .limit(200),
    supabase
      .from("tasks")
      .select("id, title")
      .in("status", ["pendente", "em_andamento"])
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (!courseData) return null;
  const course = toCourseRow(courseData as Record<string, unknown>);

  const modules = (modulesData ?? []) as ModuleLite[];
  const lessons = (lessonsData ?? []) as StudyLessonRow[];
  const modulePos = new Map(modules.map((m) => [m.id, m.position]));
  const lessonsByModule = groupBy(lessons, (l) => l.module_id);

  const moduleTree: StudyModuleWithLessons[] = modules.map((m) => ({
    ...(m as unknown as StudyModuleWithLessons),
    lessons: (lessonsByModule.get(m.id) ?? []).slice().sort(
      (a, b) => a.position - b.position,
    ),
  }));

  const total = lessons.length;
  const done = lessons.filter((l) => l.is_done).length;
  const likes: (LessonLike & { id: string; title: string })[] = lessons.map((l) => ({
    id: l.id,
    title: l.title,
    is_done: l.is_done,
    position: l.position,
    module_position: modulePos.get(l.module_id) ?? 0,
  }));
  const next = nextLesson(likes);

  const sessions = (sessionsData ?? []).map(mapSessionRow);
  const lastSessionDate = sessions.length ? sessions[0].session_date : null;
  const overdue = courseOverdueReason(course, lastSessionDate, todayIso);

  const vocabulary = (vocabData ?? []) as StudyVocabularyRow[];
  const practice = (practiceData ?? []) as StudyCourseDetail["practice"];

  // Progresso semanal de idioma (meta + realizado por habilidade).
  const bySkill = Object.fromEntries(
    LANGUAGE_SKILLS.map((s) => [s, 0]),
  ) as Record<LanguageSkill, number>;
  let doneMinutes = 0;
  for (const p of practice) {
    if (p.practice_date >= weekStartIso && p.practice_date <= todayIso) {
      const mins = Math.max(0, p.duration_minutes);
      doneMinutes += mins;
      bySkill[p.skill as LanguageSkill] += mins;
    }
  }
  const languageWeek: LanguageWeekProgress = {
    goalMinutes: course.weekly_goal_minutes,
    doneMinutes,
    bySkill,
  };

  return {
    ...course,
    totalLessons: total,
    doneLessons: done,
    progressPct: courseProgress(total, done),
    // Tempo estudado = valor derivado persistido (soma de TODAS as sessões do curso).
    studiedMinutes: course.studied_minutes,
    lastSessionDate,
    nextLessonTitle: next?.title ?? null,
    overdue,
    modules: moduleTree,
    sessions,
    vocabulary,
    practice,
    languageWeek,
    taskOptions: (tasksData ?? []) as StudyTaskOption[],
  };
}
