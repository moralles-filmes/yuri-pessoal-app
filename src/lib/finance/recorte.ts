/**
 * REDESIGN-04-A2 — os RECORTES do relatório financeiro (L1, L4, L5, D-A2-1/2/9–14/23/24), puros.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NENHUMA SOMA MORA AQUI. Este arquivo só FILTRA lista e CHAMA as funções do motor        ║
 * ║ (`gastosPorCategoria`, `gastosPorForma`, `resumoMes`). Recalcular por lançamento quando ║
 * ║ há filtro seria uma segunda conta, que diverge da fatura (L1, recusado pelo dono).      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Três portas, e o TIPO do retorno diz a que cada uma pode alimentar (D-A2-14):
 *  - `recortarEntradas` (cartão, conta): devolve as ENTRADAS do motor recortadas, que passam por
 *    `resumoMes` e pelas outras funções de sempre;
 *  - `recortarPorCategoria`: devolve SÓ resultados prontos. Sem lista recortada nas mãos, quem
 *    chama não tem como passá-la ao total da fatura — irrepresentável, não só proibido;
 *  - `recortarRecebiveisCrus` (pessoa, cartão): filtra só a lista crua de recebíveis (D-A2-9).
 *
 * O "segue × não segue" de cada bloco é DADO (`SEGUE_O_RECORTE`), lido pela tela e testado.
 *
 * Sem `Date.now()`, sem `new Date()`, sem Supabase, sem `server-only`: a tela o lê.
 */
import type { BaseFinanceira } from "@/lib/finance/base";
import {
  type CategoriaSlice,
  type FormaSlice,
  type ResumoMes,
  gastosPorCategoria,
  gastosPorForma,
  resumoMes,
} from "@/lib/finance/dashboard";
import type { ESCOPO_PAINEL, EntradasDoEscopo } from "@/lib/finance/pipeline";

/** As entradas do motor que o relatório recebe (a leitura de `ESCOPO_PAINEL`). */
export type EntradasDoMotorDoRelatorio = EntradasDoEscopo<typeof ESCOPO_PAINEL>;

/* ───────────────────────────── O recorte da URL ───────────────────────────── */

export type TipoDeRecorte = "conta" | "cartao" | "pessoa" | "categoria";

/** Um id por tipo, no máximo (D-A2-2). `null` = sem recorte daquele tipo. */
export type Recorte = {
  conta: string | null;
  cartao: string | null;
  pessoa: string | null;
  categoria: string | null;
};

export const SEM_RECORTE: Recorte = Object.freeze({
  conta: null,
  cartao: null,
  pessoa: null,
  categoria: null,
});

type ParametrosDaUrl = Record<string, string | string[] | undefined>;

/** O id do parâmetro, se for UM texto que está na lista do dono; qualquer outra coisa é `null`. */
function idConhecido(v: string | string[] | undefined, conhecidos: readonly string[]): string | null {
  if (typeof v !== "string") return null;
  return conhecidos.includes(v) ? v : null;
}

/**
 * Os quatro recortes da URL (D-A2-3). Id que não está na lista do dono — ou parâmetro repetido —
 * é IGNORADO: nunca há filtro fantasma. Conta e cartão se excluem (D-A2-1): com os dois válidos,
 * vale o CARTÃO (Review Focus 1).
 */
export function recorteDaUrl(
  sp: ParametrosDaUrl,
  conhecidos: {
    contas: readonly string[];
    cartoes: readonly string[];
    pessoas: readonly string[];
    categorias: readonly string[];
  },
): Recorte {
  const cartao = idConhecido(sp.cartao, conhecidos.cartoes);
  const conta = cartao === null ? idConhecido(sp.conta, conhecidos.contas) : null;
  return {
    conta,
    cartao,
    pessoa: idConhecido(sp.pessoa, conhecidos.pessoas),
    categoria: idConhecido(sp.categoria, conhecidos.categorias),
  };
}

/** Os recortes ligados, sempre na mesma ordem (é a ordem em que `naoSegue` os confere). */
export function recortesAtivos(r: Recorte): TipoDeRecorte[] {
  const ordem: TipoDeRecorte[] = ["conta", "cartao", "categoria", "pessoa"];
  return ordem.filter((tipo) => r[tipo] !== null);
}

