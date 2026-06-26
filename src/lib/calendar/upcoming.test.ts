import { describe, expect, it } from "vitest";
import { proximosCompromissos, relativeDayLabel } from "@/lib/calendar/upcoming";
import type { CalendarEventLite } from "@/lib/calendar/events";

const ev = (id: string, start: string, end: string): CalendarEventLite => ({
  id,
  title: id,
  start: new Date(start),
  end: new Date(end),
  allDay: false,
  tipo: "pessoal",
});

describe("proximosCompromissos", () => {
  const now = new Date("2026-06-15T12:00:00");

  it("ignora eventos já terminados e ordena por início", () => {
    const events = [
      ev("passado", "2026-06-15T08:00", "2026-06-15T09:00"),
      ev("daqui-a-pouco", "2026-06-15T14:00", "2026-06-15T15:00"),
      ev("amanha", "2026-06-16T10:00", "2026-06-16T11:00"),
    ];
    const out = proximosCompromissos(events, now, 5);
    expect(out.map((e) => e.id)).toEqual(["daqui-a-pouco", "amanha"]);
  });

  it("inclui evento em andamento (começou, não terminou)", () => {
    const events = [ev("agora", "2026-06-15T11:30", "2026-06-15T12:30")];
    expect(proximosCompromissos(events, now).map((e) => e.id)).toEqual(["agora"]);
  });

  it("respeita o limite", () => {
    const events = [
      ev("a", "2026-06-15T13:00", "2026-06-15T14:00"),
      ev("b", "2026-06-15T15:00", "2026-06-15T16:00"),
      ev("c", "2026-06-15T17:00", "2026-06-15T18:00"),
    ];
    expect(proximosCompromissos(events, now, 2).map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("relativeDayLabel", () => {
  const now = new Date(2026, 5, 15, 12, 0);
  it("Hoje / Amanhã / null", () => {
    expect(relativeDayLabel(new Date(2026, 5, 15, 18, 0), now)).toBe("Hoje");
    expect(relativeDayLabel(new Date(2026, 5, 16, 9, 0), now)).toBe("Amanhã");
    expect(relativeDayLabel(new Date(2026, 5, 20, 9, 0), now)).toBeNull();
  });
});
