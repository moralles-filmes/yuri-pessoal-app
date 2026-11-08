/** REDESIGN-03-D · A3c — actions sobre o serviço real. Fixture sintética. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria } from "@/test/supabase-em-memoria";

let fake = criarSupabaseEmMemoria({});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const acoes = await import("@/lib/actions/receivables");
const { bulkSetReceivableStatus, setReceivableStatus } = acoes;

const ID = "8b2e4d10-1c3f-4e55-9a02-6d7b8c9e0f11";

beforeEach(() => {
  fake = criarSupabaseEmMemoria({
    receivables: [{ id: ID, user_id: "user-1", valor: 600, status: "pendente", pago_em: null }],
    receivable_receipts: [],
  });
});

describe("03-D A3c · actions de recebíveis", () => {
  it("recusa marcar pago pelo status e não grava nada", async () => {
    const resultado = await setReceivableStatus(ID, "pago");
    expect(resultado).toMatchObject({ ok: false, error: expect.stringContaining("receita vinculada") });
    expect(fake.escritas()).toEqual([]);
  });

  it("04-C T8: 'Receber' e o registro manual saíram — a superfície de escrita não os exporta", () => {
    expect(acoes).not.toHaveProperty("markReceivableReceived");
    expect(acoes).not.toHaveProperty("registrarRecebimentoAction");
  });

  it("04-C T8: o lote recusa a ação 'receber' e a data 'pago_em', e não grava nada", async () => {
    const receber = await bulkSetReceivableStatus({ ids: [ID], acao: "receber" });
    expect(receber.ok).toBe(false);
    const comData = await bulkSetReceivableStatus({ ids: [ID], acao: "cobrado", pago_em: "2026-01-05" });
    expect(comData.ok).toBe(false);
    expect(fake.escritas()).toEqual([]);
  });

  it("04-C T8: o lote 'cobrado' continua funcionando e nunca grava pago", async () => {
    const resultado = await bulkSetReceivableStatus({ ids: [ID], acao: "cobrado" });
    expect(resultado).toMatchObject({ ok: true, data: { afetados: 1 } });
    expect(fake.tabelas.receivables[0].status).toBe("cobrado");
    expect(fake.escritas("receivable_receipts")).toEqual([]);
  });
});
