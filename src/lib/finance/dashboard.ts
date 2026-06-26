/**
 * Fase 07 — Agregações do dashboard financeiro (lógica PURA, testada em dashboard.test.ts).
 *
 * SEM efeitos colaterais: não toca Supabase/Next, não usa Date.now() — `hoje`/`mes` são
 * SEMPRE injetados. Recebe linhas já buscadas (subconjuntos estruturais dos *Row) e devolve
 * agregados planos. Toda a aritmética de dinheiro é feita em CENTAVOS (inteiros) e só vira
 * reais na saída — evita o drift de ponto flutuante ao somar `numeric(14,2)`.
 *
 * DUAS BASES DE CÁLCULO (nunca misturadas num mesmo número)
 * --------------------------------------------------------
 * 1) BASE COMPETÊNCIA (transações por `competence_date`): entradas, gasto à vista,
 *    e a distribuição por categoria/forma de pagamento dos lançamentos à vista.
 * 2) BASE FATURA (faturas + recebíveis): gasto no cartão do mês, "próximas 6 faturas",
 *    projeção e alertas de limite/vencimento — REUSA a regra de fatura (invoice.ts) e o
 *    `total_atual` da view (que já soma à-vista do cartão + parcelas), exatamente como a
 *    tela /faturas. Nunca soma a transação "pai" do parcelamento (statement_id NULL).
 *
 * VALOR MEU × TERCEIROS (fonte única, idêntica à /faturas)
 * -------------------------------------------------------
 * - À vista / não-cartão: meu = `valor_pessoal ?? amount`; terceiros = `amount − meu`.
 * - Cartão (por fatura): terceiros = Σ `receivables.valor` da fatura; meu = `total_atual − terceiros`.
 * `cancelado`/`cancelada`, `transferencia` e `ajuste` ficam fora de entradas/saídas.
 */
import { addMonths, format, getDaysInMonth, parseISO } from "date-fns";
import { resolverFatura, statusEfetivo } from "@/lib/finance/invoice";
import { occurrenceOn } from "@/lib/finance/recurrence";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";
import {
  RECEIVABLE_OPEN_STATUSES,
  type Frequency,
  type PaymentMethod,
  type StatementStatus,
  type TransactionStatus,
  type TransactionType,
} from "@/lib/finance/constants";

const ISO = "yyyy-MM-dd";

/* ───────────────────────────── Tipos de entrada (estruturais) ───────────────────────────── */

export type DashTx = {
  amount: number;
  valor_pessoal: number | null;
  type: TransactionType;
  payment_method: PaymentMethod | null;
  status: TransactionStatus;
  competence_date: string;
  card_id: string | null;
  statement_id: string | null;
  parcelado: boolean;
  category_id: string | null;
  category?: { id: string; name: string; color: string | null } | null;
};

export type DashStatement = {
  id: string;
  card_id: string | null;
  competencia: string;
  data_fechamento: string;
  data_vencimento: string;
  pago_em: string | null;
  total_atual: number | null;
};

export type DashReceivable = {
  statement_id: string | null;
  installment_id: string | null;
  valor: number;
  status: string;
};

export type DashInstallmentItem = {
  id: string;
  statement_id: string | null;
  valor: number;
  status: string;
  parent: {
    category: { id: string; name: string; color: string | null } | null;
  } | null;
};

export type DashCard = {
  id: string;
  nome: string;
  cor: string | null;
  limite_total: number;
  dia_fechamento: number;
  dia_vencimento: number;
};

export type DashRecurrence = {
  amount: number;
  type: TransactionType;
  frequency: Frequency;
  interval_count: number;
  anchor_date: string;
  next_due_date: string;
  end_date: string | null;
  is_active: boolean;
};

export type DashBill = {
  name: string;
  amount: number;
  due_day: number;
  is_active: boolean;
};

/* ───────────────────────────── Helpers de mês/data (puros) ───────────────────────────── */

