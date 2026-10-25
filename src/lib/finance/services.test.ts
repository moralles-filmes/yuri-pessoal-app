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
 * 03-G2 (D-G2-12): a escrita é UMA chamada `rpc("salvar_lancamento")`; os testes leem os
 * argumentos dela (`p_lancamento`, `p_divisao`), não mais inserts diretos. Fixture sintética.
 */
import { describe, expect, it, vi } from "vitest";
import { criarTransacao, excluirTransacaoSimples, type FinanceServiceContext } from "@/lib/finance/services";
import { MSG_PARTE_AUSENTE, MSG_PARTE_TOTAL } from "@/lib/finance/responsabilidade-da-receita";
import { MSG_DATA_PAGAMENTO_FUTURA } from "@/lib/finance/caixa";
import { criarSupabaseEmMemoria, type Linha } from "@/test/supabase-em-memoria";
import { checkLiquidadoEmCoerente } from "@/test/check-liquidado-em";

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

const ID_NOVO = "7c1d5e90-4b2a-4f36-8d10-5a9e3b7c2f84";
const RPC_OK = { rpc: () => ({ data: ID_NOVO, error: null }) };

function rodar(payload: Linha) {
  const fake = criarSupabaseEmMemoria({}, RPC_OK);
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

/** Os argumentos da única chamada `salvar_lancamento` (e só pode haver uma). */
function chamadaDaRpc(fake: ReturnType<typeof criarSupabaseEmMemoria>): Linha {
  const chamadas = fake.escritas("salvar_lancamento");
  expect(chamadas).toHaveLength(1);
  expect(chamadas[0].tipo).toBe("rpc");
  return chamadas[0].valores as Linha;
}

/** A linha (`p_lancamento`) que a rpc recebeu. */
function inseridaEmTransactions(fake: ReturnType<typeof criarSupabaseEmMemoria>): Linha {
  return chamadaDaRpc(fake).p_lancamento as Linha;
}

// 03-G2 (D-G2-12): afirmava o insert direto; a escrita passou a ser a rpc salvar_lancamento
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
    expect(chamadaDaRpc(fake).p_divisao).toBeNull();
  });
});

// 03-G2 (D-G2-12): afirmava o insert direto; a escrita passou a ser a rpc salvar_lancamento
describe("03-C A2 · criarTransacao — a despesa grava como antes", () => {
  it("despesa compartilhada: linha compartilhada, divisão e recebível no payload, minha parte derivada", async () => {
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
    const divisao = chamadaDaRpc(fake).p_divisao as {
      pessoas: Linha[];
      recebiveis: Linha[];
    };
    expect(divisao.pessoas).toHaveLength(1);
    expect(divisao.recebiveis).toHaveLength(1);
    expect(divisao.recebiveis[0].valor).toBe(600);
    expect(linha.valor_pessoal).toBe(400);
  });

  it("despesa pessoal: p_lancamento NÃO carrega a chave valor_pessoal (byte a byte como antes)", async () => {
    const { fake, resultado } = rodar({ ...BASE, type: "despesa", status: "pago" });
    expect((await resultado).ok).toBe(true);
    const linha = inseridaEmTransactions(fake);
    // 03-G2: sem `colunas`, a classificação nem viaja — o SQL faz o coalesce 'pessoal'.
    expect(Object.hasOwn(linha, "classificacao")).toBe(false);
    expect(Object.hasOwn(linha, "valor_pessoal")).toBe(false);
  });
});

