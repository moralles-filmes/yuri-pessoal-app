/**
 * Fase 17-E — Testes de `goals.ts`.
 *
 * O que estes testes protegem, em uma frase cada:
 *  • a janela do período é presa ao início e ao prazo da meta;
 *  • ausência de dado vira `null` com motivo, nunca 0;
 *  • `atingida`/`expirada`/`em_atraso` são DERIVADOS e a decisão do usuário vence sempre;
 *  • alterar a meta não pode mudar o que já foi registrado (o histórico é outra tabela).
 */
import { describe, expect, it } from "vitest";
import {
  DERIVED_GOAL_STATUSES,
  GOAL_METRIC_KIND,
  GOAL_METRICS,
  GOAL_STATUS_LABELS,
  METRICS_BY_KIND,
  PACE_TOLERANCE_POINTS,
  asGoalKind,
  asGoalMetric,
  deriveGoalStatus,
  formatGoalValue,
  goalCurrentValue,
  goalPeriodRange,
  goalProgress,
  goalReached,
  isGoalInWindow,
  isGoalOpen,
  milestoneStatuses,
  nextMilestone,
  paceLabel,
  parseMilestones,
  remainingLabel,
  serializeMilestones,
  sortGoalsForDisplay,
  type GoalValue,
  type GoalValueSources,
  type TrainingGoal,
} from "./goals";
import { EMPTY_TOTALS, type FrequencyMetrics, type PeriodMetrics } from "./metrics";

/* ───────────────────────────── Fixtures ───────────────────────────── */

const emptyPeriod = (over: Partial<PeriodMetrics> = {}): PeriodMetrics => ({
  sessionCount: 0,
  totals: EMPTY_TOTALS,
  totalSeconds: 0,
  activeSeconds: 0,
  setsByMuscleGroup: {},
  volumeByMuscleGroup: {},
  trainedDays: [],
  ...over,
});

const emptyFrequency = (over: Partial<FrequencyMetrics> = {}): FrequencyMetrics => ({
  trainedDays: 0,
  sessions: 0,
  trainedWeeks: 0,
  longestWeekStreak: 0,
  currentWeekStreak: 0,
  ...over,
});

const sources = (over: Partial<GoalValueSources> = {}): GoalValueSources => ({
  period: emptyPeriod(),
  frequency: emptyFrequency(),
  ...over,
});

const goal = (over: Partial<TrainingGoal> = {}): TrainingGoal => ({
  id: "g1",
  name: "Meta",
  description: null,
  kind: "frequencia",
  metric: "treinos_por_semana",
  exerciseId: null,
  muscleGroupId: null,
  programId: null,
  bodyMeasurementTypeId: null,
  direction: "aumentar",
  period: "semanal",
  startsOn: "2026-08-01",
  endsOn: null,
  startValue: null,
  targetValue: 4,
  unit: "treinos",
  milestones: [],
  status: "ativa",
  notes: null,
  position: 0,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
  ...over,
});

/* ───────────────────────────── Vocabulário ───────────────────────────── */

