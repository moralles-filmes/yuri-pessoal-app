/**
 * Fase 17-B — Treinos · Testes do planejamento.
 *
 * Dois grupos de teste importam mais que os outros:
 *
 *  1. **Status derivado.** "Atrasado" tem de nascer de data + `hoje` INJETADO, e nunca vencer
 *     um desfecho já gravado. Se este teste passar por acidente com `Date.now()`, a suíte
 *     falharia em outro fuso — por isso `hoje` é sempre parâmetro.
 *  2. **Aritmética de data.** Virada de mês, virada de ano e ano bissexto. O planejamento é
 *     indexado por dia; um erro de um dia aqui reaparece em toda tela do módulo.
 */
import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  addMonthsIso,
  buildScheduleWeek,
  countByDerivedStatus,
  derivePlannedStatus,
  diffDaysIso,
  duplicateWeek,
  eachDayIso,
  endOfMonthIso,
  entriesForDay,
  generateScheduleEntries,
  isOpenEntry,
  monthGridIso,
  nextScheduledEntry,
  overdueEntries,
  rescheduleEntry,
  startOfWeekIso,
  summarizeAdherence,
  weekDaysIso,
  weekdayOf,
} from "./schedule";
import type { ScheduleStatus } from "./constants";

/* ═══════════════════════════ Aritmética de data pura ═══════════════════════════ */

