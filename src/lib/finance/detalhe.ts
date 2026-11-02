/**
 * REDESIGN-04-B — O MODELO DO DETALHAMENTO: cada número do painel financeiro e do relatório abre
 * os registros que o compõem.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ O TOTAL É O DO MOTOR. A soma da lista só CONCILIA.                                  ║
 * ║ O `totalCent` de cada chave sai SEMPRE da função agregadora que já produz o número    ║
 * ║ na tela (`resumoMes`, `gastosPorCategoria`, `gastosPorForma`, `totalPendenteAte`,      ║
 * ║ `totalAReceber`, `projecaoProximosMeses`, `proximasContasPagar`, `numerosDoCaixa`,     ║
 * ║ `minhaParteDoCaixa`, `total_atual` da view + `parteDosTerceirosPorFatura`). Os         ║
 * ║ REGISTROS saem dos classificadores que o motor já usa (`itensDeGasto`,                 ║
 * ║ `ehEntradaDeConta`, `movimentos`, `classeDeCaixa`, `vencimentosDasContas`…), exportados ║
 * ║ na Task 1 — nunca de um filtro paralelo. `diferencaCent = totalCent − somaCent`; quando ║
 * ║ não é zero a tela DIZ quanto falta. Nada é ajustado, nada é escondido.                 ║
 * ║                                                                                        ║
 * ║ ⛔ Duas únicas contas de dinheiro vivem aqui, ambas em CENTAVOS e declaradas:           ║
 * ║    1. `somaCent` — a soma dos registros, só para a conciliação;                        ║
 * ║    2. `terceiros = bruto − meu` — a partição que o motor também usa (nunca uma regra   ║
 * ║       nova), em cada registro e nas partes cujo agregador não tem campo próprio.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * PURO: sem `server-only`, sem Supabase, sem `Date.now()` (`hoje` é injetado). A leitura do
 * caixa (`LeituraDoCaixa`) entra só como TIPO — `caixa-leitura.ts` importa o client do servidor.
 * Este arquivo também NÃO monta `Dash*` (só `pipeline.ts` pode): recebe as entradas prontas.
 *
 * Quatro estados, distintos (D-B-10): `ok`, `vazio` (nunca com "R$" no texto), `falha` (leitura
 * que não veio nunca vira lista vazia) e `nao-segue` (o bloco não obedece ao recorte).
 */
import type { BaseFinanceira } from "@/lib/finance/base";
import {
  classeDeCaixa,
  dataDeCaixa,
  numerosDoCaixa,
  periodoAteODia,
  type Periodo,
  type TxDeCaixa,
} from "@/lib/finance/caixa";
import type { LeituraDoCaixa } from "@/lib/finance/caixa-leitura";
import {
  faturasDoMotor,
  meuDoPagamento,
  minhaParteDoCaixa,
  movimentos,
  type Movimento,
  type MotorDoCaixa,
} from "@/lib/finance/caixa-minha-parte";
import {
  FREQUENCY_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  SETTLED_STATUSES,
} from "@/lib/finance/constants";
import {
  ehEntradaDeConta,
  gastosPorCategoria,
  gastosPorForma,
  itensDeGasto,
  meuCentavos,
  mesDe,
  ocorrenciasNoMes,
  parteDosTerceirosPorFatura,
  perdoadoPorLancamento,
  projecaoProximosMeses,
  proximasContasPagar,
  resumoMes,
  totalAReceber,
  vencimentosDasContas,
  type DashStatement,
  type DashTx,
  type ItemDeGasto,
} from "@/lib/finance/dashboard";
import {
  type CompletudeFinanceira,
  type EntradasDoMotor,
  type LinhaRecebivel,
  montarEntradas,
} from "@/lib/finance/pipeline";
import {
  entradasDoRecebivel,
  pendenteDoPeriodo,
  resumirRecebivel,
  rotuloPendenteDoMes,
  rotuloTotalPendenteAte,
  totalPendenteAte,
  type RecebivelComRecebimentos,
} from "@/lib/finance/recebimentos";
import { reaisParaCentavos } from "@/lib/format";

/* ───────────────────────────── Tipos públicos ───────────────────────────── */

export type ChaveDoDetalhe =
  | "saldo"
  | "entradas"
  | "saidas"
  | "cartao"
  | "pendente"
  | "pendente-do-mes"
  | "categoria"
  | "forma"
  | "fatura"
  | "projecao"
  | "contas"
  | "caixa";

export type ParteDoDetalhe = "meu" | "terceiros" | "bruto";

export type PedidoDeDetalhe = {
  chave: ChaveDoDetalhe;
  parte: ParteDoDetalhe;
  alvo: string | null;
};

export type LinhaDoCaixa =
  | "renda"
  | "reembolsos"
  | "outras"
  | "saidas"
  | "pagamentos"
  | "sem-destino"
  | "entre-contas";

export type MarcaDoRegistro =
  | "previsto"
  | "projetado"
  | "estorno"
  | "data-aproximada"
  | "contado-cheio"
  | { parcela: { numero: number; total: number } };

export type RegistroDoDetalhe = {
  id: string;
  /** 'yyyy-MM-dd' (data PURA, tratada como texto); `null` quando o registro não tem data própria. */
  data: string | null;
  descricao: string;
  origem: string | null;
  categoria: string | null;
  brutoCent: number;
  meuCent: number;
  terceirosCent: number;
  marcas: MarcaDoRegistro[];
};

export type GrupoDoDetalhe = {
  rotulo: string;
  /** Só na fatura: o total da view e a minha parte pela regra do motor; `diferencaCent` ≠ 0 é declarada. */
  fatura: { totalCent: number; meuCent: number; diferencaCent: number } | null;
  registros: RegistroDoDetalhe[];
};

/** Registros exibidos por gaveta. A conferência é sobre TODOS (TETO + 1, regra 29). */
export const TETO_DA_GAVETA = 300;

export type Detalhe =
  | {
      estado: "ok";
      titulo: string;
      linhaDeBase: string;
      parte: ParteDoDetalhe | "pendente" | "saldo" | "projetado";
      totalCent: number;
      somaCent: number;
      diferencaCent: number;
      grupos: GrupoDoDetalhe[];
      aproximados: number;
      existentes: number;
      exibidos: number;
      avisos: string[];
    }
  | { estado: "vazio"; titulo: string; linhaDeBase: string; frase: string; avisos: string[] }
  | { estado: "falha"; titulo: string; frase: string }
  | { estado: "nao-segue"; titulo: string; frase: string; hrefSemFiltro: string | null };

