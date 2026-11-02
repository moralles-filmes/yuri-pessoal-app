import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { FiltrosDoRelatorio } from "@/components/reports/barra-de-filtros";
import type { BaseFinanceira } from "@/lib/finance/base";
import type { EstadoDoCaixa } from "@/lib/finance/caixa-leitura";
import {
  type DashCard,
  type DashInstallmentItem,
  type DashReceivable,
  type DashStatement,
  type DashTx,
  evolucaoMensal,
  faturasPorMes,
  gastosPorCategoria,
  gastosPorForma,
  mesDe,
  resumoMes,
} from "@/lib/finance/dashboard";
import { aReceberPorPessoa, dadosDasBarras } from "@/lib/finance/painel";
import { janelaDoRelatorio } from "@/lib/finance/pipeline";
import {
  type BlocoDoRelatorio,
  type EntradasDoMotorDoRelatorio,
  type Recorte,
  SEM_RECORTE,
  recortarEntradas,
  naoSegue,
  recortarPorCategoria,
} from "@/lib/finance/recorte";
import { type Responsabilidade } from "@/lib/finance/responsabilidade";
import { formatCurrency, reaisParaCentavos } from "@/lib/format";
import { colunaDaParte, type PedidoDeDetalhe } from "@/lib/finance/detalhe";
import {
  detalheDoRelatorio,
  gavetaDoRelatorio,
  montarRelatorioFinanceiro,
  type ParametrosDoRelatorio,
} from "@/lib/reports/financeiro";

// A única leitura que este arquivo toca é `lerSaldoAte` (o saldo da conta do recorte): o client é
// um espião de `rpc`, sem banco. O modelo de vista em si continua sem I/O.
const rpcs = vi.hoisted(() => [] as { nome: string; args: unknown }[]);
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    rpc: (nome: string, args: unknown) => {
      rpcs.push({ nome, args });
      return Promise.resolve({ data: "900.5", error: null });
    },
  }),
}));
const { lerSaldoAte } = await import("@/lib/finance/queries");

/**
 * 04-A2, Tarefa 7 — o MODELO DE VISTA PURO do relatório financeiro.
 *
 * Fixture SINTÉTICA, a mesma de `recorte.test.ts` (copiada, ver abaixo). Os números
 * esperados saem das MESMAS funções do motor (nunca de uma conta feita aqui) — o que este arquivo
 * prova é a ESCOLHA: qual campo, de qual entrada, e o que NUNCA leva número (o bloco ✗).
 */

/* ───────────────────────────── A fixture ───────────────────────────── */

/**
 * SINTÉTICA ("Cartão A/B", "Conta B/C", "Categoria A…E", "Pessoa A/B", valores inventados) e a MESMA
 * de `recorte.test.ts`, COPIADA: um arquivo de fixture fora de `*.test.ts` monta `Dash*` e reprova a
 * fronteira do motor (`fronteira-do-motor.test.ts`, `pipeline.test.ts`). Tem o que costuma quebrar a
 * conta: um ESTORNO de cartão, uma compra PARCELADA, uma compra à vista com recebível, uma receita
 * de conta e um mês anterior.
 *
 * Contas à mão (novembro de 2026):
 *   à vista:  T1 100 (meu 60, conta B, Categoria A) · T2 80 pendente (conta C, Categoria B)
 *   Cartão A: T4 200 (meu 120, Categoria A) + parcela I1 50 (Categoria C) − estorno 30 = fatura 220
 *   Cartão B: T11 70 (Categoria A) = fatura 70
 *   ⇒ saídas 180 + 290 = 470 · terceiros dos recebíveis das faturas 80 + 20 = 100
 *   Categoria A: T1 + T4 + T11 = 370 (meu 60 + 120 + 70 = 250)
 */
const MES = "2026-11";
const HOJE = "2026-11-05";

const categoria = (id: string, nome: string) => ({ id, name: nome, color: null });
const CAT_A = categoria("cat-a", "Categoria A");
const CAT_B = categoria("cat-b", "Categoria B");
const CAT_C = categoria("cat-c", "Categoria C");
const CAT_E = categoria("cat-e", "Categoria E");

const baseTx = {
  valor_pessoal: null,
  status: "pago" as const,
  parcelado: false,
  card_id: null,
  account_id: null,
  statement_id: null,
  payment_method: "pix" as const,
};

