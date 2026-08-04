/**
 * Fase 17-D — Treinos · SUGESTÃO DE PROGRESSÃO (PURO, sem I/O, sem `Date.now()`).
 *
 * ═══════════════════════ O QUE ESTE ARQUIVO NÃO FAZ ═══════════════════════
 *
 * Não prescreve treino, não diagnostica, não promete resultado e **não sugere carga máxima**.
 * Ele confere uma condição que o PRÓPRIO USUÁRIO escreveu ("quando eu fechar o topo da faixa em
 * todas as séries de trabalho, duas sessões seguidas, sem falha e sem dor") e monta uma frase
 * explicando o que viu. A decisão continua inteira com ele: aceitar, ignorar ou desligar.
 *
 * ═══════════════════════ QUATRO TRAVAS QUE NÃO SÃO PREFERÊNCIA ═══════════════════════
 *
 *  1. **Uma série isolada nunca gera sugestão.** A avaliação é sobre as últimas N sessões
 *     (N ≥ 2, garantido também por CHECK no banco).
 *  2. **Dor registrada bloqueia.** Se `felt_pain` está marcado em qualquer sessão avaliada, não
 *     sai sugestão de aumento — e a mensagem é neutra, sem diagnóstico e sem alarmismo.
 *  3. **Progressão desligada não gera nada** (`training_preferences.progression_enabled`).
 *  4. **O incremento é o menor salto REALIZÁVEL** daquele exercício (`resolveIncrementKg`,
 *     17-A). Sugerir +1 kg numa máquina de placas de 5 em 5 é sugerir o impossível.
 *
 * A sugestão nasce `pendente` e só muda o modelo (17-B) quando o usuário aceita.
 */
import type { DifficultyLevel, SessionSetStatus, TrackingType } from "./constants";
import { DIFFICULTY_LEVELS } from "./constants";
import { isSetDone } from "./session-machine";
import { snapToIncrement } from "./tracking";

/* ═══════════════════════════ Entradas ═══════════════════════════ */

export type ProgressionScope = "global" | "grupo" | "exercicio";
export type ProgressionIncrementMode = "incremento_minimo" | "fixo" | "percentual";

export type ProgressionRule = {
  id: string;
  name: string;
  scope: ProgressionScope;
  exerciseId: string | null;
  muscleGroupId: string | null;
  /** Nunca menor que 2 — o banco também garante. */
  minSessions: number;
  requireTopOfRange: boolean;
  requireAllWorkingSets: boolean;
  requireNoFailure: boolean;
  maxRir: number | null;
  maxRpe: number | null;
  maxDifficulty: DifficultyLevel | null;
  incrementMode: ProgressionIncrementMode;
  incrementKg: number | null;
  incrementPercent: number | null;
  isActive: boolean;
};

export const DEFAULT_PROGRESSION_RULE: Omit<ProgressionRule, "id" | "exerciseId" | "muscleGroupId"> = {
  name: "Progressão padrão",
  scope: "global",
  minSessions: 2,
  requireTopOfRange: true,
  requireAllWorkingSets: true,
  requireNoFailure: true,
  maxRir: null,
  maxRpe: null,
  maxDifficulty: "adequada",
  incrementMode: "incremento_minimo",
  incrementKg: null,
  incrementPercent: null,
  isActive: true,
};

/** Uma série avaliada. Só o que a regra precisa olhar. */
export type ProgressionSet = {
  setNumber: number;
  status: SessionSetStatus;
  isWarmup: boolean;
  reps: number | null;
  weightKg: number | null;
  /** O topo da faixa PLANEJADA para aquela série (congelado na sessão). */
  plannedRepsMax: number | null;
  plannedRepsMin: number | null;
  plannedWeightKg: number | null;
  rir: number | null;
  rpe: number | null;
  difficulty: DifficultyLevel | null;
};

export type ProgressionSession = {
  sessionId: string;
  /** Data PURA, para ordenar sem fuso. */
  sessionDate: string;
  /** Dor registrada na sessão. Bloqueia qualquer sugestão de aumento. */
  feltPain: boolean;
  sets: ProgressionSet[];
};

export type ProgressionTarget = {
  exerciseId: string | null;
  exerciseName: string;
  trackingType: TrackingType;
  /** Menor salto realizável, já resolvido por `resolveIncrementKg` (17-A). */
  incrementKg: number;
  workoutId?: string | null;
  workoutName?: string | null;
  workoutExerciseId?: string | null;
};

/* ═══════════════════════════ Saída ═══════════════════════════ */

