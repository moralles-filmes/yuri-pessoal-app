/**
 * REDESIGN-03-B — O pipeline do motor financeiro: equivalência e fronteira.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO PROVA — E O QUE ELE DELIBERADAMENTE NÃO PROVA.                     ║
 * ║                                                                                       ║
 * ║ NÃO prova que o motor soma certo: isso é de `dashboard.test.ts` e dos 65 casos de      ║
 * ║ `dashboard-caracterizacao.test.ts`, que a 03-B não toca.                               ║
 * ║                                                                                       ║
 * ║ PROVA duas coisas:                                                                     ║
 * ║  1. EQUIVALÊNCIA — para a mesma linha, `montarEntradas` devolve o objeto que cada um   ║
 * ║     dos quatro chamadores montava à mão. As montagens de referência abaixo foram       ║
 * ║     copiadas VERBATIM do código anterior à 03-B, antes de trocá-lo.                    ║
 * ║  2. FRONTEIRA — nenhum arquivo de `src/` fora de `pipeline.ts` monta um `Dash*`. É o   ║
 * ║     que impede um quinto pipeline de nascer, e é a parte que sobrevive a esta subfase. ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Fixture SINTÉTICA: o repositório é público. Nenhum valor, nome ou categoria real.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  gastosPorCategoria,
  gastosPorForma,
  resumoMes,
  totalAReceber,
  type DashBill,
  type DashCard,
  type DashInstallmentItem,
  type DashReceivable,
  type DashRecurrence,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";
import {
  ESCOPO_CARD_FINANCEIRO,
  ESCOPO_FATURAS,
  ESCOPO_RELATORIO,
  janelaDoCron,
  janelaDoMes,
  janelaDoRelatorio,
  montarEntradas,
  saldoDasContas,
  ultimoDiaDoMes,
  type EscopoFinanceiro,
  type LinhaRecebivel,
  type LinhaTx,
} from "@/lib/finance/pipeline";

/* ═══════════════════════════ Formas das linhas de hoje ═══════════════════════════ */

// O subconjunto das linhas de `finance/queries.ts` que as montagens liam — mais um campo que
// elas NÃO copiavam (`description`, `icon`, `itens`…), para provar que a montagem nova também
// não copia.
type Categoria = { id: string; name: string; color: string | null; icon: string | null };

type TxCompleta = {
  amount: number;
  valor_pessoal: number | null;
  type: DashTx["type"];
  payment_method: DashTx["payment_method"];
  status: DashTx["status"];
  competence_date: string;
  card_id: string | null;
  statement_id: string | null;
  parcelado: boolean;
  category_id: string | null;
  category: Categoria | null;
  description: string;
};

type FaturaCompleta = {
  id: string;
  card_id: string | null;
  competencia: string;
  data_fechamento: string;
  data_vencimento: string;
  pago_em: string | null;
  total_atual: number;
  itens: number;
};

type RecebivelCompleto = {
  statement_id: string | null;
  installment_id: string | null;
  valor: number;
  status: string;
  statement: { id: string; competencia: string; data_vencimento: string } | null;
  transaction: { id: string; description: string; purchase_date: string } | null;
};

type ParcelaCompleta = {
  id: string;
  statement_id: string | null;
  valor: number;
  status: string;
  numero: number;
  parent: { id: string; description: string; category: Omit<Categoria, "icon"> | null } | null;
};

type CartaoCompleto = {
  id: string;
  nome: string;
  cor: string | null;
  limite_total: number;
  dia_fechamento: number;
  dia_vencimento: number;
  ativo: boolean;
};

type RecorrenciaCompleta = {
  amount: number;
  type: DashRecurrence["type"];
  frequency: DashRecurrence["frequency"];
  interval_count: number;
  anchor_date: string;
  next_due_date: string;
  end_date: string | null;
  is_active: boolean;
  description: string | null;
};

type ContaFixaCompleta = {
  name: string;
  amount: number;
  due_day: number;
  is_active: boolean;
  frequency: string;
};

/* ═══════════════ Montagens de REFERÊNCIA — verbatim do código anterior à 03-B ═══════════════ */

/** A · `getFinanceCardData` (`src/lib/dashboard/queries.ts`). */
function referenciaCardFinanceiro(
  transactions: TxCompleta[],
  statements: FaturaCompleta[],
  receivables: RecebivelCompleto[],
  bills: ContaFixaCompleta[],
) {
  const txs: DashTx[] = transactions.map((t) => ({
    amount: t.amount,
    valor_pessoal: t.valor_pessoal,
    type: t.type,
    payment_method: t.payment_method,
    status: t.status,
    competence_date: t.competence_date,
    card_id: t.card_id,
    statement_id: t.statement_id,
    parcelado: t.parcelado,
    category_id: t.category_id,
    category: t.category
      ? { id: t.category.id, name: t.category.name, color: t.category.color }
      : null,
  }));
  const sts: DashStatement[] = statements.map((s) => ({
    id: s.id,
    card_id: s.card_id,
    competencia: s.competencia,
    data_fechamento: s.data_fechamento,
    data_vencimento: s.data_vencimento,
    pago_em: s.pago_em,
    total_atual: s.total_atual,
  }));
  const recs: DashReceivable[] = receivables.map((r) => ({
    statement_id: r.statement_id,
    installment_id: r.installment_id,
    valor: r.valor,
    status: r.status,
    ref_month:
      r.statement?.competencia?.slice(0, 7) ??
      r.transaction?.purchase_date?.slice(0, 7) ??
      null,
  }));
  const dashBills: DashBill[] = bills.map((b) => ({
    name: b.name,
    amount: b.amount,
    due_day: b.due_day,
    is_active: b.is_active,
  }));
  return { txs, sts, recs, bills: dashBills };
}

