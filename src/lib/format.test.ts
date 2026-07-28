import { describe, expect, it } from "vitest";
import {
  dateInSaoPaulo,
  formatCurrency,
  formatDate,
  formatDateWith,
  getInitials,
  parseCurrencyToNumber,
  saoPauloWallClockToInstant,
  timeInSaoPaulo,
  toDateInputValue,
  toDateTimeLocalInSaoPaulo,
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
  /**
   * Contrato: `Date`/ISO com hora é INSTANTE (lido em Brasília); 'yyyy-MM-dd' é data pura
   * (reordenada como texto). Por isso os casos abaixo usam instantes absolutos (`Z`) —
   * um `new Date(2026, 5, 25)` dependeria do fuso de quem roda o teste.
   */
  it("formata instantes no padrão brasileiro (dd/mm/aaaa)", () => {
    expect(formatDate(new Date("2026-06-25T12:00:00Z"))).toBe("25/06/2026");
    expect(formatDate(new Date("2020-01-05T12:00:00Z"))).toBe("05/01/2020");
  });

  it("formata strings 'yyyy-MM-dd' como data pura (sem deslocar 1 dia por timezone)", () => {
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

/**
 * Estes casos usam instantes ABSOLUTOS (sufixo `Z`) e valores esperados de Brasília, então
 * valem em qualquer fuso de processo. Rodar a suíte com `TZ=UTC` deve mantê-los verdes —
 * é isso que prova que a correção não depende do `TZ` do ambiente.
 */
describe("fuso de Brasília — instantes nunca são lidos em UTC", () => {
  // 20/07 00:30 UTC = 19/07 21:30 em Brasília.
  const noite = new Date("2026-07-20T00:30:00Z");

  it("formatDate lê um instante no fuso de Brasília", () => {
    expect(formatDate(noite)).toBe("19/07/2026");
  });

  it("formatDate trata data pura como texto (nenhum fuso a desloca)", () => {
    expect(formatDate("2026-07-20")).toBe("20/07/2026");
  });

  it("formatDateWith respeita Brasília e o formato escolhido", () => {
    expect(formatDateWith(noite, "yyyy-MM-dd")).toBe("2026-07-19");
    expect(formatDateWith(noite, "dd/MM/yy")).toBe("19/07/26");
    // Data pura continua intocada.
    expect(formatDateWith("2026-07-20", "dd/MM/yyyy")).toBe("20/07/2026");
  });

  it("timeInSaoPaulo devolve a hora de parede brasileira", () => {
    expect(timeInSaoPaulo(noite)).toBe("21:30");
  });

  it("saoPauloWallClockToInstant ancora a hora digitada em UTC-3", () => {
    // 19:00 em Brasília é 22:00 UTC — independente do fuso de quem digitou.
    expect(saoPauloWallClockToInstant("2026-07-19", "19:00").toISOString()).toBe(
      "2026-07-19T22:00:00.000Z",
    );
  });

  it("hora de parede sobrevive ao ida-e-volta", () => {
    const instante = saoPauloWallClockToInstant("2026-07-19", "23:45");
    expect(toDateTimeLocalInSaoPaulo(instante)).toBe("2026-07-19T23:45");
    expect(dateInSaoPaulo(instante)).toBe("2026-07-19");
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
