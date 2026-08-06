import { describe, expect, it } from "vitest";
import {
  descricaoBaseParcela,
  normalizarDescricao,
  parseDataIso,
  parseParcela,
  parseValorCentavos,
  removerMarcaParcela,
} from "@/lib/import/normalize";

describe("parseValorCentavos", () => {
  it("interpreta formato BR (vírgula decimal, ponto milhar)", () => {
    expect(parseValorCentavos("1.234,56")).toBe(123456);
    expect(parseValorCentavos("1234,56")).toBe(123456);
    expect(parseValorCentavos("1.234.567,89")).toBe(123456789);
    expect(parseValorCentavos("0,00")).toBe(0);
  });

  it("interpreta formato com ponto decimal e US (vírgula milhar)", () => {
    expect(parseValorCentavos("1234.56")).toBe(123456);
    expect(parseValorCentavos("12.5")).toBe(1250);
    expect(parseValorCentavos("1,234.56")).toBe(123456);
  });

  it("trata ponto como milhar quando há 3 dígitos após o único ponto", () => {
    expect(parseValorCentavos("1.234")).toBe(123400);
    expect(parseValorCentavos("1.234.567")).toBe(123456700);
  });

  it("ignora símbolos de moeda e espaços", () => {
    expect(parseValorCentavos("R$ 1.234,56")).toBe(123456);
    expect(parseValorCentavos("  10  ")).toBe(1000);
  });

  it("captura sinais negativos (prefixo, sufixo e parênteses contábeis)", () => {
    expect(parseValorCentavos("-50,00")).toBe(-5000);
    expect(parseValorCentavos("50,00-")).toBe(-5000);
    expect(parseValorCentavos("(50,00)")).toBe(-5000);
  });

  it("detecta o '-' mesmo após o prefixo de moeda (estorno de fatura)", () => {
    expect(parseValorCentavos("R$ -5,14")).toBe(-514);
    expect(parseValorCentavos("R$ -3.301,03")).toBe(-330103);
    expect(parseValorCentavos("R$ 152,35")).toBe(15235); // positivo segue positivo
  });

  it("retorna null para vazio ou texto não numérico", () => {
    expect(parseValorCentavos("")).toBeNull();
    expect(parseValorCentavos("   ")).toBeNull();
    expect(parseValorCentavos("abc")).toBeNull();
    expect(parseValorCentavos(null)).toBeNull();
  });
});

describe("parseDataIso", () => {
  it("aceita ISO e BR com diferentes separadores", () => {
    expect(parseDataIso("2026-06-26")).toBe("2026-06-26");
    expect(parseDataIso("26/06/2026")).toBe("2026-06-26");
    expect(parseDataIso("26-06-2026")).toBe("2026-06-26");
    expect(parseDataIso("26.06.2026")).toBe("2026-06-26");
  });

  it("expande ano de 2 dígitos para 20yy", () => {
    expect(parseDataIso("26/06/26")).toBe("2026-06-26");
    expect(parseDataIso("01/02/26")).toBe("2026-02-01");
  });

  it("aceita data compacta OFX (com hora opcional)", () => {
    expect(parseDataIso("20260626")).toBe("2026-06-26");
    expect(parseDataIso("20260626120000")).toBe("2026-06-26");
    expect(parseDataIso("20260626120000[-3:GMT]")).toBe("2026-06-26");
  });

  it("rejeita datas impossíveis e texto inválido", () => {
    expect(parseDataIso("31/02/2026")).toBeNull();
    expect(parseDataIso("00/06/2026")).toBeNull();
    expect(parseDataIso("26/13/2026")).toBeNull();
    expect(parseDataIso("xx/yy/zzzz")).toBeNull();
    expect(parseDataIso("")).toBeNull();
  });
});

describe("parseParcela", () => {
  it("extrai k/N de descrições e colunas", () => {
    expect(parseParcela("Compra 3/12")).toEqual({ parcela: 3, total: 12 });
    expect(parseParcela("PARC 03/12")).toEqual({ parcela: 3, total: 12 });
    expect(parseParcela("(1/10)")).toEqual({ parcela: 1, total: 10 });
  });

  it("extrai 'k de N' (formato Itaú: 'Parcela 1 de 4')", () => {
    expect(parseParcela("Parcela 1 de 4")).toEqual({ parcela: 1, total: 4 });
    expect(parseParcela("Parcela 5 de 12")).toEqual({ parcela: 5, total: 12 });
    expect(parseParcela("4 DE 10")).toEqual({ parcela: 4, total: 10 });
  });

  it("não confunde texto com dígitos sem padrão de parcela", () => {
    expect(parseParcela("Loja De Bauru")).toBeNull();
    expect(parseParcela("Posto 3 de Maio")).toBeNull();
  });

  it("ignora 1/1 e parcela fora do intervalo", () => {
    expect(parseParcela("1/1")).toBeNull();
    expect(parseParcela("13/12")).toBeNull();
    expect(parseParcela("0/5")).toBeNull();
  });

  it("retorna null sem padrão de parcela", () => {
    expect(parseParcela("Mercado")).toBeNull();
    expect(parseParcela("")).toBeNull();
    expect(parseParcela(null)).toBeNull();
  });
});

describe("normalizarDescricao", () => {
  it("remove acento, pontuação e colapsa espaços", () => {
    expect(normalizarDescricao("Café  da Manhã!!")).toBe("cafe da manha");
    expect(normalizarDescricao("SUPERMERCADO   SÃO  JOÃO")).toBe(
      "supermercado sao joao",
    );
    expect(normalizarDescricao(null)).toBe("");
  });
});

describe("removerMarcaParcela", () => {
  it("tira a marcação k/N da descrição", () => {
    expect(removerMarcaParcela("NETSHOES 5/12")).toBe("NETSHOES");
    expect(removerMarcaParcela("PARC 03/12 LOJA")).toBe("PARC LOJA");
  });

  it("tira a marcação 'k de N' (formato Itaú)", () => {
    expect(removerMarcaParcela("MAGALU Parcela 1 de 4")).toBe(
      "MAGALU Parcela",
    );
  });

  it("não mexe em texto sem marcação de parcela válida", () => {
    expect(removerMarcaParcela("POSTO 24/7")).toBe("POSTO 24/7");
    expect(removerMarcaParcela("Mercado")).toBe("Mercado");
    expect(removerMarcaParcela(null)).toBe("");
  });
});

describe("descricaoBaseParcela", () => {
  it("faz parcelas da MESMA compra colapsarem no mesmo texto", () => {
    // É isto que permite reconhecer, na fatura de agosto, a compra que julho
    // já lançou como parcelamento.
    expect(descricaoBaseParcela("NETSHOES 5/12")).toBe("netshoes");
    expect(descricaoBaseParcela("NETSHOES 6/12")).toBe("netshoes");
  });

  it("mantém compras distintas distintas", () => {
    expect(descricaoBaseParcela("POSTO 24/7")).toBe("posto 24 7");
    expect(descricaoBaseParcela("MERCADO SÃO JOÃO")).toBe("mercado sao joao");
  });
});
