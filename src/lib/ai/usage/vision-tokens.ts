/**
 * Fase 18-D — IA · Quanto um ARQUIVO custa de entrada, antes de mandá-lo.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ SEM ISTO, A RESERVA DA 18-A MENTE PARA BAIXO.                                         ║
 * ║                                                                                       ║
 * ║ `computeReservation` estima a entrada por CARACTERES do texto. Uma foto de nota tem   ║
 * ║ zero caractere e pode custar dezenas de milhares de tokens de entrada. Sem este        ║
 * ║ arquivo, o Processo 2 reservaria quase nada e o orçamento deixaria passar uma chamada ║
 * ║ que ele deveria barrar — silenciosamente, que é a pior forma.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════ AUSÊNCIA DE MEDIDA CAI NO TETO, NUNCA EM ZERO ═══════════════
 *
 * É a invariante 1 da Dieta aplicada ao custo. Imagem sem dimensão legível **não** vale 0
 * tokens: vale `LIMITE_MEGAPIXELS`, que é o maior arquivo que o envio aceita. PDF sem
 * contagem de páginas vale `LIMITE_PAGINAS_PDF`, pelo mesmo motivo.
 *
 * Repare que isso não é um chute: o teto do que ACEITAMOS é um número que nós controlamos, e
 * o arquivo já passou pela validação de tamanho antes de chegar aqui. "Não sei quanto" e "no
 * máximo tanto" são coisas diferentes, e a segunda basta para reservar.
 *
 * Puro. Nenhum I/O.
 */

import {
  LIMITE_MEGAPIXELS,
  LIMITE_PAGINAS_PDF,
  TOKENS_POR_MEGAPIXEL,
  TOKENS_POR_PAGINA_PDF,
} from "@/lib/ai/vision/limits";

/**
 * `null` significa NÃO MEDIDO — e é um estado, não um valor ausente que dá para tratar como
 * zero. Ver `vision/image-probe.ts`, que devolve `null` quando o cabeçalho não é legível.
 */
export type ArquivoParaEstimativa =
  | {
      readonly especie: "imagem";
      readonly larguraPx: number | null;
      readonly alturaPx: number | null;
    }
  | { readonly especie: "pdf"; readonly paginas: number | null };

export type EstimativaDeArquivo = {
  readonly tokens: number;
  /** `medido` = saiu do cabeçalho do arquivo. `teto` = o arquivo não disse, e usamos o limite. */
  readonly base: "medido" | "teto";
  /** pt-BR. A tela mostra COMO o número saiu, não só o número — padrão de `reservation.ts`. */
  readonly explicacao: string;
};

function megapixels(larguraPx: number, alturaPx: number): number {
  return (larguraPx * alturaPx) / 1_000_000;
}

export function estimarTokensDoArquivo(
  arquivo: ArquivoParaEstimativa,
): EstimativaDeArquivo {
  if (arquivo.especie === "pdf") {
    const medido =
      typeof arquivo.paginas === "number" &&
      Number.isFinite(arquivo.paginas) &&
      arquivo.paginas > 0;

    // `Math.min` com o limite não é redundante com a validação do envio: ela recusa o
    // arquivo, mas esta função também roda em cima de linha JÁ GRAVADA (reextração de um
    // documento antigo), e um limite que mudou desde então não pode virar reserva sem teto.
    const paginas = medido
      ? Math.min(arquivo.paginas as number, LIMITE_PAGINAS_PDF)
      : LIMITE_PAGINAS_PDF;

    return {
      tokens: paginas * TOKENS_POR_PAGINA_PDF,
      base: medido ? "medido" : "teto",
      explicacao: medido
        ? `${paginas} página(s) × ${TOKENS_POR_PAGINA_PDF} tokens (teto por página).`
        : `Número de páginas não identificado: reservado o teto de ${LIMITE_PAGINAS_PDF} páginas × ${TOKENS_POR_PAGINA_PDF} tokens.`,
    };
  }

  const medido =
    typeof arquivo.larguraPx === "number" &&
    typeof arquivo.alturaPx === "number" &&
    Number.isFinite(arquivo.larguraPx) &&
    Number.isFinite(arquivo.alturaPx) &&
    arquivo.larguraPx > 0 &&
    arquivo.alturaPx > 0;

  const mp = medido
    ? Math.min(
        megapixels(arquivo.larguraPx as number, arquivo.alturaPx as number),
        LIMITE_MEGAPIXELS,
      )
    : LIMITE_MEGAPIXELS;

  // Arredonda para CIMA: uma foto de 0,3 MP não pode reservar 600 tokens e custar mais.
  const tokens = Math.ceil(mp * TOKENS_POR_MEGAPIXEL);

  return {
    tokens,
    base: medido ? "medido" : "teto",
    explicacao: medido
      ? `${arquivo.larguraPx}×${arquivo.alturaPx} px (${mp.toFixed(1)} MP) × ${TOKENS_POR_MEGAPIXEL} tokens/MP.`
      : `Dimensões não identificadas: reservado o teto de ${LIMITE_MEGAPIXELS} MP × ${TOKENS_POR_MEGAPIXEL} tokens/MP.`,
  };
}

/**
 * A soma de vários arquivos da mesma chamada.
 *
 * `base` do conjunto é `teto` se QUALQUER arquivo caiu no teto — a qualidade viaja com o
 * número, como manda a regra 15 da Dieta. Um conjunto onde três foram medidos e um não é
 * um conjunto estimado, não um conjunto medido.
 */
export function estimarTokensDosArquivos(
  arquivos: readonly ArquivoParaEstimativa[],
): EstimativaDeArquivo {
  if (arquivos.length === 0) {
    return { tokens: 0, base: "medido", explicacao: "Nenhum arquivo nesta chamada." };
  }

  const estimativas = arquivos.map(estimarTokensDoArquivo);
  const tokens = estimativas.reduce((soma, e) => soma + e.tokens, 0);
  const algumNoTeto = estimativas.some((e) => e.base === "teto");

  return {
    tokens,
    base: algumNoTeto ? "teto" : "medido",
    explicacao:
      `${arquivos.length} arquivo(s), ${tokens} tokens de entrada estimados. ` +
      estimativas.map((e) => e.explicacao).join(" "),
  };
}