/** A' · `getInvoicesCardData` (`src/lib/dashboard/queries.ts`) — sem `ref_month`. */
function referenciaCardFaturas(
  cards: CartaoCompleto[],
  statements: FaturaCompleta[],
  receivables: RecebivelCompleto[],
) {
  const dashCards: DashCard[] = cards.map((c) => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor,
    limite_total: c.limite_total,
    dia_fechamento: c.dia_fechamento,
    dia_vencimento: c.dia_vencimento,
  }));
  const sts: DashStatement[] = statements.map((s) => ({
    id: s.id,
    card_id: s.card_id,
    competencia: s.competencia,
    data_fechamento: s.data_fechamento,
    data_vencimento: s.data_vencimento,
    pago_em: s.pago_em,
    total_atual: s.total_atual,
  }));
  const recs: DashReceivable[] = receivables.map((r) => ({
    statement_id: r.statement_id,
    installment_id: r.installment_id,
    valor: r.valor,
    status: r.status,
  }));
  return { cards: dashCards, sts, recs };
}

type LinhasCompletas = {
  transactions: TxCompleta[];
  statements: FaturaCompleta[];
  receivables: RecebivelCompleto[];
  installmentItems: ParcelaCompleta[];
  cards: CartaoCompleto[];
  recurrences: RecorrenciaCompleta[];
  bills: ContaFixaCompleta[];
};

/** B · `getFinanceAndCardReport` (`src/lib/reports/queries.ts`). */
function referenciaRelatorio({
  transactions,
  statements,
  receivables,
  installmentItems,
  cards,
  recurrences,
  bills,
}: LinhasCompletas) {
  const txs: DashTx[] = transactions.map((t) => ({
    amount: t.amount,
    valor_pessoal: t.valor_pessoal,
    type: t.type,
    payment_method: t.payment_method,
    status: t.status,
    competence_date: t.competence_date,
    card_id: t.card_id,
    statement_id: t.statement_id,
    parcelado: t.parcelado,
    category_id: t.category_id,
    category: t.category
      ? { id: t.category.id, name: t.category.name, color: t.category.color }
      : null,
  }));
  const sts: DashStatement[] = statements.map((s) => ({
    id: s.id,
    card_id: s.card_id,
    competencia: s.competencia,
    data_fechamento: s.data_fechamento,
    data_vencimento: s.data_vencimento,
    pago_em: s.pago_em,
    total_atual: s.total_atual,
  }));
  const recs: DashReceivable[] = receivables.map((r) => ({
    statement_id: r.statement_id,
    installment_id: r.installment_id,
    valor: r.valor,
    status: r.status,
    ref_month:
      r.statement?.competencia?.slice(0, 7) ??
      r.transaction?.purchase_date?.slice(0, 7) ??
      null,
  }));
  const inst: DashInstallmentItem[] = installmentItems.map((it) => ({
    id: it.id,
    statement_id: it.statement_id,
    valor: it.valor,
    status: it.status,
    parent: it.parent?.category
      ? {
          category: {
            id: it.parent.category.id,
            name: it.parent.category.name,
            color: it.parent.category.color,
          },
        }
      : { category: null },
  }));
  const dashCards: DashCard[] = cards.map((c) => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor,
    limite_total: c.limite_total,
    dia_fechamento: c.dia_fechamento,
    dia_vencimento: c.dia_vencimento,
  }));
  const recorrencias: DashRecurrence[] = recurrences.map((r) => ({
    amount: r.amount,
    type: r.type,
    frequency: r.frequency,
    interval_count: r.interval_count,
    anchor_date: r.anchor_date,
    next_due_date: r.next_due_date,
    end_date: r.end_date,
    is_active: r.is_active,
  }));
  const dashBills: DashBill[] = bills.map((b) => ({
    name: b.name,
    amount: b.amount,
    due_day: b.due_day,
    is_active: b.is_active,
  }));
  return { txs, sts, recs, inst, cards: dashCards, recorrencias, bills: dashBills };
}

