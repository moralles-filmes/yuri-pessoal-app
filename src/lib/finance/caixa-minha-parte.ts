/**
 * A PARTE MINHA DA BASE CAIXA — desenho 2026-10-18 (`docs/superpowers/specs/2026-10-18-graficos-meus-e-base-design.md`, §4.2–§4.3).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Os gráficos da base caixa mostram SÓ o que é do dono: quando ele paga uma fatura de   ║
 * ║ R$ 253,41 com R$ 126,70 de um terceiro, as saídas DELE contam R$ 126,71.              ║
 * ║                                                                                      ║
 * ║ ⛔ Quem decide o que é saída de caixa continua sendo a regra de `caixa.ts` (data de    ║
 * ║    caixa, `SETTLED_STATUSES`, compra no cartão fora, pagamento de fatura dentro):     ║
 * ║    `saidasBrutas` é, por teste, o `saidasDeCaixa` de `numerosDoCaixa`.                ║
 * ║ ⛔ "Meu × terceiros" da fatura é a regra única do motor (`parteDosTerceirosPorFatura`);║
 * ║    o perdoado à vista é o mesmo `perdoadoPorLancamento` de `resumoMes` (D11).          ║
 * ║ ⛔ Proporção indefinida (fatura sem total ou não lida) nunca vira `NaN`: o pagamento   ║
 * ║    conta cheio e é DECLARADO em `faturasSemTotal`.                                    ║
 * ║ ⛔ Puro: sem I/O, sem `Date.now()`. Importa do motor e de `caixa.ts`; nenhum dos dois  ║
 * ║    importa este arquivo (P3).                                                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
import {
  dataDeCaixa,
  diaDeCorte,
  mesAnteriorDe,
  periodoAteODia,
  type Periodo,
  type TxDeCaixa,
} from "@/lib/finance/caixa";
import { SETTLED_STATUSES } from "@/lib/finance/constants";
import {
  itensDasFaturas,
  meuCentavos,
  parteDosTerceirosPorFatura,
  perdoadoPorLancamento,
  type CategoriaSlice,
  type DashInstallmentItem,
  type DashReceivable,
  type DashStatement,
  type DashTx,
  type EvolucaoPonto,
  type FormaSlice,
  type MesAMesDados,
} from "@/lib/finance/dashboard";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";

const cent = (v: number) => reaisParaCentavos(v);
const reais = (c: number) => centavosParaReais(c);

/** Id do lançamento que pagou → id da fatura paga (`card_statements.pago_transacao_id`). */
export type PagamentoDeFatura = ReadonlyMap<string, string>;

/** As entradas do motor de competência que a base caixa precisa para abrir uma fatura paga. */
export type MotorDoCaixa = {
  statements: DashStatement[];
  receivables: DashReceivable[];
  transactions: DashTx[];
  installmentItems: DashInstallmentItem[];
};

export type MinhaParteDoCaixa = {
  /** Renda pessoal recebida — reembolso e entrada de terceiro não são meus. */
  entradas: number;
  /** A minha parte do que saiu das contas. */
  saidas: number;
  /** O que saiu das contas (= `numerosDoCaixa().saidasDeCaixa`). */
  saidasBrutas: number;
  /** `saidasBrutas − saidas`: a parte de terceiros dentro do que saiu. */
  terceirosNasSaidas: number;
  /** `entradas − saidas`. */
  resultado: number;
  /** Pagamentos de fatura sem total (ou fatura não lida) contados cheios como meus. */
  faturasSemTotal: number;
};

/** Um lançamento do período, já classificado pela regra de caixa. */
type Movimento =
  | { kind: "renda"; meuCent: number }
  | { kind: "despesa"; t: TxDeCaixa; brutoCent: number; meuCent: number }
  | { kind: "fatura"; t: TxDeCaixa; statementId: string; brutoCent: number }
  | { kind: "sem_vinculo"; t: TxDeCaixa; brutoCent: number };

/**
 * Os lançamentos que contam no caixa do período, com a MESMA classificação de `numerosDoCaixa`
 * (receita/despesa com conta, pagamento de fatura, transferência sem vínculo). Transferência
 * entre contas, compra/estorno de cartão, `ajuste` e lançamento sem conta ficam fora.
 */
function movimentos(
  periodo: Periodo,
  transactions: readonly TxDeCaixa[],
  pagamentos: PagamentoDeFatura,
  perdoado: Map<string, number>,
): Movimento[] {
  const out: Movimento[] = [];
  for (const t of transactions) {
    if (!SETTLED_STATUSES.includes(t.status)) continue;
    const { data } = dataDeCaixa(t);
    if (data < periodo.de || data > periodo.ate) continue;
    if (t.type === "receita") {
      if (t.card_id !== null || t.account_id === null) continue;
      out.push({ kind: "renda", meuCent: meuCentavos(t) });
    } else if (t.type === "despesa") {
      if (t.card_id !== null || t.account_id === null) continue;
      out.push({
        kind: "despesa",
        t,
        brutoCent: cent(t.amount),
        meuCent: meuCentavos(t) + (perdoado.get(t.id) ?? 0),
      });
    } else if (t.type === "transferencia") {
      const statementId = pagamentos.get(t.id);
      if (statementId !== undefined) {
        out.push({ kind: "fatura", t, statementId, brutoCent: cent(t.amount) });
      } else if (t.account_id !== null && t.transfer_account_id === null) {
        out.push({ kind: "sem_vinculo", t, brutoCent: cent(t.amount) });
      }
    }
  }
  return out;
}

