/**
 * Fase 17-D — Testes de `progression.ts`.
 *
 * O teste mais importante do arquivo é o que garante que **dor registrada bloqueia**: nenhuma
 * combinação de condições atendidas pode produzir uma sugestão de aumento nesse caso.
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROGRESSION_RULE,
  evaluateProgression,
  isSuggestionStale,
  progressionDedupeKey,
  resolveRule,
  suggestionDeltaLabel,
  type ProgressionRule,
  type ProgressionSession,
  type ProgressionSet,
  type ProgressionTarget,
} from "./progression";

function makeRule(overrides: Partial<ProgressionRule> = {}): ProgressionRule {
  return {
    id: "rule-1",
    exerciseId: null,
    muscleGroupId: null,
    ...DEFAULT_PROGRESSION_RULE,
    ...overrides,
  };
}

function makeSet(overrides: Partial<ProgressionSet> = {}): ProgressionSet {
  return {
    setNumber: 1,
    status: "concluida",
    isWarmup: false,
    reps: 12,
    weightKg: 60,
    plannedRepsMin: 8,
    plannedRepsMax: 12,
    plannedWeightKg: 60,
    rir: 2,
    rpe: null,
    difficulty: "adequada",
    ...overrides,
  };
}

function makeSession(overrides: Partial<ProgressionSession> = {}): ProgressionSession {
  return {
    sessionId: "s-1",
    sessionDate: "2026-08-03",
    feltPain: false,
    sets: [
      makeSet({ setNumber: 1 }),
      makeSet({ setNumber: 2 }),
      makeSet({ setNumber: 3 }),
    ],
    ...overrides,
  };
}

const target: ProgressionTarget = {
  exerciseId: "cat-supino",
  exerciseName: "Supino reto com barra",
  trackingType: "peso_reps",
  incrementKg: 2.5,
  workoutId: "w-1",
  workoutName: "Treino A",
  workoutExerciseId: "we-1",
};

const twoGoodSessions = (): ProgressionSession[] => [
  makeSession({ sessionId: "s-1", sessionDate: "2026-08-03" }),
  makeSession({ sessionId: "s-2", sessionDate: "2026-08-06" }),
];

const evaluate = (overrides: {
  rule?: ProgressionRule | null;
  sessions?: ProgressionSession[];
  enabled?: boolean;
  target?: ProgressionTarget;
} = {}) =>
  evaluateProgression({
    rule: overrides.rule === undefined ? makeRule() : overrides.rule,
    target: overrides.target ?? target,
    sessions: overrides.sessions ?? twoGoodSessions(),
    enabled: overrides.enabled ?? true,
  });

/* ═══════════════════════════ Condição satisfeita ═══════════════════════════ */

describe("condição satisfeita gera sugestão", () => {
  it("soma o incremento mínimo do exercício à carga atual", () => {
    const result = evaluate();
    expect(result.suggest).toBe(true);
    if (!result.suggest) return;
    expect(result.suggestion.previousValue).toBe(60);
    expect(result.suggestion.suggestedValue).toBe(62.5);
    expect(result.suggestion.unit).toBe("kg");
  });

  it("o motivo é legível, cita o que foi feito e diz que a decisão é do usuário", () => {
    const result = evaluate();
    if (!result.suggest) throw new Error("esperava sugestão");
    expect(result.suggestion.reason).toContain("2 últimas sessões");
    expect(result.suggestion.reason).toContain("12/12/12");
    expect(result.suggestion.reason).toContain("RIR 2");
    expect(result.suggestion.reason).toContain("sem dor registrada");
    expect(result.suggestion.reason).toContain("Você decide");
    // Nenhuma promessa nem ordem.
    expect(result.suggestion.reason).not.toMatch(/deve |precisa |garantid|máxim/i);
  });

  it("a base fica congelada com as sessões consideradas", () => {
    const result = evaluate();
    if (!result.suggest) throw new Error("esperava sugestão");
    expect(result.suggestion.basis.sessions).toHaveLength(2);
    expect(result.suggestion.basis.sessions[0].sessionId).toBe("s-2"); // a mais recente primeiro
    expect(result.suggestion.basis.incrementKg).toBe(2.5);
  });

  it("incremento fixo e percentual respeitam o salto realizável", () => {
    const fixo = evaluate({ rule: makeRule({ incrementMode: "fixo", incrementKg: 5 }) });
    expect(fixo.suggest && fixo.suggestion.suggestedValue).toBe(65);

    // 5% de 60 = 3 kg → arredondado para o múltiplo de 2,5 mais próximo (2,5).
    const percentual = evaluate({
      rule: makeRule({ incrementMode: "percentual", incrementPercent: 5 }),
    });
    expect(percentual.suggest && percentual.suggestion.suggestedValue).toBe(62.5);
  });
});

