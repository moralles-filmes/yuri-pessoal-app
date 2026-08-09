/**
 * Fase 18-D — IA · O que o arquivo É, decidido pelos BYTES.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ISTO EXISTE PORQUE `File.type` É DECLARADO PELO CLIENTE.                              ║
 * ║                                                                                       ║
 * ║ `photoFileSchema` (16-E, `validators/body.ts`) confere `MIME_LIST.includes(file.type)`║
 * ║ — e `file.type` vem do navegador, derivado da EXTENSÃO. Renomear `virus.exe` para     ║
 * ║ `nota.jpg` produz um `File` com `type: "image/jpeg"` que passa naquela checagem.       ║
 * ║                                                                                       ║
 * ║ O critério de aceite "MIME falsificado (extensão que mente)" só passa lendo os bytes. ║
 * ║                                                                                       ║
 * ║ ⚠️ AS FOTOS DE EVOLUÇÃO E A DE RECEITA CONTINUAM NO CAMINHO ANTIGO. Retroportar é     ║
 * ║ tarefa avulsa, registrada em §5 do spec da 18-D — não foi esquecimento.                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ ALLOWLIST, E ORDEM IMPORTA ═══════════════════════
 *
 * A pergunta é sempre "casa com uma assinatura conhecida?", nunca "não casa com nenhuma
 * proibida?". Arquivo que não casa com nada é RECUSADO — não é aceito como "provavelmente
 * texto". É a lição do `parseRefs` da 18-B.
 *
 * As assinaturas de imagem são conferidas ANTES do PDF, e o `%PDF-` é exigido no offset 0.
 * Isso mata o poliglota: um JPEG que carregue `%PDF-` no meio do corpo é detectado como
 * JPEG, e um PDF com lixo antes do cabeçalho é recusado — errar para "recusei um arquivo
 * legítimo" é aceitável; errar para "aceitei um arquivo que não sei o que é" não.
 *
 * Puro. Nenhum I/O.
 */

import { type MimeAceito } from "./limits";

/**
 * `heic` é distinguido de `desconhecido` de propósito: o iPhone fotografa em HEIC por
 * padrão, então este vai ser o motivo de recusa mais frequente do sistema. "Formato não
 * aceito" mandaria o dono adivinhar; a mensagem específica diz o que fazer.
 */
export type MotivoDeRecusa = "heic" | "vazio" | "desconhecido";

export type ResultadoDoSniff =
  | { readonly ok: true; readonly mime: MimeAceito }
  | { readonly ok: false; readonly motivo: MotivoDeRecusa; readonly mensagem: string };

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

export function sniffMime(bytes: Uint8Array): ResultadoDoSniff {
  if (bytes.length === 0) {
    return {
      ok: false,
      motivo: "vazio",
      mensagem: "O arquivo está vazio.",
    };
  }

  if (casa(bytes, 0, JPEG)) return { ok: true, mime: "image/jpeg" };
  if (casa(bytes, 0, PNG)) return { ok: true, mime: "image/png" };
  // WEBP é um contêiner RIFF: "RIFF" no 0, tamanho nos 4..7, "WEBP" no 8.
  if (texto(bytes, 0, "RIFF") && texto(bytes, 8, "WEBP")) {
    return { ok: true, mime: "image/webp" };
  }

  // HEIC antes de "desconhecido", para a mensagem poder ser útil.
  if (texto(bytes, 4, "ftyp")) {
    const marca = Array.from(bytes.slice(8, 12), (b) => String.fromCharCode(b)).join("");
    if (MARCAS_HEIC.includes(marca)) {
      return {
        ok: false,
        motivo: "heic",
        mensagem:
          "Esta foto está em HEIC, o formato padrão do iPhone, que os provedores de IA não " +
          "aceitam. No iPhone, use Compartilhar → Opções → Mais Compatível, ou envie por " +
          "e-mail para si mesmo (o iOS converte para JPEG automaticamente).",
      };
    }
  }

  // ⛔ Offset 0 EXIGIDO. Ver o bloco sobre poliglota no topo.
  if (casa(bytes, 0, PDF)) return { ok: true, mime: "application/pdf" };

  return {
    ok: false,
    motivo: "desconhecido",
    mensagem:
      "Não foi possível identificar o tipo deste arquivo pelo conteúdo. Envie JPG, PNG, " +
      "WEBP ou PDF.",
  };
}
