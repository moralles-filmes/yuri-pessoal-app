/**
 * Fase 17-C — Treinos · Schemas Zod da sessão ao vivo.
 *
 * Validação de SERVIDOR. `user_id` não aparece em nenhum schema — vem sempre de
 * `auth.getUser()`.
 *
 * ⛔ TRÊS COISAS QUE O CLIENTE NÃO ESCOLHE, DE PROPÓSITO:
 *
 * 1. **A identidade congelada.** Nome do exercício, tipo de acompanhamento e lateralidade são
 *    resolvidos no servidor contra o catálogo. O cliente manda o `exercise_id`; o snapshot é
 *    construído lá. Aceitar o nome pronto deixaria o histórico gravar qualquer coisa.
 * 2. **O status.** Quem muda estado é a máquina (`session-machine.ts`) a partir de uma AÇÃO
 *    ("pausar", "concluir"), não de um campo `status` enviado pela tela.
 * 3. **Os tempos.** `started_at`, `ended_at` e os totais nascem no servidor. Um relógio de
 *    celular adiantado não pode reescrever a duração do treino.
 *
 * `client_mutation_id` é a exceção que confirma a regra: ele PRECISA vir do dispositivo, porque
 * é justamente ele que faz o retry da fila convergir para uma linha só.
 */
import { z } from "zod";
import {
  DIFFICULTY_LEVELS,
  PLATE_KINDS,
  PREVIOUS_SOURCES,
  SESSION_ORIGINS,
  SET_TYPES,
  SUBSTITUTION_REASONS,
} from "@/lib/training/constants";
import { dateString, optionalText, optionalUuid } from "@/lib/validators/shared";

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

/** Escala de 1 a 5 (energia, disposição, sono, dor). Opcional — nada é obrigatório. */
const scale5 = optionalInt(5, 1);

/* ───────────────────────────── Preparação ─────────────────────────────
 * Etapa 2: o usuário revisa e ajusta TUDO antes de começar. Os ajustes valem só para a sessão
 * de hoje — o modelo não é tocado.
 */

const preparationSetSchema = z
  .object({
    set_type: z.enum(SET_TYPES).optional(),
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
    is_warmup: z.boolean().optional(),
    counts_in_volume: z.boolean().optional(),
    notes: optionalText(500),
  })
  .refine(
    (data) =>
      data.target_reps_min === null ||
      data.target_reps_max === null ||
      (data.target_reps_max as number) >= (data.target_reps_min as number),
    { message: "O máximo não pode ser menor que o mínimo", path: ["target_reps_max"] },
  );

export const preparationAdjustmentSchema = z.object({
  /** `workoutExerciseId` do modelo, ou o id temporário de um exercício acrescentado. */
  key: z.string().trim().min(1).max(80),
  include: z.boolean().optional(),
  position: optionalInt(200),
  superset_group: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().regex(/^[A-Z]$/, "Use uma letra de A a Z").nullable(),
  ),
  rest_seconds: optionalInt(3600),
  notes: optionalText(1000),
  sets: z.array(preparationSetSchema).max(30, "No máximo 30 séries").optional(),
});

/** Configuração geral da sessão, escolhida na preparação. */
const sessionSettings = {
  location_id: optionalUuid,
  default_rest_seconds: z.coerce.number().int().min(0).max(3600).optional(),
  auto_advance: z.enum(["automatico", "avisar", "nunca"]).optional(),
  sound_enabled: z.boolean().optional(),
  vibration_enabled: z.boolean().optional(),
  keep_screen_awake: z.boolean().optional(),
  weight_unit: z.enum(["kg", "lb"]).optional(),
  body_weight_kg: optionalNumber(500, "Peso corporal inválido"),
  energy_level: scale5,
  mood_level: scale5,
  sleep_quality: scale5,
  soreness_level: scale5,
  pre_notes: optionalText(2000),
};

/**
 * Criar a sessão (rascunho de preparação).
 *
 * A origem diz de onde o treino veio; `workout_id` é obrigatório para as origens que dependem
 * de um modelo, e `title` é obrigatório para o treino vazio — sem ele a sessão nasceria sem
 * nome nenhum no histórico.
 */
