import { describe, expect, it } from "vitest";
import type { EstadoDaLinha, LinhaDaCentral } from "@/lib/finance/central-cartoes";
import { rotuloDoEstado } from "./estado-da-fatura";

function linha(sobre: Partial<LinhaDaCentral> & { estado: EstadoDaLinha }): LinhaDaCentral {
  return {
    chave: "s1",
    statementId: "s1",
    card: { id: "c1", nome: "Roxinho", cor: null, ativo: true },
    competencia: "2026-10",
    dataFechamento: "2026-10-27",
    dataVencimento: "2026-11-10",
    credito: false,
    pagoEm: null,
    valores: { totalCent: 100_00, meuCent: 100_00, porPessoaCent: {} },
    entraNaSoma: false,
    ...sobre,
  };
}

describe("rotuloDoEstado", () => {
  it("atrasada: palavra e tom próprios", () => {
    expect(rotuloDoEstado(linha({ estado: "atrasada" }), "fechadas")).toEqual({
      texto: "Atrasada",
      tom: "atrasada",
    });
  });

  it("fechada: neutro", () => {
    expect(rotuloDoEstado(linha({ estado: "fechada" }), "fechadas")).toEqual({
      texto: "Fechada",
      tom: "neutro",
    });
  });

  it("paga em fechadas: 'Paga em dd/mm' pela data de pago_em", () => {
    const l = linha({ estado: "paga", pagoEm: "2026-11-01T13:00:00Z" });
    expect(rotuloDoEstado(l, "fechadas")).toEqual({ texto: "Paga em 01/11", tom: "paga" });
  });

  it("paga: a data é lida em Brasília (01:30Z de 02/11 ainda é dia 01/11)", () => {
    const l = linha({ estado: "paga", pagoEm: "2026-11-02T01:30:00Z" });
    expect(rotuloDoEstado(l, "fechadas").texto).toBe("Paga em 01/11");
  });

  it("paga em abertas: 'Paga antes de fechar'", () => {
    const l = linha({ estado: "paga", pagoEm: "2026-11-01T13:00:00Z" });
    expect(rotuloDoEstado(l, "abertas")).toEqual({ texto: "Paga antes de fechar", tom: "paga" });
  });

  it("crédito vence os outros estados", () => {
    expect(rotuloDoEstado(linha({ estado: "fechada", credito: true }), "fechadas")).toEqual({
      texto: "Crédito",
      tom: "credito",
    });
    expect(
      rotuloDoEstado(
        linha({ estado: "paga", credito: true, pagoEm: "2026-11-01T13:00:00Z" }),
        "fechadas",
      ).tom,
    ).toBe("credito");
  });

  it("prevista: tracejado, sem valor", () => {
    const l = linha({ estado: "prevista", statementId: null, valores: null });
    expect(rotuloDoEstado(l, "abertas")).toEqual({ texto: "Prevista", tom: "prevista" });
  });

  it("aberta", () => {
    expect(rotuloDoEstado(linha({ estado: "aberta" }), "abertas")).toEqual({
      texto: "Aberta",
      tom: "aberta",
    });
  });
});