/** C · `src/app/(app)/dashboard/financeiro/page.tsx` — a mesma cópia de B, com o `inst` em uma linha. */
function referenciaPagina({
  transactions,
  statements,
  receivables,
  installmentItems,
  cards,
  recurrences,
  bills,
}: LinhasCompletas) {
  const txs: DashTx[] = transactions.map((t) => ({
    amount: t.amount,
    valor_pessoal: t.valor_pessoal,
    type: t.type,
    payment_method: t.payment_method,
    status: t.status,
    competence_date: t.competence_date,
    card_id: t.card_id,
    statement_id: t.statement_id,
    parcelado: t.parcelado,
    category_id: t.category_id,
    category: t.category
      ? { id: t.category.id, name: t.category.name, color: t.category.color }
      : null,
  }));
  const sts: DashStatement[] = statements.map((s) => ({
    id: s.id,
    card_id: s.card_id,
    competencia: s.competencia,
    data_fechamento: s.data_fechamento,
    data_vencimento: s.data_vencimento,
    pago_em: s.pago_em,
    total_atual: s.total_atual,
  }));
  const recs: DashReceivable[] = receivables.map((r) => ({
    statement_id: r.statement_id,
    installment_id: r.installment_id,
    valor: r.valor,
    status: r.status,
    ref_month:
      r.statement?.competencia?.slice(0, 7) ??
      r.transaction?.purchase_date?.slice(0, 7) ??
      null,
  }));
  const inst: DashInstallmentItem[] = installmentItems.map((it) => ({
    id: it.id,
    statement_id: it.statement_id,
    valor: it.valor,
    status: it.status,
    parent: it.parent?.category
      ? { category: { id: it.parent.category.id, name: it.parent.category.name, color: it.parent.category.color } }
      : { category: null },
  }));
  const dashCards: DashCard[] = cards.map((c) => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor,
    limite_total: c.limite_total,
    dia_fechamento: c.dia_fechamento,
    dia_vencimento: c.dia_vencimento,
  }));
  const recorrencias: DashRecurrence[] = recurrences.map((r) => ({
    amount: r.amount,
    type: r.type,
    frequency: r.frequency,
    interval_count: r.interval_count,
    anchor_date: r.anchor_date,
    next_due_date: r.next_due_date,
    end_date: r.end_date,
    is_active: r.is_active,
  }));
  const dashBills: DashBill[] = bills.map((b) => ({
    name: b.name,
    amount: b.amount,
    due_day: b.due_day,
    is_active: b.is_active,
  }));
  return { txs, sts, recs, inst, cards: dashCards, recorrencias, bills: dashBills };
}

/* ─── D · o Cron (`src/lib/notifications/cron.ts`), com as formas que ele declara ─── */

type FaturaDoCron = {
  id: string;
  card_id: string | null;
  competencia: string;
  data_fechamento: string;
  data_vencimento: string;
  pago_em: string | null;
  total_atual: number | null;
};

type RecebivelDoCron = {
  id: string;
  valor: number;
  status: string;
  installment_id: string | null;
  statement_id: string | null;
  data_prevista: string | null;
  person: { nome: string } | { nome: string }[] | null;
  statement: { data_vencimento: string } | { data_vencimento: string }[] | null;
};

function referenciaCron(
  statements: FaturaDoCron[],
  receivables: RecebivelDoCron[],
  txRows: Array<Record<string, unknown>>,
) {
  const dashStatements: DashStatement[] = statements.map((s) => ({
    id: s.id,
    card_id: s.card_id,
    competencia: s.competencia,
    data_fechamento: s.data_fechamento,
    data_vencimento: s.data_vencimento,
    pago_em: s.pago_em,
    total_atual: s.total_atual,
  }));
  const dashReceivables: DashReceivable[] = receivables.map((r) => ({
    statement_id: r.statement_id,
    installment_id: r.installment_id,
    valor: Number(r.valor),
    status: r.status,
  }));
  const dashTx = txRows.map(
    (t): DashTx => ({
      amount: Number(t.amount),
      valor_pessoal: t.valor_pessoal === null ? null : Number(t.valor_pessoal),
      type: t.type as DashTx["type"],
      payment_method: (t.payment_method as DashTx["payment_method"]) ?? null,
      status: t.status as DashTx["status"],
      competence_date: t.competence_date as string,
      card_id: (t.card_id as string | null) ?? null,
      statement_id: (t.statement_id as string | null) ?? null,
      parcelado: Boolean(t.parcelado),
      category_id: null,
    }),
  );
  return { sts: dashStatements, recs: dashReceivables, txs: dashTx };
}

/* ═══════════════════════════ Fixtures sintéticas ═══════════════════════════ */

const catA: Categoria = { id: "cat-a", name: "Categoria A", color: "#111111", icon: "tag" };
const catB = { id: "cat-b", name: "Categoria B", color: null };