export type ProgressionBlock =
  | "recurso_desativado"
  | "regra_inativa"
  | "sem_regra"
  | "poucas_sessoes"
  | "dor_registrada"
  | "faixa_nao_atingida"
  | "falha_registrada"
  | "dificuldade_alta"
  | "sem_carga_registrada"
  | "tipo_nao_suportado";

export const PROGRESSION_BLOCK_MESSAGES: Record<ProgressionBlock, string> = {
  recurso_desativado: "As sugestões de progressão estão desligadas nas configurações do módulo.",
  regra_inativa: "A regra de progressão que se aplica a este exercício está desativada.",
  sem_regra: "Nenhuma regra de progressão se aplica a este exercício.",
  poucas_sessoes:
    "Ainda não há sessões suficientes para comparar. Uma série isolada não indica tendência.",
  dor_registrada:
    "Você registrou dor em uma das últimas sessões. Nenhuma sugestão de aumento de carga é feita nesse caso — se a dor persistir, vale procurar orientação profissional.",
  faixa_nao_atingida: "O topo da faixa de repetições ainda não foi alcançado em todas as sessões avaliadas.",
  falha_registrada: "Houve série registrada como falha nas sessões avaliadas.",
  dificuldade_alta: "A dificuldade registrada ficou acima do limite definido na regra.",
  sem_carga_registrada: "As últimas sessões não têm carga registrada para comparar.",
  tipo_nao_suportado:
    "Este exercício não é medido em carga, então não há incremento de carga a sugerir.",
};

export type ProgressionSuggestion = {
  exerciseId: string | null;
  exerciseName: string;
  kind: "carga";
  previousValue: number;
  suggestedValue: number;
  unit: "kg";
  /** O texto em pt-BR que a tela exibe. Nunca uma fórmula crua. */
  reason: string;
  ruleId: string;
  ruleName: string;
  workoutId: string | null;
  workoutName: string | null;
  workoutExerciseId: string | null;
  /** Congelado junto da sugestão — a justificativa não muda depois. */
  basis: {
    sessions: { sessionId: string; sessionDate: string; reps: number[]; weightKg: number | null }[];
    incrementKg: number;
    rule: string;
  };
  /** Determinística: mesma proposta = mesma chave (não reaparece depois de ignorada). */
  dedupeKey: string;
};

export type ProgressionEvaluation =
  | { suggest: true; suggestion: ProgressionSuggestion }
  | { suggest: false; block: ProgressionBlock; message: string };

const round3 = (value: number): number => Number(value.toFixed(3));

/* ═══════════════════════════ Resolução da regra ═══════════════════════════ */

/**
 * Qual regra vale para este exercício — do MAIS específico para o mais geral.
 *
 * Mesmo desenho do escopo de metas da Dieta (16-B) e da resolução de descanso/incremento da
 * 17-A: exercício vence grupo, que vence global. Regra inativa não "cai" para a de cima; ela
 * desliga a progressão daquele alvo, que é o que o usuário quis dizer ao desativá-la.
 */
export function resolveRule(
  rules: ProgressionRule[],
  target: { exerciseId: string | null; muscleGroupId: string | null },
): ProgressionRule | null {
  const byExercise = rules.find(
    (rule) => rule.scope === "exercicio" && rule.exerciseId && rule.exerciseId === target.exerciseId,
  );
  if (byExercise) return byExercise;

  const byGroup = rules.find(
    (rule) =>
      rule.scope === "grupo" && rule.muscleGroupId && rule.muscleGroupId === target.muscleGroupId,
  );
  if (byGroup) return byGroup;

  return rules.find((rule) => rule.scope === "global") ?? null;
}

/* ═══════════════════════════ Avaliação ═══════════════════════════ */

const difficultyRank = (level: DifficultyLevel): number => DIFFICULTY_LEVELS.indexOf(level);

/** Séries de trabalho efetivamente feitas (aquecimento e não-feitas ficam de fora). */
const workingSets = (session: ProgressionSession): ProgressionSet[] =>
  session.sets.filter((set) => isSetDone(set.status) && !set.isWarmup);

function incrementFor(rule: ProgressionRule, target: ProgressionTarget, currentWeight: number): number {
  switch (rule.incrementMode) {
    case "fixo":
      return rule.incrementKg ?? target.incrementKg;
    case "percentual": {
      const percent = rule.incrementPercent ?? 0;
      const raw = (currentWeight * percent) / 100;
      // Mesmo em percentual, a carga sugerida precisa ser MONTÁVEL no equipamento.
      return Math.max(target.incrementKg, snapToIncrement(raw, target.incrementKg));
    }
    default:
      return target.incrementKg;
  }
}

const listOf = (values: number[]): string => values.join("/");