describe("aritmética de data pura (Date.UTC, nunca fuso local)", () => {
  it("weekdayOf usa 0 = domingo", () => {
    expect(weekdayOf("2026-08-02")).toBe(0); // domingo
    expect(weekdayOf("2026-08-03")).toBe(1); // segunda
    expect(weekdayOf("2026-08-08")).toBe(6); // sábado
  });

  it("weekdayOf devolve -1 para entrada inválida", () => {
    expect(weekdayOf("03/08/2026")).toBe(-1);
    expect(weekdayOf("2026-02-31")).toBe(-1);
  });

  it("addDaysIso atravessa a virada de mês", () => {
    expect(addDaysIso("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDaysIso("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("addDaysIso atravessa a virada de ano", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("addDaysIso respeita ano bissexto", () => {
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDaysIso("2028-02-29", 1)).toBe("2028-03-01");
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("diffDaysIso conta dias inteiros nos dois sentidos", () => {
    expect(diffDaysIso("2026-08-03", "2026-08-10")).toBe(7);
    expect(diffDaysIso("2026-08-10", "2026-08-03")).toBe(-7);
    expect(diffDaysIso("2026-12-31", "2027-01-01")).toBe(1);
    expect(diffDaysIso("2028-02-01", "2028-03-01")).toBe(29); // fevereiro bissexto
  });

  it("startOfWeekIso respeita o primeiro dia configurável", () => {
    // 2026-08-05 é uma quarta-feira.
    expect(startOfWeekIso("2026-08-05", 1)).toBe("2026-08-03"); // segunda
    expect(startOfWeekIso("2026-08-05", 0)).toBe("2026-08-02"); // domingo
    expect(startOfWeekIso("2026-08-05", 6)).toBe("2026-08-01"); // sábado
  });

  it("weekDaysIso devolve 7 dias seguidos, do primeiro ao último", () => {
    const days = weekDaysIso("2026-08-05", 1);

    expect(days).toHaveLength(7);
    expect(days[0]).toBe("2026-08-03");
    expect(days[6]).toBe("2026-08-09");
  });

  it("endOfMonthIso resolve 28, 29, 30 e 31 sem tabela", () => {
    expect(endOfMonthIso("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonthIso("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonthIso("2026-04-10")).toBe("2026-04-30");
    expect(endOfMonthIso("2026-12-01")).toBe("2026-12-31");
  });

  /* addMonthsIso chegou na 17-E, para os períodos trimestral/semestral/anual das metas. */
  it("addMonthsIso soma e subtrai meses", () => {
    expect(addMonthsIso("2026-03-10", 3)).toBe("2026-06-10");
    expect(addMonthsIso("2026-03-10", -1)).toBe("2026-02-10");
    expect(addMonthsIso("2026-08-05", 0)).toBe("2026-08-05");
  });

  it("addMonthsIso PRENDE ao último dia quando o dia não existe no destino", () => {
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonthsIso("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsIso("2026-03-31", -1)).toBe("2026-02-28");
    expect(addMonthsIso("2026-05-31", 1)).toBe("2026-06-30");
  });

  it("addMonthsIso atravessa a virada de ano nos dois sentidos", () => {
    expect(addMonthsIso("2026-11-15", 3)).toBe("2027-02-15");
    expect(addMonthsIso("2026-02-15", -3)).toBe("2025-11-15");
    expect(addMonthsIso("2026-01-01", 12)).toBe("2027-01-01");
  });

  it("addMonthsIso devolve a entrada quando ela não é data", () => {
    expect(addMonthsIso("não é data", 1)).toBe("não é data");
  });

  it("monthGridIso cobre o mês com semanas completas", () => {
    const grid = monthGridIso("2026-08-15", 1);

    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0][0]).toBe("2026-07-27"); // segunda anterior ao dia 1º (sábado)
    expect(grid.flat()).toContain("2026-08-31");
  });

  it("eachDayIso é inclusivo nos dois extremos e vazio quando invertido", () => {
    expect(eachDayIso("2026-08-03", "2026-08-05")).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
    expect(eachDayIso("2026-08-05", "2026-08-03")).toEqual([]);
  });
});

/* ═══════════════════════════ Status derivado ═══════════════════════════ */

const entry = (scheduledDate: string, status: ScheduleStatus = "planejado") => ({
  scheduledDate,
  status,
});

describe("derivePlannedStatus — nunca gravado, sempre derivado", () => {
  const hoje = "2026-08-05";

  it("data futura continua planejada", () => {
    expect(derivePlannedStatus(entry("2026-08-10"), hoje)).toBe("planejado");
  });

  it("data de hoje vira 'hoje'", () => {
    expect(derivePlannedStatus(entry("2026-08-05"), hoje)).toBe("hoje");
  });

  it("data passada sem desfecho vira 'atrasado'", () => {
    expect(derivePlannedStatus(entry("2026-08-01"), hoje)).toBe("atrasado");
  });

  it("desfecho gravado SEMPRE vence a derivação", () => {
    expect(derivePlannedStatus(entry("2026-08-01", "concluido"), hoje)).toBe("concluido");
    expect(derivePlannedStatus(entry("2026-08-01", "nao_realizado"), hoje)).toBe("nao_realizado");
    expect(derivePlannedStatus(entry("2026-08-01", "cancelado"), hoje)).toBe("cancelado");
    expect(derivePlannedStatus(entry("2026-08-01", "reagendado"), hoje)).toBe("reagendado");
  });

  it("a virada do dia muda o status sem nenhuma escrita no banco", () => {
    const linha = entry("2026-08-05");

    expect(derivePlannedStatus(linha, "2026-08-04")).toBe("planejado");
    expect(derivePlannedStatus(linha, "2026-08-05")).toBe("hoje");
    expect(derivePlannedStatus(linha, "2026-08-06")).toBe("atrasado");
  });

  it("atravessa a virada de ano", () => {
    expect(derivePlannedStatus(entry("2026-12-31"), "2027-01-01")).toBe("atrasado");
    expect(derivePlannedStatus(entry("2027-01-01"), "2026-12-31")).toBe("planejado");
  });

  it("isOpenEntry só é verdade enquanto falta decisão", () => {
    expect(isOpenEntry(entry("2026-08-01"), hoje)).toBe(true); // atrasado
    expect(isOpenEntry(entry("2026-08-05"), hoje)).toBe(true); // hoje
    expect(isOpenEntry(entry("2026-08-09"), hoje)).toBe(true); // planejado
    expect(isOpenEntry(entry("2026-08-01", "concluido"), hoje)).toBe(false);
    expect(isOpenEntry(entry("2026-08-01", "cancelado"), hoje)).toBe(false);
  });
});

/* ═══════════════════════════ Semana ═══════════════════════════ */

describe("buildScheduleWeek", () => {
  const hoje = "2026-08-05";
  const linhas = [
    { id: "1", scheduledDate: "2026-08-03", status: "concluido" as ScheduleStatus, entryKind: "treino", position: 0 },
    { id: "2", scheduledDate: "2026-08-05", status: "planejado" as ScheduleStatus, entryKind: "treino", position: 0 },
    { id: "3", scheduledDate: "2026-08-04", status: "planejado" as ScheduleStatus, entryKind: "descanso", position: 0 },
    { id: "4", scheduledDate: "2026-08-20", status: "planejado" as ScheduleStatus, entryKind: "treino", position: 0 },
  ];

  it("monta os 7 dias e distribui as linhas", () => {
    const week = buildScheduleWeek(linhas, hoje, hoje, 1);

    expect(week.startDate).toBe("2026-08-03");
    expect(week.endDate).toBe("2026-08-09");
    expect(week.days).toHaveLength(7);
    expect(week.days[0].entries.map((e) => e.id)).toEqual(["1"]);
    expect(week.days[2].entries.map((e) => e.id)).toEqual(["2"]);
  });

  it("linha de fora da semana não entra", () => {
    const week = buildScheduleWeek(linhas, hoje, hoje, 1);
    expect(week.days.flatMap((day) => day.entries).map((e) => e.id)).not.toContain("4");
  });

  it("marca hoje, passado, futuro, vazio e descanso", () => {
    const week = buildScheduleWeek(linhas, hoje, hoje, 1);

    expect(week.days[0].isPast).toBe(true);
    expect(week.days[2].isToday).toBe(true);
    expect(week.days[3].isFuture).toBe(true);
    expect(week.days[1].hasRest).toBe(true);
    expect(week.days[6].isEmpty).toBe(true);
  });

  it("conta por status derivado, com descanso à parte", () => {
    const week = buildScheduleWeek(linhas, hoje, hoje, 1);

    expect(week.counts.concluido).toBe(1);
    expect(week.counts.hoje).toBe(1);
    expect(week.counts.descanso).toBe(1);
    expect(week.counts.total).toBe(3);
  });

  it("respeita o primeiro dia da semana configurado", () => {
    const week = buildScheduleWeek(linhas, hoje, hoje, 0);
    expect(week.startDate).toBe("2026-08-02");
  });
});

describe("countByDerivedStatus", () => {
  it("um atrasado não é contado como planejado", () => {
    const counts = countByDerivedStatus(
      [entry("2026-08-01"), entry("2026-08-10"), entry("2026-08-05")],
      "2026-08-05",
    );

    expect(counts.atrasado).toBe(1);
    expect(counts.planejado).toBe(1);
    expect(counts.hoje).toBe(1);
  });
});

describe("entriesForDay", () => {
  it("ordena por posição e depois por horário", () => {
    const linhas = [
      { id: "b", scheduledDate: "2026-08-05", status: "planejado" as ScheduleStatus, position: 1, plannedTime: "07:00" },
      { id: "a", scheduledDate: "2026-08-05", status: "planejado" as ScheduleStatus, position: 0, plannedTime: "19:00" },
      { id: "c", scheduledDate: "2026-08-06", status: "planejado" as ScheduleStatus, position: 0, plannedTime: null },
    ];

    expect(entriesForDay(linhas, "2026-08-05").map((e) => e.id)).toEqual(["a", "b"]);
  });
});

/* ═══════════════════════════ Recorrência e rodízio ═══════════════════════════ */

describe("generateScheduleEntries", () => {
  it("gera nos dias da semana escolhidos", () => {
    const generated = generateScheduleEntries({
      from: "2026-08-03", // segunda
      to: "2026-08-09",
      weekdays: [1, 3, 5], // seg, qua, sex
      workoutIds: ["w1"],
    });

    expect(generated.map((e) => e.scheduledDate)).toEqual([
      "2026-08-03",
      "2026-08-05",
      "2026-08-07",
    ]);
  });

  it("faz o rodízio A/B/C avançar a cada DIA DE TREINO", () => {
    const generated = generateScheduleEntries({
      from: "2026-08-03",
      to: "2026-08-16", // duas semanas
      weekdays: [1, 3, 5],
      workoutIds: ["A", "B", "C"],
    });

    expect(generated.map((e) => e.workoutId)).toEqual([
      "A", "B", "C", // semana 1: seg, qua, sex
      "A", "B", "C", // semana 2 continua o ciclo
    ]);
  });

  it("o rodízio NÃO reinicia a cada semana quando os dias não fecham o ciclo", () => {
    // 2 dias por semana com 3 treinos: a semana 2 precisa começar em C.
    const generated = generateScheduleEntries({
      from: "2026-08-03",
      to: "2026-08-16",
      weekdays: [1, 4], // seg e qui
      workoutIds: ["A", "B", "C"],
    });

    expect(generated.map((e) => e.workoutId)).toEqual(["A", "B", "C", "A"]);
  });

  it("aceita retomar o rodízio de onde parou", () => {
    const generated = generateScheduleEntries({
      from: "2026-08-03",
      to: "2026-08-09",
      weekdays: [1, 3, 5],
      workoutIds: ["A", "B", "C"],
      rotationOffset: 2,
    });

    expect(generated.map((e) => e.workoutId)).toEqual(["C", "A", "B"]);
  });

  it("ciclo de N semanas pula as semanas fora do ciclo", () => {
    const generated = generateScheduleEntries({
      from: "2026-08-03",
      to: "2026-08-30",
      weekdays: [1],
      workoutIds: ["A"],
      weekInterval: 2,
    });

    expect(generated.map((e) => e.scheduledDate)).toEqual(["2026-08-03", "2026-08-17"]);
  });

  it("o ciclo pode ser ancorado numa semana anterior ao intervalo gerado", () => {
    const generated = generateScheduleEntries({
      from: "2026-08-10",
      to: "2026-08-30",
      weekdays: [1],
      workoutIds: ["A"],
      weekInterval: 2,
      anchorDate: "2026-08-03",
    });

    // Âncora em 03/08: valem 03, 17, 31 — dentro do intervalo, só 17 e 24 não; sobra 17.
    expect(generated.map((e) => e.scheduledDate)).toEqual(["2026-08-17"]);
  });

  it("marca descanso nos outros dias quando pedido", () => {
    const generated = generateScheduleEntries({
      from: "2026-08-03",
      to: "2026-08-05",
      weekdays: [1],
      workoutIds: ["A"],
      includeRestDays: true,
    });

    expect(generated.map((e) => e.entryKind)).toEqual(["treino", "descanso", "descanso"]);
    expect(generated[1].workoutId).toBeNull();
  });

  it("atravessa a virada de mês e de ano", () => {
    const generated = generateScheduleEntries({
      from: "2026-12-28", // segunda
      to: "2027-01-05",
      weekdays: [1],
      workoutIds: ["A"],
    });

    expect(generated.map((e) => e.scheduledDate)).toEqual(["2026-12-28", "2027-01-04"]);
  });

  it("sem dias da semana não gera nada", () => {
    expect(
      generateScheduleEntries({
        from: "2026-08-03",
        to: "2026-08-09",
        weekdays: [],
        workoutIds: ["A"],
      }),
    ).toEqual([]);
  });

  it("sem treino escolhido gera o dia sem treino (o usuário escolhe depois)", () => {
    const generated = generateScheduleEntries({
      from: "2026-08-03",
      to: "2026-08-03",
      weekdays: [1],
      workoutIds: [],
    });

    expect(generated).toHaveLength(1);
    expect(generated[0].workoutId).toBeNull();
  });

  it("intervalo invertido não gera nada", () => {
    expect(
      generateScheduleEntries({
        from: "2026-08-09",
        to: "2026-08-03",
        weekdays: [1],
        workoutIds: ["A"],
      }),
    ).toEqual([]);
  });
});

/* ═══════════════════════════ Duplicar semana ═══════════════════════════ */

describe("duplicateWeek", () => {
  const semana = [
    { scheduledDate: "2026-08-03", workoutId: "A", entryKind: "treino" as const, plannedTime: "07:00", notes: "leve" },
    { scheduledDate: "2026-08-05", workoutId: "B", entryKind: "treino" as const },
    { scheduledDate: "2026-08-04", workoutId: null, entryKind: "descanso" as const },
    { scheduledDate: "2026-08-20", workoutId: "C", entryKind: "treino" as const },
  ];

  it("desloca a semana inteira mantendo o dia da semana", () => {
    const copia = duplicateWeek(semana, "2026-08-03", "2026-08-10");

    expect(copia.map((e) => e.scheduledDate)).toEqual([
      "2026-08-10",
      "2026-08-12",
      "2026-08-11",
    ]);
    expect(copia.map((e) => weekdayOf(e.scheduledDate))).toEqual([1, 3, 2]);
  });

  it("não copia o que está fora da semana de origem", () => {
    const copia = duplicateWeek(semana, "2026-08-03", "2026-08-10");
    expect(copia.map((e) => e.workoutId)).not.toContain("C");
  });

  it("preserva treino, horário, observação e tipo de linha", () => {
    const [primeiro] = duplicateWeek(semana, "2026-08-03", "2026-08-10");

    expect(primeiro.workoutId).toBe("A");
    expect(primeiro.plannedTime).toBe("07:00");
    expect(primeiro.notes).toBe("leve");
    expect(primeiro.entryKind).toBe("treino");
  });

  it("duplicar para a mesma semana não faz nada", () => {
    expect(duplicateWeek(semana, "2026-08-03", "2026-08-05")).toEqual([]);
  });

  it("aceita qualquer dia da semana como referência", () => {
    const copia = duplicateWeek(semana, "2026-08-06", "2026-08-13");
    expect(copia.map((e) => e.scheduledDate)).toEqual([
      "2026-08-10",
      "2026-08-12",
      "2026-08-11",
    ]);
  });

  it("atravessa a virada de ano", () => {
    const copia = duplicateWeek(
      [{ scheduledDate: "2026-12-28", workoutId: "A", entryKind: "treino" as const }],
      "2026-12-28",
      "2027-01-04",
    );
    expect(copia[0].scheduledDate).toBe("2027-01-04");
  });
});

/* ═══════════════════════════ Reagendar ═══════════════════════════ */

describe("rescheduleEntry — o planejamento original é preservado", () => {
  it("grava a data original e o motivo", () => {
    const patch = rescheduleEntry(
      { scheduledDate: "2026-08-03", originalDate: null },
      "2026-08-04",
      "Academia fechada",
    );

    expect(patch).toEqual({
      scheduledDate: "2026-08-04",
      originalDate: "2026-08-03",
      rescheduleReason: "Academia fechada",
      status: "planejado",
    });
  });

  it("mover duas vezes continua apontando para a PRIMEIRA data", () => {
    const primeiro = rescheduleEntry({ scheduledDate: "2026-08-03", originalDate: null }, "2026-08-04");
    const segundo = rescheduleEntry(
      { scheduledDate: "2026-08-04", originalDate: primeiro!.originalDate },
      "2026-08-05",
    );

    expect(segundo?.originalDate).toBe("2026-08-03");
  });

  it("mover devolve o dia ao estado pendente", () => {
    const patch = rescheduleEntry({ scheduledDate: "2026-08-03", originalDate: null }, "2026-08-06");
    expect(patch?.status).toBe("planejado");
  });

  it("mover para a mesma data não gera alteração", () => {
    expect(rescheduleEntry({ scheduledDate: "2026-08-03", originalDate: null }, "2026-08-03")).toBeNull();
  });

  it("data inválida não gera alteração", () => {
    expect(rescheduleEntry({ scheduledDate: "2026-08-03", originalDate: null }, "03/08/2026")).toBeNull();
  });

  it("motivo em branco vira null em vez de string vazia", () => {
    const patch = rescheduleEntry({ scheduledDate: "2026-08-03", originalDate: null }, "2026-08-04", "   ");
    expect(patch?.rescheduleReason).toBeNull();
  });
});

/* ═══════════════════════════ Próximo treino / atrasados ═══════════════════════════ */

describe("nextScheduledEntry e overdueEntries", () => {
  const hoje = "2026-08-05";
  const linhas = [
    { id: "passado", scheduledDate: "2026-08-01", status: "planejado" as ScheduleStatus, entryKind: "treino" },
    { id: "hoje", scheduledDate: "2026-08-05", status: "planejado" as ScheduleStatus, entryKind: "treino" },
    { id: "amanha", scheduledDate: "2026-08-06", status: "planejado" as ScheduleStatus, entryKind: "treino" },
    { id: "depois", scheduledDate: "2026-08-08", status: "planejado" as ScheduleStatus, entryKind: "treino" },
    { id: "descanso", scheduledDate: "2026-08-07", status: "planejado" as ScheduleStatus, entryKind: "descanso" },
    { id: "cancelado", scheduledDate: "2026-08-06", status: "cancelado" as ScheduleStatus, entryKind: "treino" },
  ];

  it("o próximo é o primeiro dia à frente de hoje", () => {
    const next = nextScheduledEntry(linhas, hoje);

    expect(next?.entry.id).toBe("amanha");
    expect(next?.daysAhead).toBe(1);
  });

  it("descanso e cancelado não contam como próximo treino", () => {
    const semAmanha = linhas.filter((l) => l.id !== "amanha");
    expect(nextScheduledEntry(semAmanha, hoje)?.entry.id).toBe("depois");
  });

  it("sem nada à frente devolve null em vez de inventar", () => {
    expect(nextScheduledEntry(linhas, "2026-12-31")).toBeNull();
  });

  it("overdueEntries traz só o que passou e continua sem desfecho", () => {
    const atrasados = overdueEntries(linhas, hoje);

    expect(atrasados.map((l) => l.id)).toEqual(["passado"]);
  });

  it("o que já tem desfecho não é atrasado", () => {
    const atrasados = overdueEntries(
      [{ id: "x", scheduledDate: "2026-08-01", status: "nao_realizado" as ScheduleStatus, entryKind: "treino" }],
      hoje,
    );
    expect(atrasados).toEqual([]);
  });
});

/* ═══════════════════════════ Aderência ═══════════════════════════ */

describe("summarizeAdherence — só o passado entra na conta", () => {
  const hoje = "2026-08-05";

  it("dia futuro não conta como não feito", () => {
    const resumo = summarizeAdherence(
      [
        { scheduledDate: "2026-08-03", status: "concluido" as ScheduleStatus, entryKind: "treino" },
        { scheduledDate: "2026-08-10", status: "planejado" as ScheduleStatus, entryKind: "treino" },
      ],
      hoje,
    );

    expect(resumo.due).toBe(1);
    expect(resumo.done).toBe(1);
    expect(resumo.rate).toBe(1);
  });

  it("separa feito, não feito e ainda em aberto", () => {
    const resumo = summarizeAdherence(
      [
        { scheduledDate: "2026-08-01", status: "concluido" as ScheduleStatus, entryKind: "treino" },
        { scheduledDate: "2026-08-02", status: "nao_realizado" as ScheduleStatus, entryKind: "treino" },
        { scheduledDate: "2026-08-03", status: "planejado" as ScheduleStatus, entryKind: "treino" },
      ],
      hoje,
    );

    expect(resumo).toMatchObject({ due: 3, done: 1, missed: 1, open: 1 });
    expect(resumo.rate).toBeCloseTo(1 / 3);
  });

  it("cancelado e reagendado saem da conta (não são falha)", () => {
    const resumo = summarizeAdherence(
      [
        { scheduledDate: "2026-08-01", status: "cancelado" as ScheduleStatus, entryKind: "treino" },
        { scheduledDate: "2026-08-02", status: "reagendado" as ScheduleStatus, entryKind: "treino" },
        { scheduledDate: "2026-08-03", status: "concluido" as ScheduleStatus, entryKind: "treino" },
      ],
      hoje,
    );

    expect(resumo.due).toBe(1);
    expect(resumo.rate).toBe(1);
  });

  it("descanso não entra na aderência", () => {
    const resumo = summarizeAdherence(
      [{ scheduledDate: "2026-08-01", status: "planejado" as ScheduleStatus, entryKind: "descanso" }],
      hoje,
    );
    expect(resumo.due).toBe(0);
  });

  it("sem nada planejado a taxa é null, e NÃO 0%", () => {
    expect(summarizeAdherence([], hoje).rate).toBeNull();
  });
});
