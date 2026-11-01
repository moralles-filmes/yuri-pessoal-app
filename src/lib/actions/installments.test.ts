import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria } from "@/test/supabase-em-memoria";

let fake = criarSupabaseEmMemoria({});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { cancelInstallmentFuture, createInstallmentPurchase, deleteInstallmentPurchase } = await import(
  "@/lib/actions/installments"
);

const CARTAO = "2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e";
const PESSOA = "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b";
const COMPRA_ID = "7e6d5c4b-3a29-4180-9f8e-7d6c5b4a3921";

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

describe("03-D RR-D-17 · excluir o parcelamento", () => {
  it("com recebimento registrado é recusado, sem escrita", async () => {
    fake = criarSupabaseEmMemoria(parcelamento("pendente", true));
    const r = await deleteInstallmentPurchase("tx-p");
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/recebimento registrado/) });
    expect(fake.escritas()).toHaveLength(0);
  });

  it("pago legado sem recebimento continua deixando excluir (b)", async () => {
    fake = criarSupabaseEmMemoria(parcelamento("pago"));
    const r = await deleteInstallmentPurchase("tx-p");
    expect(r.ok).toBe(true);
    expect(fake.escritas()).toHaveLength(1);
    expect(fake.escritas()[0]).toMatchObject({ tabela: "transactions", tipo: "delete" });
  });
});

/* ───────────── 03-G2 (D-G2-12) · E4 — a compra parcelada pela rpc, o cancelamento ordenado ───────────── */

const rotulo = (o: { tabela: string; tipo: string }) => `${o.tabela}:${o.tipo}`;
const erroDoBanco = (code: string) => ({ code, message: "relation segredo_do_banco coluna_interna" });

