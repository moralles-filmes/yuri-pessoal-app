/**
 * O que um arquivo É, decidido pelos BYTES — e não pelo que o cliente declarou.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ `File.type` É DECLARADO PELO CLIENTE, E O NAVEGADOR O DERIVA DA EXTENSÃO.          ║
 * ║                                                                                       ║
 * ║ Renomear `qualquercoisa.bin` para `foto.jpg` produz um `File` com                     ║
 * ║ `type: "image/jpeg"`. Três telas do sistema guardavam arquivo do usuário confiando     ║
 * ║ nesse campo: as fotos de evolução (16-E), a foto de receita (16-C) e — até a 18-D —    ║
 * ║ o envio de comprovantes.                                                               ║
 * ║                                                                                       ║
 * ║ A 18-D resolveu o problema dela com `sniffMime`. Este arquivo é o NÚCLEO daquele:      ║
 * ║ ele diz o que o arquivo é, e **quem chama decide o que aceita**. É a diferença que      ║
 * ║ importa — o HEIC é recusado pela IA (os provedores não o aceitam) e ACEITO nas fotos   ║
 * ║ de evolução, que só o guardam. Uma allowlist única faria uma das duas telas errar.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ ALLOWLIST, E ORDEM IMPORTA ═══════════════════════
 *
 * A pergunta é sempre "casa com uma assinatura conhecida?", nunca "não casa com nenhuma
 * proibida?". Arquivo que não casa com nada devolve `null` e é RECUSADO por quem chama —
 * nunca aceito como "provavelmente imagem". É a lição do `parseRefs` da 18-B.
 *
 * As assinaturas de imagem são conferidas ANTES do PDF, e o `%PDF-` é exigido no offset 0.
 * Isso mata o poliglota: um JPEG que carregue `%PDF-` no meio do corpo é detectado como
 * JPEG, e um PDF com lixo antes do cabeçalho é recusado.
 *
 * Puro. Nenhum I/O.
 */

/**
 * Os formatos que sabemos identificar. É a lista do que o DETECTOR conhece, não a de nada
 * que seja aceito — cada tela declara a sua.
 */
export const FORMATOS_CONHECIDOS = ["jpeg", "png", "webp", "heic", "pdf"] as const;

export type FormatoDetectado = (typeof FORMATOS_CONHECIDOS)[number];

/** Compara uma sequência de bytes numa posição. `-1` em `esperado` é curinga. */
function casa(bytes: Uint8Array, offset: number, esperado: readonly number[]): boolean {
  if (bytes.length < offset + esperado.length) return false;
  for (let i = 0; i < esperado.length; i += 1) {
    if (esperado[i] !== -1 && bytes[offset + i] !== esperado[i]) return false;
  }
  return true;
}

/** ASCII numa posição — os contêineres RIFF/ISO-BMFF são identificados por texto. */
function texto(bytes: Uint8Array, offset: number, esperado: string): boolean {
  return casa(
    bytes,
    offset,
    Array.from(esperado, (c) => c.charCodeAt(0)),
  );
}

const JPEG = [0xff, 0xd8, 0xff];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"

/**
 * As marcas HEIC/HEIF dentro do contêiner ISO-BMFF, logo depois de `ftyp` (offset 4).
 * `mif1`/`msf1` são as marcas genéricas que o iOS usa nas fotos mais recentes.
 */
const MARCAS_HEIC = ["heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"];

/**
 * `null` = **não sei o que é isto**. Não é "provavelmente texto", não é "deixa passar":
 * quem chama recusa. Errar para "recusei um arquivo legítimo" é aceitável; errar para
 * "guardei um arquivo que não sei o que é" não.
 */
export function detectarFormato(bytes: Uint8Array): FormatoDetectado | null {
  if (bytes.length === 0) return null;

  if (casa(bytes, 0, JPEG)) return "jpeg";
  if (casa(bytes, 0, PNG)) return "png";
  // WEBP é um contêiner RIFF: "RIFF" no 0, tamanho nos 4..7, "WEBP" no 8.
  if (texto(bytes, 0, "RIFF") && texto(bytes, 8, "WEBP")) return "webp";

  if (texto(bytes, 4, "ftyp")) {
    const marca = Array.from(bytes.slice(8, 12), (b) => String.fromCharCode(b)).join("");
    if (MARCAS_HEIC.includes(marca)) return "heic";
  }

  // ⛔ Offset 0 EXIGIDO. Ver o bloco sobre poliglota no topo.
  if (casa(bytes, 0, PDF)) return "pdf";

  return null;
}

/**
 * O MIME canônico de cada formato.
 *
 * ⚠️ `image/jpg` **não existe** como MIME — o registro oficial é `image/jpeg`. E o HEIC
 * canônico é `image/heic`: `image/heif` é um tipo relacionado que o navegador às vezes
 * declara, e que este detector não distingue (as marcas ISO-BMFF se sobrepõem). Devolver
 * sempre a forma canônica é o que impede duas grafias criarem um caminho que nunca casa.
 */
export const MIME_DO_FORMATO: Record<FormatoDetectado, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  heic: "image/heic",
  pdf: "application/pdf",
};

/**
 * Quantos bytes bastam para decidir. As assinaturas mais longas que usamos terminam no
 * offset 12 (a marca HEIC), então 64 é folga generosa — e é o que permite conferir um
 * arquivo de 8 MB lendo só o começo dele.
 */
export const BYTES_PARA_DETECTAR = 64;
