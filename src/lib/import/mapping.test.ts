import { describe, expect, it } from "vitest";
import {
  applyMapping,
  autoDetectMapping,
  detectHeaderRow,
  detectarSinalNegativoDespesa,
  ehPagamentoFatura,
} from "@/lib/import/mapping";
import { OFX_HEADERS, parseOfx } from "@/lib/import/ofx";
import type { NormalizeOptions, ParsedTable } from "@/lib/import/types";

const categorias = [
  { id: "c-merc", name: "Mercado" },
  { id: "c-transp", name: "Transporte" },
  { id: "c-saude", name: "Saúde" },
];

/** Fatura em planilha/CSV: compra positiva, estorno negativo. */
const cartaoOpts: NormalizeOptions = {
  origem: "cartao",
  sinalNegativoDespesa: false,
  categorias,
};

/** Fatura em OFX: compra negativa (TRNAMT < 0), crédito positivo. */
const cartaoOfxOpts: NormalizeOptions = {
  origem: "cartao",
  sinalNegativoDespesa: true,
  categorias,
};

describe("autoDetectMapping", () => {
  it("detecta data, descrição e valor por cabeçalho", () => {
    expect(autoDetectMapping(["Data", "Histórico", "Valor"])).toEqual({
      data: 0,
      descricao: 1,
      valor: 2,
    });
  });

  it("mapeia 'Parcelas' como total e 'Parcela' como número da parcela", () => {
    const m = autoDetectMapping([
      "Data Compra",
      "Descrição",
      "Valor (R$)",
      "Parcela",
      "Parcelas",
    ]);
    expect(m).toEqual({
      data: 0,
      descricao: 1,
      valor: 2,
      parcela: 3,
      parcelas_total: 4,
    });
  });

  it("detecta identificador e ignora colunas desconhecidas", () => {
    const m = autoDetectMapping(["FITID", "DtPosted", "TRNAMT", "Name"]);
    expect(m.identificador).toBe(0);
    expect(m.data).toBe(1);
    expect(m.valor).toBe(2);
    expect(m.descricao).toBe(3);
  });
});

describe("detectHeaderRow", () => {
  it("acha o cabeçalho real pulando linhas de título/resumo (fatura Itaú)", () => {
    const matrix = [
      ["", "Nome", "Yuri Ribeiro Moraes", "", "", "", "", "", "", ""],
      ["", "Conta", "61613-3", "", "", "", "", "", "", ""],
      ["", "Cartão", "", "", "", "", "Valor", "", "Vencimento", ""],
      ["", "Azul Itau Infinite Visa", "", "", "", "", "R$ 4.262,45", "", "29/06/2026", ""],
      ["", "Lançamentos", "", "", "", "", "", "", "", ""],
      ["", "Data", "Lançamento", "Parcelamento", "Valor", "", "Titularidade", "Nome", "Tipo do cartão", "Número do cartão"],
      ["", "01/06/2026", "Pagamento Efetuado", "", "R$ -3.301,03", "", "Titular", "Yuri", "Físico", "****5188"],
    ];
    expect(detectHeaderRow(matrix)).toBe(5);
  });

  it("ignora linha de resumo que só tem Valor (sem Data) e devolve 0 para tabela limpa", () => {
    expect(detectHeaderRow([["Data", "Histórico", "Valor"], ["26/06/2026", "X", "10,00"]])).toBe(0);
    expect(detectHeaderRow([["Cartão", "", "Valor", "Vencimento"]])).toBe(0); // sem candidata → fallback 0
  });
});

