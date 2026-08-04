/**
 * Fase 17-D — Testes de `history.ts`.
 *
 * Cobre filtros combinados, agrupamentos, comparações e a ida e volta da URL. E prova o que a
 * 17-C exige: **renomear o exercício no catálogo não muda o histórico**, porque o histórico só
 * lê o nome congelado.
 */
import { describe, expect, it } from "vitest";
import type { MetricExercise, MetricSet } from "./metrics";
import {
  applyHistoryFilters,
  averageOfRecentSessions,
  bestSessionOfSameWorkout,
  compareSessions,
  countActiveHistoryFilters,
  durationLabel,
  EMPTY_HISTORY_FILTERS,
  groupHistory,
  historyFiltersFromParams,
  longDateLabelIso,
  matchesHistoryFilters,
  paramsFromHistoryFilters,
  previousSessionOfSameWorkout,
  type HistoryFilterState,
  type HistoryItem,
} from "./history";

function makeSet(overrides: Partial<MetricSet> = {}): MetricSet {
  return {
    setNumber: 1,
    status: "concluida",
    setType: "trabalho",
    isWarmup: false,
    countsInVolume: true,
    reps: 10,
    weightKg: 60,
    additionalWeightKg: null,
    assistanceWeightKg: null,
    durationSeconds: null,
    distanceM: null,
    calories: null,
    ...overrides,
  };
}

function makeExercise(overrides: Partial<MetricExercise> = {}): MetricExercise {
  return {
    id: "sx-1",
    exerciseId: "cat-supino",
    exerciseName: "Supino reto com barra",
    trackingType: "peso_reps",
    laterality: "bilateral",
    muscleGroup: "Peitoral",
    countsInVolume: true,
    sets: [makeSet()],
    ...overrides,
  };
}

function makeItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: "s-1",
    sessionDate: "2026-08-03",
    status: "concluida",
    workoutId: "w-1",
    workoutName: "Treino A",
    programId: "p-1",
    programName: "ABC",
    bodyWeightKg: 80,
    totalSeconds: 3600,
    activeSeconds: 3000,
    exercises: [makeExercise()],
    hasNotes: false,
    feltPain: false,
    hasRecord: false,
    startedAt: "2026-08-03T22:00:00.000Z",
    endedAt: "2026-08-03T23:00:00.000Z",
    locationName: "Academia do bairro",
    rating: 4,
    ...overrides,
  };
}

const filters = (overrides: Partial<HistoryFilterState> = {}): HistoryFilterState => ({
  ...EMPTY_HISTORY_FILTERS,
  ...overrides,
});

/* ═══════════════════════════ Filtros ═══════════════════════════ */