/** O total e a minha parte de cada fatura, em centavos. */
function faturasDoMotor(motor: MotorDoCaixa): Map<string, { totalCent: number; meuCent: number }> {
  const terceiros = parteDosTerceirosPorFatura(motor.receivables);
  const mapa = new Map<string, { totalCent: number; meuCent: number }>();
  for (const s of motor.statements) {
    const totalCent = cent(s.total_atual ?? 0);
    mapa.set(s.id, { totalCent, meuCent: totalCent - (terceiros.get(s.id) ?? 0) });
  }
  return mapa;
}

/** `round(valor × num ÷ den)` em centavos. */
function proporcao(valorCent: number, num: number, den: number): number {
  return Math.round((valorCent * num) / den);
}

/** A minha parte de um pagamento de fatura; `null` quando a proporção não existe. */
function meuDoPagamento(
  m: Extract<Movimento, { kind: "fatura" }>,
  faturas: Map<string, { totalCent: number; meuCent: number }>,
): number | null {
  const f = faturas.get(m.statementId);
  if (!f || f.totalCent <= 0) return null;
  return proporcao(m.brutoCent, f.meuCent, f.totalCent);
}

export function minhaParteDoCaixa(params: {
  periodo: Periodo;
  transactions: readonly TxDeCaixa[];
  pagamentos: PagamentoDeFatura;
  motor: MotorDoCaixa;
}): MinhaParteDoCaixa {
  const { periodo, transactions, pagamentos, motor } = params;
  const faturas = faturasDoMotor(motor);
  let entradasCent = 0;
  let saidasCent = 0;
  let brutasCent = 0;
  let faturasSemTotal = 0;

  for (const m of movimentos(periodo, transactions, pagamentos, perdoadoPorLancamento(motor.receivables))) {
    if (m.kind === "renda") {
      entradasCent += m.meuCent;
      continue;
    }
    brutasCent += m.brutoCent;
    if (m.kind === "despesa") saidasCent += m.meuCent;
    else if (m.kind === "sem_vinculo") saidasCent += m.brutoCent;
    else {
      const meu = meuDoPagamento(m, faturas);
      if (meu === null) {
        faturasSemTotal += 1;
        saidasCent += m.brutoCent;
      } else {
        saidasCent += meu;
      }
    }
  }

  return {
    entradas: reais(entradasCent),
    saidas: reais(saidasCent),
    saidasBrutas: reais(brutasCent),
    terceirosNasSaidas: reais(brutasCent - saidasCent),
    resultado: reais(entradasCent - saidasCent),
    faturasSemTotal,
  };
}

/** A evolução da base caixa: `minhaParteDoCaixa` de cada mês cheio. Mesma forma da competência. */
export function evolucaoDoCaixa(params: {
  meses: string[];
  transactions: readonly TxDeCaixa[];
  pagamentos: PagamentoDeFatura;
  motor: MotorDoCaixa;
}): EvolucaoPonto[] {
  const { meses, ...resto } = params;
  return meses.map((mes) => {
    const r = minhaParteDoCaixa({ ...resto, periodo: periodoAteODia(mes, 31) });
    return { mes, entradas: r.entradas, saidas: r.saidas, saldo: r.resultado };
  });
}

/**
 * "Meu mês a mês" na base caixa. Mês em andamento: os dois lados cortados no MESMO dia
 * (`diaDeCorte` + `periodoAteODia`, as regras do K3); mês fechado: os dois meses cheios.
 */
export function mesAMesDoCaixa(params: {
  mes: string;
  hoje: string;
  transactions: readonly TxDeCaixa[];
  pagamentos: PagamentoDeFatura;
  motor: MotorDoCaixa;
}): { ateODia: number | null; dados: MesAMesDados } {
  const { mes, hoje, ...resto } = params;
  const dia = diaDeCorte(mes, hoje);
  const lado = (m: string) => {
    const r = minhaParteDoCaixa({ ...resto, periodo: periodoAteODia(m, dia ?? 31) });
    return { entradas: r.entradas, saidas: r.saidas };
  };
  return { ateODia: dia, dados: { anterior: lado(mesAnteriorDe(mes)), atual: lado(mes) } };
}

/* ───────────────────────────── Categorias e formas ───────────────────────────── */

