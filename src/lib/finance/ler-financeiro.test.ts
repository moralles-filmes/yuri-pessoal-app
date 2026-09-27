/**
 * REDESIGN-03-B — `lerFinanceiro`, a camada de I/O do pipeline financeiro.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO PROVA.                                                             ║
 * ║                                                                                       ║
 * ║  1. OWNER: os três escopos usam o client do dono e filtram user_id em cada leitura,    ║
 * ║     inclusive nas parcelas com ids de fatura já filtrados (invariante 84).             ║
 * ║     Sem owner, usam a sessão sem filtro explícito de user_id.                         ║
 * ║  2. NEM UMA LEITURA A MAIS: cada escopo lê exatamente as tabelas dele.                ║
 * ║  3. A FORMA DAS CHAMADAS: as parcelas vêm DEPOIS do `Promise.all`, com os ids das      ║
 * ║     faturas, e o `owner` chega a cada leitura que o aceita.                            ║
 * ║                                                                                       ║
 * ║ O client do Supabase é FALSO e só registra: nenhuma consulta sai daqui.               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Fixture sintética.
 */

import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type { LeituraDoDono } from "@/lib/supabase/owner";
import { gastosPorCategoria } from "@/lib/finance/dashboard";
import {
  ESCOPO_CARD_FINANCEIRO,
  ESCOPO_FATURAS,
  ESCOPO_RELATORIO,
  janelaDoMes,
  montarEntradas,
  saldoDasContas,
  type EntradasDoEscopo,
  type EscopoFinanceiro,
} from "@/lib/finance/pipeline";

type Leitura = {
  tabela: string;
  origem: "sessao" | "dono";
  filtros: Array<[metodo: string, coluna: string, valor: unknown]>;
};

const estado = vi.hoisted(() => ({
  leituras: [] as Leitura[],
  clientsDaSessao: 0,
  dados: {} as Record<string, unknown[]>,
}));

/** Builder encadeável que registra a tabela e os filtros, e resolve com os dados da tabela. */
function clientFalso(origem: Leitura["origem"]) {
  return {
    from(tabela: string) {
      const leitura: Leitura = { tabela, origem, filtros: [] };
      estado.leituras.push(leitura);
      const builder: Record<string, unknown> = {};
      for (const metodo of ["select", "order", "limit"]) builder[metodo] = () => builder;
      for (const metodo of ["eq", "gt", "gte", "lte", "in", "neq"]) {
        builder[metodo] = (coluna: string, valor: unknown) => {
          leitura.filtros.push([metodo, coluna, valor]);
          return builder;
        };
      }
      builder.then = (
        resolve: (v: { data: unknown[]; error: null }) => unknown,
        reject: (e: unknown) => unknown,
      ) => Promise.resolve({ data: estado.dados[tabela] ?? [], error: null }).then(resolve, reject);
      return builder;
    },
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    estado.clientsDaSessao += 1;
    return clientFalso("sessao");
  },
}));

const { lerFinanceiro } = await import("@/lib/finance/queries");

const JANELA = janelaDoMes("2026-05");
const DONO: LeituraDoDono = {
  client: clientFalso("dono") as unknown as LeituraDoDono["client"],
  userId: "user-1",
};

