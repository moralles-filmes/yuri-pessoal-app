/**
 * Ação em massa em "A Receber" — a regra, pura e testável.
 *
 * TRÊS DECISÕES MORAM AQUI, e em nenhum outro lugar:
 *
 * 1. QUE STATUS CADA AÇÃO ALCANÇA (`ORIGENS_DA_ACAO`). A tela usa para contar antes de
 *    confirmar; a Server Action usa para filtrar o UPDATE. Uma tabela só — se a tela e o
 *    servidor discordassem, o número mostrado ao usuário viraria promessa que o banco não
 *    cumpre.
 *
 * 2. AÇÃO EM MASSA NÃO SAI DO FILTRO (`alcanceDaAcao`). Selecionar 109 recebíveis, filtrar
 *    para 5 e clicar não pode dar baixa nos 109. A interseção com o que está VISÍVEL
 *    acontece aqui, e o que ficou de fora volta CONTADO — a tela declara o número antes de
 *    o usuário confirmar, em vez de recortar em silêncio.
 *
 * 3. O TAMANHO DO BLOCO (`dividirEmBlocos`). O PostgREST manda o filtro `id=in.(...)` na
 *    query string, que cresce linear com a seleção: 109 uuids já são ~4 KB. Em lote grande
 *    a requisição estoura no proxy antes de o banco ver qualquer coisa.
 */
import type { ReceivableStatus } from "./constants";

export const BULK_RECEIVABLE_ACTIONS = [
  "receber",
  "cobrado",
  "ignorar",
  "desfazer",
] as const;

export type BulkReceivableAction = (typeof BULK_RECEIVABLE_ACTIONS)[number];

/** Rótulo curto da ação, usado no botão da barra de seleção. */
export const BULK_ACTION_LABELS: Record<BulkReceivableAction, string> = {
  receber: "Receber",
  cobrado: "Cobrado",
  ignorar: "Ignorar",
  desfazer: "Desfazer",
};

/** Frase da confirmação, no plural do lote. */
export const BULK_ACTION_TITLES: Record<BulkReceivableAction, string> = {
  receber: "Marcar como recebidos",
  cobrado: "Marcar como cobrados",
  ignorar: "Ignorar recebíveis",
  desfazer: "Desfazer recebimento",
};

/**
 * De quais status cada ação parte. O destino NUNCA aparece na própria lista: marcar como
 * pago algo que já está pago não é sucesso, é um no-op — e contá-lo como afetado inflaria o
 * número que a tela mostra.
 */
export const ORIGENS_DA_ACAO: Record<BulkReceivableAction, ReceivableStatus[]> = {
  receber: ["pendente", "cobrado", "ignorado"],
  cobrado: ["pendente", "ignorado"],
  ignorar: ["pendente", "cobrado", "pago"],
  desfazer: ["pago"],
};

/** O mínimo que `alcanceDaAcao` precisa saber de um recebível. */
export type ReceivableSelecionavel = {
  id: string;
  status: ReceivableStatus;
  valor: number;
};

export type AlcanceDaAcao = {
  /** Ids que a ação vai realmente alterar, na ordem em que aparecem na tela. */
  ids: string[];
  /** Soma (em centavos) só do que será alterado. */
  valorTotal: number;
  /** Selecionados que sumiram da tela por causa do filtro atual. */
  foraDoFiltro: number;
  /** Visíveis e selecionados, mas cujo status esta ação não alcança. */
  naoAlcancados: number;
};

/**
 * Recorta a seleção pelo que está visível E pelo status que a ação alcança, numa passada só.
 *
 * Devolver os descartes contados (`foraDoFiltro`, `naoAlcancados`) é parte do contrato: é o
 * que permite à tela dizer "5 já estão pagos e não serão alterados" antes de agir.
 */
export function alcanceDaAcao(
  selecionados: Iterable<string>,
  visiveis: ReceivableSelecionavel[],
  acao: BulkReceivableAction,
): AlcanceDaAcao {
  const selecionadosSet = new Set(selecionados);
  const origens = new Set<ReceivableStatus>(ORIGENS_DA_ACAO[acao]);

  const ids: string[] = [];
  let valorTotal = 0;
  let naoAlcancados = 0;
  let visiveisSelecionados = 0;

  for (const item of visiveis) {
    if (!selecionadosSet.has(item.id)) continue;
    visiveisSelecionados += 1;
    if (!origens.has(item.status)) {
      naoAlcancados += 1;
      continue;
    }
    ids.push(item.id);
    valorTotal += item.valor;
  }

  return {
    ids,
    valorTotal,
    foraDoFiltro: selecionadosSet.size - visiveisSelecionados,
    naoAlcancados,
  };
}

/**
 * O patch que a ação grava. `pago_em` só sobrevive no `receber`: toda ação que tira o
 * recebível de "pago" limpa a data, senão a linha guardaria a data de um recebimento que
 * foi desfeito.
 */
export function patchDaAcao(
  acao: BulkReceivableAction,
  pagoEm: string,
): { status: ReceivableStatus; pago_em: string | null } {
  switch (acao) {
    case "receber":
      return { status: "pago", pago_em: pagoEm };
    case "cobrado":
      return { status: "cobrado", pago_em: null };
    case "ignorar":
      return { status: "ignorado", pago_em: null };
    case "desfazer":
      return { status: "pendente", pago_em: null };
  }
}

/** Tamanho de bloco do UPDATE em massa. Ver a nota 3 no topo do arquivo. */
export const TAMANHO_DO_BLOCO = 200;

export function dividirEmBlocos<T>(ids: T[], tamanho: number): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < ids.length; i += tamanho) {
    blocos.push(ids.slice(i, i + tamanho));
  }
  return blocos;
}
