import { describe, expect, it } from "vitest";
import {
  computeAdherence,
  currentStreak,
  routineOccursOn,
  scheduledDatesInRange,
  type RoutineLike,
} from "@/lib/tasks/routines";

const diaria: RoutineLike = { frequency: "diaria", weekdays: null };
// 2024-01-01 = segunda (1); [1,3,5] = seg/qua/sex.
const segQuaSex: RoutineLike = {
  frequency: "dias_especificos",
  weekdays: [1, 3, 5],
};

describe("routineOccursOn", () => {
  it("diária ocorre todo dia", () => {
    expect(routineOccursOn(diaria, "2024-01-02")).toBe(true);
  });
  it("dias específicos respeitam o dia da semana", () => {
    expect(routineOccursOn(segQuaSex, "2024-01-01")).toBe(true); // seg
    expect(routineOccursOn(segQuaSex, "2024-01-02")).toBe(false); // ter
    expect(routineOccursOn(segQuaSex, "2024-01-06")).toBe(false); // sáb
  });
  it("rotina inativa nunca ocorre", () => {
    expect(
      routineOccursOn({ ...diaria, is_active: false }, "2024-01-02"),
    ).toBe(false);
  });
});

describe("scheduledDatesInRange", () => {
  it("lista as datas agendadas na janela (inclusiva)", () => {
    expect(scheduledDatesInRange(segQuaSex, "2024-01-01", "2024-01-07")).toEqual([
      "2024-01-01",
      "2024-01-03",
      "2024-01-05",
    ]);
  });
});

describe("computeAdherence", () => {
  it("conta agendados x cumpridos (5 de 7 dias diária)", () => {
    const done = new Set([
      "2024-01-01",
      "2024-01-02",
      "2024-01-04",
      "2024-01-05",
      "2024-01-07",
    ]);
    const a = computeAdherence(diaria, done, "2024-01-01", "2024-01-07");
    expect(a.scheduled).toBe(7);
    expect(a.done).toBe(5);
    expect(a.rate).toBeCloseTo(5 / 7);
  });
  it("conta apenas dias agendados (dias específicos)", () => {
    const done = new Set(["2024-01-01", "2024-01-05"]);
    const a = computeAdherence(segQuaSex, done, "2024-01-01", "2024-01-07");
    expect(a.scheduled).toBe(3);
    expect(a.done).toBe(2);
  });
  it("rate 0 quando nada foi agendado", () => {
    const semDias: RoutineLike = { frequency: "dias_especificos", weekdays: [] };
    const a = computeAdherence(semDias, new Set(), "2024-01-01", "2024-01-07");
    expect(a).toEqual({ scheduled: 0, done: 0, rate: 0 });
  });
});

describe("currentStreak", () => {
  it("pula dias não agendados e conta os cumpridos consecutivos", () => {
    const done = new Set(["2024-01-01", "2024-01-03", "2024-01-05"]);
    expect(currentStreak(segQuaSex, done, "2024-01-05")).toBe(3);
  });
  it("quebra quando o dia agendado mais recente não foi cumprido", () => {
    const done = new Set(["2024-01-01", "2024-01-03"]);
    expect(currentStreak(segQuaSex, done, "2024-01-05")).toBe(0);
  });
});