function dadosSinteticos(): Record<string, unknown[]> {
  return {
    accounts_with_balance: [{ id: "acc-1", name: "Conta 1", current_balance: 150.25 }],
    credit_cards: [
      {
        id: "card-1",
        nome: "Cartao 1",
        cor: null,
        limite_total: 5000,
        dia_fechamento: 5,
        dia_vencimento: 15,
      },
    ],
    card_statements_with_total: [
      {
        id: "st-1",
        card_id: "card-1",
        competencia: "2026-05-01",
        data_fechamento: "2026-05-05",
        data_vencimento: "2026-05-15",
        pago_em: null,
        total_atual: 480.5,
        itens: 2,
      },
    ],
    receivables: [
      {
        statement_id: "st-1",
        installment_id: null,
        valor: 50,
        status: "pendente",
        statement: { id: "st-1", competencia: "2026-05-01", data_vencimento: "2026-05-15" },
        transaction: null,
      },
    ],
    bills: [{ name: "Conta fixa 1", amount: 200, due_day: 10, is_active: true }],
    recurring_transactions: [
      {
        amount: 49.9,
        type: "despesa",
        frequency: "mensal",
        interval_count: 1,
        anchor_date: "2026-01-10",
        next_due_date: "2026-06-10",
        end_date: null,
        is_active: true,
        description: "Recorrencia 1",
        category: null,
      },
    ],
    transactions: [
      {
        amount: 123.45,
        valor_pessoal: null,
        type: "despesa",
        payment_method: "pix",
        status: "pago",
        competence_date: "2026-05-10",
        card_id: null,
        statement_id: null,
        parcelado: false,
        category_id: "cat-a",
        category: { id: "cat-a", name: "Categoria A", color: null, icon: null },
      },
    ],
    transaction_installments: [
      {
        id: "inst-1",
        statement_id: "st-1",
        valor: 100,
        status: "ativa",
        parent: { id: "tx-9", description: "Lancamento 9", classificacao: null, category: null },
      },
    ],
  };
}

const tabelasLidas = () => estado.leituras.map((l) => l.tabela).sort();

beforeEach(() => {
  estado.leituras.length = 0;
  estado.clientsDaSessao = 0;
  estado.dados = dadosSinteticos();
});

describe("03-B2 — lerFinanceiro: owner nos três escopos (desenho, §5.4)", () => {
  it("owner + escopo de faturas lê as três tabelas pelo client do dono, todas com user_id", async () => {
    await lerFinanceiro({ escopo: ESCOPO_FATURAS, owner: DONO });
    expect(tabelasLidas()).toEqual(["card_statements_with_total", "credit_cards", "receivables"]);
    expect(estado.clientsDaSessao).toBe(0);
    for (const leitura of estado.leituras) {
      expect(leitura.origem).toBe("dono");
      expect(leitura.filtros).toContainEqual(["eq", "user_id", DONO.userId]);
    }
  });

  it("owner + relatório lê as oito tabelas pelo dono, incluindo user_id nas parcelas", async () => {
    await lerFinanceiro({
      janela: JANELA,
      escopo: ESCOPO_RELATORIO,
      owner: DONO,
    });
    expect(tabelasLidas()).toEqual(
      [
        "accounts_with_balance", "bills", "card_statements_with_total", "credit_cards",
        "receivables", "recurring_transactions", "transaction_installments", "transactions",
      ].sort(),
    );
    expect(estado.clientsDaSessao).toBe(0);
    for (const leitura of estado.leituras) {
      expect(leitura.origem).toBe("dono");
      expect(leitura.filtros).toContainEqual(["eq", "user_id", DONO.userId]);
    }
    const ultima = estado.leituras[estado.leituras.length - 1];
    expect(ultima.tabela).toBe("transaction_installments");
    expect(ultima.filtros).toContainEqual(["in", "statement_id", ["st-1"]]);
    expect(ultima.filtros).toContainEqual(["neq", "status", "cancelada"]);
  });

  it("owner + escopo do card lê as cinco tabelas PELO CLIENT DO DONO, todas com user_id", async () => {
    await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO, owner: DONO });
    expect(tabelasLidas()).toEqual(
      ["accounts_with_balance", "bills", "card_statements_with_total", "receivables", "transactions"].sort(),
    );
    expect(estado.clientsDaSessao).toBe(0);
    for (const leitura of estado.leituras) {
      expect(leitura.origem).toBe("dono");
      expect(leitura.filtros).toContainEqual(["eq", "user_id", "user-1"]);
    }
    const transacoes = estado.leituras.find((l) => l.tabela === "transactions");
    expect(transacoes?.filtros).toContainEqual(["gte", "competence_date", "2026-05-01"]);
    expect(transacoes?.filtros).toContainEqual(["lte", "competence_date", "2026-05-31"]);
  });
});