function linhasCompletas(): LinhasCompletas {
  return {
    transactions: [
      {
        // À vista, sem divisão: `valor_pessoal` nulo tem de continuar nulo (N3).
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
        category: catA,
        description: "Lancamento 1",
      },
      {
        // À vista dividida: a parte minha é `valor_pessoal`.
        amount: 90,
        valor_pessoal: 30,
        type: "despesa",
        payment_method: "debito",
        status: "pago",
        competence_date: "2026-05-12",
        card_id: null,
        statement_id: null,
        parcelado: false,
        category_id: "cat-a",
        category: catA,
        description: "Lancamento 2",
      },
      {
        // À vista do cartão, sem categoria.
        amount: 80,
        valor_pessoal: null,
        type: "despesa",
        payment_method: "cartao_credito",
        status: "pendente",
        competence_date: "2026-04-28",
        card_id: "card-1",
        statement_id: "st-1",
        parcelado: false,
        category_id: null,
        category: null,
        description: "Lancamento 3",
      },
      {
        // Compra-pai de parcelamento: nunca soma (as parcelas entram pela fatura).
        amount: 600,
        valor_pessoal: null,
        type: "despesa",
        payment_method: "cartao_credito",
        status: "pendente",
        competence_date: "2026-05-02",
        card_id: "card-1",
        statement_id: null,
        parcelado: true,
        category_id: "cat-a",
        category: catA,
        description: "Lancamento 4",
      },
      {
        amount: 1000,
        valor_pessoal: null,
        type: "receita",
        payment_method: "transferencia",
        status: "recebido",
        competence_date: "2026-05-05",
        card_id: null,
        statement_id: null,
        parcelado: false,
        category_id: null,
        category: null,
        description: "Lancamento 5",
      },
    ],
    statements: [
      {
        id: "st-1",
        card_id: "card-1",
        competencia: "2026-05-01",
        data_fechamento: "2026-05-05",
        data_vencimento: "2026-05-15",
        pago_em: null,
        total_atual: 480.5,
        itens: 3,
      },
      {
        id: "st-0",
        card_id: "card-1",
        competencia: "2026-04-01",
        data_fechamento: "2026-04-05",
        data_vencimento: "2026-04-15",
        pago_em: "2026-04-14",
        total_atual: 210,
        itens: 2,
      },
    ],
    receivables: [
      {
        // Com fatura: `ref_month` sai da competência da fatura, não da compra.
        statement_id: "st-1",
        installment_id: "inst-1",
        valor: 50,
        status: "pendente",
        statement: { id: "st-1", competencia: "2026-05-01", data_vencimento: "2026-05-15" },
        transaction: { id: "tx-4", description: "Lancamento 4", purchase_date: "2026-04-28" },
      },
      {
        // Sem fatura: `ref_month` sai de `purchase_date` (N2).
        statement_id: null,
        installment_id: null,
        valor: 60,
        status: "cobrado",
        statement: null,
        transaction: { id: "tx-2", description: "Lancamento 2", purchase_date: "2026-05-12" },
      },
      {
        // Sem nenhum dos dois: `ref_month` nulo.
        statement_id: null,
        installment_id: null,
        valor: 15,
        status: "pago",
        statement: null,
        transaction: null,
      },
    ],
    installmentItems: [
      {
        // Parcela com categoria no pai.
        id: "inst-1",
        statement_id: "st-1",
        valor: 100,
        status: "ativa",
        numero: 1,
        parent: { id: "tx-4", description: "Lancamento 4", category: catB },
      },
      {
        // Pai sem categoria.
        id: "inst-2",
        statement_id: "st-1",
        valor: 100,
        status: "ativa",
        numero: 2,
        parent: { id: "tx-4", description: "Lancamento 4", category: null },
      },
      {
        // Sem pai embutido: `parent` vira `{ category: null }`, nunca `null` (N4).
        id: "inst-3",
        statement_id: "st-0",
        valor: 100,
        status: "ativa",
        numero: 3,
        parent: null,
      },
    ],
    cards: [
      {
        id: "card-1",
        nome: "Cartao 1",
        cor: "#222222",
        limite_total: 5000,
        dia_fechamento: 5,
        dia_vencimento: 15,
        ativo: true,
      },
    ],
    recurrences: [
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
      },
    ],
    bills: [
      { name: "Conta fixa 1", amount: 200, due_day: 10, is_active: true, frequency: "mensal" },
      { name: "Conta fixa 2", amount: 35.5, due_day: 28, is_active: false, frequency: "mensal" },
    ],
  };
}

/** As linhas completas no vocabulário de `montarEntradas`. */
function comoLinhasFinanceiras(l: LinhasCompletas) {
  return {
    transacoes: l.transactions,
    faturas: l.statements,
    recebiveis: l.receivables,
    parcelas: l.installmentItems,
    cartoes: l.cards,
    recorrencias: l.recurrences,
    contasFixas: l.bills,
  };
}

// O Cron: linha CRUA do `select` enxuto — sem `category`, sem `category_id`, sem embeds, e com
// numérico como texto (o `Number(...)` que ele escrevia campo a campo).
const faturasDoCron: FaturaDoCron[] = [
  {
    id: "st-1",
    card_id: "card-1",
    competencia: "2026-05-01",
    data_fechamento: "2026-05-05",
    data_vencimento: "2026-05-15",
    pago_em: null,
    total_atual: 480.5,
  },
  {
    id: "st-9",
    card_id: null,
    competencia: "2026-03-01",
    data_fechamento: "2026-03-05",
    data_vencimento: "2026-03-15",
    pago_em: null,
    total_atual: null,
  },
];

