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
import { TETO_DE_RECEBIMENTOS } from "@/lib/finance/recebimentos-leitura";
import {
  ESCOPO_CARD_FINANCEIRO,
  ESCOPO_FATURAS,
  ESCOPO_RELATORIO,
  completudeDe,
  janelaDoMes,
  montarEntradas,
  saldoDasContas,
  type CompletudeFinanceira,
  type EntradasDoEscopo,
  type EscopoFinanceiro,
  type LinhaTx,
} from "@/lib/finance/pipeline";

type Leitura = {
  tabela: string;
  origem: "sessao" | "dono";
  filtros: Array<[metodo: string, coluna: string, valor: unknown]>;
  selecao?: { colunas: string; opcoes?: { count?: "exact" } };
  limite?: number;
};

const estado = vi.hoisted(() => ({
  leituras: [] as Leitura[],
  clientsDaSessao: 0,
  dados: {} as Record<string, unknown[]>,
  contagens: {} as Record<string, number | null | undefined>,
}));

/** Builder encadeável que registra a tabela e os filtros, e resolve com os dados da tabela. */
function clientFalso(origem: Leitura["origem"]) {
  return {
    from(tabela: string) {
      const leitura: Leitura = { tabela, origem, filtros: [] };
      estado.leituras.push(leitura);
      const builder: Record<string, unknown> = {};
      builder.select = (colunas: string, opcoes?: { count?: "exact" }) => {
        leitura.selecao = { colunas, opcoes };
        return builder;
      };
      builder.order = () => builder;
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
        resolve: (v: { data: unknown[]; error: null; count: number | null }) => unknown,
        reject: (e: unknown) => unknown,
      ) => {
        const linhasAntesDoLimit = estado.dados[tabela] ?? [];
        return Promise.resolve({
          data: linhasAntesDoLimit.slice(0, leitura.limite),
          error: null,
          count: estado.contagens[tabela] !== undefined
            ? estado.contagens[tabela]
            : linhasAntesDoLimit.length,
        }).then(resolve, reject);
      };
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

const { getReceivables, getTransactionsRange, lerFinanceiro } = await import("@/lib/finance/queries");

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
        id: "rec-1",
        statement_id: "st-1",
        installment_id: null,
        transaction_id: null,
        valor: 50,
        status: "pendente",
        pago_em: null,
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
  estado.contagens = {};
});

