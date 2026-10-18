/**
 * REDESIGN-03-E · A1 — AS REGRAS PURAS DA BASE CAIXA (E6; §13.2 do dicionário).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Competência diz DE QUANDO é o gasto; caixa diz QUANDO o dinheiro mexeu na conta. A   ║
 * ║ base caixa mora AQUI, num módulo próprio que IMPORTA do motor (`meuCentavos`,        ║
 * ║ `resumoMes`, `variacaoPct`) e do recebimento parcial — e o motor (`dashboard.ts`)    ║
 * ║ nunca importa este arquivo nem conhece a data de caixa (P3). É o que deixa a base    ║
 * ║ competência intocada por construção.                                                 ║
 * ║                                                                                      ║
 * ║ ⛔ A data de caixa é `liquidado_em` ou, na falta dela, a COMPETÊNCIA — nunca a data  ║
 * ║    da compra. Quando cai na competência, é APROXIMADA, e a tela diz quantas.         ║
 * ║ ⛔ Puro: sem I/O, sem `Date.now()`, sem `new Date()` sem argumento. Datas são texto  ║
 * ║    'yyyy-MM-dd' e a comparação é lexicográfica (P5).                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `transactions.amount` é `numeric(14,2)` em REAIS (invariante 63): toda soma é em CENTAVOS
 * por dentro e só vira reais na saída.
 */
import {
  type Comparativo,
  type ResumoMes,
  type DashReceivable,
  type DashTx,
  meuCentavos,
  resumoMes,
  variacaoPct,
} from "@/lib/finance/dashboard";
import {
  SETTLED_STATUSES,
  type PaymentMethod,
  type TransactionStatus,
  type TransactionType,
} from "@/lib/finance/constants";
import {
  type RecebivelComRecebimentos,
  reembolsosRecebidosNoPeriodo,
} from "@/lib/finance/recebimentos";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";

const cent = (v: number) => reaisParaCentavos(v);
const reais = (c: number) => centavosParaReais(c);

/* ───────────────────────────── Tipos ───────────────────────────── */

/** O lançamento como a base caixa o lê. Tipo próprio: a coluna `liquidado_em` nasce na 03-E. */
export type TxDeCaixa = {
  id: string;
  type: TransactionType;
  status: TransactionStatus;
  /** Em REAIS, sempre >= 0. */
  amount: number;
  valor_pessoal: number | null;
  /** 'yyyy-MM-dd'. */
  competence_date: string;
  /** 'yyyy-MM-dd' | null — quando o dinheiro de fato mexeu na conta. */
  liquidado_em: string | null;
  account_id: string | null;
  transfer_account_id: string | null;
  card_id: string | null;
  /** Só os gráficos por forma/categoria leem (desenho 2026-10-18). Opcionais: os números não usam. */
  payment_method?: PaymentMethod | null;
  category?: { id: string; name: string; color: string | null } | null;
};

/** Período INCLUSIVO nas duas pontas, 'yyyy-MM-dd'. */
export type Periodo = { de: string; ate: string };

export type NumerosDoCaixa = {
  /** Σ da parte MINHA das receitas que tocaram conta (P1). */
  rendaPessoalRecebida: number;
  /** `reembolsosRecebidosNoPeriodo` — chamada, nunca recalculada (03-D). */
  reembolsosRecebidos: number;
  /** Σ (amount − meu) das mesmas receitas: o dinheiro de terceiros que entrou. */
  outrasEntradasDeTerceiros: number;
  /** Despesas com conta + pagamentos de fatura + transferências sem vínculo. */
  saidasDeCaixa: number;
  /** Parcela de `saidasDeCaixa`, para a tela abrir. */
  pagamentosDeFatura: number;
  /** Dentro de `saidasDeCaixa`, declaradas (não se sabe para onde foi o dinheiro). */
  transferenciasSemVinculo: { quantidade: number; total: number };
  /** Informativa: NÃO entra em renda, saída nem resultado. */
  transferenciasEntreContas: number;
  resultadoDeCaixa: number;
  /** Lançamentos contados em algum número cuja data de caixa é a competência (aproximada). */
  aproximados: number;
  /** Receita/despesa liquidada sem conta e sem cartão: não moveu conta nenhuma (P2). */
  semConta: number;
  /** K4: reembolso e "outras entradas" no mesmo período — pode haver contagem em dobro. */
  avisoDeSobreposicao: boolean;
};

/* ───────────────────────────── Data de caixa ───────────────────────────── */

/**
 * A data de caixa de um lançamento e se ela é aproximada. `liquidado_em` quando existe; senão a
 * competência, marcada como aproximada. ⛔ Nunca `purchase_date`.
 */
