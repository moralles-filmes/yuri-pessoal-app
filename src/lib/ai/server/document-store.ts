import "server-only";

/**
 * Fase 18-D — IA · O ÚNICO lugar onde os bytes de um arquivo do dono existem.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A DISCIPLINA DA 16-E, INTEIRA, MAIS UMA TRAVA.                                        ║
 * ║                                                                                       ║
 * ║  1. bucket PRIVADO, reusado da Fase 14                                                ║
 * ║  2. nome ALEATÓRIO — nada do que o cliente mandou entra no caminho                    ║
 * ║  3. pasta `{user_id}/…`                                                                ║
 * ║  4. URL assinada de 5 min, GERADA A CADA LEITURA                                       ║
 * ║  5. tamanho validado no SERVIDOR sobre o arquivo real                                  ║
 * ║  6. FK composta `(attachment_id, user_id)`                                             ║
 * ║  7. `storage_path` NÃO SAI DAQUI                                                       ║
 * ║  ⭑ 8. **o MIME é decidido pelos BYTES** (`sniffMime`), não por `File.type`             ║
 * ║                                                                                       ║
 * ║ A oitava é nova. `photoFileSchema` (16-E) confere `file.type`, que o navegador deriva ║
 * ║ da EXTENSÃO — e é por isso que o critério "MIME falsificado" não passava antes.        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ **`server-only`.** Se um componente client alcançar este arquivo, o build quebra — que
 * é exatamente o que deve acontecer, porque aqui trafegam bytes de documento pessoal.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { sniffMime, type MotivoDeRecusa } from "@/lib/ai/vision/mime";
import { dimensoesDaImagem, paginasDoPdf } from "@/lib/ai/vision/probe";
import {
  especieDoMime,
  isMimeAceito,
  limiteDeBytes,
  LIMITE_MEGAPIXELS,
  type MimeAceito,
} from "@/lib/ai/vision/limits";
import {
  DOCUMENT_BUCKET,
  DOCUMENT_ENTITY_TYPE,
  DOCUMENT_SIGNED_URL_TTL_SECONDS,
  EXTENSAO_POR_MIME,
} from "@/lib/ai/vision/constants";

type Client = SupabaseClient<Database>;

export type FalhaDoEnvio = {
  readonly motivo: MotivoDeRecusa | "grande_demais" | "resolucao_demais" | "storage" | "banco";
  readonly mensagem: string;
};

export type DocumentoGuardado = {
  readonly id: string;
  readonly attachmentId: string;
  readonly mime: MimeAceito;
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly larguraPx: number | null;
  readonly alturaPx: number | null;
  readonly paginas: number | null;
};

/** SHA-256 do conteúdo REAL, em hex. Web Crypto — sem dependência nova. */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Valida e guarda. **Nada sai do sistema aqui** — este é o Processo 1 do desenho, e ele
 * termina sem nenhuma chamada externa.
 *
 * A ordem das checagens é deliberada: **o tipo antes do tamanho**. Um HEIC de 30 MB tem de
 * ouvir "o iPhone salva em HEIC, exporte como JPEG", não "arquivo grande demais" — a
 * segunda mensagem mandaria o dono comprimir uma foto que ia ser recusada de qualquer jeito.
 */
