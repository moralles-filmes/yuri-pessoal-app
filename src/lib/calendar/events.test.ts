import { describe, expect, it } from "vitest";
import {
  eventInRange,
  eventOnDay,
  eventsForDay,
  isHappeningNow,
  sortByStart,
} from "@/lib/calendar/events";

const ev = (id: string, start: string, end: string) => ({
  id,
  start: new Date(start),
  end: new Date(end),
});

describe("eventOnDay", () => {
  it("true quando o evento intersecta o dia", () => {
    const day = new Date(2026, 5, 15);
    expect(eventOnDay(ev("a", "2026-06-15T09:00", "2026-06-15T10:00"), day)).toBe(true);
  });

  it("true para evento que atravessa a meia-noite para dentro do dia", () => {
    const day = new Date(2026, 5, 15);
    expect(eventOnDay(ev("a", "2026-06-14T23:00", "2026-06-15T01:00"), day)).toBe(true);
  });

  it("false quando o evento é em outro dia", () => {
    const day = new Date(2026, 5, 15);
    expect(eventOnDay(ev("a", "2026-06-16T09:00", "2026-06-16T10:00"), day)).toBe(false);
  });
});

describe("eventsForDay", () => {
  it("filtra e ordena por início", () => {
    const day = new Date(2026, 5, 15);
    const events = [
      ev("tarde", "2026-06-15T15:00", "2026-06-15T16:00"),
      ev("manha", "2026-06-15T08:00", "2026-06-15T09:00"),
      ev("fora", "2026-06-16T08:00", "2026-06-16T09:00"),
    ];
    const out = eventsForDay(events, day);
    expect(out.map((e) => e.id)).toEqual(["manha", "tarde"]);
  });
});

describe("sortByStart", () => {
  it("empata pelo fim (mais curto primeiro)", () => {
    const a = ev("longo", "2026-06-15T08:00", "2026-06-15T12:00");
    const b = ev("curto", "2026-06-15T08:00", "2026-06-15T09:00");
    expect(sortByStart([a, b]).map((e) => e.id)).toEqual(["curto", "longo"]);
  });
});

describe("eventInRange / isHappeningNow", () => {
  it("eventInRange detecta sobreposição com a janela", () => {
    const from = new Date(2026, 5, 1);
    const to = new Date(2026, 5, 30);
    expect(eventInRange(ev("x", "2026-06-15T08:00", "2026-06-15T09:00"), from, to)).toBe(true);
    expect(eventInRange(ev("x", "2026-07-15T08:00", "2026-07-15T09:00"), from, to)).toBe(false);
  });

  it("isHappeningNow true quando now está dentro do evento", () => {
    const now = new Date("2026-06-15T08:30");
    expect(isHappeningNow(ev("x", "2026-06-15T08:00", "2026-06-15T09:00"), now)).toBe(true);
    expect(isHappeningNow(ev("x", "2026-06-15T09:30", "2026-06-15T10:00"), now)).toBe(false);
  });
});
