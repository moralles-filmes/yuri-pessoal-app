import { describe, expect, it } from "vitest";
import { applyMapping, autoDetectMapping } from "@/lib/import/mapping";
import type { NormalizeOptions, ParsedTable } from "@/lib/import/types";

const categorias = [
  { id: "c-merc", name: "Mercado" },
  { id: "c-transp", name: "Transporte" },
  { id: "c-saude", name: "Saúde" },
];

const cartaoOpts: NormalizeOptions = {
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
