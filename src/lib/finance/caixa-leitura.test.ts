/**
 * REDESIGN-03-E · T4a — `lerCaixaDoMes` e o filtro da janela, sobre um client em memória.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O harness IGNORA `or`. Por isso a prova de "a consulta pode trazer a mais, nunca       ║
 * ║ decide sozinha" é o REFILTRO em memória: uma linha com `liquidado_em` fora da janela   ║
 * ║ (e competência dentro) é devolvida pelo fake e tem de ser descartada pela leitura.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Fixture sintética.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria, type Linha } from "@/test/supabase-em-memoria";

let fake = criarSupabaseEmMemoria({});
/** Quando preenchido, substitui o client (simula a falha de leitura de uma tabela). */
let cliente: unknown = null;

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => cliente ?? fake.client,
}));

const { filtroDaJanelaDeCaixa, lerCaixaDoMes, TETO_DO_CAIXA } = await import(
  "@/lib/finance/caixa-leitura"
);

const CONTA = "3f1a7c60-9d2b-4a11-8f37-2c9a1b7e5d40";

function tx(id: string, sobre: Linha = {}): Linha {
  return {
    id,
    type: "despesa",
    status: "pago",
    amount: "10.50",
    valor_pessoal: null,
    competence_date: "2026-10-05",
    liquidado_em: "2026-10-05",
    account_id: CONTA,
    transfer_account_id: null,
    card_id: null,
    ...sobre,
  };
}

beforeEach(() => {
  cliente = null;
  fake = criarSupabaseEmMemoria({});
});

describe("filtroDaJanelaDeCaixa", () => {
  it("é exatamente o `or` do desenho", () => {
    expect(filtroDaJanelaDeCaixa({ de: "2026-09-01", ate: "2026-10-31" })).toBe(
      "and(liquidado_em.is.null,competence_date.gte.2026-09-01,competence_date.lte.2026-10-31)," +
        "and(liquidado_em.gte.2026-09-01,liquidado_em.lte.2026-10-31)",
    );
  });
});