export type ParametrosDoDetalhe = {
  pedido: PedidoDeDetalhe;
  mes: string;
  hoje: string;
  base: BaseFinanceira;
  /** As entradas do motor JÁ RECORTADAS (as mesmas que montaram o número). */
  entradas: Pick<EntradasDoMotor, "txs" | "sts" | "recs" | "inst" | "cards" | "recorrencias" | "bills">;
  /**
   * Recebíveis crus, já recortados por pessoa/cartão (pendente). `person.id` é opcional no tipo
   * (a leitura real sempre o traz): sem ele, o pendente só abre sem `alvo`.
   */
  recebiveisCrus: readonly (LinhaRecebivel &
    RecebivelComRecebimentos & {
      person: { id?: string; nome: string } | null;
    })[];
  /** Base caixa: a leitura e o motor do caixa; `null` na competência; `"erro"` = não leu. */
  caixa: { leitura: Extract<LeituraDoCaixa, { ok: true }>; motor: MotorDoCaixa } | "erro" | null;
  /** D-B-12: só para `saldo`. `saldoCent: null` = aquela conta não leu. */
  saldos: {
    totalCent: number | null;
    porConta: { id: string; nome: string; saldoCent: number | null }[];
  } | null;
  completude: CompletudeFinanceira;
  /** Do relatório: o bloco não segue o recorte (`naoSegue` da 04-A2) → estado `nao-segue`. */
  naoSegue: { frase: string; hrefSemFiltro: string | null } | null;
  /** Só com recorte de categoria (D-B-11): filtra os itens e acrescenta o aviso "antes dos estornos do cartão". */
  categoriaDoRecorte: string | null;
  nomes: { contas: ReadonlyMap<string, string>; cartoes: ReadonlyMap<string, string> };
};

type DetalheOk = Extract<Detalhe, { estado: "ok" }>;
type Coluna = "brutoCent" | "meuCent" | "terceirosCent";

/**
 * A coluna do registro que CONCILIA com o número, por `Detalhe.parte`. A gaveta (e o teste)
 * destacam esta coluna e somam esta coluna.
 *  - `meu`/`terceiros`/`bruto`: a própria;
 *  - `pendente` e `saldo`: o valor do registro é o `brutoCent` (meu = 0 no pendente, e a
 *    partição `terceiros = bruto − meu` continua valendo);
 *  - `projetado`: a projeção é SEMPRE a minha parte (`meuCent`).
 */
export function colunaDaParte(parte: DetalheOk["parte"]): Coluna {
  switch (parte) {
    case "meu":
    case "projetado":
      return "meuCent";
    case "terceiros":
      return "terceirosCent";
    case "bruto":
    case "pendente":
    case "saldo":
      return "brutoCent";
  }
}

/* ───────────────────────────── Pequenos helpers ───────────────────────────── */

const cent = (v: number) => reaisParaCentavos(v);

/** 1) A única soma de registros do arquivo — só para a conciliação. */
function somaCent(registros: readonly RegistroDoDetalhe[], coluna: Coluna): number {
  let total = 0;
  for (const r of registros) total += r[coluna];
  return total;
}

/** 2) A partição `terceiros = bruto − meu`, em centavos, para as partes sem campo próprio no agregador. */
function totalDaParte(parte: ParteDoDetalhe, brutoCent: number, meuCent: number): number {
  if (parte === "meu") return meuCent;
  if (parte === "bruto") return brutoCent;
  return brutoCent - meuCent;
}

function registro(r: {
  id: string;
  data: string | null;
  descricao: string;
  origem: string | null;
  categoria: string | null;
  brutoCent: number;
  meuCent: number;
  marcas: MarcaDoRegistro[];
}): RegistroDoDetalhe {
  return { ...r, terceirosCent: r.brutoCent - r.meuCent };
}

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** 'yyyy-MM' → "novembro de 2026" (tabela estática: determinístico, sem `Intl`). */
function rotuloDoMes(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${MESES[Number(m) - 1] ?? mes} de ${ano}`;
}

/** 'yyyy-MM-dd' (data PURA) → "18/11". */
function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

function ehMesValido(v: string | null): v is string {
  return v !== null && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
}

/** Dia de vencimento dentro do mês (clampado ao último dia), como texto. */
function dataNoMes(mes: string, dia: number): string {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${mes}-${String(Math.min(Math.max(1, dia), ultimo)).padStart(2, "0")}`;
}

/** Por grupo, a data crescente (sem data por último), depois a descrição e o id — determinístico. */
function ordenar(registros: RegistroDoDetalhe[]): RegistroDoDetalhe[] {
  return [...registros].sort((a, b) => {
    if (a.data !== b.data) {
      if (a.data === null) return 1;
      if (b.data === null) return -1;
      return a.data < b.data ? -1 : 1;
    }
    return a.descricao.localeCompare(b.descricao) || a.id.localeCompare(b.id);
  });
}

const liquidado = (status: string) => (SETTLED_STATUSES as readonly string[]).includes(status);

const ROTULO_DA_PARTE: Record<ParteDoDetalhe, string> = {
  meu: "minha parte",
  terceiros: "de terceiros",
  bruto: "bruto",
};

const CHAVE_ENTRADAS_SAIDAS = {
  entradas: { meu: "Minhas entradas", terceiros: "Entradas de terceiros", bruto: "Entradas" },
  saidas: { meu: "Minhas saídas", terceiros: "Saídas de terceiros", bruto: "Saídas" },
  cartao: { meu: "Cartão realmente meu", terceiros: "Cartão de terceiros", bruto: "Gasto no cartão" },
} as const;

const LINHAS_DO_CAIXA: readonly LinhaDoCaixa[] = [
  "renda",
  "reembolsos",
  "outras",
  "saidas",
  "pagamentos",
  "sem-destino",
  "entre-contas",
];

const TITULO_DA_LINHA_DO_CAIXA: Record<LinhaDoCaixa, string> = {
  renda: "Renda pessoal recebida",
  reembolsos: "Reembolsos recebidos",
  outras: "Outras entradas de terceiros",
  saidas: "Saídas de caixa",
  pagamentos: "Pagamentos de fatura",
  "sem-destino": "Transferências sem destino",
  "entre-contas": "Transferências entre contas",
};

function ehLinhaDoCaixa(v: string | null): v is LinhaDoCaixa {
  return v !== null && (LINHAS_DO_CAIXA as readonly string[]).includes(v);
}

/* ───────────────────────────── Resultado interno ───────────────────────────── */

type Preparado = {
  tipo: "preparado";
  titulo: string;
  linhaDeBase: string;
  parte: DetalheOk["parte"];
  totalCent: number;
  grupos: GrupoDoDetalhe[];
  avisos: string[];
  /** O alvo pedido não existe (ou é de outro tipo): `vazio` com "Registro não encontrado.". */
  alvoInexistente: boolean;
};

