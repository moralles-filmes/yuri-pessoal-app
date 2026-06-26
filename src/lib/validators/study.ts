import { z } from "zod";
import {
  LANGUAGE_SKILLS,
  STUDY_CATEGORIES,
  STUDY_DIFFICULTIES,
  STUDY_PRIORITIES,
  STUDY_STATUSES,
  VOCAB_MASTERY,
} from "@/lib/studies/constants";
import {
  dateString,
  minutesInt,
  optionalColor,
  optionalDate,
  optionalText,
  optionalUrl,
  optionalUuid,
} from "@/lib/validators/shared";

/** Um material/link do curso: rótulo + URL. */
const materialSchema = z.object({
  label: z.string().trim().min(1, "Informe um rótulo").max(120, "Máximo de 120 caracteres"),
  url: z
    .string()
    .trim()
    .min(1, "Informe o link")
    .max(2048, "Link muito longo")
    .regex(/^(https?:\/\/)?[^\s.]+\.[^\s]{2,}$/i, "Link inválido"),
});

/** Lista de materiais (até 30 itens). Ausente/vazia vira []. */
const materialsArray = z
  .array(materialSchema)
  .max(30, "Máximo de 30 materiais")
  .optional()
  .transform((v) => v ?? []);

/* ───────────────────────────── Curso ───────────────────────────── */

/**
 * Validação de um curso (Fase 11). `progress` e `studied_minutes` NÃO entram aqui:
 * são derivados (aulas concluídas / soma das sessões) e persistidos pelas actions.
 */
export const courseSchema = z.object({
  title: z.string().trim().min(1, "Informe um título").max(160, "Máximo de 160 caracteres"),
  platform: optionalText(80),
  url: optionalUrl,
  category: z.enum(STUDY_CATEGORIES),
  status: z.enum(STUDY_STATUSES),
  priority: z.enum(STUDY_PRIORITIES),
  workload_minutes: minutesInt,
  weekly_goal_minutes: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    minutesInt.nullable(),
  ),
  start_date: optionalDate,
  target_date: optionalDate,
  notes: optionalText(2000),
  materials: materialsArray,
  is_language: z.boolean().optional().transform((v) => v ?? false),
  cover_color: optionalColor,
  icon: optionalText(8),
});

export type CourseInput = z.infer<typeof courseSchema>;

/* ───────────────────────────── Módulo ───────────────────────────── */

export const moduleSchema = z.object({
  title: z.string().trim().min(1, "Informe um título").max(160, "Máximo de 160 caracteres"),
  notes: optionalText(1000),
});

export type ModuleInput = z.infer<typeof moduleSchema>;

/* ───────────────────────────── Aula ───────────────────────────── */

export const lessonSchema = z.object({
  title: z.string().trim().min(1, "Informe um título").max(200, "Máximo de 200 caracteres"),
  url: optionalUrl,
  duration_minutes: minutesInt,
  notes: optionalText(1000),
});

export type LessonInput = z.infer<typeof lessonSchema>;

/* ───────────────────────────── Sessão de estudo ───────────────────────────── */

/**
 * Sessão de estudo. `mark_lesson_done` é um sinalizador da UI ("marcar a aula
 * vinculada como concluída ao registrar") — não é coluna; a action o consome.
 */
export const sessionSchema = z.object({
  course_id: z.uuid("Selecione um curso"),
  lesson_id: optionalUuid,
  session_date: dateString,
  duration_minutes: minutesInt,
  what_i_learned: optionalText(2000),
  next_action: optionalText(1000),
  difficulty: z.enum(STUDY_DIFFICULTIES),
  task_id: optionalUuid,
  mark_lesson_done: z.boolean().optional().transform((v) => v ?? false),
});

export type SessionInput = z.infer<typeof sessionSchema>;

/* ───────────────────────────── Vocabulário (idiomas) ───────────────────────────── */

export const vocabularySchema = z.object({
  term: z.string().trim().min(1, "Informe o termo").max(200, "Máximo de 200 caracteres"),
  translation: optionalText(200),
  example: optionalText(500),
  mastery: z.enum(VOCAB_MASTERY),
  next_review_date: optionalDate,
});

export type VocabularyInput = z.infer<typeof vocabularySchema>;

/* ───────────────────────────── Prática por habilidade (idiomas) ───────────────────────────── */

export const practiceSchema = z.object({
  practice_date: dateString,
  skill: z.enum(LANGUAGE_SKILLS),
  duration_minutes: minutesInt,
  notes: optionalText(1000),
});

export type PracticeInput = z.infer<typeof practiceSchema>;
