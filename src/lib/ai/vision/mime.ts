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
 * ║ ✅ **RETROPORTADO EM 2026-08-09** (a tarefa avulsa registrada em §5 do spec da 18-D). ║
 * ║ As fotos de evolução (16-E) e a de receita (16-C) passaram a conferir os bytes por    ║
 * ║ `@/lib/files/photo-guard`, que compartilha o detector com este arquivo. O que NÃO é   ║
 * ║ compartilhado é a política: elas aceitam HEIC (só guardam o arquivo), e a IA o recusa ║
 * ║ (os provedores não o aceitam, e falhar depois da chamada paga seria pior).             ║
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

import { detectarFormato } from "@/lib/files/magic-bytes";
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

/**
 * ⚠️ **A DETECÇÃO MORA EM `@/lib/files/magic-bytes`, E ISTO AQUI É A POLÍTICA DA IA.**
 *
 * A separação nasceu do retroporte para as fotos de evolução (16-E) e de receita (16-C):
 * elas ACEITAM HEIC — só guardam o arquivo, nunca o mandam para lugar nenhum —, e a IA o
 * RECUSA, porque os provedores não o aceitam. Uma allowlist única faria uma das duas telas
 * errar; um segundo detector faria as duas divergirem no primeiro formato novo.
 *
 * O que este arquivo decide é só **o que a IA aceita**, e por quê.
 */
export function sniffMime(bytes: Uint8Array): ResultadoDoSniff {
  if (bytes.length === 0) {
    return {
      ok: false,
      motivo: "vazio",
      mensagem: "O arquivo está vazio.",
    };
  }

  const formato = detectarFormato(bytes);

  if (formato === "jpeg") return { ok: true, mime: "image/jpeg" };
  if (formato === "png") return { ok: true, mime: "image/png" };
  if (formato === "webp") return { ok: true, mime: "image/webp" };
  if (formato === "pdf") return { ok: true, mime: "application/pdf" };

  // HEIC é distinguido de "desconhecido" para a mensagem poder ser útil: ele vai ser o
  // motivo de recusa mais frequente do sistema, e "formato não aceito" mandaria o dono
  // adivinhar o que fazer.
  if (formato === "heic") {
    return {
      ok: false,
      motivo: "heic",
      mensagem:
        "Esta foto está em HEIC, o formato padrão do iPhone, que os provedores de IA não " +
        "aceitam. No iPhone, use Compartilhar → Opções → Mais Compatível, ou envie por " +
        "e-mail para si mesmo (o iOS converte para JPEG automaticamente).",
    };
  }

  return {
    ok: false,
    motivo: "desconhecido",
    mensagem:
      "Não foi possível identificar o tipo deste arquivo pelo conteúdo. Envie JPG, PNG, " +
      "WEBP ou PDF.",
  };
}