describe("filtros combináveis", () => {
  const items = [
    makeItem({ id: "a", sessionDate: "2026-08-03", workoutId: "w-1", workoutName: "Treino A" }),
    makeItem({
      id: "b",
      sessionDate: "2026-08-10",
      workoutId: "w-2",
      workoutName: "Treino B",
      programId: "p-2",
      programName: "Push/Pull",
      totalSeconds: 1800,
      feltPain: true,
      exercises: [
        makeExercise({
          exerciseId: "cat-agacho",
          exerciseName: "Agachamento livre",
          muscleGroup: "Quadríceps",
          sets: [makeSet({ weightKg: 100, reps: 5 })],
        }),
      ],
    }),
    makeItem({ id: "c", sessionDate: "2026-09-01", hasNotes: true, hasRecord: true }),
  ];

  it("período filtra por data pura, inclusivo nas duas pontas", () => {
    const result = applyHistoryFilters(items, filters({ from: "2026-08-03", to: "2026-08-10" }));
    expect(result.map((item) => item.id).sort()).toEqual(["a", "b"]);
  });

  it("programa, treino, exercício e grupo muscular combinam entre si", () => {
    expect(applyHistoryFilters(items, filters({ programId: "p-2" }))).toHaveLength(1);
    expect(applyHistoryFilters(items, filters({ workoutId: "w-1" }))).toHaveLength(2);
    expect(applyHistoryFilters(items, filters({ exerciseId: "cat-agacho" }))).toHaveLength(1);
    expect(applyHistoryFilters(items, filters({ muscleGroup: "Peitoral" }))).toHaveLength(2);

    // Combinação: treino A + peitoral + até 03/08 → só a primeira.
    const combined = applyHistoryFilters(
      items,
      filters({ workoutId: "w-1", muscleGroup: "Peitoral", to: "2026-08-03" }),
    );
    expect(combined.map((item) => item.id)).toEqual(["a"]);
  });

  it("duração, volume, observação, dor e recorde", () => {
    expect(applyHistoryFilters(items, filters({ maxMinutes: 31 })).map((i) => i.id)).toEqual(["b"]);
    expect(applyHistoryFilters(items, filters({ onlyWithPain: true })).map((i) => i.id)).toEqual(["b"]);
    expect(applyHistoryFilters(items, filters({ onlyWithNotes: true })).map((i) => i.id)).toEqual(["c"]);
    expect(applyHistoryFilters(items, filters({ onlyWithRecord: true })).map((i) => i.id)).toEqual(["c"]);
    // Volume: a "b" tem 500 kg; as outras 600 kg.
    expect(applyHistoryFilters(items, filters({ minVolumeKg: 550 })).map((i) => i.id).sort()).toEqual(["a", "c"]);
  });

  it("sessão sem duração registrada não passa por filtro de duração (não vira 0 min)", () => {
    const semDuracao = makeItem({ id: "x", totalSeconds: null });
    expect(matchesHistoryFilters(semDuracao, filters({ minMinutes: 0 }))).toBe(false);
    expect(matchesHistoryFilters(semDuracao, filters())).toBe(true);
  });

  it("busca alcança treino, programa, local, exercício e grupo — sem acento", () => {
    expect(applyHistoryFilters(items, filters({ search: "agachamento" })).map((i) => i.id)).toEqual(["b"]);
    expect(applyHistoryFilters(items, filters({ search: "quadriceps" })).map((i) => i.id)).toEqual(["b"]);
    expect(applyHistoryFilters(items, filters({ search: "push" })).map((i) => i.id)).toEqual(["b"]);
    expect(applyHistoryFilters(items, filters({ search: "academia" }))).toHaveLength(3);
  });

  it("ordenação por recentes, antigos, volume e duração", () => {
    expect(applyHistoryFilters(items, filters({ sort: "recentes" })).map((i) => i.id)).toEqual(["c", "b", "a"]);
    expect(applyHistoryFilters(items, filters({ sort: "antigos" })).map((i) => i.id)).toEqual(["a", "b", "c"]);
    expect(applyHistoryFilters(items, filters({ sort: "duracao" }))[2].id).toBe("b");
    expect(applyHistoryFilters(items, filters({ sort: "volume" }))[2].id).toBe("b");
  });

  it("conta os filtros ativos para o botão de limpar", () => {
    expect(countActiveHistoryFilters(EMPTY_HISTORY_FILTERS)).toBe(0);
    expect(countActiveHistoryFilters(filters({ search: "x", from: "2026-08-01", onlyWithPain: true }))).toBe(3);
  });
});

/* ═══════════════════════════ Snapshot ═══════════════════════════ */

describe("o histórico lê o SNAPSHOT, nunca o catálogo atual", () => {
  it("renomear o exercício no catálogo não muda o que o histórico mostra nem o filtro", () => {
    // O item guarda o nome congelado. Não há caminho de leitura para o catálogo aqui: mesmo que
    // o exercício `cat-supino` passe a se chamar outra coisa, o histórico continua igual.
    const item = makeItem();
    expect(item.exercises[0].exerciseName).toBe("Supino reto com barra");
    expect(applyHistoryFilters([item], filters({ search: "supino" }))).toHaveLength(1);
  });

  it("exercício excluído do catálogo (exerciseId nulo) continua no histórico pelo nome", () => {
    const item = makeItem({
      exercises: [makeExercise({ exerciseId: null, exerciseName: "Crucifixo inclinado" })],
    });
    expect(applyHistoryFilters([item], filters({ search: "crucifixo" }))).toHaveLength(1);
  });
});

