import { describe, expect, it } from "vitest";
import {
  buildSeries,
  compareOnDates,
  effectiveGoalStatus,
  formatDelta,
  formatMeasurement,
  formatPercent,
  goalForDate,
  goalProgress,
  goalReached,
  hasEnoughForMovingAverage,
  latestMeasurement,
  measuredPoints,
  measurementDelta,
  measurementOnDate,
  nextSuggestedDate,
  registrationFrequency,
  sortByDate,
  summarizeType,
  type MeasurementPoint,
} from "./measurements";

/** Atalho para montar uma medição de teste sem repetir o objeto inteiro. */
const m = (
  measuredOn: string,
  value: number,
  extra: Partial<MeasurementPoint> = {},
): MeasurementPoint => ({ measuredOn, value, ...extra });

describe("sortByDate", () => {
  it("ordena da mais antiga para a mais recente", () => {
    const list = [m("2026-03-10", 80), m("2026-01-05", 84), m("2026-02-01", 82)];
    expect(sortByDate(list).map((item) => item.measuredOn)).toEqual([
      "2026-01-05",
      "2026-02-01",
      "2026-03-10",
    ]);
  });

  it("desempata duas medições do mesmo dia pelo horário", () => {
    const list = [
      m("2026-01-05", 81, { measuredAt: "20:00" }),
      m("2026-01-05", 80, { measuredAt: "07:00" }),
    ];
    expect(sortByDate(list).map((item) => item.value)).toEqual([80, 81]);
  });

  it("põe a medição SEM horário antes das que têm — não dá para afirmar que veio depois", () => {
    const list = [m("2026-01-05", 81, { measuredAt: "07:00" }), m("2026-01-05", 79)];
    expect(sortByDate(list).map((item) => item.value)).toEqual([79, 81]);
  });

  it("é determinística: mesma entrada em ordens diferentes dá o mesmo resultado", () => {
    const a = [
      m("2026-01-05", 80, { measuredAt: "07:00", createdAt: "2026-01-05T10:00:00Z" }),
      m("2026-01-05", 81, { measuredAt: "07:00", createdAt: "2026-01-05T11:00:00Z" }),
    ];
    expect(sortByDate(a).map((x) => x.value)).toEqual(sortByDate([...a].reverse()).map((x) => x.value));
  });

  it("não muta a lista recebida", () => {
    const list = [m("2026-03-10", 80), m("2026-01-05", 84)];
    sortByDate(list);
    expect(list[0].measuredOn).toBe("2026-03-10");
  });
});

describe("latestMeasurement / measurementOnDate", () => {
  const list = [m("2026-01-05", 84), m("2026-02-01", 82), m("2026-03-10", 80)];

  it("devolve null sem medições — nunca zero", () => {
    expect(latestMeasurement([])).toBeNull();
  });

  it("pega a mais recente", () => {
    expect(latestMeasurement(list)?.value).toBe(80);
  });

  it("na data exata, devolve a medição do dia", () => {
    expect(measurementOnDate(list, "2026-02-01")?.value).toBe(82);
  });

  it("sem medição no dia, devolve a última ANTERIOR (comparar 01/06 sem ter medido em 01/06)", () => {
    expect(measurementOnDate(list, "2026-02-20")?.value).toBe(82);
  });

  it("devolve null quando a data é anterior a qualquer medição", () => {
    expect(measurementOnDate(list, "2025-12-31")).toBeNull();
  });
});

describe("measurementDelta", () => {
  it("calcula diferença absoluta e percentual", () => {
    const delta = measurementDelta(84, 80);
    expect(delta.absolute).toBe(-4);
    expect(delta.percent).toBeCloseTo(-4.7619, 3);
  });

  it("aumento tem sinal positivo", () => {
    expect(measurementDelta(80, 84).absolute).toBe(4);
    expect(measurementDelta(80, 84).percent).toBeCloseTo(5, 6);
  });

  it("percentual é null quando o valor inicial é zero — nada de Infinity na tela", () => {
    expect(measurementDelta(0, 5).percent).toBeNull();
    expect(measurementDelta(0, 5).absolute).toBe(5);
  });

  it("sem variação, diferença é zero e percentual é zero (não null)", () => {
    const delta = measurementDelta(80, 80);
    expect(delta.absolute).toBe(0);
    expect(delta.percent).toBe(0);
  });
});

