import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { reaisParaCentavos } from "@/lib/format";
import {
  evolucaoMensal,
  gastosPorCategoria,
  proximas6Faturas,
  resumoMes,
  totalAReceber,
  type DashCard,
  type DashInstallmentItem,
  type DashReceivable,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";

/**
 * REDESIGN-03-A — TESTES DE CARACTERIZAÇÃO DO NÚCLEO FINANCEIRO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE ARQUIVO NÃO JULGA. ELE REGISTRA.                                              ║
 * ║                                                                                       ║
 * ║ Um teste de caracterização fixa o comportamento ATUAL, inclusive o que parece          ║
 * ║ defeito, para que a mudança de amanhã seja VISÍVEL e INTENCIONAL em vez de silenciosa. ║
 * ║ Onde uma expectativa abaixo parece errada, ela vem marcada com ⚠️ e o motivo — e o     ║
 * ║ lugar de consertar é a subfase que o `PLANO.md` nomeia, nunca aqui. Afrouxar ou        ║
 * ║ "corrigir" uma linha deste arquivo destrói exatamente a linha de base que a REDESIGN-03 ║
 * ║ inteira usa para provar que não mudou número nenhum sem querer.                        ║
 * ║                                                                                       ║
 * ║ ⛔ E ELE NASCE VERDE. Verde, aqui, não prova nada — ele descreve o que já acontece.    ║
 * ║ O que prova é a MUTAÇÃO: a tabela de mutações está no corpo do commit da 03-A.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ NÃO DUPLICA `dashboard.test.ts`. Aquele arquivo (24 casos) afirma que o motor está
 * CERTO: reconciliação, `meu + terceiros === saídas`, parcela na fatura, estorno fora das
 * entradas. Este afirma o que ninguém tinha afirmado — e o que ninguém afirmou é
 * exatamente o que as próximas subfases vão mexer. Nada dali foi alterado ou afrouxado.
 *
 * O QUE CADA BLOCO CONGELA, E PARA QUEM:
 *
 *   1–4  contrato AS-IS objeto a objeto das quatro funções (`toEqual` cheio, não `toMatchObject`)
 *   5    §9 · o cenário sintético obrigatório do briefing — o que HOJE já responde certo,
 *        e a prova numérica de que três das oito exigências são irrepresentáveis no schema
 *   6    03-C · receita NÃO é partida entre "minha" e "de terceiros"
 *   7    03-C2 / D8 · NENHUMA das quatro funções consulta categoria para decidir de quem
 *        é o dinheiro
 *   8    03-D · quais status de recebível cada função conta — um a um, explicitamente
 *   9    03-E · a base é UMA só (competência), e qual data cada função usa
 *   10   03-B · a linha de base do pipeline triplicado, antes de ele virar um
 *
 * ⚠️ `transactions.amount` é `numeric(14,2)` EM REAIS (invariante 63 do `CLAUDE.md`), não
 * inteiro em centavos. Os valores abaixo são reais: `47.90`, nunca `4790`.
 *
 * ⚠️ Fixture 100% SINTÉTICA. O repositório é público: nenhum valor, nome de categoria,
 * nome de pessoa ou saldo real do dono entra aqui. Data pura (`'yyyy-MM-dd'`) é tratada
 * como TEXTO e `hoje` é sempre injetado — a suíte passa em qualquer fuso
 * (`TZ=UTC npx vitest run src/lib/finance/dashboard-caracterizacao.test.ts`).
 */

/** Lido do DISCO: contrato que o `tsc` não pega, idioma do projeto (D20, `boundaries.test.ts`). */
const FONTE_DASHBOARD = fs.readFileSync(
  path.join(process.cwd(), "src", "lib", "finance", "dashboard.ts"),
  "utf8",
);

const tx = (overrides: Partial<DashTx> = {}): DashTx => ({
  amount: 0,
  valor_pessoal: null,
  type: "despesa",
  payment_method: "pix",
  status: "pago",
  competence_date: "2026-06-15",
  card_id: null,
  statement_id: null,
  parcelado: false,
  category_id: null,
  category: null,
  ...overrides,
});

const statement = (overrides: Partial<DashStatement> = {}): DashStatement => ({
  id: "st-default",
  card_id: "card-1",
  competencia: "2026-06-01",
  data_fechamento: "2026-06-10",
  data_vencimento: "2026-06-20",
  pago_em: null,
  total_atual: 0,
  ...overrides,
});

const receivable = (overrides: Partial<DashReceivable> = {}): DashReceivable => ({
  statement_id: null,
  installment_id: null,
  valor: 0,
  status: "pendente",
  ...overrides,
});

const installment = (
  overrides: Partial<DashInstallmentItem> = {},
): DashInstallmentItem => ({
  id: "inst-default",
  statement_id: "st-default",
  valor: 0,
  status: "ativa",
  parent: null,
  ...overrides,
});

const card = (overrides: Partial<DashCard> = {}): DashCard => ({
  id: "card-1",
  nome: "Cartao 1",
  cor: "#111111",
  limite_total: 1_000,
  dia_fechamento: 10,
  dia_vencimento: 20,
  ...overrides,
});

describe("1 · resumoMes — contrato AS-IS", () => {
  it("congela o objeto completo e as duas bases usadas no mesmo resumo", () => {
    const transactions: DashTx[] = [
      tx({ amount: 500.11, type: "receita", status: "recebido" }),
      // Pendente entra na competencia como se ja fosse uma entrada.
      tx({ amount: 49.89, type: "receita", status: "pendente" }),
      tx({ amount: 999, type: "receita", status: "cancelado" }),
      // Estorno vinculado a cartao nao entra nas entradas.
      tx({
        amount: 80,
        type: "receita",
        status: "recebido",
        card_id: "card-1",
        statement_id: "st-jun",
      }),
      tx({ amount: 100.1, valor_pessoal: 60.05, status: "pendente" }),
      tx({ amount: 20.2 }),
      tx({ amount: 777, status: "cancelado" }),
      tx({ amount: 888, type: "transferencia" }),
      tx({ amount: 666, type: "ajuste" }),
      // Compra-pai parcelada nao entra, mesmo sem cartao nesta fixture sintetica.
      tx({ amount: 555, parcelado: true }),
      // Compra de cartao nao e somada diretamente; o total vem da fatura.
      tx({ amount: 444, card_id: "card-1", statement_id: "st-jun" }),
      tx({ amount: 333, competence_date: "2026-05-31" }),
    ];
    const statements: DashStatement[] = [
      statement({ id: "st-jun", total_atual: 300.3 }),
      statement({ id: "st-null", total_atual: null }),
      // Sem card_id, nao compoe o resumo mesmo estando na competencia.
      statement({ id: "st-sem-cartao", card_id: null, total_atual: 900 }),
      statement({ id: "st-jul", competencia: "2026-07-01", total_atual: 800 }),
    ];
    const receivables: DashReceivable[] = [
      receivable({ statement_id: "st-jun", valor: 50.1, status: "pago" }),
      receivable({ statement_id: "st-jun", valor: 20.2, status: "ignorado" }),
      receivable({ statement_id: "st-jun", valor: 29.7, status: "pendente" }),
      receivable({ statement_id: "st-jul", valor: 700, status: "pendente" }),
      receivable({ statement_id: null, valor: 600, status: "pendente" }),
    ];

    expect(
      resumoMes({ mes: "2026-06", transactions, statements, receivables }),
    ).toEqual({
      entradas: 550,
      entradasMeu: 550,
      entradasTerceiros: 0,
      saidas: 420.6,
      meu: 280.55,
      terceiros: 140.05,
      cartao: 300.3,
      cartaoMeu: 200.3,
      aVista: 120.3,
      aVistaMeu: 80.25,
    });
  });

  it("soma responsabilidade original de terceiros sem filtrar status ou ref_month", () => {
    const statements = [statement({ id: "st", total_atual: 100 })];
    const receivables = [
      receivable({ statement_id: "st", valor: 10, status: "pendente", ref_month: "2026-06" }),
      receivable({ statement_id: "st", valor: 20, status: "cobrado", ref_month: "2026-05" }),
      receivable({ statement_id: "st", valor: 30, status: "pago", ref_month: "2025-01" }),
      receivable({ statement_id: "st", valor: 40, status: "ignorado", ref_month: null }),
    ];

    expect(resumoMes({ mes: "2026-06", transactions: [], statements, receivables })).toEqual({
      entradas: 0,
      entradasMeu: 0,
      entradasTerceiros: 0,
      saidas: 100,
      meu: 0,
      terceiros: 100,
      cartao: 100,
      cartaoMeu: 0,
      aVista: 0,
      aVistaMeu: 0,
    });
  });

  it("preserva meu negativo quando recebiveis superam o total da fatura", () => {
    const result = resumoMes({
      mes: "2026-06",
      transactions: [],
      statements: [statement({ id: "st", total_atual: 50 })],
      receivables: [receivable({ statement_id: "st", valor: 75, status: "ignorado" })],
    });

    expect(result).toEqual({
      entradas: 0,
      entradasMeu: 0,
      entradasTerceiros: 0,
      saidas: 50,
      meu: -25,
      terceiros: 75,
      cartao: 50,
      cartaoMeu: -25,
      aVista: 0,
      aVistaMeu: 0,
    });
  });

  it("devolve somente zeros quando nao ha registros na competencia pedida", () => {
    expect(
      resumoMes({
        mes: "2026-01",
        transactions: [tx({ amount: 10 })],
        statements: [statement({ total_atual: 20 })],
        receivables: [receivable({ statement_id: "st-default", valor: 5 })],
      }),
    ).toEqual({
      entradas: 0,
      entradasMeu: 0,
      entradasTerceiros: 0,
      saidas: 0,
      meu: 0,
      terceiros: 0,
      cartao: 0,
      cartaoMeu: 0,
      aVista: 0,
      aVistaMeu: 0,
    });
  });
});

describe("2 · gastosPorCategoria — contrato AS-IS", () => {
  it("agrega a vista por competencia e cartao/parcela pela competencia da fatura", () => {
    const statements = [
      statement({ id: "st-jun" }),
      statement({ id: "st-jul", competencia: "2026-07-01" }),
    ];
    const transactions: DashTx[] = [
      tx({
        amount: 50.25,
        valor_pessoal: 30,
        category_id: "a",
        category: { id: "a", name: "Casa", color: "#aaaaaa" },
      }),
      tx({
        amount: 9.75,
        category_id: "a",
        category: { id: "a", name: "Casa", color: "#aaaaaa" },
      }),
      // A data da compra e maio, mas a fatura e junho.
      tx({
        amount: 100,
        valor_pessoal: 70,
        competence_date: "2026-05-02",
        card_id: "card-1",
        statement_id: "st-jun",
        category_id: "b",
        category: { id: "b", name: "Viagem", color: "#bbbbbb" },
      }),
      tx({ amount: 900, card_id: "card-1", statement_id: null, category_id: "x" }),
      tx({ amount: 800, parcelado: true, card_id: "card-1", category_id: "x" }),
      tx({ amount: 700, status: "cancelado", category_id: "x" }),
      tx({ amount: 600, type: "receita", category_id: "x" }),
    ];
    const installmentItems: DashInstallmentItem[] = [
      installment({
        id: "inst-jun",
        statement_id: "st-jun",
        valor: 200,
        parent: { category: { id: "b", name: "Viagem", color: "#bbbbbb" } },
      }),
      installment({ id: "inst-cancelada", valor: 500, status: "cancelada" }),
      installment({ id: "inst-sem-fatura", statement_id: null, valor: 400 }),
      installment({ id: "inst-jul", statement_id: "st-jul", valor: 300 }),
    ];
    const receivables = [
      receivable({ installment_id: "inst-jun", valor: 40, status: "pago" }),
      receivable({ installment_id: "inst-jun", valor: 10, status: "ignorado" }),
      receivable({ installment_id: "inst-jul", valor: 300, status: "pendente" }),
    ];

    expect(
      gastosPorCategoria({
        mes: "2026-06",
        transactions,
        statements,
        installmentItems,
        receivables,
      }),
    ).toEqual([
      {
        categoryId: "b",
        name: "Viagem",
        color: "#bbbbbb",
        movimentado: 300,
        meu: 220,
      },
      {
        categoryId: "a",
        name: "Casa",
        color: "#aaaaaa",
        movimentado: 60,
        meu: 39.75,
      },
    ]);
  });

  it("agrupa categorias nulas como Sem categoria", () => {
    const result = gastosPorCategoria({
      mes: "2026-06",
      transactions: [tx({ amount: 12 }), tx({ amount: 8 })],
      statements: [],
      installmentItems: [],
      receivables: [],
    });

    expect(result).toEqual([
      { categoryId: null, name: "Sem categoria", color: null, movimentado: 20, meu: 20 },
    ]);
  });

  it("mantem nome e cor do primeiro item quando o mesmo id traz metadados divergentes", () => {
    const result = gastosPorCategoria({
      mes: "2026-06",
      transactions: [
        tx({
          amount: 10,
          category_id: "duplicada",
          category: { id: "duplicada", name: "Nome antigo", color: "#111111" },
        }),
        tx({
          amount: 20,
          category_id: "duplicada",
          category: { id: "duplicada", name: "Nome novo", color: "#222222" },
        }),
      ],
      statements: [],
      installmentItems: [],
      receivables: [],
    });

    expect(result).toEqual([
      {
        categoryId: "duplicada",
        name: "Nome antigo",
        color: "#111111",
        movimentado: 30,
        meu: 30,
      },
    ]);
  });

  it("preserva meu negativo na categoria de parcela quando recebiveis excedem a parcela", () => {
    const result = gastosPorCategoria({
      mes: "2026-06",
      transactions: [],
      statements: [statement({ id: "st" })],
      installmentItems: [
        installment({
          id: "inst",
          statement_id: "st",
          valor: 40,
          parent: { category: { id: "cat", name: "Categoria", color: null } },
        }),
      ],
      receivables: [receivable({ installment_id: "inst", valor: 55, status: "pago" })],
    });

    expect(result).toEqual([
      { categoryId: "cat", name: "Categoria", color: null, movimentado: 40, meu: -15 },
    ]);
  });

  it("devolve lista vazia sem itens atribuiveis ao mes", () => {
    expect(
      gastosPorCategoria({
        mes: "2026-01",
        transactions: [tx({ amount: 10 })],
        statements: [],
        installmentItems: [],
        receivables: [],
      }),
    ).toEqual([]);
  });
});

describe("3 · proximas6Faturas — contrato AS-IS", () => {
  it("gera seis ciclos por cartao, nao seis registros no total", () => {
    const result = proximas6Faturas({
      hoje: "2026-06-15",
      cards: [
        card({ id: "fecha-10", nome: "Fecha 10" }),
        card({
          id: "fecha-25",
          nome: "Fecha 25",
          cor: null,
          dia_fechamento: 25,
          dia_vencimento: 5,
        }),
      ],
      statements: [],
      receivables: [],
    });

    expect(result).toHaveLength(12);
    expect(result.filter((item) => item.cardId === "fecha-10")).toHaveLength(6);
    expect(result.filter((item) => item.cardId === "fecha-25")).toHaveLength(6);
    // A saida final e ordenada globalmente por vencimento.
    expect(result.slice(0, 4).map(({ cardId, competencia, dataVencimento }) => ({
      cardId,
      competencia,
      dataVencimento,
    }))).toEqual([
      { cardId: "fecha-25", competencia: "2026-06", dataVencimento: "2026-07-05" },
      { cardId: "fecha-10", competencia: "2026-07", dataVencimento: "2026-07-20" },
      { cardId: "fecha-25", competencia: "2026-07", dataVencimento: "2026-08-05" },
      { cardId: "fecha-10", competencia: "2026-08", dataVencimento: "2026-08-20" },
    ]);
  });

  it("congela uma fatura real e uma virtual, incluindo datas, status e valores", () => {
    const result = proximas6Faturas({
      hoje: "2026-06-15",
      cards: [card({ nome: "Principal", cor: "#abcdef" })],
      statements: [
        statement({
          id: "st-jul",
          competencia: "2026-07-01",
          data_fechamento: "2026-07-10",
          data_vencimento: "2026-07-20",
          total_atual: 100.25,
        }),
      ],
      receivables: [
        receivable({ statement_id: "st-jul", valor: 20.1, status: "pago" }),
        receivable({ statement_id: "st-jul", valor: 30.15, status: "ignorado" }),
      ],
      n: 2,
    });

    expect(result).toEqual([
      {
        cardId: "card-1",
        cardNome: "Principal",
        cardCor: "#abcdef",
        competencia: "2026-07",
        dataFechamento: "2026-07-10",
        dataVencimento: "2026-07-20",
        total: 100.25,
        meu: 50,
        terceiros: 50.25,
        status: "aberta",
        virtual: false,
      },
      {
        cardId: "card-1",
        cardNome: "Principal",
        cardCor: "#abcdef",
        competencia: "2026-08",
        dataFechamento: "2026-08-10",
        dataVencimento: "2026-08-20",
        total: 0,
        meu: 0,
        terceiros: 0,
        status: "aberta",
        virtual: true,
      },
    ]);
  });

  it("usa a ultima fatura quando ha duas do mesmo cartao e competencia", () => {
    const result = proximas6Faturas({
      hoje: "2026-06-15",
      cards: [card()],
      statements: [
        statement({ id: "primeira", competencia: "2026-07-01", total_atual: 10 }),
        statement({ id: "ultima", competencia: "2026-07-31", total_atual: 20 }),
      ],
      receivables: [
        receivable({ statement_id: "primeira", valor: 9 }),
        receivable({ statement_id: "ultima", valor: 3 }),
      ],
      n: 1,
    });

    expect(result).toMatchObject([
      { competencia: "2026-07", total: 20, meu: 17, terceiros: 3, virtual: false },
    ]);
  });

  it("deriva status da fatura real pelas datas fornecidas, com pago_em tendo prioridade", () => {
    const base = {
      competencia: "2026-07-01",
      data_fechamento: "2026-05-10",
      data_vencimento: "2026-05-20",
      total_atual: 10,
    };
    const overdue = proximas6Faturas({
      hoje: "2026-06-15",
      cards: [card()],
      statements: [statement({ ...base, id: "atrasada" })],
      receivables: [],
      n: 1,
    });
    const paid = proximas6Faturas({
      hoje: "2026-06-15",
      cards: [card()],
      statements: [statement({ ...base, id: "paga", pago_em: "2026-06-01" })],
      receivables: [],
      n: 1,
    });

    expect(overdue[0].status).toBe("atrasada");
    expect(paid[0].status).toBe("paga");
  });

  it("aceita horizonte zero", () => {
    expect(
      proximas6Faturas({
        hoje: "2026-06-15",
        cards: [card()],
        statements: [],
        receivables: [],
        n: 0,
      }),
    ).toEqual([]);
  });
});

describe("4 · totalAReceber — contrato AS-IS", () => {
  const receivables: DashReceivable[] = [
    receivable({ valor: 10.1, status: "pendente", ref_month: "2026-06" }),
    receivable({ valor: 20.2, status: "cobrado", ref_month: "2026-06" }),
    receivable({ valor: 30.3, status: "pago", ref_month: "2026-06" }),
    receivable({ valor: 40.4, status: "ignorado", ref_month: "2026-06" }),
    receivable({ valor: 50.5, status: "pendente", ref_month: "2026-07" }),
    receivable({ valor: 60.6, status: "cobrado", ref_month: null }),
  ];

  it("sem mes soma pendente e cobrado de todas as referencias, inclusive ref_month nulo", () => {
    expect(totalAReceber(receivables)).toBe(141.4);
  });

  it("com mes exige igualdade exata de ref_month", () => {
    expect(totalAReceber(receivables, "2026-06")).toBe(30.3);
    expect(totalAReceber(receivables, "2026-07")).toBe(50.5);
    expect(totalAReceber(receivables, "2026-08")).toBe(0);
  });

  it("preserva total negativo para valores abertos negativos", () => {
    expect(
      totalAReceber([
        receivable({ valor: -10, status: "pendente" }),
        receivable({ valor: 4, status: "cobrado" }),
      ]),
    ).toBe(-6);
  });

  it("arredonda cada valor para centavos antes de somar", () => {
    expect(
      totalAReceber([
        receivable({ valor: 10.004, status: "pendente" }),
        receivable({ valor: 20.006, status: "cobrado" }),
      ]),
    ).toBe(30.01);
  });

  it("devolve zero para a colecao vazia", () => {
    expect(totalAReceber([])).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 5 · §9 — O CENÁRIO SINTÉTICO OBRIGATÓRIO DO BRIEFING
 *
 * Compra no cartão R$ 1.000 · minha parte R$ 400 · terceiro R$ 600 · terceiro reembolsa
 * R$ 250.
 *
 * O `METRICAS-FINANCEIRAS.md` §9 lista OITO exigências. Quatro já são respondidas certo
 * hoje, uma é CONDICIONAL (⚠️, e este bloco mostra em que condição ela quebra) e três são
 * IRREPRESENTÁVEIS no schema atual. Este bloco prova as quatro, caracteriza a condicional
 * nas duas direções e mede o preço das três — não com uma frase, com número.
 *
 * ⛔ É o bloco que impede a evolução que vai atacar as três de quebrar em silêncio as que
 * já estavam certas.
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

const MES_9 = "2026-06";
const st9 = (over: Partial<DashStatement> = {}): DashStatement =>
  statement({
    id: "st-9",
    card_id: "card-9",
    competencia: "2026-06-01",
    total_atual: 1000,
    ...over,
  });
/** A responsabilidade ORIGINAL do terceiro: R$ 600, gravada no ato da compra. */
const rec9 = (status: string): DashReceivable =>
  receivable({ statement_id: "st-9", valor: 600, status });

const resumo9 = (status: string, transactions: DashTx[] = []) =>
  resumoMes({ mes: MES_9, transactions, statements: [st9()], receivables: [rec9(status)] });

describe("5 · §9 — cenário sintético obrigatório", () => {
  it("[1 ✅] minha despesa é R$ 400, e continua R$ 400 depois que o terceiro paga", () => {
    // É a §5 do dicionário: a soma de terceiros NÃO filtra status DE PROPÓSITO (D3).
    // Filtrar só os em aberto faria minha despesa CRESCER a cada reembolso.
    expect(resumo9("pendente").cartaoMeu).toBe(400);
    expect(resumo9("cobrado").cartaoMeu).toBe(400);
    expect(resumo9("pago").cartaoMeu).toBe(400);
    expect(resumo9("ignorado").cartaoMeu).toBe(400);
  });

  it("[2 ✅] a responsabilidade original do terceiro é R$ 600 nos quatro status", () => {
    for (const status of ["pendente", "cobrado", "pago", "ignorado"]) {
      expect(resumo9(status).terceiros).toBe(600);
    }
  });

  it("[6 ✅] o reembolso não reduz a fatura devida ao banco", () => {
    // `receivables` e `card_statements` são tabelas independentes: o total da fatura é
    // R$ 1.000 antes e depois de o terceiro pagar.
    expect(resumo9("pendente").cartao).toBe(1000);
    expect(resumo9("pago").cartao).toBe(1000);
  });

  it("[7 ✅] pagar os R$ 1.000 ao banco não cria despesa nova", () => {
    // O pagamento de fatura é gravado como `transferencia` (statement_id/card_id nulos),
    // e `transferencia` está fora de entradas E de saídas.
    const pagamento = tx({
      amount: 1000,
      type: "transferencia",
      status: "pago",
      competence_date: "2026-06-25",
    });
    expect(resumo9("pendente", [pagamento])).toEqual(resumo9("pendente"));
    expect(resumo9("pendente", [pagamento]).saidas).toBe(1000);
    expect(resumo9("pendente", [pagamento]).entradas).toBe(0);
  });

  it("[5 ⚠️] a renda pessoal NÃO sobe quando o reembolso é lançado como receita DE TERCEIRO — condicional à classificação (D10)", () => {
    // Sem lançar nada, a promessa vale.
    expect(resumo9("pendente").entradas).toBe(0);

    // REDESIGN-03-C (E2/E3) — o defeito do P0-1 deixou de estar congelado aqui: lançado como
    // receita de terceiro (`valor_pessoal` 0, gravado no ato), o reembolso entra no bruto e
    // NÃO na minha parte.
    const reembolsoDeTerceiro = tx({
      amount: 250,
      valor_pessoal: 0,
      type: "receita",
      status: "recebido",
      competence_date: "2026-06-28",
    });
    const comReembolso = resumo9("pendente", [reembolsoDeTerceiro]);
    expect(comReembolso.entradas).toBe(250); // o bruto ainda inclui
    expect(comReembolso.entradasMeu).toBe(0);
    expect(comReembolso.entradasTerceiros).toBe(250);

    // E o resumo dele deixou de ser byte a byte igual ao de uma renda genuína.
    const rendaGenuina = tx({
      amount: 250,
      type: "receita",
      status: "recebido",
      competence_date: "2026-06-28",
      category_id: "outra-categoria",
      category: { id: "outra-categoria", name: "Categoria X", color: null },
    });
    expect(resumo9("pendente", [rendaGenuina]).entradasMeu).toBe(250);
    expect(comReembolso).not.toEqual(resumo9("pendente", [rendaGenuina]));

    // ⚠️ Continua CONDICIONAL: lançado sem classificar (pessoal, valor nulo), o reembolso ainda
    // sobe a renda pessoal. Nada é reclassificado sozinho (D10), e ligar a entrada ao recebível
    // é da 03-D.
    const reembolsoSemClassificar = tx({
      amount: 250,
      type: "receita",
      status: "recebido",
      competence_date: "2026-06-28",
    });
    expect(resumo9("pendente", [reembolsoSemClassificar]).entradasMeu).toBe(250);
  });

  it("[3+4 ❌] R$ 250 recebidos e R$ 350 restantes são IRREPRESENTÁVEIS — e o preço é medido", () => {
    // `receivables` tem `valor` (um número) e `status` (quatro valores). Não tem
    // `valor_recebido`. Marcar `pago` afirma que os R$ 600 entraram; `pendente` afirma R$ 0.
    expect(totalAReceber([rec9("pendente")])).toBe(600);
    expect(totalAReceber([rec9("pago")])).toBe(0);
    expect(totalAReceber([rec9("cobrado")])).toBe(600);
    expect(totalAReceber([rec9("ignorado")])).toBe(0);

    // ⛔ O ÚNICO jeito de o sistema de hoje dizer "restam R$ 350" é reescrever o `valor`
    // de 600 para 350 — e isso DERRUBA a exigência [1]: minha despesa salta de 400 para
    // 650, porque `meu = total_atual − Σ recebíveis`. As duas exigências são incompatíveis
    // no schema atual. É a prova numérica de que a E1 (`receivable_receipts`) é necessária,
    // e não preferência de modelagem.
    const forcado = receivable({ statement_id: "st-9", valor: 350, status: "pendente" });
    expect(totalAReceber([forcado])).toBe(350);
    const comValorReescrito = resumoMes({
      mes: MES_9,
      transactions: [],
      statements: [st9()],
      receivables: [forcado],
    });
    expect(comValorReescrito.cartaoMeu).toBe(650);
    expect(comValorReescrito.terceiros).toBe(350);
  });

  it("[8 ❌] não há data de caixa: o motor não conhece coluna de liquidação nem de recebimento", () => {
    // Varredura da FONTE, porque a ausência é o contrato. Os nomes abaixo são os que as
    // migrations aprovadas (E1/E6) vão introduzir; no dia em que um deles aparecer aqui
    // este teste fica vermelho — e é esse o sinal que a 03-D/03-E devem provocar de propósito.
    for (const coluna of [
      "liquidado_em",
      "valor_recebido",
      "receivable_receipts",
      "recebido_em",
    ]) {
      expect(FONTE_DASHBOARD).not.toContain(coluna);
    }
    // `pago_em` existe, mas só em FATURA e só para derivar status — nunca para datar caixa.
    expect(FONTE_DASHBOARD).toContain("pago_em");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 6 · 03-C — A ENTRADA É PARTIDA ENTRE "MINHA" E "DE TERCEIROS" (E3)
 *
 * ⚠️ REESCRITO no commit da A4 da 03-C, de propósito. Até ali este bloco provava que a
 * entrada NÃO era partida (o laço somava `amount` cheio e nunca olhava `valor_pessoal`), para
 * que o dia em que passasse a ser fosse um diff aqui, e não um número que mudou sozinho.
 *
 * Agora prova que é — pelo `valor_pessoal` GRAVADO no ato (A2), pela mesma `meuCentavos` da
 * despesa à vista, sem o motor conhecer `classificacao` nem categoria (D8). E prova a
 * divergência que o dono decidiu manter (B2): o `saldo` da evolução continua bruto − bruto.
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

describe("6 · 03-C — a entrada é partida entre minha e de terceiros", () => {
  const resumo = (transactions: DashTx[]) =>
    resumoMes({ mes: "2026-06", transactions, statements: [], receivables: [] });

  it("compartilhada: entradas continua cheio, entradasMeu é a parte gravada e o resto é de terceiros", () => {
    const r = resumo([
      tx({ amount: 1000, valor_pessoal: 300, type: "receita", status: "recebido" }),
    ]);
    expect(r.entradas).toBe(1000);
    expect(r.entradasMeu).toBe(300);
    expect(r.entradasTerceiros).toBe(700);
  });

  it("terceiro (valor_pessoal 0): nada entra na minha parte", () => {
    const r = resumo([tx({ amount: 250, valor_pessoal: 0, type: "receita", status: "recebido" })]);
    expect(r).toMatchObject({ entradas: 250, entradasMeu: 0, entradasTerceiros: 250 });
  });

  it("pessoal (valor_pessoal nulo): a entrada inteira é minha — o dado de hoje não muda", () => {
    const r = resumo([tx({ amount: 1000, type: "receita", status: "recebido" })]);
    expect(r).toMatchObject({ entradas: 1000, entradasMeu: 1000, entradasTerceiros: 0 });
  });

  it("`meu` e `terceiros` do resumo continuam falando SÓ das saídas", () => {
    const r = resumo([
      tx({ amount: 1000, valor_pessoal: 300, type: "receita", status: "recebido" }),
      tx({ amount: 100, valor_pessoal: 40 }),
    ]);
    expect(r.meu).toBe(40);
    expect(r.terceiros).toBe(60);
    expect(r.meu + r.terceiros).toBe(r.saidas);
    expect(r.saidas).toBe(100);
    expect(r.entradasMeu).toBe(300);
  });

  it("a partição fecha: entradasMeu + entradasTerceiros === entradas", () => {
    // ⚠️ O estorno de cartão e a receita cancelada carregam `valor_pessoal` 0 DE PROPÓSITO:
    // uma conta de terceiros feita por fora do filtro de `entradas` os somaria, e a partição
    // quebraria. É o que torna esta fixture capaz de derrubar a mutação C2.
    const r = resumo([
      tx({ amount: 500.11, type: "receita", status: "recebido" }),
      tx({ amount: 1000, valor_pessoal: 300.33, type: "receita", status: "recebido" }),
      tx({ amount: 250, valor_pessoal: 0, type: "receita", status: "recebido" }),
      tx({
        amount: 80,
        valor_pessoal: 0,
        type: "receita",
        status: "recebido",
        card_id: "card-1",
        statement_id: "st",
      }),
      tx({ amount: 999, valor_pessoal: 0, type: "receita", status: "cancelado" }),
    ]);
    expect(reaisParaCentavos(r.entradasMeu) + reaisParaCentavos(r.entradasTerceiros)).toBe(
      reaisParaCentavos(r.entradas),
    );
    expect(r.entradas).toBe(1750.11);
    expect(r.entradasMeu).toBe(800.44);
    expect(r.entradasTerceiros).toBe(949.67);
  });

  it("estorno de cartão fica fora das três", () => {
    const r = resumo([
      tx({
        amount: 80,
        type: "receita",
        status: "recebido",
        card_id: "card-1",
        statement_id: "st",
      }),
    ]);
    expect(r).toMatchObject({ entradas: 0, entradasMeu: 0, entradasTerceiros: 0 });
  });

  it("receita cancelada fica fora das três", () => {
    const r = resumo([tx({ amount: 999, type: "receita", status: "cancelado" })]);
    expect(r).toMatchObject({ entradas: 0, entradasMeu: 0, entradasTerceiros: 0 });
  });

  it("as chaves do ResumoMes: as duas novas entram, nenhuma sai", () => {
    expect(Object.keys(resumo([])).sort()).toEqual([
      "aVista",
      "aVistaMeu",
      "cartao",
      "cartaoMeu",
      "entradas",
      "entradasMeu",
      "entradasTerceiros",
      "meu",
      "saidas",
      "terceiros",
    ]);
  });

  it("o motor continua sem conhecer `classificacao`", () => {
    // A repartição sai do `valor_pessoal` gravado no ato (D8). `DashTx` não carrega
    // `classificacao`, e o motor não precisa dela — nem para despesa, nem para receita.
    expect(FONTE_DASHBOARD).not.toContain("classificacao");
  });

  it("trocar a categoria de uma RECEITA não move entradasMeu nem entradasTerceiros (D8)", () => {
    // ⛔ É o teste que a mutação C9 tem de derrubar: o bloco 7 só tem DESPESA na fixture, e
    // ler a categoria para repartir a receita passaria verde por lá. A segunda categoria tem um
    // nome que "declara" ser de terceiros — e mesmo assim não decide nada.
    const receita = (category_id: string | null, name: string | null) =>
      tx({
        amount: 1000,
        valor_pessoal: 300,
        type: "receita",
        status: "recebido",
        category_id,
        category: category_id && name ? { id: category_id, name, color: null } : null,
      });
    const emA = resumo([receita("cat-a", "Categoria A")]);
    const emTerceiros = resumo([receita("cat-terceiros", "Categoria de terceiros (sintética)")]);
    const semCategoria = resumo([receita(null, null)]);
    expect(emA).toEqual(emTerceiros);
    expect(emA).toEqual(semCategoria);
    expect(emA.entradasMeu).toBe(300);
  });

  it("B2 — divergência declarada: o saldo da evolução continua bruto − bruto", () => {
    // Decisão do dono na 03-C: o Resultado do §13.3 (renda pessoal − minha parte EFETIVA das
    // despesas) nasce depois da 03-D, quando o perdoado (D11) existir. Trocar um lado só seria
    // a subtração que o próprio §13.3 proíbe.
    const ev = evolucaoMensal({
      meses: ["2026-06"],
      transactions: [
        tx({ amount: 250, valor_pessoal: 0, type: "receita", status: "recebido" }),
        tx({ amount: 100 }),
      ],
      statements: [],
      receivables: [],
    });
    expect(ev).toEqual([{ mes: "2026-06", entradas: 250, saidas: 100, saldo: 150 }]);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 7 · 03-C2 / D8 — A CATEGORIA NUNCA DECIDE DE QUEM É O DINHEIRO
 *
 * A 03-C2 vai dar marcação de terceiros à CATEGORIA (E7). A D8 exige que ela seja ATALHO
 * DE PREENCHIMENTO E FILTRO, nunca fonte de verdade — porque ler a categoria no relatório
 * faria trocar a marcação hoje reescrever o que se gastou em março.
 *
 * ⛔ A prova principal aqui é COMPORTAMENTAL, não `grep`: trocar a categoria de um
 * lançamento não move um centavo de "meu" ou "terceiros". Um `grep` envelhece no primeiro
 * campo com nome diferente; isto não.
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

describe("7 · 03-C2 / D8 — categoria não é fonte de verdade sobre de quem é o dinheiro", () => {
  const base = { mes: "2026-06", statements: [statement({ id: "st", total_atual: 500 })] };
  const recs = [receivable({ statement_id: "st", valor: 200, status: "pendente" })];

  it("trocar a categoria de um lançamento não muda meu, terceiros nem nenhum total", () => {
    const comA = resumoMes({
      ...base,
      transactions: [
        tx({
          amount: 100,
          valor_pessoal: 40,
          category_id: "cat-a",
          category: { id: "cat-a", name: "Categoria A", color: "#111111" },
        }),
      ],
      receivables: recs,
    });
    const comB = resumoMes({
      ...base,
      transactions: [
        tx({
          amount: 100,
          valor_pessoal: 40,
          category_id: "cat-b",
          category: { id: "cat-b", name: "Categoria B", color: "#222222" },
        }),
      ],
      receivables: recs,
    });
    const semCategoria = resumoMes({
      ...base,
      transactions: [tx({ amount: 100, valor_pessoal: 40, category_id: null, category: null })],
      receivables: recs,
    });

    expect(comA).toEqual(comB);
    expect(comA).toEqual(semCategoria);
    expect(comA.meu).toBe(340); // 40 (à vista, de `valor_pessoal`) + 300 (500 − 200)
  });

  it("em gastosPorCategoria a categoria move o RÓTULO, nunca o número de `meu`", () => {
    const params = {
      mes: "2026-06",
      statements: [],
      installmentItems: [] as DashInstallmentItem[],
      receivables: [] as DashReceivable[],
    };
    const emA = gastosPorCategoria({
      ...params,
      transactions: [
        tx({
          amount: 100,
          valor_pessoal: 40,
          category_id: "cat-a",
          category: { id: "cat-a", name: "Categoria A", color: null },
        }),
      ],
    });
    const emB = gastosPorCategoria({
      ...params,
      transactions: [
        tx({
          amount: 100,
          valor_pessoal: 40,
          category_id: "cat-b",
          category: { id: "cat-b", name: "Categoria B", color: null },
        }),
      ],
    });
    // A fatia muda de nome e de id; `movimentado` e `meu` são idênticos.
    expect(emA[0].name).toBe("Categoria A");
    expect(emB[0].name).toBe("Categoria B");
    expect(emA[0].movimentado).toBe(emB[0].movimentado);
    expect(emA[0].meu).toBe(emB[0].meu);
    expect(emA[0].meu).toBe(40);
  });

  it("proximas6Faturas e totalAReceber não recebem categoria — nem têm como ler uma", () => {
    // A categoria não existe em `DashStatement`, `DashCard` nem `DashReceivable`: a
    // ausência de campo é a garantia, não um `if` que alguém pode remover.
    const faturas = proximas6Faturas({
      hoje: "2026-06-15",
      cards: [card({ id: "card-1" })],
      statements: [statement({ id: "st", competencia: "2026-07-01", total_atual: 500 })],
      receivables: [receivable({ statement_id: "st", valor: 200 })],
      n: 1,
    });
    expect(faturas[0].meu).toBe(300);
    expect(faturas[0]).not.toHaveProperty("categoryId");
    expect(totalAReceber([receivable({ valor: 200 })])).toBe(200);
  });

  it("o motor não conhece `classificacao_padrao` — a coluna que a E7 vai criar", () => {
    // ⛔ Fica vermelho no dia em que alguém ligar a marcação da categoria à decisão de
    // dinheiro dentro deste módulo. É o teste que a 03-C2 tem de encarar de frente.
    expect(FONTE_DASHBOARD).not.toContain("classificacao_padrao");
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 8 · 03-D — OS QUATRO STATUS DE RECEBÍVEL, UM A UM
 *
 * A 03-D vai mexer em recebíveis (recebimento parcial E1, `ignorado` visível D11). Antes
 * disso, fica registrado aqui — explicitamente, status por status — quem conta onde.
 *
 * ⚠️ A ASSIMETRIA É DE PROPÓSITO e tem duas pontas:
 *   `totalAReceber`   filtra    → só `pendente`/`cobrado` (é "quanto ainda me devem")
 *   `resumoMes` & cia não filtra → os QUATRO (é "de quem era a responsabilidade original")
 * A D3 registra que a segunda está CERTA e não deve ser "corrigida".
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

describe("8 · 03-D — status de recebível, um a um", () => {
  const um = (status: string) => [receivable({ statement_id: "st", valor: 100, status })];

  it.each([
    ["pendente", 100],
    ["cobrado", 100],
    ["pago", 0],
    ["ignorado", 0],
  ])("totalAReceber com status %s devolve %s", (status, esperado) => {
    expect(totalAReceber(um(status as string))).toBe(esperado);
  });

  it("totalAReceber ignora status desconhecido — allowlist, não lista de proibidos", () => {
    // ⚠️ O filtro é `RECEIVABLE_OPEN_STATUSES.includes(...)`. Um quinto status nasceria
    // FORA do total, em silêncio — errando para "pode faltar coisa", que é o erro aceitável.
    expect(totalAReceber(um("parcial"))).toBe(0);
    expect(totalAReceber(um(""))).toBe(0);
  });

  it.each(["pendente", "cobrado", "pago", "ignorado", "status-inventado"])(
    "resumoMes conta o recebível %s como terceiros — sem filtro nenhum",
    (status) => {
      const r = resumoMes({
        mes: "2026-06",
        transactions: [],
        statements: [statement({ id: "st", total_atual: 500 })],
        receivables: um(status),
      });
      expect(r.terceiros).toBe(100);
      expect(r.cartaoMeu).toBe(400);
    },
  );

  it.each(["pendente", "cobrado", "pago", "ignorado"])(
    "proximas6Faturas conta o recebível %s como terceiros — sem filtro nenhum",
    (status) => {
      const [f] = proximas6Faturas({
        hoje: "2026-06-15",
        cards: [card()],
        statements: [statement({ id: "st", competencia: "2026-07-01", total_atual: 500 })],
        receivables: [receivable({ statement_id: "st", valor: 100, status })],
        n: 1,
      });
      expect(f.terceiros).toBe(100);
      expect(f.meu).toBe(400);
    },
  );

  it.each(["pendente", "cobrado", "pago", "ignorado"])(
    "gastosPorCategoria desconta o recebível %s da parcela — sem filtro nenhum",
    (status) => {
      const [fatia] = gastosPorCategoria({
        mes: "2026-06",
        transactions: [],
        statements: [statement({ id: "st" })],
        installmentItems: [
          installment({
            id: "inst",
            statement_id: "st",
            valor: 500,
            parent: { category: { id: "cat", name: "Categoria", color: null } },
          }),
        ],
        receivables: [receivable({ installment_id: "inst", valor: 100, status })],
      });
      expect(fatia.movimentado).toBe(500);
      expect(fatia.meu).toBe(400);
    },
  );

  it("⚠️ `ignorado` conta como terceiro hoje — a D11 decidiu que deve virar despesa minha", () => {
    // CONGELADO COMO ESTÁ. Hoje o valor perdoado continua sendo contado como dele; a D11
    // manda a tela passar a mostrar a parte EFETIVA (acordada + perdoado). Quando a 03-D
    // implementar, este número muda de 400 para 500 — e a mudança será visível AQUI.
    const r = resumoMes({
      mes: "2026-06",
      transactions: [],
      statements: [statement({ id: "st", total_atual: 500 })],
      receivables: [receivable({ statement_id: "st", valor: 100, status: "ignorado" })],
    });
    expect(r.cartaoMeu).toBe(400);
    expect(r.cartaoMeu).not.toBe(500);
  });

  it("recebível de FATURA e recebível de PARCELA são somados por chaves diferentes", () => {
    // `resumoMes`/`proximas6Faturas` agrupam por `statement_id`; `gastosPorCategoria`
    // agrupa a parcela por `installment_id`. Um recebível com os dois preenchidos é lido
    // pelas DUAS vias — em números diferentes, de propósito (a fatura já contém a parcela).
    const rec = receivable({ statement_id: "st", installment_id: "inst", valor: 100 });
    const r = resumoMes({
      mes: "2026-06",
      transactions: [],
      statements: [statement({ id: "st", total_atual: 500 })],
      receivables: [rec],
    });
    expect(r.terceiros).toBe(100);

    // Um recebível SÓ de parcela não é visto pelo resumo do mês.
    const soParcela = resumoMes({
      mes: "2026-06",
      transactions: [],
      statements: [statement({ id: "st", total_atual: 500 })],
      receivables: [receivable({ installment_id: "inst", valor: 100 })],
    });
    expect(soParcela.terceiros).toBe(0);
    expect(soParcela.cartaoMeu).toBe(500);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 9 · 03-E — HOJE EXISTE UMA BASE SÓ, E ELA É COMPETÊNCIA
 *
 * A 03-E vai separar caixa exato × competência (E6, `liquidado_em`). Hoje tudo é
 * competência, e o motor mistura DUAS competências no mesmo número sem rótulo: à vista
 * por `competence_date`, cartão pela `competencia` da fatura.
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

describe("9 · 03-E — a base é competência, e cada função usa uma data", () => {
  it("à vista: quem decide o mês é `competence_date`, e ele é comparado como TEXTO", () => {
    const transactions = [
      tx({ amount: 10, competence_date: "2026-05-31" }),
      tx({ amount: 20, competence_date: "2026-06-01" }),
      tx({ amount: 30, competence_date: "2026-06-30" }),
      tx({ amount: 40, competence_date: "2026-07-01" }),
    ];
    const r = resumoMes({ mes: "2026-06", transactions, statements: [], receivables: [] });
    expect(r.aVista).toBe(50);

    // ⛔ Data pura não tem fuso: a fronteira do mês é recortada do TEXTO, nunca por um
    // `Date`. As duas bordas abaixo são justamente as que um parse com fuso erraria — o
    // dia 1º às 00h em UTC-3 cai no mês anterior em UTC, e o último dia cai no seguinte
    // em UTC+14. A prova completa é a suíte inteira rodar igual em qualquer TZ:
    //   TZ=UTC npx vitest run src/lib/finance/dashboard-caracterizacao.test.ts
    //   TZ=Pacific/Kiritimati npx vitest run src/lib/finance/dashboard-caracterizacao.test.ts
    // ⚠️ Uma asserção sobre a FORMA do código (`toContain("slice(0, 7)")`) esteve aqui e
    // saiu: ela ficava vermelha ao trocar `slice` por `substring`, que é idêntico. Teste
    // que quebra em refatoração inofensiva ensina a afrouxar o arquivo.
    const soPrimeiroDia = resumoMes({
      mes: "2026-06",
      transactions: [tx({ amount: 7, competence_date: "2026-06-01" })],
      statements: [],
      receivables: [],
    });
    const soUltimoDia = resumoMes({
      mes: "2026-06",
      transactions: [tx({ amount: 7, competence_date: "2026-06-30" })],
      statements: [],
      receivables: [],
    });
    expect(soPrimeiroDia.aVista).toBe(7);
    expect(soUltimoDia.aVista).toBe(7);
  });

  it("cartão: quem decide o mês é a `competencia` da FATURA — vencimento e pago_em não entram", () => {
    const r = resumoMes({
      mes: "2026-06",
      transactions: [],
      statements: [
        // Competência de junho, mas vence em agosto e já foi paga: entra em junho assim mesmo.
        statement({
          id: "st",
          competencia: "2026-06-01",
          data_vencimento: "2026-08-20",
          pago_em: "2026-05-02",
          total_atual: 300,
        }),
      ],
      receivables: [],
    });
    expect(r.cartao).toBe(300);
  });

  it("⚠️ `pendente` entra como se já tivesse acontecido — nas duas direções", () => {
    // O único status excluído é `cancelado`. Uma entrada que ainda não caiu e uma saída
    // que ainda não saiu compõem o mesmo número que as realizadas, sem nada distinguindo.
    const r = resumoMes({
      mes: "2026-06",
      transactions: [
        tx({ amount: 500, type: "receita", status: "pendente" }),
        tx({ amount: 100, status: "pendente" }),
        tx({ amount: 999, type: "receita", status: "cancelado" }),
        tx({ amount: 999, status: "cancelado" }),
      ],
      statements: [],
      receivables: [],
    });
    expect(r.entradas).toBe(500);
    expect(r.aVista).toBe(100);
  });

  it("totalAReceber usa `ref_month` e NÃO conhece data de recebimento", () => {
    const recs = [
      receivable({ valor: 100, status: "pendente", ref_month: "2026-06" }),
      receivable({ valor: 200, status: "pendente", ref_month: "2026-07" }),
    ];
    expect(totalAReceber(recs, "2026-06")).toBe(100);
    // Não há como perguntar "quanto foi recebido em junho" — a função só tem `ref_month`.
    expect(totalAReceber(recs)).toBe(300);
  });

  it("`hoje` só é aceito por proximas6Faturas, e decide ciclo e status — nunca um total", () => {
    const statements = [
      statement({
        id: "st",
        competencia: "2026-07-01",
        data_fechamento: "2026-07-10",
        data_vencimento: "2026-07-20",
        total_atual: 500,
      }),
    ];
    const receivables = [receivable({ statement_id: "st", valor: 100 })];
    const cedo = proximas6Faturas({
      hoje: "2026-06-15",
      cards: [card()],
      statements,
      receivables,
      n: 1,
    });
    const tarde = proximas6Faturas({
      hoje: "2026-07-15",
      cards: [card()],
      statements,
      receivables,
      n: 2,
    });

    // Mudar `hoje` muda QUAL fatura abre a lista — nunca os R$ 500 dela.
    expect(cedo[0].competencia).toBe("2026-07");
    expect(cedo[0].status).toBe("aberta");
    expect(cedo[0].total).toBe(500);
    // Passado o fechamento de julho, a fatura real de julho deixa de aparecer no horizonte.
    expect(tarde.map((f) => f.competencia)).toEqual(["2026-08", "2026-09"]);
    expect(tarde.every((f) => f.virtual)).toBe(true);
  });

  it("resumoMes, gastosPorCategoria e totalAReceber não recebem `hoje` — nada deriva do agora", () => {
    // Consequência de projeto que a 03-E precisa preservar: as três são funções do
    // conjunto de linhas e do mês, e de mais nada. Rodar duas vezes dá o mesmo resultado.
    const args = {
      mes: "2026-06",
      transactions: [tx({ amount: 10 })],
      statements: [],
      receivables: [],
    };
    expect(resumoMes(args)).toEqual(resumoMes(args));

    // ⚠️ A varredura ignora COMENTÁRIO de propósito: o cabeçalho de `dashboard.ts` cita
    // `Date.now()` para dizer que não o usa, e uma varredura ingênua ficaria vermelha
    // para sempre sobre a própria frase que declara a regra (é a invariante 30 do
    // `CLAUDE.md` pelo avesso, e a lição que `painel-persistencia.test.ts` já pagou).
    const codigo = FONTE_DASHBOARD.split("\n").filter((linha) => {
      const t = linha.trim();
      return t.length > 0 && !t.startsWith("*") && !t.startsWith("/*") && !t.startsWith("//");
    });
    expect(codigo.filter((l) => l.includes("Date.now("))).toEqual([]);
    expect(codigo.filter((l) => /new Date\(\s*\)/.test(l))).toEqual([]);
    // Guarda anti-tautologia: a varredura enxerga o código, não só linhas em branco.
    expect(codigo.some((l) => l.includes("export function resumoMes"))).toBe(true);
  });
});

/* ══════════════════════════════════════════════════════════════════════════════════════
 * 10 · 03-B — A LINHA DE BASE DO PIPELINE TRIPLICADO
 *
 * As mesmas funções puras são alimentadas de TRÊS lugares:
 *   A. `src/lib/dashboard/queries.ts`      (`getFinanceCardData` / `getInvoicesCardData`)
 *   B. `src/lib/reports/queries.ts`        (`getFinanceAndCardReport`)
 *   C. `src/app/(app)/dashboard/financeiro/page.tsx`
 *
 * ⚠️ ACHADO DA 03-A: eles NÃO alimentam igual. Três diferenças medidas, e este bloco
 * testa o efeito de cada uma sobre as funções puras — sem tocar em runtime:
 *
 *   1. JANELA DE TRANSAÇÕES. A lê só o mês (`mes-01 .. fim do mês`); B e C leem 6 meses
 *      atrás até 6 à frente. Para `resumoMes` do mês isso é inofensivo — e é exatamente
 *      isso que a 03-B precisa poder afirmar ANTES de unificar.
 *   2. `installmentItems`. A nem os busca (não chama `gastosPorCategoria`); B e C buscam.
 *      Passar lista vazia faz a parcela SUMIR do total do mês, em silêncio.
 *   3. `ref_month`. `getInvoicesCardData` (em A) monta os recebíveis SEM esse campo e
 *      chama `totalAReceber(recs)` sem mês — coerente hoje. Se a unificação passar a
 *      mandar o mês por esse caminho, o card responde R$ 0,00 sem nada quebrar.
 * ═══════════════════════════════════════════════════════════════════════════════════════ */

describe("10 · 03-B — o que muda quando o pipeline alimenta diferente", () => {
  const statements = [
    statement({ id: "st-mai", competencia: "2026-05-01", total_atual: 50 }),
    statement({ id: "st-jun", competencia: "2026-06-01", total_atual: 200 }),
    statement({ id: "st-jul", competencia: "2026-07-01", total_atual: 70 }),
  ];
  const receivables = [receivable({ statement_id: "st-jun", valor: 60, status: "pendente" })];
  const janelaLarga = [
    tx({ amount: 10, competence_date: "2026-05-20" }),
    tx({ amount: 100, competence_date: "2026-06-10" }),
    tx({ amount: 30, competence_date: "2026-07-05" }),
  ];
  const janelaEstreita = janelaLarga.filter((t) => t.competence_date.startsWith("2026-06"));

  it("[1] janela estreita e janela larga dão o MESMO resumoMes do mês", () => {
    // A garantia que a 03-B precisa: unificar a janela não move o card do dashboard.
    const larga = resumoMes({ mes: "2026-06", transactions: janelaLarga, statements, receivables });
    const estreita = resumoMes({
      mes: "2026-06",
      transactions: janelaEstreita,
      statements,
      receivables,
    });
    expect(estreita).toEqual(larga);
    expect(larga.saidas).toBe(300);
    expect(larga.meu).toBe(240);
  });

  it("[1] ...mas a janela estreita ZERA qualquer mês fora dela — sem avisar", () => {
    // ⚠️ É por isso que unificar a janela não é cosmético: com a janela do dashboard,
    // qualquer comparação com outro mês responde zero como se não tivesse havido gasto.
    expect(
      resumoMes({ mes: "2026-05", transactions: janelaEstreita, statements, receivables }).aVista,
    ).toBe(0);
    expect(
      resumoMes({ mes: "2026-05", transactions: janelaLarga, statements, receivables }).aVista,
    ).toBe(10);
    // ⛔ E `statements` NÃO é afetado: as faturas são buscadas inteiras nos três pipelines,
    // então o cartão de maio aparece nos dois casos. A divergência é só do lado à vista.
    expect(
      resumoMes({ mes: "2026-05", transactions: janelaEstreita, statements, receivables }).cartao,
    ).toBe(50);
  });

  it("[2] installmentItems vazio faz a parcela sumir do total do mês, sem erro nenhum", () => {
    const params = {
      mes: "2026-06",
      transactions: [
        tx({
          amount: 100,
          card_id: "card-1",
          statement_id: "st-jun",
          category_id: "cat",
          category: { id: "cat", name: "Categoria", color: null },
        }),
      ],
      statements,
      receivables: [] as DashReceivable[],
    };
    const comParcela = gastosPorCategoria({
      ...params,
      installmentItems: [
        installment({
          id: "inst",
          statement_id: "st-jun",
          valor: 100,
          parent: { category: { id: "outra", name: "Outra", color: null } },
        }),
      ],
    });
    const semParcela = gastosPorCategoria({ ...params, installmentItems: [] });

    expect(comParcela.reduce((s, c) => s + c.movimentado, 0)).toBe(200);
    expect(semParcela.reduce((s, c) => s + c.movimentado, 0)).toBe(100);
    // ⛔ Nenhuma exceção, nenhum campo de completude: a diferença é invisível para quem chama.
    expect(semParcela).toHaveLength(1);
  });

  it("[3] recebível sem `ref_month` some quando o mês é informado — é o caso de getInvoicesCardData", () => {
    const semRef = [
      receivable({ statement_id: "st-jun", valor: 60, status: "pendente" }),
      receivable({ statement_id: "st-jul", valor: 40, status: "cobrado" }),
    ];
    expect(totalAReceber(semRef)).toBe(100);
    // ⚠️ Mesmo dado, mesma função, mês informado: R$ 0,00. `ref_month` é `undefined` e o
    // filtro exige igualdade exata. A tela não teria como perceber.
    expect(totalAReceber(semRef, "2026-06")).toBe(0);
    expect(totalAReceber(semRef, "2026-07")).toBe(0);
  });

  it("[3] `ref_month` null e `ref_month` ausente se comportam igual — os dois somem com filtro", () => {
    const nulo = [receivable({ valor: 60, status: "pendente", ref_month: null })];
    const ausente = [receivable({ valor: 60, status: "pendente" })];
    expect(totalAReceber(nulo, "2026-06")).toBe(totalAReceber(ausente, "2026-06"));
    expect(totalAReceber(nulo, "2026-06")).toBe(0);
    expect(totalAReceber(nulo)).toBe(60);
  });
});
