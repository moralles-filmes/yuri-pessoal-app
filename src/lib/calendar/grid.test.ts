import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  buildWeekDays,
  dayHours,
  daySpan,
  layoutDayEvents,
} from "@/lib/calendar/grid";

describe("buildMonthGrid", () => {
  const today = new Date(2026, 5, 15);
  const { weeks } = buildMonthGrid(new Date(2026, 5, 10), { today });

  it("toda semana tem 7 dias e começa no domingo", () => {
    for (const w of weeks) {
      expect(w).toHaveLength(7);
      expect(w[0].date.getDay()).toBe(0);
    }
  });

  it("inclui todos os dias do mês de referência", () => {
    const inMonthDays = weeks.flat().filter((d) => d.inMonth);
    // Junho tem 30 dias.
    expect(inMonthDays).toHaveLength(30);
    expect(inMonthDays.every((d) => d.date.getMonth() === 5)).toBe(true);
  });

  it("marca isToday corretamente", () => {
    const todays = weeks.flat().filter((d) => d.isToday);
    expect(todays).toHaveLength(1);
    expect(todays[0].date.getDate()).toBe(15);
  });

  it("dias vazantes pertencem a meses vizinhos (inMonth=false)", () => {
    const first = weeks[0][0];
    expect(first.date.getDate()).toBe(31); // domingo 31/maio
    expect(first.inMonth).toBe(false);
  });
});

describe("buildWeekDays", () => {
  it("retorna 7 dias contendo a data de referência", () => {
    const today = new Date(2026, 5, 15);
    const days = buildWeekDays(new Date(2026, 5, 17), { today });
    expect(days).toHaveLength(7);
    expect(days.some((d) => d.date.getDate() === 17)).toBe(true);
    expect(days.filter((d) => d.isToday)).toHaveLength(1);
  });
});

describe("dayHours", () => {
  it("gera [0..23] por padrão", () => {
    expect(dayHours()).toHaveLength(24);
    expect(dayHours(8, 18)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  });
});

describe("daySpan", () => {
  const day = new Date(2026, 5, 15);

  it("evento dentro do dia → minutos corretos", () => {
    const span = daySpan(
      { start: new Date(2026, 5, 15, 9, 0), end: new Date(2026, 5, 15, 10, 30) },
      day,
    );
    expect(span).toEqual({ startMin: 540, endMin: 630 });
  });

  it("clampa evento que começa antes da meia-noite", () => {
    const span = daySpan(
      { start: new Date(2026, 5, 14, 22, 0), end: new Date(2026, 5, 15, 2, 0) },
      day,
    );
    expect(span).toEqual({ startMin: 0, endMin: 120 });
  });

  it("retorna null para evento em outro dia", () => {
    const span = daySpan(
      { start: new Date(2026, 5, 16, 9, 0), end: new Date(2026, 5, 16, 10, 0) },
      day,
    );
    expect(span).toBeNull();
  });
});

describe("layoutDayEvents — empacotamento de sobreposições", () => {
  const day = new Date(2026, 5, 15);

  it("dois eventos sobrepostos ocupam colunas distintas", () => {
    const events = [
      { id: "a", start: new Date(2026, 5, 15, 9, 0), end: new Date(2026, 5, 15, 10, 0) },
      { id: "b", start: new Date(2026, 5, 15, 9, 30), end: new Date(2026, 5, 15, 10, 30) },
    ];
    const out = layoutDayEvents(events, day);
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.colCount === 2)).toBe(true);
    expect(out.map((p) => p.col).sort()).toEqual([0, 1]);
  });

  it("eventos sem sobreposição ficam em coluna única", () => {
    const events = [
      { id: "a", start: new Date(2026, 5, 15, 9, 0), end: new Date(2026, 5, 15, 10, 0) },
      { id: "b", start: new Date(2026, 5, 15, 11, 0), end: new Date(2026, 5, 15, 12, 0) },
    ];
    const out = layoutDayEvents(events, day);
    expect(out.every((p) => p.colCount === 1 && p.col === 0)).toBe(true);
  });

  it("top/height em % refletem a posição no dia", () => {
    const events = [
      { id: "a", start: new Date(2026, 5, 15, 12, 0), end: new Date(2026, 5, 15, 13, 0) },
    ];
    const [p] = layoutDayEvents(events, day);
    expect(p.topPct).toBeCloseTo(50, 5); // meio-dia = 50%
    expect(p.heightPct).toBeCloseTo((60 / 1440) * 100, 5);
  });
});