describe("03-B — lerFinanceiro: cada escopo lê exatamente as suas tabelas", () => {
  it.each([ESCOPO_CARD_FINANCEIRO, ESCOPO_FATURAS, ESCOPO_RELATORIO])(
    "$nome sem owner usa a sessão e não filtra user_id explicitamente",
    async (escopo) => {
      await (escopo.transacoes
        ? lerFinanceiro({ janela: JANELA, escopo })
        : lerFinanceiro({ escopo }));
      expect(estado.clientsDaSessao).toBe(estado.leituras.length);
      for (const leitura of estado.leituras) {
        expect(leitura.origem).toBe("sessao");
        expect(leitura.filtros.some(([, coluna]) => coluna === "user_id")).toBe(false);
      }
    },
  );

  it("card do dashboard: cinco leituras, nenhuma de cartões, recorrências ou parcelas", async () => {
    await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO });
    expect(tabelasLidas()).toEqual(
      ["accounts_with_balance", "bills", "card_statements_with_total", "receivables", "transactions"].sort(),
    );
    expect(estado.leituras.every((l) => l.origem === "sessao")).toBe(true);
    expect(estado.leituras.flatMap((l) => l.filtros)).not.toContainEqual(["eq", "user_id", "user-1"]);
  });

  it("card de faturas: três leituras, sem janela (o escopo não pede transações)", async () => {
    await lerFinanceiro({ escopo: ESCOPO_FATURAS });
    expect(tabelasLidas()).toEqual(["card_statements_with_total", "credit_cards", "receivables"]);
  });

  it("relatório: as oito, com as parcelas por ÚLTIMO e com os ids das faturas", async () => {
    await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_RELATORIO });
    expect(tabelasLidas()).toEqual(
      [
        "accounts_with_balance",
        "bills",
        "card_statements_with_total",
        "credit_cards",
        "receivables",
        "recurring_transactions",
        "transaction_installments",
        "transactions",
      ].sort(),
    );
    const ultima = estado.leituras[estado.leituras.length - 1];
    expect(ultima.tabela).toBe("transaction_installments");
    expect(ultima.filtros).toContainEqual(["in", "statement_id", ["st-1"]]);
  });

  it("relatório sem nenhuma fatura: as parcelas nem chegam a ser lidas", async () => {
    estado.dados.card_statements_with_total = [];
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_RELATORIO });
    expect(tabelasLidas()).not.toContain("transaction_installments");
    expect(estado.leituras).toHaveLength(7);
    expect(r.entradas.inst).toEqual([]);
    expect(r.entradas).toHaveProperty("inst");
  });

  it("as faturas continuam filtradas por itens > 0 (getStatements, não uma leitura nova)", async () => {
    await lerFinanceiro({ escopo: ESCOPO_FATURAS });
    const faturas = estado.leituras.find((l) => l.tabela === "card_statements_with_total");
    expect(faturas?.filtros).toContainEqual(["gt", "itens", 0]);
  });
});

