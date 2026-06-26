import { describe, expect, it } from "vitest";
import {
  expandOccurrences,
  fromRRule,
  toRRule,
} from "@/lib/calendar/recurrence";

const D = (s: string) => new Date(s);

describe("expandOccurrences — não recorrente", () => {
  it("devolve a própria ocorrência quando intersecta a janela", () => {
    const occ = expandOccurrences(
      { start: D("2026-06-15T09:00"), end: D("2026-06-15T10:00"), freq: null, interval: 1, until: null },
      D("2026-06-01T00:00"),
      D("2026-06-30T23:59"),
    );
    expect(occ).toHaveLength(1);
    expect(occ[0].index).toBe(0);
  });

  it("vazio quando fora da janela", () => {
    const occ = expandOccurrences(
      { start: D("2026-07-15T09:00"), end: D("2026-07-15T10:00"), freq: null, interval: 1, until: null },
      D("2026-06-01T00:00"),
      D("2026-06-30T23:59"),
    );
    expect(occ).toHaveLength(0);
  });
});

describe("expandOccurrences — diária/semanal", () => {
  it("diária intervalo 1 gera uma ocorrência por dia na janela", () => {
    const occ = expandOccurrences(
      { start: D("2026-06-15T09:00"), end: D("2026-06-15T10:00"), freq: "diaria", interval: 1, until: null },
      D("2026-06-15T00:00"),
      D("2026-06-19T23:59"),
    );
    expect(occ).toHaveLength(5);
    expect(occ[0].start.getDate()).toBe(15);
    expect(occ[4].start.getDate()).toBe(19);
  });

  it("semanal mantém o dia da semana", () => {
    const occ = expandOccurrences(
      { start: D("2026-06-15T09:00"), end: D("2026-06-15T10:00"), freq: "semanal", interval: 1, until: null },
      D("2026-06-01T00:00"),
      D("2026-07-15T23:59"),
    );
    const weekdays = new Set(occ.map((o) => o.start.getDay()));
    expect(weekdays.size).toBe(1);
  });

  it("respeita o `until`", () => {
    const occ = expandOccurrences(
      { start: D("2026-06-15T09:00"), end: D("2026-06-15T10:00"), freq: "diaria", interval: 1, until: D("2026-06-17T00:00") },
      D("2026-06-15T00:00"),
      D("2026-06-30T23:59"),
    );
    expect(occ.map((o) => o.start.getDate())).toEqual([15, 16, 17]);
  });

  it("mensal preserva a âncora de fim de mês (sem drift)", () => {
    const occ = expandOccurrences(
      { start: D("2026-01-31T09:00"), end: D("2026-01-31T10:00"), freq: "mensal", interval: 1, until: null },
      D("2026-01-01T00:00"),
      D("2026-04-30T23:59"),
    );
    expect(occ.map((o) => o.start.getMonth())).toEqual([0, 1, 2, 3]);
    // Fev cai em 28 (clamp), mar volta para 31.
    expect(occ[1].start.getDate()).toBe(28);
    expect(occ[2].start.getDate()).toBe(31);
  });
});

describe("toRRule / fromRRule", () => {
  it("ida e volta preservam frequência e intervalo", () => {
    const rrule = toRRule({ freq: "semanal", interval: 2, until: null });
    expect(rrule[0]).toContain("FREQ=WEEKLY");
    expect(rrule[0]).toContain("INTERVAL=2");
    const parsed = fromRRule(rrule);
    expect(parsed?.freq).toBe("semanal");
    expect(parsed?.interval).toBe(2);
  });

  it("inclui e lê o UNTIL", () => {
    const rrule = toRRule({ freq: "diaria", interval: 1, until: new Date("2026-12-31T00:00:00Z") });
    expect(rrule[0]).toContain("UNTIL=20261231");
    expect(fromRRule(rrule)?.until).toBe("2026-12-31");
  });

  it("sem frequência → array vazio e parse null", () => {
    expect(toRRule({ freq: null, interval: 1, until: null })).toEqual([]);
    expect(fromRRule([])).toBeNull();
    expect(fromRRule(null)).toBeNull();
  });
});