const recebiveisDoCron: RecebivelDoCron[] = [
  {
    id: "rec-1",
    valor: 50,
    status: "pendente",
    installment_id: "inst-1",
    statement_id: "st-1",
    data_prevista: null,
    person: { nome: "Pessoa 1" },
    statement: { data_vencimento: "2026-05-15" },
  },
  {
    id: "rec-2",
    valor: "12.34" as unknown as number, // o tipo declarado mente; o `Number(...)` do Cron cobria isso
    status: "cobrado",
    installment_id: null,
    statement_id: null,
    data_prevista: "2026-05-20",
    person: [{ nome: "Pessoa 2" }],
    statement: null,
  },
];

const transacoesDoCron: Array<Record<string, unknown>> = [
  {
    amount: "123.45",
    valor_pessoal: null,
    type: "despesa",
    payment_method: "pix",
    status: "pago",
    competence_date: "2026-05-10",
    card_id: null,
    statement_id: null,
    parcelado: false,
  },
  {
    amount: "90.00",
    valor_pessoal: "30.10",
    type: "despesa",
    payment_method: null,
    status: "pago",
    competence_date: "2026-04-12",
    card_id: null,
    statement_id: null,
    parcelado: null,
  },
  {
    amount: 80,
    valor_pessoal: null,
    type: "despesa",
    payment_method: "cartao_credito",
    status: "pendente",
    competence_date: "2026-04-28",
    card_id: "card-1",
    statement_id: "st-1",
    parcelado: false,
  },
];

/** A chamada exata que o Cron faz (um cast por lista, nunca campo a campo — risco R2). */
function entradasDoCron() {
  return montarEntradas({
    transacoes: transacoesDoCron as LinhaTx[],
    faturas: faturasDoCron,
    recebiveis: recebiveisDoCron as LinhaRecebivel[],
  });
}

/* ═══════════════════════════ 1. Equivalência ═══════════════════════════ */

describe("03-B — montarEntradas devolve o que cada chamador montava à mão (caso completo)", () => {
  const linhas = linhasCompletas();
  const novo = montarEntradas(comoLinhasFinanceiras(linhas));

  it("A · card do dashboard (getFinanceCardData): txs, sts, recs e bills idênticos", () => {
    const ref = referenciaCardFinanceiro(
      linhas.transactions,
      linhas.statements,
      linhas.receivables,
      linhas.bills,
    );
    expect(novo.txs).toEqual(ref.txs);
    expect(novo.sts).toEqual(ref.sts);
    expect(novo.recs).toEqual(ref.recs);
    expect(novo.bills).toEqual(ref.bills);
  });

  it("A' · card de faturas (getInvoicesCardData): cards e sts idênticos; recs ganham o ref_month que A já tinha", () => {
    const ref = referenciaCardFaturas(linhas.cards, linhas.statements, linhas.receivables);
    const refA = referenciaCardFinanceiro(
      linhas.transactions,
      linhas.statements,
      linhas.receivables,
      linhas.bills,
    );
    expect(novo.cards).toEqual(ref.cards);
    expect(novo.sts).toEqual(ref.sts);
    // A ÚNICA diferença declarada: a cópia de A' não derivava `ref_month`, e agora deriva — o
    // MESMO valor que A, B e C derivavam das mesmas linhas. É a armadilha do Bloco 10 da 03-A
    // morrendo; o card chama `totalAReceber(recs)` SEM mês, então o número dele não muda.
    expect(novo.recs).toEqual(ref.recs.map((r, i) => ({ ...r, ref_month: refA.recs[i].ref_month })));
    expect(novo.recs.map((r) => r.ref_month)).toEqual(["2026-05", "2026-05", null]);
  });

  it("B · relatório (getFinanceAndCardReport): as sete listas idênticas", () => {
    const ref = referenciaRelatorio(linhas);
    expect(novo.txs).toEqual(ref.txs);
    expect(novo.sts).toEqual(ref.sts);
    expect(novo.recs).toEqual(ref.recs);
    expect(novo.inst).toEqual(ref.inst);
    expect(novo.cards).toEqual(ref.cards);
    expect(novo.recorrencias).toEqual(ref.recorrencias);
    expect(novo.bills).toEqual(ref.bills);
  });

  it("C · página do dashboard financeiro: as sete listas idênticas", () => {
    expect(novo).toEqual(referenciaPagina(linhas));
  });

  it("category_id sai do DADO, não de uma constante (N1)", () => {
    expect(novo.txs.map((t) => t.category_id)).toEqual(["cat-a", "cat-a", null, "cat-a", null]);
  });

  it("valor_pessoal nulo continua nulo — 'sem divisão' não vira 'minha parte é zero' (N3)", () => {
    expect(novo.txs[0].valor_pessoal).toBeNull();
    expect(novo.txs[1].valor_pessoal).toBe(30);
  });

  it("parcela sem pai embutido ganha { category: null }, nunca null (N4)", () => {
    expect(novo.inst.map((it) => it.parent)).toEqual([
      { category: { id: "cat-b", name: "Categoria B", color: null } },
      { category: null },
      { category: null },
    ]);
  });

  it("nenhum campo além do que o tipo do motor tem é copiado", () => {
    expect(Object.keys(novo.txs[0]).sort()).toEqual(
      [
        "amount",
        "card_id",
        "category",
        "category_id",
        "competence_date",
        "parcelado",
        "payment_method",
        "statement_id",
        "status",
        "type",
        "valor_pessoal",
      ].sort(),
    );
    expect(novo.txs[0].category).toEqual({ id: "cat-a", name: "Categoria A", color: "#111111" });
    expect(novo.sts[0]).not.toHaveProperty("itens");
    expect(novo.cards[0]).not.toHaveProperty("ativo");
    expect(novo.recorrencias[0]).not.toHaveProperty("description");
    expect(novo.bills[0]).not.toHaveProperty("frequency");
  });
});