/* ═══════════════════════════ Bloqueios ═══════════════════════════ */

describe("bloqueios", () => {
  it("⛔ DOR REGISTRADA bloqueia mesmo com todo o resto perfeito", () => {
    const sessions = twoGoodSessions();
    sessions[1].feltPain = true;

    const result = evaluate({ sessions });
    expect(result.suggest).toBe(false);
    if (result.suggest) return;
    expect(result.block).toBe("dor_registrada");
    expect(result.message).toContain("Nenhuma sugestão de aumento");
    // A mensagem é neutra: sem diagnóstico, sem alarme.
    expect(result.message).not.toMatch(/lesão|pare|grave|perigo/i);
  });

  it("uma série isolada (uma sessão) NÃO gera sugestão", () => {
    const result = evaluate({ sessions: [makeSession()] });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("poucas_sessoes");
  });

  it("recurso desativado não gera nada", () => {
    const result = evaluate({ enabled: false });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("recurso_desativado");
  });

  it("regra inativa não gera nada", () => {
    const result = evaluate({ rule: makeRule({ isActive: false }) });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("regra_inativa");
  });

  it("sem regra aplicável, nada acontece", () => {
    const result = evaluate({ rule: null });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("sem_regra");
  });

  it("topo da faixa não atingido em TODAS as séries bloqueia", () => {
    const sessions = twoGoodSessions();
    sessions[0].sets[2] = makeSet({ setNumber: 3, reps: 9 });

    const result = evaluate({ sessions });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("faixa_nao_atingida");
  });

  it("com `requireAllWorkingSets` desligado, basta a primeira série fechar a faixa", () => {
    const sessions = twoGoodSessions();
    sessions[0].sets[2] = makeSet({ setNumber: 3, reps: 9 });
    sessions[1].sets[2] = makeSet({ setNumber: 3, reps: 9 });

    const result = evaluate({
      rule: makeRule({ requireAllWorkingSets: false }),
      sessions,
    });
    expect(result.suggest).toBe(true);
  });

  it("série marcada como falha bloqueia", () => {
    const sessions = twoGoodSessions();
    sessions[0].sets[1] = makeSet({ setNumber: 2, status: "falhou" });

    const result = evaluate({ sessions });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("falha_registrada");
  });

  it("dificuldade acima do limite bloqueia", () => {
    const sessions = twoGoodSessions();
    sessions[0].sets[0] = makeSet({ difficulty: "muito_dificil" });

    const result = evaluate({ sessions });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("dificuldade_alta");
  });

  it("RIR acima do teto bloqueia", () => {
    const sessions = twoGoodSessions();
    sessions[0].sets[0] = makeSet({ rir: 5, difficulty: null });

    const result = evaluate({ rule: makeRule({ maxRir: 2, maxDifficulty: null }), sessions });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("dificuldade_alta");
  });

  it("exercício que não é medido em carga não recebe sugestão de carga", () => {
    const result = evaluate({
      target: { ...target, trackingType: "duracao" },
    });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("tipo_nao_suportado");
  });

  it("sem carga registrada não há o que incrementar", () => {
    const sessions = twoGoodSessions().map((session) => ({
      ...session,
      sets: session.sets.map((set) => ({ ...set, weightKg: null })),
    }));
    const result = evaluate({ sessions });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("sem_carga_registrada");
  });

  it("aquecimento não é série de trabalho e não sustenta a condição", () => {
    const sessions = twoGoodSessions().map((session) => ({
      ...session,
      sets: session.sets.map((set) => ({ ...set, isWarmup: true })),
    }));
    const result = evaluate({ sessions });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("poucas_sessoes");
  });

  it("mais sessões exigidas do que existem bloqueia", () => {
    const result = evaluate({ rule: makeRule({ minSessions: 4 }) });
    expect(result.suggest).toBe(false);
    if (!result.suggest) expect(result.block).toBe("poucas_sessoes");
  });
});

