/**
 * REDESIGN-03-G (L6) — as leituras que DECIDEM uma escrita, com o erro injetado pelo harness.
 *
 * Cada caso afirma duas coisas (§5.7): a mensagem, e que NENHUMA escrita aconteceu depois da
 * leitura que falhou — o harness registra as operações na ordem. Fixture sintética.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria } from "@/test/supabase-em-memoria";

let fake = criarSupabaseEmMemoria({});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { getTransactionSplit, deleteTransaction, setTransactionStatus } = await import(
  "@/lib/actions/transactions"
);
const { deletePerson } = await import("@/lib/actions/people");
const { reapplySplit } = await import("@/lib/finance/split-reapply");
const { createInstallmentPurchase, updateInstallmentSplit, cancelInstallmentFuture } = await import(
  "@/lib/actions/installments"
);
const { generateBillTransaction } = await import("@/lib/actions/bills");
const { deleteCreditCard } = await import("@/lib/actions/credit-cards");

const TX = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
const CARTAO = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const PESSOA = "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b";
const escritas = () => fake.operacoes.filter((o) => o.tipo !== "rpc");

beforeEach(() => {
  fake = criarSupabaseEmMemoria({});
});

describe("03-G L6 · getTransactionSplit (D-G32, Z14)", () => {
  it("divisão falhando não vira 'pessoal': recusa", async () => {
    fake = criarSupabaseEmMemoria(
      { transactions: [{ id: TX, classificacao: "compartilhada" }] },
      { falharLeitura: { shared_expenses: "XX000" } },
    );
    expect(await getTransactionSplit(TX)).toEqual({
      ok: false,
      error: "Não foi possível ler a divisão atual. Nada foi alterado.",
    });
  });

  it("sem erro, devolve a divisão gravada", async () => {
    fake = criarSupabaseEmMemoria({
      transactions: [{ id: TX, classificacao: "compartilhada" }],
      shared_expenses: [],
    });
    const r = await getTransactionSplit(TX);
    expect(r.ok && r.data.classificacao).toBe("compartilhada");
  });
});

describe("03-G L6 · deleteTransaction (Z15, D-G27)", () => {
  it("statementPaidBy falhando recusa ANTES de reabrir a fatura e antes do delete", async () => {
    fake = criarSupabaseEmMemoria(
      { transactions: [{ id: TX, transfer_group_id: null }], receivables: [] },
      { falharLeitura: { card_statements: "XX000" } },
    );
    expect(await deleteTransaction(TX)).toEqual({
      ok: false,
      error: "Não foi possível ler a fatura. Nada foi alterado.",
    });
    expect(escritas()).toEqual([]);
    expect(fake.tabelas.transactions).toHaveLength(1);
  });

  it("a leitura do lançamento falhando recusa sem escrever", async () => {
    fake = criarSupabaseEmMemoria(
      { transactions: [{ id: TX }] },
      { falharLeitura: { transactions: "XX000" } },
    );
    expect(await deleteTransaction(TX)).toEqual({
      ok: false,
      error: "Não foi possível ler o lançamento. Nada foi alterado.",
    });
    expect(escritas()).toEqual([]);
  });

  it("lançamento que já sumiu (PGRST116) não vira 'não foi possível ler'", async () => {
    fake = criarSupabaseEmMemoria({ transactions: [], receivables: [], card_statements: [] });
    expect(await deleteTransaction(TX)).toEqual({ ok: true, data: undefined });
  });
});

describe("03-G L6 · setTransactionStatus", () => {
  it("leitura falhando recusa sem escrever", async () => {
    fake = criarSupabaseEmMemoria(
      { transactions: [{ id: TX, status: "pendente" }] },
      { falharLeitura: { transactions: "XX000" } },
    );
    expect(await setTransactionStatus(TX, "pago")).toEqual({
      ok: false,
      error: "Não foi possível ler o lançamento. Nada foi alterado.",
    });
    expect(escritas()).toEqual([]);
  });
});

describe("03-G L6 · deletePerson", () => {
  it.each(["receivables", "shared_expenses"])("contagem de %s falhando não exclui a pessoa", async (tabela) => {
    fake = criarSupabaseEmMemoria(
      { people: [{ id: PESSOA }], receivables: [], shared_expenses: [] },
      { falharLeitura: { [tabela]: "XX000" } },
    );
    expect(await deletePerson(PESSOA)).toEqual({
      ok: false,
      error: "Não foi possível ler o histórico da pessoa. Nada foi alterado.",
    });
    expect(escritas()).toEqual([]);
    expect(fake.tabelas.people).toHaveLength(1);
  });

  it("sem histórico e sem erro, exclui como antes", async () => {
    fake = criarSupabaseEmMemoria({ people: [{ id: PESSOA }], receivables: [], shared_expenses: [] });
    expect(await deletePerson(PESSOA)).toEqual({ ok: true, data: undefined });
  });
});

describe("03-G L6 · reapplySplit (D-G19, Z13)", () => {
  it("divisão atual falhando recusa sem escrever — a proteção dos recebíveis não é pulada", async () => {
    fake = criarSupabaseEmMemoria(
      { shared_expenses: [{ transaction_id: TX, person_id: PESSOA, valor: 50 }] },
      { falharLeitura: { shared_expenses: "XX000" } },
    );
    const r = await reapplySplit(
      { supabase: fake.client, userId: "user-1" } as never,
      {
        transactionId: TX,
        totalCentavos: 10000,
        totalCentavosAtual: 10000,
        classificacaoAtual: "compartilhada",
        classificacaoNova: "pessoal",
        parts: [],
        mode: { kind: "avista", statementId: null, cardId: null },
      },
    );
    expect(r).toEqual({
      ok: false,
      error: "Não foi possível ler a divisão atual. A divisão não foi alterada.",
    });
    expect(escritas()).toEqual([]);
  });
});

// Fixture sintética: a fatura fica aberta (fechamento em 2099) com o hojeISO real da ação.
function parcelamento() {
  return {
    transactions: [{ id: TX, parcelado: true, classificacao: "compartilhada", card_id: CARTAO, valor_pessoal: 50 }],
    transaction_installments: [
      { id: "inst-1", parent_transaction_id: TX, statement_id: "st-1", status: "ativa", valor: 100 },
    ],
    card_statements: [
      { id: "st-1", data_fechamento: "2099-01-10", data_vencimento: "2099-01-20", pago_em: null },
    ],
    receivables: [{ id: "rc-1", installment_id: "inst-1", transaction_id: TX, status: "pendente", valor: 50 }],
    receivable_receipts: [],
  };
}

describe("03-G L6 · createInstallmentPurchase", () => {
  it("leitura do cartão falhando recusa antes de gravar a compra-pai", async () => {
    fake = criarSupabaseEmMemoria(
      { credit_cards: [{ id: CARTAO, dia_fechamento: 5, dia_vencimento: 12 }] },
      { falharLeitura: { credit_cards: "XX000" } },
    );
    const r = await createInstallmentPurchase({
      card_id: CARTAO,
      qtd_parcelas: 3,
      valor_total: 300,
      purchase_date: "2026-06-01",
      competence_date: "2026-06-01",
    });
    expect(r).toEqual({ ok: false, error: "Não foi possível ler o cartão. Nada foi alterado." });
    expect(escritas()).toEqual([]);
  });

  it("cartão que não existe (PGRST116) continua 'não encontrado'", async () => {
    fake = criarSupabaseEmMemoria({ credit_cards: [] });
    const r = await createInstallmentPurchase({
      card_id: CARTAO,
      qtd_parcelas: 3,
      valor_total: 300,
      purchase_date: "2026-06-01",
      competence_date: "2026-06-01",
    });
    expect(r).toEqual({ ok: false, error: "Cartão não encontrado." });
  });
});

describe("03-G L6 · updateInstallmentSplit", () => {
  it.each([
    ["transactions", "Não foi possível ler as compras parceladas. Nada foi alterado."],
    ["transaction_installments", "Não foi possível ler as parcelas. Nada foi alterado."],
  ])("%s falhando recusa sem escrever", async (tabela, mensagem) => {
    fake = criarSupabaseEmMemoria(parcelamento(), { falharLeitura: { [tabela]: "XX000" } });
    expect(await updateInstallmentSplit(TX, { classificacao: "pessoal", parts: [] })).toEqual({
      ok: false,
      error: mensagem,
    });
    expect(escritas()).toEqual([]);
  });
});

describe("03-G L6 · cancelInstallmentFuture", () => {
  it("parcelas falhando recusa sem escrever", async () => {
    fake = criarSupabaseEmMemoria(parcelamento(), { falharLeitura: { transaction_installments: "XX000" } });
    expect(await cancelInstallmentFuture(TX)).toEqual({
      ok: false,
      error: "Não foi possível ler as parcelas. Nada foi alterado.",
    });
    expect(escritas()).toEqual([]);
  });

  it("faturas falhando recusa — parcela de fatura paga não é cancelada por parecer aberta", async () => {
    fake = criarSupabaseEmMemoria(parcelamento(), { falharLeitura: { card_statements: "XX000" } });
    expect(await cancelInstallmentFuture(TX)).toEqual({
      ok: false,
      error: "Não foi possível ler as faturas. Nada foi alterado.",
    });
    expect(escritas()).toEqual([]);
    expect(fake.tabelas.transaction_installments[0]).toMatchObject({ status: "ativa" });
  });

  it("recálculo do valor pessoal com leitura falha não grava sobre listas vazias e diz 'depois'", async () => {
    const opcoes: { falharLeitura: Record<string, string>; antesDeGravar: (op: { tabela: string; tipo: string }) => null } = {
      falharLeitura: {},
      // A leitura dos recebíveis passa a falhar só DEPOIS de eles serem apagados: a primeira
      // leitura (a proteção) precisa funcionar para a ação chegar ao recálculo.
      antesDeGravar: ({ tabela, tipo }) => {
        if (tabela === "receivables" && tipo === "delete") opcoes.falharLeitura.receivables = "XX000";
        return null;
      },
    };
    fake = criarSupabaseEmMemoria(parcelamento(), opcoes);
    expect(await cancelInstallmentFuture(TX)).toEqual({
      ok: false,
      error:
        "Não foi possível ler as parcelas. A alteração pode ter sido gravada em parte: recarregue a página para conferir.",
    });
    expect(escritas().map((o) => `${o.tabela}:${o.tipo}`)).toEqual([
      "transaction_installments:update",
      "receivables:delete",
    ]);
    expect(fake.tabelas.transactions[0]).toMatchObject({ valor_pessoal: 50 });
  });
});

describe("03-G L6 · generateBillTransaction", () => {
  it("guarda de duplicata falhando recusa — a conta fixa não é lançada duas vezes", async () => {
    fake = criarSupabaseEmMemoria(
      { bills: [{ id: "bill-1", name: "Conta sintética", due_day: 10, amount: 10 }], transactions: [] },
      { falharLeitura: { transactions: "XX000" } },
    );
    expect(await generateBillTransaction("bill-1")).toEqual({
      ok: false,
      error: "Não foi possível ler os lançamentos do mês. Nada foi alterado.",
    });
    expect(escritas()).toEqual([]);
  });
});

describe("03-G L6 · deleteCreditCard", () => {
  it("contagem falhando não exclui o cartão", async () => {
    fake = criarSupabaseEmMemoria(
      { credit_cards: [{ id: CARTAO }], transactions: [] },
      { falharLeitura: { transactions: "XX000" } },
    );
    expect(await deleteCreditCard(CARTAO)).toEqual({
      ok: false,
      error: "Não foi possível ler os lançamentos do cartão. Nada foi alterado.",
    });
    expect(escritas()).toEqual([]);
    expect(fake.tabelas.credit_cards).toHaveLength(1);
  });

  it("sem lançamentos e sem erro, exclui como antes", async () => {
    fake = criarSupabaseEmMemoria({ credit_cards: [{ id: CARTAO }], transactions: [] });
    expect(await deleteCreditCard(CARTAO)).toEqual({ ok: true, data: undefined });
  });
});

describe("03-G L6 · os dois formulários fecham quando a divisão não foi lida (D-G32, Z14)", () => {
  const RAIZ = join(__dirname, "..", "..", "..");
  it.each([
    "src/app/(app)/financeiro/lancamentos/transaction-form.tsx",
    "src/app/(app)/parcelamentos/installment-split-dialog.tsx",
  ])("%s mostra o erro e fecha o diálogo", (arquivo) => {
    const fonte = readFileSync(join(RAIZ, arquivo), "utf8");
    const trecho = fonte.slice(fonte.indexOf("getTransactionSplit("), fonte.indexOf("getTransactionSplit(") + 400);
    expect(trecho).toMatch(/if \(!res\.ok\) \{\s*toast\.error\(res\.error\);\s*setOpen\(false\);\s*return;\s*\}/);
  });
});
