/**
 * REDESIGN-03-B — O pipeline do motor financeiro: UMA tradução entre a linha do banco e a
 * entrada das funções puras de `dashboard.ts`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE É O ÚNICO ARQUIVO QUE MONTA UM `Dash*`. Até a 03-B a tradução estava copiada   ║
 * ║ em quatro arquivos (os dois cards do dashboard, o relatório, a página do dashboard    ║
 * ║ financeiro e o Cron) — 24 montagens à mão, cada uma envelhecendo por conta própria:   ║
 * ║ o Cron escrevia `category_id: null` como constante, o card de faturas não derivava   ║
 * ║ `ref_month`. `pipeline.test.ts` varre `src/` e reprova montagem fora daqui.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * PURO: sem `server-only`, sem Supabase, sem `Date.now()`. É importado por uma PÁGINA
 * (`dashboard/financeiro/page.tsx`) e pelo Cron — nenhum dos dois pode arrastar runtime por
 * causa dele. A leitura que o alimenta mora em `finance/queries.ts` (`lerFinanceiro`), junto
 * das oito leituras que ela orquestra; o Cron entra só por aqui (ver o desenho, §3.1).
 *
 * Desenho validado com o dono: `docs/superpowers/specs/2026-09-27-03b-pipeline-financeiro-design.md`.
 */
