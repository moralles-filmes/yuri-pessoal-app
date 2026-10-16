/** REDESIGN-03-D · A3c — actions sobre o serviço real. Fixture sintética. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria } from "@/test/supabase-em-memoria";

let fake = criarSupabaseEmMemoria({});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { registrarRecebimentoAction, setReceivableStatus } = await import("@/lib/actions/receivables");

const ID = "8b2e4d10-1c3f-4e55-9a02-6d7b8c9e0f11";
const valido = {
  receivable_id: ID,
  valor: "250,00",
  recebido_em: "2026-01-05",
  observacoes: "",
};

beforeEach(() => {
  fake = criarSupabaseEmMemoria({
    receivables: [{ id: ID, user_id: "user-1", valor: 600, status: "pendente", pago_em: null }],
    receivable_receipts: [],
  });
});

describe("03-D A3c · actions de recebíveis", () => {
  it("recusa marcar pago pelo status e não grava nada", async () => {
    const resultado = await setReceivableStatus(ID, "pago");
    expect(resultado).toMatchObject({ ok: false, error: expect.stringContaining("Use Receber") });
    expect(fake.escritas()).toEqual([]);
  });

  it("K2: recusa conta_id no recebimento e não grava nada", async () => {
    const resultado = await registrarRecebimentoAction({ ...valido, conta_id: ID });
    expect(resultado.ok).toBe(false);
    expect(fake.escritas()).toEqual([]);
  });

  it("registra o recebimento válido com exatamente uma escrita de recebimento", async () => {
    const resultado = await registrarRecebimentoAction(valido);
    expect(resultado.ok).toBe(true);
    expect(fake.escritas("receivable_receipts")).toHaveLength(1);
    expect(fake.tabelas.receivable_receipts).toEqual([
      expect.objectContaining({
        user_id: "user-1",
        receivable_id: ID,
        valor: 250,
        recebido_em: "2026-01-05",
        observacoes: null,
      }),
    ]);
  });
});