describe("compareOnDates — variação entre duas datas", () => {
  const list = [
    m("2026-01-05", 84, { condition: "jejum" } as Partial<MeasurementPoint>),
    m("2026-02-01", 82, { condition: "jejum" } as Partial<MeasurementPoint>),
    m("2026-03-10", 80, { condition: "jejum" } as Partial<MeasurementPoint>),
  ] as (MeasurementPoint & { condition: "jejum" })[];

  it("compara os dois extremos e conta os dias", () => {
    const result = compareOnDates(list, "2026-01-05", "2026-03-10");
    expect(result.delta?.absolute).toBe(-4);
    expect(result.days).toBe(64);
  });

  it("usa a medição vigente quando não houve registro na data pedida", () => {
    const result = compareOnDates(list, "2026-01-20", "2026-03-31");
    expect(result.from?.value).toBe(84);
    expect(result.to?.value).toBe(80);
  });

  it("sem medição no início do período, devolve delta null em vez de fingir zero", () => {
    const result = compareOnDates(list, "2025-06-01", "2026-03-10");
    expect(result.from).toBeNull();
    expect(result.delta).toBeNull();
    expect(result.days).toBeNull();
  });

  it("avisa quando os dois lados foram medidos em CONDIÇÕES diferentes", () => {
    const mixed = [
      { ...m("2026-01-05", 84), condition: "jejum" as const },
      { ...m("2026-03-10", 80), condition: "pos_treino" as const },
    ];
    expect(compareOnDates(mixed, "2026-01-05", "2026-03-10").conditionsDiffer).toBe(true);
  });

  it("não avisa quando as condições são iguais", () => {
    expect(compareOnDates(list, "2026-01-05", "2026-03-10").conditionsDiffer).toBe(false);
  });

  it("não avisa quando uma das condições não foi informada — ausência não é divergência", () => {
    const partial = [
      { ...m("2026-01-05", 84), condition: "jejum" as const },
      { ...m("2026-03-10", 80), condition: null },
    ];
    expect(compareOnDates(partial, "2026-01-05", "2026-03-10").conditionsDiffer).toBe(false);
  });
});

describe("buildSeries — DIA SEM MEDIÇÃO NÃO É ZERO", () => {
  const list = [m("2026-01-01", 84), m("2026-01-04", 83)];

  it("devolve um ponto por dia do intervalo", () => {
    expect(buildSeries(list, "2026-01-01", "2026-01-05")).toHaveLength(5);
  });

  it("o dia sem registro tem value NULL, jamais 0", () => {
    const series = buildSeries(list, "2026-01-01", "2026-01-05");
    expect(series[1].value).toBeNull();
    expect(series[2].value).toBeNull();
    // A garantia que importa: nenhum zero inventado na série inteira.
    expect(series.some((point) => point.value === 0)).toBe(false);
  });

  it("preserva os dias que têm medição", () => {
    const series = buildSeries(list, "2026-01-01", "2026-01-05");
    expect(series[0].value).toBe(84);
    expect(series[3].value).toBe(83);
  });

  it("com duas medições no mesmo dia, o ponto usa a última", () => {
    const sameDay = [
      m("2026-01-01", 84, { measuredAt: "07:00" }),
      m("2026-01-01", 85, { measuredAt: "21:00" }),
    ];
    expect(buildSeries(sameDay, "2026-01-01", "2026-01-01")[0].value).toBe(85);
  });

  it("ignora medições fora do intervalo pedido", () => {
    const series = buildSeries([m("2025-12-31", 90), ...list], "2026-01-01", "2026-01-05");
    expect(series.every((point) => point.value !== 90)).toBe(true);
  });

  it("intervalo invertido devolve série vazia em vez de estourar", () => {
    expect(buildSeries(list, "2026-01-05", "2026-01-01")).toEqual([]);
  });

  it("measuredPoints devolve só o que foi medido — a leitura textual do gráfico", () => {
    const series = buildSeries(list, "2026-01-01", "2026-01-05");
    expect(measuredPoints(series).map((p) => p.value)).toEqual([84, 83]);
  });
});

