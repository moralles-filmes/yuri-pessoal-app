/**
 * Fase 18-D — IA · O TAMANHO do conteúdo, lido do cabeçalho.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ PARA QUE ISTO SERVE: a RESERVA de orçamento.                                          ║
 * ║                                                                                       ║
 * ║ `usage/vision-tokens.ts` cobra por megapixel e por página. Sem medida, ele cai no      ║
 * ║ TETO — 24 MP e 20 páginas —, que é seguro mas caro: uma foto de 2 MP reservaria 12×   ║
 * ║ o que vai custar, e o dono veria o orçamento encher sem motivo.                        ║
 * ║                                                                                       ║
 * ║ ⚠️ ENTÃO ESTE ARQUIVO É UMA OTIMIZAÇÃO, NÃO UMA GARANTIA. Devolver `null` é sempre    ║
 * ║ uma resposta CORRETA — o custo é reservar demais, nunca reservar de menos. É por isso  ║
 * ║ que ele pode ser best-effort sem que isso vire um risco.                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro. Nenhum I/O. Nenhuma dependência — decodificar cabeçalho é aritmética de bytes.
 */

export type Dimensoes = { readonly larguraPx: number; readonly alturaPx: number };

function u16be(b: Uint8Array, i: number): number {
  return (b[i] << 8) | b[i + 1];
}

function u32be(b: Uint8Array, i: number): number {
  // `>>> 0` porque um PNG com bit alto ligado viraria negativo em int32 com sinal.
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
}

function u24le(b: Uint8Array, i: number): number {
  return b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
}

function ascii(b: Uint8Array, i: number, texto: string): boolean {
  if (b.length < i + texto.length) return false;
  for (let k = 0; k < texto.length; k += 1) {
    if (b[i + k] !== texto.charCodeAt(k)) return false;
  }
  return true;
}

/** PNG: IHDR é sempre o primeiro chunk, em posição fixa. Largura em 16, altura em 20. */
function dimensoesPng(b: Uint8Array): Dimensoes | null {
  if (b.length < 24 || !ascii(b, 12, "IHDR")) return null;
  const larguraPx = u32be(b, 16);
  const alturaPx = u32be(b, 20);
  return larguraPx > 0 && alturaPx > 0 ? { larguraPx, alturaPx } : null;
}

/**
 * JPEG: é preciso ANDAR pelos segmentos até achar um SOF (Start Of Frame), porque o tamanho
 * não tem posição fixa — vem depois de metadados (EXIF, ICC) de comprimento variável.
 *
 * SOF é `FF C0`..`FF CF`, exceto `C4` (tabela de Huffman), `C8` (extensão JPEG) e `CC`
 * (codificação aritmética) — esses três compartilham a faixa e não carregam dimensão.
 */
function dimensoesJpeg(b: Uint8Array): Dimensoes | null {
  let i = 2; // pula o SOI (FF D8)
  // `i + 8` porque a leitura mais distante do SOF é `u16be(b, i + 7)`, que toca `i + 8`.
  // Com `i + 9` (a versão anterior) um SOF que fosse o ÚLTIMO segmento do arquivo era
  // ignorado — e o teste do DHT, que monta exatamente esse arquivo, pegou.
  while (i + 8 < b.length) {
    if (b[i] !== 0xff) {
      i += 1; // byte de preenchimento entre segmentos; anda até reencontrar o marcador
      continue;
    }
    const marcador = b[i + 1];
    if (marcador === 0xff) {
      i += 1;
      continue;
    }
    const ehSof =
      marcador >= 0xc0 &&
      marcador <= 0xcf &&
      marcador !== 0xc4 &&
      marcador !== 0xc8 &&
      marcador !== 0xcc;

    if (ehSof) {
      // [FF][Cx][tamanho:2][precisão:1][altura:2][largura:2]
      const alturaPx = u16be(b, i + 5);
      const larguraPx = u16be(b, i + 7);
      return larguraPx > 0 && alturaPx > 0 ? { larguraPx, alturaPx } : null;
    }

    // `SOS` (DA) marca o início dos dados comprimidos: daqui para a frente não há mais
    // cabeçalho para ler, e continuar andando seria interpretar pixels como marcadores.
    if (marcador === 0xda) return null;

    const tamanho = u16be(b, i + 2);
    if (tamanho < 2) return null; // segmento corrompido: parar em vez de girar em falso
    i += 2 + tamanho;
  }
  return null;
}