// 03-G2 (D-G2-12): afirmava o insert direto; a escrita passou a ser a rpc salvar_lancamento
describe("03-E A3 · criarTransacao grava liquidado_em pela regra (K0)", () => {
  const CARTAO = "5d9c2e44-7a10-4b6f-8e21-0f3a9b6c1d72";

  /** Como `rodar`, mas com o CHECK da M2 simulado (e fixture opcional). */
  function rodarComCheck(payload: Linha, tabelas: Record<string, Linha[]> = {}) {
    const fake = criarSupabaseEmMemoria(tabelas, { antesDeGravar: checkLiquidadoEmCoerente, ...RPC_OK });
    const ctx = { supabase: fake.client, userId: "user-1" } as unknown as FinanceServiceContext;
    return { fake, resultado: criarTransacao(ctx, payload) };
  }

  it("despesa paga com conta e SEM data informada grava liquidado_em nulo (Z12)", async () => {
    const { fake, resultado } = rodarComCheck({ ...BASE, type: "despesa", status: "pago" });
    expect((await resultado).ok).toBe(true);
    expect(inseridaEmTransactions(fake).liquidado_em).toBeNull();
  });

  it("despesa paga com a data informada grava essa data", async () => {
    const { fake, resultado } = rodarComCheck({
      ...BASE,
      type: "despesa",
      status: "pago",
      liquidado_em: "2026-06-12",
    });
    expect((await resultado).ok).toBe(true);
    expect(inseridaEmTransactions(fake).liquidado_em).toBe("2026-06-12");
  });

  it("despesa pendente com data informada grava nulo, e o CHECK não recusa a escrita", async () => {
    const { fake, resultado } = rodarComCheck({
      ...BASE,
      type: "despesa",
      status: "pendente",
      liquidado_em: "2026-06-12",
    });
    expect((await resultado).ok).toBe(true);
    expect(inseridaEmTransactions(fake).liquidado_em).toBeNull();
  });

  it("compra no cartão com data informada grava nulo (Z19: o cartão nunca guarda a data)", async () => {
    const { fake, resultado } = rodarComCheck(
      {
        type: "despesa",
        payment_method: "cartao_credito",
        card_id: CARTAO,
        account_id: "",
        amount: 150,
        purchase_date: "2026-06-10",
        competence_date: "2026-06-10",
        description: "compra",
        status: "pago",
        liquidado_em: "2026-06-12",
      },
      { credit_cards: [{ id: CARTAO, user_id: "user-1", dia_fechamento: 5, dia_vencimento: 12 }] },
    );
    const r = await resultado;
    expect(r.ok).toBe(true);
    const linha = inseridaEmTransactions(fake);
    expect(linha.card_id).toBe(CARTAO);
    expect(linha.statement_id).not.toBeNull();
    expect(linha.liquidado_em).toBeNull();
  });

  it("data futura é recusada no campo, com a mensagem do P8, e NADA é gravado", async () => {
    const { fake, resultado } = rodarComCheck({
      ...BASE,
      type: "despesa",
      status: "pago",
      liquidado_em: "2999-01-01",
    });
    const r = await resultado;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.liquidado_em).toEqual([MSG_DATA_PAGAMENTO_FUTURA]);
    expect(fake.escritas()).toEqual([]);
  });

  it("transferência paga com data informada grava essa data", async () => {
    const { fake, resultado } = rodarComCheck({
      type: "transferencia",
      payment_method: "transferencia",
      account_id: CONTA,
      transfer_account_id: "9a4b6c20-3e1d-4f87-b5a2-1c8d7e6f0a93",
      amount: 300,
      purchase_date: "2026-06-10",
      competence_date: "2026-06-10",
      description: "mover",
      status: "pago",
      liquidado_em: "2026-06-12",
    });
    expect((await resultado).ok).toBe(true);
    expect(inseridaEmTransactions(fake).liquidado_em).toBe("2026-06-12");
  });

  it("receita recebida com data ANTERIOR à da compra é aceita (pagamento antecipado, P8)", async () => {
    const { fake, resultado } = rodarComCheck({
      ...BASE,
      type: "receita",
      status: "recebido",
      liquidado_em: "2026-06-01",
    });
    expect((await resultado).ok).toBe(true);
    expect(inseridaEmTransactions(fake).liquidado_em).toBe("2026-06-01");
  });
});