describe("applyMapping", () => {
  const table: ParsedTable = {
    headers: ["Data", "Descrição", "Valor", "Parcela", "Parcelas"],
    rows: [
      ["26/06/2026", "SUPERMERCADO SAO JOAO", "150,90", "", ""],
      ["25/06/2026", "UBER *TRIP", "32,50", "", ""],
      ["10/06/2026", "NOTEBOOK LOJA", "-300,00", "3", "10"],
      ["data ruim", "X", "abc", "", ""],
    ],
  };
  const mapping = autoDetectMapping(table.headers);
  const rows = applyMapping(table, mapping, cartaoOpts);

  it("normaliza data e valor (magnitude) e sugere categoria", () => {
    expect(rows[0].dataNorm).toBe("2026-06-26");
    expect(rows[0].valorCentavos).toBe(15090);
    expect(rows[0].tipo).toBe("despesa");
    expect(rows[0].categoriaSugeridaId).toBe("c-merc");
    expect(rows[0].status).toBe("pendente");
  });

  it("sugere transporte para Uber", () => {
    expect(rows[1].categoriaSugeridaId).toBe("c-transp");
    expect(rows[1].valorCentavos).toBe(3250);
  });

  it("captura parcela/total e usa a magnitude do valor negativo", () => {
    expect(rows[2].parcela).toBe(3);
    expect(rows[2].parcelasTotal).toBe(10);
    expect(rows[2].valorCentavos).toBe(30000);
  });

  it("marca linha com data/valor inválidos como erro", () => {
    expect(rows[3].status).toBe("erro");
    expect(rows[3].motivo).toBeTruthy();
  });

  it("deriva tipo pelo sinal em extrato de conta", () => {
    const contaTable: ParsedTable = {
      headers: ["Data", "Histórico", "Valor"],
      rows: [
        ["01/06/2026", "Salário", "5000,00"],
        ["02/06/2026", "Conta de luz", "-180,00"],
      ],
    };
    const m = autoDetectMapping(contaTable.headers);
    const r = applyMapping(contaTable, m, {
      origem: "conta",
      sinalNegativoDespesa: true,
      categorias,
    });
    expect(r[0].tipo).toBe("receita");
    expect(r[0].valorCentavos).toBe(500000);
    expect(r[1].tipo).toBe("despesa");
    expect(r[1].valorCentavos).toBe(18000);
  });

  it("marca erro quando data e valor não estão mapeados", () => {
    const semMapeamento = applyMapping(table, {}, cartaoOpts);
    expect(semMapeamento.every((r) => r.status === "erro")).toBe(true);
  });
});

describe("ehPagamentoFatura", () => {
  it("reconhece descrições de pagamento da fatura", () => {
    expect(ehPagamentoFatura("Pagamento Efetuado")).toBe(true);
    expect(ehPagamentoFatura("PAGAMENTO RECEBIDO")).toBe(true);
    expect(ehPagamentoFatura("Pagto. por deb conta")).toBe(true);
    expect(ehPagamentoFatura("Pgto fatura")).toBe(true);
  });

  it("não confunde com compras comuns nem vazio", () => {
    expect(ehPagamentoFatura("Supermercado Tauste")).toBe(false);
    expect(ehPagamentoFatura("")).toBe(false);
    expect(ehPagamentoFatura(null)).toBe(false);
  });
});

describe("applyMapping — estornos/créditos na fatura de cartão", () => {
  const table: ParsedTable = {
    headers: ["Data", "Lançamento", "Valor"],
    rows: [
      ["21/06/2026", "Supermercado", "R$ 152,35"], // compra → despesa
      ["15/06/2026", "Apple.com/bill", "R$ -5,14"], // estorno → receita
      ["01/06/2026", "Pagamento Efetuado", "R$ -3.301,03"], // pagamento → ignorada
    ],
  };
  const rows = applyMapping(table, autoDetectMapping(table.headers), cartaoOpts);

  it("compra positiva continua despesa", () => {
    expect(rows[0].tipo).toBe("despesa");
    expect(rows[0].valorCentavos).toBe(15235);
    expect(rows[0].status).toBe("pendente");
  });

  it("valor negativo vira estorno (receita), com magnitude positiva", () => {
    expect(rows[1].tipo).toBe("receita");
    expect(rows[1].valorCentavos).toBe(514);
    expect(rows[1].status).toBe("pendente");
  });

  it("pagamento da fatura (negativo) é auto-ignorado", () => {
    expect(rows[2].status).toBe("ignorada");
    expect(rows[2].motivo).toBeTruthy();
    expect(rows[2].valorCentavos).toBe(330103);
  });
});

