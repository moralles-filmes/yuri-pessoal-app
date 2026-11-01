/**
 * REDESIGN-03-G2 (K3) — a previsão da exclusão em frases. Fixture sintética.
 */
import { describe, expect, it } from "vitest";
import {
  competenciaMMAAAA,
  linhasDaPrevisao,
  podeConfirmar,
  type PrevisaoDeExclusao,
} from "@/lib/finance/previsao-da-exclusao";

const VAZIA: PrevisaoDeExclusao = {
  bloqueio: null,
  faturaReaberta: null,
  recebiveis: [],
  parcelas: 0,
  linhasDaImportacao: 0,
  ehTransferencia: false,
};

describe("03-G2 K3 · podeConfirmar (Y13)", () => {
  it("é falso sem estado, carregando, com erro e com bloqueio", () => {
    expect(podeConfirmar(null)).toBe(false);
    expect(podeConfirmar({ fase: "carregando" })).toBe(false);
    expect(podeConfirmar({ fase: "erro" })).toBe(false);
    expect(
      podeConfirmar({ fase: "pronta", previsao: { ...VAZIA, bloqueio: "Há recebimento registrado." } }),
    ).toBe(false);
  });

  it("é verdadeiro só com a previsão pronta e sem bloqueio", () => {
    expect(podeConfirmar({ fase: "pronta", previsao: VAZIA })).toBe(true);
  });
});

describe("03-G2 K3 · competenciaMMAAAA", () => {
  it("troca por texto, sem Date", () => {
    expect(competenciaMMAAAA("2031-03-01")).toBe("03/2031");
  });
});

describe("03-G2 K3 · linhasDaPrevisao", () => {
  it("fatura reaberta diz qual fatura volta a ficar em aberto", () => {
    const linhas = linhasDaPrevisao({ ...VAZIA, faturaReaberta: { competencia: "2031-03-01" } });
    expect(linhas).toEqual([
      "Esta é a transferência que pagou a fatura de 03/2031. Ela volta a ficar em aberto.",
    ]);
  });

  it("recebíveis saem agrupados por pessoa, com o status", () => {
    const linhas = linhasDaPrevisao({
      ...VAZIA,
      recebiveis: [{ pessoa: "Pessoa Sintética", status: "pendente", quantidade: 2 }],
    });
    expect(linhas).toEqual(["2 recebível(is) pendente de Pessoa Sintética sai(em) junto."]);
  });

  it("parcelas e importação têm a própria frase, nesta ordem", () => {
    const linhas = linhasDaPrevisao({
      ...VAZIA,
      faturaReaberta: { competencia: "2031-03-01" },
      parcelas: 3,
      linhasDaImportacao: 1,
    });
    expect(linhas).toHaveLength(3);
    expect(linhas[1]).toBe("As 3 parcelas desta compra saem das faturas.");
    expect(linhas[2]).toBe("Este lançamento veio de uma importação; a linha do lote perde o vínculo.");
  });

  it("sem nada a sair junto, não há frase", () => {
    expect(linhasDaPrevisao(VAZIA)).toEqual([]);
  });
});