const FATIA_DIFERENCA = { id: "__diferenca_fatura__", nome: "Diferença da fatura" } as const;
const FATIA_SEM_DETALHE = { id: "__fatura_sem_detalhe__", nome: "Fatura sem detalhe" } as const;
const FATIA_SEM_VINCULO = { id: "__sem_vinculo__", nome: "Transferência sem destino" } as const;

type Acumulado = { name: string; color: string | null; movCent: number; meuCent: number };

/**
 * Categorias e formas de pagamento da base caixa, só a minha parte em `meu`:
 * - despesa com conta: na categoria e na forma dela;
 * - pagamento de fatura: aberto pelos itens da fatura (`itensDasFaturas`) × (pago ÷ total), forma
 *   "cartão de crédito"; o que não fechar com a minha parte do pagamento vai para a fatia visível
 *   "Diferença da fatura"; fatura sem total ou sem itens vira "Fatura sem detalhe";
 * - transferência sem vínculo: "Transferência sem destino", forma "outro".
 * Σ `meu` das categorias = Σ `meu` das formas = `minhaParteDoCaixa().saidas`.
 */
export function gastosDeCaixa(params: {
  periodo: Periodo;
  transactions: readonly TxDeCaixa[];
  pagamentos: PagamentoDeFatura;
  motor: MotorDoCaixa;
}): { categorias: CategoriaSlice[]; formas: FormaSlice[] } {
  const { periodo, transactions, pagamentos, motor } = params;
  const faturas = faturasDoMotor(motor);
  const itens = itensDasFaturas(motor);
  const cats = new Map<string, Acumulado & { categoryId: string | null }>();
  const formas = new Map<FormaSlice["paymentMethod"], { movCent: number; meuCent: number }>();

  const somaCategoria = (
    categoryId: string | null,
    name: string | null,
    color: string | null,
    movCent: number,
    meuCent: number,
  ) => {
    const key = categoryId ?? "__none__";
    const cur = cats.get(key) ?? { categoryId, name: name ?? "Sem categoria", color, movCent: 0, meuCent: 0 };
    cur.movCent += movCent;
    cur.meuCent += meuCent;
    cats.set(key, cur);
  };
  const somaForma = (forma: FormaSlice["paymentMethod"], movCent: number, meuCent: number) => {
    const cur = formas.get(forma) ?? { movCent: 0, meuCent: 0 };
    cur.movCent += movCent;
    cur.meuCent += meuCent;
    formas.set(forma, cur);
  };

  for (const m of movimentos(periodo, transactions, pagamentos, perdoadoPorLancamento(motor.receivables))) {
    if (m.kind === "renda") continue;
    if (m.kind === "despesa") {
      const c = m.t.category ?? null;
      somaCategoria(c?.id ?? null, c?.name ?? null, c?.color ?? null, m.brutoCent, m.meuCent);
      somaForma(m.t.payment_method ?? "outro", m.brutoCent, m.meuCent);
      continue;
    }
    if (m.kind === "sem_vinculo") {
      somaCategoria(FATIA_SEM_VINCULO.id, FATIA_SEM_VINCULO.nome, null, m.brutoCent, m.brutoCent);
      somaForma("outro", m.brutoCent, m.brutoCent);
      continue;
    }
    const meuPago = meuDoPagamento(m, faturas);
    const doItem = itens.get(m.statementId) ?? [];
    const f = faturas.get(m.statementId);
    if (meuPago === null || !f || doItem.length === 0) {
      const meu = meuPago ?? m.brutoCent;
      somaCategoria(FATIA_SEM_DETALHE.id, FATIA_SEM_DETALHE.nome, null, m.brutoCent, meu);
      somaForma("cartao_credito", m.brutoCent, meu);
      continue;
    }
    let meuDosItens = 0;
    let movDosItens = 0;
    for (const it of doItem) {
      const meu = proporcao(m.brutoCent, it.meuCent, f.totalCent);
      const mov = proporcao(m.brutoCent, it.movCent, f.totalCent);
      meuDosItens += meu;
      movDosItens += mov;
      somaCategoria(it.categoryId, it.categoryName, it.categoryColor, mov, meu);
    }
    const diferencaMeu = meuPago - meuDosItens;
    const diferencaMov = m.brutoCent - movDosItens;
    if (diferencaMeu !== 0 || diferencaMov !== 0) {
      somaCategoria(FATIA_DIFERENCA.id, FATIA_DIFERENCA.nome, null, diferencaMov, diferencaMeu);
    }
    somaForma("cartao_credito", m.brutoCent, meuPago);
  }

  return {
    categorias: [...cats.values()]
      .map((c) => ({
        categoryId: c.categoryId,
        name: c.name,
        color: c.color,
        movimentado: reais(c.movCent),
        meu: reais(c.meuCent),
      }))
      .sort((a, b) => b.meu - a.meu),
    formas: [...formas.entries()]
      .map(([paymentMethod, v]) => ({ paymentMethod, movimentado: reais(v.movCent), meu: reais(v.meuCent) }))
      .sort((a, b) => b.meu - a.meu),
  };
}