/** 'yyyy-MM' de uma data 'yyyy-MM-dd' (ou 'yyyy-MM-...'). */
export function mesDe(iso: string): string {
  return iso.slice(0, 7);
}

/** Soma `k` meses a um 'yyyy-MM' e devolve 'yyyy-MM'. */
export function addMes(mes: string, k: number): string {
  const [y, m] = mes.split("-").map(Number);
  return format(addMonths(new Date(y, m - 1, 1), k), "yyyy-MM");
}

/** Mês anterior ('yyyy-MM'). */
export function mesAnterior(mes: string): string {
  return addMes(mes, -1);
}

/** `n` meses a partir de `mes` (inclusive), do mais antigo ao mais novo. */
export function proximosMeses(mes: string, n: number): string[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => addMes(mes, i));
}

/** `n` meses TERMINANDO em `mes` (inclusive), do mais antigo ao mais novo. */
export function ultimosMeses(mes: string, n: number): string[] {
  return Array.from({ length: Math.max(0, n) }, (_, i) => addMes(mes, i - (n - 1)));
}

/** Próximo dia (local) de uma data 'yyyy-MM-dd'. Evita o parse UTC de new Date("yyyy-MM-dd"). */
export function nextDayISO(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return format(new Date(y, m - 1, d + 1), ISO);
}

/**
 * Variação percentual de `atual` sobre `anterior`. Retorna `null` quando o denominador é 0
 * (mês sem base) — a UI mostra "—" em vez de NaN/Infinity.
 */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return ((atual - anterior) / anterior) * 100;
}

const cent = (v: number) => reaisParaCentavos(v);
const reais = (c: number) => centavosParaReais(c);
const ativo = (t: { status: TransactionStatus }) => t.status !== "cancelado";

/** "Meu" (centavos) de um lançamento: valor_pessoal quando houver, senão o amount cheio. */
export function meuCentavos(t: { amount: number; valor_pessoal: number | null }): number {
  return cent(t.valor_pessoal ?? t.amount);
}

/* ───────────────────────────── Resumo do mês ───────────────────────────── */

export type ResumoMes = {
  /** Entradas do mês (receitas, base competência). */
  entradas: number;
  /** Saídas do mês = total movimentado (à vista + cartão). */
  saidas: number;
  /** Quanto das saídas é realmente meu. */
  meu: number;
  /** Quanto das saídas é de terceiros (saidas − meu). */
  terceiros: number;
  /** Gasto no cartão (Σ total das faturas do mês, base fatura). */
  cartao: number;
  /** Parte do cartão realmente minha (cartão − terceiros das faturas). */
  cartaoMeu: number;
  /** Gasto à vista / não-cartão (base competência). */
  aVista: number;
  /** Parte à vista realmente minha. */
  aVistaMeu: number;
};

function statementsDoMes(statements: DashStatement[], mes: string): DashStatement[] {
  return statements.filter((s) => s.card_id && mesDe(s.competencia) === mes);
}

function somaTerceirosDasFaturas(
  statements: DashStatement[],
  receivables: DashReceivable[],
): number {
  const ids = new Set(statements.map((s) => s.id));
  let total = 0;
  for (const r of receivables) {
    if (r.statement_id && ids.has(r.statement_id)) total += cent(r.valor);
  }
  return total;
}