type Interrompido =
  | { tipo: "falha"; titulo: string; frase: string }
  | { tipo: "nao-segue"; titulo: string; frase: string };

type Resultado = Preparado | Interrompido;

/* ───────────────────────────── Contexto de uma chamada ───────────────────────────── */

type Contexto = {
  p: ParametrosDoDetalhe;
  txPorId: Map<string, DashTx>;
  stPorId: Map<string, DashStatement>;
  terceirosPorFatura: Map<string, number>;
};

function contextoDe(p: ParametrosDoDetalhe): Contexto {
  const txPorId = new Map<string, DashTx>();
  for (const t of p.entradas.txs) if (t.id !== undefined) txPorId.set(t.id, t);
  return {
    p,
    txPorId,
    stPorId: new Map(p.entradas.sts.map((s) => [s.id, s])),
    terceirosPorFatura: parteDosTerceirosPorFatura(p.entradas.recs),
  };
}

function nomeDoCartao(p: ParametrosDoDetalhe, id: string | null): string {
  if (id === null) return "Cartão";
  return p.nomes.cartoes.get(id) ?? p.entradas.cards.find((c) => c.id === id)?.nome ?? "Cartão";
}

function nomeDaConta(p: ParametrosDoDetalhe, id: string | null | undefined): string | null {
  return id ? (p.nomes.contas.get(id) ?? null) : null;
}

/* ───────────────────────────── Títulos e linhas de base ───────────────────────────── */

function tituloDoPedido(p: ParametrosDoDetalhe, nome: string | null = null): string {
  const { chave, parte, alvo } = p.pedido;
  const mes = rotuloDoMes(p.mes);
  switch (chave) {
    case "entradas":
    case "saidas":
    case "cartao":
      return `${CHAVE_ENTRADAS_SAIDAS[chave][parte]} · ${mes}`;
    case "categoria":
      return `Categoria${nome ? ` · ${nome}` : ""} · ${mes}`;
    case "forma":
      return `Forma de pagamento${nome ? ` · ${nome}` : ""} · ${mes}`;
    case "fatura":
      return nome ?? "Fatura";
    case "pendente":
      return `${rotuloTotalPendenteAte(p.hoje)}${nome ? ` · ${nome}` : ""}`;
    case "pendente-do-mes":
      return rotuloPendenteDoMes(p.mes);
    case "projecao":
      return `Minha projeção · ${rotuloDoMes(ehMesValido(alvo) ? alvo : p.mes)}`;
    case "contas":
      return "Próximas contas a pagar";
    case "saldo":
      return `Saldo das contas · em ${diaMes(p.hoje)}`;
    case "caixa":
      return `${ehLinhaDoCaixa(alvo) ? TITULO_DA_LINHA_DO_CAIXA[alvo] : "Caixa"} · ${mes}`;
  }
}

function linhaDeBaseDoPedido(p: ParametrosDoDetalhe, parteDaLinha: ParteDoDetalhe = p.pedido.parte): string {
  const { chave } = p.pedido;
  switch (chave) {
    case "pendente":
      return `até ${diaMes(p.hoje)} · o que ainda não voltou`;
    case "pendente-do-mes":
      return `referente a ${rotuloDoMes(p.mes)} · o que ainda não voltou`;
    case "projecao":
      return "projetado · pelo vencimento · minha parte";
    case "contas":
      return "projetado · próximos 31 dias";
    case "saldo":
      return `saldo até ${diaMes(p.hoje)}`;
    case "caixa":
      return `caixa · ${ROTULO_DA_PARTE[parteDaLinha]}`;
    case "entradas":
    case "saidas":
      return `${p.base === "caixa" ? "caixa" : "competência"} · ${ROTULO_DA_PARTE[parteDaLinha]}`;
    default:
      return `competência · ${ROTULO_DA_PARTE[parteDaLinha]}`;
  }
}

/* ───────────────────────────── Registros da competência ───────────────────────────── */

function itensDoMes(ctx: Contexto, mes: string): ItemDeGasto[] {
  const { txs, sts, inst, recs } = ctx.p.entradas;
  return itensDeGasto({
    transactions: txs,
    statements: sts,
    installmentItems: inst,
    receivables: recs,
  }).filter((i) => i.mes === mes);
}

function statementsDoMes(ctx: Contexto, mes: string): DashStatement[] {
  return ctx.p.entradas.sts
    .filter((s) => s.card_id && mesDe(s.competencia) === mes)
    .sort((a, b) => a.data_vencimento.localeCompare(b.data_vencimento) || a.id.localeCompare(b.id));
}

function registroDoItem(ctx: Contexto, i: ItemDeGasto): RegistroDoDetalhe {
  const fatura = i.statementId === null ? null : (ctx.stPorId.get(i.statementId) ?? null);
  const marcas: MarcaDoRegistro[] = [];
  if (i.numero !== null && i.totalParcelas !== null) {
    marcas.push({ parcela: { numero: i.numero, total: i.totalParcelas } });
  }
  // Previsto: o item de fatura ainda não paga; o à vista ainda não liquidado.
  if (fatura !== null ? fatura.pago_em === null : !liquidado(i.status)) marcas.push("previsto");
  const tx = i.txId === null ? undefined : ctx.txPorId.get(i.txId);
  return registro({
    id: i.txId ?? i.installmentId ?? `item:${i.statementId ?? "avista"}:${i.descricao ?? ""}`,
    data: i.data,
    descricao: i.descricao ?? "(sem descrição)",
    origem: fatura !== null ? nomeDoCartao(ctx.p, fatura.card_id) : nomeDaConta(ctx.p, tx?.account_id),
    categoria: i.categoryName,
    brutoCent: i.movCent,
    meuCent: i.meuCent,
    marcas,
  });
}

/** Os estornos da fatura: receita ligada a ela, com valor NEGATIVO (como `itensDasFaturas`). */
function estornosDaFatura(ctx: Contexto, s: DashStatement): RegistroDoDetalhe[] {
  const fatura = s.pago_em === null;
  return ctx.p.entradas.txs
    .filter((t) => t.status !== "cancelado" && t.type === "receita" && t.statement_id === s.id)
    .map((t, idx) =>
      registro({
        id: t.id ?? `estorno:${s.id}:${idx}`,
        data: t.data_compra ?? t.competence_date,
        descricao: t.descricao ?? "Estorno",
        origem: nomeDoCartao(ctx.p, s.card_id),
        categoria: t.category?.name ?? null,
        brutoCent: -cent(t.amount),
        meuCent: -meuCentavos(t),
        marcas: fatura ? ["estorno", "previsto"] : ["estorno"],
      }),
    );
}