/* ═══════════════════════════ URL ═══════════════════════════ */

describe("URL ↔ filtros (ida e volta)", () => {
  it("o padrão não emite nenhum parâmetro", () => {
    expect(paramsFromHistoryFilters(EMPTY_HISTORY_FILTERS)).toEqual({});
  });

  it("ida e volta preserva o estado", () => {
    const original = filters({
      search: "supino",
      from: "2026-08-01",
      to: "2026-08-31",
      programId: "p-1",
      workoutId: "w-1",
      exerciseId: "e-1",
      muscleGroup: "Peitoral",
      status: "concluida",
      minMinutes: 30,
      maxMinutes: 90,
      minVolumeKg: 1000,
      onlyWithRecord: true,
      onlyWithNotes: true,
      onlyWithPain: true,
      view: "calendario",
      grouping: "semana",
      sort: "volume",
    });

    expect(historyFiltersFromParams(paramsFromHistoryFilters(original))).toEqual(original);
  });

  it("valor inválido na URL cai no padrão em vez de quebrar a tela", () => {
    const parsed = historyFiltersFromParams({
      visao: "inexistente",
      ordem: "aleatoria",
      agrupar: "nada",
      de: "31/02/2026",
      min_min: "abc",
    });
    expect(parsed.view).toBe("lista");
    expect(parsed.sort).toBe("recentes");
    expect(parsed.grouping).toBe("nenhum");
    expect(parsed.from).toBeNull();
    expect(parsed.minMinutes).toBeNull();
  });
});

/* ═══════════════════════════ Agrupamento ═══════════════════════════ */

describe("agrupamentos", () => {
  const items = [
    makeItem({ id: "a", sessionDate: "2026-08-03", workoutId: "w-1", workoutName: "Treino A" }),
    makeItem({ id: "b", sessionDate: "2026-08-05", workoutId: "w-2", workoutName: "Treino B" }),
    makeItem({ id: "c", sessionDate: "2026-09-02", workoutId: "w-1", workoutName: "Treino A" }),
  ];

  it("sem agrupamento devolve um grupo só, com o agregado do conjunto", () => {
    const groups = groupHistory(items, "nenhum");
    expect(groups).toHaveLength(1);
    expect(groups[0].metrics.sessionCount).toBe(3);
  });

  it("por treino", () => {
    const groups = groupHistory(items, "treino");
    expect(groups.map((group) => group.label)).toEqual(["Treino A", "Treino B"]);
    expect(groups[0].items).toHaveLength(2);
  });

  it("por semana, mais recente primeiro", () => {
    const groups = groupHistory(items, "semana");
    expect(groups[0].key).toBe("2026-08-31");
    expect(groups[1].key).toBe("2026-08-03");
    expect(groups[1].items).toHaveLength(2);
  });

  it("por mês, com rótulo em pt-BR", () => {
    const groups = groupHistory(items, "mes");
    expect(groups.map((group) => group.label)).toEqual(["setembro de 2026", "agosto de 2026"]);
  });

  it("o agregado do grupo sai de metrics.ts", () => {
    const groups = groupHistory(items, "treino");
    expect(groups[0].metrics.totals.volumeKg).toBe(1200);
  });
});

/* ═══════════════════════════ Comparações ═══════════════════════════ */