describe("detectarSinalNegativoDespesa", () => {
  it("planilha de fatura (compra positiva, estorno negativo) → false", () => {
    const table: ParsedTable = {
      headers: ["Data", "Lançamento", "Valor"],
      rows: [
        ["21/06/2026", "Supermercado", "R$ 152,35"],
        ["20/06/2026", "Posto Shell", "R$ 210,00"],
        ["15/06/2026", "Apple.com/bill", "R$ -5,14"],
        ["01/06/2026", "Pagamento Efetuado", "R$ -3.301,03"],
      ],
    };
    expect(
      detectarSinalNegativoDespesa(table, autoDetectMapping(table.headers)),
    ).toBe(false);
  });

  it("OFX de cartão (compra negativa, pagamento positivo) → true", () => {
    const table: ParsedTable = {
      headers: [...OFX_HEADERS],
      rows: [
        ["20260625", "-77.98", "Fazenda do Bolo", "", "1", "DEBIT"],
        ["20260624", "-14.90", "Dl *99 Ride", "", "2", "DEBIT"],
        ["20260620", "-135.33", "Cobasi", "", "3", "DEBIT"],
        // O pagamento da fatura anterior é UMA linha com magnitude parecida com a soma de
        // todas as compras: por isso a decisão é por contagem de linhas, não por soma.
        ["20260610", "228.21", "Pagamento recebido", "", "4", "CREDIT"],
      ],
    };
    expect(
      detectarSinalNegativoDespesa(table, autoDetectMapping(table.headers)),
    ).toBe(true);
  });

  it("empate e coluna de valor não mapeada caem na convenção da planilha (false)", () => {
    const table: ParsedTable = {
      headers: ["Data", "Lançamento", "Valor"],
      rows: [
        ["21/06/2026", "A", "10,00"],
        ["22/06/2026", "B", "-10,00"],
      ],
    };
    expect(
      detectarSinalNegativoDespesa(table, autoDetectMapping(table.headers)),
    ).toBe(false);
    expect(detectarSinalNegativoDespesa(table, {})).toBe(false);
  });
});

describe("applyMapping — fatura em OFX (compra com sinal negativo)", () => {
  // Regressão do bug real: com a convenção invertida, TODA a fatura entrava como estorno
  // (receita), a fatura ficava com total NEGATIVO, e a linha perdia parcelamento e divisão.
  const ofx = `
    <STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260622000000[-3:BRT]<TRNAMT>-16.89
      <FITID>a1<NAME>Mercado*Mercadolivre - Parcela 1/4</STMTTRN>
    <STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260619000000[-3:BRT]<TRNAMT>-139.00
      <FITID>a2<NAME>Academia Bauru Fitness</STMTTRN>
    <STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260615000000[-3:BRT]<TRNAMT>5.14
      <FITID>a3<NAME>Estorno Apple.com/bill</STMTTRN>
    <STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260610000000[-3:BRT]<TRNAMT>3301.03
      <FITID>a4<NAME>Pagamento recebido</STMTTRN>
  `;
  const table = parseOfx(ofx);
  const mapping = autoDetectMapping(table.headers);
  const rows = applyMapping(table, mapping, {
    ...cartaoOfxOpts,
    sinalNegativoDespesa: detectarSinalNegativoDespesa(table, mapping),
  });

  it("compra com TRNAMT negativo é DESPESA, com magnitude positiva", () => {
    expect(rows[1].tipo).toBe("despesa");
    expect(rows[1].valorCentavos).toBe(13900);
    expect(rows[1].descricao).toBe("Academia Bauru Fitness");
  });

  it("preserva a parcela da compra parcelada (que o estorno perderia)", () => {
    expect(rows[0].tipo).toBe("despesa");
    expect(rows[0].parcela).toBe(1);
    expect(rows[0].parcelasTotal).toBe(4);
  });

  it("crédito positivo é estorno (receita)", () => {
    expect(rows[2].tipo).toBe("receita");
    expect(rows[2].valorCentavos).toBe(514);
    expect(rows[2].status).toBe("pendente");
  });

  it("pagamento da fatura continua auto-ignorado (agora do lado positivo)", () => {
    expect(rows[3].status).toBe("ignorada");
    expect(rows[3].motivo).toBeTruthy();
  });
});