export function resumoMes(params: {
  mes: string;
  transactions: DashTx[];
  statements: DashStatement[];
  receivables: DashReceivable[];
}): ResumoMes {
  const { mes, transactions, statements, receivables } = params;

  let entradasCent = 0;
  let aVistaCent = 0;
  let aVistaMeuCent = 0;

  for (const t of transactions) {
    if (!ativo(t)) continue;
    if (mesDe(t.competence_date) !== mes) continue;

    if (t.type === "receita") {
      entradasCent += cent(t.amount);
      continue;
    }
    if (t.type !== "despesa") continue; // transferencia/ajuste fora
    // Saída à vista: não-cartão e não-parcelado (parcelas entram pela fatura).
    if (t.card_id === null && !t.parcelado) {
      aVistaCent += cent(t.amount);
      aVistaMeuCent += meuCentavos(t);
    }
  }

  const mesStatements = statementsDoMes(statements, mes);
  const cartaoCent = mesStatements.reduce((s, st) => s + cent(st.total_atual ?? 0), 0);
  const cartaoTerceirosCent = somaTerceirosDasFaturas(mesStatements, receivables);
  const cartaoMeuCent = cartaoCent - cartaoTerceirosCent;

  const saidasCent = aVistaCent + cartaoCent;
  const meuCent = aVistaMeuCent + cartaoMeuCent;

  return {
    entradas: reais(entradasCent),
    saidas: reais(saidasCent),
    meu: reais(meuCent),
    terceiros: reais(saidasCent - meuCent),
    cartao: reais(cartaoCent),
    cartaoMeu: reais(cartaoMeuCent),
    aVista: reais(aVistaCent),
    aVistaMeu: reais(aVistaMeuCent),
  };
}

/* ───────────────────────────── Itens de gasto (categoria/forma) ───────────────────────────── */

type SpendItem = {
  mes: string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  paymentMethod: PaymentMethod | "cartao_credito" | null;
  movCent: number;
  meuCent: number;
};

/**
 * Constrói a lista unificada de itens de gasto para categoria/forma, reconciliando com
 * `resumoMes.saidas`: à vista pela competência da transação; cartão (à-vista do cartão +
 * parcelas) pela competência da FATURA. Nunca inclui a transação "pai" do parcelamento.
 */
function buildSpendItems(params: {
  transactions: DashTx[];
  statements: DashStatement[];
  installmentItems: DashInstallmentItem[];
  receivables: DashReceivable[];
}): SpendItem[] {
  const { transactions, statements, installmentItems, receivables } = params;

  const compByStatement = new Map<string, string>();
  for (const s of statements) compByStatement.set(s.id, mesDe(s.competencia));

  const recByInstallment = new Map<string, number>();
  for (const r of receivables) {
    if (!r.installment_id) continue;
    recByInstallment.set(
      r.installment_id,
      (recByInstallment.get(r.installment_id) ?? 0) + cent(r.valor),
    );
  }

  const items: SpendItem[] = [];

  for (const t of transactions) {
    if (!ativo(t) || t.type !== "despesa" || t.parcelado) continue;
    const movCent = cent(t.amount);
    const meuCent = meuCentavos(t);
    if (t.card_id === null) {
      // À vista (base competência).
      items.push({
        mes: mesDe(t.competence_date),
        categoryId: t.category_id,
        categoryName: t.category?.name ?? null,
        categoryColor: t.category?.color ?? null,
        paymentMethod: t.payment_method,
        movCent,
        meuCent,
      });
    } else if (t.statement_id && compByStatement.has(t.statement_id)) {
      // À-vista do cartão (base fatura).
      items.push({
        mes: compByStatement.get(t.statement_id) as string,
        categoryId: t.category_id,
        categoryName: t.category?.name ?? null,
        categoryColor: t.category?.color ?? null,
        paymentMethod: "cartao_credito",
        movCent,
        meuCent,
      });
    }
  }

  for (const it of installmentItems) {
    if (it.status === "cancelada") continue;
    if (!it.statement_id || !compByStatement.has(it.statement_id)) continue;
    const movCent = cent(it.valor);
    const terceiros = recByInstallment.get(it.id) ?? 0;
    items.push({
      mes: compByStatement.get(it.statement_id) as string,
      categoryId: it.parent?.category?.id ?? null,
      categoryName: it.parent?.category?.name ?? null,
      categoryColor: it.parent?.category?.color ?? null,
      paymentMethod: "cartao_credito",
      movCent,
      meuCent: movCent - terceiros,
    });
  }

  return items;
}

