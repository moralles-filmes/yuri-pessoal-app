/**
 * Fase 17-F — tipo do dia (treino/descanso) que a Dieta consome.
 *
 * O que estes testes travam:
 *  • dia sem nada é `null` — NUNCA "descanso" (ausência de dado não é zero);
 *  • treinar num dia marcado como descanso faz o dia ser de treino (realidade > intenção);
 *  • cancelado e reagendado não classificam o dia;
 *  • a mescla com o plano da Dieta preserva o que ela já sabia.
 */
import { describe, expect, it } from "vitest";
import { mergeDayKinds, trainingDayKindOn, trainingDayKinds } from "./day-kind";
import type { ScheduleStatus } from "./constants";

const entry = (
  scheduledDate: string,
  entryKind: "treino" | "descanso",
  status: ScheduleStatus = "planejado",
) => ({ scheduledDate, entryKind, status });

const session = (sessionDate: string, status = "concluida") => ({ sessionDate, status });

describe("trainingDayKinds", () => {
  it("dia planejado com treino é dia de treino", () => {
    const map = trainingDayKinds({ entries: [entry("2026-08-06", "treino")], sessions: [] });
    expect(map.get("2026-08-06")).toBe("treino");
  });

  it("dia com marcador de descanso é dia de descanso", () => {
    const map = trainingDayKinds({ entries: [entry("2026-08-07", "descanso")], sessions: [] });
    expect(map.get("2026-08-07")).toBe("descanso");
  });

  it("DIA SEM NADA É null — nunca 'descanso'", () => {
    const map = trainingDayKinds({ entries: [], sessions: [] });
    expect(map.get("2026-08-08")).toBeUndefined();
    expect(trainingDayKindOn(map, "2026-08-08")).toBeNull();
  });

  it("treinar num dia marcado como descanso faz o dia ser de TREINO", () => {
    const map = trainingDayKinds({
      entries: [entry("2026-08-09", "descanso")],
      sessions: [session("2026-08-09")],
    });
    expect(map.get("2026-08-09")).toBe("treino");
  });

  it("sessão não concluída não classifica o dia", () => {
    const map = trainingDayKinds({
      entries: [],
      sessions: [session("2026-08-10", "abandonada"), session("2026-08-11", "ativa")],
    });
    expect(trainingDayKindOn(map, "2026-08-10")).toBeNull();
    expect(trainingDayKindOn(map, "2026-08-11")).toBeNull();
  });

  it("cancelado e reagendado não classificam o dia", () => {
    const map = trainingDayKinds({
      entries: [
        entry("2026-08-12", "treino", "cancelado"),
        entry("2026-08-13", "treino", "reagendado"),
        entry("2026-08-14", "descanso", "cancelado"),
      ],
      sessions: [],
    });
    expect(trainingDayKindOn(map, "2026-08-12")).toBeNull();
    expect(trainingDayKindOn(map, "2026-08-13")).toBeNull();
    expect(trainingDayKindOn(map, "2026-08-14")).toBeNull();
  });

  it("treino planejado vence descanso planejado no mesmo dia", () => {
    const map = trainingDayKinds({
      entries: [entry("2026-08-15", "descanso"), entry("2026-08-15", "treino")],
      sessions: [],
    });
    expect(map.get("2026-08-15")).toBe("treino");
  });

  it("planejamento 'nao_realizado' continua dizendo que o dia era de treino", () => {
    // O dia FOI planejado como treino; não ter acontecido é outra informação (e a aderência
    // cuida dela). Para a meta nutricional daquele dia, a intenção declarada é o que existe.
    const map = trainingDayKinds({
      entries: [entry("2026-08-16", "treino", "nao_realizado")],
      sessions: [],
    });
    expect(map.get("2026-08-16")).toBe("treino");
  });
});

describe("mergeDayKinds", () => {
  it("Treinos vence onde tem resposta; o plano da Dieta preenche o resto", () => {
    const dieta = new Map<string, "treino" | "descanso" | null>([
      ["2026-08-06", "descanso"],
      ["2026-08-07", "treino"],
    ]);
    const treinos = new Map<string, "treino" | "descanso">([["2026-08-06", "treino"]]);

    const merged = mergeDayKinds(dieta, treinos);
    expect(merged.get("2026-08-06")).toBe("treino"); // Treinos venceu
    expect(merged.get("2026-08-07")).toBe("treino"); // veio da Dieta, preservado
  });

  it("não inventa dia: chave que ninguém classificou continua ausente", () => {
    const merged = mergeDayKinds(new Map(), new Map());
    expect(merged.size).toBe(0);
  });
});