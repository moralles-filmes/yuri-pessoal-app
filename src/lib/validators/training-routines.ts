/**
 * Fase 17-B — Treinos · Schemas Zod de programas, treinos-modelo e planejamento.
 *
 * Arquivo separado de `validators/training.ts` (17-A) de propósito: são domínios diferentes
 * (catálogo × rotina), e juntar tudo faria um arquivo que ninguém lê inteiro.
 *
 * Validação de SERVIDOR. `user_id` não aparece em nenhum schema — vem sempre de
 * `auth.getUser()` na action. Também ficam de fora `version`, `version_group_id` e
 * `superseded_by`: versionamento é decisão do fluxo ("salvar como nova versão"), não campo que
 * o client escolhe. Deixá-los entrar permitiria forjar a linha do tempo do próprio treino.
 */
import { z } from "zod";
import {
  PROGRAM_STATUSES,
  SCHEDULE_ENTRY_KINDS,
  SET_TECHNIQUES,
  SET_TYPES,
  TRAINING_GOALS,
  TRAINING_LEVELS,
  WORKOUT_STATUSES,
} from "@/lib/training/constants";
import { dateString, optionalColor, optionalText, optionalUuid } from "@/lib/validators/shared";

/* ───────────────────────────── Primitivos ───────────────────────────── */

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

const optionalInt = (max: number, min = 0) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.coerce
      .number()
      .int("Use um número inteiro")
      .min(min, `Mínimo de ${min}`)
      .max(max, `Máximo de ${max}`)
      .nullable(),
  );

/** Data pura opcional: "" vira null; formato validado como 'AAAA-MM-DD'. */
const optionalDate = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  dateString.nullable(),
);

/** Horário 'HH:mm' opcional. O input do usuário é hora de Brasília, sem fuso embutido. */
const optionalTime = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido")
    .nullable(),
);

/** 0 = domingo … 6 = sábado. Mesma convenção do resto do sistema. */
const weekdayList = z
  .array(z.coerce.number().int().min(0, "Dia inválido").max(6, "Dia inválido"))
  .max(7)
  .optional()
  .transform((v) => [...new Set(v ?? [])].sort((a, b) => a - b));

/* ───────────────────────────── Programa ───────────────────────────── */

const programFields = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120, "Máximo de 120 caracteres"),
  description: optionalText(2000),
  goal: z
    .enum(TRAINING_GOALS)
    .optional()
    .transform((v) => v ?? "personalizado"),
  level: z
    .enum(TRAINING_LEVELS)
    .optional()
    .transform((v) => v ?? "nao_informado"),
  status: z
    .enum(PROGRAM_STATUSES)
    .optional()
    .transform((v) => v ?? "rascunho"),
  starts_on: optionalDate,
  ends_on: optionalDate,
  duration_weeks: optionalInt(104, 1),
  weekly_frequency: optionalInt(14, 1),
  color: optionalColor,
  icon: optionalText(60),
  notes: optionalText(2000),
  is_active: z.boolean().optional().default(false),
});

const periodOrder = (data: { starts_on: string | null; ends_on: string | null }) =>
  !data.starts_on || !data.ends_on || data.ends_on >= data.starts_on;

const periodIssue = { message: "O fim não pode ser antes do início", path: ["ends_on"] };

export const programSchema = programFields.refine(periodOrder, periodIssue);

export const programUpdateSchema = programFields
  .extend({ id: z.uuid("Programa inválido") })
  .refine(periodOrder, periodIssue);

export const programStatusSchema = z.object({
  id: z.uuid("Programa inválido"),
  status: z.enum(PROGRAM_STATUSES),
});

/**
 * Excluir um programa exige ESCOLHER o destino dos treinos. Sem valor padrão de propósito:
 * "nenhuma exclusão silenciosa" começa no schema — se o client esquecer o campo, a action
 * recusa em vez de apagar.
 */
export const programDeleteSchema = z.object({
  id: z.uuid("Programa inválido"),
  workouts_destination: z.enum(["manter_avulsos", "mover", "excluir"], {
    message: "Escolha o que fazer com os treinos deste programa",
  }),
  /** Obrigatório quando o destino é "mover". */
  target_program_id: optionalUuid,
});

export const programWorkoutSchema = z.object({
  program_id: z.uuid("Programa inválido"),
  workout_id: z.uuid("Treino inválido"),
  label: optionalText(60),
  suggested_weekdays: weekdayList,
  notes: optionalText(500),
});

export const programWorkoutUpdateSchema = z.object({
  id: z.uuid("Vínculo inválido"),
  label: optionalText(60),
  suggested_weekdays: weekdayList,
  notes: optionalText(500),
});

export const reorderSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Nada para reordenar").max(200),
});

/* ───────────────────────────── Treino-modelo ───────────────────────────── */