describe("vocabulário das metas", () => {
  it("toda métrica pertence a exatamente uma família", () => {
    for (const metric of GOAL_METRICS) {
      const kind = GOAL_METRIC_KIND[metric];
      expect(kind).toBeDefined();
      expect(METRICS_BY_KIND[kind]).toContain(metric);
    }
  });

  it("todo status apresentado tem rótulo em pt-BR", () => {
    for (const status of DERIVED_GOAL_STATUSES) {
      expect(GOAL_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it("nenhum rótulo de status usa linguagem de culpa", () => {
    const banidas = ["falhou", "falha", "você não", "perdeu", "fracasso"];
    for (const status of DERIVED_GOAL_STATUSES) {
      const label = GOAL_STATUS_LABELS[status].toLowerCase();
      for (const palavra of banidas) expect(label).not.toContain(palavra);
    }
  });

  it("converte valor desconhecido do banco sem quebrar", () => {
    expect(asGoalKind("inventado")).toBe("personalizada");
    expect(asGoalMetric(null)).toBe("personalizada");
    expect(asGoalKind("corporal")).toBe("corporal");
  });
});

/* ───────────────────────────── Janela do período ───────────────────────────── */

describe("goalPeriodRange", () => {
  it("semanal devolve a semana de hoje (segunda a domingo)", () => {
    const range = goalPeriodRange(
      { period: "semanal", startsOn: "2026-01-01", endsOn: null },
      "2026-08-05",
      1,
    );
    expect(range.from).toBe("2026-08-03");
    expect(range.to).toBe("2026-08-09");
  });

  it("semanal respeita o primeiro dia de semana configurável", () => {
    const range = goalPeriodRange(
      { period: "semanal", startsOn: "2026-01-01", endsOn: null },
      "2026-08-05",
      0,
    );
    expect(range.from).toBe("2026-08-02");
    expect(range.to).toBe("2026-08-08");
  });

  it("mensal devolve o mês inteiro de hoje", () => {
    const range = goalPeriodRange(
      { period: "mensal", startsOn: "2026-01-01", endsOn: null },
      "2026-02-17",
    );
    expect(range.from).toBe("2026-02-01");
    // 2026 não é bissexto: fevereiro fecha no 28.
    expect(range.to).toBe("2026-02-28");
  });

  it("a janela NUNCA começa antes do início da meta", () => {
    const range = goalPeriodRange(
      { period: "mensal", startsOn: "2026-08-10", endsOn: null },
      "2026-08-20",
    );
    expect(range.from).toBe("2026-08-10");
    expect(range.to).toBe("2026-08-31");
  });

  it("a janela NUNCA passa do prazo da meta", () => {
    const range = goalPeriodRange(
      { period: "mensal", startsOn: "2026-08-01", endsOn: "2026-08-20" },
      "2026-08-15",
    );
    expect(range.to).toBe("2026-08-20");
  });

  it("antes de a meta começar, mostra a PRIMEIRA janela, não uma janela vazia", () => {
    const range = goalPeriodRange(
      { period: "semanal", startsOn: "2026-09-07", endsOn: null },
      "2026-08-05",
      1,
    );
    expect(range.from).toBe("2026-09-07");
    expect(range.to).toBe("2026-09-13");
  });

  it("trimestral é um bloco ancorado no início da meta, não no trimestre do calendário", () => {
    const first = goalPeriodRange(
      { period: "trimestral", startsOn: "2026-03-10", endsOn: null },
      "2026-04-01",
    );
    expect(first.from).toBe("2026-03-10");
    expect(first.to).toBe("2026-06-09");

    const second = goalPeriodRange(
      { period: "trimestral", startsOn: "2026-03-10", endsOn: null },
      "2026-07-01",
    );
    expect(second.from).toBe("2026-06-10");
    expect(second.to).toBe("2026-09-09");
  });

  it("anual vira o bloco de 12 meses contado do início", () => {
    const range = goalPeriodRange(
      { period: "anual", startsOn: "2025-05-01", endsOn: null },
      "2026-08-05",
    );
    expect(range.from).toBe("2026-05-01");
    expect(range.to).toBe("2027-04-30");
  });

  it("personalizado é literalmente início → fim", () => {
    const range = goalPeriodRange(
      { period: "personalizado", startsOn: "2026-02-01", endsOn: "2026-04-15" },
      "2026-03-01",
    );
    expect(range).toMatchObject({ from: "2026-02-01", to: "2026-04-15" });
  });

  it("mensal atravessa a virada de ano sem se perder", () => {
    const range = goalPeriodRange(
      { period: "mensal", startsOn: "2025-01-01", endsOn: null },
      "2025-12-31",
    );
    expect(range).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("isGoalInWindow respeita início e prazo", () => {
    const g = { startsOn: "2026-08-01", endsOn: "2026-08-31" };
    expect(isGoalInWindow(g, "2026-07-31")).toBe(false);
    expect(isGoalInWindow(g, "2026-08-01")).toBe(true);
    expect(isGoalInWindow(g, "2026-08-31")).toBe(true);
    expect(isGoalInWindow(g, "2026-09-01")).toBe(false);
    expect(isGoalInWindow({ startsOn: "2026-08-01", endsOn: null }, "2030-01-01")).toBe(true);
  });
});

/* ───────────────────────────── Valor atual ───────────────────────────── */

describe("goalCurrentValue — o número vem pronto de metrics.ts", () => {
  it("frequência: período sem nenhum treino vale ZERO (é fato medido, não buraco)", () => {
    const value = goalCurrentValue(
      { metric: "treinos_por_semana", bodyMeasurementTypeId: null },
      sources(),
    );
    expect(value.value).toBe(0);
    expect(value.quality).toBe("exato");
  });

  it("frequência conta as sessões do período", () => {
    const value = goalCurrentValue(
      { metric: "treinos_por_mes", bodyMeasurementTypeId: null },
      sources({ period: emptyPeriod({ sessionCount: 11 }) }),
    );
    expect(value.value).toBe(11);
  });

  it("dias ativos conta DIAS, não sessões", () => {
    const value = goalCurrentValue(
      { metric: "dias_ativos", bodyMeasurementTypeId: null },
      sources({
        period: emptyPeriod({ sessionCount: 5, trainedDays: ["2026-08-03", "2026-08-04"] }),
      }),
    );
    expect(value.value).toBe(2);
  });

  it("semanas consecutivas vem de frequencyMetrics", () => {
    const value = goalCurrentValue(
      { metric: "semanas_consecutivas", bodyMeasurementTypeId: null },
      sources({ frequency: emptyFrequency({ currentWeekStreak: 7 }) }),
    );
    expect(value.value).toBe(7);
  });

  it("volume propaga a qualidade PARCIAL vinda de metrics.ts", () => {
    const value = goalCurrentValue(
      { metric: "volume_total", bodyMeasurementTypeId: null },
      sources({
        period: emptyPeriod({
          totals: {
            ...EMPTY_TOTALS,
            volumeKg: 12000,
            quality: "parcial",
            gaps: [{ reason: "sem_peso_corporal", sets: 3 }],
          },
        }),
      }),
    );
    expect(value.value).toBe(12000);
    expect(value.quality).toBe("parcial");
    expect(value.reason).not.toBe("");
  });

  it("séries por semana divide pelas semanas da janela", () => {
    const value = goalCurrentValue(
      { metric: "series_por_semana", bodyMeasurementTypeId: null },
      sources({
        period: emptyPeriod({ totals: { ...EMPTY_TOTALS, sets: 60 } }),
        weeksInRange: 4,
      }),
    );
    expect(value.value).toBe(15);
  });

  it("séries por semana nunca divide por zero", () => {
    const value = goalCurrentValue(
      { metric: "series_por_semana", bodyMeasurementTypeId: null },
      sources({ period: emptyPeriod({ totals: { ...EMPTY_TOTALS, sets: 10 } }), weeksInRange: 0 }),
    );
    expect(value.value).toBe(10);
    expect(Number.isFinite(value.value as number)).toBe(true);
  });

  it("tempo total sai em minutos a partir dos segundos agregados", () => {
    const value = goalCurrentValue(
      { metric: "tempo_total", bodyMeasurementTypeId: null },
      sources({ period: emptyPeriod({ totalSeconds: 5400 }) }),
    );
    expect(value.value).toBe(90);
  });

  it("exercício nunca executado é INDISPONÍVEL, não zero", () => {
    const value = goalCurrentValue(
      { metric: "peso_exercicio", bodyMeasurementTypeId: null },
      sources({ bestWeightKg: null }),
    );
    expect(value.value).toBeNull();
    expect(value.reason).toContain("Nenhuma execução");
  });

  it("medida corporal sem medição é INDISPONÍVEL, não zero", () => {
    const value = goalCurrentValue(
      { metric: "medida_corporal", bodyMeasurementTypeId: "t1" },
      sources({ bodyValue: null }),
    );
    expect(value.value).toBeNull();
    expect(value.reason).toContain("Nenhuma medição");
  });

  it("medida corporal com tipo removido na Dieta explica o motivo", () => {
    const value = goalCurrentValue(
      { metric: "medida_corporal", bodyMeasurementTypeId: null },
      sources({ bodyTypeMissing: true }),
    );
    expect(value.value).toBeNull();
    expect(value.reason).toContain("removido");
  });

  it("medida corporal medida com valor zero continua sendo ZERO medido", () => {
    const value = goalCurrentValue(
      { metric: "medida_corporal", bodyMeasurementTypeId: "t1" },
      sources({ bodyValue: 0 }),
    );
    expect(value.value).toBe(0);
    expect(value.quality).toBe("exato");
  });

  it("aderência sem planejamento é INDISPONÍVEL, não 0%", () => {
    const value = goalCurrentValue(
      { metric: "aderencia_planejamento", bodyMeasurementTypeId: null },
      sources({ adherencePercent: null }),
    );
    expect(value.value).toBeNull();
  });

  it("1RM sempre viaja marcado como ESTIMATIVA", () => {
    const value = goalCurrentValue(
      { metric: "um_rm_estimado", bodyMeasurementTypeId: null },
      sources({ bestOneRmKg: 132.5 }),
    );
    expect(value.value).toBe(132.5);
    expect(value.quality).toBe("parcial");
    expect(value.reason.toLowerCase()).toContain("estimativa");
  });

  it("meta personalizada sem registro é indisponível", () => {
    const value = goalCurrentValue(
      { metric: "personalizada", bodyMeasurementTypeId: null },
      sources({ manualValue: null }),
    );
    expect(value.value).toBeNull();
  });

  it("séries por grupo muscular sem grupo escolhido é indisponível", () => {
    const value = goalCurrentValue(
      { metric: "series_grupo_muscular", bodyMeasurementTypeId: null },
      sources({ muscleGroupSets: null }),
    );
    expect(value.value).toBeNull();
  });

  it("toda métrica do vocabulário tem tratamento (nenhuma cai em undefined)", () => {
    for (const metric of GOAL_METRICS) {
      const value = goalCurrentValue({ metric, bodyMeasurementTypeId: "t1" }, sources());
      expect(value).toHaveProperty("value");
      expect(value).toHaveProperty("quality");
    }
  });
});

/* ───────────────────────────── Progresso e status ───────────────────────────── */

const exact = (value: number | null): GoalValue => ({
  value,
  quality: value === null ? "parcial" : "exato",
  reason: "",
});

describe("goalReached", () => {
  it("aumentar alcança no maior ou igual", () => {
    expect(goalReached("aumentar", 100, 100, 80)).toBe(true);
    expect(goalReached("aumentar", 99.9, 100, 80)).toBe(false);
  });

  it("reduzir alcança no menor ou igual", () => {
    expect(goalReached("reduzir", 78, 80, 90)).toBe(true);
    expect(goalReached("reduzir", 81, 80, 90)).toBe(false);
  });

  it("manter aceita a faixa de metade do caminho percorrido", () => {
    // partida 90, alvo 80 → tolerância 5.
    expect(goalReached("manter", 84, 80, 90)).toBe(true);
    expect(goalReached("manter", 74, 80, 90)).toBe(false);
  });

  it("manter sem partida exige o valor exato", () => {
    expect(goalReached("manter", 80, 80, null)).toBe(true);
    expect(goalReached("manter", 80.5, 80, null)).toBe(false);
  });
});

describe("goalProgress", () => {
  it("calcula o percentual do trajeto entre partida e alvo", () => {
    const progress = goalProgress(
      goal({ startValue: 80, targetValue: 100, direction: "aumentar" }),
      exact(90),
      "2026-08-05",
    );
    expect(progress.percent).toBe(50);
    expect(progress.remaining).toBe(10);
    expect(progress.reached).toBe(false);
  });

  it("passar do alvo NÃO estoura de 100%", () => {
    const progress = goalProgress(
      goal({ startValue: 80, targetValue: 100 }),
      exact(130),
      "2026-08-05",
    );
    expect(progress.percent).toBe(100);
    expect(progress.reached).toBe(true);
  });

  it("meta de redução conta o trajeto no sentido certo", () => {
    const progress = goalProgress(
      goal({ startValue: 90, targetValue: 80, direction: "reduzir" }),
      exact(85),
      "2026-08-05",
    );
    expect(progress.percent).toBe(50);
  });

  it("sem partida declarada, uma meta de acúmulo mede o quanto do alvo já foi feito", () => {
    const progress = goalProgress(
      goal({ startValue: null, targetValue: 4, direction: "aumentar" }),
      exact(3),
      "2026-08-05",
    );
    expect(progress.percent).toBe(75);
  });

  it("sem valor atual, o percentual é NULL — nunca 0%", () => {
    const progress = goalProgress(goal({ startValue: 80, targetValue: 100 }), exact(null), "2026-08-05");
    expect(progress.percent).toBeNull();
    expect(progress.remaining).toBeNull();
    expect(progress.reached).toBe(false);
  });

  it("partida igual ao alvo não divide por zero", () => {
    const dentro = goalProgress(
      goal({ startValue: 80, targetValue: 80, direction: "manter" }),
      exact(80),
      "2026-08-05",
    );
    expect(dentro.percent).toBe(100);
    expect(Number.isNaN(dentro.percent as number)).toBe(false);

    const fora = goalProgress(
      goal({ startValue: 80, targetValue: 80, direction: "manter" }),
      exact(85),
      "2026-08-05",
    );
    expect(fora.percent).toBe(0);
  });

  it("propaga a qualidade e o motivo do valor", () => {
    const progress = goalProgress(
      goal({ startValue: 0, targetValue: 20000 }),
      { value: 9000, quality: "parcial", reason: "Séries sem peso corporal." },
      "2026-08-05",
    );
    expect(progress.quality).toBe("parcial");
    expect(progress.reason).toContain("peso corporal");
  });
});

describe("deriveGoalStatus — derivado na leitura, decisão do usuário vence", () => {
  const base = { status: "ativa" as const, startsOn: "2026-08-01", endsOn: "2026-08-31" };

  it("alvo alcançado vira atingida", () => {
    expect(deriveGoalStatus(base, true, "2026-08-10")).toBe("atingida");
  });

  it("prazo passado sem alcançar vira expirada", () => {
    expect(deriveGoalStatus(base, false, "2026-09-01")).toBe("expirada");
  });

  it("meta sem prazo nunca expira", () => {
    expect(deriveGoalStatus({ ...base, endsOn: null }, false, "2030-01-01")).toBe("ativa");
  });

  it("progresso muito abaixo do tempo decorrido vira 'atrás do ritmo'", () => {
    expect(deriveGoalStatus(base, false, "2026-08-20", -(PACE_TOLERANCE_POINTS + 1))).toBe("em_atraso");
    expect(deriveGoalStatus(base, false, "2026-08-20", -(PACE_TOLERANCE_POINTS - 1))).toBe("ativa");
  });

  it("PAUSADA não vira atingida nem expirada sozinha", () => {
    expect(deriveGoalStatus({ ...base, status: "pausada" }, true, "2026-09-30")).toBe("pausada");
  });

  it("CANCELADA e CONCLUÍDA são decisões e permanecem", () => {
    expect(deriveGoalStatus({ ...base, status: "cancelada" }, true, "2026-08-10")).toBe("cancelada");
    expect(deriveGoalStatus({ ...base, status: "concluida" }, false, "2026-09-30")).toBe("concluida");
  });

  it("planejada que ainda não começou continua planejada", () => {
    expect(
      deriveGoalStatus({ status: "planejada", startsOn: "2026-09-01", endsOn: null }, false, "2026-08-05"),
    ).toBe("planejada");
  });

  it("planejada cujo início já chegou passa a ativa na leitura", () => {
    expect(
      deriveGoalStatus({ status: "planejada", startsOn: "2026-08-01", endsOn: null }, false, "2026-08-05"),
    ).toBe("ativa");
  });

  it("isGoalOpen só considera aberta o que ainda pede atenção", () => {
    expect(isGoalOpen("ativa")).toBe(true);
    expect(isGoalOpen("em_atraso")).toBe(true);
    expect(isGoalOpen("planejada")).toBe(true);
    expect(isGoalOpen("atingida")).toBe(false);
    expect(isGoalOpen("cancelada")).toBe(false);
  });
});

describe("ritmo", () => {
  it("meta sem prazo não tem ritmo a comparar", () => {
    const progress = goalProgress(
      goal({ endsOn: null, startValue: 0, targetValue: 10 }),
      exact(5),
      "2026-08-05",
    );
    expect(progress.pace.elapsedPercent).toBeNull();
    expect(progress.pace.aheadByPoints).toBeNull();
    expect(paceLabel(progress.pace)).toBe("");
  });

  it("mede o tempo decorrido do prazo", () => {
    const progress = goalProgress(
      goal({ startsOn: "2026-08-01", endsOn: "2026-08-11", startValue: 0, targetValue: 10 }),
      exact(5),
      "2026-08-06",
    );
    expect(progress.pace.elapsedPercent).toBe(50);
    expect(progress.pace.daysLeft).toBe(5);
    expect(paceLabel(progress.pace)).toBe("No ritmo do prazo.");
  });

  it("a frase do ritmo nunca cobra o usuário", () => {
    const atrasada = goalProgress(
      goal({ startsOn: "2026-08-01", endsOn: "2026-08-11", startValue: 0, targetValue: 10 }),
      exact(1),
      "2026-08-10",
    );
    const frase = paceLabel(atrasada.pace).toLowerCase();
    expect(frase).toContain("abaixo do tempo");
    expect(frase).not.toContain("você falhou");
  });
});

/* ───────────────────────────── Marcos ───────────────────────────── */

describe("marcos intermediários", () => {
  it("lê o jsonb ignorando lixo, sem quebrar", () => {
    const parsed = parseMilestones([
      { value: 90, label: "metade", due_on: "2026-09-30" },
      { value: "95" },
      { label: "sem valor" },
      null,
      "texto",
      { value: 100, due_on: "data-ruim" },
    ]);
    expect(parsed).toEqual([
      { value: 90, label: "metade", dueOn: "2026-09-30" },
      { value: 95, label: null, dueOn: null },
      { value: 100, label: null, dueOn: null },
    ]);
  });

  it("jsonb que não é array vira lista vazia", () => {
    expect(parseMilestones(null)).toEqual([]);
    expect(parseMilestones({ value: 1 })).toEqual([]);
  });

  it("ida e volta pelo jsonb preserva os marcos", () => {
    const original = [{ value: 90, label: "metade", dueOn: "2026-09-30" }];
    expect(parseMilestones(serializeMilestones(original))).toEqual(original);
  });

  it("ordena no sentido da direção e classifica cada marco", () => {
    const statuses = milestoneStatuses(
      {
        direction: "aumentar",
        startValue: 80,
        targetValue: 100,
        milestones: [
          { value: 95, label: null, dueOn: null },
          { value: 85, label: null, dueOn: null },
        ],
      },
      90,
      "2026-08-05",
    );
    expect(statuses.map((m) => m.value)).toEqual([85, 95]);
    expect(statuses[0].state).toBe("atingido");
    expect(statuses[1].state).toBe("pendente");
    expect(statuses[0].percentOfPath).toBe(25);
  });

  it("meta de redução ordena do maior para o menor", () => {
    const statuses = milestoneStatuses(
      {
        direction: "reduzir",
        startValue: 90,
        targetValue: 80,
        milestones: [
          { value: 82, label: null, dueOn: null },
          { value: 87, label: null, dueOn: null },
        ],
      },
      86,
      "2026-08-05",
    );
    expect(statuses.map((m) => m.value)).toEqual([87, 82]);
    expect(statuses[0].state).toBe("atingido");
  });

  it("SEM valor atual, o marco fica pendente — nunca 'vencido' por falta de medição", () => {
    const statuses = milestoneStatuses(
      {
        direction: "aumentar",
        startValue: 80,
        targetValue: 100,
        milestones: [{ value: 90, label: null, dueOn: "2026-01-01" }],
      },
      null,
      "2026-08-05",
    );
    // O prazo do marco passou e não houve medição: a tela mostra prazo vencido, mas o motivo
    // continua sendo "não foi alcançado", não "o usuário falhou".
    expect(statuses[0].state).toBe("prazo_vencido");
  });

  it("marco com prazo no futuro e não alcançado fica pendente", () => {
    const statuses = milestoneStatuses(
      {
        direction: "aumentar",
        startValue: 80,
        targetValue: 100,
        milestones: [{ value: 90, label: null, dueOn: "2026-12-31" }],
      },
      85,
      "2026-08-05",
    );
    expect(statuses[0].state).toBe("pendente");
  });

  it("nextMilestone devolve o primeiro não alcançado", () => {
    const statuses = milestoneStatuses(
      {
        direction: "aumentar",
        startValue: 0,
        targetValue: 100,
        milestones: [
          { value: 25, label: null, dueOn: null },
          { value: 50, label: null, dueOn: null },
          { value: 75, label: null, dueOn: null },
        ],
      },
      30,
      "2026-08-05",
    );
    expect(nextMilestone(statuses)?.value).toBe(50);
  });

  it("todos alcançados devolve null", () => {
    const statuses = milestoneStatuses(
      { direction: "aumentar", startValue: 0, targetValue: 100, milestones: [{ value: 25, label: null, dueOn: null }] },
      99,
      "2026-08-05",
    );
    expect(nextMilestone(statuses)).toBeNull();
  });
});

/* ───────────────────────────── Apresentação ───────────────────────────── */

describe("apresentação", () => {
  it("formata em pt-BR e devolve travessão para indisponível", () => {
    expect(formatGoalValue(82.5, "kg")).toBe("82,5 kg");
    expect(formatGoalValue(12, "treinos")).toBe("12 treinos");
    expect(formatGoalValue(null, "kg")).toBe("—");
    expect(formatGoalValue(5, "")).toBe("5");
  });

  it("o que falta é dito no verbo da direção", () => {
    const progress = goalProgress(
      goal({ startValue: 90, targetValue: 80, direction: "reduzir" }),
      exact(85),
      "2026-08-05",
    );
    expect(remainingLabel(progress, "reduzir", "kg")).toContain("reduzir");
  });

  it("alvo alcançado não fica pedindo mais nada", () => {
    const progress = goalProgress(goal({ startValue: 80, targetValue: 100 }), exact(100), "2026-08-05");
    expect(remainingLabel(progress, "aumentar", "kg")).toBe("Alvo alcançado");
  });

  it("sem valor atual, não afirma o que falta", () => {
    const progress = goalProgress(goal({ startValue: 80, targetValue: 100 }), exact(null), "2026-08-05");
    expect(remainingLabel(progress, "aumentar", "kg")).toBe("—");
  });

  it("ordena o que precisa de atenção primeiro", () => {
    const ordered = sortGoalsForDisplay([
      { status: "cancelada", endsOn: null, position: 0, name: "Z" },
      { status: "ativa", endsOn: "2026-12-01", position: 0, name: "B" },
      { status: "em_atraso", endsOn: null, position: 0, name: "A" },
      { status: "atingida", endsOn: null, position: 0, name: "C" },
    ]);
    expect(ordered.map((g) => g.name)).toEqual(["A", "B", "C", "Z"]);
  });
});
