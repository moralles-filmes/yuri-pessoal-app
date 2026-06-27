import { describe, it, expect } from "vitest";
import {
  aplicarOverrideUltima,
  distribuirFaturas,
  dividirParcelas,
  overrideUltimaValido,
  planejarParcelamento,
  somaCentavos,
} from "@/lib/finance/installments";

describe("dividirParcelas — soma exata com resto na última", () => {
  it("R$ 100,00 em 3 → 33,33 / 33,33 / 33,34 (soma exata)", () => {
    const p = dividirParcelas(10000, 3);
    expect(p).toEqual([3333, 3333, 3334]);
    expect(somaCentavos(p)).toBe(10000);
  });

  it("R$ 99,99 em 4 → resto na última, soma exata", () => {
    const p = dividirParcelas(9999, 4);
    expect(p).toEqual([2499, 2499, 2499, 2502]);
    expect(somaCentavos(p)).toBe(9999);
  });

  it("R$ 10,00 em 3 → 3,33 / 3,33 / 3,34", () => {
    const p = dividirParcelas(1000, 3);
    expect(p).toEqual([333, 333, 334]);
    expect(somaCentavos(p)).toBe(1000);
  });

  it("1 parcela (à vista parcelado em 1) devolve o total inteiro", () => {
    expect(dividirParcelas(12345, 1)).toEqual([12345]);
  });

  it("divisão redonda: R$ 120,00 em 12 → 12x de 10,00", () => {
    const p = dividirParcelas(12000, 12);
    expect(p.every((v) => v === 1000)).toBe(true);
    expect(somaCentavos(p)).toBe(12000);
  });

  it("N grande (24) sempre soma exata e tem 24 itens", () => {
    const p = dividirParcelas(100000, 24); // R$ 1.000,00
    expect(p).toHaveLength(24);
    expect(somaCentavos(p)).toBe(100000);
    // 23 primeiras iguais ao floor; a última absorve o resto.
    const base = Math.floor(100000 / 24);
    expect(p.slice(0, 23).every((v) => v === base)).toBe(true);
    expect(p[23]).toBe(100000 - base * 23);
  });

  it("rejeita qtd < 1 e valores inválidos", () => {
    expect(() => dividirParcelas(1000, 0)).toThrow();
    expect(() => dividirParcelas(-1, 3)).toThrow();
    expect(() => dividirParcelas(100.5, 3)).toThrow();
  });
});

describe("override manual da última parcela", () => {
  it("aceita o override que mantém a soma igual ao total", () => {
    // Default de R$ 100,00 em 3 é [33,33 / 33,33 / 33,34]. Override 33,34 fecha.
    expect(aplicarOverrideUltima(10000, 3, 3334)).toEqual([3333, 3333, 3334]);
    expect(overrideUltimaValido(10000, 3, 3334)).toBe(true);
  });

  it("rejeita override quando a soma não fecha", () => {
    expect(() => aplicarOverrideUltima(10000, 3, 3300)).toThrow();
    expect(overrideUltimaValido(10000, 3, 3300)).toBe(false);
    expect(overrideUltimaValido(10000, 3, 9999)).toBe(false);
  });
});

describe("distribuirFaturas — N competências sequenciais (reusa invoice.ts)", () => {
  // Cartão: fecha dia 10, vence dia 20.
  it("6 parcelas a partir de dez/2025 atravessam a virada de ano", () => {
    const faturas = distribuirFaturas("2025-12-05", 6, 10, 20);
    expect(faturas.map((f) => f.competencia)).toEqual([
      "2025-12-01",
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
    ]);
    // A 1ª parcela bate com a fatura da própria compra.
    expect(faturas[0]).toEqual({
      competencia: "2025-12-01",
      dataFechamento: "2025-12-10",
      dataVencimento: "2025-12-20",
    });
    // A 2ª já em jan/2026.
    expect(faturas[1]).toEqual({
      competencia: "2026-01-01",
      dataFechamento: "2026-01-10",
      dataVencimento: "2026-01-20",
    });
  });

  it("compra após o fechamento joga a 1ª parcela para o mês seguinte", () => {
    // Compra dia 11 (> dia 10 de fechamento) → 1ª parcela fecha em fev/2026.
    const faturas = distribuirFaturas("2026-01-11", 3, 10, 20);
    expect(faturas.map((f) => f.competencia)).toEqual([
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
    ]);
  });

  it("clampa fechamento/vencimento em meses curtos (fechamento 31)", () => {
    // Fechamento 31 → em fevereiro cai no último dia do mês.
    const faturas = distribuirFaturas("2026-01-15", 3, 31, 10);
    expect(faturas[0].dataFechamento).toBe("2026-01-31");
    expect(faturas[1].dataFechamento).toBe("2026-02-28");
    expect(faturas[2].dataFechamento).toBe("2026-03-31");
  });

  it("competenciaBase ancora a 1ª fatura, ignorando dataCompra (importação)", () => {
    // dataCompra antiga (compra original em fev), mas a fatura importada é junho:
    // as parcelas saem de junho em diante, NÃO de fevereiro.
    const faturas = distribuirFaturas("2026-02-25", 4, 21, 28, "2026-06-01");
    expect(faturas.map((f) => f.competencia)).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
    ]);
  });
});