/**
 * Avalia a regra sobre as últimas sessões daquele exercício.
 *
 * `sessions` deve vir da MAIS RECENTE para a mais antiga (a função reordena por data pura, mas
 * aceita qualquer ordem). Nenhuma chamada a `Date.now()`: a data de emissão é injetada.
 */
export function evaluateProgression(input: {
  rule: ProgressionRule | null;
  target: ProgressionTarget;
  sessions: ProgressionSession[];
  /** `training_preferences.progression_enabled` (17-A). Desligado = nada acontece. */
  enabled: boolean;
}): ProgressionEvaluation {
  const { rule, target, sessions, enabled } = input;

  const refuse = (block: ProgressionBlock): ProgressionEvaluation => ({
    suggest: false,
    block,
    message: PROGRESSION_BLOCK_MESSAGES[block],
  });

  if (!enabled) return refuse("recurso_desativado");
  if (!rule) return refuse("sem_regra");
  if (!rule.isActive) return refuse("regra_inativa");

  // Só exercícios medidos em carga têm "aumentar o peso" como sugestão possível.
  const supported: TrackingType[] = [
    "peso_reps",
    "peso_corporal_adicional",
    "isometria",
    "lado_a_lado",
  ];
  if (!supported.includes(target.trackingType)) return refuse("tipo_nao_suportado");

  const ordered = [...sessions].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
  const considered = ordered.slice(0, Math.max(2, rule.minSessions));

  if (considered.length < Math.max(2, rule.minSessions)) return refuse("poucas_sessoes");

  // ⛔ Dor vem ANTES de qualquer outra avaliação: nenhuma condição atendida a contorna.
  if (considered.some((session) => session.feltPain)) return refuse("dor_registrada");

  const basisSessions: ProgressionSuggestion["basis"]["sessions"] = [];
  let currentWeight: number | null = null;

  for (const session of considered) {
    const sets = workingSets(session);
    if (sets.length === 0) return refuse("poucas_sessoes");

    if (rule.requireNoFailure) {
      const failed = session.sets.some(
        (set) => set.status === "falhou" || set.difficulty === "falha",
      );
      if (failed) return refuse("falha_registrada");
    }

    const weights = sets.map((set) => set.weightKg).filter((weight): weight is number => weight !== null);
    if (weights.length === 0) return refuse("sem_carga_registrada");

    // A carga de referência é a MAIOR série de trabalho da sessão mais recente.
    const sessionWeight = Math.max(...weights);
    if (currentWeight === null) currentWeight = sessionWeight;

    if (rule.requireTopOfRange) {
      const evaluated = rule.requireAllWorkingSets ? sets : [sets[0]];
      const reachedTop = evaluated.every((set) => {
        const top = set.plannedRepsMax ?? set.plannedRepsMin;
        if (top === null || top === undefined) return false;
        return (set.reps ?? 0) >= top;
      });
      if (!reachedTop) return refuse("faixa_nao_atingida");
    }

    if (rule.maxRir !== null) {
      const withinRir = sets.every((set) => set.rir === null || set.rir <= (rule.maxRir as number));
      if (!withinRir) return refuse("dificuldade_alta");
    }
    if (rule.maxRpe !== null) {
      const withinRpe = sets.every((set) => set.rpe === null || set.rpe <= (rule.maxRpe as number));
      if (!withinRpe) return refuse("dificuldade_alta");
    }
    if (rule.maxDifficulty !== null) {
      const limit = difficultyRank(rule.maxDifficulty);
      const withinDifficulty = sets.every(
        (set) => set.difficulty === null || difficultyRank(set.difficulty) <= limit,
      );
      if (!withinDifficulty) return refuse("dificuldade_alta");
    }

    basisSessions.push({
      sessionId: session.sessionId,
      sessionDate: session.sessionDate,
      reps: sets.map((set) => set.reps ?? 0),
      weightKg: sessionWeight,
    });
  }

  if (currentWeight === null) return refuse("sem_carga_registrada");

  const increment = incrementFor(rule, target, currentWeight);
  const suggested = round3(currentWeight + increment);

  const reason = buildReason(considered, basisSessions, increment);
  const previousValue = round3(currentWeight);

  return {
    suggest: true,
    suggestion: {
      exerciseId: target.exerciseId,
      exerciseName: target.exerciseName,
      kind: "carga",
      previousValue,
      suggestedValue: suggested,
      unit: "kg",
      reason,
      ruleId: rule.id,
      ruleName: rule.name,
      workoutId: target.workoutId ?? null,
      workoutName: target.workoutName ?? null,
      workoutExerciseId: target.workoutExerciseId ?? null,
      basis: { sessions: basisSessions, incrementKg: increment, rule: rule.name },
      dedupeKey: progressionDedupeKey({
        exerciseId: target.exerciseId,
        exerciseName: target.exerciseName,
        kind: "carga",
        previousValue,
        suggestedValue: suggested,
      }),
    },
  };
}