describe("média móvel — só com dados suficientes", () => {
  it("não calcula nada quando a janela está desligada", () => {
    const series = buildSeries([m("2026-01-01", 84), m("2026-01-02", 83)], "2026-01-01", "2026-01-02", 0);
    expect(series.every((point) => point.average === null)).toBe(true);
  });

  it("com MENOS medições que a janela, nenhum ponto ganha média (não inventa suavização)", () => {
    const list = [m("2026-01-01", 84), m("2026-01-02", 82)];
    const series = buildSeries(list, "2026-01-01", "2026-01-05", 3);
    expect(series.every((point) => point.average === null)).toBe(true);
  });

  it("com a janela cheia, calcula a média das últimas N MEDIÇÕES", () => {
    const list = [
      m("2026-01-01", 84),
      m("2026-01-02", 82),
      m("2026-01-03", 80), // média das 3: 82
    ];
    const series = buildSeries(list, "2026-01-01", "2026-01-03", 3);
    expect(series[0].average).toBeNull();
    expect(series[1].average).toBeNull();
    expect(series[2].average).toBeCloseTo(82, 6);
  });

  it("a janela conta MEDIÇÕES, não dias — buraco no meio não dilui a média", () => {
    const list = [m("2026-01-01", 84), m("2026-01-10", 82), m("2026-01-20", 80)];
    const series = buildSeries(list, "2026-01-01", "2026-01-20", 3);
    const last = series.find((point) => point.date === "2026-01-20");
    expect(last?.average).toBeCloseTo(82, 6);
  });

  it("hasEnoughForMovingAverage protege a UI de mostrar linha sem lastro", () => {
    expect(hasEnoughForMovingAverage(2, 7)).toBe(false);
    expect(hasEnoughForMovingAverage(7, 7)).toBe(true);
    expect(hasEnoughForMovingAverage(10, 1)).toBe(false); // janela 1 não é média
  });
});

describe("summarizeType", () => {
  it("sem medições, tudo é null — nada de zeros de enfeite", () => {
    const summary = summarizeType([]);
    expect(summary.current).toBeNull();
    expect(summary.initial).toBeNull();
    expect(summary.delta).toBeNull();
    expect(summary.count).toBe(0);
  });

  it("com uma medição só, NÃO existe variação (zero afirmaria 'não mudou')", () => {
    const summary = summarizeType([m("2026-01-01", 84)]);
    expect(summary.current).toBe(84);
    expect(summary.initial).toBe(84);
    expect(summary.delta).toBeNull();
    expect(summary.sincePrevious).toBeNull();
  });

  it("traz atual, inicial, diferença total e diferença desde a anterior", () => {
    const summary = summarizeType([m("2026-01-01", 84), m("2026-02-01", 82), m("2026-03-01", 80)]);
    expect(summary.current).toBe(80);
    expect(summary.initial).toBe(84);
    expect(summary.delta?.absolute).toBe(-4);
    expect(summary.sincePrevious?.absolute).toBe(-2);
    expect(summary.count).toBe(3);
  });
});

describe("goalForDate — meta vigente, desempate determinístico", () => {
  const base = { targetDate: null, status: "ativa" };
  const goals = [
    { ...base, id: "a", startsOn: "2026-01-01", createdAt: "2026-01-01T10:00:00Z" },
    { ...base, id: "b", startsOn: "2026-03-01", createdAt: "2026-03-01T10:00:00Z" },
  ];

  it("escolhe a que já começou e começou mais tarde", () => {
    expect(goalForDate(goals, "2026-04-01")?.id).toBe("b");
    expect(goalForDate(goals, "2026-02-01")?.id).toBe("a");
  });

  it("ignora meta que ainda não começou", () => {
    expect(goalForDate(goals, "2025-12-01")).toBeNull();
  });

  it("ignora meta cancelada e concluída — elas não valem mais", () => {
    const encerradas = [
      { ...base, id: "c", startsOn: "2026-01-01", createdAt: "x", status: "cancelada" },
      { ...base, id: "d", startsOn: "2026-01-01", createdAt: "x", status: "concluida" },
    ];
    expect(goalForDate(encerradas, "2026-06-01")).toBeNull();
  });

  it("mantém meta PAUSADA como vigente — pausar não é desistir", () => {
    const pausada = [{ ...base, id: "e", startsOn: "2026-01-01", createdAt: "x", status: "pausada" }];
    expect(goalForDate(pausada, "2026-06-01")?.id).toBe("e");
  });

  it("empate total no início e na criação é resolvido pelo id, sempre igual", () => {
    const empate = [
      { ...base, id: "zzz", startsOn: "2026-01-01", createdAt: "2026-01-01T10:00:00Z" },
      { ...base, id: "aaa", startsOn: "2026-01-01", createdAt: "2026-01-01T10:00:00Z" },
    ];
    expect(goalForDate(empate, "2026-02-01")?.id).toBe("aaa");
    expect(goalForDate([...empate].reverse(), "2026-02-01")?.id).toBe("aaa");
  });
});

