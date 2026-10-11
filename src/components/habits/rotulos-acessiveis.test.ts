import { describe, expect, it } from "vitest";
import { ehHoje, textoDaCelula, textoDaSequencia, textoDoDiaDaAgua } from "./rotulos-acessiveis";

describe("rótulos acessíveis de Hábitos — o estado em texto, não em cor", () => {
  it("célula com hábitos agendados: N de M, com singular e plural", () => {
    expect(textoDaCelula({ date: "2026-10-09", done: 2, scheduled: 3 }, "2026-10-11")).toBe("09/10/2026 — 2 de 3 concluídos");
    expect(textoDaCelula({ date: "2026-10-09", done: 1, scheduled: 1 }, "2026-10-11")).toBe("09/10/2026 — 1 de 1 concluído");
    expect(textoDaCelula({ date: "2026-10-09", done: 0, scheduled: 2 }, "2026-10-11")).toBe("09/10/2026 — 0 de 2 concluídos");
  });

  it("sem hábito agendado não é 0%", () => {
    expect(textoDaCelula({ date: "2026-10-05", done: 0, scheduled: 0 }, "2026-10-11")).toBe("05/10/2026 — sem hábitos agendados");
  });

  it("hoje é dito com a data", () => {
    expect(textoDaCelula({ date: "2026-10-11", done: 1, scheduled: 2 }, "2026-10-11")).toBe("11/10/2026, hoje — 1 de 2 concluídos");
  });

  it("hoje fora da janela (virada do dia entre leituras): ninguém é hoje", () => {
    expect(ehHoje("2026-10-11", "2026-10-12")).toBe(false);
    expect(textoDaCelula({ date: "2026-10-11", done: 1, scheduled: 2 }, "2026-10-12")).not.toMatch(/hoje/);
  });

  it("dia da água: valor, meta na unidade do hábito e meta batida", () => {
    expect(textoDoDiaDaAgua({ date: "2026-10-11", value: 1.5, done: false }, "2026-10-11", 2, "litros")).toBe(
      "11/10/2026, hoje — 1,5 de 2 L",
    );
    expect(textoDoDiaDaAgua({ date: "2026-10-10", value: 2.25, done: true }, "2026-10-11", 2, "litros")).toBe(
      "10/10/2026 — 2,25 de 2 L, meta batida",
    );
  });

  it("meta zero não vira NaN nem 'meta batida' sem o campo dizer", () => {
    expect(textoDoDiaDaAgua({ date: "2026-10-10", value: 0, done: false }, "2026-10-11", 0, "ml")).toBe("10/10/2026 — 0 de 0 ml");
  });

  it("sequência no singular e no plural", () => {
    expect(textoDaSequencia(1)).toBe(" dia seguido");
    expect(textoDaSequencia(6)).toBe(" dias seguidos");
  });
});