const TXS: DashTx[] = [
  // Outubro (outro mês: nunca entra nas contas de novembro).
  { ...baseTx, id: "t12", type: "despesa", amount: 90, competence_date: "2026-10-07", account_id: "conta-b", category_id: CAT_A.id, category: CAT_A },
  // Receita de conta.
  { ...baseTx, id: "t3", type: "receita", amount: 3000, competence_date: "2026-11-01", account_id: "conta-b", category_id: CAT_E.id, category: CAT_E },
  // À vista, conta B, dividida com a Pessoa A.
  { ...baseTx, id: "t1", type: "despesa", amount: 100, valor_pessoal: 60, competence_date: "2026-11-02", account_id: "conta-b", category_id: CAT_A.id, category: CAT_A },
  // À vista, conta C, pendente.
  { ...baseTx, id: "t2", type: "despesa", amount: 80, status: "pendente", competence_date: "2026-11-25", account_id: "conta-c", category_id: CAT_B.id, category: CAT_B },
  // Cartão A.
  { ...baseTx, id: "t4", type: "despesa", amount: 200, valor_pessoal: 120, competence_date: "2026-11-03", category_id: CAT_A.id, category: CAT_A, payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-nov" },
  // Compra parcelada do Cartão A: só a compra-pai está em `transactions`.
  { ...baseTx, id: "t5", type: "despesa", amount: 150, parcelado: true, competence_date: "2026-11-03", category_id: CAT_C.id, category: CAT_C, payment_method: "cartao_credito", card_id: "cartao-a" },
  // ESTORNO de cartão: receita ligada à fatura. Não é entrada de caixa.
  { ...baseTx, id: "t6", type: "receita", amount: 30, competence_date: "2026-11-04", category_id: CAT_A.id, category: CAT_A, payment_method: "cartao_credito", card_id: "cartao-a", statement_id: "f-a-nov" },
  // Cartão B.
  { ...baseTx, id: "t11", type: "despesa", amount: 70, competence_date: "2026-11-02", category_id: CAT_A.id, category: CAT_A, payment_method: "cartao_credito", card_id: "cartao-b", statement_id: "f-b-nov" },
];

const STS: DashStatement[] = [
  { id: "f-a-out", card_id: "cartao-a", competencia: "2026-10-01", data_fechamento: "2026-10-10", data_vencimento: "2026-10-18", pago_em: "2026-10-18", total_atual: 100 },
  { id: "f-a-nov", card_id: "cartao-a", competencia: "2026-11-01", data_fechamento: "2026-11-10", data_vencimento: "2026-11-18", pago_em: null, total_atual: 220 },
  { id: "f-a-dez", card_id: "cartao-a", competencia: "2026-12-01", data_fechamento: "2026-12-10", data_vencimento: "2026-12-18", pago_em: null, total_atual: 40 },
  { id: "f-b-nov", card_id: "cartao-b", competencia: "2026-11-01", data_fechamento: "2026-11-15", data_vencimento: "2026-11-25", pago_em: null, total_atual: 70 },
];

const INST: DashInstallmentItem[] = [
  { id: "i1", statement_id: "f-a-nov", valor: 50, status: "ativa", parent: { category: CAT_C } },
  { id: "i2", statement_id: "f-a-dez", valor: 40, status: "ativa", parent: { category: CAT_C } },
];

const RECS: DashReceivable[] = [
  // À vista (T1), Pessoa A.
  { transaction_id: "t1", statement_id: null, installment_id: null, valor: 40, status: "pendente", recebido: 0, ref_month: MES },
  // Compra do Cartão A (T4), Pessoa B, com 30 já recebidos.
  { transaction_id: "t4", statement_id: "f-a-nov", installment_id: null, valor: 80, status: "pendente", recebido: 30, ref_month: MES },
  // Parcela I1 do Cartão A, Pessoa A.
  { transaction_id: null, statement_id: "f-a-nov", installment_id: "i1", valor: 20, status: "pendente", recebido: 0, ref_month: MES },
];

const CARDS: DashCard[] = [
  { id: "cartao-a", nome: "Cartão A", cor: null, limite_total: 5000, dia_fechamento: 10, dia_vencimento: 18 },
  { id: "cartao-b", nome: "Cartão B", cor: null, limite_total: 3000, dia_fechamento: 15, dia_vencimento: 25 },
];

const ENTRADAS: EntradasDoMotorDoRelatorio = {
  txs: TXS,
  sts: STS,
  recs: RECS,
  inst: INST,
  cards: CARDS,
  recorrencias: [],
  bills: [],
};

/* ───────────────────────── Só do modelo de vista do relatório (T7) ───────────────────────── */

/** Os recebíveis CRUS da leitura (com pessoa e cartão), na mesma história de `RECS`. */
const RECEBIVEIS_CRUS = [
  {
    id: "r1",
    transaction_id: "t1",
    pago_em: null,
    recebimentos: [],
    statement_id: null,
    installment_id: null,
    valor: 40,
    status: "pendente",
    statement: null,
    transaction: { purchase_date: "2026-11-02" },
    person_id: "pessoa-a",
    card_id: null,
    person: { id: "pessoa-a", nome: "Pessoa A" },
  },
  {
    id: "r2",
    transaction_id: "t4",
    pago_em: null,
    recebimentos: [{ valor: 30, recebido_em: "2026-11-03" }],
    statement_id: "f-a-nov",
    installment_id: null,
    valor: 80,
    status: "pendente",
    statement: { competencia: "2026-11-01" },
    transaction: { purchase_date: "2026-11-03" },
    person_id: "pessoa-b",
    card_id: "cartao-a",
    person: { id: "pessoa-b", nome: "Pessoa B" },
  },
  {
    id: "r3",
    transaction_id: null,
    pago_em: null,
    recebimentos: [],
    statement_id: "f-a-nov",
    installment_id: "i1",
    valor: 20,
    status: "pendente",
    statement: { competencia: "2026-11-01" },
    transaction: null,
    person_id: "pessoa-a",
    card_id: "cartao-a",
    person: { id: "pessoa-a", nome: "Pessoa A" },
  },
];

/** As contas cruas: só o que o relatório lê (id e saldo da view). */
const CONTAS = [
  { id: "conta-b", current_balance: 1000 },
  { id: "conta-c", current_balance: 250.5 },
];

/** As recorrências cruas: "assinaturas" lê descrição, valor, frequência e categoria. */
const RECORRENCIAS_CRUAS = [
  { is_active: true, type: "despesa", description: "Assinatura A", amount: 30, frequency: "mensal", category: CAT_A },
  { is_active: true, type: "despesa", description: "Assinatura B", amount: 50, frequency: "mensal", category: CAT_B },
  { is_active: true, type: "despesa", description: null, amount: 12, frequency: "anual", category: null },
  { is_active: false, type: "despesa", description: "Assinatura encerrada", amount: 99, frequency: "mensal", category: CAT_A },
  { is_active: true, type: "receita", description: "Renda fixa", amount: 500, frequency: "mensal", category: CAT_E },
] as const;

/** As opções dos `<select>`: os mesmos ids de `CONHECIDOS`, com nome. */
const OPCOES = {
  contas: [
    { id: "conta-b", nome: "Conta B" },
    { id: "conta-c", nome: "Conta C" },
  ],
  cartoes: [
    { id: "cartao-a", nome: "Cartão A" },
    { id: "cartao-b", nome: "Cartão B" },
  ],
  pessoas: [
    { id: "pessoa-a", nome: "Pessoa A" },
    { id: "pessoa-b", nome: "Pessoa B" },
  ],
  categorias: [
    { id: CAT_A.id, nome: CAT_A.name },
    { id: CAT_B.id, nome: CAT_B.name },
    { id: CAT_C.id, nome: CAT_C.name },
    { id: CAT_E.id, nome: CAT_E.name },
  ],
};

const JANELA = janelaDoRelatorio({ mesSel: MES, mesAtual: mesDe(HOJE) });
const cent = reaisParaCentavos;

const MINHA = {
  entradas: 2900,
  saidas: 1100.5,
  saidasBrutas: 1400.75,
  terceirosNasSaidas: 300.25,
  resultado: 1799.5,
  faturasSemTotal: 0,
};

/** Um `EstadoDoCaixa` sintético `ok`, só com o que o modelo lê. */
const CAIXA_OK = {
  estado: "ok",
  graficos: {
    minha: MINHA,
    evolucao: [
      { mes: "2026-10", entradas: 10, saidas: 5, saldo: 5 },
      { mes: "2026-11", entradas: 20, saidas: 8, saldo: 12 },
    ],
    mesAMes: {
      ateODia: 5,
      dados: { anterior: { entradas: 1, saidas: 2 }, atual: { entradas: 3, saidas: 4 } },
    },
    categorias: [{ categoryId: CAT_A.id, name: CAT_A.name, color: null, movimentado: 400, meu: 300 }],
    formas: [{ paymentMethod: "pix", movimentado: 10, meu: 10 }],
    semTotal: { evolucao: [], mesAMes: [] },
  },
} as unknown as EstadoDoCaixa;

function monta(p: Partial<ParametrosDoRelatorio> = {}) {
  return montarRelatorioFinanceiro(parametros(p));
}

function parametros(p: Partial<ParametrosDoRelatorio> = {}): ParametrosDoRelatorio {
  return {
    mes: MES,
    hoje: HOJE,
    base: "competencia",
    resp: "meu",
    recorte: SEM_RECORTE,
    entradas: ENTRADAS,
    recebiveisCrus: RECEBIVEIS_CRUS,
    contas: CONTAS,
    recorrenciasCruas: RECORRENCIAS_CRUAS,
    saldoAte: 1200,
    caixa: null,
    completude: { estado: "exato" },
    janela: { evoMeses: JANELA.evoMeses, projMeses: JANELA.projMeses },
    opcoes: OPCOES,
    ...p,
  };
}

const comRecorte = (r: Partial<Recorte>): Recorte => ({ ...SEM_RECORTE, ...r });

/* ───────────────────────────── Sem recorte, em "meu": o painel ───────────────────────────── */

describe("sem recorte, em meu (o painel)", () => {
  const r = monta();
  const resumo = resumoMes({ mes: MES, transactions: TXS, statements: ENTRADAS.sts, receivables: ENTRADAS.recs });

  it("os três indicadores são o resumo do motor, em reais formatados", () => {
    expect(r.indicadores.entradas.valor).toBe(formatCurrency(resumo.entradasMeu));
    expect(r.indicadores.saidas.valor).toBe(formatCurrency(resumo.meu));
    expect(r.indicadores.quarto.valor).toBe(formatCurrency(resumo.terceiros));
  });

  it("barras === dadosDasBarras(evolucaoMensal(...), mesAtual)", () => {
    const evolucao = evolucaoMensal({
      meses: JANELA.evoMeses,
      transactions: ENTRADAS.txs,
      statements: ENTRADAS.sts,
      receivables: ENTRADAS.recs,
    });
    expect(r.barras).toEqual(dadosDasBarras(evolucao, mesDe(HOJE)));
    expect(r.seriesDasBarras).toBe("ambas");
  });

  it("nenhum bloco deixa de seguir", () => {
    for (const bloco of Object.values(r.blocos)) expect(bloco.naoSegue).toBeNull();
    expect(r.ancora).not.toBeNull();
  });

  it("o saldo é o saldo cortado em hoje, com a linha de diferença da view", () => {
    expect(r.saldo.valor).toBe(formatCurrency(1200));
    // 1.250,50 da view (todas as contas) × 1.200,00 até hoje.
    expect(r.saldo.detalheComValor).toContain(formatCurrency(50.5));
    expect(r.saldo.href).toBe("/financeiro/contas");
  });

  it("a rosca e as formas são as do motor, na minha parte", () => {
    const categorias = gastosPorCategoria({
      mes: MES,
      transactions: ENTRADAS.txs,
      statements: ENTRADAS.sts,
      installmentItems: ENTRADAS.inst,
      receivables: ENTRADAS.recs,
    });
    expect(r.rosca?.categorias.map((c) => c.valor)).toEqual(categorias.map((c) => c.meu));
    expect(r.maiores).toEqual(categorias);
    expect(r.rosca?.estornos).toBe(30);
    const formas = gastosPorForma({
      mes: MES,
      transactions: ENTRADAS.txs,
      statements: ENTRADAS.sts,
      installmentItems: ENTRADAS.inst,
      receivables: ENTRADAS.recs,
    });
    expect(r.formas.map((f) => f.valor)).toEqual(formas.map((f) => f.meu));
  });

  it("assinaturas: só despesa ativa, da maior para a menor, com o nome de reserva", () => {
    expect(r.assinaturas).toEqual([
      { nome: "Assinatura B", valor: 50, frequency: "mensal" },
      { nome: "Assinatura A", valor: 30, frequency: "mensal" },
      { nome: "Recorrência", valor: 12, frequency: "anual" },
    ]);
  });

  it("projeção e faturas futuras cobrem os meses da janela", () => {
    expect(r.projecao.map((p) => p.mes)).toEqual(JANELA.projMeses);
    expect(r.faturasFuturas).toEqual(
      faturasPorMes({
        statements: ENTRADAS.sts,
        receivables: ENTRADAS.recs,
        meses: JANELA.projMeses,
        agrupar: "vencimento",
      }),
    );
  });

  it("as setas só existem em meu e sem recorte", () => {
    expect(r.indicadores.entradas.comparacao).not.toBeNull();
    expect(monta({ resp: "consolidado" }).indicadores.saidas.comparacao?.texto).toBe(
      "sem comparação nesta responsabilidade",
    );
    expect(monta({ recorte: comRecorte({ conta: "conta-b" }) }).indicadores.saidas.comparacao?.texto).toBe(
      "sem comparação neste recorte",
    );
  });

  it("os filtros voltam como entraram, com as opções, na forma que a barra de filtros lê", () => {
    // Compila só se `RelatorioFinanceiro["filtros"]` for atribuível ao tipo da barra (T8).
    const daBarra: FiltrosDoRelatorio = r.filtros;
    expect(daBarra).toEqual({
      mes: MES,
      base: "competencia",
      resp: "meu",
      recorte: SEM_RECORTE,
      opcoes: OPCOES,
    });
  });
});

/* ───────────────────────────── Recorte de cartão ───────────────────────────── */

describe("com o recorte de cartão", () => {
  const recorte = comRecorte({ cartao: "cartao-a" });
  const r = monta({ recorte });

  it("entradas não segue (estorno de cartão não é entrada)", () => {
    expect(r.indicadores.entradas.valor).toEqual({
      naoSegue: expect.stringContaining("estorno"),
    });
    expect(r.indicadores.entradas.comparacao).toBeNull();
  });

  it("as saídas são as do motor sobre as entradas recortadas, com o cartão na linha de base", () => {
    const doCartao = recortarEntradas(ENTRADAS, recorte);
    const resumo = resumoMes({ mes: MES, transactions: doCartao.txs, statements: doCartao.sts, receivables: doCartao.recs });
    expect(r.indicadores.saidas.valor).toBe(formatCurrency(resumo.meu));
    expect(r.indicadores.saidas.valor).toBe(formatCurrency(120));
    expect(r.indicadores.saidas.linhaDeBase).toContain("Cartão A");
    expect(r.indicadores.quarto.valor).toBe(formatCurrency(100));
  });

  it("só as saídas nas barras, e a projeção não segue", () => {
    expect(r.seriesDasBarras).toBe("saidas");
    expect(r.barras.length).toBe(JANELA.evoMeses.length);
    expect(r.blocos.projecao.naoSegue).not.toBeNull();
    expect(r.projecao).toEqual([]);
  });

  it("as faturas futuras são só as do Cartão A", () => {
    const novembro = r.faturasFuturas.find((f) => f.mes === "2026-11");
    const dezembro = r.faturasFuturas.find((f) => f.mes === "2026-12");
    expect(novembro?.total).toBe(220);
    expect(dezembro?.total).toBe(40);
    expect(r.blocos.faturasFuturas.naoSegue).toBeNull();
  });

  it("forma de pagamento, saldo e mês a mês não seguem", () => {
    expect(r.blocos.formas.naoSegue?.tipo).toBe("cartao");
    expect(r.formas).toEqual([]);
    expect(r.saldo.valor).toEqual({ naoSegue: expect.any(String) });
    expect(r.saldo.detalheComValor).toBeNull();
    expect(r.blocos.mesAMes.naoSegue?.tipo).toBe("cartao");
    expect(r.mesAMes).toBeNull();
  });

  it("o pendente do cartão sai dos recebíveis crus do cartão", () => {
    const t = monta({ recorte, resp: "terceiros" });
    // Pessoa B 80 − 30 recebidos + Pessoa A 20: só o que é do Cartão A.
    expect(t.indicadores.quarto.valor).toBe(formatCurrency(70));
  });
});

/* ───────────────────────────── Recorte de categoria ───────────────────────────── */

describe("com o recorte de categoria", () => {
  const recorte = comRecorte({ categoria: CAT_A.id });
  const feito = recortarPorCategoria({ mes: MES, categoriaId: CAT_A.id, entradas: ENTRADAS });
  const fatia = feito.fatia;
  const r = monta({ recorte });

  it("Minhas saídas é a fatia meu da categoria, centavo a centavo", () => {
    expect(fatia).not.toBeNull();
    expect(r.indicadores.saidas.valor).toBe(formatCurrency(fatia?.meu ?? Number.NaN));
    expect(r.indicadores.saidas.valor).toBe(formatCurrency(250));
  });

  it("De terceiros é movimentado − meu, e o bruto avisa que estornos ficam fora", () => {
    expect(r.indicadores.quarto.valor).toBe(formatCurrency(120));
    const c = monta({ recorte, resp: "consolidado" });
    expect(c.indicadores.saidas.valor).toBe(formatCurrency(370));
    expect(c.indicadores.saidas.linhaDeBase).toContain("antes dos estornos do cartão");
    // A linha "minha · de terceiros" da responsabilidade continua lá.
    expect(c.indicadores.saidas.detalheComValor).toContain(formatCurrency(250));
  });

  it("as entradas são as receitas da categoria", () => {
    const e = monta({ recorte: comRecorte({ categoria: CAT_E.id }) });
    expect(e.indicadores.entradas.valor).toBe(formatCurrency(3000));
  });

  it("barras, mês a mês e o quadro meu × bruto × terceiros NÃO seguem (L4)", () => {
    expect(r.blocos.barras.naoSegue?.tipo).toBe("categoria");
    expect(r.blocos.mesAMes.naoSegue?.tipo).toBe("categoria");
    expect(r.blocos.ancora.naoSegue?.tipo).toBe("categoria");
    expect(r.blocos.rosca.naoSegue?.tipo).toBe("categoria");
    expect(r.ancora).toBeNull();
    expect(r.barras).toEqual([]);
    expect(r.mesAMes).toBeNull();
    expect(r.rosca).toBeNull();
  });

  it("formas, maiores e assinaturas seguem a categoria", () => {
    expect(r.formas.map((f) => [f.paymentMethod, f.movimentado, f.meu])).toEqual(
      feito.formas.map((f) => [f.paymentMethod, f.movimentado, f.meu]),
    );
    expect(r.maiores).toEqual([fatia]);
    expect(r.assinaturas).toEqual([{ nome: "Assinatura A", valor: 30, frequency: "mensal" }]);
  });

  it("categoria sem nenhum gasto no mês: R$ 0,00 como zero MEDIDO, e nada vira não segue (Review Focus 2)", () => {
    const vazia = monta({ recorte: comRecorte({ categoria: "cat-sem-gasto" }) });
    expect(vazia.indicadores.saidas.valor).toBe(formatCurrency(0));
    expect(vazia.indicadores.quarto.valor).toBe(formatCurrency(0));
    expect(vazia.indicadores.entradas.valor).toBe(formatCurrency(0));
    expect(vazia.maiores).toEqual([]);
    expect(vazia.formas).toEqual([]);
    expect(vazia.blocos.formas.naoSegue).toBeNull();
    expect(vazia.blocos.maiores.naoSegue).toBeNull();
  });

  it("cartão + categoria (D-A2-24): a fatia só tem itens daquele cartão", () => {
    const junto = monta({ recorte: comRecorte({ cartao: "cartao-a", categoria: CAT_A.id }) });
    expect(junto.indicadores.saidas.valor).toBe(formatCurrency(120));
    // As entradas: o cartão não segue, e a categoria não as faz voltar.
    expect(junto.indicadores.entradas.valor).toEqual({ naoSegue: expect.any(String) });
  });
});

/* ───────────────────────────── Recorte de pessoa ───────────────────────────── */

describe("com o recorte de pessoa (L5)", () => {
  const recorte = comRecorte({ pessoa: "pessoa-a" });
  const daPessoa = aReceberPorPessoa(RECEBIVEIS_CRUS, HOJE).find((x) => x.pessoaId === "pessoa-a");

  it("a linha da pessoa existe e vale 60 (conferência da fixture)", () => {
    expect(daPessoa?.pendente).toBe(60);
  });

  it.each<Responsabilidade>(["meu", "terceiros", "consolidado"])(
    "em %s, entradas e saídas não seguem e o quarto é o pendente dela",
    (resp) => {
      const r = monta({ recorte, resp });
      expect(r.indicadores.entradas.valor).toEqual({ naoSegue: expect.any(String) });
      expect(r.indicadores.saidas.valor).toEqual({ naoSegue: expect.any(String) });
      expect(r.indicadores.quarto.valor).toBe(formatCurrency(daPessoa?.pendente ?? Number.NaN));
      expect(r.indicadores.quarto.rotulo).toMatch(/^Pendente de terceiros até 05\/11$/);
      expect(r.indicadores.quarto.detalheComValor).toContain(formatCurrency(60));
    },
  );

  it("todo o resto não segue, e nenhum dado fica no lugar", () => {
    const r = monta({ recorte });
    for (const bloco of Object.values(r.blocos)) expect(bloco.naoSegue?.tipo).toBe("pessoa");
    expect(r.ancora).toBeNull();
    expect(r.rosca).toBeNull();
    expect(r.formas).toEqual([]);
  });
});

/* ───────────────────────────── Recorte de conta e o saldo ───────────────────────────── */

describe("com o recorte de conta", () => {
  const recorte = comRecorte({ conta: "conta-b" });

  it("o saldo é o da conta: saldoAte vem do chamador, e a view é a da conta", () => {
    const r = monta({ recorte, saldoAte: 900 });
    expect(r.saldo.valor).toBe(formatCurrency(900));
    // A view da Conta B diz 1.000,00: a diferença é de 100,00 (não a das contas somadas).
    expect(r.saldo.detalheComValor).toContain(formatCurrency(100));
    expect(r.saldo.rotulo).toContain("Saldo da conta");
    expect(r.saldo.linhaDeBase).toContain("Conta B");
  });

  it("lerSaldoAte leva a conta do recorte à rpc (D-A2-12), e sem conta continua somando todas", async () => {
    rpcs.length = 0;
    expect(await lerSaldoAte("2026-11-06", "conta-b")).toBe(900.5);
    expect(await lerSaldoAte("2026-11-06")).toBe(900.5);
    expect(rpcs).toEqual([
      { nome: "account_balance_before", args: { p_account_id: "conta-b", p_date: "2026-11-06" } },
      { nome: "account_balance_before", args: { p_account_id: null, p_date: "2026-11-06" } },
    ]);
  });

  it("saldoAte null: Não foi possível ler o saldo, sem linha de diferença, nunca R$ 0,00 (Review Focus 5)", () => {
    const r = monta({ recorte, saldoAte: null });
    expect(r.saldo.valor).toEqual({ erro: "Não foi possível ler o saldo" });
    expect(r.saldo.detalheComValor).toBeNull();
  });

  it("sem recorte, saldoAte null também é erro, e nunca zero", () => {
    const r = monta({ saldoAte: null });
    expect(r.saldo.valor).toEqual({ erro: "Não foi possível ler o saldo" });
    expect(r.saldo.detalheComValor).toBeNull();
  });

  it("as saídas são só o à vista da conta, e o cartão não sai de conta", () => {
    const r = monta({ recorte });
    expect(r.indicadores.saidas.valor).toBe(formatCurrency(60));
    expect(r.indicadores.saidas.linhaDeBase).toContain("o cartão não sai de conta");
    expect(r.indicadores.entradas.valor).toBe(formatCurrency(3000));
  });

  it("o pendente, as assinaturas e as faturas futuras não seguem a conta", () => {
    const r = monta({ recorte, resp: "terceiros" });
    expect(r.indicadores.quarto.valor).toEqual({ naoSegue: expect.any(String) });
    expect(r.blocos.assinaturas.naoSegue?.tipo).toBe("conta");
    expect(r.assinaturas).toEqual([]);
    expect(r.blocos.faturasFuturas.naoSegue?.tipo).toBe("conta");
    expect(r.faturasFuturas).toEqual([]);
  });

  it("barras, mês a mês, rosca, formas e o quadro seguem a conta", () => {
    const r = monta({ recorte });
    for (const b of ["barras", "mesAMes", "rosca", "formas", "ancora", "maiores"] as const) {
      expect(r.blocos[b].naoSegue, b).toBeNull();
    }
    expect(r.ancora?.meu).toBe(60);
    expect(r.ancora?.bruto).toBe(100);
  });
});

/* ───────────────────────────── Parcial com recorte (Review Focus 4) ───────────────────────────── */

describe("a completude chega intacta, com qualquer recorte", () => {
  const parcial = { estado: "parcial", motivos: ["A leitura de lançamentos trouxe 5000 registros e havia mais."] } as const;
  it.each([
    ["sem recorte", SEM_RECORTE],
    ["cartão", comRecorte({ cartao: "cartao-a" })],
    ["conta", comRecorte({ conta: "conta-b" })],
    ["pessoa", comRecorte({ pessoa: "pessoa-a" })],
    ["categoria", comRecorte({ categoria: CAT_A.id })],
  ])("%s", (_nome, recorte) => {
    expect(monta({ recorte, completude: parcial }).completude).toEqual(parcial);
  });
});

/* ───────────────────────────── Responsabilidade ───────────────────────────── */

describe("consolidado e terceiros", () => {
  it("consolidado: o valor da rosca é movimentado, com o bruto como número", () => {
    const r = monta({ resp: "consolidado" });
    expect(r.rosca).not.toBeNull();
    for (const c of r.rosca?.categorias ?? []) expect(c.valor).toBe(c.movimentado);
    const resumo = resumoMes({ mes: MES, transactions: TXS, statements: ENTRADAS.sts, receivables: ENTRADAS.recs });
    expect(r.indicadores.saidas.valor).toBe(formatCurrency(resumo.saidas));
    expect(r.indicadores.entradas.valor).toBe(formatCurrency(resumo.entradas));
  });

  it("terceiros: formas em movimentado − meu, em centavos", () => {
    const r = monta({ resp: "terceiros" });
    expect(r.formas.length).toBeGreaterThan(0);
    for (const f of r.formas) expect(cent(f.valor)).toBe(cent(f.movimentado) - cent(f.meu));
    for (const c of r.rosca?.categorias ?? []) expect(cent(c.valor)).toBe(cent(c.movimentado) - cent(c.meu));
  });

  it("consolidado: nenhum texto rotula o bruto como gasto meu", () => {
    const r = monta({ resp: "consolidado" });
    const textos = JSON.stringify([r.indicadores, r.saldo]);
    expect(textos.toLowerCase()).not.toContain("meu gasto");
    expect(r.indicadores.saidas.rotulo).toBe("Saídas (bruto)");
  });

  it("estornos da rosca só existem em meu", () => {
    expect(monta({ resp: "meu" }).rosca?.estornos).toBe(30);
    expect(monta({ resp: "consolidado" }).rosca?.estornos).toBe(0);
  });

  it("R2: terceiros e consolidado avisam que a rosca está antes dos estornos; meu não (já os mostra)", () => {
    for (const resp of ["terceiros", "consolidado"] as const) {
      const nota = monta({ resp }).rosca?.nota;
      expect(nota, resp).toEqual(expect.stringContaining("antes dos estornos do cartão"));
    }
    expect(monta({ resp: "meu" }).rosca?.nota).toBeNull();
  });

  it("R2: a rosca do caixa não leva nota (o estorno nem existe na leitura do caixa)", () => {
    expect(monta({ base: "caixa", caixa: CAIXA_OK }).rosca?.nota).toBeNull();
  });

  it("R2: com a categoria, saídas avisam 'antes dos estornos do cartão' em QUALQUER responsabilidade", () => {
    for (const resp of ["meu", "terceiros", "consolidado"] as const) {
      const r = monta({ recorte: comRecorte({ categoria: CAT_A.id }), resp });
      expect(r.indicadores.saidas.linhaDeBase, resp).toContain("antes dos estornos do cartão");
    }
  });

  it("R2: nenhum texto do modelo diz que o estorno 'não tem categoria'", () => {
    for (const resp of ["meu", "terceiros", "consolidado"] as const) {
      for (const recorte of [SEM_RECORTE, comRecorte({ categoria: CAT_A.id })]) {
        expect(JSON.stringify(monta({ resp, recorte })), resp).not.toContain("não têm categoria");
      }
    }
  });
});

/* ───────────────────────────── Base caixa ───────────────────────────── */

describe("base caixa", () => {
  const caixa = (p: Partial<ParametrosDoRelatorio> = {}) => monta({ base: "caixa", caixa: CAIXA_OK, ...p });

  it("sem recorte, em meu: os gráficos e os indicadores são os de graficos", () => {
    const r = caixa();
    expect(r.indicadores.entradas.valor).toBe(formatCurrency(MINHA.entradas));
    expect(r.indicadores.saidas.valor).toBe(formatCurrency(MINHA.saidas));
    expect(r.indicadores.quarto.valor).toBe(formatCurrency(MINHA.terceirosNasSaidas));
    expect(r.barras.map((b) => b.mes)).toEqual(["2026-10", "2026-11"]);
    expect(r.rosca?.categorias.map((c) => c.valor)).toEqual([300]);
    expect(r.formas.map((f) => f.valor)).toEqual([10]);
    expect(r.mesAMes).toEqual({
      anterior: { entradas: 1, saidas: 2 },
      atual: { entradas: 3, saidas: 4 },
    });
    expect(r.ancora).toMatchObject({ meu: MINHA.saidas, bruto: MINHA.saidasBrutas, terceiros: MINHA.terceirosNasSaidas });
    expect(r.caixa).toBe(CAIXA_OK);
  });

  it("com qualquer recorte, todo bloco que vem do caixa é não segue e nenhum número aparece (D-A2-6)", () => {
    const r = caixa({ recorte: comRecorte({ cartao: "cartao-a" }) });
    for (const bloco of ["barras", "mesAMes", "rosca", "formas", "ancora", "maiores"] as const) {
      expect(r.blocos[bloco].naoSegue?.motivo, bloco).toContain("caixa");
    }
    expect(r.indicadores.saidas.valor).toEqual({ naoSegue: expect.any(String) });
    expect(r.barras).toEqual([]);
    expect(r.rosca).toBeNull();
    expect(r.ancora).toBeNull();
  });

  it("R6: saldo, pendente, assinaturas, projeção e faturas futuras seguem a MESMA matriz da competência", () => {
    // Conta: o saldo é o DAQUELA conta (saldoAte), mesmo na base caixa.
    const contaNoCaixa = caixa({ recorte: comRecorte({ conta: "conta-b" }), saldoAte: 900 });
    expect(contaNoCaixa.blocos.assinaturas.naoSegue?.tipo).toBe("conta");
    expect(contaNoCaixa.saldo.valor).toBe(formatCurrency(900));
    expect(contaNoCaixa.saldo.rotulo).toContain("Saldo da conta");

    // Cartão: as faturas futuras são as do cartão (e a matriz da competência manda ✓).
    const cartaoNoCaixa = caixa({ recorte: comRecorte({ cartao: "cartao-a" }) });
    expect(cartaoNoCaixa.blocos.faturasFuturas.naoSegue).toBeNull();
    expect(cartaoNoCaixa.faturasFuturas).toEqual(
      monta({ recorte: comRecorte({ cartao: "cartao-a" }) }).faturasFuturas,
    );

    // Categoria: as assinaturas seguem a categoria, nas duas bases.
    const categoriaNoCaixa = caixa({ recorte: comRecorte({ categoria: CAT_A.id }) });
    expect(categoriaNoCaixa.blocos.assinaturas.naoSegue).toBeNull();
    expect(categoriaNoCaixa.assinaturas).toEqual(
      monta({ recorte: comRecorte({ categoria: CAT_A.id }) }).assinaturas,
    );

    // A projeção nunca segue recorte, em nenhuma base.
    expect(contaNoCaixa.blocos.projecao.naoSegue?.motivo).toContain("projeção");
    expect(contaNoCaixa.blocos.projecao.naoSegue?.motivo).not.toContain("caixa");
  });

  it("R6: pessoa na base caixa — o quarto indicador é o pendente DELA, não um número de caixa", () => {
    for (const resp of ["meu", "terceiros", "consolidado"] as const) {
      const recorte = comRecorte({ pessoa: "pessoa-a" });
      const r = caixa({ recorte, resp });
      expect(naoSegue("pendente", recorte, "caixa"), resp).toBeNull();
      expect(r.indicadores.quarto.valor, resp).toBe(formatCurrency(60));
      expect(r.indicadores.quarto.rotulo, resp).toMatch(/^Pendente de terceiros/);
    }
  });

  it("em terceiros e consolidado, evolução, rosca e formas não seguem a responsabilidade (D-A2-21)", () => {
    for (const resp of ["terceiros", "consolidado"] as const) {
      const r = caixa({ resp });
      expect(r.barras, resp).toEqual([]);
      expect(r.rosca, resp).toBeNull();
      expect(r.formas, resp).toEqual([]);
      expect(r.blocos.barras.naoSegueResp, resp).toEqual(expect.stringContaining("responsabilidade"));
      expect(r.blocos.rosca.naoSegueResp, resp).not.toBeNull();
      expect(r.blocos.formas.naoSegueResp, resp).not.toBeNull();
    }
    // Em meu, nada disso aparece.
    const meu = caixa();
    expect(meu.blocos.barras.naoSegueResp).toBeNull();
  });

  it("caixa com erro: os três indicadores dizem que não leram, e os gráficos ficam vazios", () => {
    const r = monta({ base: "caixa", caixa: { estado: "erro" } });
    for (const ind of Object.values(r.indicadores)) {
      expect(ind.valor).toEqual({ erro: expect.stringContaining("caixa") });
    }
    expect(r.barras).toEqual([]);
    expect(r.rosca).toBeNull();
    expect(r.ancora).toBeNull();
    expect(r.mesAMes).toBeNull();
  });

  it("caixa não informado na base caixa vale o erro, nunca zero", () => {
    const r = monta({ base: "caixa", caixa: null });
    expect(r.indicadores.saidas.valor).toEqual({ erro: expect.any(String) });
  });
});

/* ───────────────────────────── O ✗ nunca leva número ───────────────────────────── */

type Dado = (r: ReturnType<typeof monta>) => unknown;
/** Para cada bloco do modelo, onde mora o dado dele. */
const DADO_DO_BLOCO: Record<keyof ReturnType<typeof monta>["blocos"], Dado> = {
  barras: (r) => r.barras,
  mesAMes: (r) => r.mesAMes,
  rosca: (r) => r.rosca,
  formas: (r) => r.formas,
  ancora: (r) => r.ancora,
  maiores: (r) => r.maiores,
  assinaturas: (r) => r.assinaturas,
  projecao: (r) => r.projecao,
  faturasFuturas: (r) => r.faturasFuturas,
};

const vazio = (v: unknown): boolean => v === null || (Array.isArray(v) && v.length === 0);

/** O bloco de INDICADOR que governa cada um dos três cards, por responsabilidade (a mesma regra do modelo). */
const INDICADOR_GOVERNADO_POR: Record<Responsabilidade, Record<"entradas" | "saidas" | "quarto", BlocoDoRelatorio>> = {
  meu: { entradas: "entradas", saidas: "saidas", quarto: "terceiros" },
  terceiros: { entradas: "entradas", saidas: "terceiros", quarto: "pendente" },
  consolidado: { entradas: "entradas", saidas: "saidas", quarto: "pendente" },
};

describe("nenhum número onde o bloco é ✗ (varredura)", () => {
  const recortes: [string, Recorte][] = [
    ["cartão", comRecorte({ cartao: "cartao-a" })],
    ["conta", comRecorte({ conta: "conta-b" })],
    ["pessoa", comRecorte({ pessoa: "pessoa-a" })],
    ["categoria", comRecorte({ categoria: CAT_A.id })],
    ["cartão + categoria", comRecorte({ cartao: "cartao-a", categoria: CAT_A.id })],
    ["conta + pessoa", comRecorte({ conta: "conta-b", pessoa: "pessoa-a" })],
    ["categoria + pessoa", comRecorte({ categoria: CAT_A.id, pessoa: "pessoa-a" })],
  ];
  const bases: BaseFinanceira[] = ["competencia", "caixa"];
  const resps: Responsabilidade[] = ["meu", "terceiros", "consolidado"];

  it("o dado de todo bloco ✗ é null ou vazio, em todas as combinações", () => {
    let conferidos = 0;
    for (const [nome, recorte] of recortes) {
      for (const base of bases) {
        for (const resp of resps) {
          const r = monta({ recorte, base, resp, caixa: base === "caixa" ? CAIXA_OK : null });
          for (const [bloco, dado] of Object.entries(DADO_DO_BLOCO)) {
            const celula = r.blocos[bloco as keyof typeof r.blocos];
            if (celula.naoSegue === null) continue;
            conferidos++;
            expect(vazio(dado(r)), `${nome} · ${base} · ${resp} · ${bloco}`).toBe(true);
          }
        }
      }
    }
    // Guarda anti-tautologia: a varredura de fato encontrou blocos ✗.
    expect(conferidos).toBeGreaterThan(100);
  });

  it("todo indicador governado por bloco ✗ vale { naoSegue } e não leva comparação nem detalhe com dinheiro", () => {
    let conferidos = 0;
    for (const [nome, recorte] of recortes) {
      for (const base of bases) {
        for (const resp of resps) {
          const r = monta({ recorte, base, resp, caixa: base === "caixa" ? CAIXA_OK : null });
          for (const chave of ["entradas", "saidas", "quarto"] as const) {
            // Com pessoa, o quarto É o pendente dela, em qualquer responsabilidade (L5).
            const governador: BlocoDoRelatorio =
              chave === "quarto" && recorte.pessoa !== null ? "pendente" : INDICADOR_GOVERNADO_POR[resp][chave];
            if (naoSegue(governador, recorte, base) === null) continue;
            conferidos++;
            const ind = r.indicadores[chave];
            expect(ind.valor, `${nome} · ${base} · ${resp} · ${chave}`).toEqual({ naoSegue: expect.any(String) });
            expect(ind.detalheComValor).toBeNull();
            expect(ind.comparacao).toBeNull();
          }
        }
      }
    }
    expect(conferidos).toBeGreaterThan(50);
  });

  it("o saldo que não segue não leva número nem diferença", () => {
    for (const recorte of [comRecorte({ cartao: "cartao-a" }), comRecorte({ pessoa: "pessoa-a" }), comRecorte({ categoria: CAT_A.id })]) {
      const r = monta({ recorte });
      expect(r.saldo.valor).toEqual({ naoSegue: expect.any(String) });
      expect(r.saldo.detalheComValor).toBeNull();
    }
  });
});

/* ───────────────────────────── 04-B: a gaveta de registros do relatório ───────────────────────────── */

/**
 * Os registros que cada número do relatório abre têm de vir com os MESMOS recortes, base e
 * responsabilidade da tela (D-B-11, D-B-7). Os DOIS LADOS da conciliação não vêm da mesma função:
 *  - o número é o texto do indicador de `montarRelatorioFinanceiro` (ou o campo `ancora`/`projecao`),
 *    convertido em centavos aqui, no teste;
 *  - os registros são `detalheDoRelatorio`, somados num laço do teste, na coluna da parte.
 * E os dois ainda são comparados a um LITERAL contado à mão.
 */

const SP = { mes: MES };

function paramsDaGaveta(
  pedido: PedidoDeDetalhe | null,
  p: Partial<ParametrosDoRelatorio> = {},
  extra: { caixaParaDetalhe?: "erro" | null; saldos?: null } = {},
) {
  const base = parametros(p);
  return {
    ...base,
    relatorio: montarRelatorioFinanceiro(base),
    pedido,
    sp: SP,
    caixaParaDetalhe: extra.caixaParaDetalhe ?? null,
    saldos: extra.saldos ?? null,
  };
}

const detalheDe = (pedido: PedidoDeDetalhe, p: Partial<ParametrosDoRelatorio> = {}) =>
  detalheDoRelatorio(paramsDaGaveta(pedido, p));
const gavetaDe = (pedido: PedidoDeDetalhe | null, p: Partial<ParametrosDoRelatorio> = {}, extra = {}) =>
  gavetaDoRelatorio(paramsDaGaveta(pedido, p, extra));

/** O texto de moeda ("R$ 1.234,56", com NBSP e sinal) em centavos — conta do teste, não do código. */
function emCentavos(texto: string): number {
  const digitos = texto.replace(/[^\d,]/g, "").replace(",", "");
  return (texto.includes("-") ? -1 : 1) * Number(digitos);
}

/** Σ da coluna da parte sobre TODOS os registros do detalhe — um laço do teste, em centavos. */
function somaDosRegistros(pedido: PedidoDeDetalhe, p: Partial<ParametrosDoRelatorio> = {}): number {
  const d = detalheDe(pedido, p);
  if (d === null || d.estado !== "ok") throw new Error(`detalhe ${pedido.chave} não está ok: ${d?.estado}`);
  const coluna = colunaDaParte(d.parte);
  let total = 0;
  for (const g of d.grupos) for (const r of g.registros) total = total + r[coluna];
  expect(d.diferencaCent, `${pedido.chave}: a soma dos registros fecha com o total do motor`).toBe(0);
  expect(d.somaCent).toBe(total);
  return total;
}

const SAIDAS_MEU: PedidoDeDetalhe = { chave: "saidas", parte: "meu", alvo: null };

describe("a gaveta do relatório concilia com o número, com os mesmos recortes (04-B, D-B-11)", () => {
  const casos: [string, Partial<ParametrosDoRelatorio>, number | null][] = [
    // O literal à mão: Cartão A = T4 meu 120 + parcela 50 (terceiros 20 → meu 30) − estorno 30.
    ["cartão", { recorte: comRecorte({ cartao: "cartao-a" }) }, 12000],
    // Conta B: só T1 (100, meu 60).
    ["conta", { recorte: comRecorte({ conta: "conta-b" }) }, 6000],
    // Categoria A (antes dos estornos): T1 60 + T4 120 + T11 70.
    ["categoria", { recorte: comRecorte({ categoria: CAT_A.id }) }, 25000],
    ["cartão + categoria", { recorte: comRecorte({ cartao: "cartao-a", categoria: CAT_A.id }) }, 12000],
    ["sem recorte", {}, null],
  ];

  it.each(casos)("Σ dos registros de 'saidas' (%s) === o indicador 'Minhas saídas'", (_nome, p, literal) => {
    const indicador = monta(p).indicadores.saidas.valor;
    expect(typeof indicador).toBe("string");
    const doNumero = emCentavos(indicador as string);
    expect(somaDosRegistros(SAIDAS_MEU, p)).toBe(doNumero);
    if (literal !== null) expect(doNumero).toBe(literal);
  });

  it("as três partes do quadro âncora (meu, terceiros, bruto) fecham com os campos de `ancora`, no cartão", () => {
    const p = { recorte: comRecorte({ cartao: "cartao-a" }) };
    const ancora = monta(p).ancora;
    expect(ancora).not.toBeNull();
    expect(somaDosRegistros({ chave: "saidas", parte: "meu", alvo: null }, p)).toBe(cent(ancora?.meu ?? Number.NaN));
    expect(somaDosRegistros({ chave: "saidas", parte: "terceiros", alvo: null }, p)).toBe(
      cent(ancora?.terceiros ?? Number.NaN),
    );
    expect(somaDosRegistros({ chave: "saidas", parte: "bruto", alvo: null }, p)).toBe(
      cent(ancora?.bruto ?? Number.NaN),
    );
    // Literais à mão: fatura 220 (bruto), terceiros 80 + 20, meu 120.
    expect(cent(ancora?.bruto ?? Number.NaN)).toBe(22000);
    expect(cent(ancora?.terceiros ?? Number.NaN)).toBe(10000);
  });

  it("o pendente (até hoje) fecha com o quarto indicador, em Terceiros", () => {
    const p = { resp: "terceiros" as const };
    const quarto = monta(p).indicadores.quarto.valor;
    expect(somaDosRegistros({ chave: "pendente", parte: "meu", alvo: null }, p)).toBe(emCentavos(quarto as string));
    // Literal: T1 Pessoa A 40 + T4 Pessoa B (80 − 30 recebidos) + parcela Pessoa A 20.
    expect(emCentavos(quarto as string)).toBe(11000);
  });

  it("o pendente com o recorte de pessoa fecha com o pendente DELA", () => {
    const p = { recorte: comRecorte({ pessoa: "pessoa-a" }) };
    const quarto = monta(p).indicadores.quarto.valor;
    expect(somaDosRegistros({ chave: "pendente", parte: "meu", alvo: null }, p)).toBe(emCentavos(quarto as string));
    expect(emCentavos(quarto as string)).toBe(6000);
  });

  it("o 'referente ao mês' do quadro âncora fecha com a lista de pendente-do-mes, no cartão", () => {
    const p = { recorte: comRecorte({ cartao: "cartao-a" }) };
    const ancora = monta(p).ancora;
    expect(ancora?.pendenteDoMes).not.toBeNull();
    expect(somaDosRegistros({ chave: "pendente-do-mes", parte: "meu", alvo: null }, p)).toBe(
      cent(ancora?.pendenteDoMes ?? Number.NaN),
    );
  });

  it("pendente-do-mes com o recorte de pessoa: o total é o DELA, o mesmo da lista (revisão final, achado 1)", () => {
    // Sem link na tela (o quadro âncora não segue a pessoa), mas a URL compartilhada chega aqui.
    const p = { recorte: comRecorte({ pessoa: "pessoa-a" }) };
    // Literal: r1 Pessoa A 40 + r3 Pessoa A 20, ambos de novembro.
    expect(somaDosRegistros({ chave: "pendente-do-mes", parte: "meu", alvo: null }, p)).toBe(6000);
  });

  it("as entradas da conta fecham com 'Minhas entradas' (conta e categoria)", () => {
    for (const p of [{ recorte: comRecorte({ conta: "conta-b" }) }, { recorte: comRecorte({ categoria: CAT_E.id }) }]) {
      const indicador = monta(p).indicadores.entradas.valor as string;
      expect(somaDosRegistros({ chave: "entradas", parte: "meu", alvo: null }, p)).toBe(emCentavos(indicador));
    }
    // Literal: a receita de 3.000 é toda minha.
    expect(somaDosRegistros({ chave: "entradas", parte: "meu", alvo: null }, {})).toBe(300000);
  });

  it("a projeção de um mês fecha com o ponto do modelo (minha parte)", () => {
    const ponto = monta().projecao[0];
    expect(ponto).toBeDefined();
    expect(somaDosRegistros({ chave: "projecao", parte: "meu", alvo: ponto.mes })).toBe(Math.round(ponto.total * 100));
  });

  it("a fatia de uma categoria fecha com a fatia da rosca (Terceiros) e a forma, com a da lista de formas", () => {
    const r = monta({ resp: "terceiros" });
    const fatia = r.rosca?.categorias.find((c) => c.categoryId === CAT_A.id);
    expect(fatia).toBeDefined();
    expect(
      somaDosRegistros({ chave: "categoria", parte: "terceiros", alvo: CAT_A.id }, { resp: "terceiros" }),
    ).toBe(cent(fatia?.valor ?? Number.NaN));
    const forma = r.formas.find((f) => f.paymentMethod === "cartao_credito");
    expect(forma).toBeDefined();
    expect(
      somaDosRegistros({ chave: "forma", parte: "terceiros", alvo: "cartao_credito" }, { resp: "terceiros" }),
    ).toBe(cent(forma?.valor ?? Number.NaN));
  });
});

describe("a gaveta do relatório: o que abre e o que não abre (04-B)", () => {
  const chaves = (p: Partial<ParametrosDoRelatorio> = {}) => Object.keys(gavetaDe(null, p).hrefs).sort();

  it("sem recorte, em meu: os números do relatório abrem, cada um com o seu endereço", () => {
    const { hrefs } = gavetaDe(null);
    for (const k of ["saldo", "entradas", "saidas", "meu", "terceiros", "bruto", "pendente", "pendente-do-mes"]) {
      expect(hrefs[k], k).toBeDefined();
    }
    expect(hrefs.saidas).toBe("/relatorios?mes=2026-11&detalhe=saidas");
    expect(hrefs.terceiros).toBe("/relatorios?mes=2026-11&detalhe=saidas&parte=terceiros");
    expect(hrefs["categoria:cat-a"]).toBe("/relatorios?mes=2026-11&detalhe=categoria&alvo=cat-a");
    expect(hrefs["forma:pix"]).toBe("/relatorios?mes=2026-11&detalhe=forma&alvo=pix");
    expect(hrefs["projecao:2026-12"]).toBe("/relatorios?mes=2026-11&detalhe=projecao&alvo=2026-12");
  });

  it("o relatório não tem 'contas' nem 'cartão', e 'Faturas dos próximos meses' não abre (sem id de fatura)", () => {
    for (const k of chaves()) {
      expect(k.startsWith("fatura"), k).toBe(false);
      expect(k.startsWith("contas"), k).toBe(false);
      expect(k.startsWith("cartao"), k).toBe(false);
    }
  });

  it("com o recorte de pessoa, SÓ o pendente abre", () => {
    expect(chaves({ recorte: comRecorte({ pessoa: "pessoa-a" }) })).toEqual(["pendente"]);
  });

  it("recorte de cartão: abre saídas, quadro âncora e pendente; não abre entradas, saldo nem projeção", () => {
    const k = chaves({ recorte: comRecorte({ cartao: "cartao-a" }) });
    expect(k).toContain("saidas");
    expect(k).toContain("pendente");
    for (const fora of ["entradas", "saldo"]) expect(k, fora).not.toContain(fora);
    expect(k.some((c) => c.startsWith("projecao:"))).toBe(false);
    expect(k.some((c) => c.startsWith("forma:"))).toBe(false);
  });

  it("recorte de conta: o saldo abre; o pendente não (o recebível não sabe a conta)", () => {
    const k = chaves({ recorte: comRecorte({ conta: "conta-b" }) });
    expect(k).toContain("saldo");
    expect(k).not.toContain("pendente");
  });

  it("recorte de categoria: abre a própria categoria e as saídas; as formas ficam (✓), o saldo e a projeção não", () => {
    const k = chaves({ recorte: comRecorte({ categoria: CAT_A.id }) });
    expect(k).toContain("categoria:cat-a");
    expect(k).toContain("saidas");
    expect(k).not.toContain("saldo");
    expect(k.some((c) => c.startsWith("projecao:"))).toBe(false);
  });

  it("Terceiros: o link de Entradas leva parte=terceiros; Consolidado leva parte=bruto; Meu não leva parte", () => {
    expect(gavetaDe(null, { resp: "terceiros" }).hrefs.entradas).toContain("parte=terceiros");
    expect(gavetaDe(null, { resp: "consolidado" }).hrefs.entradas).toContain("parte=bruto");
    expect(gavetaDe(null).hrefs.entradas).not.toContain("parte=");
    expect(gavetaDe(null, { resp: "terceiros" }).hrefs.saidas).toContain("parte=terceiros");
    expect(gavetaDe(null, { resp: "consolidado" }).hrefs.saidas).toContain("parte=bruto");
  });

  it("os links preservam os outros parâmetros da URL e o fechar tira só o detalhe", () => {
    const g = gavetaDoRelatorio({
      ...paramsDaGaveta({ chave: "saidas", parte: "meu", alvo: null }),
      sp: { mes: MES, cartao: "cartao-a", detalhe: "saidas" },
    });
    expect(g.urlAoFechar).toBe("/relatorios?mes=2026-11&cartao=cartao-a");
    expect(g.linkLancamentos).toBe("/financeiro/lancamentos?month=2026-11");
  });

  it("sem pedido na URL não há vista", () => {
    expect(gavetaDe(null).vista).toBeNull();
    expect(detalheDe({ chave: "saidas", parte: "meu", alvo: null })?.estado).toBe("ok");
  });

  describe("base caixa", () => {
    const caixa = { base: "caixa" as const, caixa: CAIXA_OK };

    it("sem recorte, em meu: as sete linhas do caixa abrem (e a pessoa, o cartão... nada mais muda)", () => {
      const k = chaves(caixa);
      for (const linha of ["renda", "reembolsos", "outras", "saidas", "pagamentos", "sem-destino", "entre-contas"]) {
        expect(k, linha).toContain(`caixa:${linha}`);
      }
      // Categoria e forma não são calculadas no caixa: o detalhe diria "não é calculado".
      expect(k.some((c) => c.startsWith("categoria:") || c.startsWith("forma:"))).toBe(false);
    });

    it("com o recorte de cartão: nenhum link de caixa nem de saídas, e o pedido digitado devolve 'não segue'", () => {
      const p = { ...caixa, recorte: comRecorte({ cartao: "cartao-a" }) };
      const k = chaves(p);
      expect(k.some((c) => c.startsWith("caixa:"))).toBe(false);
      for (const fora of ["saidas", "meu", "terceiros", "bruto", "entradas"]) expect(k, fora).not.toContain(fora);

      for (const pedido of [
        { chave: "saidas", parte: "meu", alvo: null },
        { chave: "caixa", parte: "meu", alvo: "renda" },
        { chave: "entradas", parte: "meu", alvo: null },
      ] as PedidoDeDetalhe[]) {
        // `caixaParaDetalhe: "erro"` prova a ORDEM: o 'não segue' vence a falha de leitura.
        const g = gavetaDe(pedido, p, { caixaParaDetalhe: "erro" });
        expect(g.vista?.estado, pedido.chave).toBe("nao-segue");
        if (g.vista?.estado === "nao-segue") {
          expect(g.vista.frase).toContain("a base caixa não se recorta nesta versão");
          expect(g.vista.hrefSemFiltro).toBe("/relatorios?mes=2026-11&base=caixa");
        }
        expect(JSON.stringify(g.vista)).not.toContain("R$");
      }
    });

    it("Terceiros e Consolidado: o caixa não traz as entradas, então elas não abrem; as saídas abrem na parte", () => {
      for (const resp of ["terceiros", "consolidado"] as const) {
        const { hrefs } = gavetaDe(null, { ...caixa, resp });
        expect(hrefs.entradas, resp).toBeUndefined();
        expect(hrefs.saidas, resp).toContain(resp === "terceiros" ? "parte=terceiros" : "parte=bruto");
        // Digitado à mão: 'não segue a responsabilidade', com a volta para Meu.
        const g = gavetaDe({ chave: "entradas", parte: "meu", alvo: null }, { ...caixa, resp }, {});
        expect(g.vista?.estado).toBe("nao-segue");
      }
    });
  });

  describe("pedido digitado à mão para um número que não segue", () => {
    it("recorte de pessoa: 'não segue', sem lista, com o caminho 'Ver sem o filtro'", () => {
      const g = gavetaDe(SAIDAS_MEU, { recorte: comRecorte({ pessoa: "pessoa-a" }) });
      expect(g.vista?.estado).toBe("nao-segue");
      if (g.vista?.estado === "nao-segue") {
        expect(g.vista.frase).toContain("pessoa");
        expect(g.vista.hrefSemFiltro).toBe("/relatorios?mes=2026-11");
      }
      expect(JSON.stringify(g.vista)).not.toContain("R$");
    });

    it("projeção com qualquer recorte, e os números que o relatório não tem (cartão, contas)", () => {
      const p = { recorte: comRecorte({ conta: "conta-b" }) };
      expect(gavetaDe({ chave: "projecao", parte: "meu", alvo: "2026-12" }, p).vista?.estado).toBe("nao-segue");
      expect(gavetaDe({ chave: "cartao", parte: "meu", alvo: null }).vista?.estado).toBe("nao-segue");
      expect(gavetaDe({ chave: "contas", parte: "meu", alvo: null }).vista?.estado).toBe("nao-segue");
    });
  });

  it("o JSON exportado não muda: o modelo não ganha chave de gaveta, detalhe nem link", () => {
    const r = monta() as unknown as Record<string, unknown>;
    for (const k of ["gaveta", "vista", "hrefs", "hrefsDoDetalhe", "detalhe"]) expect(r, k).not.toHaveProperty(k);
    expect(JSON.stringify(r)).not.toContain("detalhe=");
  });
});

/* ───────────────────────────── O arquivo não calcula nem lê relógio ───────────────────────────── */

describe("reports/financeiro.ts é puro e não soma", () => {
  const fonte = readFileSync(path.resolve(__dirname, "financeiro.ts"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  it("nenhum relógio, nenhum banco, nenhum server-only", () => {
    expect(fonte).not.toMatch(/Date\.now|new Date\(/);
    expect(fonte).not.toMatch(/server-only|@\/lib\/supabase/);
  });

  it("04-B: há UM jeito de recortar — `recortarEntradas` e `recortarRecebiveisCrus` só no helper, que o modelo e o detalhe chamam", () => {
    expect(fonte.match(/recortarEntradas\(/g)).toHaveLength(1);
    expect(fonte.match(/recortarRecebiveisCrus\(/g)).toHaveLength(1);
    expect(fonte.match(/entradasDoRecorte\(/g)?.length).toBe(3); // a definição + o modelo + o detalhe
  });

  it("nenhuma soma nova de dinheiro", () => {
    expect(fonte).not.toMatch(/\.reduce\(/);
    expect(fonte).not.toMatch(/\+=|-=/);
  });
});
