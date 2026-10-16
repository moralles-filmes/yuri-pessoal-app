/**
 * REDESIGN-03-D · A1 — AS REGRAS PURAS DO RECEBIMENTO PARCIAL (E1, D6, D11; §13.4 do dicionário).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O que foi DEVIDO (`receivables.valor`, a responsabilidade original) é um fato; o que   ║
 * ║ já VOLTOU (`receivable_receipts`) é outro. Tudo o que se deriva dos dois mora aqui:    ║
 * ║ saldo, estado (`parcial` NUNCA é gravado), o legado (K0), a parte do terceiro, o       ║
 * ║ perdoado (D11) e os três números do §13.4.                                              ║
 * ║                                                                                       ║
 * ║ ⛔ D3: a parte do terceiro é o VALOR, nunca o saldo. A única exceção é o `ignorado`    ║
 * ║    (K3-a): perdoado o resto, o que ele chegou a pagar continua sendo dele.            ║
 * ║ ⛔ Este arquivo NÃO menciona a tabela de recebimentos: recebe valores, não linhas.     ║
 * ║    Puro: sem I/O, sem `zod`, sem `Date.now()`. A tela, o motor e o servidor o usam.   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `valor` está em REAIS (`numeric(14,2)`, invariante 63); centavos só por dentro.
 */
import { RECEIVABLE_STATUSES } from "@/lib/finance/constants";
import { centavosParaReais, formatCurrency, reaisParaCentavos } from "@/lib/format";

const cent = (v: number | string): number => reaisParaCentavos(Number(v));

/** Uma linha de recebimento, como chega da leitura. */
export type RecebimentoLido = { readonly valor: number | string; readonly recebido_em: string };

/** O recebível com o que a K0 precisa. `pago_em` só importa para DATAR o legado. */
export type RecebivelComData = {
  readonly valor: number | string;
  readonly status: string;
  readonly pago_em?: string | null;
};

export type RecebivelComRecebimentos = RecebivelComData & {
  readonly recebimentos: readonly RecebimentoLido[];
};

/** K0 — o que conta como "já voltou". */
export type EntradaDoRecebivel = {
  readonly centavos: number;
  /** 'yyyy-MM-dd'; `null` só no legado sem `pago_em`. */
  readonly data: string | null;
  readonly origem: "recebimento" | "legado";
};

/** O recebível com o recebido JÁ SOMADO — a forma que o motor recebe (P2). */
export type RecebivelResumido = {
  readonly valor: number | string;
  readonly status: string;
  /** Em reais. Ausente = nenhum recebimento informado → K0 sobre lista vazia. */
  readonly recebido?: number;
};

export const ESTADOS_DO_RECEBIVEL = [
  "pendente",
  "parcial",
  "cobrado",
  "pago",
  "ignorado",
  "desconhecido",
] as const;
export type EstadoDoRecebivel = (typeof ESTADOS_DO_RECEBIVEL)[number];

/** O que ainda se deve: entra em "a receber" e pode ser cobrado, recebido ou ignorado. */
export const ESTADOS_EM_ABERTO: readonly EstadoDoRecebivel[] = ["pendente", "parcial", "cobrado"];

export const ESTADO_LABELS: Record<EstadoDoRecebivel, string> = {
  pendente: "Pendente",
  parcial: "Parcial",
  cobrado: "Cobrado",
  pago: "Recebido",
  ignorado: "Não será cobrado",
  desconhecido: "Status desconhecido",
};

const somar = (entradas: readonly EntradaDoRecebivel[]): number =>
  entradas.reduce((s, e) => s + e.centavos, 0);

/**
 * K0 — O ÚNICO LUGAR QUE CONHECE O LEGADO. Com ao menos um recebimento, só eles contam. Sem
 * nenhum e com a coluna em `pago`, o valor inteiro conta como recebido em `pago_em` (os
 * recebíveis pagos antes da M1 não têm linha de recebimento, e não ganham uma: sem backfill).
 */
export function entradasDoRecebivel(
  r: RecebivelComData,
  recebimentos: readonly RecebimentoLido[],
): EntradaDoRecebivel[] {
  if (recebimentos.length > 0) {
    return recebimentos.map((x) => ({
      centavos: cent(x.valor),
      data: x.recebido_em,
      origem: "recebimento" as const,
    }));
  }
  if (r.status === "pago") {
    return [{ centavos: cent(r.valor), data: r.pago_em ?? null, origem: "legado" }];
  }
  return [];
}