export function dataDeCaixa(t: Pick<TxDeCaixa, "liquidado_em" | "competence_date">): {
  data: string;
  aproximada: boolean;
} {
  return t.liquidado_em
    ? { data: t.liquidado_em, aproximada: false }
    : { data: t.competence_date, aproximada: true };
}

/**
 * O filtro `or` do PostgREST para a janela: com data de liquidação, vale ela; sem, vale a
 * competência. Afunila a consulta — a decisão final é `dataDeCaixa` (P11).
 */
export function filtroDaJanelaDeCaixa(p: Periodo): string {
  return (
    `and(liquidado_em.is.null,competence_date.gte.${p.de},competence_date.lte.${p.ate}),` +
    `and(liquidado_em.gte.${p.de},liquidado_em.lte.${p.ate})`
  );
}

/* ───────────────────────────── Os números do caixa ───────────────────────────── */

/**
 * Os números do §13.2 sobre os lançamentos `pago`/`recebido` (`SETTLED_STATUSES`) cuja data de
 * caixa cai em `periodo`. Cada lançamento entra em no máximo UM número; `ajuste`, compra e
 * estorno de cartão ficam fora de todos.
 */
export function numerosDoCaixa(params: {
  periodo: Periodo;
  transactions: readonly TxDeCaixa[];
  /** ids dos lançamentos que são pagamento de fatura (`card_statements.pago_transacao_id`). */
  pagamentosDeFatura: ReadonlySet<string>;
  recebiveis: readonly RecebivelComRecebimentos[];
}): NumerosDoCaixa {
  const { periodo, transactions, pagamentosDeFatura, recebiveis } = params;

  let rendaCent = 0;
  let outrasCent = 0;
  let saidasCent = 0;
  let pagamentosCent = 0;
  let semVinculoQtd = 0;
  let semVinculoCent = 0;
  let entreContasCent = 0;
  let aproximados = 0;
  let semConta = 0;

  for (const t of transactions) {
    if (!SETTLED_STATUSES.includes(t.status)) continue;
    const { data, aproximada } = dataDeCaixa(t);
    if (data < periodo.de || data > periodo.ate) continue;

    // Quanto este lançamento entrou em algum número (para o contador de aproximados).
    let contado = false;

    if (t.type === "receita") {
      // Estorno de cartão: já reduz a fatura e não cai em conta.
      if (t.card_id !== null) continue;
      if (t.account_id === null) {
        semConta += 1;
        continue;
      }
      const meu = meuCentavos(t);
      rendaCent += meu;
      outrasCent += cent(t.amount) - meu;
      contado = true;
    } else if (t.type === "despesa") {
      // Compra no cartão: quem sai da conta é o pagamento da fatura.
      if (t.card_id !== null) continue;
      if (t.account_id === null) {
        semConta += 1;
        continue;
      }
      saidasCent += cent(t.amount);
      contado = true;
    } else if (t.type === "transferencia") {
      if (pagamentosDeFatura.has(t.id)) {
        saidasCent += cent(t.amount);
        pagamentosCent += cent(t.amount);
        contado = true;
      } else if (t.account_id !== null && t.transfer_account_id !== null) {
        entreContasCent += cent(t.amount);
        contado = true;
      } else if (t.account_id !== null) {
        // Sem destino e sem vínculo: o dinheiro saiu, mas não se sabe para onde. Entra nas
        // saídas e é DECLARADO à parte.
        saidasCent += cent(t.amount);
        semVinculoQtd += 1;
        semVinculoCent += cent(t.amount);
        contado = true;
      } else {
        // Sem conta de origem: não se sabe de qual conta o dinheiro saiu. Fica fora, mas
        // CONTADA (P2) — nunca em silêncio.
        semConta += 1;
      }
    }
    // `ajuste`: fora de tudo.

    if (contado && aproximada) aproximados += 1;
  }

  const reembolsosCent = cent(reembolsosRecebidosNoPeriodo(recebiveis, periodo));

  return {
    rendaPessoalRecebida: reais(rendaCent),
    reembolsosRecebidos: reais(reembolsosCent),
    outrasEntradasDeTerceiros: reais(outrasCent),
    saidasDeCaixa: reais(saidasCent),
    pagamentosDeFatura: reais(pagamentosCent),
    transferenciasSemVinculo: { quantidade: semVinculoQtd, total: reais(semVinculoCent) },
    transferenciasEntreContas: reais(entreContasCent),
    resultadoDeCaixa: reais(rendaCent + reembolsosCent + outrasCent - saidasCent),
    aproximados,
    semConta,
    avisoDeSobreposicao: reembolsosCent > 0 && outrasCent > 0,
  };
}

