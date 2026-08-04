/**
 * Fase 17-E — Treinos · Schemas Zod das metas (validação de SERVIDOR).
 *
 * `user_id` não aparece em schema nenhum: vem sempre de `auth.getUser()` na action. É a
 * proteção contra mass assignment que o projeto adota desde a Fase 02.
 *
 * ⛔ **TODO SCHEMA USADO COM `zodResolver` TEM DE ACEITAR A PRÓPRIA SAÍDA.** O react-hook-form
 * entrega ao `onSubmit` a saída já transformada, o formulário manda isso para a action e a
 * action revalida com o MESMO schema — logo `parse(parse(x))` precisa funcionar. Por isso todo
 * campo opcional aceita `null` na ENTRADA, e não só `""`/ausente. Fixado em
 * `src/lib/validators/round-trip.test.ts`.
 *
 * ══ O QUE FICA DE FORA DE PROPÓSITO ══
 * • O STATUS DERIVADO (`atingida`, `expirada`, `em_atraso`). Não é gravável — nasce de valor
 *   × alvo × prazo na leitura. O CHECK da migration também o recusa.
 * • O VALOR ATUAL da meta. Ele é calculado a partir de `metrics.ts` e das medidas corporais;
 *   aceitá-lo do cliente permitiria "atingir" uma meta digitando o número. A única exceção é
 *   a meta PERSONALIZADA, cujo valor o usuário registra à mão por definição.
 */
import { z } from "zod";
import {
  GOAL_DIRECTIONS,
  GOAL_KINDS,
  GOAL_METRICS,
  GOAL_PERIODS,
  GOAL_STATUSES,
  METRICS_BY_KIND,
  METRICS_REQUIRING_EXERCISE,
} from "@/lib/training/goals";
import { dateString, optionalDate, optionalText, optionalUuid } from "@/lib/validators/shared";

/** Número opcional aceitando vírgula (padrão BR); vazio/ausente/null vira null — NUNCA 0. */
const optionalNumber = (max: number, min = -max) =>
  z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return null;
      if (typeof v === "string") return Number(v.replace(/\./g, "").replace(",", "."));
      return v;
    },
    z.coerce.number().finite("Valor inválido").min(min).max(max).nullable(),
  );

const requiredNumber = (max: number, min = -max) =>
  z.preprocess(
    (v) => {
      if (typeof v === "string") return Number(v.replace(/\./g, "").replace(",", "."));
      return v;
    },
    z.coerce
      .number({ message: "Informe o valor-alvo" })
      .finite("Valor inválido")
      .min(min)
      .max(max),
  );

/**
 * Um marco intermediário.
 *
 * `label` e `dueOn` aceitam `null` na entrada pelo mesmo motivo dos demais opcionais: o
 * formulário devolve a saída transformada e ela precisa passar de novo.
 */
export const goalMilestoneSchema = z.object({
  value: requiredNumber(1_000_000),
  label: optionalText(80),
  due_on: optionalDate,
});

