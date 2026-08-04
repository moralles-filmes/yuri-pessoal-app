/**
 * Fase 17-D — Treinos · Schemas Zod do histórico, dos recordes e da progressão.
 *
 * Validação de SERVIDOR: as actions revalidam tudo que vem do client, e `user_id` não aparece
 * em nenhum schema — vem sempre de `auth.getUser()`.
 *
 * ⛔ **Todo schema usado com `zodResolver` tem de aceitar a PRÓPRIA SAÍDA.** O react-hook-form
 * entrega ao `onSubmit` a saída já transformada, o formulário manda isso para a action e a
 * action revalida com o mesmo schema — logo `parse(parse(x))` precisa funcionar. Por isso todo
 * campo opcional aceita `null` na entrada. Fixado em `src/lib/validators/round-trip.test.ts`.
 *
 * Duas escolhas de contrato que valem destacar:
 *
 *  • **Excluir sessão não tem valor padrão para a confirmação.** Esquecer o campo vira erro de
 *    validação, não exclusão silenciosa — a mesma disciplina de `deleteProgram` (17-B) e do
 *    descarte de sessão (17-C).
 *  • **A decisão sobre uma sugestão é explícita** (`aceitar` | `ignorar`), sem default. Nada de
 *    "aplicar por omissão".
 */
import { z } from "zod";
import { DIFFICULTY_LEVELS } from "@/lib/training/constants";
import { optionalText, optionalUuid } from "@/lib/validators/shared";

/** Número opcional aceitando vírgula (padrão BR); vazio/ausente/null vira null. */
const optionalNumber = (max: number, min = 0) =>
  z.preprocess(
    (v) => {
      if (v === "" || v === undefined || v === null) return null;
      if (typeof v === "string") return Number(v.replace(",", "."));
      return v;
    },
    z.coerce.number().finite("Valor inválido").min(min).max(max).nullable(),
  );

const optionalIntIn = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    z.coerce.number().int("Use um número inteiro").min(min).max(max).nullable(),
  );

/* ═══════════════════════════ Regra de progressão ═══════════════════════════ */

export const PROGRESSION_SCOPES = ["global", "grupo", "exercicio"] as const;
export const PROGRESSION_INCREMENT_MODES = ["incremento_minimo", "fixo", "percentual"] as const;

export const progressionRuleSchema = z
  .object({
    name: z.string().trim().min(1, "Informe um nome").max(120, "Máximo de 120 caracteres"),
    scope: z
      .enum(PROGRESSION_SCOPES)
      .optional()
      .transform((v) => v ?? "global"),
    exercise_id: optionalUuid,
    muscle_group_id: optionalUuid,

    /* Mínimo 2 — uma série isolada nunca gera sugestão. O banco também garante. */
    min_sessions: z.coerce
      .number()
      .int("Use um número inteiro")
      .min(2, "A avaliação precisa de pelo menos 2 sessões")
      .max(10, "No máximo 10 sessões")
      .optional()
      .transform((v) => v ?? 2),

    require_top_of_range: z.coerce.boolean().optional().transform((v) => v ?? true),
    require_all_working_sets: z.coerce.boolean().optional().transform((v) => v ?? true),
    require_no_failure: z.coerce.boolean().optional().transform((v) => v ?? true),

    max_rir: optionalIntIn(0, 10),
    max_rpe: optionalNumber(10, 1),
    max_difficulty: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z.enum(DIFFICULTY_LEVELS).nullable(),
    ),

    increment_mode: z
      .enum(PROGRESSION_INCREMENT_MODES)
      .optional()
      .transform((v) => v ?? "incremento_minimo"),
    increment_kg: optionalNumber(100, 0),
    increment_percent: optionalNumber(25, 0),

    is_active: z.coerce.boolean().optional().transform((v) => v ?? true),
    notes: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    if (value.scope === "exercicio" && !value.exercise_id) {
      ctx.addIssue({ code: "custom", path: ["exercise_id"], message: "Escolha o exercício" });
    }
    if (value.scope === "grupo" && !value.muscle_group_id) {
      ctx.addIssue({ code: "custom", path: ["muscle_group_id"], message: "Escolha o grupo muscular" });
    }
    if (value.increment_mode === "fixo" && (value.increment_kg === null || value.increment_kg <= 0)) {
      ctx.addIssue({ code: "custom", path: ["increment_kg"], message: "Informe o incremento em kg" });
    }
    if (
      value.increment_mode === "percentual" &&
      (value.increment_percent === null || value.increment_percent <= 0)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["increment_percent"],
        message: "Informe o percentual",
      });
    }
  });

export const progressionRuleUpdateSchema = z
  .object({ id: z.uuid("Regra inválida") })
  .and(progressionRuleSchema);

export const progressionRuleDeleteSchema = z.object({ id: z.uuid("Regra inválida") });

/* ═══════════════════════════ Decisão sobre a sugestão ═══════════════════════════ */

/**
 * Sem valor padrão de propósito: a decisão é do usuário, e a ausência dela é erro de
 * validação — nunca "aceitar por omissão".
 */
export const suggestionDecisionSchema = z.object({
  id: z.uuid("Sugestão inválida"),
  decision: z.enum(["aceitar", "ignorar"], { message: "Escolha aceitar ou ignorar" }),
  notes: optionalText(500),
});

export const generateSuggestionsSchema = z.object({
  /** Limita a geração a um exercício, quando o usuário pede da tela dele. */
  exercise_id: optionalUuid,
});

/* ═══════════════════════════ Recordes ═══════════════════════════ */

export const rebuildRecordsSchema = z.object({
  /** Quantos dias de histórico entram no recálculo. Padrão: tudo o que a leitura alcança. */
  days: optionalIntIn(1, 3650),
});

export const deleteRecordSchema = z.object({
  id: z.uuid("Recorde inválido"),
});

/* ═══════════════════════════ Exclusão de sessão ═══════════════════════════ */

/**
 * Excluir uma sessão do histórico.
 *
 * `confirm` **não tem valor padrão**: um cliente que esquecer o campo recebe erro de validação,
 * não uma exclusão. E excluir dispara o recálculo dos recordes afetados (a action cuida disso),
 * porque um recorde que dependia dessa sessão não pode sobreviver a ela.
 */
export const deleteSessionSchema = z.object({
  id: z.uuid("Treino inválido"),
  confirm: z.literal(true, { message: "Confirme a exclusão" }),
  reason: optionalText(500),
});

/* ═══════════════════════════ Preferências de leitura (17-D) ═══════════════════════════ */

export const metricsPreferencesSchema = z.object({
  unilateral_volume_rule: z.enum(["por_lado", "soma_dos_lados", "serie_completa"]),
  count_warmup_in_volume: z.coerce.boolean(),
  one_rm_formula: z.enum(["epley", "brzycki", "lombardi", "lander"]),
  progression_enabled: z.coerce.boolean(),
});

export type ProgressionRuleInput = z.infer<typeof progressionRuleSchema>;
export type SuggestionDecisionInput = z.infer<typeof suggestionDecisionSchema>;