export type CategoriaSlice = {
  categoryId: string | null;
  name: string;
  color: string | null;
  movimentado: number;
  meu: number;
};

export function gastosPorCategoria(params: {
  mes: string;
  transactions: DashTx[];
  statements: DashStatement[];
  installmentItems: DashInstallmentItem[];
  receivables: DashReceivable[];
}): CategoriaSlice[] {
  const items = buildSpendItems(params).filter((i) => i.mes === params.mes);
  const map = new Map<string, CategoriaSlice & { movCent: number; meuCent: number }>();
  for (const i of items) {
    const key = i.categoryId ?? "__none__";
    const cur =
      map.get(key) ??
      ({
        categoryId: i.categoryId,
        name: i.categoryName ?? "Sem categoria",
        color: i.categoryColor,
        movimentado: 0,
        meu: 0,
        movCent: 0,
        meuCent: 0,
      } as CategoriaSlice & { movCent: number; meuCent: number });
    cur.movCent += i.movCent;
    cur.meuCent += i.meuCent;
    map.set(key, cur);
  }
  return [...map.values()]
    .map((c) => ({
      categoryId: c.categoryId,
      name: c.name,
      color: c.color,
      movimentado: reais(c.movCent),
      meu: reais(c.meuCent),
    }))
    .sort((a, b) => b.movimentado - a.movimentado);
}

export type FormaSlice = {
  paymentMethod: PaymentMethod | "cartao_credito" | "outro";
  movimentado: number;
  meu: number;
};

export function gastosPorForma(params: {
  mes: string;
  transactions: DashTx[];
  statements: DashStatement[];
  installmentItems: DashInstallmentItem[];
  receivables: DashReceivable[];
}): FormaSlice[] {
  const items = buildSpendItems(params).filter((i) => i.mes === params.mes);
  const map = new Map<string, { movCent: number; meuCent: number }>();
  for (const i of items) {
    const key = i.paymentMethod ?? "outro";
    const cur = map.get(key) ?? { movCent: 0, meuCent: 0 };
    cur.movCent += i.movCent;
    cur.meuCent += i.meuCent;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([k, v]) => ({
      paymentMethod: k as FormaSlice["paymentMethod"],
      movimentado: reais(v.movCent),
      meu: reais(v.meuCent),
    }))
    .sort((a, b) => b.movimentado - a.movimentado);
}

/* ───────────────────────────── Comparativo mês a mês & evolução ───────────────────────────── */

export type Comparativo = {
  atual: ResumoMes;
  anterior: ResumoMes;
  deltaSaidas: number;
  deltaSaidasPct: number | null;
  deltaEntradas: number;
  deltaEntradasPct: number | null;
};

export function comparativoMesAMes(params: {
  mes: string;
  transactions: DashTx[];
  statements: DashStatement[];
  receivables: DashReceivable[];
}): Comparativo {
  const { mes, transactions, statements, receivables } = params;
  const atual = resumoMes({ mes, transactions, statements, receivables });
  const anterior = resumoMes({
    mes: mesAnterior(mes),
    transactions,
    statements,
    receivables,
  });
  return {
    atual,
    anterior,
    deltaSaidas: atual.saidas - anterior.saidas,
    deltaSaidasPct: variacaoPct(atual.saidas, anterior.saidas),
    deltaEntradas: atual.entradas - anterior.entradas,
    deltaEntradasPct: variacaoPct(atual.entradas, anterior.entradas),
  };
}

export type EvolucaoPonto = { mes: string; entradas: number; saidas: number; saldo: number };