/** Recebível com a lista de recebimentos → a forma resumida, com o recebido somado (K0). */
export function resumirRecebivel(
  r: RecebivelComRecebimentos,
): RecebivelResumido & { readonly recebido: number } {
  return {
    valor: r.valor,
    status: r.status,
    recebido: centavosParaReais(somar(entradasDoRecebivel(r, r.recebimentos))),
  };
}

export function recebidoCentavos(r: RecebivelResumido): number {
  return r.recebido !== undefined
    ? reaisParaCentavos(r.recebido)
    : somar(entradasDoRecebivel(r, []));
}

/** `valor − recebido`, SEM truncar em zero. */
export function saldoCentavos(r: RecebivelResumido): number {
  return cent(r.valor) - recebidoCentavos(r);
}

function estadoPorCentavos(status: string, valorCent: number, recebidoCent: number): EstadoDoRecebivel {
  if (!(RECEIVABLE_STATUSES as readonly string[]).includes(status)) return "desconhecido";
  if (status === "ignorado") return "ignorado";
  const saldo = valorCent - recebidoCent;
  if (saldo <= 0 && (recebidoCent > 0 || status === "pago")) return "pago";
  if (recebidoCent > 0) return "parcial";
  if (status === "cobrado") return "cobrado";
  return "pendente";
}

/**
 * O estado DERIVADO, avaliado em ordem: desconhecido → ignorado (decisão) → pago (a soma
 * fechou) → parcial → cobrado (decisão) → pendente. A coluna `pago` sem NADA recebido cai em
 * `pendente` — inalcançável pelo app (o legado tem recebido = valor), e é o que faz o corte
 * por data tratar um legado pago DEPOIS do corte como pendente no corte.
 */
export function estadoDoRecebivel(r: RecebivelResumido): EstadoDoRecebivel {
  return estadoPorCentavos(r.status, cent(r.valor), recebidoCentavos(r));
}

export function emAberto(r: RecebivelResumido): boolean {
  return ESTADOS_EM_ABERTO.includes(estadoDoRecebivel(r));
}

/** ⛔ D3: o VALOR, nunca o saldo. Exceção declarada: `ignorado` → o que ele pagou (K3-a). */
export function parteDoTerceiroCentavos(r: RecebivelResumido): number {
  return estadoDoRecebivel(r) === "ignorado" ? recebidoCentavos(r) : cent(r.valor);
}

/** D11: o que eu decidi não cobrar vira despesa minha — o saldo do `ignorado`. */
export function perdoadoCentavos(r: RecebivelResumido): number {
  return estadoDoRecebivel(r) === "ignorado" ? cent(r.valor) - recebidoCentavos(r) : 0;
}

export function somaDaParteDosTerceiros(recs: readonly RecebivelComRecebimentos[]): number {
  return centavosParaReais(recs.reduce((s, r) => s + parteDoTerceiroCentavos(resumirRecebivel(r)), 0));
}

export function somaDoPerdoado(recs: readonly RecebivelComRecebimentos[]): number {
  return centavosParaReais(recs.reduce((s, r) => s + perdoadoCentavos(resumirRecebivel(r)), 0));
}

type ComMes = { readonly ref_month?: string | null };

/** "Pendente referente a {mês}" — e, sem mês, o total em aberto. É o que `totalAReceber` chama no B4. */
export function pendenteDoPeriodo(recs: readonly (RecebivelResumido & ComMes)[], mes?: string): number {
  let total = 0;
  for (const r of recs) {
    if (mes && r.ref_month !== mes) continue;
    if (!emAberto(r)) continue;
    total += saldoCentavos(r);
  }
  return centavosParaReais(total);
}

/** "Total pendente até DD/MM": só conta o que voltou até o corte (inclusive). */
export function totalPendenteAte(itens: readonly RecebivelComRecebimentos[], corte: string): number {
  let total = 0;
  for (const r of itens) {
    const recebido = somar(
      entradasDoRecebivel(r, r.recebimentos).filter((e) => e.data === null || e.data <= corte),
    );
    const valorCent = cent(r.valor);
    if (!ESTADOS_EM_ABERTO.includes(estadoPorCentavos(r.status, valorCent, recebido))) continue;
    total += valorCent - recebido;
  }
  return centavosParaReais(total);
}