describe("03-B2 — lerFinanceiro: owner nos três escopos (desenho, §5.4)", () => {
  it("owner + escopo de faturas lê as quatro tabelas pelo client do dono, todas com user_id", async () => {
    await lerFinanceiro({ escopo: ESCOPO_FATURAS, owner: DONO });
    expect(tabelasLidas()).toEqual(["card_statements_with_total", "credit_cards", "receivable_receipts", "receivables"]);
    expect(estado.clientsDaSessao).toBe(0);
    for (const leitura of estado.leituras) {
      expect(leitura.origem).toBe("dono");
      expect(leitura.filtros).toContainEqual(["eq", "user_id", DONO.userId]);
    }
  });

  it("owner + relatório lê as nove tabelas pelo dono, incluindo user_id nas parcelas", async () => {
    await lerFinanceiro({
      janela: JANELA,
      escopo: ESCOPO_RELATORIO,
      owner: DONO,
    });
    expect(tabelasLidas()).toEqual(
      [
        "accounts_with_balance", "bills", "card_statements_with_total", "credit_cards",
        "receivable_receipts", "receivables", "recurring_transactions", "transaction_installments", "transactions",
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

  it("owner + escopo do card lê as seis tabelas PELO CLIENT DO DONO, todas com user_id", async () => {
    await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO, owner: DONO });
    expect(tabelasLidas()).toEqual(
      ["accounts_with_balance", "bills", "card_statements_with_total", "receivable_receipts", "receivables", "transactions"].sort(),
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

  it("card do dashboard: seis leituras, nenhuma de cartões, recorrências ou parcelas", async () => {
    await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO });
    expect(tabelasLidas()).toEqual(
      ["accounts_with_balance", "bills", "card_statements_with_total", "receivable_receipts", "receivables", "transactions"].sort(),
    );
    expect(estado.leituras.every((l) => l.origem === "sessao")).toBe(true);
    expect(estado.leituras.flatMap((l) => l.filtros)).not.toContainEqual(["eq", "user_id", "user-1"]);
  });

  it("card de faturas: quatro leituras, sem janela (o escopo não pede transações)", async () => {
    await lerFinanceiro({ escopo: ESCOPO_FATURAS });
    expect(tabelasLidas()).toEqual(["card_statements_with_total", "credit_cards", "receivable_receipts", "receivables"]);
  });

  it("relatório: as nove, com as parcelas por ÚLTIMO e com os ids das faturas", async () => {
    await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_RELATORIO });
    expect(tabelasLidas()).toEqual(
      [
        "accounts_with_balance",
        "bills",
        "card_statements_with_total",
        "credit_cards",
        "receivable_receipts",
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
    expect(estado.leituras).toHaveLength(8);
    expect(r.entradas.inst).toEqual([]);
    expect(r.entradas).toHaveProperty("inst");
  });

  it("só lê recebimentos quando o escopo inclui recebíveis", async () => {
    // Os escopos públicos incluem recebíveis; simula a ausência só para testar a guarda.
    const semRecebiveis = { ...ESCOPO_FATURAS, recebiveis: false } as unknown as typeof ESCOPO_FATURAS;
    await lerFinanceiro({ escopo: semRecebiveis, owner: DONO });
    expect(tabelasLidas()).toEqual(["card_statements_with_total", "credit_cards"]);
    expect(tabelasLidas()).not.toContain("receivable_receipts");

    estado.leituras.length = 0;
    await lerFinanceiro({ escopo: ESCOPO_FATURAS, owner: DONO });
    expect(tabelasLidas()).toContain("receivable_receipts");
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
        // lerFinanceiro junta os recebimentos (nenhum na fixture) antes de montar.
        recebiveis: (dados.receivables as object[]).map((r) => ({ ...r, recebimentos: [] })) as never,
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
    expect(Object.keys(r).sort()).toEqual(["completude", "contas", "entradas", "recorrencias"]);
    expectTypeOf<keyof typeof r.entradas>().toEqualTypeOf<
      "bills" | "cards" | "inst" | "recs" | "recorrencias" | "sts" | "txs"
    >();
    expectTypeOf<keyof typeof r>().toEqualTypeOf<"completude" | "contas" | "entradas" | "recorrencias">();
  });

  it("card do dashboard: parcelas, cartões e recorrências ficam ausentes (R1)", async () => {
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO });
    expect(Object.keys(r.entradas).sort()).toEqual(["bills", "recs", "sts", "txs"]);
    expect(Object.keys(r).sort()).toEqual(["completude", "contas", "entradas"]);
    expectTypeOf<keyof typeof r.entradas>().toEqualTypeOf<"bills" | "recs" | "sts" | "txs">();
    expectTypeOf<keyof typeof r>().toEqualTypeOf<"completude" | "contas" | "entradas">();
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
    expect(Object.keys(r).sort()).toEqual(["completude", "entradas"]);
    expect(Object.keys(r.entradas).sort()).toEqual(["cards", "recs", "sts"]);
    expectTypeOf<keyof typeof r.entradas>().toEqualTypeOf<"cards" | "recs" | "sts">();
    expectTypeOf<keyof typeof r>().toEqualTypeOf<"completude" | "entradas">();
    expect(r.entradas.cards).toHaveLength(1);
    // @ts-expect-error — faturas não lê contas: ausência não pode virar saldo zero.
    const naoRoda = () => saldoDasContas(r.contas);
    expect(naoRoda).toBeTypeOf("function");
  });
});

describe("03-B2 A5 — tetos e completude (desenho, §5.5)", () => {
  it("card com dados normais é exato e pede count exact mantendo os limites", async () => {
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO });
    expect(r.completude).toEqual({ estado: "exato" });
    for (const [tabela, limite] of [["transactions", 2000], ["receivables", 1000]] as const) {
      const leitura = estado.leituras.find((l) => l.tabela === tabela);
      expect(leitura?.selecao?.opcoes).toEqual({ count: "exact" });
      expect(leitura?.limite).toBe(limite);
    }
  });

  it("2001 lançamentos: parcial (M8a), com exatamente os 2000 primeiros no motor (M8b)", async () => {
    const base = estado.dados.transactions[0] as LinhaTx;
    const transacoes = Array.from({ length: 2001 }, (_, i) => ({
      ...base,
      competence_date: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10),
    }));
    estado.dados.transactions = transacoes;
    const r = await lerFinanceiro({
      janela: { from: transacoes[0].competence_date, to: transacoes[2000].competence_date },
      escopo: ESCOPO_CARD_FINANCEIRO,
    });
    expect(r.entradas.txs).toHaveLength(2000);
    expect(r.entradas.txs).toEqual(montarEntradas({ transacoes: transacoes.slice(0, 2000) }).txs);
    expect(r.completude).toEqual({
      estado: "parcial",
      motivos: ["A leitura de lançamentos trouxe 2000 registros desta janela e havia mais: os totais podem estar incompletos."],
    });
  });

  it("1001 recebíveis: parcial, preservando as 1000 linhas que entram no motor", async () => {
    estado.dados.receivables = Array.from({ length: 1001 }, () => estado.dados.receivables[0]);
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO });
    expect(r.entradas.recs).toHaveLength(1000);
    expect(r.completude).toEqual({
      estado: "parcial",
      motivos: ["A leitura de recebíveis trouxe 1000 registros e havia mais: os totais podem estar incompletos."],
    });
  });

  it("o max_rows do PostgREST corta antes do limit: o motivo cita o que veio, não o teto", async () => {
    const base = estado.dados.transactions[0] as LinhaTx;
    const transacoes = Array.from({ length: 1000 }, (_, i) => ({
      ...base,
      competence_date: new Date(Date.UTC(2020, 0, i + 1)).toISOString().slice(0, 10),
    }));
    estado.dados.transactions = transacoes;
    estado.contagens.transactions = 1500;
    const r = await lerFinanceiro({
      janela: { from: transacoes[0].competence_date, to: transacoes[999].competence_date },
      escopo: ESCOPO_CARD_FINANCEIRO,
    });
    expect(r.entradas.txs).toHaveLength(1000);
    expect(r.completude).toEqual({
      estado: "parcial",
      motivos: ["A leitura de lançamentos trouxe 1000 registros desta janela e havia mais: os totais podem estar incompletos."],
    });
  });

  it.each([
    ["transactions", "lançamentos"],
    ["receivables", "recebíveis"],
    ["receivable_receipts", "recebimentos"],
  ])("contagem nula de %s declara que não foi possível confirmar", async (tabela, nome) => {
    estado.contagens[tabela] = null;
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO });
    expect(r.completude).toEqual({
      estado: "parcial",
      motivos: [`Não foi possível confirmar que a leitura de ${nome} veio completa.`],
    });
  });

  it("recebimentos saturados: o motivo cita o que veio, não o teto (o max_rows corta antes)", async () => {
    estado.dados.receivable_receipts = [
      { id: "rr-1", receivable_id: "rec-1", valor: 10, recebido_em: "2026-05-11", observacoes: null, created_at: "2026-05-11T12:00:00Z" },
      { id: "rr-2", receivable_id: "rec-1", valor: 5, recebido_em: "2026-05-12", observacoes: null, created_at: "2026-05-12T12:00:00Z" },
    ];
    estado.contagens.receivable_receipts = 3;
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO });
    expect(TETO_DE_RECEBIMENTOS).toBeGreaterThan(2);
    expect(r.completude).toEqual({
      estado: "parcial",
      motivos: ["A leitura de recebimentos trouxe 2 registros e havia mais: os saldos podem estar incompletos."],
    });
  });

  it("lançamento de tipo desconhecido fica fora da conta com motivo", async () => {
    estado.dados.transactions = [{ ...estado.dados.transactions[0] as LinhaTx, type: "desconhecido" }];
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO });
    expect(r.entradas.txs).toEqual([]);
    expect(r.completude).toEqual({
      estado: "parcial",
      motivos: ["1 lançamento(s) com tipo, status ou forma de pagamento fora do que o sistema conhece ficaram fora da conta."],
    });
  });

  it.each([undefined, null, 1001])("faturas só refletem recebíveis (contagem %s)", async (count) => {
    estado.contagens.transactions = null;
    estado.dados.transactions = [{ ...estado.dados.transactions[0] as LinhaTx, type: "desconhecido" }];
    estado.contagens.receivables = count;
    const r = await lerFinanceiro({ escopo: ESCOPO_FATURAS });
    expect(tabelasLidas()).not.toContain("transactions");
    if (count === undefined) {
      expect(r.completude).toEqual({ estado: "exato" });
    } else {
      expect(r.completude).toEqual({
        estado: "parcial",
        motivos: [expect.stringContaining("recebíveis")],
      });
    }
  });

  it.each([
    [undefined, "completa"],
    [null, "sem_contagem"],
    [2, "saturou"],
  ] as const)("getTransactionsRange distingue a contagem %s mesmo abaixo do teto", async (count, situacao) => {
    estado.contagens.transactions = count;
    const r = await getTransactionsRange(JANELA);
    expect(r).toEqual({ linhas: estado.dados.transactions, situacao });
  });

  it("atingir os limites com contagens iguais às linhas ainda é exato", async () => {
    estado.dados.transactions = Array.from({ length: 2000 }, () => estado.dados.transactions[0]);
    estado.dados.receivables = Array.from({ length: 1000 }, () => estado.dados.receivables[0]);
    const r = await lerFinanceiro({ janela: JANELA, escopo: ESCOPO_CARD_FINANCEIRO });
    expect(r.entradas.txs).toHaveLength(2000);
    expect(r.entradas.recs).toHaveLength(1000);
    expect(r.completude).toEqual({ estado: "exato" });
  });

  it("getReceivables continua devolvendo array com o mesmo limite e owner", async () => {
    estado.dados.receivables = Array.from({ length: 1001 }, () => estado.dados.receivables[0]);
    const r = await getReceivables(DONO);
    expect(r).toEqual(estado.dados.receivables.slice(0, 1000).map((linha) => ({
      ...(linha as object), recebimentos: [],
    })));
    expect(estado.leituras).toHaveLength(2);
    expect(tabelasLidas()).toEqual(["receivable_receipts", "receivables"]);
    for (const leitura of estado.leituras) {
      expect(leitura.origem).toBe("dono");
      expect(leitura.filtros).toContainEqual(["eq", "user_id", DONO.userId]);
      expect(leitura.selecao?.opcoes).toEqual({ count: "exact" });
    }
    expect(estado.leituras.find((l) => l.tabela === "receivables")?.limite).toBe(1000);
    expect(estado.clientsDaSessao).toBe(0);
  });

  it("completudeDe exige motivos para parcial e preserva todos eles", () => {
    expect(completudeDe([])).toEqual({ estado: "exato" });
    expect(completudeDe(["Contagem indisponível.", "Leitura incompleta."])).toEqual({
      estado: "parcial",
      motivos: ["Contagem indisponível.", "Leitura incompleta."],
    });
    // @ts-expect-error — parcial sem motivo não é representável.
    const semMotivo: CompletudeFinanceira = { estado: "parcial", motivos: [] };
    expect(semMotivo.estado).toBe("parcial");
  });
});