describe("goalReached — na direção que o USUÁRIO escolheu", () => {
  it("reduzir: atinge ao chegar no alvo ou abaixo", () => {
    expect(goalReached("reduzir", 80, 80, 84)).toBe(true);
    expect(goalReached("reduzir", 79, 80, 84)).toBe(true);
    expect(goalReached("reduzir", 81, 80, 84)).toBe(false);
  });

  it("aumentar: atinge ao chegar no alvo ou acima", () => {
    expect(goalReached("aumentar", 84, 84, 80)).toBe(true);
    expect(goalReached("aumentar", 85, 84, 80)).toBe(true);
    expect(goalReached("aumentar", 83, 84, 80)).toBe(false);
  });

  it("manter: aceita a faixa entre a partida e o alvo", () => {
    // Partida 84, alvo 80 → tolerância 2: vale de 78 a 82.
    expect(goalReached("manter", 81, 80, 84)).toBe(true);
    expect(goalReached("manter", 83, 80, 84)).toBe(false);
  });

  it("manter sem valor de partida exige o valor exato — sem faixa inventada", () => {
    expect(goalReached("manter", 80, 80, null)).toBe(true);
    expect(goalReached("manter", 80.5, 80, null)).toBe(false);
  });
});

describe("goalProgress", () => {
  const goal = {
    direction: "reduzir" as const,
    startValue: 84,
    targetValue: 78,
    startsOn: "2026-01-01",
    targetDate: "2026-06-30",
    status: "ativa" as const,
  };

  it("sem medição, current é null e o percentual não vira 0%", () => {
    const progress = goalProgress(goal, [], "2026-02-01");
    expect(progress.current).toBeNull();
    expect(progress.percent).toBeNull();
    expect(progress.remaining).toBeNull();
    expect(progress.reached).toBe(false);
  });

  it("calcula o percentual do trajeto entre partida e alvo", () => {
    // 84 → 81 de um trajeto de 6 kg = metade do caminho.
    const progress = goalProgress(goal, [m("2026-02-01", 81)], "2026-02-01");
    expect(progress.percent).toBeCloseTo(50, 6);
    expect(progress.remaining).toBeCloseTo(-3, 6);
  });

  it("passar do alvo NÃO estoura de 100% — a barra é o trajeto, não o excedente", () => {
    const progress = goalProgress(goal, [m("2026-02-01", 74)], "2026-02-01");
    expect(progress.percent).toBe(100);
    expect(progress.reached).toBe(true);
  });

  it("andar para o lado contrário não produz percentual negativo", () => {
    const progress = goalProgress(goal, [m("2026-02-01", 90)], "2026-02-01");
    expect(progress.percent).toBe(0);
  });

  it("sem startValue declarado, usa a 1ª medição A PARTIR do início da meta", () => {
    const semPartida = { ...goal, startValue: null };
    const progress = goalProgress(
      semPartida,
      [m("2025-11-01", 95), m("2026-01-15", 84), m("2026-02-01", 81)],
      "2026-02-01",
    );
    // A de 2025 é anterior à meta e não pode ser o ponto de partida dela.
    expect(progress.startValue).toBe(84);
    expect(progress.percent).toBeCloseTo(50, 6);
  });

  it("ignora medições anteriores ao início da meta no valor atual", () => {
    const progress = goalProgress(goal, [m("2025-12-01", 70)], "2026-02-01");
    expect(progress.current).toBeNull();
  });

  it("partida igual ao alvo não divide por zero", () => {
    const parado = { ...goal, startValue: 80, targetValue: 80 };
    expect(goalProgress(parado, [m("2026-02-01", 80)], "2026-02-01").percent).toBe(100);
    expect(goalProgress(parado, [m("2026-02-01", 85)], "2026-02-01").percent).toBe(0);
  });

  it("conta os dias restantes até o prazo, com hoje INJETADO", () => {
    expect(goalProgress(goal, [m("2026-02-01", 81)], "2026-06-20").daysLeft).toBe(10);
    expect(goalProgress(goal, [m("2026-02-01", 81)], "2026-07-10").daysLeft).toBe(-10);
  });

  it("meta sem prazo tem daysLeft null — ela acompanha, não vence", () => {
    const semPrazo = { ...goal, targetDate: null };
    expect(goalProgress(semPrazo, [m("2026-02-01", 81)], "2026-02-01").daysLeft).toBeNull();
  });
});

