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

const TX = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";
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
