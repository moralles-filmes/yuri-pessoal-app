/**
 * 04-A (Tarefa 3) — as leituras novas do painel financeiro.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO PROVA.                                                             ║
 * ║                                                                                       ║
 * ║  1. `ESCOPO_PAINEL` devolve os recebíveis CRUS, com a pessoa, da MESMA leitura de      ║
 * ║     `receivables` que alimenta o motor — nenhuma leitura a mais (D-A-14).             ║
 * ║  2. `getUltimasTransacoes` só olha o que já aconteceu e não conta transferência       ║
 * ║     (D-A-12): `lte` na competência, `neq` no tipo, ordem e `limit`.                    ║
 * ║  3. `lerSaldoAte` chama a MESMA rpc do extrato; erro ou ausência são `null`, e nunca  ║
 * ║     zero (K2).                                                                        ║
 * ║                                                                                       ║
 * ║ O client do Supabase é FALSO e só registra: nenhuma consulta sai daqui.               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Fixture sintética.
 */

import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import { ESCOPO_PAINEL, ESCOPO_RELATORIO, janelaDoMes } from "@/lib/finance/pipeline";
import type { ReceivableWithRelations } from "@/types/database";

type Leitura = {
  tabela: string;
  filtros: Array<[metodo: string, coluna: string, valor: unknown]>;
  selecao?: { colunas: string; opcoes?: { count?: "exact" } };
  ordem: Array<[coluna: string, opcoes: unknown]>;
  limite?: number;
};

type ChamadaDeRpc = { nome: string; args: unknown };

const estado = vi.hoisted(() => ({
  leituras: [] as Leitura[],
  rpcs: [] as ChamadaDeRpc[],
  dados: {} as Record<string, unknown[]>,
  erroDaTabela: {} as Record<string, { code: string; message: string } | undefined>,
  respostaDaRpc: { data: null, error: null } as {
    data: unknown;
    error: { code: string; message: string } | null;
  },
}));

function clientFalso() {
  return {
    from(tabela: string) {
      const leitura: Leitura = { tabela, filtros: [], ordem: [] };
      estado.leituras.push(leitura);
      const builder: Record<string, unknown> = {};
      builder.select = (colunas: string, opcoes?: { count?: "exact" }) => {
        leitura.selecao = { colunas, opcoes };
        return builder;
      };
      builder.order = (coluna: string, opcoes?: unknown) => {
        leitura.ordem.push([coluna, opcoes]);
        return builder;
      };
      builder.limit = (n: number) => {
        leitura.limite = n;
        return builder;
      };
      for (const metodo of ["eq", "gt", "gte", "lte", "in", "neq"]) {
        builder[metodo] = (coluna: string, valor: unknown) => {
          leitura.filtros.push([metodo, coluna, valor]);
          return builder;
        };
      }
      builder.then = (
        resolve: (v: { data: unknown[] | null; error: unknown; count: number | null }) => unknown,
        reject: (e: unknown) => unknown,
      ) => {
        const erro = estado.erroDaTabela[tabela];
        const linhas = estado.dados[tabela] ?? [];
        return Promise.resolve(
          erro
            ? { data: null, error: erro, count: null }
            : { data: linhas.slice(0, leitura.limite), error: null, count: linhas.length },
        ).then(resolve, reject);
      };
      return builder;
    },
    rpc(nome: string, args: unknown) {
      estado.rpcs.push({ nome, args });
      return Promise.resolve(estado.respostaDaRpc);
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => clientFalso(),
}));

const { lerFinanceiro, getUltimasTransacoes, lerSaldoAte } = await import("@/lib/finance/queries");

const JANELA = janelaDoMes("2026-11");

function dadosSinteticos(): Record<string, unknown[]> {
  return {
    accounts_with_balance: [{ id: "acc-1", name: "Conta 1", current_balance: 150.25 }],
    credit_cards: [
      { id: "card-1", nome: "Cartao 1", cor: null, limite_total: 5000, dia_fechamento: 5, dia_vencimento: 15 },
    ],
    card_statements_with_total: [
      {
        id: "st-1",
        card_id: "card-1",
        competencia: "2026-11-01",
        data_fechamento: "2026-11-05",
        data_vencimento: "2026-11-15",
        pago_em: null,
        total_atual: 480.5,
        itens: 2,
      },
    ],
    receivables: [
      {
        id: "rec-1",
        statement_id: "st-1",
        installment_id: null,
        transaction_id: null,
        valor: 50,
        status: "pendente",
        pago_em: null,
        person: { id: "pessoa-1", nome: "Pessoa A", email: null },
        statement: { id: "st-1", competencia: "2026-11-01", data_vencimento: "2026-11-15" },
        transaction: null,
      },
    ],
    bills: [{ name: "Conta fixa 1", amount: 200, due_day: 10, is_active: true }],
    recurring_transactions: [],
    transactions: [],
    transaction_installments: [],
  };
}