/**
 * "À vista" + uma seção por fatura. `cabecalho` liga o total da view e a diferença (D-B-4); sem
 * ele (categoria, forma, recorte) a seção é só uma lista, porque a fatura não é a soma dos itens
 * de UMA categoria.
 */
function gruposDeSaidas(
  ctx: Contexto,
  o: {
    itens: ItemDeGasto[];
    aVista: boolean;
    faturas: DashStatement[];
    estornos: boolean;
    cabecalho: boolean;
  },
): GrupoDoDetalhe[] {
  const grupos: GrupoDoDetalhe[] = [];
  if (o.aVista) {
    const registros = ordenar(o.itens.filter((i) => i.origem === "avista").map((i) => registroDoItem(ctx, i)));
    if (registros.length > 0) grupos.push({ rotulo: "À vista", fatura: null, registros });
  }
  for (const s of o.faturas) {
    const registros = ordenar([
      ...o.itens.filter((i) => i.statementId === s.id).map((i) => registroDoItem(ctx, i)),
      ...(o.estornos ? estornosDaFatura(ctx, s) : []),
    ]);
    const totalCent = cent(s.total_atual ?? 0);
    const terceirosCent = ctx.terceirosPorFatura.get(s.id) ?? 0;
    const fatura = o.cabecalho
      ? {
          totalCent,
          meuCent: totalCent - terceirosCent,
          diferencaCent: totalCent - somaCent(registros, "brutoCent"),
        }
      : null;
    if (registros.length === 0 && (fatura === null || fatura.totalCent === 0)) continue;
    grupos.push({
      rotulo: `${nomeDoCartao(ctx.p, s.card_id)} · vence ${diaMes(s.data_vencimento)}`,
      fatura,
      registros,
    });
  }
  return grupos;
}

function preparado(
  p: ParametrosDoDetalhe,
  o: Partial<Pick<Preparado, "titulo" | "linhaDeBase" | "avisos" | "alvoInexistente">> &
    Pick<Preparado, "parte" | "totalCent" | "grupos">,
): Preparado {
  return {
    tipo: "preparado",
    titulo: o.titulo ?? tituloDoPedido(p),
    linhaDeBase: o.linhaDeBase ?? linhaDeBaseDoPedido(p),
    parte: o.parte,
    totalCent: o.totalCent,
    grupos: o.grupos,
    avisos: o.avisos ?? [],
    alvoInexistente: o.alvoInexistente ?? false,
  };
}

/* ───────────────────────────── Uma função por chave (competência) ───────────────────────────── */

function entradasDaCompetencia(ctx: Contexto): Resultado {
  const { p } = ctx;
  const { parte } = p.pedido;
  const cat = p.categoriaDoRecorte;
  const txs = cat === null ? p.entradas.txs : p.entradas.txs.filter((t) => t.category_id === cat);
  const r = resumoMes({
    mes: p.mes,
    transactions: txs,
    statements: cat === null ? p.entradas.sts : [],
    receivables: p.entradas.recs,
  });
  const registros = ordenar(
    txs
      .filter((t) => ehEntradaDeConta(t, p.mes))
      .map((t, idx) =>
        registro({
          id: t.id ?? `entrada:${idx}`,
          data: t.data_compra ?? t.competence_date,
          descricao: t.descricao ?? "(sem descrição)",
          origem: nomeDaConta(p, t.account_id),
          categoria: t.category?.name ?? null,
          brutoCent: cent(t.amount),
          meuCent: meuCentavos(t),
          marcas: liquidado(t.status) ? [] : ["previsto"],
        }),
      ),
  );
  const totalCent =
    parte === "meu" ? cent(r.entradasMeu) : parte === "terceiros" ? cent(r.entradasTerceiros) : cent(r.entradas);
  return preparado(p, {
    parte,
    totalCent,
    grupos: registros.length > 0 ? [{ rotulo: "Entradas do mês", fatura: null, registros }] : [],
  });
}

function saidasDaCompetencia(ctx: Contexto): Resultado {
  const { p } = ctx;
  const { parte } = p.pedido;
  const { txs, sts, inst, recs } = p.entradas;
  const itens = itensDoMes(ctx, p.mes);
  const faturas = statementsDoMes(ctx, p.mes);
  const cat = p.categoriaDoRecorte;

  if (cat !== null) {
    // D-B-11: a saída da categoria vem da FATIA (a conta da rosca), que não desconta o estorno.
    const fatia = gastosPorCategoria({
      mes: p.mes,
      transactions: txs,
      statements: sts,
      installmentItems: inst,
      receivables: recs,
    }).find((f) => f.categoryId === cat);
    return preparado(p, {
      parte,
      totalCent: totalDaParte(parte, cent(fatia?.movimentado ?? 0), cent(fatia?.meu ?? 0)),
      grupos: gruposDeSaidas(ctx, {
        itens: itens.filter((i) => i.categoryId === cat),
        aVista: true,
        faturas,
        estornos: false,
        cabecalho: false,
      }),
      avisos: ["Com o recorte de categoria, os valores são antes dos estornos do cartão."],
    });
  }

  const r = resumoMes({ mes: p.mes, transactions: txs, statements: sts, receivables: recs });
  const totalCent = parte === "meu" ? cent(r.meu) : parte === "terceiros" ? cent(r.terceiros) : cent(r.saidas);
  return preparado(p, {
    parte,
    totalCent,
    grupos: gruposDeSaidas(ctx, { itens, aVista: true, faturas, estornos: true, cabecalho: true }),
  });
}

function cartaoDaCompetencia(ctx: Contexto): Resultado {
  const { p } = ctx;
  if (p.categoriaDoRecorte !== null) {
    return { tipo: "nao-segue", titulo: tituloDoPedido(p), frase: "Este número não segue o recorte de categoria." };
  }
  const { parte } = p.pedido;
  const { txs, sts, recs } = p.entradas;
  const r = resumoMes({ mes: p.mes, transactions: txs, statements: sts, receivables: recs });
  return preparado(p, {
    parte,
    totalCent: totalDaParte(parte, cent(r.cartao), cent(r.cartaoMeu)),
    grupos: gruposDeSaidas(ctx, {
      itens: itensDoMes(ctx, p.mes),
      aVista: false,
      faturas: statementsDoMes(ctx, p.mes),
      estornos: true,
      cabecalho: true,
    }),
  });
}