/* ═══════════════════════════ Escopo da regra ═══════════════════════════ */

describe("resolução de escopo — do mais específico para o mais geral", () => {
  const rules = [
    makeRule({ id: "global", scope: "global", name: "Global" }),
    makeRule({ id: "grupo", scope: "grupo", muscleGroupId: "g-peito", name: "Peito" }),
    makeRule({ id: "exercicio", scope: "exercicio", exerciseId: "cat-supino", name: "Supino" }),
  ];

  it("regra do exercício vence a do grupo e a global", () => {
    expect(resolveRule(rules, { exerciseId: "cat-supino", muscleGroupId: "g-peito" })?.id).toBe(
      "exercicio",
    );
  });

  it("sem regra de exercício, vale a do grupo", () => {
    expect(resolveRule(rules, { exerciseId: "cat-outro", muscleGroupId: "g-peito" })?.id).toBe(
      "grupo",
    );
  });

  it("sem regra específica, vale a global", () => {
    expect(resolveRule(rules, { exerciseId: "cat-outro", muscleGroupId: "g-outro" })?.id).toBe(
      "global",
    );
  });

  it("sem nenhuma regra, devolve null", () => {
    expect(resolveRule([], { exerciseId: "x", muscleGroupId: "y" })).toBeNull();
  });
});

/* ═══════════════════════════ Deduplicação e decisão ═══════════════════════════ */

describe("deduplicação e ciclo de vida", () => {
  it("a mesma proposta gera a mesma chave (ignorada não reaparece igual)", () => {
    const a = progressionDedupeKey({
      exerciseId: "x",
      exerciseName: "Supino",
      kind: "carga",
      previousValue: 60,
      suggestedValue: 62.5,
    });
    const b = progressionDedupeKey({
      exerciseId: "x",
      exerciseName: "Supino",
      kind: "carga",
      previousValue: 60,
      suggestedValue: 62.5,
    });
    expect(a).toBe(b);
  });

  it("proposta diferente gera chave diferente", () => {
    const a = progressionDedupeKey({
      exerciseId: "x",
      exerciseName: "Supino",
      kind: "carga",
      previousValue: 60,
      suggestedValue: 62.5,
    });
    const b = progressionDedupeKey({
      exerciseId: "x",
      exerciseName: "Supino",
      kind: "carga",
      previousValue: 62.5,
      suggestedValue: 65,
    });
    expect(a).not.toBe(b);
  });

  it("a sugestão expira quando a carga do modelo já mudou por outro caminho", () => {
    const suggestion = { previousValue: 60, suggestedValue: 62.5 };
    expect(isSuggestionStale(suggestion, 60)).toBe(false);
    expect(isSuggestionStale(suggestion, 65)).toBe(true);
    expect(isSuggestionStale(suggestion, null)).toBe(false);
  });

  it("rótulo curto mostra o antes e o depois", () => {
    expect(suggestionDeltaLabel(62.5, 65, "kg")).toBe("62,5 kg → 65 kg");
    expect(suggestionDeltaLabel(null, 65, "kg")).toBe("65 kg");
  });
});
