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
import {
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
} from "@/lib/finance/constants";
import { toDateInputValue } from "@/lib/format";

/* ───────────────────────────── Tipos de linha (estritos) ───────────────────────────── */

/**
 * Dinheiro vem do banco como `numeric`. O client tipado entrega `number`; um `select` cru
 * (o do Cron) pode entregar texto. A normalização é UMA, aqui — antes o Cron escrevia
 * `Number(...)` campo a campo e as telas não convertiam nada.
 */
type Dinheiro = number | string;

type CategoriaEmbutida = { id: string; name: string; color: string | null };

/**
 * Relação embutida pelo PostgREST. O client tipado pode entregá-la como objeto OU como lista
 * (o `one()` do Cron existia por isso), e a linha não mente sobre a forma: `primeiro()`
 * normaliza, num lugar só.
 */
export type Embutido<T> = T | readonly T[] | null;

/**
 * Linha de lançamento. ESTRITA (03-B2, A2): nenhuma chave é opcional — campo que um chamador
 * não tem é `null` escrito, e chave ausente é erro de compilação, não `null` silencioso (o R4 da
 * 03-B). Os quatro campos de `resumoMes` seguem obrigatórios e não anuláveis.
 *
 * ⚠️ `type`, `status` e `payment_method` são `string`: é o que o client gerado entrega para
 * colunas `text` com CHECK. `montarEntradas` ESTREITA pelos arrays de `finance/constants.ts`, que
 * batem com os CHECKs vigentes — ver `dominioDoLancamento`.
 */
