/**
 * REDESIGN-03-C · A2 — `criarTransacao` visto de fora, sobre um client em memória.
 *
 * Até a 03-C este caminho não tinha teste nenhum. Ele passa a provar três coisas:
 *   1. a receita grava a responsabilidade decidida pela A1 (`pessoal`/`terceiro`/
 *      `compartilhada`), e a recusa da A1 não grava nada;
 *   2. o payload que a IMPORTAÇÃO manda (`classificacao` de uma linha que foi despesa e virou
 *      receita) continua gravando `pessoal` — as chaves da receita são próprias;
 *   3. a despesa grava EXATAMENTE como antes.
 *
 * `applySplit` roda de verdade sobre o client falso. Fixture sintética.
 */
import { describe, expect, it, vi } from "vitest";
import { criarTransacao, excluirTransacaoSimples, type FinanceServiceContext } from "@/lib/finance/services";
import { MSG_PARTE_AUSENTE, MSG_PARTE_TOTAL } from "@/lib/finance/responsabilidade-da-receita";
import { criarSupabaseEmMemoria, type Linha } from "@/test/supabase-em-memoria";

// A leitura usa o client em memória do ctx; neutraliza apenas o client de servidor.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));

const CONTA = "3f1a7c60-9d2b-4a11-8f37-2c9a1b7e5d40";
const PESSOA = "8b2e4d10-1c3f-4e55-9a02-6d7b8c9e0f11";

const BASE = {
  payment_method: "pix",
  account_id: CONTA,
  amount: 1000,
  purchase_date: "2026-06-10",
  competence_date: "2026-06-10",
  description: "x",
};

function rodar(payload: Linha) {
  const fake = criarSupabaseEmMemoria({});
  const ctx = { supabase: fake.client, userId: "user-1" } as unknown as FinanceServiceContext;
  return { fake, resultado: criarTransacao(ctx, payload) };
}

describe("03-D · A4 — o desfazer da IA não apaga dinheiro registrado", () => {
  function cenario(status: string, recebimentos: Linha[]) {
    const fake = criarSupabaseEmMemoria({
      transactions: [{ id: "tx-ia", user_id: "user-1", transfer_group_id: null }],
      receivables: [{ id: "rec-ia", user_id: "user-1", transaction_id: "tx-ia", status, valor: 100 }],
      receivable_receipts: recebimentos,
    });
    const ctx = { supabase: fake.client, userId: "user-1" } as unknown as FinanceServiceContext;
    return { fake, ctx };
  }

  it("recusa recebível pendente com recebimento registrado, sem nenhuma escrita", async () => {
    const { fake, ctx } = cenario("pendente", [{
      id: "receb-ia", user_id: "user-1", receivable_id: "rec-ia", valor: 40,
      recebido_em: "2026-06-05", created_at: "2026-06-05T10:00:00Z",
    }]);

    const resultado = await excluirTransacaoSimples(ctx, "tx-ia");

    expect(resultado).toEqual({ ok: false, erro: expect.stringContaining("recebimento registrado") });
    expect(fake.escritas()).toEqual([]);
  });

  it("permite pago legado sem recebimento e escreve somente o delete do lançamento (decisão b)", async () => {
    const { fake, ctx } = cenario("pago", []);

    const resultado = await excluirTransacaoSimples(ctx, "tx-ia");

    expect(resultado).toEqual({ ok: true });
    expect(fake.escritas()).toEqual([
      { tabela: "transactions", tipo: "delete", filtros: [["eq", "id", "tx-ia"]] },
    ]);
    expect(fake.tabelas.transactions).toEqual([]);
  });
});

/** A linha que o insert de `transactions` recebeu (a primeira, e só pode haver uma). */
function inseridaEmTransactions(fake: ReturnType<typeof criarSupabaseEmMemoria>): Linha {
  const inserts = fake.escritas("transactions").filter((o) => o.tipo === "insert");
  expect(inserts).toHaveLength(1);
  return inserts[0].valores as Linha;
}