export const workoutSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120, "Máximo de 120 caracteres"),
  short_name: optionalText(20),
  description: optionalText(2000),
  goal: z
    .enum(TRAINING_GOALS)
    .optional()
    .transform((v) => v ?? "personalizado"),
  status: z
    .enum(WORKOUT_STATUSES)
    .optional()
    .transform((v) => v ?? "ativo"),
  program_id: optionalUuid,
  estimated_minutes: optionalInt(600),
  color: optionalColor,
  icon: optionalText(60),
  notes: optionalText(2000),
});

export const workoutUpdateSchema = workoutSchema.extend({ id: z.uuid("Treino inválido") });

export const workoutDuplicateSchema = z.object({
  id: z.uuid("Treino inválido"),
  name: z.string().trim().min(1).max(120).optional(),
  /** Copiar para outro programa. Vazio = nasce avulso. */
  program_id: optionalUuid,
});

/** "Salvar como nova versão": cria uma linha nova e arquiva a atual. */
export const workoutNewVersionSchema = z.object({
  id: z.uuid("Treino inválido"),
  note: optionalText(300),
});

export const workoutDeleteSchema = z.object({
  id: z.uuid("Treino inválido"),
  /** O que fazer com os dias FUTUROS que apontam para este treino. */
  scheduled_destination: z.enum(["manter", "remover", "trocar"], {
    message: "Escolha o que fazer com o planejamento futuro deste treino",
  }),
  target_workout_id: optionalUuid,
});

export const workoutMoveSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Selecione ao menos um treino").max(200),
  program_id: optionalUuid,
});

export const workoutBulkSchema = z.object({
  ids: z.array(z.uuid()).min(1, "Selecione ao menos um treino").max(200),
  action: z.enum(["arquivar", "restaurar", "favoritar", "desfavoritar", "duplicar"]),
});

/* ───────────────────────────── Exercício do treino ─────────────────────────────
 * Os alvos (repetições, duração, distância, carga) chegam TODOS opcionais: a matriz de
 * `tracking.ts` decide quais fazem sentido, e `expandPlannedSets` apaga o que não se aplica.
 * Exigir aqui o que só o tipo de acompanhamento sabe duplicaria a matriz num segundo lugar.
 */

const setTargets = {
  target_reps_min: optionalInt(1000),
  target_reps_max: optionalInt(1000),
  target_duration_seconds: optionalInt(86400),
  target_distance_m: optionalNumber(500000, "Distância inválida"),
  planned_weight_kg: optionalNumber(2000, "Carga inválida"),
  planned_additional_weight_kg: optionalNumber(2000, "Carga adicional inválida"),
  planned_assistance_weight_kg: optionalNumber(2000, "Assistência inválida"),
  rest_seconds: optionalInt(3600),
  target_rir: optionalInt(10),
  target_rpe: optionalNumber(10, "RPE inválido"),
};

const repsRangeCheck = <T extends { target_reps_min: unknown; target_reps_max: unknown }>(data: T) => {
  const min = data.target_reps_min as number | null;
  const max = data.target_reps_max as number | null;
  return min === null || max === null || max >= min;
};

/** Base sem `refine`, para poder derivar a versão de edição sem duplicar campo. */
const workoutExerciseConfig = z.object({
  default_sets: z.coerce
    .number()
    .int("Use um número inteiro")
    .min(1, "Pelo menos uma série")
    .max(30, "No máximo 30 séries")
    .optional()
    .transform((v) => v ?? 3),
  ...setTargets,
  set_type: z
    .enum(SET_TYPES)
    .optional()
    .transform((v) => v ?? "trabalho"),
  technique: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.enum(SET_TECHNIQUES).nullable(),
  ),
  superset_group: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z
      .string()
      .regex(/^[A-Z]$/, "Use uma letra de A a Z")
      .nullable(),
  ),
  is_warmup: z.boolean().optional().default(false),
  counts_in_volume: z.boolean().optional().default(true),
  increment_kg: optionalNumber(500, "Incremento inválido"),
  tempo: optionalText(20),
  notes: optionalText(1000),
});

const repsRangeIssue = {
  message: "O máximo não pode ser menor que o mínimo",
  path: ["target_reps_max"],
};

export const workoutExerciseSchema = workoutExerciseConfig
  .extend({
    workout_id: z.uuid("Treino inválido"),
    exercise_id: z.uuid("Escolha o exercício"),
  })
  .refine(repsRangeCheck, repsRangeIssue);

export const workoutExerciseUpdateSchema = workoutExerciseConfig
  .extend({ id: z.uuid("Exercício do treino inválido") })
  .refine(repsRangeCheck, repsRangeIssue);

