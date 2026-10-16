import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria } from "@/test/supabase-em-memoria";

let fake = criarSupabaseEmMemoria({});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { undoImportBatch } = await import("@/lib/actions/imports");

// Fixture sintética com parcela em fatura não paga, alcançando também essa conferência.
function lote(comRecebimento = false) {
  return {
    import_batches: [{ id: "lote-1", status: "importado", total_importadas: 1 }],
    import_rows: [
      { id: "ir-1", import_batch_id: "lote-1", transaction_id: "tx-imp", status: "importada" },
    ],
    transactions: [{ id: "tx-imp", statement_id: null }],
    transaction_installments: [
      { id: "inst-1", parent_transaction_id: "tx-imp", statement_id: "st-1", status: "ativa", valor: 100 },
    ],
    card_statements: [
      { id: "st-1", competencia: "2099-01-01", data_fechamento: "2099-01-10", data_vencimento: "2099-01-20", pago_em: null },
    ],
    receivables: [
      { id: "rc-1", transaction_id: "tx-imp", installment_id: "inst-1", status: "pendente", valor: 100 },
    ],
    receivable_receipts: comRecebimento
      ? [{ id: "rr-1", receivable_id: "rc-1", valor: 40, recebido_em: "2026-06-05", created_at: "2026-06-05T10:00:00Z" }]
      : [],
  };
}

beforeEach(() => {
  fake = criarSupabaseEmMemoria({});
});

describe("03-D A4 · desfazer a importação", () => {
  it("com recebimento registrado é recusado, sem escrita", async () => {
    fake = criarSupabaseEmMemoria(lote(true));
    const r = await undoImportBatch("lote-1");
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/recebimento registrado/) });
    expect(fake.escritas()).toHaveLength(0);
  });

  it("pendente sem recebimento desfaz", async () => {
    fake = criarSupabaseEmMemoria(lote());
    const r = await undoImportBatch("lote-1");
    expect(r).toEqual({ ok: true, data: { removidas: 1 } });
    expect(fake.escritas("transactions")).toEqual([
      expect.objectContaining({ tipo: "delete", filtros: [["in", "id", ["tx-imp"]]] }),
    ]);
    expect(fake.tabelas.transactions).toEqual([]);
    expect(fake.tabelas.import_rows[0]).toMatchObject({ status: "para_importar", transaction_id: null });
    expect(fake.tabelas.import_batches[0]).toMatchObject({ status: "revisando", total_importadas: 0 });
  });
});
