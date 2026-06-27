import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/import/csv";
import { applyMapping, autoDetectMapping } from "@/lib/import/mapping";
import type { NormalizeOptions } from "@/lib/import/types";

/**
 * Fixture espelhando o export real de fatura do Itaú (cartão Azul Infinite): separador ';',
 * coluna vazia à esquerda, bloco de título/resumo antes da tabela, e rodapé (Subtotal + aviso)
 * depois dela. O cabeçalho real ("Data;Lançamento;Parcelamento;Valor;…") só aparece na 6ª linha.
 */
const FATURA_ITAU = [
  ";;;;;;;;;",
  ";Nome;Yuri Ribeiro Moraes;;;;;;;",
  ";Conta;61613-3;;;;;;;",
  ";Fatura Fechada - Junho/2026;;;;;;;;",
  ";Cartão;;;;;Valor;;Vencimento;",
  ";Azul Itau Infinite Visa - final 5188;;;;;R$ 4.262,45;;29/06/2026;",
  ";Lançamentos;;;;;;;;",
  ";Data;Lançamento;Parcelamento;Valor;;Titularidade;Nome;Tipo do cartão;Número do cartão",
  ";06/06/2026;Ifd*gradin Fast Food L Bauru         Br;;R$ 35,89;;Titular;Yuri Ribeiro Moraes;Físico;****5188",
  ";30/05/2026;Jim.com Mislaine C;Parcela 1 de 4;R$ 402,60;;Titular;Yuri Ribeiro Moraes;Físico;****5188",
  ";01/06/2026;Pagamento Efetuado;;R$ -3.301,03;;Titular;Yuri Ribeiro Moraes;Físico;****5188",
  ";;;;;;;;;",
  ";;;Subtotal  ;R$ 4.262,45;;;;;",
  ";Importante saber;;;;;;;;",
].join("\n");

const cartaoOpts: NormalizeOptions = {
  origem: "cartao",
  sinalNegativoDespesa: true,
  categorias: [{ id: "c-aliment", name: "Alimentação" }],
};

describe("parseCsv — detecção de cabeçalho fora da 1ª linha", () => {
  it("acha o cabeçalho real e ignora o preâmbulo", () => {
    const table = parseCsv(FATURA_ITAU);
    expect(table.headers).toEqual([
      "",
      "Data",
      "Lançamento",
      "Parcelamento",
      "Valor",
      "",
      "Titularidade",
      "Nome",
      "Tipo do cartão",
      "Número do cartão",
    ]);
    // As 3 linhas de dados + 2 de rodapé vêm DEPOIS do cabeçalho (preâmbulo descartado).
    expect(table.rows).toHaveLength(5);
    expect(table.rows[0][1]).toBe("06/06/2026");
    expect(table.rows[0][4]).toBe("R$ 35,89");
  });

  it("auto-detecta data/valor/descrição/parcela no cabeçalho encontrado", () => {
    const table = parseCsv(FATURA_ITAU);
    const mapping = autoDetectMapping(table.headers);
    expect(mapping.data).toBe(1);
    expect(mapping.valor).toBe(4);
    expect(mapping.descricao).toBe(2);
    expect(mapping.parcela).toBe(3);
  });

  it("normaliza os lançamentos reais (não caem em erro de mapeamento)", () => {
    const table = parseCsv(FATURA_ITAU);
    const mapping = autoDetectMapping(table.headers);
    const rows = applyMapping(table, mapping, cartaoOpts);

    // Lançamento normal.
    expect(rows[0].dataNorm).toBe("2026-06-06");
    expect(rows[0].valorCentavos).toBe(3589);
    expect(rows[0].status).toBe("pendente");

    // Compra parcelada no formato "Parcela 1 de 4".
    expect(rows[1].parcela).toBe(1);
    expect(rows[1].parcelasTotal).toBe(4);
    expect(rows[1].valorCentavos).toBe(40260);

    // Rodapé (Subtotal / aviso) sai como erro — e nunca é importado.
    expect(rows[3].status).toBe("erro");
    expect(rows[4].status).toBe("erro");
  });
});

describe("parseCsv — arquivo já tabular (sem regressão)", () => {
  it("mantém o cabeçalho na 1ª linha quando o arquivo já é uma tabela limpa", () => {
    const csv = "Data;Histórico;Valor\n26/06/2026;Mercado;150,90";
    const table = parseCsv(csv);
    expect(table.headers).toEqual(["Data", "Histórico", "Valor"]);
    expect(table.rows[0][0]).toBe("26/06/2026");
    expect(table.rows[0][2]).toBe("150,90");
  });
});