import {
  addMes,
  proximosMeses,
  ultimosMeses,
  type DashBill,
  type DashCard,
  type DashInstallmentItem,
  type DashReceivable,
  type DashRecurrence,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";
import { toDateInputValue } from "@/lib/format";

/* ───────────────────────────── Tipos de linha (tolerantes) ───────────────────────────── */

/**
 * Dinheiro vem do banco como `numeric`. O client tipado entrega `number`; um `select` cru
 * (o do Cron) pode entregar texto. A normalização é UMA, aqui — antes o Cron escrevia
 * `Number(...)` campo a campo e as telas não convertiam nada.
 */
type Dinheiro = number | string;

type CategoriaEmbutida = { id: string; name: string; color: string | null };

/**
 * Linha de lançamento. TOLERANTE, não frouxa: o que um chamador não traz é opcional (o
 * `select` do Cron não tem `category`, `category_id` nem embeds), mas os quatro campos sem os
 * quais `resumoMes` não tem o que somar continuam obrigatórios.
 */
export type LinhaTx = {
  amount: Dinheiro;
  type: DashTx["type"];
  status: DashTx["status"];
  competence_date: string;
  valor_pessoal?: Dinheiro | null;
  payment_method?: DashTx["payment_method"];
  card_id?: string | null;
  statement_id?: string | null;
  parcelado?: boolean | null;
  category_id?: string | null;
  category?: CategoriaEmbutida | null;
};

export type LinhaFatura = {
  id: string;
  card_id: string | null;
  competencia: string;
  data_fechamento: string;
  data_vencimento: string;
  pago_em: string | null;
  total_atual: Dinheiro | null;
};

/**
 * Recebível. Os embeds `statement`/`transaction` só existem na leitura completa
 * (`getReceivables`); é deles que sai `ref_month`.
 */
export type LinhaRecebivel = {
  statement_id: string | null;
  installment_id: string | null;
  valor: Dinheiro;
  status: string;
  statement?: { competencia?: string | null } | null;
  transaction?: { purchase_date?: string | null } | null;
};

export type LinhaParcela = {
  id: string;
  statement_id: string | null;
  valor: Dinheiro;
  status: string;
  parent?: { category?: CategoriaEmbutida | null } | null;
};

export type LinhaCartao = {
  id: string;
  nome: string;
  cor: string | null;
  limite_total: Dinheiro;
  dia_fechamento: number;
  dia_vencimento: number;
};

export type LinhaRecorrencia = {
  amount: Dinheiro;
  type: DashRecurrence["type"];
  frequency: DashRecurrence["frequency"];
  interval_count: number;
  anchor_date: string;
  next_due_date: string;
  end_date: string | null;
  is_active: boolean;
};

export type LinhaContaFixa = {
  name: string;
  amount: Dinheiro;
  due_day: number;
  is_active: boolean;
};

export type LinhasFinanceiras = {
  transacoes?: readonly LinhaTx[];
  faturas?: readonly LinhaFatura[];
  recebiveis?: readonly LinhaRecebivel[];
  parcelas?: readonly LinhaParcela[];
  cartoes?: readonly LinhaCartao[];
  recorrencias?: readonly LinhaRecorrencia[];
  contasFixas?: readonly LinhaContaFixa[];
};

export type EntradasDoMotor = {
  txs: DashTx[];
  sts: DashStatement[];
  recs: DashReceivable[];
  /**
   * ⚠️ RISCO R1 DO DESENHO — `[]` QUANDO O ESCOPO NÃO LÊ PARCELAS.
   *
   * Parcela lançada não está em `transactions`: quem ocupa a fatura de cada mês é
   * `transaction_installments`. `gastosPorCategoria`/`gastosPorForma` chamados com `inst` vazio
   * perdem TODO gasto de parcelamento, em silêncio — comportamento que a 03-A congelou. Só
   * `ESCOPO_RELATORIO` lê parcelas; a trava de verdade (recusar `inst` ausente havendo parcela
   * no mês) muda comportamento e fica para a REDESIGN-05.
   */
  inst: DashInstallmentItem[];
  cards: DashCard[];
  recorrencias: DashRecurrence[];
  bills: DashBill[];
};

/* ───────────────────────────── Normalização ───────────────────────────── */

function num(v: Dinheiro): number {
  return typeof v === "number" ? v : Number(v);
}

/**
 * ⚠️ `undefined` vira `null`, e não `undefined`: quem lê `valor_pessoal` faz
 * `valor_pessoal ?? amount`, e os dois caem no mesmo ramo. Devolver `0` aqui diria "minha parte
 * é zero" para um lançamento sem divisão.
 */
function numOuNulo(v: Dinheiro | null | undefined): number | null {
  return v == null ? null : num(v);
}

/* ───────────────────────────── A montagem ───────────────────────────── */

/**
 * Linha do banco → entrada do motor. Lista não informada volta `[]`.
 *
 * As cinco regras de forma (desenho, §4.1), cada uma existindo por um dos chamadores:
 *  1. linhas tolerantes, com os quatro campos de `resumoMes` obrigatórios;
 *  2. dinheiro aceita `number | string` e é normalizado aqui;
 *  3. `category_id` sai do DADO (`?? null`) — antes o Cron o escrevia como constante `null`,
 *     e um `gastosPorCategoria` chamado ali jogaria todo gasto em "sem categoria";
 *  4. `ref_month` é SEMPRE derivado dos embeds — sem eles, `null` (o card de faturas não o
 *     derivava, e `totalAReceber(recs, mes)` ali daria zero);
 *  5. `parent` da parcela é `{ category: null }`, nunca `null`.
 */
export function montarEntradas(linhas: LinhasFinanceiras): EntradasDoMotor {
  const txs: DashTx[] = (linhas.transacoes ?? []).map((t) => ({
    amount: num(t.amount),
    valor_pessoal: numOuNulo(t.valor_pessoal),
    type: t.type,
    payment_method: t.payment_method ?? null,
    status: t.status,
    competence_date: t.competence_date,
    card_id: t.card_id ?? null,
    statement_id: t.statement_id ?? null,
    parcelado: Boolean(t.parcelado),
    category_id: t.category_id ?? null,
    category: t.category
      ? { id: t.category.id, name: t.category.name, color: t.category.color }
      : null,
  }));

  const sts: DashStatement[] = (linhas.faturas ?? []).map((s) => ({
    id: s.id,
    card_id: s.card_id,
    competencia: s.competencia,
    data_fechamento: s.data_fechamento,
    data_vencimento: s.data_vencimento,
    pago_em: s.pago_em,
    total_atual: numOuNulo(s.total_atual),
  }));

  const recs: DashReceivable[] = (linhas.recebiveis ?? []).map((r) => ({
    statement_id: r.statement_id,
    installment_id: r.installment_id,
    valor: num(r.valor),
    status: r.status,
    // `competencia` e `purchase_date` são DATAS PURAS (`date`): o `.slice(0, 7)` é correto aqui.
    // A proibição do projeto é sobre `timestamptz`.
    ref_month:
      r.statement?.competencia?.slice(0, 7) ??
      r.transaction?.purchase_date?.slice(0, 7) ??
      null,
  }));

  const inst: DashInstallmentItem[] = (linhas.parcelas ?? []).map((it) => ({
    id: it.id,
    statement_id: it.statement_id,
    valor: num(it.valor),
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

  const cards: DashCard[] = (linhas.cartoes ?? []).map((c) => ({
    id: c.id,
    nome: c.nome,
    cor: c.cor,
    limite_total: num(c.limite_total),
    dia_fechamento: c.dia_fechamento,
    dia_vencimento: c.dia_vencimento,
  }));

  const recorrencias: DashRecurrence[] = (linhas.recorrencias ?? []).map((r) => ({
    amount: num(r.amount),
    type: r.type,
    frequency: r.frequency,
    interval_count: r.interval_count,
    anchor_date: r.anchor_date,
    next_due_date: r.next_due_date,
    end_date: r.end_date,
    is_active: r.is_active,
  }));

  const bills: DashBill[] = (linhas.contasFixas ?? []).map((b) => ({
    name: b.name,
    amount: num(b.amount),
    due_day: b.due_day,
    is_active: b.is_active,
  }));

  return { txs, sts, recs, inst, cards, recorrencias, bills };
}

/**
 * Saldo somado das contas — a conta que o card do dashboard, o relatório e a página faziam cada
 * um com o seu `reduce`. Recebe as contas CRUAS: devolver `saldo: number` de `lerFinanceiro`
 * obrigaria a inventar `0` para "não pedi contas".
 */
export function saldoDasContas(contas: readonly { current_balance: number | null }[]): number {
  return contas.reduce((s, a) => s + (a.current_balance ?? 0), 0);
}

/* ───────────────────────────── Janelas declaradas ───────────────────────────── */

/**
 * Último dia do mês 'yyyy-MM' como 'yyyy-MM-dd'.
 *
 * ⚠️ NÃO é o `fimDoMes` de `src/lib/ai/insights/temporal.ts`: aquele recebe 'yyyy-MM-dd' e usa
 * `Date.UTC`. Reusá-lo faria `finance/` depender do módulo de IA — a seta ao contrário. O nome
 * é outro para que um autocomplete distraído não importe o errado.
 */
export function ultimoDiaDoMes(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return toDateInputValue(new Date(y, m, 0));
}

export type JanelaFinanceira = { from: string; to: string };

/** O mês inteiro — a janela do card do dashboard. */
export function janelaDoMes(mes: string): JanelaFinanceira {
  return { from: `${mes}-01`, to: ultimoDiaDoMes(mes) };
}

/**
 * A janela do relatório e da página do dashboard financeiro: 6 meses para trás do selecionado
 * (evolução) até 6 meses à frente do ATUAL (projeção). Devolve as duas listas de meses junto
 * porque os dois chamadores precisam delas depois — recalculá-las reabriria a mesma cópia.
 */
export function janelaDoRelatorio(params: {
  mesSel: string;
  mesAtual: string;
}): JanelaFinanceira & { evoMeses: string[]; projMeses: string[] } {
  const evoMeses = ultimosMeses(params.mesSel, 6);
  const projMeses = proximosMeses(params.mesAtual, 6);
  return {
    from: `${evoMeses[0]}-01`,
    to: ultimoDiaDoMes(projMeses[projMeses.length - 1]),
    evoMeses,
    projMeses,
  };
}

/**
 * A janela de transações do Cron: 3 meses para trás até `ate`.
 *
 * ⚠️ O TRUNCAMENTO EM `ate` É DECLARADO, NÃO CONSERTADO. O Cron lê transações só até hoje, mas
 * lê TODAS as faturas — então a "saída do mês" do sino é, dentro do mês corrente,
 * estruturalmente MENOR que a da tela: o à vista conta até hoje, o cartão conta a fatura
 * inteira. Consertar muda número (e o alerta de gasto alto); é decisão do dono, fora da 03-B.
 */
export function janelaDoCron(params: { mesAtual: string; ate: string }): JanelaFinanceira {
  return { from: `${addMes(params.mesAtual, -3)}-01`, to: params.ate };
}

/* ───────────────────────────── Escopos nomeados ───────────────────────────── */

/**
 * Card do dashboard: contas, faturas, recebíveis, contas fixas e transações do mês.
 *
 * ⚠️ NÃO LÊ PARCELAS: `entradas.inst` volta `[]` (risco R1 — ver `EntradasDoMotor.inst`).
 * Serve para `resumoMes`/`totalAReceber`/`proximasContasPagar`; NÃO serve para
 * `gastosPorCategoria` nem `gastosPorForma`.
 */
export const ESCOPO_CARD_FINANCEIRO = {
  nome: "card-financeiro",
  contas: true,
  cartoes: false,
  faturas: true,
  recebiveis: true,
  contasFixas: true,
  recorrencias: false,
  transacoes: true,
  parcelas: false,
} as const;

/** Card de faturas: cartões, faturas e recebíveis. Não lê transações — a janela é ignorada. */
export const ESCOPO_FATURAS = {
  nome: "faturas",
  contas: false,
  cartoes: true,
  faturas: true,
  recebiveis: true,
  contasFixas: false,
  recorrencias: false,
  transacoes: false,
  parcelas: false,
} as const;

/** Relatório e página do dashboard financeiro: tudo, INCLUINDO parcelas. */
export const ESCOPO_RELATORIO = {
  nome: "relatorio",
  contas: true,
  cartoes: true,
  faturas: true,
  recebiveis: true,
  contasFixas: true,
  recorrencias: true,
  transacoes: true,
  parcelas: true,
} as const;

/**
 * Um dos três escopos, e só. A união das três formas literais faz uma combinação solta
 * (ex.: o card com parcelas) não tipar — ninguém escreve um objeto de escopo à mão.
 */
export type EscopoFinanceiro =
  | typeof ESCOPO_CARD_FINANCEIRO
  | typeof ESCOPO_FATURAS
  | typeof ESCOPO_RELATORIO;