// 03-G2 (D-G2-12): afirmava o insert direto; a escrita passou a ser a rpc salvar_lancamento
describe("03-C2 A5 · criarTransacao NÃO lê a marcação da categoria (K2)", () => {
  const MARCADA = "c0ffee00-0000-4000-8000-000000000001";

  it("receita em categoria marcada, sem receita_classificacao, grava pessoal", async () => {
    const fake = criarSupabaseEmMemoria({
      categories: [{ id: MARCADA, user_id: "user-1", kind: "receita", classificacao_padrao: "terceiro" }],
    }, RPC_OK);
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

describe("03-G2 E3a · criarTransacao grava numa chamada só (rpc salvar_lancamento)", () => {
  const DESTINO = "9a4b6c20-3e1d-4f87-b5a2-1c8d7e6f0a93";
  const DIVIDIDA = {
    ...BASE,
    type: "despesa",
    status: "pago",
    classificacao: "compartilhada",
    parts: [{ person_id: PESSOA, tipo: "valor", valor: 600 }],
  };

  function rodarComRpc(payload: Linha, rpc: NonNullable<Parameters<typeof criarSupabaseEmMemoria>[1]>["rpc"]) {
    const fake = criarSupabaseEmMemoria({}, { rpc });
    const ctx = { supabase: fake.client, userId: "user-1" } as unknown as FinanceServiceContext;
    return { fake, resultado: criarTransacao(ctx, payload) };
  }

  it("criar despesa dividida: UMA chamada rpc salvar_lancamento e nenhum insert/update/delete direto", async () => {
    const { fake, resultado } = rodar(DIVIDIDA);
    const r = await resultado;
    expect(r).toEqual({ ok: true, id: ID_NOVO, statementId: null });
    const escritas = fake.escritas();
    expect(escritas).toHaveLength(1);
    expect(escritas[0].tipo).toBe("rpc");
    expect(escritas[0].tabela).toBe("salvar_lancamento");
    // criar = não mandar `p_id`.
    expect(Object.hasOwn(escritas[0].valores as Linha, "p_id")).toBe(false);
  });

  it("criar: rpc com erro com code P0001 => mensagem termina em Nada foi alterado. e nenhuma outra escrita", async () => {
    const { fake, resultado } = rodarComRpc(DIVIDIDA, () => ({
      data: null,
      error: { code: "P0001", message: "qualquer coisa do banco" },
    }));
    const r = await resultado;
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro.endsWith("Nada foi alterado.")).toBe(true);
      expect(r.erro).not.toContain("qualquer coisa do banco");
    }
    expect(fake.escritas()).toHaveLength(1);
    expect(fake.escritas()[0].tipo).toBe("rpc");
  });

  it("criar: rpc sem code (fetch failed) => mensagem com pode ter sido salvo", async () => {
    const { resultado } = rodarComRpc(DIVIDIDA, () => ({
      data: null,
      error: { code: "", message: "fetch failed" },
    }));
    const r = await resultado;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.erro).toContain("pode ter sido salvo");
  });

  it("transferencia: p_lancamento com payment_method transferencia, category_id/card_id/statement_id nulos e transfer_group_id preenchido", async () => {
    const { fake, resultado } = rodar({
      type: "transferencia",
      payment_method: "transferencia",
      account_id: CONTA,
      transfer_account_id: DESTINO,
      amount: 300,
      purchase_date: "2026-06-10",
      competence_date: "2026-06-10",
      description: "mover",
      status: "pago",
    });
    expect((await resultado).ok).toBe(true);
    const args = chamadaDaRpc(fake);
    const linha = args.p_lancamento as Linha;
    expect(linha.payment_method).toBe("transferencia");
    expect(linha.transfer_account_id).toBe(DESTINO);
    expect(linha.category_id).toBeNull();
    expect(linha.card_id).toBeNull();
    expect(linha.statement_id).toBeNull();
    expect(typeof linha.transfer_group_id).toBe("string");
    expect(linha.transfer_group_id).toBeTruthy();
    expect(args.p_divisao).toBeNull();
  });

  it("despesa pessoal: p_lancamento NAO tem as chaves classificacao nem valor_pessoal", async () => {
    const { fake, resultado } = rodar({ ...BASE, type: "despesa", status: "pago" });
    expect((await resultado).ok).toBe(true);
    const args = chamadaDaRpc(fake);
    const linha = args.p_lancamento as Linha;
    expect(Object.hasOwn(linha, "classificacao")).toBe(false);
    expect(Object.hasOwn(linha, "valor_pessoal")).toBe(false);
    expect(args.p_divisao).toBeNull();
  });

  it("divisao que nao fecha: nenhuma escrita", async () => {
    // 1200 de terceiros num lançamento de 1000: a conta não fecha.
    const { fake, resultado } = rodar({
      ...DIVIDIDA,
      parts: [{ person_id: PESSOA, tipo: "valor", valor: 1200 }],
    });
    const r = await resultado;
    expect(r.ok).toBe(false);
    expect(fake.escritas()).toEqual([]);
  });
});