export function evolucaoMensal(params: {
  meses: string[];
  transactions: DashTx[];
  statements: DashStatement[];
  receivables: DashReceivable[];
}): EvolucaoPonto[] {
  const { meses, transactions, statements, receivables } = params;
  return meses.map((mes) => {
    const r = resumoMes({ mes, transactions, statements, receivables });
    return {
      mes,
      entradas: r.entradas,
      saidas: r.saidas,
      saldo: r.entradas - r.saidas,
    };
  });
}

/* ───────────────────────────── Próximas 6 faturas ───────────────────────────── */

export type FaturaProvisao = {
  cardId: string;
  cardNome: string;
  cardCor: string | null;
  competencia: string;
  dataFechamento: string;
  dataVencimento: string;
  total: number;
  meu: number;
  terceiros: number;
  status: StatementStatus;
  virtual: boolean;
};

export function proximas6Faturas(params: {
  hoje: string;
  cards: DashCard[];
  statements: DashStatement[];
  receivables: DashReceivable[];
  n?: number;
}): FaturaProvisao[] {
  const { hoje, cards, statements, receivables, n = 6 } = params;

  const recByStatement = new Map<string, number>();
  for (const r of receivables) {
    if (!r.statement_id) continue;
    recByStatement.set(
      r.statement_id,
      (recByStatement.get(r.statement_id) ?? 0) + cent(r.valor),
    );
  }
  const stmtByKey = new Map<string, DashStatement>();
  for (const s of statements) {
    if (s.card_id) stmtByKey.set(`${s.card_id}|${mesDe(s.competencia)}`, s);
  }

  const out: FaturaProvisao[] = [];
  for (const card of cards) {
    let ciclo = resolverFatura(hoje, card.dia_fechamento, card.dia_vencimento);
    for (let i = 0; i < n; i++) {
      const comp = mesDe(ciclo.competencia);
      const real = stmtByKey.get(`${card.id}|${comp}`);
      if (real) {
        const totalCent = cent(real.total_atual ?? 0);
        const terceirosCent = recByStatement.get(real.id) ?? 0;
        out.push({
          cardId: card.id,
          cardNome: card.nome,
          cardCor: card.cor,
          competencia: comp,
          dataFechamento: real.data_fechamento,
          dataVencimento: real.data_vencimento,
          total: reais(totalCent),
          meu: reais(totalCent - terceirosCent),
          terceiros: reais(terceirosCent),
          status: statusEfetivo(
            {
              data_fechamento: real.data_fechamento,
              data_vencimento: real.data_vencimento,
              pago_em: real.pago_em,
            },
            hoje,
          ),
          virtual: false,
        });
      } else {
        out.push({
          cardId: card.id,
          cardNome: card.nome,
          cardCor: card.cor,
          competencia: comp,
          dataFechamento: ciclo.dataFechamento,
          dataVencimento: ciclo.dataVencimento,
          total: 0,
          meu: 0,
          terceiros: 0,
          status: "aberta",
          virtual: true,
        });
      }
      ciclo = resolverFatura(
        nextDayISO(ciclo.dataFechamento),
        card.dia_fechamento,
        card.dia_vencimento,
      );
    }
  }

  return out.sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento));
}

/* ───────────────────────────── Projeção dos próximos meses ───────────────────────────── */

export type ProjecaoPonto = {
  mes: string;
  faturas: number;
  recorrencias: number;
  contasFixas: number;
  total: number;
};

/** Quantas ocorrências de uma recorrência caem dentro de `mes` ('yyyy-MM'). */
function ocorrenciasNoMes(rec: DashRecurrence, mes: string): number {
  const [y, m] = mes.split("-").map(Number);
  const inicio = new Date(y, m - 1, 1).getTime();
  const fim = new Date(y, m - 1, getDaysInMonth(new Date(y, m - 1, 1))).getTime();
  const end = rec.end_date ? parseISO(rec.end_date).getTime() : null;
  let count = 0;
  for (let i = 0; i < 4000; i++) {
    const occIso = occurrenceOn(rec.anchor_date, rec.frequency, rec.interval_count, i);
    const ts = parseISO(occIso).getTime();
    if (ts > fim) break;
    if (end !== null && ts > end) break;
    if (ts >= inicio) count++;
  }
  return count;
}