describe("03-B — lerFinanceiro: o que volta", () => {
  it("relatório: entradas montadas por montarEntradas, contas e recorrências CRUAS", async () => {
    const dados = dadosSinteticos();
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_RELATORIO });
    expect(r.entradas).toEqual(
      montarEntradas({
        transacoes: dados.transactions as never,
        faturas: dados.card_statements_with_total as never,
        recebiveis: dados.receivables as never,
        parcelas: dados.transaction_installments as never,
        cartoes: dados.credit_cards as never,
        recorrencias: dados.recurring_transactions as never,
        contasFixas: dados.bills as never,
      }),
    );
    expect(r.entradas.recs[0].ref_month).toBe("2026-05");
    expect(r.entradas.inst).toHaveLength(1);
    // Cruas: o relatório monta "assinaturas" com `description`, que não é entrada do motor.
    expect(r.recorrencias).toEqual(dados.recurring_transactions);
    expect(r.contas).toEqual(dados.accounts_with_balance);
    expect(Object.keys(r.entradas).sort()).toEqual([
      "bills", "cards", "inst", "recorrencias", "recs", "sts", "txs",
    ]);
    expect(Object.keys(r).sort()).toEqual(["contas", "entradas", "recorrencias"]);
    expectTypeOf<keyof typeof r.entradas>().toEqualTypeOf<
      "bills" | "cards" | "inst" | "recs" | "recorrencias" | "sts" | "txs"
    >();
    expectTypeOf<keyof typeof r>().toEqualTypeOf<"contas" | "entradas" | "recorrencias">();
  });

  it("card do dashboard: parcelas, cartões e recorrências ficam ausentes (R1)", async () => {
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO });
    expect(Object.keys(r.entradas).sort()).toEqual(["bills", "recs", "sts", "txs"]);
    expect(Object.keys(r).sort()).toEqual(["contas", "entradas"]);
    expectTypeOf<keyof typeof r.entradas>().toEqualTypeOf<"bills" | "recs" | "sts" | "txs">();
    expectTypeOf<keyof typeof r>().toEqualTypeOf<"contas" | "entradas">();
    expect(r.entradas.txs).toHaveLength(1);
    expect(r.contas).toHaveLength(1);
    const entradasDoCard = r.entradas;
    const naoRoda = () => gastosPorCategoria({
      mes: "2026-05",
      transactions: entradasDoCard.txs,
      statements: entradasDoCard.sts,
      receivables: entradasDoCard.recs,
      // @ts-expect-error — o card não lê parcelas: inst não existe (M1a).
      installmentItems: entradasDoCard.inst,
    });
    expect(naoRoda).toBeTypeOf("function");
  });

  it("card de faturas: contas não lidas ficam ausentes — não há saldo a somar", async () => {
    const r = await lerFinanceiro({ escopo: ESCOPO_FATURAS });
    expect(Object.keys(r).sort()).toEqual(["entradas"]);
    expect(Object.keys(r.entradas).sort()).toEqual(["cards", "recs", "sts"]);
    expectTypeOf<keyof typeof r.entradas>().toEqualTypeOf<"cards" | "recs" | "sts">();
    expectTypeOf<keyof typeof r>().toEqualTypeOf<"entradas">();
    expect(r.entradas.cards).toHaveLength(1);
    // @ts-expect-error — faturas não lê contas: ausência não pode virar saldo zero.
    const naoRoda = () => saldoDasContas(r.contas);
    expect(naoRoda).toBeTypeOf("function");
  });
});

describe("03-B2 A1 — contratos de tipo (conferidos pelo tsc --noEmit)", () => {
  it("a janela é exigida só quando o escopo lê transações", () => {
    const naoRoda = () => {
      // @ts-expect-error — o card lê transações: exige janela.
      void lerFinanceiro({ escopo: ESCOPO_CARD_FINANCEIRO });
      // @ts-expect-error — faturas não lê transações: não aceita janela.
      void lerFinanceiro({ escopo: ESCOPO_FATURAS, janela: JANELA });
    };
    expect(naoRoda).toBeTypeOf("function");
  });

  it("escopo como união só promete os campos comuns", () => {
    type DaUniao = EntradasDoEscopo<EscopoFinanceiro>;
    expectTypeOf<keyof DaUniao>().toEqualTypeOf<"recs" | "sts">();
    // @ts-expect-error — a união não garante leitura de parcelas: inst fica ausente.
    const inst: DaUniao["inst"] = [];
    expect(inst).toEqual([]);
  });
});