/**
 * O motivo em pt-BR.
 *
 * Descreve o FATO observado ("nas 2 últimas sessões você fez 12/12/12 com RIR 2 e sem dor") e o
 * que a regra propõe. Nenhuma frase daqui parabeniza, cobra, promete resultado ou afirma que a
 * carga nova é segura.
 */
function buildReason(
  sessions: ProgressionSession[],
  basis: ProgressionSuggestion["basis"]["sessions"],
  incrementKg: number,
): string {
  const count = basis.length;
  const repsPart = basis.map((session) => listOf(session.reps)).join(" e ");

  const rirs = sessions
    .flatMap((session) => workingSets(session).map((set) => set.rir))
    .filter((rir): rir is number => rir !== null);
  const difficulties = sessions
    .flatMap((session) => workingSets(session).map((set) => set.difficulty))
    .filter((level): level is DifficultyLevel => level !== null);

  const effortParts: string[] = [];
  if (rirs.length > 0) {
    const maxRir = Math.max(...rirs);
    const minRir = Math.min(...rirs);
    effortParts.push(minRir === maxRir ? `com RIR ${maxRir}` : `com RIR entre ${minRir} e ${maxRir}`);
  } else if (difficulties.length > 0) {
    const worst = difficulties.reduce((a, b) => (difficultyRank(a) >= difficultyRank(b) ? a : b));
    const labels: Record<DifficultyLevel, string> = {
      facil: "com dificuldade fácil",
      adequada: "com dificuldade adequada",
      dificil: "com dificuldade difícil",
      muito_dificil: "com dificuldade muito difícil",
      falha: "com série até a falha",
    };
    effortParts.push(labels[worst]);
  }

  const formatted = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });

  return [
    `Nas ${count} últimas sessões deste exercício você fez ${repsPart}`,
    effortParts.length > 0 ? ` ${effortParts.join(" ")}` : "",
    " e sem dor registrada. Pela sua regra, o próximo passo seria somar ",
    `${formatted.format(incrementKg)} kg à carga. Você decide se aplica.`,
  ].join("");
}

/** Chave de deduplicação: a mesma proposta não reaparece depois de ignorada. */
export function progressionDedupeKey(input: {
  exerciseId: string | null;
  exerciseName: string;
  kind: string;
  previousValue: number | null;
  suggestedValue: number;
}): string {
  const scope = input.exerciseId
    ? `id:${input.exerciseId}`
    : `nome:${input.exerciseName.trim().toLowerCase()}`;
  const previous = input.previousValue === null ? "" : input.previousValue.toFixed(3);
  return `${scope}|${input.kind}|${previous}|${input.suggestedValue.toFixed(3)}`;
}

/* ═══════════════════════════ Decisão ═══════════════════════════ */

export type SuggestionStatus = "pendente" | "aceita" | "ignorada" | "expirada";

export const SUGGESTION_STATUS_LABELS: Record<SuggestionStatus, string> = {
  pendente: "Aguardando sua decisão",
  aceita: "Aceita",
  ignorada: "Ignorada",
  expirada: "Expirada",
};

export const asSuggestionStatus = (value: string | null | undefined): SuggestionStatus =>
  (["pendente", "aceita", "ignorada", "expirada"] as const).includes(value as SuggestionStatus)
    ? (value as SuggestionStatus)
    : "pendente";

/**
 * A sugestão ainda faz sentido?
 *
 * Se a carga planejada do modelo já mudou (o usuário subiu na mão, ou aceitou outra sugestão),
 * a proposta virou passado: expira em vez de aplicar por cima do que ele decidiu depois.
 */
export function isSuggestionStale(
  suggestion: { previousValue: number | null; suggestedValue: number },
  currentPlannedWeightKg: number | null,
): boolean {
  if (currentPlannedWeightKg === null) return false;
  if (suggestion.previousValue === null) return false;
  return Math.abs(currentPlannedWeightKg - suggestion.previousValue) > 0.001;
}

/** Rótulo curto para a lista: "62,5 kg → 65 kg". */
export function suggestionDeltaLabel(
  previousValue: number | null,
  suggestedValue: number,
  unit: string,
): string {
  const formatted = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  if (previousValue === null) return `${formatted.format(suggestedValue)} ${unit}`;
  return `${formatted.format(previousValue)} ${unit} → ${formatted.format(suggestedValue)} ${unit}`;
}