export function projecaoProximosMeses(params: {
  hoje: string;
  meses: string[];
  statements: DashStatement[];
  recorrencias: DashRecurrence[];
  bills: DashBill[];
}): ProjecaoPonto[] {
  const { meses, statements, recorrencias, bills } = params;

  const faturaCentPorMes = new Map<string, number>();
  for (const s of statements) {
    if (!s.card_id) continue;
    const m = mesDe(s.competencia);
    faturaCentPorMes.set(m, (faturaCentPorMes.get(m) ?? 0) + cent(s.total_atual ?? 0));
  }

  const contasFixasCent = bills
    .filter((b) => b.is_active)
    .reduce((s, b) => s + cent(b.amount), 0);

  return meses.map((mes) => {
    const faturasCent = faturaCentPorMes.get(mes) ?? 0;
    let recorrCent = 0;
    for (const rec of recorrencias) {
      if (!rec.is_active || rec.type !== "despesa") continue;
      recorrCent += ocorrenciasNoMes(rec, mes) * cent(rec.amount);
    }
    return {
      mes,
      faturas: reais(faturasCent),
      recorrencias: reais(recorrCent),
      contasFixas: reais(contasFixasCent),
      total: reais(faturasCent + recorrCent + contasFixasCent),
    };
  });
}

/* ───────────────────────────── A receber & próximas contas ───────────────────────────── */

/** Total ainda a receber de terceiros (status pendente/cobrado). */
export function totalAReceber(receivables: DashReceivable[]): number {
  const c = receivables
    .filter((r) => (RECEIVABLE_OPEN_STATUSES as string[]).includes(r.status))
    .reduce((s, r) => s + cent(r.valor), 0);
  return reais(c);
}

export type ProximasContas = {
  total: number;
  count: number;
  proxima: { nome: string; data: string; valor: number } | null;
};

/** Próxima ocorrência (>= hoje) de um vencimento mensal no dia `dueDay` (clampado ao mês). */
function proximoVencimento(hoje: string, dueDay: number): string {
  const [y, m, d] = hoje.split("-").map(Number);
  const clamp = (yy: number, mm: number) =>
    Math.min(Math.max(1, dueDay), getDaysInMonth(new Date(yy, mm, 1)));
  const esteMes = new Date(y, m - 1, clamp(y, m - 1));
  if (esteMes.getDate() >= d) return format(esteMes, ISO);
  const prox = addMonths(new Date(y, m - 1, 1), 1);
  return format(
    new Date(prox.getFullYear(), prox.getMonth(), clamp(prox.getFullYear(), prox.getMonth())),
    ISO,
  );
}

/** Contas fixas ativas a vencer dentro dos próximos `dias` (default 31). */
export function proximasContasPagar(params: {
  hoje: string;
  bills: DashBill[];
  dias?: number;
}): ProximasContas {
  const { hoje, bills, dias = 31 } = params;
  const [hy, hm, hd] = hoje.split("-").map(Number);
  const limite = format(new Date(hy, hm - 1, hd + dias), ISO);

  const venc = bills
    .filter((b) => b.is_active)
    .map((b) => ({ nome: b.name, data: proximoVencimento(hoje, b.due_day), valor: b.amount }))
    .filter((b) => b.data >= hoje && b.data <= limite)
    .sort((a, b) => a.data.localeCompare(b.data));

  const totalCent = venc.reduce((s, b) => s + cent(b.valor), 0);
  return { total: reais(totalCent), count: venc.length, proxima: venc[0] ?? null };
}

/* ───────────────────────────── Alertas ───────────────────────────── */

export type Alerta = {
  kind: "gasto_alto" | "limite_cartao" | "vencimento";
  severity: "warning" | "danger";
  title: string;
  detail: string;
  valor?: number;
};

