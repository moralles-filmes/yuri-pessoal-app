import { describe, expect, it } from "vitest";
import { computeDueOccurrences, occurrenceOn } from "@/lib/finance/recurrence";

describe("occurrenceOn (clamp de fim de mês)", () => {
  it("mensal no dia 31 preserva a âncora (28/29 → 31)", () => {
    expect(occurrenceOn("2026-01-31", "mensal", 1, 0)).toBe("2026-01-31");
    expect(occurrenceOn("2026-01-31", "mensal", 1, 1)).toBe("2026-02-28");
    expect(occurrenceOn("2026-01-31", "mensal", 1, 2)).toBe("2026-03-31");
    expect(occurrenceOn("2026-01-31", "mensal", 1, 3)).toBe("2026-04-30");
  });

  it("mensal no dia 31 em ano bissexto cai em 29/02", () => {
    expect(occurrenceOn("2024-01-31", "mensal", 1, 1)).toBe("2024-02-29");
  });

  it("anual em 29/02 cai em 28/02 no ano não-bissexto", () => {
    expect(occurrenceOn("2024-02-29", "anual", 1, 1)).toBe("2025-02-28");
  });

  it("mensal no dia 15 não sofre clamp", () => {
    expect(occurrenceOn("2026-01-15", "mensal", 1, 3)).toBe("2026-04-15");
  });
});

describe("computeDueOccurrences — diária", () => {
  it("intervalo 1 atravessa a virada de mês", () => {
    const plan = computeDueOccurrences(
      { frequency: "diaria", intervalCount: 1, anchorDate: "2026-01-30", nextDueDate: "2026-01-30" },
      "2026-02-02",
    );
    expect(plan.dueDates).toEqual([
      "2026-01-30",
      "2026-01-31",
      "2026-02-01",
      "2026-02-02",
    ]);
    expect(plan.newNextDueDate).toBe("2026-02-03");
    expect(plan.finished).toBe(false);
  });

  it("intervalo 3", () => {
    const plan = computeDueOccurrences(
      { frequency: "diaria", intervalCount: 3, anchorDate: "2026-01-01", nextDueDate: "2026-01-01" },
      "2026-01-10",
    );
    expect(plan.dueDates).toEqual([
      "2026-01-01",
      "2026-01-04",
      "2026-01-07",
      "2026-01-10",
    ]);
    expect(plan.newNextDueDate).toBe("2026-01-13");
  });
});

describe("computeDueOccurrences — semanal", () => {
  it("intervalo 1 atravessa a virada de mês", () => {
    const plan = computeDueOccurrences(
      { frequency: "semanal", intervalCount: 1, anchorDate: "2026-01-20", nextDueDate: "2026-01-20" },
      "2026-02-10",
    );
    expect(plan.dueDates).toEqual([
      "2026-01-20",
      "2026-01-27",
      "2026-02-03",
      "2026-02-10",
    ]);
    expect(plan.newNextDueDate).toBe("2026-02-17");
  });

  it("intervalo 2", () => {
    const plan = computeDueOccurrences(
      { frequency: "semanal", intervalCount: 2, anchorDate: "2026-01-01", nextDueDate: "2026-01-01" },
      "2026-02-01",
    );
    expect(plan.dueDates).toEqual(["2026-01-01", "2026-01-15", "2026-01-29"]);
    expect(plan.newNextDueDate).toBe("2026-02-12");
  });
});

describe("computeDueOccurrences — mensal", () => {
  it("dia 31: Jan → Fev28 → Mar31 → Abr30", () => {
    const plan = computeDueOccurrences(
      { frequency: "mensal", intervalCount: 1, anchorDate: "2026-01-31", nextDueDate: "2026-01-31" },
      "2026-04-30",
    );
    expect(plan.dueDates).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
    ]);
    expect(plan.newNextDueDate).toBe("2026-05-31");
  });

  it("catch-up de muitos meses (13 ocorrências)", () => {
    const plan = computeDueOccurrences(
      { frequency: "mensal", intervalCount: 1, anchorDate: "2025-01-15", nextDueDate: "2025-01-15" },
      "2026-01-15",
    );
    expect(plan.dueDates).toHaveLength(13);
    expect(plan.dueDates[0]).toBe("2025-01-15");
    expect(plan.dueDates[12]).toBe("2026-01-15");
    expect(plan.newNextDueDate).toBe("2026-02-15");
  });
});

describe("computeDueOccurrences — bordas", () => {
  it("nextDueDate no futuro: nada a gerar", () => {
    const plan = computeDueOccurrences(
      { frequency: "mensal", intervalCount: 1, anchorDate: "2026-01-10", nextDueDate: "2026-06-10" },
      "2026-01-15",
    );
    expect(plan.dueDates).toEqual([]);
    expect(plan.newNextDueDate).toBe("2026-06-10");
    expect(plan.finished).toBe(false);
  });

  it("endDate atingido: encerra a recorrência", () => {
    const plan = computeDueOccurrences(
      {
        frequency: "mensal",
        intervalCount: 1,
        anchorDate: "2026-01-01",
        nextDueDate: "2026-01-01",
        endDate: "2026-03-01",
      },
      "2026-12-01",
    );
    expect(plan.dueDates).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
    expect(plan.newNextDueDate).toBeNull();
    expect(plan.finished).toBe(true);
  });

  it("intervalo inválido (0) é tratado como 1", () => {
    const plan = computeDueOccurrences(
      { frequency: "diaria", intervalCount: 0, anchorDate: "2026-01-01", nextDueDate: "2026-01-01" },
      "2026-01-03",
    );
    expect(plan.dueDates).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
  });
});
