import { describe, expect, it } from "vitest";
import { OFX_HEADERS, parseOfx, pareceOfx } from "@/lib/import/ofx";
import { applyMapping, autoDetectMapping } from "@/lib/import/mapping";
import type { NormalizeOptions } from "@/lib/import/types";

const OFX_SGML = `OFXHEADER:100
DATA:OFXSGML
<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20260626120000[-3:GMT]
<TRNAMT>-150.90
<FITID>2026062601
<NAME>SUPERMERCADO SAO JOAO
<MEMO>COMPRA CARTAO
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20260625
<TRNAMT>5000.00
<FITID>2026062502
<NAME>SALARIO
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const OFX_XML = `<?xml version="1.0"?>
<OFX>
  <STMTTRN>
    <TRNTYPE>DEBIT</TRNTYPE>
    <DTPOSTED>20260610</DTPOSTED>
    <TRNAMT>-300.00</TRNAMT>
    <FITID>ABC123</FITID>
    <NAME>NOTEBOOK LOJA</NAME>
  </STMTTRN>
</OFX>`;

describe("parseOfx", () => {
  it("extrai transações de OFX 1.x (SGML)", () => {
    const table = parseOfx(OFX_SGML);
    expect(table.headers).toEqual([...OFX_HEADERS]);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toEqual([
      "20260626120000[-3:GMT]",
      "-150.90",
      "SUPERMERCADO SAO JOAO",
      "COMPRA CARTAO",
      "2026062601",
      "DEBIT",
    ]);
  });

  it("extrai transações de OFX 2.x (XML, tags fechadas)", () => {
    const table = parseOfx(OFX_XML);
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0][1]).toBe("-300.00");
    expect(table.rows[0][2]).toBe("NOTEBOOK LOJA");
    expect(table.rows[0][4]).toBe("ABC123");
  });

  it("retorna linhas vazias sem transações", () => {
    expect(parseOfx("<OFX></OFX>").rows).toEqual([]);
    expect(parseOfx("").rows).toEqual([]);
  });

  it("o cabeçalho gerado é auto-mapeado e normalizado pela pipeline padrão", () => {
    const table = parseOfx(OFX_SGML);
    const mapping = autoDetectMapping(table.headers);
    expect(mapping.data).toBe(0);
    expect(mapping.valor).toBe(1);
    expect(mapping.descricao).toBe(2);
    expect(mapping.identificador).toBe(4);

    const opts: NormalizeOptions = {
      origem: "conta",
      sinalNegativoDespesa: true,
      categorias: [{ id: "c-merc", name: "Mercado" }],
    };
    const rows = applyMapping(table, mapping, opts);
    expect(rows[0].dataNorm).toBe("2026-06-26");
    expect(rows[0].valorCentavos).toBe(15090);
    expect(rows[0].tipo).toBe("despesa");
    expect(rows[0].identificador).toBe("2026062601");
    expect(rows[1].tipo).toBe("receita"); // salário (crédito)
    expect(rows[1].valorCentavos).toBe(500000);
  });
});

describe("pareceOfx", () => {
  it("reconhece conteúdo OFX", () => {
    expect(pareceOfx(OFX_SGML)).toBe(true);
    expect(pareceOfx(OFX_XML)).toBe(true);
    expect(pareceOfx("Data,Valor\n2026-06-26,10")).toBe(false);
  });
});