describe("03-B — montarEntradas devolve o que o Cron montava à mão (caso do Cron)", () => {
  const novo = entradasDoCron();
  const ref = referenciaCron(faturasDoCron, recebiveisDoCron, transacoesDoCron);

  it("D · sts idênticos", () => {
    expect(novo.sts).toEqual(ref.sts);
  });

  it("D · txs idênticos, category_id nulo SAINDO DO DADO; category ausente vira null declarado", () => {
    // Única diferença declarada: a cópia do Cron não tinha a chave `category`; a montagem nova
    // escreve `null`. Nenhum leitor distingue as duas (o motor lê `t.category?.…`).
    expect(novo.txs).toEqual(ref.txs.map((t) => ({ ...t, category: null })));
    expect(novo.txs.map((t) => t.category_id)).toEqual([null, null, null]);
    // A normalização que o Cron fazia campo a campo continua acontecendo — agora num lugar só.
    expect(novo.txs.map((t) => [t.amount, t.valor_pessoal])).toEqual([
      [123.45, null],
      [90, 30.1],
      [80, null],
    ]);
  });

  it("D · recs idênticos; ref_month ausente vira null declarado (o Cron não lê ref_month)", () => {
    expect(novo.recs).toEqual(ref.recs.map((r) => ({ ...r, ref_month: null })));
    expect(novo.recs[1].valor).toBe(12.34);
  });

  it("listas que o Cron não passa voltam vazias", () => {
    expect(novo.inst).toEqual([]);
    expect(novo.cards).toEqual([]);
    expect(novo.recorrencias).toEqual([]);
    expect(novo.bills).toEqual([]);
  });
});

/* ═══════════════════════════ 2. O motor sobre a entrada montada ═══════════════════════════ */

describe("03-B — o motor lê a entrada montada como lia a montagem de referência", () => {
  const linhas = linhasCompletas();
  const novo = montarEntradas(comoLinhasFinanceiras(linhas));
  const refB = referenciaRelatorio(linhas);

  it("resumoMes, gastosPorCategoria, gastosPorForma e totalAReceber dão os mesmos números", () => {
    for (const mes of ["2026-04", "2026-05"]) {
      expect(
        resumoMes({ mes, transactions: novo.txs, statements: novo.sts, receivables: novo.recs }),
      ).toEqual(
        resumoMes({ mes, transactions: refB.txs, statements: refB.sts, receivables: refB.recs }),
      );
      const params = {
        mes,
        transactions: novo.txs,
        statements: novo.sts,
        installmentItems: novo.inst,
        receivables: novo.recs,
      };
      const paramsRef = {
        mes,
        transactions: refB.txs,
        statements: refB.sts,
        installmentItems: refB.inst,
        receivables: refB.recs,
      };
      expect(gastosPorCategoria(params)).toEqual(gastosPorCategoria(paramsRef));
      expect(gastosPorForma(params)).toEqual(gastosPorForma(paramsRef));
      expect(totalAReceber(novo.recs, mes)).toBe(totalAReceber(refB.recs, mes));
    }
    expect(totalAReceber(novo.recs)).toBe(totalAReceber(refB.recs));
  });

  it("o resumo do Cron sai igual", () => {
    const d = entradasDoCron();
    const ref = referenciaCron(faturasDoCron, recebiveisDoCron, transacoesDoCron);
    for (const mes of ["2026-04", "2026-05"]) {
      expect(resumoMes({ mes, transactions: d.txs, statements: d.sts, receivables: d.recs })).toEqual(
        resumoMes({ mes, transactions: ref.txs, statements: ref.sts, receivables: ref.recs }),
      );
    }
  });
});

/* ═══════════════════════════ Normalização e forma ═══════════════════════════ */