export const sessionCreateSchema = z
  .object({
    origin_kind: z.enum(SESSION_ORIGINS),
    workout_id: optionalUuid,
    scheduled_workout_id: optionalUuid,
    /** "Duplicar uma sessão passada": a fonte é uma sessão, não um modelo. */
    source_session_id: optionalUuid,
    title: optionalText(120),
    session_date: dateString.optional(),
    ...sessionSettings,
  })
  .refine(
    (data) =>
      !["modelo", "planejado", "recente", "favorito"].includes(data.origin_kind) ||
      Boolean(data.workout_id),
    { message: "Escolha o treino", path: ["workout_id"] },
  )
  .refine(
    (data) => data.origin_kind !== "duplicar" || Boolean(data.source_session_id),
    { message: "Escolha a sessão que quer duplicar", path: ["source_session_id"] },
  )
  .refine((data) => data.origin_kind !== "vazio" || Boolean(data.title), {
    message: "Dê um nome ao treino",
    path: ["title"],
  });

/** Atualizar a preparação (etapa 2). Vale só enquanto a sessão não começou. */
export const sessionPrepareSchema = z.object({
  id: z.uuid("Sessão inválida"),
  title: optionalText(120),
  ...sessionSettings,
  adjustments: z.array(preparationAdjustmentSchema).max(100).optional(),
});

/** Iniciar: é aqui que o snapshot é congelado. */
export const sessionStartSchema = z.object({
  id: z.uuid("Sessão inválida"),
  /** Confirmação explícita quando já existe outra sessão em execução. */
  discard_running: z.boolean().optional(),
});

/* ───────────────────────────── Registro de série ─────────────────────────────
 * `client_mutation_id` é obrigatório: é ele que faz clique duplo, retry da fila e duas abas
 * convergirem para uma linha só.
 */

export const setRecordSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  session_set_id: z.uuid("Série inválida"),
  client_mutation_id: z.uuid("Identificador de gravação inválido"),

  status: z.enum(["concluida", "falhou", "pulada", "pendente", "ativa", "cancelada"]),

  reps: optionalInt(1000),
  weight_kg: optionalNumber(2000, "Carga inválida"),
  additional_weight_kg: optionalNumber(2000, "Carga adicional inválida"),
  assistance_weight_kg: optionalNumber(2000, "Assistência inválida"),
  duration_seconds: optionalInt(86400),
  distance_m: optionalNumber(500000, "Distância inválida"),
  calories: optionalInt(20000),
  incline_percent: optionalNumber(100, "Inclinação inválida"),
  resistance_level: optionalNumber(100, "Resistência inválida"),

  reps_left: optionalInt(1000),
  reps_right: optionalInt(1000),
  weight_left_kg: optionalNumber(2000, "Carga inválida"),
  weight_right_kg: optionalNumber(2000, "Carga inválida"),

  rir: optionalInt(10),
  rpe: optionalNumber(10, "RPE inválido"),
  difficulty: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.enum(DIFFICULTY_LEVELS).nullable(),
  ),

  set_type: z.enum(SET_TYPES).optional(),
  is_warmup: z.boolean().optional(),
  counts_in_volume: z.boolean().optional(),
  notes: optionalText(500),

  /** Iniciar o descanso junto, com a duração que a tela mostrou. */
  start_rest: z.boolean().optional(),
  rest_seconds: optionalInt(3600),
});

/** Acrescentar uma série ao exercício (drop set, série extra). Sempre ANEXA. */
export const setAddSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  session_exercise_id: z.uuid("Exercício da sessão inválido"),
  client_mutation_id: z.uuid("Identificador de gravação inválido"),
  set_type: z.enum(SET_TYPES).optional(),
  is_warmup: z.boolean().optional(),
  counts_in_volume: z.boolean().optional(),
});

export const setDeleteSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  session_set_id: z.uuid("Série inválida"),
});

/* ───────────────────────────── Descanso ───────────────────────────── */

export const restStartSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  session_exercise_id: optionalUuid,
  session_set_id: optionalUuid,
  planned_seconds: z.coerce.number().int().min(0).max(3600),
  /** Comando explícito: iniciar descanso sem série concluída. */
  explicit: z.boolean().optional(),
});

export const restAdjustSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  delta_seconds: z.coerce.number().int().min(-3600).max(3600),
});

export const restEndSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  end_kind: z.enum(["natural", "pulado", "proxima_serie", "cancelado"]),
});

/* ───────────────────────────── Exercícios durante a sessão ───────────────────────────── */