export function gerarAlertas(params: {
  hoje: string;
  resumoAtual: ResumoMes;
  mediaSaidas: number;
  cards: DashCard[];
  statements: DashStatement[];
  receivables: DashReceivable[];
  diasVencimentoAviso?: number;
  limiarGastoAltoPct?: number;
  limiarLimitePct?: number;
}): Alerta[] {
  const {
    hoje,
    resumoAtual,
    mediaSaidas,
    cards,
    statements,
    diasVencimentoAviso = 5,
    limiarGastoAltoPct = 1.2,
    limiarLimitePct = 0.8,
  } = params;

  const alertas: Alerta[] = [];

  // Gasto alto: saídas do mês acima da média recente × limiar.
  if (mediaSaidas > 0 && resumoAtual.saidas > mediaSaidas * limiarGastoAltoPct) {
    alertas.push({
      kind: "gasto_alto",
      severity: "warning",
      title: "Gasto acima da média",
      detail: `As saídas do mês superam a média recente em ${Math.round(
        (resumoAtual.saidas / mediaSaidas - 1) * 100,
      )}%.`,
      valor: resumoAtual.saidas,
    });
  }

  // Limite do cartão: soma das faturas não pagas vs limite total.
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const usadoPorCartao = new Map<string, number>();
  for (const s of statements) {
    if (!s.card_id) continue;
    const eff = statusEfetivo(
      {
        data_fechamento: s.data_fechamento,
        data_vencimento: s.data_vencimento,
        pago_em: s.pago_em,
      },
      hoje,
    );
    if (eff === "paga") continue;
    usadoPorCartao.set(
      s.card_id,
      (usadoPorCartao.get(s.card_id) ?? 0) + cent(s.total_atual ?? 0),
    );
  }
  for (const [cardId, usadoCent] of usadoPorCartao) {
    const card = cardById.get(cardId);
    if (!card || card.limite_total <= 0) continue;
    const limiteCent = cent(card.limite_total);
    const pct = usadoCent / limiteCent;
    if (pct >= limiarLimitePct) {
      alertas.push({
        kind: "limite_cartao",
        severity: pct >= 1 ? "danger" : "warning",
        title: `Limite do cartão ${card.nome}`,
        detail: `${Math.round(pct * 100)}% do limite comprometido em faturas em aberto.`,
        valor: reais(usadoCent),
      });
    }
  }

  // Vencimento: fatura fechada vencendo em breve, ou já atrasada.
  const [hy, hm, hd] = hoje.split("-").map(Number);
  const limiteAviso = format(new Date(hy, hm - 1, hd + diasVencimentoAviso), ISO);
  for (const s of statements) {
    if (!s.card_id) continue;
    const eff = statusEfetivo(
      {
        data_fechamento: s.data_fechamento,
        data_vencimento: s.data_vencimento,
        pago_em: s.pago_em,
      },
      hoje,
    );
    const card = cardById.get(s.card_id);
    const nome = card?.nome ?? "cartão";
    if (eff === "atrasada") {
      alertas.push({
        kind: "vencimento",
        severity: "danger",
        title: `Fatura atrasada — ${nome}`,
        detail: `Venceu em ${s.data_vencimento.split("-").reverse().join("/")} e não foi paga.`,
        valor: reais(cent(s.total_atual ?? 0)),
      });
    } else if (
      eff === "fechada" &&
      s.data_vencimento >= hoje &&
      s.data_vencimento <= limiteAviso
    ) {
      alertas.push({
        kind: "vencimento",
        severity: "warning",
        title: `Fatura a vencer — ${nome}`,
        detail: `Vence em ${s.data_vencimento.split("-").reverse().join("/")}.`,
        valor: reais(cent(s.total_atual ?? 0)),
      });
    }
  }

  return alertas;
}