describe("comparação entre sessões", () => {
  const older = makeItem({
    id: "old",
    sessionDate: "2026-08-03",
    exercises: [makeExercise({ sets: [makeSet({ weightKg: 60, reps: 10 })] })],
  });
  const newer = makeItem({
    id: "new",
    sessionDate: "2026-08-10",
    exercises: [makeExercise({ sets: [makeSet({ weightKg: 65, reps: 10 })] })],
  });

  it("descreve o fato, sem julgamento", () => {
    const comparison = compareSessions(newer, older, "sessão anterior");
    expect(comparison.volumeDeltaKg).toBe(50);
    expect(comparison.volumePercent).toBeCloseTo(8.333, 2);
    expect(comparison.direction).toBe("acima");
    expect(comparison.isPartial).toBe(false);
  });

  it("sem referência, a comparação é INDISPONÍVEL — nunca zero", () => {
    const comparison = compareSessions(newer, null, "sessão anterior");
    expect(comparison.volumeDeltaKg).toBeNull();
    expect(comparison.direction).toBe("indisponivel");
  });

  it("herda o 'parcial' de qualquer um dos lados", () => {
    const partial = makeItem({
      id: "partial",
      bodyWeightKg: null,
      exercises: [
        makeExercise({
          trackingType: "peso_corporal_reps",
          sets: [makeSet({ weightKg: null, reps: 10 })],
        }),
      ],
    });
    expect(compareSessions(newer, partial, "x").isPartial).toBe(true);
  });

  it("acha a sessão anterior do mesmo treino", () => {
    const history = [older, newer, makeItem({ id: "outro", workoutId: "w-9", workoutName: "Treino Z" })];
    expect(previousSessionOfSameWorkout(newer, history)?.id).toBe("old");
    expect(previousSessionOfSameWorkout(older, history)).toBeNull();
  });

  it("acha a melhor sessão do mesmo treino por volume", () => {
    expect(bestSessionOfSameWorkout(older, [older, newer])?.id).toBe("new");
  });

  it("média das últimas sessões devolve null quando não há com o que comparar", () => {
    expect(averageOfRecentSessions(newer, [])).toBeNull();
  });

  it("média das últimas quatro sessões do mesmo treino", () => {
    const history = [
      makeItem({ id: "1", sessionDate: "2026-07-01", exercises: [makeExercise({ sets: [makeSet({ weightKg: 50, reps: 10 })] })] }),
      makeItem({ id: "2", sessionDate: "2026-07-08", exercises: [makeExercise({ sets: [makeSet({ weightKg: 60, reps: 10 })] })] }),
    ];
    const average = averageOfRecentSessions(newer, history);
    expect(average?.sessions).toBe(2);
    expect(average?.volumeKg).toBe(550);
  });
});

/* ═══════════════════════════ Fuso e rótulos ═══════════════════════════ */

describe("data pura e rótulos", () => {
  it("sessão que atravessa a meia-noite continua no dia em que começou", () => {
    // started_at 23h30 BRT = 02h30 UTC do dia seguinte; a data pura da sessão é a do início.
    const item = makeItem({
      sessionDate: "2026-08-03",
      startedAt: "2026-08-04T02:30:00.000Z",
      endedAt: "2026-08-04T03:40:00.000Z",
    });
    expect(applyHistoryFilters([item], filters({ from: "2026-08-03", to: "2026-08-03" }))).toHaveLength(1);
    expect(groupHistory([item], "mes")[0].key).toBe("2026-08");
  });

  it("rótulos de data não passam por Date (imunes a fuso)", () => {
    expect(longDateLabelIso("2026-08-03")).toBe("3 de agosto de 2026");
    expect(longDateLabelIso("2026-01-31")).toBe("31 de janeiro de 2026");
  });

  it("duração legível", () => {
    expect(durationLabel(3600)).toBe("1 h");
    expect(durationLabel(4320)).toBe("1 h 12 min");
    expect(durationLabel(1800)).toBe("30 min");
    expect(durationLabel(null)).toBe("");
  });
});