export const exerciseReorderSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  ordered_ids: z.array(z.uuid()).min(1, "Nada para reordenar").max(200),
});

export const exerciseStatusSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  session_exercise_id: z.uuid("Exercício da sessão inválido"),
  status: z.enum(["pendente", "ativo", "pulado"]),
  reason: optionalText(300),
});

export const exerciseMoveSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  session_exercise_id: z.uuid("Exercício da sessão inválido"),
  mode: z.enum(["proximo", "fim", "cima", "baixo"]),
  current_exercise_id: optionalUuid,
});

/** Acrescentar um exercício que não estava no treino. O snapshot é montado no servidor. */
export const exerciseAddSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  exercise_id: z.uuid("Escolha o exercício"),
  sets: z.coerce.number().int().min(1).max(30).optional(),
  target_reps_min: optionalInt(1000),
  target_reps_max: optionalInt(1000),
  rest_seconds: optionalInt(3600),
});

/**
 * Substituir um exercício.
 *
 * O motivo é OBRIGATÓRIO e sem valor padrão: substituir é um registro, e um registro sem
 * motivo não explica nada seis meses depois. A tela deixa explícito que o sistema **não**
 * afirma equivalência entre os dois exercícios.
 */
export const exerciseSubstituteSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  session_exercise_id: z.uuid("Exercício da sessão inválido"),
  substitute_exercise_id: z.uuid("Escolha o exercício substituto"),
  reason: z.enum(SUBSTITUTION_REASONS, { message: "Escolha o motivo da substituição" }),
  reason_notes: optionalText(500),
  /** Manter as séries planejadas do original no substituto. */
  keep_planned_sets: z.boolean().optional(),
});

/* ───────────────────────────── Ciclo de vida ───────────────────────────── */

export const sessionPauseSchema = z.object({
  id: z.uuid("Sessão inválida"),
  reason: optionalText(300),
});

export const sessionResumeSchema = z.object({ id: z.uuid("Sessão inválida") });

/**
 * Finalizar com revisão.
 *
 * `confirm_active_sets` é o "sim, finalize mesmo com série em andamento" — sem valor padrão,
 * para nunca ser assumido.
 */
export const sessionFinishSchema = z.object({
  id: z.uuid("Sessão inválida"),
  rating: optionalInt(5, 1),
  perceived_effort: optionalInt(10, 1),
  notes: optionalText(2000),
  felt_pain: z.boolean().optional(),
  pain_notes: optionalText(1000),
  confirm_active_sets: z.boolean().optional(),
});

/**
 * Encerrar sem concluir.
 *
 * Abandonar preserva o registro; cancelar/descartar apaga a sessão. Por isso `confirm` não tem
 * valor padrão: "nada é encerrado em silêncio" começa no schema.
 */
export const sessionAbandonSchema = z.object({
  id: z.uuid("Sessão inválida"),
  mode: z.enum(["abandonar", "descartar"], {
    message: "Escolha entre guardar o que foi feito ou descartar o treino",
  }),
  confirm: z.literal(true, { message: "Confirme a ação" }),
  reason: optionalText(300),
});

export const sessionReopenSchema = z.object({
  id: z.uuid("Sessão inválida"),
  confirm: z.literal(true, { message: "Confirme a reabertura" }),
});

/* ───────────────────────────── Locais e anilhas ───────────────────────────── */

export const locationSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome").max(120, "Máximo de 120 caracteres"),
  notes: optionalText(1000),
  is_default: z.boolean().optional(),
});

export const locationUpdateSchema = locationSchema.extend({ id: z.uuid("Local inválido") });

export const platesSchema = z.object({
  location_id: z.uuid("Local inválido"),
  plates: z
    .array(
      z.object({
        kind: z.enum(PLATE_KINDS),
        weight_kg: z.coerce.number().positive("Informe um peso").max(1000),
        quantity: z.coerce.number().int().min(0).max(200),
        notes: optionalText(200),
      }),
    )
    .max(60, "No máximo 60 itens"),
});

/* ───────────────────────────── Consultas ───────────────────────────── */

export const previousSourceSchema = z.object({
  session_id: z.uuid("Sessão inválida"),
  source: z.enum(PREVIOUS_SOURCES),
});

export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
export type SetRecordInput = z.infer<typeof setRecordSchema>;
export type PreparationAdjustmentInput = z.infer<typeof preparationAdjustmentSchema>;