export type LinhaTx = {
  amount: Dinheiro;
  type: string;
  status: string;
  competence_date: string;
  valor_pessoal: Dinheiro | null;
  payment_method: string | null;
  card_id: string | null;
  statement_id: string | null;
  parcelado: boolean | null;
  category_id: string | null;
  category: Embutido<CategoriaEmbutida>;
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
 * Recebível. `ref_month` sai dos embeds `statement`/`transaction` — a leitura das telas
 * (`getReceivables`) e, desde a 03-B2, também a do Cron os trazem.
 */
export type LinhaRecebivel = {
  statement_id: string | null;
  installment_id: string | null;
  valor: Dinheiro;
  status: string;
  statement: Embutido<{ competencia: string | null }>;
  transaction: Embutido<{ purchase_date: string | null }>;
};

export type LinhaParcela = {
  id: string;
  statement_id: string | null;
  valor: Dinheiro;
  status: string;
  parent: Embutido<{ category: Embutido<CategoriaEmbutida> }>;
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

export type CompletudeFinanceira =
  | { readonly estado: "exato" }
  | { readonly estado: "parcial"; readonly motivos: readonly [string, ...string[]] };

/** Uma leitura parcial sempre declara ao menos um motivo. */
export function completudeDe(motivos: readonly string[]): CompletudeFinanceira {
  const [primeiro, ...restantes] = motivos;
  return primeiro === undefined
    ? { estado: "exato" }
    : { estado: "parcial", motivos: [primeiro, ...restantes] };
}

export type EntradasDoMotor = {
  txs: DashTx[];
  sts: DashStatement[];
  recs: DashReceivable[];
  /**
   * ⚠️ R1 DA 03-B, FECHADO NA 03-B2 (A1). Parcela lançada não está em `transactions`: quem ocupa
   * a fatura de cada mês é `transaction_installments`, e `gastosPorCategoria`/`gastosPorForma`
   * com `inst` vazio perdem TODO gasto de parcelamento, em silêncio. Por isso quem não leu
   * parcelas não recebe `inst` NENHUM — nem no tipo (`EntradasDasLinhas`/`EntradasDoEscopo`),
   * nem no objeto. A trava de runtime que a 03-B empurrava para a REDESIGN-05 deixou de ser
   * necessária: `inst` ausente é erro de compilação, e `inst` vazio só existe escrito à mão.
   */
  inst: DashInstallmentItem[];
  cards: DashCard[];
  recorrencias: DashRecurrence[];
  bills: DashBill[];
};

/** Qual campo do motor cada lista lida produz. */
type SaidaDaLeitura = {
  transacoes: "txs";
  faturas: "sts";
  recebiveis: "recs";
  parcelas: "inst";
  cartoes: "cards";
  recorrencias: "recorrencias";
  contasFixas: "bills";
};

/** Chave opcional ou que aceite undefined não garante uma leitura. */
type ChavesInformadas<L> = {
  [K in keyof L]-?: undefined extends L[K] ? never : K;
}[keyof L];

export type EntradasDasLinhas<L extends LinhasFinanceiras> = Pick<
  EntradasDoMotor,
  SaidaDaLeitura[ChavesInformadas<L> & keyof SaidaDaLeitura]
>;

/** Na união de escopos, promete apenas as leituras presentes em TODOS eles. */
export type EntradasDoEscopo<E extends EscopoFinanceiro> = Pick<
  EntradasDoMotor,
  { [K in keyof SaidaDaLeitura]: E[K] extends true ? SaidaDaLeitura[K] : never }[keyof SaidaDaLeitura]
>;

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

function ehLista<T>(v: T | readonly T[]): v is readonly T[] {
  return Array.isArray(v);
}

/** Embed → o objeto, ou `null`. Lista vazia é ausência, não objeto vazio. */
function primeiro<T>(v: Embutido<T>): T | null {
  if (v == null) return null;
  return ehLista(v) ? (v[0] ?? null) : v;
}

function doConjunto<T extends string>(conjunto: readonly T[], v: string): v is T {
  return (conjunto as readonly string[]).includes(v);
}

/**
 * O ÚNICO predicado de domínio do lançamento — `montarEntradas` e `lancamentosForaDoDominio`
 * usam este, e nenhum outro.
 *
 * ⚠️ DECISÃO DO DONO (03-B2, A2): ESTREITAR E DECLARAR. Lançamento com tipo, status ou forma de
 * pagamento fora do que o sistema conhece NÃO entra na soma — e é contado, para que quem lê
 * possa dizer "parcial" com o motivo. Nunca lança: um lançamento estranho não pode calar o sino
 * inteiro de um usuário (o `catch` do Cron é por usuário, e levaria a fatura atrasada junto).
 * Para dado real o número é idêntico: os arrays batem com os CHECKs de `transactions`.
 */
function dominioDoLancamento(
  t: LinhaTx,
): Pick<DashTx, "type" | "status" | "payment_method"> | null {
  const { type, status, payment_method } = t;
  if (!doConjunto(TRANSACTION_TYPES, type)) return null;
  if (!doConjunto(TRANSACTION_STATUSES, status)) return null;
  if (payment_method !== null && !doConjunto(PAYMENT_METHODS, payment_method)) return null;
  return { type, status, payment_method };
}

/** Quantos lançamentos `montarEntradas` deixou fora da soma por estarem fora do domínio. */
export function lancamentosForaDoDominio(transacoes: readonly LinhaTx[]): number {
  return transacoes.filter((t) => dominioDoLancamento(t) === null).length;
}

/* ───────────────────────────── A montagem ───────────────────────────── */

/**
 * Linha do banco → entrada do motor. Lista não informada deixa a chave ausente.
 *
 * As cinco regras de forma (desenho da 03-B, §4.1), cada uma existindo por um dos chamadores:
 *  1. linhas ESTRITAS desde a 03-B2 (toda chave presente; lançamento fora do domínio sai da
 *     soma e é contado por `lancamentosForaDoDominio`);
 *  2. dinheiro aceita `number | string` e é normalizado aqui;
 *  3. `category_id` sai do DADO (`?? null`) — antes o Cron o escrevia como constante `null`,
 *     e um `gastosPorCategoria` chamado ali jogaria todo gasto em "sem categoria";
 *  4. `ref_month` é SEMPRE derivado dos embeds — sem eles, `null` (o card de faturas não o
 *     derivava, e `totalAReceber(recs, mes)` ali daria zero);
 *  5. `parent` da parcela é `{ category: null }`, nunca `null`.
 */
export function montarEntradas<L extends LinhasFinanceiras>(linhas: L): EntradasDasLinhas<L> {
  const entradas: Partial<EntradasDoMotor> = {};

  if (linhas.transacoes !== undefined) {
    const txs: DashTx[] = linhas.transacoes.flatMap((t) => {
      const dominio = dominioDoLancamento(t);
      if (dominio === null) return [];
      const categoria = primeiro(t.category);
      return [
        {
          amount: num(t.amount),
          valor_pessoal: numOuNulo(t.valor_pessoal),
          type: dominio.type,
          payment_method: dominio.payment_method,
          status: dominio.status,
          competence_date: t.competence_date,
          card_id: t.card_id,
          statement_id: t.statement_id,
          parcelado: Boolean(t.parcelado),
          category_id: t.category_id,
          category: categoria
            ? { id: categoria.id, name: categoria.name, color: categoria.color }
            : null,
        },
      ];
    });
    entradas.txs = txs;
  }

  if (linhas.faturas !== undefined) {
    const sts: DashStatement[] = linhas.faturas.map((s) => ({
      id: s.id,
      card_id: s.card_id,
      competencia: s.competencia,
      data_fechamento: s.data_fechamento,
      data_vencimento: s.data_vencimento,
      pago_em: s.pago_em,
      total_atual: numOuNulo(s.total_atual),
    }));
    entradas.sts = sts;
  }

  if (linhas.recebiveis !== undefined) {
    const recs: DashReceivable[] = linhas.recebiveis.map((r) => ({
      statement_id: r.statement_id,
      installment_id: r.installment_id,
      valor: num(r.valor),
      status: r.status,
      // `competencia` e `purchase_date` são DATAS PURAS (`date`): o `.slice(0, 7)` é correto aqui.
      // A proibição do projeto é sobre `timestamptz`.
      ref_month:
        primeiro(r.statement)?.competencia?.slice(0, 7) ??
        primeiro(r.transaction)?.purchase_date?.slice(0, 7) ??
        null,
    }));
    entradas.recs = recs;
  }

  if (linhas.parcelas !== undefined) {
    const inst: DashInstallmentItem[] = linhas.parcelas.map((it) => {
      const categoria = primeiro(primeiro(it.parent)?.category ?? null);
      return {
        id: it.id,
        statement_id: it.statement_id,
        valor: num(it.valor),
        status: it.status,
        parent: categoria
          ? { category: { id: categoria.id, name: categoria.name, color: categoria.color } }
          : { category: null },
      };
    });
    entradas.inst = inst;
  }

  if (linhas.cartoes !== undefined) {
    const cards: DashCard[] = linhas.cartoes.map((c) => ({
      id: c.id,
      nome: c.nome,
      cor: c.cor,
      limite_total: num(c.limite_total),
      dia_fechamento: c.dia_fechamento,
      dia_vencimento: c.dia_vencimento,
    }));
    entradas.cards = cards;
  }

  if (linhas.recorrencias !== undefined) {
    const recorrencias: DashRecurrence[] = linhas.recorrencias.map((r) => ({
      amount: num(r.amount),
      type: r.type,
      frequency: r.frequency,
      interval_count: r.interval_count,
      anchor_date: r.anchor_date,
      next_due_date: r.next_due_date,
      end_date: r.end_date,
      is_active: r.is_active,
    }));
    entradas.recorrencias = recorrencias;
  }

  if (linhas.contasFixas !== undefined) {
    const bills: DashBill[] = linhas.contasFixas.map((b) => ({
      name: b.name,
      amount: num(b.amount),
      due_day: b.due_day,
      is_active: b.is_active,
    }));
    entradas.bills = bills;
  }

  // O TS não relaciona as atribuições condicionais às chaves obrigatórias de L.
  // Cada chave só é escrita com lista !== undefined; pipeline.test.ts confere as chaves.
  return entradas as EntradasDasLinhas<L>;
}

export { saldoDasContas } from "@/lib/finance/saldo-das-contas";

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
 * NÃO LÊ PARCELAS: `entradas.inst` fica ausente do tipo e do objeto (R1).
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

/** Card de faturas: cartões, faturas e recebíveis. Não lê transações nem recebe janela. */
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
