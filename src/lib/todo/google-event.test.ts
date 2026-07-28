import { describe, expect, it } from "vitest";
import {
  DEFAULT_DURATION_MINUTES,
  addMinutesToDateTime,
  taskToGoogleEvent,
  timeToMinutes,
  type TodoGoogleEventInput,
} from "@/lib/todo/google-event";

const BASE: TodoGoogleEventInput = {
  title: "Pagar internet",
  description: null,
  scheduledDate: "2026-07-29",
  scheduledTime: null,
  durationMinutes: null,
  status: "pendente",
  timezone: "America/Sao_Paulo",
};

describe("timeToMinutes", () => {
  it("aceita HH:mm e HH:mm:ss", () => {
    expect(timeToMinutes("10:00")).toBe(600);
    expect(timeToMinutes("10:30:00")).toBe(630);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  it("rejeita valores fora da faixa e lixo", () => {
    expect(timeToMinutes("24:00")).toBeNull();
    expect(timeToMinutes("10:60")).toBeNull();
    expect(timeToMinutes("manhã")).toBeNull();
  });
});

describe("addMinutesToDateTime", () => {
  it("soma dentro do mesmo dia", () => {
    expect(addMinutesToDateTime("2026-07-29", "10:00", 30)).toEqual({
      date: "2026-07-29",
      time: "10:30",
    });
  });

  it("vira o dia quando passa da meia-noite", () => {
    expect(addMinutesToDateTime("2026-07-29", "23:45", 30)).toEqual({
      date: "2026-07-30",
      time: "00:15",
    });
  });

  it("vira o mês e o ano corretamente", () => {
    expect(addMinutesToDateTime("2026-12-31", "23:30", 60)).toEqual({
      date: "2027-01-01",
      time: "00:30",
    });
  });
});

describe("taskToGoogleEvent", () => {
  it("tarefa sem data não vira evento", () => {
    expect(taskToGoogleEvent({ ...BASE, scheduledDate: null })).toBeNull();
  });

  it("cancelada e arquivada não vão para o calendário", () => {
    expect(taskToGoogleEvent({ ...BASE, status: "cancelada" })).toBeNull();
    expect(taskToGoogleEvent({ ...BASE, status: "arquivada" })).toBeNull();
  });

  it("concluída PERMANECE no calendário — aconteceu de fato", () => {
    expect(taskToGoogleEvent({ ...BASE, status: "concluida" })).not.toBeNull();
  });

  it("sem horário vira dia inteiro com fim exclusivo", () => {
    const event = taskToGoogleEvent(BASE);
    expect(event?.start).toEqual({ date: "2026-07-29" });
    expect(event?.end).toEqual({ date: "2026-07-30" });
    expect(event?.summary).toBe("Pagar internet");
  });

  it("com horário usa hora local + timeZone, nunca UTC convertido à mão", () => {
    expect(DEFAULT_DURATION_MINUTES).toBe(30);
    const event = taskToGoogleEvent({ ...BASE, scheduledTime: "10:00" });
    expect(event?.start).toEqual({
      dateTime: "2026-07-29T10:00:00",
      timeZone: "America/Sao_Paulo",
    });
    // Sem duração informada, aplica o padrão de 30 min.
    expect(event?.end).toEqual({
      dateTime: "2026-07-29T10:30:00",
      timeZone: "America/Sao_Paulo",
    });
  });

  it("respeita a duração informada", () => {
    const event = taskToGoogleEvent({
      ...BASE,
      scheduledTime: "14:00",
      durationMinutes: 90,
    });
    expect(event?.end).toEqual({
      dateTime: "2026-07-29T15:30:00",
      timeZone: "America/Sao_Paulo",
    });
  });

  it("evento que atravessa a meia-noite termina no dia seguinte", () => {
    const event = taskToGoogleEvent({
      ...BASE,
      scheduledTime: "23:00",
      durationMinutes: 120,
    });
    expect(event?.start?.dateTime).toBe("2026-07-29T23:00:00");
    expect(event?.end?.dateTime).toBe("2026-07-30T01:00:00");
  });

  it("horário inválido no banco cai para dia inteiro em vez de mandar lixo", () => {
    const event = taskToGoogleEvent({ ...BASE, scheduledTime: "99:99" });
    expect(event?.start).toEqual({ date: "2026-07-29" });
    expect(event?.end).toEqual({ date: "2026-07-30" });
  });

  it("leva a descrição quando existe", () => {
    const event = taskToGoogleEvent({ ...BASE, description: "Boleto do mês" });
    expect(event?.description).toBe("Boleto do mês");
  });

  it("NUNCA publica RRULE — só a ocorrência atual", () => {
    const event = taskToGoogleEvent({ ...BASE, scheduledTime: "08:00" });
    expect(event?.recurrence).toBeUndefined();
  });

  it("é puro: mesma entrada, mesma saída", () => {
    const input = { ...BASE, scheduledTime: "09:15", durationMinutes: 45 };
    expect(taskToGoogleEvent(input)).toEqual(taskToGoogleEvent(input));
  });
});
