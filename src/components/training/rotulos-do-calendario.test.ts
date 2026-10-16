/**
 * REDESIGN-07-C · D4 — os calendários de Treinos dizem estado e hoje em palavras.
 * Dados sintéticos; `hoje` injetado.
 */
import { describe, expect, it } from "vitest";
import {
  dataPorExtenso,
  rotuloDaCelulaDoMes,
  rotuloDeAdicionar,
  rotuloDeDescanso,
  statusExibido,
  textoDaColunaDaSemana,
} from "./rotulos-do-calendario";
import { textoDoDiaDaConsistencia } from "./rotulos-da-consistencia";
import { rotuloDoChipDeSerie } from "./session/rotulos-da-sessao";
import type { ConsistencyDay } from "@/lib/training/dashboards";

const HOJE = "2026-10-11";
const treino = (scheduledDate: string, status: "planejado" | "concluido" | "nao_realizado" = "planejado") => ({
  entryKind: "treino",
  scheduledDate,
  status,
});
const descanso = (scheduledDate: string) => ({ entryKind: "descanso", scheduledDate, status: "planejado" as const });

describe("G2 — descanso nunca vira atrasado nem hoje", () => {
  it("descanso passado, de hoje e futuro: sempre 'descanso'", () => {
    expect(statusExibido(descanso("2026-10-01"), HOJE)).toBe("descanso");
    expect(statusExibido(descanso(HOJE), HOJE)).toBe("descanso");
    expect(statusExibido(descanso("2026-10-20"), HOJE)).toBe("descanso");
  });

  it("treino continua passando pela derivação de sempre", () => {
    expect(statusExibido(treino("2026-10-01"), HOJE)).toBe("atrasado");
    expect(statusExibido(treino(HOJE), HOJE)).toBe("hoje");
    expect(statusExibido(treino("2026-10-20"), HOJE)).toBe("planejado");
    expect(statusExibido(treino("2026-10-01", "concluido"), HOJE)).toBe("concluido");
  });
});

describe("a data escrita, não ISO", () => {
  it("dia da semana e data por extenso, sem depender do fuso", () => {
    expect(dataPorExtenso("2026-10-11")).toBe("Domingo, 11 de outubro de 2026");
    expect(dataPorExtenso("2026-03-02")).toBe("Segunda-feira, 2 de março de 2026");
    expect(dataPorExtenso("2024-02-29")).toBe("Quinta-feira, 29 de fevereiro de 2024");
  });

  it("botão de adicionar e de descanso dizem a data e se é hoje", () => {
    expect(rotuloDeAdicionar("2026-10-12", HOJE)).toBe("Adicionar treino em Segunda-feira, 12 de outubro de 2026");
    expect(rotuloDeAdicionar(HOJE, HOJE)).toBe("Adicionar treino em Domingo, 11 de outubro de 2026 (hoje)");
    expect(rotuloDeDescanso(HOJE, HOJE, false)).toMatch(/^Marcar descanso em .*\(hoje\)$/);
    expect(rotuloDeDescanso("2026-10-12", HOJE, true)).toMatch(/^Desmarcar descanso em Segunda-feira/);
  });

  it("coluna da semana: hoje dito em palavra; outro dia, só a data", () => {
    expect(textoDaColunaDaSemana(HOJE, HOJE)).toBe("Domingo, 11 de outubro de 2026 (hoje)");
    expect(textoDaColunaDaSemana("2026-10-10", HOJE)).toBe("Sábado, 10 de outubro de 2026");
  });
});

describe("a célula do mês diz cada treino e o status dele", () => {
  it("hoje, treino com status, descanso neutro", () => {
    expect(
      rotuloDaCelulaDoMes(HOJE, HOJE, "2026-10", [
        { ...treino(HOJE), nome: "Superior A" },
        { ...descanso(HOJE), nome: "Descanso" },
      ]),
    ).toBe("Domingo, 11 de outubro de 2026 (hoje) · Superior A: hoje · descanso. Adicionar treino");
  });

  it("descanso passado não diz 'atrasado'; dia de outro mês diz 'fora do mês'", () => {
    const texto = rotuloDaCelulaDoMes("2026-09-30", HOJE, "2026-10", [{ ...descanso("2026-09-30"), nome: "Descanso" }]);
    expect(texto).toBe("Quarta-feira, 30 de setembro de 2026 · fora do mês · descanso. Adicionar treino");
    expect(texto).not.toMatch(/atrasad/i);
  });

  it("dia vazio diz 'nada planejado'", () => {
    expect(rotuloDaCelulaDoMes("2026-10-12", HOJE, "2026-10", [])).toBe(
      "Segunda-feira, 12 de outubro de 2026 · nada planejado. Adicionar treino",
    );
  });
});

describe("consistência e chips de série", () => {
  const dia = (over: Partial<ConsistencyDay>): ConsistencyDay => ({
    date: HOJE,
    state: "treinado",
    sessions: 1,
    volumeKg: 0,
    workouts: [],
    isToday: false,
    ...over,
  });

  it("dia com treino, hoje, e dia que ainda vai chegar", () => {
    expect(textoDoDiaDaConsistencia(HOJE, dia({ workouts: ["Superior A"] }), HOJE)).toBe(
      "11/10 (hoje): Treino registrado — Superior A",
    );
    expect(textoDoDiaDaConsistencia("2026-10-12", undefined, HOJE)).toBe("12/10: ainda vai chegar");
    expect(textoDoDiaDaConsistencia("2026-10-09", dia({ date: "2026-10-09", state: "livre", sessions: 0 }), HOJE)).toBe(
      "09/10: Dia livre",
    );
  });

  it("chip de série diz o estado, não só o número", () => {
    expect(rotuloDoChipDeSerie({ setNumber: 3, isWarmup: false, status: "concluida" })).toBe("Série 3, concluída");
    expect(rotuloDoChipDeSerie({ setNumber: 1, isWarmup: true, status: "pulada" })).toBe("Série 1 de aquecimento, pulada");
    expect(rotuloDoChipDeSerie({ setNumber: 4, isWarmup: false, status: "pendente" })).toBe("Série 4, pendente");
  });
});