beforeEach(() => {
  estado.leituras.length = 0;
  estado.rpcs.length = 0;
  estado.dados = dadosSinteticos();
  estado.erroDaTabela = {};
  estado.respostaDaRpc = { data: null, error: null };
});

describe("04-A T3 — lerFinanceiro com ESCOPO_PAINEL", () => {
  it("devolve os recebíveis crus com a pessoa, na mesma forma do relatório + uma chave", async () => {
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_PAINEL });
    expect(Object.keys(r).sort()).toEqual([
      "completude",
      "contas",
      "entradas",
      "recebiveis",
      "recorrencias",
    ]);
    expect(r.recebiveis).toHaveLength(1);
    expect(r.recebiveis[0].person).toEqual({ id: "pessoa-1", nome: "Pessoa A", email: null });
    expectTypeOf(r.recebiveis).toEqualTypeOf<ReceivableWithRelations[]>();
  });

  it("nenhuma leitura a mais: `receivables` é lida UMA vez e as tabelas são as do relatório", async () => {
    await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_PAINEL });
    expect(estado.leituras.filter((l) => l.tabela === "receivables")).toHaveLength(1);
    const doPainel = estado.leituras.map((l) => l.tabela).sort();

    estado.leituras.length = 0;
    await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_RELATORIO });
    expect(doPainel).toEqual(estado.leituras.map((l) => l.tabela).sort());
  });

  it("os recebíveis crus são os MESMOS que alimentam o motor (mesmos ids, mesma leitura)", async () => {
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_PAINEL });
    expect(r.recebiveis.map((x) => x.id)).toEqual(["rec-1"]);
    expect(r.entradas.recs).toHaveLength(1);
  });

  it("o relatório continua sem a chave `recebiveis`", async () => {
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_RELATORIO });
    expect(Object.keys(r).sort()).toEqual(["completude", "contas", "entradas", "recorrencias"]);
    // @ts-expect-error — só o escopo do painel promete recebíveis crus.
    const naoRoda = () => r.recebiveis;
    expect(naoRoda).toBeTypeOf("function");
  });
});

describe("04-A T3 — getUltimasTransacoes (D-A-12)", () => {
  it("só o que já aconteceu, sem transferência, do mais novo ao mais antigo, até 5", async () => {
    await getUltimasTransacoes("2026-11-18");
    const leitura = estado.leituras.find((l) => l.tabela === "transactions");
    expect(leitura?.filtros).toContainEqual(["lte", "competence_date", "2026-11-18"]);
    expect(leitura?.filtros).toContainEqual(["neq", "type", "transferencia"]);
    expect(leitura?.ordem).toEqual([
      ["competence_date", { ascending: false }],
      ["created_at", { ascending: false }],
    ]);
    expect(leitura?.limite).toBe(5);
    expect(leitura?.selecao?.colunas).toContain("shared:shared_expenses");
    expect(estado.leituras).toHaveLength(1);
  });

  it("aceita outro tamanho", async () => {
    await getUltimasTransacoes("2026-11-18", 8);
    expect(estado.leituras[0].limite).toBe(8);
  });

  it("corte pelo limite NÃO é erro: há mais lançamentos do que n por definição", async () => {
    estado.dados.transactions = Array.from({ length: 9 }, (_, i) => ({ id: `tx-${i}` }));
    const linhas = await getUltimasTransacoes("2026-11-18");
    expect(linhas).toHaveLength(5);
  });

  it("erro de leitura LANÇA (03-G), não vira lista vazia", async () => {
    estado.erroDaTabela.transactions = { code: "XX000", message: "falhou" };
    await expect(getUltimasTransacoes("2026-11-18")).rejects.toThrow("Não foi possível ler os lançamentos.");
  });
});

describe("04-A T3 — lerSaldoAte (K2)", () => {
  it("chama a rpc do extrato com todas as contas somadas e devolve Number(data)", async () => {
    estado.respostaDaRpc = { data: "1234.56", error: null };
    const saldo = await lerSaldoAte("2026-11-19");
    expect(estado.rpcs).toEqual([
      { nome: "account_balance_before", args: { p_account_id: null, p_date: "2026-11-19" } },
    ]);
    expect(saldo).toBe(1234.56);
  });

  it("saldo zero lido é zero, não ausência", async () => {
    estado.respostaDaRpc = { data: 0, error: null };
    expect(await lerSaldoAte("2026-11-19")).toBe(0);
  });

  it("erro da rpc devolve null, nunca zero", async () => {
    estado.respostaDaRpc = { data: 100, error: { code: "XX000", message: "falhou" } };
    expect(await lerSaldoAte("2026-11-19")).toBeNull();
  });

  it("data nula devolve null, nunca zero", async () => {
    estado.respostaDaRpc = { data: null, error: null };
    expect(await lerSaldoAte("2026-11-19")).toBeNull();
  });
});