describe("lerCaixaDoMes", () => {
  it("devolve só o que tem data de caixa na janela, e só os pagamentos de fatura com id", async () => {
    fake = criarSupabaseEmMemoria({
      transactions: [
        // Liquidada dentro da janela, competência fora → ENTRA.
        tx("dentro", { competence_date: "2026-07-20", liquidado_em: "2026-10-02" }),
        // Liquidada fora da janela, competência dentro → NÃO entra (o fake ignora o `or`).
        tx("fora", { competence_date: "2026-10-10", liquidado_em: "2026-11-02" }),
        // Pendente → fora pelo `in`.
        tx("pendente", { status: "pendente", liquidado_em: null }),
        // Sem data de liquidação: vale a competência (aproximada) → ENTRA.
        tx("aproximada", { liquidado_em: null, competence_date: "2026-09-15" }),
      ],
      card_statements: [
        { id: "f1", pago_transacao_id: "dentro" },
        { id: "f2", pago_transacao_id: null },
      ],
      receivables: [],
      receivable_receipts: [],
    });

    const r = await lerCaixaDoMes("2026-10");

    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.transactions.map((t) => t.id).sort()).toEqual(["aproximada", "dentro"]);
    expect(r.pagamentosDeFatura).toEqual(new Set(["dentro"]));
    expect(r.periodoLido).toEqual({ de: "2026-09-01", ate: "2026-10-31" });
    expect(r.parcial).toBe(false);
    expect(r.recebiveis).toEqual([]);
  });

  it("converte amount e valor_pessoal (texto do PostgREST) para número", async () => {
    fake = criarSupabaseEmMemoria({
      transactions: [tx("a", { amount: "47.90", valor_pessoal: "12.30" }), tx("b", { valor_pessoal: null })],
      card_statements: [],
      receivables: [],
      receivable_receipts: [],
    });
    const r = await lerCaixaDoMes("2026-10");
    if (!r.ok) throw new Error("esperava ok");
    const a = r.transactions.find((t) => t.id === "a");
    const b = r.transactions.find((t) => t.id === "b");
    expect(a?.amount).toBe(47.9);
    expect(a?.valor_pessoal).toBe(12.3);
    expect(b?.valor_pessoal).toBeNull();
  });

  it("o período lido de março vai de 01/02 a 31/03", async () => {
    const r = await lerCaixaDoMes("2026-03");
    if (!r.ok) throw new Error("esperava ok");
    expect(r.periodoLido).toEqual({ de: "2026-02-01", ate: "2026-03-31" });
  });

  it("janeiro olha dezembro do ano anterior", async () => {
    const r = await lerCaixaDoMes("2026-01");
    if (!r.ok) throw new Error("esperava ok");
    expect(r.periodoLido).toEqual({ de: "2025-12-01", ate: "2026-01-31" });
  });

  it("fevereiro termina no último dia dele", async () => {
    const r = await lerCaixaDoMes("2026-02");
    if (!r.ok) throw new Error("esperava ok");
    expect(r.periodoLido).toEqual({ de: "2026-01-01", ate: "2026-02-28" });
  });

  it("teto saturado: parcial verdadeiro e nunca mais que o teto", async () => {
    const linhas = Array.from({ length: TETO_DO_CAIXA + 1 }, (_, i) => tx(`t-${i}`));
    fake = criarSupabaseEmMemoria({
      transactions: linhas,
      card_statements: [],
      receivables: [],
      receivable_receipts: [],
    });
    const r = await lerCaixaDoMes("2026-10");
    if (!r.ok) throw new Error("esperava ok");
    expect(r.parcial).toBe(true);
    expect(r.transactions.length).toBeLessThanOrEqual(TETO_DO_CAIXA);
    expect(r.transactions).toHaveLength(TETO_DO_CAIXA);
  });

  it("exatamente o teto de linhas não é parcial", async () => {
    const linhas = Array.from({ length: TETO_DO_CAIXA }, (_, i) => tx(`t-${i}`));
    fake = criarSupabaseEmMemoria({
      transactions: linhas,
      card_statements: [],
      receivables: [],
      receivable_receipts: [],
    });
    const r = await lerCaixaDoMes("2026-10");
    if (!r.ok) throw new Error("esperava ok");
    expect(r.parcial).toBe(false);
    expect(r.transactions).toHaveLength(TETO_DO_CAIXA);
  });

  it("erro ao ler lançamentos devolve { ok: false }, nunca zero", async () => {
    const erro = { code: "XX000", message: "falha simulada" };
    // Objeto encadeável: qualquer método devolve ele mesmo; ao ser aguardado, resolve com erro.
    const encadeavel: Record<string, unknown> = {};
    const proxy = new Proxy(encadeavel, {
      get: (_alvo, prop) => {
        if (prop === "then") {
          return (resolve: (v: unknown) => unknown) => resolve({ data: null, error: erro });
        }
        return () => proxy;
      },
    });
    // As outras tabelas seguem no fake.
    cliente = {
      from: (tabela: string) =>
        tabela === "transactions"
          ? proxy
          : (fake.client as { from: (t: string) => unknown }).from(tabela),
    };

    expect(await lerCaixaDoMes("2026-10")).toEqual({ ok: false });
  });

  it("erro ao ler as faturas também devolve { ok: false }", async () => {
    const erro = { code: "XX000", message: "falha simulada" };
    const proxy: unknown = new Proxy(
      {},
      {
        get: (_alvo, prop) =>
          prop === "then"
            ? (resolve: (v: unknown) => unknown) => resolve({ data: null, error: erro })
            : () => proxy,
      },
    );
    cliente = {
      from: (tabela: string) =>
        tabela === "card_statements"
          ? proxy
          : (fake.client as { from: (t: string) => unknown }).from(tabela),
    };
    expect(await lerCaixaDoMes("2026-10")).toEqual({ ok: false });
  });
});