export const trainingGoalSchema = z
  .object({
    name: z.string().trim().min(1, "Dê um nome para a meta").max(120, "Máximo de 120 caracteres"),
    description: optionalText(1000),

    goal_kind: z.enum(GOAL_KINDS, { message: "Escolha o tipo de meta" }),
    metric: z.enum(GOAL_METRICS, { message: "Escolha o que a meta acompanha" }),

    exercise_id: optionalUuid,
    muscle_group_id: optionalUuid,
    program_id: optionalUuid,
    body_measurement_type_id: optionalUuid,

    direction: z
      .enum(GOAL_DIRECTIONS)
      .optional()
      .transform((v) => v ?? "aumentar"),

    period: z.enum(GOAL_PERIODS, { message: "Escolha o período" }),
    starts_on: dateString,
    ends_on: optionalDate,

    /* NULO = "use o primeiro valor observado". Um 0 aqui inventaria um ponto de partida. */
    start_value: optionalNumber(1_000_000),
    target_value: requiredNumber(1_000_000),
    unit: z.string().trim().max(20, "Máximo de 20 caracteres").optional().transform((v) => v ?? ""),

    milestones: z
      .array(goalMilestoneSchema)
      .max(10, "No máximo 10 marcos")
      .optional()
      .transform((v) => v ?? []),

    /* Só o que o usuário decide. Os derivados não estão nesta lista nem no CHECK do banco. */
    status: z
      .enum(GOAL_STATUSES)
      .optional()
      .transform((v) => v ?? "ativa"),

    notes: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    // A métrica precisa pertencer à família escolhida — a mesma matriz de `goals.ts`.
    if (!METRICS_BY_KIND[value.goal_kind].includes(value.metric)) {
      ctx.addIssue({
        code: "custom",
        path: ["metric"],
        message: "Essa medição não pertence ao tipo de meta escolhido",
      });
    }
    if (METRICS_REQUIRING_EXERCISE.includes(value.metric) && !value.exercise_id) {
      ctx.addIssue({ code: "custom", path: ["exercise_id"], message: "Escolha o exercício" });
    }
    if (value.metric === "series_grupo_muscular" && !value.muscle_group_id) {
      ctx.addIssue({
        code: "custom",
        path: ["muscle_group_id"],
        message: "Escolha o grupo muscular",
      });
    }
    if (value.metric === "medida_corporal" && !value.body_measurement_type_id) {
      ctx.addIssue({
        code: "custom",
        path: ["body_measurement_type_id"],
        message: "Escolha a medida corporal",
      });
    }
    if (value.period === "personalizado" && !value.ends_on) {
      ctx.addIssue({
        code: "custom",
        path: ["ends_on"],
        message: "Um período personalizado precisa de data final",
      });
    }
    if (value.ends_on && value.ends_on < value.starts_on) {
      ctx.addIssue({
        code: "custom",
        path: ["ends_on"],
        message: "A data final não pode ser antes do início",
      });
    }
    if (value.unit.length === 0) {
      ctx.addIssue({ code: "custom", path: ["unit"], message: "Informe a unidade" });
    }
  });

export const trainingGoalUpdateSchema = z
  .object({ id: z.uuid("Meta inválida") })
  .and(trainingGoalSchema);

/**
 * Mudança de situação.
 *
 * Sem valor padrão: a decisão é do usuário. Note que `atingida` e `expirada` NÃO estão aqui —
 * quem os produz é a leitura, e gravá-los criaria uma segunda verdade.
 */
export const trainingGoalStatusSchema = z.object({
  id: z.uuid("Meta inválida"),
  status: z.enum(["ativa", "pausada", "concluida", "cancelada"], {
    message: "Escolha a nova situação",
  }),
  note: optionalText(500),
});

/**
 * Exclusão. `confirm` **não tem valor padrão** de propósito: um cliente que esquecer o campo
 * recebe erro de validação, não uma exclusão silenciosa. Mesma disciplina de `deleteProgram`
 * (17-B) e de `deleteTrainingSession` (17-D).
 */
export const trainingGoalDeleteSchema = z.object({
  id: z.uuid("Meta inválida"),
  confirm: z.literal(true, { message: "Confirme a exclusão" }),
});

/**
 * Registro manual de progresso — só faz sentido na meta PERSONALIZADA, e a action confere
 * isso: aceitar um valor digitado numa meta de volume permitiria "atingir" a meta sem treinar.
 */
export const goalProgressEntrySchema = z.object({
  goal_id: z.uuid("Meta inválida"),
  recorded_on: dateString,
  value: requiredNumber(1_000_000),
  note: optionalText(500),
});

export type TrainingGoalInput = z.infer<typeof trainingGoalSchema>;
export type GoalMilestoneInput = z.infer<typeof goalMilestoneSchema>;
export type GoalProgressEntryInput = z.infer<typeof goalProgressEntrySchema>;