export async function guardarDocumento(entrada: {
  readonly supabase: Client;
  readonly userId: string;
  readonly bytes: Uint8Array;
  readonly nomeOriginal: string;
  readonly observacao: string | null;
}): Promise<{ ok: true; documento: DocumentoGuardado } | { ok: false; falha: FalhaDoEnvio }> {
  const { supabase, userId, bytes } = entrada;

  // ── 1. O QUE É, pelos bytes ──────────────────────────────────────────────────────
  const sniff = sniffMime(bytes);
  if (!sniff.ok) {
    return { ok: false, falha: { motivo: sniff.motivo, mensagem: sniff.mensagem } };
  }
  const mime = sniff.mime;
  // Redundante com `sniffMime`, que só devolve MIME aceito — e mantido de propósito: é a
  // asserção que quebra em teste se alguém acrescentar um formato lá sem decidir aqui.
  if (!isMimeAceito(mime)) {
    return {
      ok: false,
      falha: { motivo: "desconhecido", mensagem: "Formato não aceito." },
    };
  }

  const especie = especieDoMime(mime);

  // ── 2. TAMANHO, sobre o arquivo real ─────────────────────────────────────────────
  const limite = limiteDeBytes(especie);
  if (bytes.byteLength > limite) {
    const mb = Math.round(limite / (1024 * 1024));
    return {
      ok: false,
      falha: {
        motivo: "grande_demais",
        mensagem: `O arquivo tem ${(bytes.byteLength / (1024 * 1024)).toFixed(1)} MB e o limite é ${mb} MB.`,
      },
    };
  }

  // ── 3. DIMENSÕES / PÁGINAS — para a estimativa de custo ──────────────────────────
  const dimensoes = especie === "imagem" ? dimensoesDaImagem(bytes) : null;
  const paginas = especie === "pdf" ? paginasDoPdf(bytes) : null;

  // Sem biblioteca de imagem não dá para reduzir; então imagem grande demais é RECUSADA,
  // com o número na mensagem. Dimensão NÃO LIDA passa — ela cai no teto da reserva, e
  // recusar por não conseguir medir seria punir o dono por um limite nosso.
  if (dimensoes) {
    const mp = (dimensoes.larguraPx * dimensoes.alturaPx) / 1_000_000;
    if (mp > LIMITE_MEGAPIXELS) {
      return {
        ok: false,
        falha: {
          motivo: "resolucao_demais",
          mensagem:
            `A imagem tem ${mp.toFixed(1)} megapixels (${dimensoes.larguraPx}×${dimensoes.alturaPx}) ` +
            `e o limite é ${LIMITE_MEGAPIXELS}. Reduza a resolução antes de enviar.`,
        },
      };
    }
  }

  const sha256 = await sha256Hex(bytes);

  // ── 4. CAMINHO — aleatório, dentro da pasta do próprio dono ──────────────────────
  // Nada do que o cliente mandou (nem o nome original) entra na composição.
  const documentoId = crypto.randomUUID();
  const storagePath =
    `${userId}/${DOCUMENT_ENTITY_TYPE}/${documentoId}/${crypto.randomUUID()}.${EXTENSAO_POR_MIME[mime]}`;

  const { error: erroUpload } = await supabase.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, bytes as unknown as ArrayBuffer, {
      contentType: mime,
      upsert: false,
      // Mesmo com URL assinada, nenhum intermediário deve guardar o documento.
      cacheControl: "private, max-age=0, no-store",
    });
  if (erroUpload) {
    return {
      ok: false,
      falha: { motivo: "storage", mensagem: "Não foi possível enviar o arquivo." },
    };
  }

  // ── 5. METADADO ──────────────────────────────────────────────────────────────────
  const { data: anexo, error: erroAnexo } = await supabase
    .from("attachments")
    .insert({
      user_id: userId,
      entity_type: DOCUMENT_ENTITY_TYPE,
      entity_id: documentoId,
      bucket_id: DOCUMENT_BUCKET,
      storage_path: storagePath,
      file_name: entrada.nomeOriginal.slice(0, 200),
      // O MIME que vai para o banco é o DETECTADO, nunca o declarado.
      mime_type: mime,
      size_bytes: bytes.byteLength,
    })
    .select("id")
    .single();

  if (erroAnexo || !anexo) {
    // Sem metadado, o arquivo não fica no bucket. Mesma ordem da 16-E.
    await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    return {
      ok: false,
      falha: { motivo: "banco", mensagem: "Não foi possível registrar o arquivo." },
    };
  }

  const { data: documento, error: erroDocumento } = await supabase
    .from("ai_documents")
    .insert({
      id: documentoId,
      user_id: userId,
      attachment_id: anexo.id,
      mime_detectado: mime,
      content_sha256: sha256,
      size_bytes: bytes.byteLength,
      largura_px: dimensoes?.larguraPx ?? null,
      altura_px: dimensoes?.alturaPx ?? null,
      paginas,
      observacao: entrada.observacao,
    })
    .select("id")
    .single();

  if (erroDocumento || !documento) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath]);
    await supabase.from("attachments").delete().eq("id", anexo.id);
    return {
      ok: false,
      falha: { motivo: "banco", mensagem: "Não foi possível registrar o envio." },
    };
  }

  return {
    ok: true,
    documento: {
      id: documento.id,
      attachmentId: anexo.id,
      mime,
      sha256,
      sizeBytes: bytes.byteLength,
      larguraPx: dimensoes?.larguraPx ?? null,
      alturaPx: dimensoes?.alturaPx ?? null,
      paginas,
    },
  };
}