/* ───────────────────────────── Cartão e conta: o motor recortado ───────────────────────────── */

/**
 * Recorte de CARTÃO (D-A2-11) e de CONTA (D-A2-12): as entradas do motor filtradas. Sem recorte de
 * cartão nem de conta, devolve as MESMAS entradas. Com os dois, vale o cartão (D-A2-1).
 *
 *  - cartão: lançamentos e faturas do cartão; parcelas das faturas que ficaram; recebíveis das
 *    faturas e dos lançamentos que ficaram; só o cartão em `cards`. Recorrências e contas fixas
 *    ficam como estão: os blocos de projeção não seguem recorte, então elas não importam;
 *  - conta: lançamentos daquela conta; SEM faturas e SEM parcelas (a compra no cartão não tem
 *    conta); recebíveis dos lançamentos que ficaram.
 */
export function recortarEntradas<E extends EntradasDoMotorDoRelatorio>(
  entradas: E,
  r: Pick<Recorte, "conta" | "cartao">,
): E {
  if (r.cartao !== null) {
    const cartaoId = r.cartao;
    const txs = entradas.txs.filter((t) => t.card_id === cartaoId);
    const sts = entradas.sts.filter((s) => s.card_id === cartaoId);
    const faturas = new Set(sts.map((s) => s.id));
    const lancamentos = new Set(txs.flatMap((t) => (t.id === undefined ? [] : [t.id])));
    return {
      ...entradas,
      txs,
      sts,
      inst: entradas.inst.filter((i) => i.statement_id !== null && faturas.has(i.statement_id)),
      recs: entradas.recs.filter(
        (rec) =>
          (rec.statement_id !== null && faturas.has(rec.statement_id)) ||
          (rec.transaction_id != null && lancamentos.has(rec.transaction_id)),
      ),
      cards: entradas.cards.filter((c) => c.id === cartaoId),
    };
  }

  if (r.conta !== null) {
    const contaId = r.conta;
    const txs = entradas.txs.filter((t) => t.account_id === contaId);
    const lancamentos = new Set(txs.flatMap((t) => (t.id === undefined ? [] : [t.id])));
    return {
      ...entradas,
      txs,
      sts: [],
      inst: [],
      recs: entradas.recs.filter((rec) => rec.transaction_id != null && lancamentos.has(rec.transaction_id)),
    };
  }

  return entradas;
}

/* ───────────────────────────── Categoria: só resultados prontos ───────────────────────────── */

/**
 * Recorte de CATEGORIA (L4, D-A2-10). ⛔ Devolve SÓ resultados prontos — nenhuma lista do motor —,
 * para que ninguém passe lançamentos filtrados ao total da fatura (o erro que a revisão achou).
 *
 *  - `fatia`: a da categoria em `gastosPorCategoria` sobre as entradas INTEIRAS (a conta da rosca,
 *    que a 04-A concilia com "Minhas saídas"). Categoria sem item no mês → `null`;
 *  - `formas`: `gastosPorForma` com os lançamentos e as parcelas da categoria e TODAS as faturas,
 *    porque o motor é item a item e usa a fatura só para achar o mês;
 *  - `entradas`: `resumoMes` sobre as receitas da categoria, sem faturas (só as de conta contam).
 *
 * "Zero" aqui é zero MEDIDO: a leitura veio completa e a categoria não tem item (Review Focus 2).
 */
