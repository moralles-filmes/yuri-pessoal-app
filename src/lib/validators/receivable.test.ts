import { describe, expect, it } from "vitest";
import { receberSaldoSchema, registrarRecebimentoSchema } from "@/lib/validators/receivable";

const ID = "8b2e4d10-1c3f-4e55-9a02-6d7b8c9e0f11";
const base = { receivable_id: ID, valor: "250,00", recebido_em: "2026-06-05", observacoes: "" };

describe("registrarRecebimentoSchema", () => {
  it.each([
    ["250,00", 250],
    ["R$ 1.234,56", 1234.56],
    [" 50 ", 50],
    [250, 250],
  ])("aceita o valor BR %s → %s", (valor, esperado) => {
    const r = registrarRecebimentoSchema.safeParse({ ...base, valor });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.valor).toBe(esperado);
  });

  it.each(["0", "0,00", "-10"])("recusa %s no campo valor", (valor) => {
    const r = registrarRecebimentoSchema.safeParse({ ...base, valor });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.valor?.length).toBeGreaterThan(0);
  });

  it("observação vazia vira null", () => {
    const r = registrarRecebimentoSchema.parse(base);
    expect(r.observacoes).toBeNull();
  });

  it.each(["conta_id", "transaction_id"])("K2: recusa %s (.strict)", (chave) => {
    expect(registrarRecebimentoSchema.safeParse({ ...base, [chave]: ID }).success).toBe(false);
  });

  it("recusa data fora do formato", () => {
    expect(registrarRecebimentoSchema.safeParse({ ...base, recebido_em: "05/06/2026" }).success).toBe(false);
  });
});

describe("receberSaldoSchema", () => {
  it("data opcional", () => {
    expect(receberSaldoSchema.safeParse({ id: ID }).success).toBe(true);
    expect(receberSaldoSchema.safeParse({ id: ID, recebido_em: "2026-06-05" }).success).toBe(true);
  });
});
