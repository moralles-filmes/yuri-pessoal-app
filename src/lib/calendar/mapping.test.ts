import { describe, expect, it } from "vitest";
import {
  eventToGoogleResource,
  googleToEventFields,
} from "@/lib/calendar/mapping";

describe("eventToGoogleResource", () => {
  const baseRow = {
    title: "Reunião",
    description: "pauta",
    location: "Sala 1",
    start_at: "2026-06-15T12:00:00.000Z",
    end_at: "2026-06-15T13:00:00.000Z",
    all_day: false,
    recurrence_freq: null as null,
    recurrence_interval: 1,
    recurrence_until: null as null,
    reminder_minutes: 15 as number | null,
  };

  it("evento com horário usa dateTime e lembrete como override", () => {
    const r = eventToGoogleResource(baseRow);
    expect(r.summary).toBe("Reunião");
    expect(r.start?.dateTime).toBe("2026-06-15T12:00:00.000Z");
    expect(r.end?.dateTime).toBe("2026-06-15T13:00:00.000Z");
    expect(r.reminders?.overrides).toEqual([{ method: "popup", minutes: 15 }]);
  });

  it("evento dia inteiro usa date e end.date exclusivo (+1 dia)", () => {
    const r = eventToGoogleResource({
      ...baseRow,
      all_day: true,
      start_at: "2026-06-10T12:00:00.000Z",
      end_at: "2026-06-10T12:00:00.000Z",
    });
    expect(r.start?.date).toBe("2026-06-10");
    expect(r.end?.date).toBe("2026-06-11");
    expect(r.start?.dateTime).toBeUndefined();
  });

  it("recorrência vira RRULE", () => {
    const r = eventToGoogleResource({
      ...baseRow,
      recurrence_freq: "semanal",
      recurrence_interval: 1,
    });
    expect(r.recurrence?.[0]).toContain("FREQ=WEEKLY");
  });

  it("sem lembrete → overrides vazio", () => {
    const r = eventToGoogleResource({ ...baseRow, reminder_minutes: null });
    expect(r.reminders).toEqual({ useDefault: false, overrides: [] });
  });
});

describe("googleToEventFields", () => {
  it("evento com horário passa o dateTime adiante", () => {
    const fields = googleToEventFields({
      id: "g1",
      etag: "etag-1",
      summary: "Call",
      start: { dateTime: "2026-06-15T09:00:00-03:00" },
      end: { dateTime: "2026-06-15T10:00:00-03:00" },
    });
    expect(fields.all_day).toBe(false);
    expect(fields.start_at).toBe("2026-06-15T09:00:00-03:00");
    expect(fields.google_event_id).toBe("g1");
    expect(fields.etag).toBe("etag-1");
  });

  it("evento dia inteiro converte end.date exclusivo para o último dia", () => {
    const fields = googleToEventFields({
      id: "g2",
      etag: "etag-2",
      summary: "Feriado",
      start: { date: "2026-06-10" },
      end: { date: "2026-06-11" },
    });
    expect(fields.all_day).toBe(true);
    expect(fields.start_at).toBe("2026-06-10T12:00:00.000Z");
    expect(fields.end_at).toBe("2026-06-10T12:00:00.000Z");
  });

  it("título vazio recebe fallback", () => {
    const fields = googleToEventFields({ id: "g3", etag: "e", start: { dateTime: "2026-06-15T09:00:00Z" } });
    expect(fields.title).toBe("(Sem título)");
  });

  it("RRULE do Google é interpretado", () => {
    const fields = googleToEventFields({
      id: "g4",
      etag: "e",
      summary: "Aula",
      start: { dateTime: "2026-06-15T09:00:00Z" },
      end: { dateTime: "2026-06-15T10:00:00Z" },
      recurrence: ["RRULE:FREQ=WEEKLY;INTERVAL=1"],
    });
    expect(fields.recurrence_freq).toBe("semanal");
    expect(fields.recurrence_interval).toBe(1);
  });

  it("lembrete vem do primeiro override", () => {
    const fields = googleToEventFields({
      id: "g5",
      etag: "e",
      summary: "X",
      start: { dateTime: "2026-06-15T09:00:00Z" },
      end: { dateTime: "2026-06-15T10:00:00Z" },
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 30 }] },
    });
    expect(fields.reminder_minutes).toBe(30);
  });
});
