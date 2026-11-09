import { describe, expect, it } from "vitest";
import { dataDaAbertura, saudacaoPara, tituloDaAbertura } from "./saudacao";

describe("saudacaoPara", () => {
  it("respeita as bordas de cada faixa", () => {
    expect(saudacaoPara("04:59")).toBe("Boa noite");
    expect(saudacaoPara("05:00")).toBe("Bom dia");
    expect(saudacaoPara("11:59")).toBe("Bom dia");
    expect(saudacaoPara("12:00")).toBe("Boa tarde");
    expect(saudacaoPara("17:59")).toBe("Boa tarde");
    expect(saudacaoPara("18:00")).toBe("Boa noite");
  });

  it("meia-noite e fim do dia são noite", () => {
    expect(saudacaoPara("00:00")).toBe("Boa noite");
    expect(saudacaoPara("23:59")).toBe("Boa noite");
  });
});

describe("dataDaAbertura", () => {
  it("escreve o dia da semana, o dia e o mês, com a inicial em maiúscula", () => {
    expect(dataDaAbertura("2026-11-06")).toBe("Sexta-feira, 6 de novembro");
    expect(dataDaAbertura("2026-03-01")).toBe("Domingo, 1 de março");
  });
});

describe("tituloDaAbertura", () => {
  it("usa o primeiro nome e termina em ponto", () => {
    expect(tituloDaAbertura("Boa noite", "Maria da Silva")).toBe("Boa noite, Maria.");
  });

  it("sem nome (null ou só espaços) não deixa vírgula solta", () => {
    expect(tituloDaAbertura("Bom dia", null)).toBe("Bom dia.");
    expect(tituloDaAbertura("Bom dia", "   ")).toBe("Bom dia.");
  });
});