/**
 * Os bytes de volta, para o Processo 2 mandá-los ao provedor.
 *
 * ⛔ **`storage_path` entra e morre nesta função.** Quem chama recebe bytes e MIME — nunca o
 * caminho. É o mesmo motivo pelo qual `AiContentPart` não tem campo de URL: o que não é
 * representável não vaza.
 *
 * A RLS de `ai_documents` e a policy de `storage.objects` por pasta `{user_id}/…` são as
 * duas barreiras; o `.eq("user_id", …)` explícito é a terceira, e é de graça.
 */
export async function lerBytesDoDocumento(
  supabase: Client,
  userId: string,
  documentoId: string,
): Promise<{ bytes: Uint8Array; mime: MimeAceito } | null> {
  const { data: documento } = await supabase
    .from("ai_documents")
    .select("id, attachment_id, mime_detectado")
    .eq("id", documentoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!documento) return null;

  const { data: anexo } = await supabase
    .from("attachments")
    .select("storage_path, bucket_id")
    .eq("id", documento.attachment_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!anexo) return null;

  const { data: arquivo, error } = await supabase.storage
    .from(anexo.bucket_id)
    .download(anexo.storage_path);
  if (error || !arquivo) return null;

  const bytes = new Uint8Array(await arquivo.arrayBuffer());

  // ⚠️ RECONFERE o MIME sobre os bytes que voltaram do bucket, em vez de confiar na coluna.
  // Custa nada e fecha a janela em que uma linha adulterada faria o servidor anunciar ao
  // provedor um tipo que o conteúdo não tem.
  const sniff = sniffMime(bytes);
  if (!sniff.ok || sniff.mime !== documento.mime_detectado) return null;

  return { bytes, mime: sniff.mime };
}

/**
 * A URL assinada, gerada AGORA e válida por 5 minutos. Nunca guardada, nunca reaproveitada.
 * É o que a tela usa para mostrar o comprovante ao lado dos campos extraídos.
 */
export async function urlAssinadaDoDocumento(
  supabase: Client,
  userId: string,
  attachmentId: string,
): Promise<string | null> {
  const { data: anexo } = await supabase
    .from("attachments")
    .select("storage_path, bucket_id")
    .eq("id", attachmentId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!anexo) return null;

  const { data } = await supabase.storage
    .from(anexo.bucket_id)
    .createSignedUrl(anexo.storage_path, DOCUMENT_SIGNED_URL_TTL_SECONDS);

  return data?.signedUrl ?? null;
}

/**
 * Descarta: o ARQUIVO primeiro, depois o metadado.
 *
 * Nessa ordem pelo mesmo motivo da 16-E: um comprovante que sobrevive ao registro é dado
 * sensível esquecido no bucket; uma linha órfã é só uma linha inútil. `ai_documents` é
 * `on delete cascade` a partir de `attachments`, então apagar o anexo leva o resto junto.
 */
export async function descartarDocumento(
  supabase: Client,
  userId: string,
  documentoId: string,
): Promise<boolean> {
  const { data: documento } = await supabase
    .from("ai_documents")
    .select("attachment_id")
    .eq("id", documentoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!documento) return false;

  const { data: anexo } = await supabase
    .from("attachments")
    .select("storage_path, bucket_id, entity_type")
    .eq("id", documento.attachment_id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!anexo) return false;

  // ⛔ Comprovante que JÁ virou anexo de uma transação não é descartável por aqui: quem o
  // apaga é o Financeiro, junto com o lançamento. Descartá-lo aqui deixaria a transação
  // apontando para um arquivo que não existe mais.
  if (anexo.entity_type !== DOCUMENT_ENTITY_TYPE) return false;

  try {
    await supabase.storage.from(anexo.bucket_id).remove([anexo.storage_path]);
  } catch {
    // Segue apagando o metadado: registro apontando para arquivo inexistente é o resultado
    // menos ruim se o Storage falhar.
  }

  const { error } = await supabase
    .from("attachments")
    .delete()
    .eq("id", documento.attachment_id)
    .eq("user_id", userId);

  return !error;
}