describe("03-G2 E4 · createInstallmentPurchase grava por UMA rpc", () => {
  // Fixture sintética: cartão fecha dia 5 e vence dia 12; 3 parcelas a partir da 2ª (de 4).
  const compra = {
    card_id: CARTAO,
    qtd_parcelas: 3,
    valor_total: 300,
    purchase_date: "2026-06-01",
    competence_date: "2026-06-01",
    numero_inicial: 2,
    parcelas_total_label: 4,
  };
  const cartao = { credit_cards: [{ id: CARTAO, dia_fechamento: 5, dia_vencimento: 12 }], card_statements: [] };
  const GRAVA_EM_TRANSACTIONS = ["transactions", "transaction_installments", "shared_expenses", "receivables"];
  const soDoNegocio = () => fake.escritas().filter((o) => GRAVA_EM_TRANSACTIONS.includes(o.tabela));

  it("fatura de uma parcela falha: nenhuma escrita em transactions nem rpc (Y19)", async () => {
    // A 2ª fatura não pode ser criada (o insert é recusado e a re-leitura não a acha).
    let faturasCriadas = 0;
    fake = criarSupabaseEmMemoria(cartao, {
      antesDeGravar: ({ tabela, tipo }) => {
        if (tabela !== "card_statements" || tipo !== "insert") return null;
        faturasCriadas += 1;
        return faturasCriadas === 2 ? erroDoBanco("23505") : null;
      },
      rpc: () => ({ data: COMPRA_ID, error: null }),
    });
    const r = await createInstallmentPurchase(compra);
    expect(r).toEqual({
      ok: false,
      error: "Não foi possível resolver a fatura de uma das parcelas. Nada foi alterado.",
    });
    expect(soDoNegocio()).toEqual([]);
    expect(fake.escritas("criar_compra_parcelada")).toEqual([]);
  });

  it("sucesso: UMA rpc criar_compra_parcelada, p_parcelas com 3 itens e numero real, recebiveis com parcela_numero", async () => {
    fake = criarSupabaseEmMemoria(cartao, { rpc: () => ({ data: COMPRA_ID, error: null }) });
    const r = await createInstallmentPurchase({
      ...compra,
      classificacao: "compartilhada",
      parts: [{ person_id: PESSOA, tipo: "valor", valor: 90 }],
    });
    expect(r).toEqual({ ok: true, data: { id: COMPRA_ID } });

    // Nada de insert direto: a rpc é a única escrita em transactions/parcelas/divisão.
    expect(soDoNegocio()).toEqual([]);
    const rpcs = fake.escritas("criar_compra_parcelada");
    expect(rpcs).toHaveLength(1);
    expect(fake.escritas().filter((o) => o.tipo === "rpc")).toHaveLength(1);

    const args = rpcs[0].valores as {
      p_pai: Record<string, unknown>;
      p_parcelas: {
        numero: number;
        total_parcelas: number;
        valor: number;
        statement_id: string;
        data_competencia: string;
      }[];
      p_divisao: { alcance: string; recebiveis: { parcela_numero: number; statement_id: string; valor: number }[] };
    };
    expect(args.p_parcelas).toHaveLength(3);
    expect(args.p_parcelas.map((p) => p.numero)).toEqual([2, 3, 4]);
    expect(args.p_parcelas.every((p) => p.total_parcelas === 4 && p.valor === 100)).toBe(true);
    const faturas = fake.tabelas.card_statements.map((f) => f.id);
    expect(new Set(args.p_parcelas.map((p) => p.statement_id)).size).toBe(3);
    expect(args.p_parcelas.every((p) => faturas.includes(p.statement_id))).toBe(true);

    expect(args.p_pai).toMatchObject({
      type: "despesa",
      payment_method: "cartao_credito",
      card_id: CARTAO,
      amount: 300,
      valor_total: 300,
      qtd_parcelas: 3,
      classificacao: "compartilhada",
      valor_pessoal: 210,
    });
    expect(args.p_pai).not.toHaveProperty("statement_id");

    expect(args.p_divisao.alcance).toBe("regra-cheia");
    const rec = args.p_divisao.recebiveis;
    expect(rec.length).toBeGreaterThan(0);
    expect(rec.every((x) => [2, 3, 4].includes(x.parcela_numero))).toBe(true);
    expect(rec.reduce((acc, x) => acc + x.valor, 0)).toBeCloseTo(90, 2);
    // Cada recebível cai na fatura da parcela de mesmo número.
    for (const x of rec) {
      expect(x.statement_id).toBe(args.p_parcelas.find((p) => p.numero === x.parcela_numero)?.statement_id);
    }
  });

  it("compra pessoal: p_divisao nulo, classificacao pessoal e valor_pessoal nulo", async () => {
    fake = criarSupabaseEmMemoria(cartao, { rpc: () => ({ data: COMPRA_ID, error: null }) });
    const r = await createInstallmentPurchase(compra);
    expect(r.ok).toBe(true);
    const args = fake.escritas("criar_compra_parcelada")[0].valores as Record<string, unknown>;
    expect(args.p_divisao).toBeNull();
    expect(args.p_pai).toMatchObject({ classificacao: "pessoal", valor_pessoal: null });
  });

  it("divisão que não fecha: nenhuma escrita", async () => {
    fake = criarSupabaseEmMemoria(cartao, { rpc: () => ({ data: COMPRA_ID, error: null }) });
    const r = await createInstallmentPurchase({
      ...compra,
      classificacao: "compartilhada",
      parts: [{ person_id: PESSOA, tipo: "valor", valor: 500 }],
    });
    expect(r.ok).toBe(false);
    expect(soDoNegocio()).toEqual([]);
    expect(fake.escritas("criar_compra_parcelada")).toEqual([]);
  });

  it("rpc com P0001: Nada foi alterado., sem a mensagem do banco", async () => {
    fake = criarSupabaseEmMemoria(cartao, { rpc: () => ({ data: null, error: erroDoBanco("P0001") }) });
    const r = await createInstallmentPurchase(compra);
    expect(r).toEqual({
      ok: false,
      error: "Não foi possível salvar a compra parcelada. Nada foi alterado.",
    });
    expect(JSON.stringify(r)).not.toContain("segredo_do_banco");
    expect(soDoNegocio()).toEqual([]);
  });

  it("rpc sem SQLSTATE (rede): desfecho desconhecido, não afirma que nada mudou", async () => {
    fake = criarSupabaseEmMemoria(cartao, {
      rpc: () => ({ data: null, error: { code: "", message: "fetch failed" } }),
    });
    const r = await createInstallmentPurchase(compra);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/Não foi possível confirmar o resultado/) });
    expect(r.ok === false && r.error).not.toMatch(/Nada foi alterado/);
  });
});