function categoriaDaCompetencia(ctx: Contexto): Resultado {
  const { p } = ctx;
  const { parte, alvo } = p.pedido;
  const { txs, sts, inst, recs } = p.entradas;
  const alvoId = alvo === "sem-categoria" ? null : alvo;
  const itens = itensDoMes(ctx, p.mes).filter((i) => i.categoryId === alvoId);
  const fatia = gastosPorCategoria({
    mes: p.mes,
    transactions: txs,
    statements: sts,
    installmentItems: inst,
    receivables: recs,
  }).find((f) => f.categoryId === alvoId);

  const conhecida =
    alvo === "sem-categoria" ||
    txs.some((t) => t.category_id === alvo) ||
    inst.some((i) => i.parent?.category?.id === alvo);
  const nome = itens[0]?.categoryName ?? (alvo === "sem-categoria" ? "Sem categoria" : null);

  return preparado(p, {
    titulo: tituloDoPedido(p, nome),
    parte,
    totalCent: totalDaParte(parte, cent(fatia?.movimentado ?? 0), cent(fatia?.meu ?? 0)),
    grupos: gruposDeSaidas(ctx, {
      itens,
      aVista: true,
      faturas: statementsDoMes(ctx, p.mes),
      estornos: false,
      cabecalho: false,
    }),
    alvoInexistente: alvo === null || !conhecida,
  });
}

function nomeDaForma(forma: string): string {
  if (forma === "outro") return "Outro";
  return forma in PAYMENT_METHOD_LABELS ? PAYMENT_METHOD_LABELS[forma as keyof typeof PAYMENT_METHOD_LABELS] : forma;
}

function formaDaCompetencia(ctx: Contexto): Resultado {
  const { p } = ctx;
  const { parte, alvo } = p.pedido;
  const { txs, sts, inst, recs } = p.entradas;
  const cat = p.categoriaDoRecorte;
  const valida = alvo === "outro" || (PAYMENT_METHODS as readonly string[]).includes(alvo ?? "");
  const itens = itensDoMes(ctx, p.mes).filter(
    (i) => (i.paymentMethod ?? "outro") === alvo && (cat === null || i.categoryId === cat),
  );
  // Com recorte de categoria o motor soma só os lançamentos e parcelas da categoria (`recortarPorCategoria`).
  const fatia = gastosPorForma({
    mes: p.mes,
    transactions: cat === null ? txs : txs.filter((t) => t.category_id === cat),
    statements: sts,
    installmentItems: cat === null ? inst : inst.filter((i) => i.parent?.category?.id === cat),
    receivables: recs,
  }).find((f) => f.paymentMethod === alvo);
  const nome = alvo === null || !valida ? null : nomeDaForma(alvo);

  return preparado(p, {
    titulo: tituloDoPedido(p, nome),
    parte,
    totalCent: totalDaParte(parte, cent(fatia?.movimentado ?? 0), cent(fatia?.meu ?? 0)),
    grupos: gruposDeSaidas(ctx, {
      itens,
      aVista: true,
      faturas: statementsDoMes(ctx, p.mes),
      estornos: false,
      cabecalho: false,
    }),
    alvoInexistente: !valida,
  });
}

function faturaDaCompetencia(ctx: Contexto): Resultado {
  const { p } = ctx;
  const { parte, alvo } = p.pedido;
  if (p.categoriaDoRecorte !== null) {
    return { tipo: "nao-segue", titulo: tituloDoPedido(p), frase: "Este número não segue o recorte de categoria." };
  }
  const s = alvo === null ? undefined : ctx.stPorId.get(alvo);
  if (s === undefined || !s.card_id) {
    return preparado(p, { parte, totalCent: 0, grupos: [], alvoInexistente: true });
  }
  const { txs, sts, inst, recs } = p.entradas;
  const itens = itensDeGasto({
    transactions: txs,
    statements: sts,
    installmentItems: inst,
    receivables: recs,
  }).filter((i) => i.statementId === s.id);

  const totalCent = cent(s.total_atual ?? 0);
  const terceirosCent = ctx.terceirosPorFatura.get(s.id) ?? 0;
  const titulo = `Fatura · ${nomeDoCartao(p, s.card_id)} · vence ${diaMes(s.data_vencimento)}`;
  return preparado(p, {
    titulo,
    parte,
    totalCent: totalDaParte(parte, totalCent, totalCent - terceirosCent),
    grupos: gruposDeSaidas(ctx, { itens, aVista: false, faturas: [s], estornos: true, cabecalho: true }),
  });
}

/* ───────────────────────────── Pendente ───────────────────────────── */