describe("planejarParcelamento — valor + fatura por parcela (preview = servidor)", () => {
  it("combina valores e faturas; soma dos valores = total", () => {
    const plano = planejarParcelamento({
      valorTotalReais: 100,
      qtd: 3,
      dataCompra: "2025-12-05",
      diaFechamento: 10,
      diaVencimento: 20,
    });
    expect(plano.map((p) => p.numero)).toEqual([1, 2, 3]);
    expect(plano.map((p) => p.valorCentavos)).toEqual([3333, 3333, 3334]);
    expect(somaCentavos(plano.map((p) => p.valorCentavos))).toBe(10000);
    expect(plano.map((p) => p.valor)).toEqual([33.33, 33.33, 33.34]);
    expect(plano[2].fatura.competencia).toBe("2026-02-01");
  });

  it("aplica override válido da última e mantém a soma", () => {
    const plano = planejarParcelamento({
      valorTotalReais: 100,
      qtd: 3,
      dataCompra: "2025-12-05",
      diaFechamento: 10,
      diaVencimento: 20,
      overrideUltimaCentavos: 3334,
    });
    expect(somaCentavos(plano.map((p) => p.valorCentavos))).toBe(10000);
  });

  it("rejeita override inválido (lança)", () => {
    expect(() =>
      planejarParcelamento({
        valorTotalReais: 100,
        qtd: 3,
        dataCompra: "2025-12-05",
        diaFechamento: 10,
        diaVencimento: 20,
        overrideUltimaCentavos: 9999,
      }),
    ).toThrow();
  });

  it("numeroInicial desloca a numeração (importar parcela do meio), sem afetar valores/faturas", () => {
    // Importar 5/12: 8 parcelas restantes numeradas 5..12; a 1ª cai na fatura da dataCompra.
    const plano = planejarParcelamento({
      valorTotalReais: 840, // 8 × 105,00
      qtd: 8,
      dataCompra: "2025-12-05",
      diaFechamento: 10,
      diaVencimento: 20,
      numeroInicial: 5,
    });
    expect(plano.map((p) => p.numero)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(plano.every((p) => p.valorCentavos === 10500)).toBe(true);
    expect(plano[0].fatura.competencia).toBe("2025-12-01"); // 1ª gerada cai na fatura da dataCompra
  });

  it("importar 5/12 com competenciaBase: parcela 5 cai na fatura importada e segue à frente", () => {
    // Cenário do bug: linha "5/12" na fatura de junho, mas a compra original foi em maio.
    // Com competenciaBase=junho, a parcela 5 cai em junho (não em meses passados).
    const plano = planejarParcelamento({
      valorTotalReais: 840, // 8 × 105,00
      qtd: 8,
      dataCompra: "2026-05-22", // data da compra original (antiga)
      diaFechamento: 21,
      diaVencimento: 28,
      numeroInicial: 5,
      competenciaBase: "2026-06-01",
    });
    expect(plano.map((p) => p.numero)).toEqual([5, 6, 7, 8, 9, 10, 11, 12]);
    expect(plano.map((p) => p.fatura.competencia)).toEqual([
      "2026-06-01",
      "2026-07-01",
      "2026-08-01",
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
    ]);
    expect(plano.every((p) => p.valorCentavos === 10500)).toBe(true);
  });
});
