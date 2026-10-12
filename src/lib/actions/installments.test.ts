import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria } from "@/test/supabase-em-memoria";

let fake = criarSupabaseEmMemoria({});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { cancelInstallmentFuture } = await import("@/lib/actions/installments");

// Fixture sintética: a fatura permanece aberta com o hojeISO real da ação.
function parcelamento(status = "pendente", comRecebimento = false) {
  return {
    transactions: [{ id: "tx-p", parcelado: true, valor_pessoal: 50 }],
    transaction_installments: [
      { id: "inst-1", parent_transaction_id: "tx-p", statement_id: "st-1", status: "ativa", valor: 100 },
    ],
    card_statements: [
      { id: "st-1", data_fechamento: "2099-01-10", data_vencimento: "2099-01-20", pago_em: null },
    ],
    receivables: [
      { id: "rc-1", installment_id: "inst-1", transaction_id: "tx-p", status, valor: 50 },
    ],
    receivable_receipts: comRecebimento
      ? [{ id: "rr-1", receivable_id: "rc-1", valor: 10, recebido_em: "2026-06-05", created_at: "2026-06-05T10:00:00Z" }]
      : [],
  };
}

beforeEach(() => {
  fake = criarSupabaseEmMemoria({});
});

describe("03-D A4 · cancelar parcelas futuras", () => {
  it("com recebimento registrado é recusado, sem escrita", async () => {
    fake = criarSupabaseEmMemoria(parcelamento("pendente", true));
    const r = await cancelInstallmentFuture("tx-p");
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/recebimento registrado/) });
    expect(fake.escritas()).toHaveLength(0);
  });

  it("ignorado sem recebimento é recusado, sem escrita", async () => {
    fake = criarSupabaseEmMemoria(parcelamento("ignorado"));
    const r = await cancelInstallmentFuture("tx-p");
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/decidiu não cobrar/) });
    expect(fake.escritas()).toHaveLength(0);
  });

  it("pendente sem recebimento cancela", async () => {
    fake = criarSupabaseEmMemoria(parcelamento());
    const r = await cancelInstallmentFuture("tx-p");
    expect(r.ok).toBe(true);
    expect(fake.tabelas.transaction_installments).toEqual([
      expect.objectContaining({ id: "inst-1", status: "cancelada" }),
    ]);
    expect(fake.tabelas.receivables).toEqual([]);
    expect(fake.tabelas.transactions[0]).toMatchObject({ id: "tx-p", valor_pessoal: null });
  });
});