describe("effectiveGoalStatus — derivado, nunca gravado", () => {
  const goal = { status: "ativa" as const, targetDate: "2026-06-30" };

  it("vira 'atingida' quando o alvo foi alcançado", () => {
    expect(effectiveGoalStatus(goal, true, "2026-02-01")).toBe("atingida");
  });

  it("vira 'prazo_vencido' quando a data passou sem atingir", () => {
    expect(effectiveGoalStatus(goal, false, "2026-07-01")).toBe("prazo_vencido");
  });

  it("no próprio dia do prazo ainda está ativa", () => {
    expect(effectiveGoalStatus(goal, false, "2026-06-30")).toBe("ativa");
  });

  it("meta sem prazo nunca vence", () => {
    expect(effectiveGoalStatus({ status: "ativa", targetDate: null }, false, "2030-01-01")).toBe("ativa");
  });

  it("DECISÃO DO USUÁRIO VENCE: pausada não vira atingida só porque passou pelo alvo", () => {
    expect(effectiveGoalStatus({ status: "pausada", targetDate: null }, true, "2026-02-01")).toBe(
      "pausada",
    );
    expect(effectiveGoalStatus({ status: "cancelada", targetDate: "2020-01-01" }, true, "2026-02-01")).toBe(
      "cancelada",
    );
  });
});

describe("registrationFrequency", () => {
  it("conta os dias com registro sobre os dias PEDIDOS", () => {
    const freq = registrationFrequency([m("2026-01-01", 84), m("2026-01-05", 83)], "2026-01-01", "2026-01-10");
    expect(freq.daysWithRecord).toBe(2);
    expect(freq.totalDays).toBe(10);
    expect(freq.percent).toBeCloseTo(20, 6);
  });

  it("duas medições no mesmo dia contam como um dia", () => {
    const freq = registrationFrequency(
      [m("2026-01-01", 84, { measuredAt: "07:00" }), m("2026-01-01", 85, { measuredAt: "21:00" })],
      "2026-01-01",
      "2026-01-02",
    );
    expect(freq.daysWithRecord).toBe(1);
  });

  it("calcula o maior intervalo entre medições", () => {
    const freq = registrationFrequency(
      [m("2026-01-01", 84), m("2026-01-03", 83), m("2026-01-20", 82)],
      "2026-01-01",
      "2026-01-31",
    );
    expect(freq.longestGapDays).toBe(17);
  });

  it("período sem nenhuma medição não vira NaN nem divisão por zero", () => {
    const freq = registrationFrequency([], "2026-01-01", "2026-01-10");
    expect(freq.percent).toBe(0);
    expect(freq.longestGapDays).toBeNull();
    expect(freq.lastDate).toBeNull();
  });

  it("intervalo inválido devolve percent null, não NaN", () => {
    expect(registrationFrequency([], "2026-01-10", "2026-01-01").percent).toBeNull();
  });
});

describe("nextSuggestedDate", () => {
  it("soma a cadência à última medição", () => {
    expect(nextSuggestedDate("2026-01-01", 7)).toBe("2026-01-08");
  });

  it("sem última medição, não sugere nada", () => {
    expect(nextSuggestedDate(null, 7)).toBeNull();
  });

  it("cadência inválida não vira data", () => {
    expect(nextSuggestedDate("2026-01-01", 0)).toBeNull();
  });
});

describe("formatação em pt-BR", () => {
  it("respeita as casas decimais do tipo", () => {
    expect(formatMeasurement(72.44, "kg", 1)).toBe("72,4 kg");
    expect(formatMeasurement(72.44, "kg", 2)).toBe("72,44 kg");
    expect(formatMeasurement(72.44, "%", 0)).toBe("72 %");
  });

  it("o sinal da diferença é explícito", () => {
    expect(formatDelta(-1.6, "kg", 1)).toBe("−1,6 kg");
    expect(formatDelta(0.8, "kg", 1)).toBe("+0,8 kg");
    expect(formatDelta(0, "kg", 1)).toBe("0,0 kg");
  });

  it("percentual indisponível vira travessão, nunca 0%", () => {
    expect(formatPercent(null)).toBe("—");
    expect(formatPercent(-2.14)).toBe("−2,1%");
    expect(formatPercent(5)).toBe("+5,0%");
  });
});
