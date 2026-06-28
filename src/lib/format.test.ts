import { describe, expect, it } from "vitest";
import {
  dateInSaoPaulo,
  formatCurrency,
  formatDate,
  getInitials,
  parseCurrencyToNumber,
  toDateInputValue,
} from "@/lib/format";

/**
 * `Intl.NumberFormat('pt-BR')` insere um espaço não-quebrável (U+00A0) entre
 * "R$" e o número. `\s` no regex JS já cobre esse caractere, então normalizamos
 * para um espaço comum antes de comparar.
 */
const norm = (s: string) => s.replace(/\s+/g, " ");

describe("formatCurrency", () => {
  it("formata valores positivos em BRL", () => {
    expect(norm(formatCurrency(1234.56))).toBe("R$ 1.234,56");
    expect(norm(formatCurrency(1000000))).toBe("R$ 1.000.000,00");
  });

  it("formata zero", () => {
    expect(norm(formatCurrency(0))).toBe("R$ 0,00");
  });

  it("formata negativos", () => {
    expect(norm(formatCurrency(-50))).toBe("-R$ 50,00");
  });

  it("trata valores não-finitos como 0", () => {
    expect(norm(formatCurrency(Number.NaN))).toBe("R$ 0,00");
    expect(norm(formatCurrency(Number.POSITIVE_INFINITY))).toBe("R$ 0,00");
  });
});

describe("formatDate", () => {
  it("formata datas no padrão brasileiro (dd/mm/aaaa)", () => {
    expect(formatDate(new Date(2026, 5, 25))).toBe("25/06/2026");
    expect(formatDate(new Date(2020, 0, 5))).toBe("05/01/2020");
  });

  it("formata strings 'yyyy-MM-dd' como data local (sem deslocar 1 dia por timezone)", () => {
    expect(formatDate("2026-01-10")).toBe("10/01/2026");
    expect(formatDate("2026-12-31")).toBe("31/12/2026");
  });
});

describe("parseCurrencyToNumber", () => {
  it("interpreta o formato brasileiro", () => {
    expect(parseCurrencyToNumber("1.234,56")).toBe(1234.56);
    expect(parseCurrencyToNumber("1234,56")).toBe(1234.56);
    expect(parseCurrencyToNumber("R$ 99,90")).toBe(99.9);
  });

  it("aceita ponto decimal simples", () => {
    expect(parseCurrencyToNumber("1234.56")).toBe(1234.56);
  });

  it("retorna 0 para entradas inválidas/vazias", () => {
    expect(parseCurrencyToNumber("")).toBe(0);
    expect(parseCurrencyToNumber("abc")).toBe(0);
  });
});

describe("toDateInputValue", () => {
  it("converte para 'yyyy-MM-dd'", () => {
    expect(toDateInputValue(new Date(2026, 5, 25))).toBe("2026-06-25");
    expect(toDateInputValue(new Date(2026, 0, 3))).toBe("2026-01-03");
  });
});

describe("dateInSaoPaulo — data do calendário no fuso pt-BR", () => {
  it("não 'vira o dia' à noite quando o servidor está em UTC", () => {
    // 28/06 00:30 UTC ainda é 27/06 21:30 em São Paulo (UTC-3): deve ser dia 27.
    expect(dateInSaoPaulo(new Date("2026-06-28T00:30:00Z"))).toBe("2026-06-27");
    // 23:30 UTC do dia 27 já é 27/06 20:30 em SP: continua dia 27.
    expect(dateInSaoPaulo(new Date("2026-06-27T23:30:00Z"))).toBe("2026-06-27");
    // 13:00 UTC = 10:00 BRT: mesmo dia.
    expect(dateInSaoPaulo(new Date("2026-06-28T13:00:00Z"))).toBe("2026-06-28");
  });
});

describe("getInitials", () => {
  it("gera iniciais a partir de nome e e-mail", () => {
    expect(getInitials("João Silva")).toBe("JS");
    expect(getInitials("joao@email.com")).toBe("JO");
    expect(getInitials("Maria")).toBe("MA");
    expect(getInitials(null)).toBe("U");
  });
});