/**
 * O total que ENTROU no caixa: renda pessoal + reembolsos + outras entradas de terceiros, somados
 * em centavos. Só para o card do topo e para a comparação — a tela continua mostrando as três
 * linhas SEPARADAS (K4), e este total nunca substitui nenhuma delas.
 */
export function entradasDoCaixa(n: NumerosDoCaixa): number {
  return reais(
    cent(n.rendaPessoalRecebida) + cent(n.reembolsosRecebidos) + cent(n.outrasEntradasDeTerceiros),
  );
}

/* ───────────────────────────── Corte "até o dia D" ───────────────────────────── */

/** O dia de `hoje` (número) quando `hoje` está em `mesSel` ('yyyy-MM'); senão `null` (mês fechado). */
export function diaDeCorte(mesSel: string, hoje: string): number | null {
  return hoje.slice(0, 7) === mesSel ? Number(hoje.slice(8, 10)) : null;
}

/** Último dia de 'yyyy-MM'. `Date.UTC` com argumentos: determinístico, sem depender do fuso. */
function ultimoDiaDoMes(mes: string): number {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

/**
 * De `mes-01` até o dia `dia` do mês — ou até o último dia dele, se `dia` não existir ali
 * (D = 31 em março × fevereiro).
 */
export function periodoAteODia(mes: string, dia: number): Periodo {
  const ate = Math.min(dia, ultimoDiaDoMes(mes));
  return { de: `${mes}-01`, ate: `${mes}-${String(ate).padStart(2, "0")}` };
}

/** Mês anterior de 'yyyy-MM', em texto (2026-01 → 2025-12). */
export function mesAnteriorDe(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return m === 1
    ? `${ano - 1}-12`
    : `${String(ano).padStart(4, "0")}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * O corte de COMPETÊNCIA até o dia D: o mesmo para `comparativoAteODia` e para o gráfico
 * "Mês a mês". Quem soma é o próprio `resumoMes` (P4), sobre os lançamentos cortados e
 * `statements: []` — entradas = `entradas`, saídas = só o à vista; o cartão fica fora sem
 * reimplementar regra nenhuma.
 */
function resumoAteODia(
  lado: string,
  dia: number,
  transactions: DashTx[],
  receivables: DashReceivable[],
): ResumoMes {
  const p = periodoAteODia(lado, dia);
  const cortadas = transactions.filter(
    (t) => t.competence_date >= p.de && t.competence_date <= p.ate,
  );
  // `statements: []`: a parte do cartão vem das faturas, então `saidas` aqui é só o à vista.
  return resumoMes({ mes: lado, transactions: cortadas, statements: [], receivables });
}

export type ComparativoAteODia = {
  /** O dia de corte; `null` com o mês fechado (a tela usa o comparativo de sempre). */
  ateODia: number | null;
  entradas: { atual: number; anterior: number; pct: number | null };
  saidas: { atual: number; anterior: number; pct: number | null };
  /** Em competência o cartão fica fora (a fatura não se divide por dia). */
  cartaoFora: boolean;
};

/**
 * "vs. mês anterior" até o dia D (K3). Os dois lados são cortados na MESMA altura do mês.
 *
 * - Competência: quem soma é o próprio `resumoMes` (P4), sobre os lançamentos cortados e
 *   `statements: []` — entradas = `entradas`, saídas = só o à vista; o cartão fica fora.
 * - Caixa: `numerosDoCaixa` sobre o período cortado; entradas = renda + reembolsos + outras.
 */
export function comparativoAteODia(params: {
  base: "competencia" | "caixa";
  mes: string;
  hoje: string;
  transactions?: DashTx[];
  receivables?: DashReceivable[];
  caixa?: {
    transactions: readonly TxDeCaixa[];
    pagamentosDeFatura: ReadonlySet<string>;
    recebiveis: readonly RecebivelComRecebimentos[];
  };
}): ComparativoAteODia {
  const { base, mes, hoje } = params;
  const dia = diaDeCorte(mes, hoje);

  if (dia === null) {
    return {
      ateODia: null,
      entradas: { atual: 0, anterior: 0, pct: null },
      saidas: { atual: 0, anterior: 0, pct: null },
      cartaoFora: false,
    };
  }

  const ladoCompetencia = (lado: string) => {
    const r = resumoAteODia(lado, dia, params.transactions ?? [], params.receivables ?? []);
    return { entradas: r.entradas, saidas: r.aVista };
  };

  const ladoCaixa = (lado: string) => {
    const n = numerosDoCaixa({
      periodo: periodoAteODia(lado, dia),
      transactions: params.caixa?.transactions ?? [],
      pagamentosDeFatura: params.caixa?.pagamentosDeFatura ?? new Set<string>(),
      recebiveis: params.caixa?.recebiveis ?? [],
    });
    return {
      entradas: entradasDoCaixa(n),
      saidas: n.saidasDeCaixa,
    };
  };

  const lado = base === "caixa" ? ladoCaixa : ladoCompetencia;
  const atual = lado(mes);
  const anterior = lado(mesAnteriorDe(mes));

  return {
    ateODia: dia,
    entradas: {
      atual: atual.entradas,
      anterior: anterior.entradas,
      pct: variacaoPct(atual.entradas, anterior.entradas),
    },
    saidas: {
      atual: atual.saidas,
      anterior: anterior.saidas,
      pct: variacaoPct(atual.saidas, anterior.saidas),
    },
    cartaoFora: base === "competencia",
  };
}

/**
 * O corte "até o dia D" para o gráfico "Mês a mês" (competência): devolve o `Comparativo` na
 * MESMA forma de `comparativoMesAMes`, para a tela trocar só a fonte quando o mês está em
 * andamento. `null` com o mês fechado — aí a tela usa o comparativo de sempre.
 *
 * Os dois lados são cortados na MESMA altura (D) pelo mesmo `resumoAteODia` de
 * `comparativoAteODia` (uma regra só): o lado anterior é cortado em D no mês anterior (Z16) e o
 * cartão fica fora das saídas (P4).
 */
export function comparativoDoGraficoAteODia(params: {
  mes: string;
  hoje: string;
  transactions: DashTx[];
  receivables: DashReceivable[];
}): { ateODia: number; comparativo: Comparativo } | null {
  const { mes, hoje, transactions, receivables } = params;
  const dia = diaDeCorte(mes, hoje);
  if (dia === null) return null;

  const atual = resumoAteODia(mes, dia, transactions, receivables);
  const anterior = resumoAteODia(mesAnteriorDe(mes), dia, transactions, receivables);

  return {
    ateODia: dia,
    comparativo: {
      atual,
      anterior,
      deltaSaidas: atual.saidas - anterior.saidas,
      deltaSaidasPct: variacaoPct(atual.saidas, anterior.saidas),
      deltaEntradas: atual.entradas - anterior.entradas,
      deltaEntradasPct: variacaoPct(atual.entradas, anterior.entradas),
    },
  };
}

/* ───────────────────────────── Quem grava a data (A3) ───────────────────────────── */

/**
 * A data de liquidação que o servidor grava, pela coerência com o CHECK do banco:
 * status fora de pago/recebido → `null`; compra de cartão → `null` (K0.5: o cartão nunca guarda
 * a data); senão o que veio, ou `null` se não veio (ou veio vazio).
 */
export function dataDeLiquidacaoAGravar(params: {
  status: TransactionStatus;
  card_id: string | null;
  liquidado_em?: string | null;
}): string | null {
  if (!SETTLED_STATUSES.includes(params.status)) return null;
  if (params.card_id !== null) return null;
  const data = params.liquidado_em;
  return typeof data === "string" && data !== "" ? data : null;
}

/** P8 — a mensagem de campo quando a "Data do pagamento" é posterior a hoje. */
export const MSG_DATA_PAGAMENTO_FUTURA =
  "A data do pagamento não pode ser futura. Deixe vazio se ainda não foi pago.";

/**
 * P8 — data futura num lançamento liquidado é previsão, não caixa. Comparação de texto
 * 'yyyy-MM-dd' contra o `hoje` injetado. Data anterior à compra é aceita (pagamento antecipado).
 */
export function dataDePagamentoFutura(data: string | null | undefined, hoje: string): boolean {
  return typeof data === "string" && data !== "" && data > hoje;
}

/**
 * K0.3 — o extrato de conta importado grava a data da linha, que é quando o dinheiro mexeu.
 * Uma linha com data FUTURA (agendamento no extrato) não vira recusa da importação: entra sem a
 * data e fica aproximada, contada — nunca com uma data que ainda não aconteceu.
 */
export function dataDoExtratoAGravar(dataDaLinha: string, hoje: string): string | null {
  return dataDePagamentoFutura(dataDaLinha, hoje) ? null : dataDaLinha;
}

/**
 * P9 — o botão rápido de status só mexe na data ao ENTRAR ou SAIR do estado liquidado
 * (`limpar`). Entre `pago` e `recebido`, ou entre dois estados não liquidados, a coluna fica
 * como está (`manter`): a data que o dono informou não se apaga num clique que não mudou o fato
 * de o dinheiro ter mexido.
 */
export function liquidadoNoBotao(
  de: TransactionStatus,
  para: TransactionStatus,
): "limpar" | "manter" {
  const antes = SETTLED_STATUSES.includes(de);
  const depois = SETTLED_STATUSES.includes(para);
  return antes !== depois ? "limpar" : "manter";
}