describe("03-G2 E4 · cancelInstallmentFuture, ordenado e conferido (D-G2-9)", () => {
  const FRASE_PARCELAS =
    "Os recebíveis destas parcelas foram removidos, mas as parcelas não foram canceladas. Tente cancelar de novo.";
  const FRASE_RECALCULO =
    "As parcelas foram canceladas, mas a minha parte da compra não foi recalculada. Edite a divisão em Parcelamentos para recalcular.";
  const recusar = (tabela: string, tipo: string) => ({
    antesDeGravar: (op: { tabela: string; tipo: string }) =>
      op.tabela === tabela && op.tipo === tipo ? erroDoBanco("XX000") : null,
  });

  it("delete de receivables antes do update de transaction_installments antes do update de transactions (Y20)", async () => {
    fake = criarSupabaseEmMemoria(parcelamento());
    const r = await cancelInstallmentFuture("tx-p");
    expect(r.ok).toBe(true);
    expect(fake.escritas().map(rotulo)).toEqual([
      "receivables:delete",
      "transaction_installments:update",
      "transactions:update",
    ]);
  });

  it("delete falho: Nada foi alterado., nenhum update", async () => {
    fake = criarSupabaseEmMemoria(parcelamento(), recusar("receivables", "delete"));
    const r = await cancelInstallmentFuture("tx-p");
    expect(r).toEqual({
      ok: false,
      error: "Não foi possível cancelar as parcelas futuras. Nada foi alterado.",
    });
    expect(fake.escritas()).toEqual([]);
    expect(fake.tabelas.receivables).toHaveLength(1);
    expect(fake.tabelas.transaction_installments[0]).toMatchObject({ status: "ativa" });
  });

  it("update das parcelas falho: diz que os recebíveis foram removidos e manda repetir", async () => {
    fake = criarSupabaseEmMemoria(parcelamento(), recusar("transaction_installments", "update"));
    const r = await cancelInstallmentFuture("tx-p");
    expect(r).toEqual({ ok: false, error: FRASE_PARCELAS });
    expect(fake.tabelas.receivables).toEqual([]);
    expect(fake.tabelas.transaction_installments[0]).toMatchObject({ status: "ativa" });
    expect(fake.tabelas.transactions[0]).toMatchObject({ valor_pessoal: 50 });
    expect(JSON.stringify(r)).not.toContain("segredo_do_banco");
  });

  it("recálculo falho: as parcelas ficam canceladas e a frase manda editar a divisão", async () => {
    fake = criarSupabaseEmMemoria(parcelamento(), recusar("transactions", "update"));
    const r = await cancelInstallmentFuture("tx-p");
    expect(r).toEqual({ ok: false, error: FRASE_RECALCULO });
    expect(fake.tabelas.transaction_installments[0]).toMatchObject({ status: "cancelada" });
    expect(fake.tabelas.transactions[0]).toMatchObject({ valor_pessoal: 50 });
  });

  it("update das parcelas falho SEM recebíveis apagados: Nada foi alterado.", async () => {
    const base = parcelamento();
    fake = criarSupabaseEmMemoria(
      {
        ...base,
        receivables: [],
        transactions: [{ id: "tx-p", parcelado: true, classificacao: "pessoal", valor_pessoal: null }],
      },
      recusar("transaction_installments", "update"),
    );
    const r = await cancelInstallmentFuture("tx-p");
    expect(r).toEqual({
      ok: false,
      error: "Não foi possível cancelar as parcelas futuras. Nada foi alterado.",
    });
    expect(fake.escritas()).toEqual([]);
  });

  it("repetir o cancelamento sem recebíveis numa compra dividida também recalcula valor_pessoal", async () => {
    // Estado depois de uma queda entre o passo 1 e o 2: recebíveis já apagados, parcela ainda ativa.
    const base = parcelamento();
    fake = criarSupabaseEmMemoria({
      ...base,
      receivables: [],
      transactions: [{ id: "tx-p", parcelado: true, classificacao: "compartilhada", valor_pessoal: 50 }],
    });
    const r = await cancelInstallmentFuture("tx-p");
    expect(r.ok).toBe(true);
    expect(fake.escritas().map(rotulo)).toEqual(["transaction_installments:update", "transactions:update"]);
    expect(fake.tabelas.transactions[0]).toMatchObject({ valor_pessoal: null });
  });

  it("compra pessoal sem recebíveis não regrava valor_pessoal", async () => {
    const base = parcelamento();
    fake = criarSupabaseEmMemoria({
      ...base,
      receivables: [],
      transactions: [{ id: "tx-p", parcelado: true, classificacao: "pessoal", valor_pessoal: null }],
    });
    const r = await cancelInstallmentFuture("tx-p");
    expect(r.ok).toBe(true);
    expect(fake.escritas().map(rotulo)).toEqual(["transaction_installments:update"]);
  });

  it("leitura da compra-pai falhando recusa antes de qualquer escrita", async () => {
    fake = criarSupabaseEmMemoria(parcelamento(), { falharLeitura: { transactions: "XX000" } });
    const r = await cancelInstallmentFuture("tx-p");
    expect(r).toEqual({ ok: false, error: "Não foi possível ler as compras parceladas. Nada foi alterado." });
    expect(fake.escritas()).toEqual([]);
  });
});