describe("03-C A2 · criarTransacao — a receita grava a responsabilidade da A1", () => {
  it("receita sem os campos de responsabilidade nasce pessoal, com valor_pessoal nulo", async () => {
    const { fake, resultado } = rodar({ ...BASE, type: "receita", status: "recebido" });
    expect((await resultado).ok).toBe(true);
    const linha = inseridaEmTransactions(fake);
    expect(linha.classificacao).toBe("pessoal");
    expect(linha.valor_pessoal).toBeNull();
  });

  it("receita de terceiro grava classificacao 'terceiro' e valor_pessoal 0", async () => {
    const { fake, resultado } = rodar({
      ...BASE,
      type: "receita",
      status: "recebido",
      receita_classificacao: "terceiro",
    });
    expect((await resultado).ok).toBe(true);
    const linha = inseridaEmTransactions(fake);
    expect(linha.classificacao).toBe("terceiro");
    expect(linha.valor_pessoal).toBe(0);
  });

  it("receita compartilhada grava a minha parte informada, em reais", async () => {
    const { fake, resultado } = rodar({
      ...BASE,
      type: "receita",
      status: "recebido",
      receita_classificacao: "compartilhada",
      receita_minha_parte: "400,00",
    });
    expect((await resultado).ok).toBe(true);
    const linha = inseridaEmTransactions(fake);
    expect(linha.classificacao).toBe("compartilhada");
    expect(linha.valor_pessoal).toBe(400);
  });

  it("compartilhada sem parte é recusada no campo, e NADA é gravado", async () => {
    const { fake, resultado } = rodar({
      ...BASE,
      type: "receita",
      status: "recebido",
      receita_classificacao: "compartilhada",
    });
    const r = await resultado;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.receita_minha_parte).toEqual([MSG_PARTE_AUSENTE]);
    expect(fake.escritas()).toEqual([]);
  });

  it("compartilhada com a parte igual ao valor é recusada, e NADA é gravado", async () => {
    const { fake, resultado } = rodar({
      ...BASE,
      type: "receita",
      status: "recebido",
      receita_classificacao: "compartilhada",
      receita_minha_parte: 1000,
    });
    const r = await resultado;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.receita_minha_parte).toEqual([MSG_PARTE_TOTAL]);
    expect(fake.escritas()).toEqual([]);
  });

  /**
   * ⛔ O caso do F2 do desenho. Uma linha da importação dividida como DESPESA e depois virada
   * RECEITA na revisão chega com `classificacao` + `parts` — a troca de tipo não limpa a
   * divisão (`imports.ts`). Antes da 03-C, `criarTransacao` a ignorava fora de despesa; depois
   * dela, continua ignorando, porque a receita só lê as próprias chaves.
   */
  it("o payload da importação (classificacao de despesa numa receita) continua gravando pessoal", async () => {
    const { fake, resultado } = rodar({
      ...BASE,
      type: "receita",
      status: "recebido",
      classificacao: "compartilhada",
      parts: [{ person_id: PESSOA, tipo: "valor", valor: 600 }],
    });
    expect((await resultado).ok).toBe(true);
    const linha = inseridaEmTransactions(fake);
    expect(linha.classificacao).toBe("pessoal");
    expect(linha.valor_pessoal).toBeNull();
    expect(fake.escritas("shared_expenses")).toEqual([]);
    expect(fake.escritas("receivables")).toEqual([]);
  });
});

describe("03-C A2 · criarTransacao — a despesa grava como antes", () => {
  it("despesa compartilhada: insert compartilhado, divisão e recebível gravados, minha parte derivada", async () => {
    const { fake, resultado } = rodar({
      ...BASE,
      type: "despesa",
      status: "pago",
      classificacao: "compartilhada",
      parts: [{ person_id: PESSOA, tipo: "valor", valor: 600 }],
    });
    expect((await resultado).ok).toBe(true);
    const linha = inseridaEmTransactions(fake);
    expect(linha.classificacao).toBe("compartilhada");
    expect(fake.tabelas.shared_expenses).toHaveLength(1);
    expect(fake.tabelas.receivables).toHaveLength(1);
    expect(fake.tabelas.receivables[0].valor).toBe(600);
    expect(fake.tabelas.transactions[0].valor_pessoal).toBe(400);
  });

  it("despesa pessoal: o insert NÃO carrega a chave valor_pessoal (byte a byte como antes)", async () => {
    const { fake, resultado } = rodar({ ...BASE, type: "despesa", status: "pago" });
    expect((await resultado).ok).toBe(true);
    const linha = inseridaEmTransactions(fake);
    expect(linha.classificacao).toBe("pessoal");
    expect(Object.hasOwn(linha, "valor_pessoal")).toBe(false);
  });
});

describe("03-C2 A5 · criarTransacao NÃO lê a marcação da categoria (K2)", () => {
  const MARCADA = "c0ffee00-0000-4000-8000-000000000001";

  it("receita em categoria marcada, sem receita_classificacao, grava pessoal", async () => {
    const fake = criarSupabaseEmMemoria({
      categories: [{ id: MARCADA, user_id: "user-1", kind: "receita", classificacao_padrao: "terceiro" }],
    });
    const ctx = { supabase: fake.client, userId: "user-1" } as unknown as FinanceServiceContext;
    const r = await criarTransacao(ctx, {
      ...BASE,
      type: "receita",
      status: "recebido",
      category_id: MARCADA,
    });
    expect(r.ok).toBe(true);
    const linha = inseridaEmTransactions(fake);
    expect(linha.classificacao).toBe("pessoal");
    expect(linha.valor_pessoal).toBeNull();
  });
});