describe("03-B — montarEntradas: normalização", () => {
  it("lista não informada volta vazia", () => {
    expect(montarEntradas({})).toEqual({
      txs: [],
      sts: [],
      recs: [],
      inst: [],
      cards: [],
      recorrencias: [],
      bills: [],
    });
  });

  it("dinheiro em texto vira número em todo campo de dinheiro; ausente vira null, não 0", () => {
    const e = montarEntradas({
      transacoes: [{ amount: "10.5", type: "despesa", status: "pago", competence_date: "2026-05-01" }],
      faturas: [
        {
          id: "st-1",
          card_id: "card-1",
          competencia: "2026-05-01",
          data_fechamento: "2026-05-05",
          data_vencimento: "2026-05-15",
          pago_em: null,
          total_atual: "480.50",
        },
      ],
      recebiveis: [{ statement_id: null, installment_id: null, valor: "7.25", status: "pendente" }],
      parcelas: [{ id: "inst-1", statement_id: "st-1", valor: "100.00", status: "ativa" }],
      cartoes: [
        { id: "card-1", nome: "Cartao 1", cor: null, limite_total: "5000.00", dia_fechamento: 5, dia_vencimento: 15 },
      ],
      recorrencias: [
        {
          amount: "49.90",
          type: "despesa",
          frequency: "mensal",
          interval_count: 1,
          anchor_date: "2026-01-10",
          next_due_date: "2026-06-10",
          end_date: null,
          is_active: true,
        },
      ],
      contasFixas: [{ name: "Conta fixa 1", amount: "200", due_day: 10, is_active: true }],
    });
    expect(e.txs[0]).toEqual({
      amount: 10.5,
      valor_pessoal: null,
      type: "despesa",
      payment_method: null,
      status: "pago",
      competence_date: "2026-05-01",
      card_id: null,
      statement_id: null,
      parcelado: false,
      category_id: null,
      category: null,
    });
    expect(e.sts[0].total_atual).toBe(480.5);
    expect(e.recs[0]).toEqual({
      statement_id: null,
      installment_id: null,
      valor: 7.25,
      status: "pendente",
      ref_month: null,
    });
    expect(e.inst[0]).toEqual({
      id: "inst-1",
      statement_id: "st-1",
      valor: 100,
      status: "ativa",
      parent: { category: null },
    });
    expect(e.cards[0].limite_total).toBe(5000);
    expect(e.recorrencias[0].amount).toBe(49.9);
    expect(e.bills[0].amount).toBe(200);
  });

  it("total_atual nulo continua nulo", () => {
    expect(entradasDoCron().sts[1].total_atual).toBeNull();
  });
});

/* ═══════════════════════════ Janelas, saldo e escopos ═══════════════════════════ */

describe("03-B — ultimoDiaDoMes e as três janelas declaradas", () => {
  it("ultimoDiaDoMes cobre mês de 30 e 31 dias, fevereiro bissexto e não bissexto, e dezembro (N9)", () => {
    expect(ultimoDiaDoMes("2026-04")).toBe("2026-04-30");
    expect(ultimoDiaDoMes("2026-05")).toBe("2026-05-31");
    expect(ultimoDiaDoMes("2024-02")).toBe("2024-02-29");
    expect(ultimoDiaDoMes("2026-02")).toBe("2026-02-28");
    expect(ultimoDiaDoMes("2026-12")).toBe("2026-12-31");
  });

  it("janelaDoMes é o mês inteiro", () => {
    expect(janelaDoMes("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(janelaDoMes("2026-12")).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  it("janelaDoRelatorio: 6 meses para trás do SELECIONADO até 6 à frente do ATUAL", () => {
    expect(janelaDoRelatorio({ mesSel: "2026-03", mesAtual: "2026-05" })).toEqual({
      from: "2025-10-01",
      to: "2026-10-31",
      evoMeses: ["2025-10", "2025-11", "2025-12", "2026-01", "2026-02", "2026-03"],
      projMeses: ["2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"],
    });
    expect(janelaDoRelatorio({ mesSel: "2026-09", mesAtual: "2026-09" }).to).toBe("2027-02-28");
  });

  it("janelaDoCron: 3 meses para trás até `ate` — o truncamento em hoje é declarado", () => {
    expect(janelaDoCron({ mesAtual: "2026-05", ate: "2026-05-17" })).toEqual({
      from: "2026-02-01",
      to: "2026-05-17",
    });
    expect(janelaDoCron({ mesAtual: "2026-01", ate: "2026-01-09" }).from).toBe("2025-10-01");
  });
});

describe("03-B — saldoDasContas", () => {
  it("soma o saldo das contas, com o nulo contando como a conta de hoje contava", () => {
    expect(
      saldoDasContas([{ current_balance: 100.5 }, { current_balance: null }, { current_balance: -20 }]),
    ).toBe(80.5);
    expect(saldoDasContas([])).toBe(0);
  });
});

describe("03-B — os três escopos nomeados", () => {
  const flags = (e: EscopoFinanceiro) =>
    Object.entries(e)
      .filter(([k, v]) => k !== "nome" && v === true)
      .map(([k]) => k)
      .sort();

  it("card do dashboard: contas, faturas, recebíveis, contas fixas e transações — SEM parcelas", () => {
    expect(flags(ESCOPO_CARD_FINANCEIRO)).toEqual(
      ["contas", "contasFixas", "faturas", "recebiveis", "transacoes"].sort(),
    );
  });

  it("card de faturas: cartões, faturas e recebíveis", () => {
    expect(flags(ESCOPO_FATURAS)).toEqual(["cartoes", "faturas", "recebiveis"]);
  });

  it("relatório: as oito leituras, incluindo parcelas", () => {
    expect(flags(ESCOPO_RELATORIO)).toEqual(
      [
        "cartoes",
        "contas",
        "contasFixas",
        "faturas",
        "parcelas",
        "recebiveis",
        "recorrencias",
        "transacoes",
      ].sort(),
    );
  });

  it("uma combinação solta não é um escopo (conferido pelo tsc --noEmit)", () => {
    // @ts-expect-error — o card com parcelas não é nenhum dos três escopos nomeados.
    const solto: EscopoFinanceiro = { ...ESCOPO_CARD_FINANCEIRO, parcelas: true };
    expect(solto.parcelas).toBe(true);
  });
});

/* ═══════════════════════════ 3. Fronteira ═══════════════════════════ */

const SRC = path.resolve(__dirname, "..", "..");
const PROPRIO = path.join(SRC, "lib", "finance", "pipeline.ts");

/**
 * A varredura olha CÓDIGO, não prosa — o idioma de `painel-persistencia.test.ts`. Sem isto, o
 * comentário que explica a regra (inclusive o deste arquivo e o de `pipeline.ts`) derrubaria o
 * teste que a protege.
 */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

function arquivosDeCodigo(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const caminho = path.join(dir, entrada.name);
    if (entrada.isDirectory()) return arquivosDeCodigo(caminho);
    return /\.(ts|tsx)$/.test(entrada.name) ? [caminho] : [];
  });
}

