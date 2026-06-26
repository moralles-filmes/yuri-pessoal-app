import { describe, expect, it } from "vitest";
import {
  bestStreak,
  computeConsistency,
  currentStreak,
  habitOccursOn,
  reachedTarget,
  scheduledDatesInRange,
  type HabitLike,
} from "@/lib/habits/streak";

// 2024-01-01 = segunda (getDay()=1). [1,3,5] = seg/qua/sex.
const diaria: HabitLike = { frequency: "diaria", weekdays: null };
const segQuaSex: HabitLike = {
  frequency: "dias_especificos",
  weekdays: [1, 3, 5],
};

describe("habitOccursOn", () => {
  it("diária ocorre todo dia", () => {
    expect(habitOccursOn(diaria, "2024-01-02")).toBe(true);
  });
  it("dias específicos respeitam o dia da semana", () => {
    expect(habitOccursOn(segQuaSex, "2024-01-01")).toBe(true); // seg
    expect(habitOccursOn(segQuaSex, "2024-01-02")).toBe(false); // ter
    expect(habitOccursOn(segQuaSex, "2024-01-06")).toBe(false); // sáb
  });
  it("hábito inativo nunca ocorre", () => {
    expect(habitOccursOn({ ...diaria, is_active: false }, "2024-01-02")).toBe(
      false,
    );
  });
});

describe("scheduledDatesInRange", () => {
  it("lista as datas agendadas na janela (inclusiva)", () => {
    expect(
      scheduledDatesInRange(segQuaSex, "2024-01-01", "2024-01-07"),
    ).toEqual(["2024-01-01", "2024-01-03", "2024-01-05"]);
  });
  it("diária preenche todos os dias da janela", () => {
    expect(scheduledDatesInRange(diaria, "2024-01-01", "2024-01-03")).toEqual([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
    ]);
  });
});

describe("computeConsistency", () => {
  it("conta agendados x concluídos (5 de 7 dias diária)", () => {
    const done = new Set([
      "2024-01-01",
      "2024-01-02",
      "2024-01-04",
      "2024-01-05",
      "2024-01-07",
    ]);
    const c = computeConsistency(diaria, done, "2024-01-01", "2024-01-07");
    expect(c.scheduled).toBe(7);
    expect(c.done).toBe(5);
    expect(c.rate).toBeCloseTo(5 / 7);
  });
  it("conta apenas dias agendados (dias específicos)", () => {
    const done = new Set(["2024-01-01", "2024-01-05"]);
    const c = computeConsistency(segQuaSex, done, "2024-01-01", "2024-01-07");
    expect(c.scheduled).toBe(3); // seg/qua/sex
    expect(c.done).toBe(2);
  });
  it("rate 0 quando nada foi agendado", () => {
    const semDias: HabitLike = { frequency: "dias_especificos", weekdays: [] };
    const c = computeConsistency(semDias, new Set(), "2024-01-01", "2024-01-07");
    expect(c).toEqual({ scheduled: 0, done: 0, rate: 0 });
  });
});

describe("currentStreak", () => {
  it("conta dias diários consecutivos concluídos até hoje", () => {
    const done = new Set([
      "2024-01-06",
      "2024-01-07",
      "2024-01-08",
      "2024-01-09",
      "2024-01-10",
    ]);
    expect(currentStreak(diaria, done, "2024-01-10")).toBe(5);
  });

  it("HOJE ainda não feito NÃO quebra a sequência (dia em andamento)", () => {
    // Hoje (10) não está em done, mas 07/08/09 estão.
    const done = new Set(["2024-01-07", "2024-01-08", "2024-01-09"]);
    expect(currentStreak(diaria, done, "2024-01-10")).toBe(3);
  });

  it("dia agendado PASSADO não concluído quebra a sequência", () => {
    // Hoje (10) feito, mas ontem (09) não → só conta hoje.
    const done = new Set(["2024-01-08", "2024-01-10"]);
    expect(currentStreak(diaria, done, "2024-01-10")).toBe(1);
  });

  it("pula dias não agendados (dias específicos) e conta os concluídos", () => {
    const done = new Set(["2024-01-01", "2024-01-03", "2024-01-05"]);
    // Hoje = sex (05). ter/qui são pulados.
    expect(currentStreak(segQuaSex, done, "2024-01-05")).toBe(3);
  });

  it("dias específicos: hoje fora da regra usa o último dia agendado", () => {
    const done = new Set(["2024-01-01", "2024-01-03", "2024-01-05"]);
    // Hoje = sáb (06), não agendado. Último agendado = sex (05), concluído.
    expect(currentStreak(segQuaSex, done, "2024-01-06")).toBe(3);
  });

  it("dias específicos: hoje agendado e ainda não feito não quebra", () => {
    const done = new Set(["2024-01-01", "2024-01-03"]);
    // Hoje = sex (05), agendado mas não feito → conta 2 (seg+qua).
    expect(currentStreak(segQuaSex, done, "2024-01-05")).toBe(2);
  });

  it("atravessa a virada de mês corretamente", () => {
    const done = new Set(["2024-01-30", "2024-01-31", "2024-02-01"]);
    expect(currentStreak(diaria, done, "2024-02-01")).toBe(3);
  });

  it("zero quando ontem (último dia agendado passado) falhou e hoje não foi feito", () => {
    const done = new Set(["2024-01-05"]);
    expect(currentStreak(diaria, done, "2024-01-10")).toBe(0);
  });
});

describe("bestStreak", () => {
  it("encontra a maior sequência consecutiva na janela", () => {
    const done = new Set([
      "2024-01-01",
      "2024-01-02",
      "2024-01-03",
      // lacuna em 04
      "2024-01-05",
      "2024-01-06",
      "2024-01-07",
      "2024-01-08",
    ]);
    expect(bestStreak(diaria, done, "2024-01-01", "2024-01-10")).toBe(4);
  });
  it("conta só dias agendados (dias específicos)", () => {
    const done = new Set([
      "2024-01-01", // seg
      "2024-01-03", // qua
      "2024-01-05", // sex
      "2024-01-08", // seg
    ]);
    expect(bestStreak(segQuaSex, done, "2024-01-01", "2024-01-12")).toBe(4);
  });
  it("zero quando nenhum dia foi concluído", () => {
    expect(bestStreak(diaria, new Set(), "2024-01-01", "2024-01-07")).toBe(0);
  });
});

describe("reachedTarget", () => {
  it("atinge quando value >= target", () => {
    expect(reachedTarget(8, 8)).toBe(true);
    expect(reachedTarget(10, 8)).toBe(true);
    expect(reachedTarget(7, 8)).toBe(false);
  });
  it("sem meta (0): qualquer valor positivo conta", () => {
    expect(reachedTarget(1, 0)).toBe(true);
    expect(reachedTarget(0, 0)).toBe(false);
  });
});
