/** REDESIGN-03-F · A1 — markStatementPaid pela RPC atômica. Fixture sintética. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MSG_DATA_PAGAMENTO_FATURA_FUTURA } from "@/lib/finance/caixa";
import { montarPagamentoFatura } from "@/lib/finance/statement-payment";
import { criarSupabaseEmMemoria } from "@/test/supabase-em-memoria";

let fake = criarSupabaseEmMemoria({});
let respostaRpc: { data: unknown; error: { code: string; message: string } | null } = {
  data: null,
  error: null,
};

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/format", async () => {
  const real = await vi.importActual<typeof import("@/lib/format")>("@/lib/format");
  return { ...real, hojeISO: () => "2031-01-15" };
});

const { markStatementPaid, markStatementUnpaid, preverDesfazerPagamento } = await import(
  "@/lib/actions/statements"
);

const ID = "8b2e4d10-1c3f-4e55-9a02-6d7b8c9e0f11";
const CONTA = "3c9a7e21-5b4d-4f68-8a13-2e1d0c9b8a77";
const CARTAO = "5d1f6a32-7c8e-4b90-9d24-4f3e2a1b0c66";

function montarFake(pagoEm: string | null = null) {
  fake = criarSupabaseEmMemoria(
    {
      card_statements_with_total: [
        {
          id: ID,
          card_id: CARTAO,
          competencia: "2031-01-01",
          pago_em: pagoEm,
          total_atual: 100,
        },
      ],
      accounts: [{ id: CONTA }],
      credit_cards: [{ id: CARTAO, nome: "Cartão Sintético" }],
    },
    { rpc: () => respostaRpc },
  );
}

beforeEach(() => {
  respostaRpc = { data: null, error: null };
  montarFake();
});

describe("03-F A1 · markStatementPaid pela RPC", () => {
  it("manda à RPC exatamente o lançamento de montarPagamentoFatura", async () => {
    const resultado = await markStatementPaid(ID, CONTA, "2031-01-10");
    expect(resultado.ok).toBe(true);
    expect(fake.operacoes).toHaveLength(1);
    const [op] = fake.operacoes;
    expect(op.tipo).toBe("rpc");
    expect(op.tabela).toBe("pagar_fatura");
    expect(op.valores).toEqual({
      p_statement_id: ID,
      p_pago_em: "2031-01-10T12:00:00Z",
      p_lancamento: montarPagamentoFatura({
        contaId: CONTA,
        total: 100,
        cartaoNome: "Cartão Sintético",
        competencia: "2031-01-01",
        dataPagamento: "2031-01-10",
      }),
    });
    const lancamento = (op.valores as { p_lancamento: { liquidado_em: string } }).p_lancamento;
    expect(lancamento.liquidado_em).toBe("2031-01-10");
  });

  it("não escreve direto em tabela nenhuma", async () => {
    await markStatementPaid(ID, CONTA, "2031-01-10");
    expect(fake.operacoes.filter((o) => o.tipo !== "rpc")).toEqual([]);
  });

  it("fatura já paga na leitura não chama a RPC", async () => {
    montarFake("2031-01-05T12:00:00Z");
    const resultado = await markStatementPaid(ID, CONTA, "2031-01-10");
    expect(resultado).toEqual({ ok: false, error: "Esta fatura já está paga." });
    expect(fake.operacoes).toEqual([]);
  });

  it("corrida: a RPC recusa FATURA_JA_PAGA", async () => {
    respostaRpc = { data: null, error: { code: "P0001", message: "FATURA_JA_PAGA" } };
    const resultado = await markStatementPaid(ID, CONTA, "2031-01-10");
    expect(resultado).toMatchObject({ ok: false, error: "Esta fatura já está paga." });
    expect(fake.operacoes.map((o) => o.tipo)).toEqual(["rpc"]);
  });

  it("erro desconhecido não afirma que não pagou", async () => {
    respostaRpc = { data: null, error: { code: "", message: "fetch failed" } };
    const resultado = await markStatementPaid(ID, CONTA, "2031-01-10");
    expect(resultado).toMatchObject({
      ok: false,
      error: expect.stringContaining("Recarregue a página"),
    });
  });

  it("o harness sem a opção rpc devolve erro — um teste que esquece de configurar não passa por acaso", async () => {
    const semRpc = criarSupabaseEmMemoria({});
    const client = semRpc.client as {
      rpc: (nome: string, args: Record<string, unknown>) => Promise<{ error: { code: string } | null }>;
    };
    const resposta = await client.rpc("pagar_fatura", { p_statement_id: ID });
    expect(resposta.error?.code).toBe("SEM_RPC");
    expect(semRpc.operacoes).toEqual([
      { tabela: "pagar_fatura", tipo: "rpc", valores: { p_statement_id: ID }, filtros: [] },
    ]);
  });

  it("sem dataPagamento usa hoje", async () => {
    const resultado = await markStatementPaid(ID, CONTA);
    expect(resultado.ok).toBe(true);
    expect(fake.operacoes[0].valores).toMatchObject({ p_pago_em: "2031-01-15T12:00:00Z" });
  });
});

describe("03-F A2 · desfazer preso ao lançamento lido", () => {
  const LANC = "7a1c2e3f-4b5d-4e6f-8a9b-0c1d2e3f4a5b";

  function montarPaga(
    fatura: { pago_em: string | null; pago_transacao_id: string | null },
    tipo = "transferencia",
  ) {
    fake = criarSupabaseEmMemoria(
      {
        card_statements: [{ id: ID, ...fatura }],
        transactions: [
          {
            id: LANC,
            type: tipo,
            status: "pago",
            amount: 100,
            description: "Pagamento fatura janeiro de 2031 — Cartão Sintético",
            transfer_account_id: null,
            transfer_group_id: null,
            // O harness devolve a linha inteira: o embed vem pronto na fixture.
            account: { name: "Conta Sintética" },
          },
        ],
      },
      { rpc: () => respostaRpc },
    );
  }

  it("a previsão diz qual lançamento sai, de qual conta, quanto e quando — sem escrever nada", async () => {
    montarPaga({ pago_em: "2031-01-10T12:00:00Z", pago_transacao_id: LANC });
    const res = await preverDesfazerPagamento(ID);
    expect(res).toEqual({
      ok: true,
      data: {
        estado: "com-lancamento",
        lancamentoId: LANC,
        descricao: "Pagamento fatura janeiro de 2031 — Cartão Sintético",
        conta: "Conta Sintética",
        valor: 100,
        dataPagamento: "2031-01-10",
      },
    });
    expect(fake.operacoes).toEqual([]);
  });

  it("fatura não paga", async () => {
    montarPaga({ pago_em: null, pago_transacao_id: null });
    const res = await preverDesfazerPagamento(ID);
    expect(res).toEqual({ ok: true, data: { estado: "nao-paga" } });
  });

  it("lançamento editado em Lançamentos", async () => {
    montarPaga({ pago_em: "2031-01-10T12:00:00Z", pago_transacao_id: LANC }, "despesa");
    const res = await preverDesfazerPagamento(ID);
    expect(res).toEqual({ ok: true, data: { estado: "pagamento-editado" } });
  });

  it("confirmar manda à RPC o lançamento lido — e nada é escrito direto", async () => {
    montarPaga({ pago_em: "2031-01-10T12:00:00Z", pago_transacao_id: LANC });
    const res = await markStatementUnpaid(ID, LANC);
    expect(res.ok).toBe(true);
    expect(fake.operacoes).toEqual([
      {
        tabela: "desfazer_pagamento_fatura",
        tipo: "rpc",
        valores: { p_statement_id: ID, p_lancamento_id: LANC },
        filtros: [],
      },
    ]);
  });

  it("fatura paga sem lançamento manda null", async () => {
    montarPaga({ pago_em: "2031-01-10T12:00:00Z", pago_transacao_id: null });
    await markStatementUnpaid(ID, null);
    expect(fake.operacoes[0].valores).toEqual({ p_statement_id: ID, p_lancamento_id: null });
  });

  it.each([
    ["FATURA_NAO_PAGA", "Esta fatura já não está paga."],
    ["PAGAMENTO_MUDOU", "O pagamento desta fatura mudou desde que você abriu a confirmação."],
    ["PAGAMENTO_EDITADO", "O lançamento deste pagamento foi editado em Lançamentos."],
    ["fetch failed", "Não foi possível confirmar o desfazer."],
  ])("a recusa %s vira a mensagem dela", async (codigo, inicio) => {
    montarPaga({ pago_em: "2031-01-10T12:00:00Z", pago_transacao_id: LANC });
    respostaRpc = { data: null, error: { code: "P0001", message: codigo } };
    const res = await markStatementUnpaid(ID, LANC);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error.startsWith(inicio)).toBe(true);
  });
});

describe("03-F B2 · data de pagamento futura", () => {
  it("data de amanhã é recusada com a mensagem própria no campo, sem ler nada nem chamar a RPC", async () => {
    const resultado = await markStatementPaid(ID, CONTA, "2031-01-16");
    expect(resultado.ok).toBe(false);
    expect(resultado).toMatchObject({
      fieldErrors: { dataPagamento: [MSG_DATA_PAGAMENTO_FATURA_FUTURA] },
    });
    expect(fake.operacoes).toEqual([]);
  });

  it("hoje é aceito e chega à RPC", async () => {
    const resultado = await markStatementPaid(ID, CONTA, "2031-01-15");
    expect(resultado.ok).toBe(true);
    expect(fake.operacoes.map((o) => o.tipo)).toEqual(["rpc"]);
    expect(fake.operacoes[0].valores).toMatchObject({ p_pago_em: "2031-01-15T12:00:00Z" });
  });

  it("data passada é aceita e chega à RPC", async () => {
    const resultado = await markStatementPaid(ID, CONTA, "2031-01-02");
    expect(resultado.ok).toBe(true);
    expect(fake.operacoes.map((o) => o.tipo)).toEqual(["rpc"]);
    expect(fake.operacoes[0].valores).toMatchObject({ p_pago_em: "2031-01-02T12:00:00Z" });
  });
});
