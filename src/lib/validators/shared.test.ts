import { describe, expect, it } from "vitest";
import { moneyAmount, moneyAmountSigned } from "@/lib/validators/shared";

describe("moneyAmount", () => {
  it("aceita vírgula como separador decimal (padrão BR)", () => {
    expect(moneyAmount.parse("500,01")).toBe(500.01);
    expect(moneyAmount.parse("1.234,56")).toBe(1234.56);
    expect(moneyAmount.parse("R$ 99,90")).toBe(99.9);
  });

  it("aceita ponto decimal (valor vindo do banco / number)", () => {
    expect(moneyAmount.parse("1234.56")).toBe(1234.56);
    expect(moneyAmount.parse(1234.56)).toBe(1234.56);
  });

  it("trata vazio como 0 (comportamento preservado)", () => {
    expect(moneyAmount.parse("")).toBe(0);
  });

  it("rejeita lixo em vez de virar 0", () => {
    expect(moneyAmount.safeParse("abc").success).toBe(false);
  });

  it("rejeita valores negativos", () => {
    expect(moneyAmount.safeParse("-10,00").success).toBe(false);
  });
});

describe("moneyAmountSigned", () => {
  it("aceita vírgula como separador decimal (padrão BR)", () => {
    expect(moneyAmountSigned.parse("500,01")).toBe(500.01);
    expect(moneyAmountSigned.parse("1.234,56")).toBe(1234.56);
  });

  it("aceita saldo negativo (conta no vermelho)", () => {
    expect(moneyAmountSigned.parse("-1.234,56")).toBe(-1234.56);
    expect(moneyAmountSigned.parse("-50,00")).toBe(-50);
  });

  it("trata vazio como 0", () => {
    expect(moneyAmountSigned.parse("")).toBe(0);
  });

  it("rejeita lixo", () => {
    expect(moneyAmountSigned.safeParse("abc").success).toBe(false);
  });
});