const TIPOS_DO_MOTOR = "Tx|Statement|Receivable|Card|Bill|InstallmentItem|Recurrence";
/** `const txs: DashTx[] = …` — as 23 montagens de lista. */
const MONTAGEM_EM_LISTA = new RegExp(`\\bDash(?:${TIPOS_DO_MOTOR})\\[\\]\\s*=`);
/** `.map((t): DashTx => ({ … }))` — a forma do Cron. */
const MONTAGEM_EM_CALLBACK = new RegExp(`\\)\\s*:\\s*Dash(?:${TIPOS_DO_MOTOR})\\s*=>`);

describe("03-B — fronteira: nenhum arquivo fora de pipeline.ts monta um Dash*", () => {
  const todos = arquivosDeCodigo(SRC);
  const varridos = todos.filter((f) => !f.endsWith(".test.ts") && f !== PROPRIO);

  it("a varredura leu o repositório de verdade e os padrões casam com o que devem", () => {
    // Sem estes controles, um caminho errado — ou um `semComentarios` que comesse demais —
    // transformaria o `toEqual([])` abaixo em `[] === []` sobre uma lista que ninguém leu.
    expect(varridos.length).toBeGreaterThan(100);
    const dashboard = varridos.find((f) => f.endsWith(path.join("finance", "dashboard.ts")));
    expect(dashboard).toBeDefined();
    expect(semComentarios(fs.readFileSync(dashboard as string, "utf8"))).toContain(
      "export type DashTx",
    );
    expect(MONTAGEM_EM_LISTA.test("const a: DashTx[] = []")).toBe(true);
    expect(MONTAGEM_EM_LISTA.test("const b: DashInstallmentItem[] = linhas.map(f)")).toBe(true);
    expect(MONTAGEM_EM_CALLBACK.test("rows.map((t): DashTx => ({")).toBe(true);
    // Tipos de outros módulos com prefixo parecido não entram.
    expect(MONTAGEM_EM_LISTA.test("const cards: DashCourseItem[] = []")).toBe(false);
    expect(MONTAGEM_EM_CALLBACK.test("const toItem = (h): DashHabitItem => ({")).toBe(false);
    // E o próprio pipeline.ts casaria, se não fosse excluído — prova de que a regex enxerga
    // as sete montagens legítimas.
    expect(MONTAGEM_EM_LISTA.test(semComentarios(fs.readFileSync(PROPRIO, "utf8")))).toBe(true);
  });

  /**
   * Vista VERMELHA antes de qualquer chamador migrar (passo 2 da 03-B), listando os quatro
   * arquivos das 24 montagens — `dashboard/financeiro/page.tsx`, `dashboard/queries.ts`,
   * `notifications/cron.ts` e `reports/queries.ts`. Um teste de ausência que nunca foi visto
   * vermelho não provou nada; este foi, e foi confirmado de novo por mutação (N7).
   */
  it("zero montagens fora de pipeline.ts (excluídos os *.test.ts, onde fixture é legítima)", () => {
    const encontrados = varridos
      .filter((f) => {
        const codigo = semComentarios(fs.readFileSync(f, "utf8"));
        return MONTAGEM_EM_LISTA.test(codigo) || MONTAGEM_EM_CALLBACK.test(codigo);
      })
      .map((f) => path.relative(SRC, f).split(path.sep).join("/"))
      .sort();
    expect(encontrados).toEqual([]);
  });
});
