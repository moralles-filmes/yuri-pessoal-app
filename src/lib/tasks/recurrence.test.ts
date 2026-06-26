import { describe, expect, it } from "vitest";
import {
  materializeNext,
  nextOccurrence,
  normalizeRecurrence,
  type TaskRecurrence,
} from "@/lib/tasks/recurrence";

describe("nextOccurrence — diária", () => {
  it("avança pelo intervalo de dias (virada de mês)", () => {
    const rule: TaskRecurrence = { freq: "diaria", interval: 1 };
    expect(nextOccurrence(rule, "2026-01-31")).toBe("2026-02-01");
  });
  it("respeita intervalo > 1", () => {
    const rule: TaskRecurrence = { freq: "diaria", interval: 3 };
    expect(nextOccurrence(rule, "2026-02-27")).toBe("2026-03-02");
  });
});

describe("nextOccurrence — semanal", () => {
  it("sem weekdays: avança N semanas", () => {
    expect(nextOccurrence({ freq: "semanal", interval: 1 }, "2026-06-26")).toBe(
      "2026-07-03",
    );
    expect(nextOccurrence({ freq: "semanal", interval: 2 }, "2026-06-26")).toBe(
      "2026-07-10",
    );
  });
  it("com weekdays [seg,qua,sex]: próximo dia listado", () => {
    // 2024-01-01 é segunda (1).
    const rule: TaskRecurrence = { freq: "semanal", interval: 1, weekdays: [1, 3, 5] };
    expect(nextOccurrence(rule, "2024-01-01")).toBe("2024-01-03"); // seg → qua
    expect(nextOccurrence(rule, "2024-01-03")).toBe("2024-01-05"); // qua → sex
  });
  it("com weekdays: vira a semana (sex → seg)", () => {
    const rule: TaskRecurrence = { freq: "semanal", interval: 1, weekdays: [1, 3, 5] };
    expect(nextOccurrence(rule, "2024-01-05")).toBe("2024-01-08"); // sex → seg
  });
});

describe("nextOccurrence — mensal/anual (âncora com clamp de mês curto)", () => {
  it("mensal: 31/jan → 28/fev (mês curto)", () => {
    expect(nextOccurrence({ freq: "mensal", interval: 1 }, "2026-01-31")).toBe(
      "2026-02-28",
    );
  });
  it("mensal: intervalo 2", () => {
    expect(nextOccurrence({ freq: "mensal", interval: 2 }, "2026-01-15")).toBe(
      "2026-03-15",
    );
  });
  it("anual: 29/fev (bissexto) → 28/fev", () => {
    expect(nextOccurrence({ freq: "anual", interval: 1 }, "2024-02-29")).toBe(
      "2025-02-28",
    );
  });
});

describe("nextOccurrence — until (limite inclusivo)", () => {
  it("retorna null quando a próxima passa de until", () => {
    const rule: TaskRecurrence = { freq: "diaria", interval: 1, until: "2026-01-31" };
    expect(nextOccurrence(rule, "2026-01-31")).toBeNull();
  });
  it("inclui a data exatamente igual a until", () => {
    const rule: TaskRecurrence = { freq: "diaria", interval: 1, until: "2026-01-31" };
    expect(nextOccurrence(rule, "2026-01-30")).toBe("2026-01-31");
  });
});

describe("materializeNext", () => {
  it("desloca início e vencimento pelo mesmo delta (ancorado no vencimento)", () => {
    const rule: TaskRecurrence = { freq: "diaria", interval: 1 };
    const next = materializeNext(rule, {
      startDate: "2026-01-10",
      dueDate: "2026-01-12",
    });
    expect(next).toEqual({ startDate: "2026-01-11", dueDate: "2026-01-13" });
  });
  it("ancora no início quando não há vencimento", () => {
    const rule: TaskRecurrence = { freq: "semanal", interval: 1 };
    const next = materializeNext(rule, {
      startDate: "2026-01-10",
      dueDate: null,
    });
    expect(next).toEqual({ startDate: "2026-01-17", dueDate: null });
  });
  it("retorna null quando a recorrência encerrou (passou de until)", () => {
    const rule: TaskRecurrence = { freq: "diaria", interval: 1, until: "2026-01-12" };
    expect(
      materializeNext(rule, { startDate: null, dueDate: "2026-01-12" }),
    ).toBeNull();
  });
  it("retorna null sem data-âncora", () => {
    const rule: TaskRecurrence = { freq: "diaria", interval: 1 };
    expect(materializeNext(rule, { startDate: null, dueDate: null })).toBeNull();
  });
});

describe("normalizeRecurrence", () => {
  it("rejeita valores ausentes ou freq inválida", () => {
    expect(normalizeRecurrence(null)).toBeNull();
    expect(normalizeRecurrence({ freq: "bad" })).toBeNull();
  });
  it("normaliza interval, weekdays (dedup/ordena/filtra) e until", () => {
    expect(
      normalizeRecurrence({
        freq: "semanal",
        interval: "2",
        weekdays: [3, 1, 1, 9, -1],
        until: "2026-06-30",
      }),
    ).toEqual({ freq: "semanal", interval: 2, weekdays: [1, 3], until: "2026-06-30" });
  });
  it("aplica defaults para uma recorrência diária mínima", () => {
    expect(normalizeRecurrence({ freq: "diaria" })).toEqual({
      freq: "diaria",
      interval: 1,
      weekdays: null,
      until: null,
    });
  });
});
