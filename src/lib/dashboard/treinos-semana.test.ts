/**
 * REDESIGN-06 T12 — barras Seg→Dom do card de Treinos (D-06-M2).
 *
 * Invariante 22 de Treinos: o calendário não cobra. Nenhum estado vira "falta".
 */
import { describe, expect, it } from "vitest";
import type { ConsistencyDay, ConsistencyState } from "@/lib/training/dashboards";
import { semanaDoCard } from "./treinos-semana";

const dia = (
  date: string,
  state: ConsistencyState,
  isToday = false,
): ConsistencyDay => ({ date, state, sessions: 0, volumeKg: 0, workouts: [], isToday });

describe("semanaDoCard · mapeamento de estados (D-06-M2)", () => {
  it.each<[string, ConsistencyDay, string]>([
    ["treinado", dia("2026-11-16", "treinado"), "treinou"],
    ["parcial (sessão abandonada continua sendo treino)", dia("2026-11-16", "parcial"), "treinou"],
    [
      "planejado_sem_execucao hoje",
      dia("2026-11-16", "planejado_sem_execucao", true),
      "planejado",
    ],
    [
      "planejado_sem_execucao num dia que passou",
      dia("2026-11-16", "planejado_sem_execucao", false),
      "livre",
    ],
    ["descanso", dia("2026-11-16", "descanso"), "descanso"],
    ["livre", dia("2026-11-16", "livre"), "livre"],
    ["futuro", dia("2026-11-16", "futuro"), "a_seguir"],
  ])("%s", (_nome, entrada, esperado) => {
    expect(semanaDoCard([entrada])[0].estado).toBe(esperado);
  });
});

describe("semanaDoCard · rótulos", () => {
  const semana = (inicio: string): ConsistencyDay[] => {
    const [a, m, d] = inicio.split("-").map(Number);
    return Array.from({ length: 7 }, (_, i) => {
      const iso = new Date(Date.UTC(a, m - 1, d + i)).toISOString().slice(0, 10);
      return dia(iso, "livre");
    });
  };

  it("semana que começa no domingo vai de Dom a Sáb", () => {
    const r = semanaDoCard(semana("2026-11-15"));
    expect(r).toHaveLength(7);
    expect(r[0].rotulo).toBe("Dom");
    expect(r[6].rotulo).toBe("Sáb");
  });

  it("semana que começa na segunda vai de Seg a Dom", () => {
    const r = semanaDoCard(semana("2026-11-16"));
    expect(r[0].rotulo).toBe("Seg");
    expect(r[6].rotulo).toBe("Dom");
  });

  it("devolve a data junto do rótulo", () => {
    expect(semanaDoCard(semana("2026-11-16"))[2].data).toBe("2026-11-18");
  });
});