function gruposPorPessoa(
  itens: { r: ParametrosDoDetalhe["recebiveisCrus"][number]; refMonth: string | null; valorCent: number }[],
): GrupoDoDetalhe[] {
  const porPessoa = new Map<string, GrupoDoDetalhe>();
  for (const { r, refMonth, valorCent } of itens) {
    const nome = r.person?.nome ?? "Sem pessoa";
    const chave = r.person?.id ?? nome;
    const grupo = porPessoa.get(chave) ?? { rotulo: nome, fatura: null, registros: [] };
    grupo.registros.push(
      registro({
        id: r.id,
        data: null,
        descricao: refMonth ? `A receber · referente a ${rotuloDoMes(refMonth)}` : "A receber",
        origem: r.person?.nome ?? null,
        categoria: null,
        // O valor do registro é o que ainda falta voltar: a partição vira meu = 0, terceiros = saldo.
        brutoCent: valorCent,
        meuCent: 0,
        marcas: [],
      }),
    );
    porPessoa.set(chave, grupo);
  }
  return [...porPessoa.values()]
    .map((g) => ({ ...g, registros: ordenar(g.registros) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo));
}

function pendenteAteHoje(ctx: Contexto): Resultado {
  const { p } = ctx;
  const { alvo } = p.pedido;
  const crus = alvo === null ? p.recebiveisCrus : p.recebiveisCrus.filter((r) => r.person?.id === alvo);
  const nome = alvo === null ? null : (crus[0]?.person?.nome ?? null);
  const refs = refMonthDosCrus(crus);
  const itens = crus
    .map((r, i) => ({ r, refMonth: refs[i], valorCent: cent(totalPendenteAte([r], p.hoje)) }))
    .filter((x) => x.valorCent > 0);
  return preparado(p, {
    titulo: tituloDoPedido(p, nome),
    parte: "pendente",
    totalCent: cent(totalPendenteAte(crus, p.hoje)),
    grupos: gruposPorPessoa(itens),
    alvoInexistente: alvo !== null && crus.length === 0,
  });
}

/**
 * O mês de referência de cada recebível cru, pela regra ÚNICA do pipeline (`montarEntradas`: a
 * competência da fatura ou a data da compra). ⛔ A leitura real (`ESCOPO_PAINEL`) NÃO traz
 * `ref_month` nos crus — por isso o tipo não o aceita, e ele é derivado aqui, 1:1 e na mesma ordem.
 */
function refMonthDosCrus(crus: ParametrosDoDetalhe["recebiveisCrus"]): (string | null)[] {
  return montarEntradas({ recebiveis: crus }).recs.map((r) => r.ref_month ?? null);
}

function pendenteDoMesDaCompetencia(ctx: Contexto): Resultado {
  const { p } = ctx;
  const refs = refMonthDosCrus(p.recebiveisCrus);
  const itens = p.recebiveisCrus
    .map((r, i) => ({
      r,
      refMonth: refs[i],
      valorCent: cent(pendenteDoPeriodo([{ ...resumirRecebivel(r), ref_month: refs[i] }], p.mes)),
    }))
    .filter((x) => x.valorCent > 0);
  return preparado(p, {
    parte: "pendente",
    totalCent: cent(totalAReceber(p.entradas.recs, p.mes)),
    grupos: gruposPorPessoa(itens),
  });
}

/* ───────────────────────────── Projeção, contas e saldo ───────────────────────────── */

function projecaoDoMes(ctx: Contexto): Resultado {
  const { p } = ctx;
  const { alvo } = p.pedido;
  if (!ehMesValido(alvo)) {
    return preparado(p, { parte: "projetado", totalCent: 0, grupos: [], alvoInexistente: true });
  }
  const { sts, recs, recorrencias, bills } = p.entradas;
  const ponto = projecaoProximosMeses({
    hoje: p.hoje,
    meses: [alvo],
    statements: sts,
    receivables: recs,
    recorrencias,
    bills,
  })[0];

  const faturas = sts
    .filter((s) => s.card_id && mesDe(s.data_vencimento) === alvo)
    .map((s) => {
      const totalCent = cent(s.total_atual ?? 0);
      return registro({
        id: `fatura:${s.id}`,
        data: s.data_vencimento,
        descricao: `Fatura ${nomeDoCartao(p, s.card_id)}`,
        origem: nomeDoCartao(p, s.card_id),
        categoria: null,
        brutoCent: totalCent,
        meuCent: totalCent - (ctx.terceirosPorFatura.get(s.id) ?? 0),
        marcas: ["projetado"],
      });
    });

  const recorrentes = recorrencias.flatMap((rec, idx) => {
    if (!rec.is_active || rec.type !== "despesa") return [];
    const ocorrencias = ocorrenciasNoMes(rec, alvo);
    if (ocorrencias === 0) return [];
    const valorCent = ocorrencias * cent(rec.amount);
    return [
      registro({
        id: `recorrencia:${idx}`,
        data: mesDe(rec.next_due_date) === alvo ? rec.next_due_date : null,
        descricao: `Despesa recorrente (${FREQUENCY_LABELS[rec.frequency].toLowerCase()})${ocorrencias > 1 ? ` · ${ocorrencias} ocorrências` : ""}`,
        origem: null,
        categoria: null,
        brutoCent: valorCent,
        meuCent: valorCent,
        marcas: ["projetado"],
      }),
    ];
  });

  const fixas = bills.flatMap((b, idx) =>
    b.is_active
      ? [
          registro({
            id: `conta-fixa:${idx}`,
            data: dataNoMes(alvo, b.due_day),
            descricao: b.name,
            origem: null,
            categoria: null,
            brutoCent: cent(b.amount),
            meuCent: cent(b.amount),
            marcas: ["projetado"],
          }),
        ]
      : [],
  );

  const grupos: GrupoDoDetalhe[] = [
    { rotulo: "Faturas (pelo vencimento)", fatura: null, registros: ordenar(faturas) },
    { rotulo: "Despesas recorrentes", fatura: null, registros: ordenar(recorrentes) },
    { rotulo: "Contas fixas", fatura: null, registros: ordenar(fixas) },
  ].filter((g) => g.registros.length > 0);

  return preparado(p, { parte: "projetado", totalCent: cent(ponto.total), grupos });
}

function contasAPagar(ctx: Contexto): Resultado {
  const { p } = ctx;
  const { bills } = p.entradas;
  const registros = vencimentosDasContas({ hoje: p.hoje, bills }).map((v, idx) =>
    registro({
      id: `conta:${idx}`,
      data: v.data,
      descricao: v.nome,
      origem: null,
      categoria: null,
      brutoCent: cent(v.valor),
      meuCent: cent(v.valor),
      marcas: ["projetado"],
    }),
  );
  return preparado(p, {
    parte: "projetado",
    totalCent: cent(proximasContasPagar({ hoje: p.hoje, bills }).total),
    grupos: registros.length > 0 ? [{ rotulo: "Contas fixas a vencer", fatura: null, registros }] : [],
  });
}

function saldoDasContas(ctx: Contexto): Resultado {
  const { p } = ctx;
  const { saldos } = p;
  if (saldos === null || saldos.totalCent === null) {
    return { tipo: "falha", titulo: tituloDoPedido(p), frase: "Não foi possível ler o saldo." };
  }
  const avisos: string[] = [];
  const registros: RegistroDoDetalhe[] = [];
  for (const conta of saldos.porConta) {
    if (conta.saldoCent === null) {
      avisos.push(`Não foi possível ler o saldo de ${conta.nome}.`);
      continue;
    }
    registros.push(
      registro({
        id: `saldo:${conta.id}`,
        data: null,
        descricao: conta.nome,
        origem: null,
        categoria: null,
        brutoCent: conta.saldoCent,
        meuCent: conta.saldoCent,
        marcas: [],
      }),
    );
  }
  registros.sort((a, b) => a.descricao.localeCompare(b.descricao));
  return preparado(p, {
    parte: "saldo",
    totalCent: saldos.totalCent,
    grupos: registros.length > 0 ? [{ rotulo: "Saldo por conta", fatura: null, registros }] : [],
    avisos,
  });
}

/* ───────────────────────────── Base caixa ───────────────────────────── */

type ContextoDoCaixa = {
  leitura: Extract<LeituraDoCaixa, { ok: true }>;
  motor: MotorDoCaixa;
  periodo: Periodo;
  movs: Movimento[];
  faturas: ReturnType<typeof faturasDoMotor>;
};

function contextoDoCaixa(p: ParametrosDoDetalhe): ContextoDoCaixa | null {
  const c = p.caixa;
  if (c === null || c === "erro") return null;
  const periodo = periodoAteODia(p.mes, 31);
  return {
    leitura: c.leitura,
    motor: c.motor,
    periodo,
    movs: movimentos(periodo, c.leitura.transactions, c.leitura.pagamentos, perdoadoPorLancamento(c.motor.receivables)),
    faturas: faturasDoMotor(c.motor),
  };
}

function registroDeMovimento(p: ParametrosDoDetalhe, c: ContextoDoCaixa, m: Movimento): RegistroDoDetalhe {
  const t = m.t;
  const { data, aproximada } = dataDeCaixa(t);
  const marcas: MarcaDoRegistro[] = aproximada ? ["data-aproximada"] : [];
  let brutoCent: number;
  let meuCent: number;
  if (m.kind === "renda") {
    brutoCent = cent(t.amount);
    meuCent = m.meuCent;
  } else if (m.kind === "despesa") {
    brutoCent = m.brutoCent;
    meuCent = m.meuCent;
  } else if (m.kind === "sem_vinculo") {
    brutoCent = m.brutoCent;
    meuCent = m.brutoCent;
  } else {
    brutoCent = m.brutoCent;
    const meuDaFatura = meuDoPagamento(m, c.faturas);
    if (meuDaFatura === null) {
      meuCent = m.brutoCent;
      marcas.push("contado-cheio");
    } else {
      meuCent = meuDaFatura;
    }
  }
  return registro({
    id: t.id,
    data,
    descricao: t.description ?? (m.kind === "fatura" ? "Pagamento de fatura" : "(sem descrição)"),
    origem: nomeDaConta(p, t.account_id),
    categoria: t.category?.name ?? null,
    brutoCent,
    meuCent,
    marcas,
  });
}

function avisosDoCaixa(c: ContextoDoCaixa, registros: readonly RegistroDoDetalhe[]): string[] {
  const avisos: string[] = [];
  if (c.leitura.parcial) {
    avisos.push("A leitura do caixa foi cortada pelo teto; pode faltar registro.");
  }
  const cheios = registros.filter((r) => r.marcas.includes("contado-cheio")).length;
  if (cheios > 0) {
    avisos.push(
      cheios === 1
        ? "1 pagamento de fatura contado cheio (a fatura não tem total lido)"
        : `${cheios} pagamentos de fatura contados cheios (as faturas não têm total lido)`,
    );
  }
  return avisos;
}

function entradasDoCaixaDetalhe(p: ParametrosDoDetalhe, c: ContextoDoCaixa): Resultado {
  const { parte } = p.pedido;
  const minha = minhaParteDoCaixa({
    periodo: c.periodo,
    transactions: c.leitura.transactions,
    pagamentos: c.leitura.pagamentos,
    motor: c.motor,
  });
  const numeros = numerosDoCaixa({
    periodo: c.periodo,
    transactions: c.leitura.transactions,
    pagamentosDeFatura: c.leitura.pagamentosDeFatura,
    recebiveis: c.leitura.recebiveis,
  });
  const registros = ordenar(c.movs.filter((m) => m.kind === "renda").map((m) => registroDeMovimento(p, c, m)));
  // Terceiros = o dinheiro de terceiros que entrou; consolidado = a partição minha + terceiros.
  const totalCent =
    parte === "meu"
      ? cent(minha.entradas)
      : parte === "terceiros"
        ? cent(numeros.outrasEntradasDeTerceiros)
        : cent(minha.entradas) + cent(numeros.outrasEntradasDeTerceiros);
  return preparado(p, {
    parte,
    totalCent,
    grupos: registros.length > 0 ? [{ rotulo: "Entradas em conta", fatura: null, registros }] : [],
    avisos: avisosDoCaixa(c, registros),
  });
}

function saidasDoCaixaDetalhe(p: ParametrosDoDetalhe, c: ContextoDoCaixa): Resultado {
  const { parte } = p.pedido;
  const minha = minhaParteDoCaixa({
    periodo: c.periodo,
    transactions: c.leitura.transactions,
    pagamentos: c.leitura.pagamentos,
    motor: c.motor,
  });
  const secao = (kind: Movimento["kind"], rotulo: string): GrupoDoDetalhe => ({
    rotulo,
    fatura: null,
    registros: ordenar(c.movs.filter((m) => m.kind === kind).map((m) => registroDeMovimento(p, c, m))),
  });
  const grupos = [
    secao("despesa", "Despesas pagas"),
    secao("fatura", "Pagamentos de fatura"),
    secao("sem_vinculo", "Transferências sem destino"),
  ].filter((g) => g.registros.length > 0);
  const totalCent =
    parte === "meu"
      ? cent(minha.saidas)
      : parte === "terceiros"
        ? cent(minha.terceirosNasSaidas)
        : cent(minha.saidasBrutas);
  return preparado(p, {
    parte,
    totalCent,
    grupos,
    avisos: avisosDoCaixa(c, grupos.flatMap((g) => g.registros)),
  });
}

function linhaDoCaixaDetalhe(p: ParametrosDoDetalhe, c: ContextoDoCaixa): Resultado {
  const alvo = p.pedido.alvo;
  if (!ehLinhaDoCaixa(alvo)) {
    return preparado(p, { parte: "bruto", totalCent: 0, grupos: [], alvoInexistente: true });
  }
  const numeros = numerosDoCaixa({
    periodo: c.periodo,
    transactions: c.leitura.transactions,
    pagamentosDeFatura: c.leitura.pagamentosDeFatura,
    recebiveis: c.leitura.recebiveis,
  });
  const doTipo = (...kinds: Movimento["kind"][]) =>
    c.movs.filter((m) => kinds.includes(m.kind)).map((m) => registroDeMovimento(p, c, m));

  let parte: ParteDoDetalhe = "bruto";
  let totalCent = 0;
  let registros: RegistroDoDetalhe[] = [];

  switch (alvo) {
    case "renda":
      parte = "meu";
      totalCent = cent(numeros.rendaPessoalRecebida);
      registros = doTipo("renda").filter((r) => r.meuCent !== 0);
      break;
    case "outras":
      parte = "terceiros";
      totalCent = cent(numeros.outrasEntradasDeTerceiros);
      registros = doTipo("renda").filter((r) => r.terceirosCent !== 0);
      break;
    case "saidas":
      totalCent = cent(numeros.saidasDeCaixa);
      registros = doTipo("despesa", "fatura", "sem_vinculo");
      break;
    case "pagamentos":
      totalCent = cent(numeros.pagamentosDeFatura);
      registros = doTipo("fatura");
      break;
    case "sem-destino":
      totalCent = cent(numeros.transferenciasSemVinculo.total);
      registros = doTipo("sem_vinculo");
      break;
    case "reembolsos":
      totalCent = cent(numeros.reembolsosRecebidos);
      registros = c.leitura.recebiveis.flatMap((r, i) =>
        entradasDoRecebivel(r, r.recebimentos).flatMap((e, j) =>
          e.data === null || e.data < c.periodo.de || e.data > c.periodo.ate
            ? []
            : [
                registro({
                  id: `reembolso:${i}:${j}`,
                  data: e.data,
                  descricao: "Reembolso recebido",
                  origem: null,
                  categoria: null,
                  brutoCent: e.centavos,
                  meuCent: 0,
                  marcas: [],
                }),
              ],
        ),
      );
      break;
    case "entre-contas":
      totalCent = cent(numeros.transferenciasEntreContas);
      registros = c.leitura.transactions
        .filter((t: TxDeCaixa) => {
          if (!liquidado(t.status)) return false;
          const { data } = dataDeCaixa(t);
          if (data < c.periodo.de || data > c.periodo.ate) return false;
          return classeDeCaixa(t, c.leitura.pagamentosDeFatura) === "entre-contas";
        })
        .map((t) => {
          const { data, aproximada } = dataDeCaixa(t);
          return registro({
            id: t.id,
            data,
            descricao: t.description ?? "Transferência entre contas",
            origem: nomeDaConta(p, t.account_id),
            categoria: null,
            brutoCent: cent(t.amount),
            meuCent: cent(t.amount),
            marcas: aproximada ? ["data-aproximada"] : [],
          });
        });
      break;
  }

  const ordenados = ordenar(registros);
  return preparado(p, {
    titulo: tituloDoPedido(p),
    linhaDeBase: linhaDeBaseDoPedido(p, parte),
    parte,
    totalCent,
    grupos: ordenados.length > 0 ? [{ rotulo: TITULO_DA_LINHA_DO_CAIXA[alvo], fatura: null, registros: ordenados }] : [],
    avisos: avisosDoCaixa(c, ordenados),
  });
}

/* ───────────────────────────── Despacho ───────────────────────────── */

const FRASE_CAIXA_NAO_LIDO = "Não foi possível ler o caixa agora.";

function preparar(p: ParametrosDoDetalhe): Resultado {
  const ctx = contextoDe(p);
  const { chave } = p.pedido;
  const noCaixa = p.base === "caixa";

  switch (chave) {
    case "entradas":
    case "saidas": {
      if (!noCaixa) return chave === "entradas" ? entradasDaCompetencia(ctx) : saidasDaCompetencia(ctx);
      const c = contextoDoCaixa(p);
      if (c === null) return { tipo: "falha", titulo: tituloDoPedido(p), frase: FRASE_CAIXA_NAO_LIDO };
      return chave === "entradas" ? entradasDoCaixaDetalhe(p, c) : saidasDoCaixaDetalhe(p, c);
    }
    case "caixa": {
      if (p.caixa === "erro") return { tipo: "falha", titulo: tituloDoPedido(p), frase: FRASE_CAIXA_NAO_LIDO };
      const c = contextoDoCaixa(p);
      if (c === null) {
        return { tipo: "nao-segue", titulo: tituloDoPedido(p), frase: "Este número só existe na base caixa." };
      }
      return linhaDoCaixaDetalhe(p, c);
    }
    case "cartao":
    case "categoria":
    case "forma": {
      if (noCaixa) {
        return { tipo: "nao-segue", titulo: tituloDoPedido(p), frase: "Este número não é calculado na base caixa." };
      }
      if (chave === "cartao") return cartaoDaCompetencia(ctx);
      return chave === "categoria" ? categoriaDaCompetencia(ctx) : formaDaCompetencia(ctx);
    }
    case "fatura":
      return faturaDaCompetencia(ctx);
    case "pendente":
      return pendenteAteHoje(ctx);
    case "pendente-do-mes":
      return pendenteDoMesDaCompetencia(ctx);
    case "projecao":
      return projecaoDoMes(ctx);
    case "contas":
      return contasAPagar(ctx);
    case "saldo":
      return saldoDasContas(ctx);
  }
}

function avisosDeCompletude(c: CompletudeFinanceira): string[] {
  return c.estado === "parcial"
    ? c.motivos.map((motivo) => `Leitura parcial: ${motivo}; pode faltar registro.`)
    : [];
}

function finalizar(p: ParametrosDoDetalhe, pr: Preparado): Detalhe {
  const coluna = colunaDaParte(pr.parte);
  const todos = pr.grupos.flatMap((g) => g.registros);
  const existentes = todos.length;
  const avisos = [...avisosDeCompletude(p.completude), ...pr.avisos];

  if (pr.alvoInexistente) {
    return { estado: "vazio", titulo: pr.titulo, linhaDeBase: pr.linhaDeBase, frase: "Registro não encontrado.", avisos };
  }
  // Vazio só quando NÃO há registro e o motor também não tem número: um total diferente de zero
  // sem lista é uma diferença a declarar, nunca um "nenhum registro".
  if (existentes === 0 && pr.totalCent === 0) {
    return { estado: "vazio", titulo: pr.titulo, linhaDeBase: pr.linhaDeBase, frase: "Nenhum registro neste mês.", avisos };
  }

  const somaDosRegistros = somaCent(todos, coluna);
  const aproximados = todos.filter((r) => r.marcas.includes("data-aproximada")).length;
  if (aproximados > 0) {
    avisos.push(
      aproximados === 1
        ? "1 registro com data aproximada (competência)"
        : `${aproximados} registros com data aproximada (competência)`,
    );
  }

  let restante = TETO_DA_GAVETA;
  const grupos: GrupoDoDetalhe[] = [];
  for (const g of pr.grupos) {
    const exibidos = g.registros.slice(0, restante);
    restante -= exibidos.length;
    if (exibidos.length === 0 && g.fatura === null) continue;
    grupos.push({ ...g, registros: exibidos });
  }
  if (existentes > TETO_DA_GAVETA) {
    avisos.push(`Mostrando ${TETO_DA_GAVETA} de ${existentes}; o total continua o do motor.`);
  }

  return {
    estado: "ok",
    titulo: pr.titulo,
    linhaDeBase: pr.linhaDeBase,
    parte: pr.parte,
    totalCent: pr.totalCent,
    somaCent: somaDosRegistros,
    diferencaCent: pr.totalCent - somaDosRegistros,
    grupos,
    aproximados,
    existentes,
    exibidos: Math.min(existentes, TETO_DA_GAVETA),
    avisos,
  };
}

/**
 * O detalhe de UM número: o total do motor, os registros que o compõem e a conciliação entre os
 * dois. Ordem dos estados: `naoSegue` → `falha` (caixa ou saldo não lidos) → alvo inexistente →
 * sem registro → `ok`.
 */
export function detalheDoNumero(p: ParametrosDoDetalhe): Detalhe {
  if (p.naoSegue !== null) {
    return {
      estado: "nao-segue",
      titulo: tituloDoPedido(p),
      frase: p.naoSegue.frase,
      hrefSemFiltro: p.naoSegue.hrefSemFiltro,
    };
  }
  const r = preparar(p);
  if (r.tipo === "falha") return { estado: "falha", titulo: r.titulo, frase: r.frase };
  if (r.tipo === "nao-segue") {
    return { estado: "nao-segue", titulo: r.titulo, frase: r.frase, hrefSemFiltro: null };
  }
  return finalizar(p, r);
}
