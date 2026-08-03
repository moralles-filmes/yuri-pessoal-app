/**
 * Fase 17-A — Treinos · Schemas Zod.
 *
 * Validação de SERVIDOR: as actions sempre re-validam o que vem do client. `user_id` NÃO
 * aparece em nenhum schema — vem sempre de `auth.getUser()` na action. É a proteção contra
 * mass assignment exigida pelo projeto.
 *
 * `is_system_exercise`, `source`, `system_code` e `is_verified` também ficam de fora de
 * propósito: o usuário não pode se declarar dono de um exercício da base do sistema nem
 * carimbar um exercício digitado à mão como "verificado".
 */
import { z } from "zod";
import {
  AUTO_ADVANCE_MODES,
  DIFFICULTY_SCALES,
  EQUIPMENT_CATEGORIES,
  EXERCISE_TYPES,
  LATERALITIES,
  MOVEMENT_PATTERNS,
  MUSCLE_REGIONS,
  MUSCLE_ROLES,
  ONE_RM_FORMULAS,
  TRACKING_TYPES,
  UNILATERAL_VOLUME_RULES,
  WEIGHT_UNITS,
} from "@/lib/training/constants";
import { optionalColor, optionalText, optionalUrl, optionalUuid } from "@/lib/validators/shared";

/** Número opcional aceitando vírgula (padrão BR); vazio vira null. */
const optionalNumber = (max: number, message = "Valor inválido") =>
  z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return null;
      if (typeof v === "string") return Number(v.replace(",", "."));
      return v;
    },
    z.coerce.number().finite(message).min(0, "Não pode ser negativo").max(max).nullable(),
  );

/** Inteiro opcional (segundos de descanso, por exemplo). */
const optionalInt = (max: number) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.coerce.number().int("Use um número inteiro").min(0, "Não pode ser negativo").max(max).nullable(),
  );

/* ───────────────────────────── Exercício ───────────────────────────── */

export const trainingExerciseSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(160, "Máximo de 160 caracteres"),
  alternative_name: optionalText(160),
  description: optionalText(2000),

  primary_muscle_group_id: z.uuid("Escolha o grupo muscular principal"),
  equipment_id: optionalUuid,

  movement_pattern: z
    .enum(MOVEMENT_PATTERNS)
    .optional()
    .transform((v) => v ?? "outros"),
  exercise_type: z
    .enum(EXERCISE_TYPES)
    .optional()
    .transform((v) => v ?? "forca"),
  tracking_type: z
    .enum(TRACKING_TYPES)
    .optional()
    .transform((v) => v ?? "peso_reps"),
  laterality: z
    .enum(LATERALITIES)
    .optional()
    .transform((v) => v ?? "bilateral"),

  instructions: optionalText(4000),
  tips: optionalText(2000),
  common_mistakes: optionalText(2000),
  notes: optionalText(2000),
  image_url: optionalUrl,
  video_url: optionalUrl,

  default_rest_seconds: optionalInt(3600),
  default_increment_kg: optionalNumber(500, "Incremento inválido"),

  /**
   * Grupos secundários. O principal não pode se repetir aqui — o banco também barra por
   * trigger, mas validar antes devolve mensagem em pt-BR em vez de erro de constraint.
   */
  secondary_muscles: z
    .array(
      z.object({
        muscle_group_id: z.uuid("Grupo inválido"),
        role: z
          .enum(MUSCLE_ROLES)
          .optional()
          .transform((v) => v ?? "secundario"),
      }),
    )
    .max(12, "No máximo 12 grupos secundários")
    .optional()
    .transform((v) => v ?? []),
});

export const trainingExerciseUpdateSchema = trainingExerciseSchema.extend({
  id: z.uuid("Exercício inválido"),
});

/* ───────────────────────────── Preferência sobre exercício ───────────────────────────── */

export const trainingExercisePrefSchema = z.object({
  exercise_id: z.uuid("Exercício inválido"),
  is_favorite: z.boolean().optional(),
  archived: z.boolean().optional(),
  custom_name: optionalText(160),
  custom_rest_seconds: optionalInt(3600),
  custom_increment_kg: optionalNumber(500, "Incremento inválido"),
  notes: optionalText(2000),
});

/* ───────────────────────────── Duplicar ───────────────────────────── */

export const trainingDuplicateSchema = z.object({
  exercise_id: z.uuid("Exercício inválido"),
  name: z.string().trim().min(1, "Informe o nome").max(160).optional(),
});

/* ───────────────────────────── Ações em massa ─────────────────────────────
 * O escopo é sempre explícito e a lista de ids é validada — nada de "aplicar a tudo".
 */
export const trainingBulkSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Selecione ao menos um exercício").max(500),
  action: z.enum([
    "favoritar",
    "desfavoritar",
    "arquivar",
    "restaurar",
    "excluir",
    "mudar_grupo",
    "mudar_equipamento",
  ]),
  muscle_group_id: optionalUuid,
  equipment_id: optionalUuid,
});

/* ───────────────────────────── Alternativas ───────────────────────────── */

export const trainingAlternativeSchema = z
  .object({
    exercise_id: z.uuid("Exercício inválido"),
    alternative_exercise_id: z.uuid("Escolha o exercício alternativo"),
    note: optionalText(300),
  })
  .refine((data) => data.exercise_id !== data.alternative_exercise_id, {
    message: "Um exercício não pode ser alternativa de si mesmo",
    path: ["alternative_exercise_id"],
  });

/* ───────────────────────────── Vocabulário do usuário ───────────────────────────── */

export const trainingMuscleGroupSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(80),
  region: z
    .enum(MUSCLE_REGIONS)
    .optional()
    .transform((v) => v ?? "outro"),
  parent_id: optionalUuid,
  color: optionalColor,
});

export const trainingEquipmentSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(80),
  category: z
    .enum(EQUIPMENT_CATEGORIES)
    .optional()
    .transform((v) => v ?? "outro"),
  default_increment_kg: optionalNumber(500, "Incremento inválido"),
});

/* ───────────────────────────── Preferências do módulo ───────────────────────────── */

export const trainingPreferencesSchema = z.object({
  weight_unit: z.enum(WEIGHT_UNITS),
  difficulty_scale: z.enum(DIFFICULTY_SCALES),
  default_rest_seconds: z.coerce
    .number()
    .int("Use segundos inteiros")
    .min(0, "Não pode ser negativo")
    .max(3600, "No máximo 60 minutos"),
  default_increment_kg: z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(",", ".")) : v),
    z.coerce.number().positive("O incremento precisa ser maior que zero").max(500),
  ),
  week_starts_on: z.coerce.number().int().min(0).max(6),
  weekly_workout_goal: optionalInt(14),
  auto_advance: z.enum(AUTO_ADVANCE_MODES),
  rest_sound_enabled: z.boolean(),
  rest_vibration_enabled: z.boolean(),
  keep_screen_awake: z.boolean(),
  unilateral_volume_rule: z.enum(UNILATERAL_VOLUME_RULES),
  count_warmup_in_volume: z.boolean(),
  one_rm_formula: z.enum(ONE_RM_FORMULAS),
  progression_enabled: z.boolean(),
});

export type TrainingExerciseInput = z.infer<typeof trainingExerciseSchema>;
export type TrainingPreferencesInput = z.infer<typeof trainingPreferencesSchema>;