/** Adicionar vários exercícios de uma vez (o construtor permite escolher em lote). */
export const workoutExercisesAddSchema = z.object({
  workout_id: z.uuid("Treino inválido"),
  exercise_ids: z.array(z.uuid()).min(1, "Escolha ao menos um exercício").max(60),
});

/* ───────────────────────────── Séries configuradas ─────────────────────────────
 * Gravadas em bloco: a tela edita a lista inteira e salva de uma vez. Lista VAZIA é uma
 * escolha válida e significa "voltar às séries uniformes" — não é "não faça nada".
 */

export const workoutSetsSchema = z.object({
  workout_exercise_id: z.uuid("Exercício do treino inválido"),
  sets: z
    .array(
      z
        .object({
          set_type: z
            .enum(SET_TYPES)
            .optional()
            .transform((v) => v ?? "trabalho"),
          ...setTargets,
          is_warmup: z.boolean().optional().default(false),
          counts_in_volume: z.boolean().optional().default(true),
          notes: optionalText(500),
        })
        .refine(repsRangeCheck, repsRangeIssue),
    )
    .max(30, "No máximo 30 séries"),
});

/* ───────────────────────────── Alternativa dentro do treino ───────────────────────────── */

export const workoutAlternativeSchema = z.object({
  workout_exercise_id: z.uuid("Exercício do treino inválido"),
  alternative_exercise_id: z.uuid("Escolha o exercício alternativo"),
  note: optionalText(300),
});

/* ───────────────────────────── Planejamento ───────────────────────────── */

const scheduleEntryFields = z.object({
  scheduled_date: dateString,
  entry_kind: z
    .enum(SCHEDULE_ENTRY_KINDS)
    .optional()
    .transform((v) => v ?? "treino"),
  workout_id: optionalUuid,
  program_id: optionalUuid,
  title: optionalText(120),
  planned_time: optionalTime,
  planned_duration_minutes: optionalInt(600),
  notes: optionalText(1000),
});

const restHasNoWorkout = {
  message: "Um dia de descanso não tem treino",
  path: ["workout_id"],
};

export const scheduleEntrySchema = scheduleEntryFields.refine(
  (data) => data.entry_kind !== "descanso" || !data.workout_id,
  restHasNoWorkout,
);

export const scheduleEntryUpdateSchema = scheduleEntryFields
  .extend({ id: z.uuid("Dia planejado inválido") })
  .refine((data) => data.entry_kind !== "descanso" || !data.workout_id, restHasNoWorkout);

export const scheduleRescheduleSchema = z.object({
  id: z.uuid("Dia planejado inválido"),
  scheduled_date: dateString,
  reason: optionalText(300),
});

/**
 * Marcar desfecho. **"Concluído" não entra de propósito**: quem conclui um treino é a sessão
 * ao vivo (17-C). Deixar o usuário marcar "feito" aqui criaria histórico sem execução, e a
 * 17-D teria de reconciliar dois tipos de "concluído" que não significam a mesma coisa.
 */
export const scheduleOutcomeSchema = z.object({
  id: z.uuid("Dia planejado inválido"),
  status: z.enum(["planejado", "nao_realizado", "cancelado"]),
  reason: optionalText(300),
});

export const scheduleGenerateSchema = z
  .object({
    from: dateString,
    to: dateString,
    weekdays: z
      .array(z.coerce.number().int().min(0).max(6))
      .min(1, "Escolha ao menos um dia da semana")
      .max(7)
      .transform((v) => [...new Set(v)].sort((a, b) => a - b)),
    workout_ids: z.array(z.uuid()).max(14).optional().default([]),
    program_id: optionalUuid,
    week_interval: z.coerce.number().int().min(1).max(8).optional().default(1),
    include_rest_days: z.boolean().optional().default(false),
    planned_time: optionalTime,
    /** O que fazer quando o dia já tem algo: nunca sobrescrever em silêncio. */
    conflict: z.enum(["pular", "substituir"]).optional().default("pular"),
  })
  .refine((data) => data.to >= data.from, {
    message: "O fim não pode ser antes do início",
    path: ["to"],
  })
  .refine((data) => diffInDays(data.from, data.to) <= 366, {
    message: "Gere no máximo um ano por vez",
    path: ["to"],
  });

export const scheduleDuplicateWeekSchema = z.object({
  from_week: dateString,
  to_week: dateString,
  conflict: z.enum(["pular", "substituir"]).optional().default("pular"),
});

/** Dias inteiros entre duas datas puras. Local, para o schema não depender do módulo puro. */
function diffInDays(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

export type ProgramInput = z.infer<typeof programSchema>;
export type WorkoutInput = z.infer<typeof workoutSchema>;
export type WorkoutExerciseInput = z.infer<typeof workoutExerciseSchema>;
export type ScheduleEntryInput = z.infer<typeof scheduleEntrySchema>;