describe("03-B2 A1 — contratos de tipo (conferidos pelo tsc --noEmit)", () => {
  it("a janela é exigida só quando o escopo lê transações", () => {
    const naoRoda = () => {
      // @ts-expect-error — o card lê transações: exige janela.
      void lerFinanceiro({ escopo: ESCOPO_CARD_FINANCEIRO });
      // @ts-expect-error — faturas não lê transações: não aceita janela.
      void lerFinanceiro({ escopo: ESCOPO_FATURAS, janela: JANELA });
      const daUniao: EscopoFinanceiro = ESCOPO_FATURAS;
      // O genérico explícito mantém a união apesar do estreitamento da const.
      // @ts-expect-error — com escopo como união, a janela é exigida (pode ler transações).
      void lerFinanceiro<EscopoFinanceiro>({ escopo: daUniao });
      void lerFinanceiro<EscopoFinanceiro>({ escopo: daUniao, janela: JANELA });
    };
    expect(naoRoda).toBeTypeOf("function");
  });

  it("escopo que lê transações sem janela é recusado em runtime, sem tocar o banco", async () => {
    const daUniao: EscopoFinanceiro = ESCOPO_CARD_FINANCEIRO;
    // @ts-expect-error — a união exige janela; o throw é a defesa de runtime.
    await expect(lerFinanceiro<EscopoFinanceiro>({ escopo: daUniao })).rejects.toThrow("A leitura de transações exige uma janela financeira.");
    expect(estado.leituras).toEqual([]);
  });

  it("escopo como união só promete os campos comuns", () => {
    type DaUniao = EntradasDoEscopo<EscopoFinanceiro>;
    expectTypeOf<keyof DaUniao>().toEqualTypeOf<"recs" | "sts">();
    // @ts-expect-error — a união não garante leitura de parcelas: inst fica ausente.
    const inst: DaUniao["inst"] = [];
    expect(inst).toEqual([]);
  });
});