export function recortarPorCategoria(p: {
  mes: string;
  categoriaId: string;
  entradas: Pick<EntradasDoMotorDoRelatorio, "txs" | "sts" | "recs" | "inst">;
}): {
  fatia: CategoriaSlice | null;
  formas: FormaSlice[];
  entradas: Pick<ResumoMes, "entradas" | "entradasMeu" | "entradasTerceiros">;
} {
  const { mes, categoriaId, entradas } = p;

  const fatia =
    gastosPorCategoria({
      mes,
      transactions: entradas.txs,
      statements: entradas.sts,
      installmentItems: entradas.inst,
      receivables: entradas.recs,
    }).find((f) => f.categoryId === categoriaId) ?? null;

  const txsDaCategoria = entradas.txs.filter((t) => t.category_id === categoriaId);

  const formas = gastosPorForma({
    mes,
    transactions: txsDaCategoria,
    statements: entradas.sts,
    installmentItems: entradas.inst.filter((i) => i.parent?.category?.id === categoriaId),
    receivables: entradas.recs,
  });

  const resumo = resumoMes({
    mes,
    transactions: txsDaCategoria,
    statements: [],
    receivables: entradas.recs,
  });

  return {
    fatia,
    formas,
    entradas: {
      entradas: resumo.entradas,
      entradasMeu: resumo.entradasMeu,
      entradasTerceiros: resumo.entradasTerceiros,
    },
  };
}

/* ───────────────────────────── Pessoa e cartão: a lista crua de recebíveis ───────────────────────────── */

/**
 * D-A2-9 (L5) e D-A2-23: pessoa e cartão filtram SÓ a lista crua de recebíveis, que já traz
 * `person_id` e `card_id` (`ReceivableRow`). Alimenta `aReceberPorPessoa`/`totalPendenteAte`. O de
 * conta não alcança o pendente: o recebível não sabe a conta.
 */
export function recortarRecebiveisCrus<R extends { person_id: string | null; card_id: string | null }>(
  recs: readonly R[],
  r: Pick<Recorte, "pessoa" | "cartao">,
): R[] {
  return recs.filter(
    (rec) =>
      (r.pessoa === null || rec.person_id === r.pessoa) && (r.cartao === null || rec.card_id === r.cartao),
  );
}

/* ───────────────────────────── A matriz "segue × não segue" (§5 do desenho) ───────────────────────────── */

export type BlocoDoRelatorio =
  | "saldo"
  | "entradas"
  | "saidas"
  | "terceiros"
  | "pendente"
  | "setas"
  | "barras"
  | "mesAMes"
  | "rosca"
  | "formas"
  | "ancora"
  | "maiores"
  | "assinaturas"
  | "projecao"
  | "faturasFuturas";

type Celula = true | { motivo: string };

const nao = (motivo: string): { motivo: string } => ({ motivo });

/**
 * ✓ (`true`) = o bloco segue o recorte: o motor roda sobre as entradas recortadas. ✗ = estado "não
 * segue", com o motivo em pt-BR (a tela o escreve no lugar do número). Célula a célula, é a §5 do
 * desenho; `ancora` é o card "Meu × bruto × terceiros".
 */