/** WEBP tem três formatos internos, e cada um guarda o tamanho de um jeito. */
function dimensoesWebp(b: Uint8Array): Dimensoes | null {
  if (b.length < 30) return null;

  // VP8X (estendido): o tamanho da TELA, em 24 bits little-endian, menos 1.
  if (ascii(b, 12, "VP8X")) {
    const larguraPx = u24le(b, 24) + 1;
    const alturaPx = u24le(b, 27) + 1;
    return { larguraPx, alturaPx };
  }

  // VP8 (com perdas): depois do frame tag (3 bytes) vem o sync code 9D 01 2A.
  if (ascii(b, 12, "VP8 ")) {
    if (!(b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a)) return null;
    const larguraPx = (b[26] | (b[27] << 8)) & 0x3fff;
    const alturaPx = (b[28] | (b[29] << 8)) & 0x3fff;
    return larguraPx > 0 && alturaPx > 0 ? { larguraPx, alturaPx } : null;
  }

  // VP8L (sem perdas): 14 bits de largura-1 e 14 de altura-1, empacotados little-endian.
  if (ascii(b, 12, "VP8L")) {
    if (b[20] !== 0x2f) return null;
    const bits = (b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24)) >>> 0;
    const larguraPx = (bits & 0x3fff) + 1;
    const alturaPx = ((bits >>> 14) & 0x3fff) + 1;
    return { larguraPx, alturaPx };
  }

  return null;
}

/**
 * As dimensões, ou `null` quando o cabeçalho não permite dizer.
 *
 * ⛔ `null` NÃO é "imagem de tamanho zero". Quem consome é `estimarTokensDoArquivo`, que
 * trata `null` como "reserve o teto".
 */
export function dimensoesDaImagem(bytes: Uint8Array): Dimensoes | null {
  if (ascii(bytes, 0, "\x89PNG")) return dimensoesPng(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return dimensoesJpeg(bytes);
  if (ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP")) return dimensoesWebp(bytes);
  return null;
}

/**
 * A contagem de páginas de um PDF — **best-effort declarado**.
 *
 * ═══════════════════════ POR QUE HEURÍSTICA, E POR QUE TUDO BEM ═══════════════════════
 *
 * Contar páginas direito exige percorrer a árvore de objetos do PDF, seguir referências
 * indiretas e descomprimir *object streams*. Isso é um parser de PDF — uma dependência nova
 * e uma superfície de ataque nova (parsers de PDF são fonte histórica de CVE), para um
 * número que só serve para ESTIMAR CUSTO.
 *
 * A heurística abaixo conta as ocorrências de `/Type /Page` que não são `/Pages`. Ela acerta
 * em PDF não comprimido (que é a maioria dos comprovantes e notas fiscais eletrônicas) e
 * devolve `null` quando o arquivo usa *object streams* — e `null` só significa reservar o
 * teto de 20 páginas.
 *
 * ⛔ Ela NÃO é uma trava de segurança e não deve virar uma. O que impede um PDF gigante de
 * entrar é o limite de BYTES, que é medido sobre o arquivo real.
 */
export function paginasDoPdf(bytes: Uint8Array): number | null {
  // `latin1` porque a estrutura do PDF é ASCII; decodificar como UTF-8 corromperia os
  // bytes binários dos streams e poderia inventar ou destruir casamentos.
  const texto = new TextDecoder("latin1").decode(bytes);

  // `/Type` + espaços + `/Page` NÃO seguido de letra (senão `/Pages` casaria).
  const ocorrencias = texto.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  const total = ocorrencias?.length ?? 0;

  return total > 0 ? total : null;
}
