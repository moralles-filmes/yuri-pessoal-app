/**
 * Fase 17-F — espelho do planejamento na agenda (mapeamento puro).
 *
 * O que estes testes travam:
 *  • descanso e cancelado NÃO viram evento (o chamador remove o que existir);
 *  • "não realizado" permanece — apagar o passado reescreveria o calendário;
 *  • sem horário → dia inteiro, com `end.date` EXCLUSIVO (dia seguinte);
 *  • com horário → hora local + timeZone de Brasília, nunca UTC convertido à mão;
 *  • virada de dia quando o treino da noite passa da meia-noite;
 *  • a descrição só leva o que o usuário escreveu (sem carga, sem medida, sem token).
 */
import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKOUT_MINUTES,
  scheduledWorkoutToGoogleEvent,
  trainingEventTitle,
  type TrainingGoogleEventInput,
} from "./google-event";

const base: TrainingGoogleEventInput = {
  entryKind: "treino",
  scheduledDate: "2026-08-06",
  plannedTime: null,
  plannedDurationMinutes: null,
  status: "planejado",
  workoutName: "Treino A — Empurrar",
  title: null,
  programName: "Push/Pull/Legs",
  notes: null,
};

describe("scheduledWorkoutToGoogleEvent", () => {
  it("dia de DESCANSO não vira evento", () => {
    expect(
      scheduledWorkoutToGoogleEvent({ ...base, entryKind: "descanso", workoutName: null }),
    ).toBeNull();
  });

  it("cancelado não vira evento", () => {
    expect(scheduledWorkoutToGoogleEvent({ ...base, status: "cancelado" })).toBeNull();
  });

  it("'não realizado' PERMANECE no calendário", () => {
    const event = scheduledWorkoutToGoogleEvent({ ...base, status: "nao_realizado" });
    expect(event).not.toBeNull();
  });

  it("'concluído' permanece — o compromisso existiu", () => {
    expect(scheduledWorkoutToGoogleEvent({ ...base, status: "concluido" })).not.toBeNull();
  });

  it("data inválida não vira evento", () => {
    expect(scheduledWorkoutToGoogleEvent({ ...base, scheduledDate: "06/08/2026" })).toBeNull();
  });

  it("sem horário vira evento de dia inteiro com fim EXCLUSIVO", () => {
    const event = scheduledWorkoutToGoogleEvent(base);
    expect(event?.start).toEqual({ date: "2026-08-06" });
    expect(event?.end).toEqual({ date: "2026-08-07" });
  });

  it("com horário usa hora local + timeZone de Brasília", () => {
    const event = scheduledWorkoutToGoogleEvent({
      ...base,
      plannedTime: "19:30",
      plannedDurationMinutes: 75,
    });
    expect(event?.start).toEqual({
      dateTime: "2026-08-06T19:30:00",
      timeZone: "America/Sao_Paulo",
    });
    expect(event?.end).toEqual({
      dateTime: "2026-08-06T20:45:00",
      timeZone: "America/Sao_Paulo",
    });
  });

  it("sem duração usa o padrão do módulo", () => {
    const event = scheduledWorkoutToGoogleEvent({ ...base, plannedTime: "07:00" });
    const fim = 7 * 60 + DEFAULT_WORKOUT_MINUTES;
    const esperado = `2026-08-06T${String(Math.floor(fim / 60)).padStart(2, "0")}:${String(
      fim % 60,
    ).padStart(2, "0")}:00`;
    expect(event?.end).toEqual({ dateTime: esperado, timeZone: "America/Sao_Paulo" });
  });

  it("treino da noite que passa da meia-noite vira o dia no fim", () => {
    const event = scheduledWorkoutToGoogleEvent({
      ...base,
      plannedTime: "23:30",
      plannedDurationMinutes: 90,
    });
    expect(event?.end).toEqual({
      dateTime: "2026-08-07T01:00:00",
      timeZone: "America/Sao_Paulo",
    });
  });

  it("hora inválida no banco cai para dia inteiro em vez de mandar lixo ao Google", () => {
    const event = scheduledWorkoutToGoogleEvent({ ...base, plannedTime: "99:99" });
    expect(event?.start).toEqual({ date: "2026-08-06" });
  });

  it("o título nunca é vazio e não expõe mais que o nome", () => {
    expect(trainingEventTitle(base)).toBe("Treino — Treino A — Empurrar");
    expect(trainingEventTitle({ ...base, workoutName: null, title: "Treino removido" })).toBe(
      "Treino — Treino removido",
    );
    expect(trainingEventTitle({ ...base, workoutName: null, title: null })).toBe("Treino");
    expect(trainingEventTitle({ ...base, workoutName: "   " })).toBe("Treino");
  });

  it("a descrição leva só programa e observação do usuário", () => {
    const event = scheduledWorkoutToGoogleEvent({ ...base, notes: "Levar cinto" });
    expect(event?.description).toBe("Programa: Push/Pull/Legs\nLevar cinto");

    const semNada = scheduledWorkoutToGoogleEvent({ ...base, programName: null, notes: null });
    expect(semNada?.description).toBeUndefined();
  });
});