export const SEGUE_O_RECORTE: Record<BlocoDoRelatorio, Record<TipoDeRecorte, Celula>> = {
  saldo: {
    cartao: nao("o cartão não tem saldo"),
    conta: true,
    categoria: nao("o saldo é da conta, não de uma categoria"),
    pessoa: nao("o saldo é da conta, não de uma pessoa"),
  },
  entradas: {
    cartao: nao("estorno de cartão não é entrada"),
    conta: true,
    categoria: true,
    pessoa: nao("as entradas não são divididas por pessoa"),
  },
  saidas: {
    cartao: true,
    conta: true,
    categoria: true,
    pessoa: nao("a fatura é um total só, sem divisão por pessoa"),
  },
  terceiros: {
    cartao: true,
    conta: true,
    categoria: true,
    pessoa: nao("as saídas de terceiros não são separadas por pessoa nesta versão"),
  },
  pendente: {
    cartao: true,
    conta: nao("o recebível não sabe a conta"),
    categoria: nao("o recebível não sabe a categoria"),
    pessoa: true,
  },
  setas: {
    cartao: nao("a comparação com o mês anterior vale só sem recorte"),
    conta: nao("a comparação com o mês anterior vale só sem recorte"),
    categoria: nao("a comparação com o mês anterior vale só sem recorte"),
    pessoa: nao("a comparação com o mês anterior vale só sem recorte"),
  },
  barras: {
    cartao: true,
    conta: true,
    categoria: nao("as barras de 6 meses não se decompõem por categoria"),
    pessoa: nao("as barras de 6 meses não se decompõem por pessoa"),
  },
  mesAMes: {
    cartao: nao("o mês a mês compara só o à vista"),
    conta: true,
    categoria: nao("o mês a mês não se decompõe por categoria"),
    pessoa: nao("o mês a mês não se decompõe por pessoa"),
  },
  rosca: {
    cartao: true,
    conta: true,
    categoria: nao("a rosca divide as categorias, e o filtro já escolheu uma só"),
    pessoa: nao("a rosca não se decompõe por pessoa"),
  },
  formas: {
    cartao: nao("no cartão a forma de pagamento é sempre crédito"),
    conta: true,
    categoria: true,
    pessoa: nao("a forma de pagamento não se decompõe por pessoa"),
  },
  ancora: {
    cartao: true,
    conta: true,
    categoria: nao("o quadro meu, bruto e de terceiros não se decompõe por categoria"),
    pessoa: nao("o quadro meu, bruto e de terceiros não se decompõe por pessoa"),
  },
  maiores: {
    cartao: true,
    conta: true,
    categoria: true,
    pessoa: nao("os maiores gastos não se decompõem por pessoa"),
  },
  assinaturas: {
    cartao: nao("a recorrência não guarda o cartão"),
    conta: nao("a recorrência não guarda a conta"),
    categoria: true,
    pessoa: nao("a recorrência não guarda a pessoa"),
  },
  projecao: {
    cartao: nao("a projeção nunca segue recorte"),
    conta: nao("a projeção nunca segue recorte"),
    categoria: nao("a projeção nunca segue recorte"),
    pessoa: nao("a projeção nunca segue recorte"),
  },
  faturasFuturas: {
    cartao: true,
    conta: nao("fatura é de cartão, não de conta"),
    categoria: nao("a fatura futura não se decompõe por categoria"),
    pessoa: nao("a fatura futura não se decompõe por pessoa"),
  },
};

/** Por que o bloco não pode mostrar número na base caixa (D-A2-6). */
const MOTIVO_DA_BASE_CAIXA = "a base caixa não se recorta nesta versão";

/**
 * Os blocos que, na base caixa, vêm da leitura do caixa (`estadoDoCaixa`) — e por isso não se
 * recortam (D-A2-6: recortá-la exigiria um segundo caminho de filtro, fora do motor). Os outros
 * cinco (saldo, pendente, assinaturas, projeção e faturas futuras) não leem o caixa, em nenhuma
 * base: seguem a MESMA matriz da competência.
 */
const BLOCOS_LIDOS_DO_CAIXA: ReadonlySet<BlocoDoRelatorio> = new Set<BlocoDoRelatorio>([
  "entradas",
  "saidas",
  "terceiros",
  "setas",
  "barras",
  "mesAMes",
  "rosca",
  "formas",
  "ancora",
  "maiores",
]);

/**
 * O primeiro recorte ATIVO que o bloco não segue, com o motivo; `null` = o bloco segue todos os
 * recortes ligados (inclusive nenhum). Na base caixa, qualquer recorte ligado é ✗ (D-A2-6) para
 * os blocos lidos do caixa (`BLOCOS_LIDOS_DO_CAIXA`); os demais seguem a matriz da competência.
 *
 * Combinação de recortes (D-A2-2): vale o mais restritivo — basta UM ✗ entre os ativos. Em
 * cartão + categoria (D-A2-24) isso também vale: o bloco que o cartão não segue (ex.: entradas)
 * continua "não segue", em vez de mostrar um R$ 0,00 que mentiria como zero medido.
 */
export function naoSegue(
  bloco: BlocoDoRelatorio,
  r: Recorte,
  base: BaseFinanceira,
): { tipo: TipoDeRecorte; motivo: string } | null {
  for (const tipo of recortesAtivos(r)) {
    if (base === "caixa" && BLOCOS_LIDOS_DO_CAIXA.has(bloco)) return { tipo, motivo: MOTIVO_DA_BASE_CAIXA };
    const celula = SEGUE_O_RECORTE[bloco][tipo];
    if (celula !== true) return { tipo, motivo: celula.motivo };
  }
  return null;
}