/** "Reembolsos recebidos neste período": pela DATA do recebimento (ou do legado). Nunca `ref_month`. */
export function reembolsosRecebidosNoPeriodo(
  itens: readonly RecebivelComRecebimentos[],
  periodo: { readonly de: string; readonly ate: string },
): number {
  let total = 0;
  for (const r of itens) {
    for (const e of entradasDoRecebivel(r, r.recebimentos)) {
      if (e.data === null || e.data < periodo.de || e.data > periodo.ate) continue;
      total += e.centavos;
    }
  }
  return centavosParaReais(total);
}

/** "Perdoado (não será cobrado)" do mês. */
export function perdoadoNoPeriodo(recs: readonly (RecebivelResumido & ComMes)[], mes: string): number {
  let total = 0;
  for (const r of recs) if (r.ref_month === mes) total += perdoadoCentavos(r);
  return centavosParaReais(total);
}

/** Junção pura por `receivable_id`, na ordem de entrada. */
export function anexarRecebimentos<
  R extends { readonly id: string },
  X extends { readonly receivable_id: string },
>(recebiveis: readonly R[], recebimentos: readonly X[]): (R & { recebimentos: X[] })[] {
  const por = new Map<string, X[]>();
  for (const x of recebimentos) {
    const lista = por.get(x.receivable_id) ?? [];
    lista.push(x);
    por.set(x.receivable_id, lista);
  }
  return recebiveis.map((r) => ({ ...r, recebimentos: por.get(r.id) ?? [] }));
}

/**
 * P6, revisto no RR-D-19 — o último REGISTRADO: `created_at` desc, que é o inverso da última
 * ação. Pela data do recebimento, um lançamento retroativo fazia o "Desfazer" apagar outro, o de
 * data mais recente. Sem `created_at`, ou no empate, cai para `recebido_em` desc.
 */
export function ultimoRecebimento<
  X extends { readonly recebido_em: string; readonly created_at?: string | null },
>(recebimentos: readonly X[]): X | null {
  let ultimo: X | null = null;
  for (const x of recebimentos) {
    if (ultimo === null || registradoDepois(x, ultimo)) ultimo = x;
  }
  return ultimo;
}

type Registro = { readonly recebido_em: string; readonly created_at?: string | null };

function instanteDoRegistro(x: Registro): number {
  const t = x.created_at ? Date.parse(x.created_at) : Number.NaN;
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

function registradoDepois(a: Registro, b: Registro): boolean {
  const ta = instanteDoRegistro(a);
  const tb = instanteDoRegistro(b);
  if (ta !== tb) return ta > tb;
  return a.recebido_em > b.recebido_em;
}

/** A data mais recente entre os recebimentos — o `pago_em` de quando a soma fecha (RR-D-19). */
export function dataDoUltimoRecebimento(
  recebimentos: readonly { readonly recebido_em: string }[],
): string | null {
  let data: string | null = null;
  for (const x of recebimentos) if (data === null || x.recebido_em > data) data = x.recebido_em;
  return data;
}

export type SecoesDaLista<T> = { emAberto: T[]; naoSeraCobrado: T[]; historico: T[] };

/** P7/D11 — "Não será cobrado" é seção própria: o perdoado não some da lista. */
export function secoesDaLista<T>(
  itens: readonly T[],
  estadoDe: (item: T) => EstadoDoRecebivel,
): SecoesDaLista<T> {
  const secoes: SecoesDaLista<T> = { emAberto: [], naoSeraCobrado: [], historico: [] };
  for (const item of itens) {
    const estado = estadoDe(item);
    if (ESTADOS_EM_ABERTO.includes(estado)) secoes.emAberto.push(item);
    else if (estado === "ignorado") secoes.naoSeraCobrado.push(item);
    else secoes.historico.push(item);
  }
  return secoes;
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** 'yyyy-MM' → "Pendente referente a junho de 2026" (tabela estática: determinístico). */
export function rotuloPendenteDoMes(mes: string): string {
  const [ano, m] = mes.split("-");
  return `Pendente referente a ${MESES[Number(m) - 1]} de ${ano}`;
}

/** 'yyyy-MM-dd' (data PURA, recortada como texto) → "Total pendente até DD/MM". */
export function rotuloTotalPendenteAte(dataIso: string): string {
  return `Total pendente até ${dataIso.slice(8, 10)}/${dataIso.slice(5, 7)}`;
}

/** A linha da D11 — só existe quando há perdoado. */
export function fraseDoPerdoado(perdoado: number): string | null {
  return perdoado > 0 ? `inclui ${formatCurrency(perdoado)} que você decidiu não cobrar` : null;
}
