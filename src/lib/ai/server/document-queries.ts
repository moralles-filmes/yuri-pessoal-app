import "server-only";

/**
 * Fase 18-D · Bloco 5 — IA · O que a tela de comprovantes lê.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ `storage_path` NÃO SAI DAQUI, E A URL ASSINADA É GERADA A CADA LEITURA.            ║
 * ║                                                                                       ║
 * ║ Mesma disciplina das fotos de evolução (16-E, invariante 21/22): bucket privado, 5    ║
 * ║ minutos, nunca guardada, nunca reaproveitada. A lista NÃO gera URL nenhuma — só o     ║
 * ║ detalhe gera, e só para o documento aberto: assinar dez URLs para desenhar uma lista  ║
 * ║ multiplicaria por dez a superfície de um link que dá acesso ao arquivo.                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ Este arquivo NÃO importa `@/lib/finance/*`. A candidata a lançamento parecido (o "trio"
 * de `vision/duplicates.ts`) é lida pelo Financeiro e composta FORA de `src/lib/ai/` — o
 * teste de fronteira só abre duas portas para query de módulo, e nenhuma delas é esta.
 */

import { createClient } from "@/lib/supabase/server";
import { DOCUMENT_ENTITY_TYPE } from "@/lib/ai/vision/constants";
import { isMimeAceito, type MimeAceito } from "@/lib/ai/vision/limits";
import { lerExtracaoGravada } from "@/lib/ai/vision/schema";
import type { ExtracaoDeComprovante } from "@/lib/ai/vision/contracts";
import type { EnvioAnterior } from "@/lib/ai/vision/duplicates";
import { dateInSaoPaulo } from "@/lib/format";
import { urlAssinadaDoDocumento } from "./document-store";

/**
 * Teto da lista. Torná-lo VISÍVEL é a invariante 29 da 18-C aplicada a esta tela: um corte
 * silencioso faz a tela dizer "estes são todos" quando não são. Peço `TETO + 1` e a linha
 * extra só prova saturação — ela nunca é desenhada.
 */
export const TETO_DE_COMPROVANTES = 60;

/** A leitura mais recente de um documento, do jeito que a tela precisa dela. */
export type LeituraDoComprovante = {
  readonly id: string;
  readonly status: "extraida" | "falhou";
  /** `null` quando `status = 'falhou'` — não houve leitura, e `{}` não é uma leitura vazia. */
  readonly extracao: ExtracaoDeComprovante | null;
  readonly erroMensagem: string | null;
  readonly revisadaEm: string | null;
  readonly criadaEm: string;
};

export type ComprovanteNaLista = {
  readonly id: string;
  readonly attachmentId: string;
  readonly nomeArquivo: string;
  readonly mime: MimeAceito;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly observacao: string | null;
  /** Data pura 'yyyy-MM-dd' em Brasília — nunca `.slice(0,10)` de um timestamptz. */
  readonly enviadoEm: string;
  readonly enviadoEmISO: string;
  /**
   * `true` quando o anexo deixou de ser `ia_documento` — isto é, quando o comprovante virou
   * anexo de um lançamento. É essa troca que responde "já virou alguma coisa?", e não uma
   * coluna de status que diria o mesmo em segundo lugar (e divergiria).
   */
  readonly virouLancamento: boolean;
  readonly leitura: LeituraDoComprovante | null;
};

export type ListaDeComprovantes = {
  readonly itens: readonly ComprovanteNaLista[];
  readonly teto: number;
  readonly saturado: boolean;
};

type LinhaDeExtracao = {
  id: string;
  document_id: string;
  status: string;
  campos: unknown;
  erro_mensagem: string | null;
  revisada_em: string | null;
  created_at: string;
};

function paraLeitura(linha: LinhaDeExtracao): LeituraDoComprovante | null {
  if (linha.status !== "extraida" && linha.status !== "falhou") return null;
  return {
    id: linha.id,
    status: linha.status,
    // ⛔ `lerExtracaoGravada` VALIDA. A coluna é `jsonb` e aceita qualquer forma; um `as`
    // aqui faria o TypeScript acreditar numa linha gravada por outra versão do schema.
    extracao: linha.status === "extraida" ? lerExtracaoGravada(linha.campos) : null,
    erroMensagem: linha.erro_mensagem,
    revisadaEm: linha.revisada_em,
    criadaEm: linha.created_at,
  };
}

/**
 * A lista. Duas consultas de propósito: a FK composta `(attachment_id, user_id)` impede o
 * embed do PostgREST — a mesma consequência que a 16-E documentou nas fotos de evolução.
 */
export async function getComprovantes(userId: string): Promise<ListaDeComprovantes> {
  const supabase = await createClient();

  const { data: documentos } = await supabase
    .from("ai_documents")
    .select(
      "id, attachment_id, mime_detectado, content_sha256, size_bytes, observacao, created_at",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(TETO_DE_COMPROVANTES + 1);

  const linhas = documentos ?? [];
  const saturado = linhas.length > TETO_DE_COMPROVANTES;
  const visiveis = linhas.slice(0, TETO_DE_COMPROVANTES);

  if (visiveis.length === 0) {
    return { itens: [], teto: TETO_DE_COMPROVANTES, saturado: false };
  }

  const ids = visiveis.map((d) => d.id);
  const anexoIds = visiveis.map((d) => d.attachment_id);

  const [{ data: anexos }, { data: extracoes }] = await Promise.all([
    supabase
      .from("attachments")
      .select("id, file_name, entity_type")
      .eq("user_id", userId)
      .in("id", anexoIds),
    supabase
      .from("ai_document_extractions")
      .select("id, document_id, status, campos, erro_mensagem, revisada_em, created_at")
      .eq("user_id", userId)
      .in("document_id", ids)
      .order("created_at", { ascending: false }),
  ]);

  const anexoPorId = new Map((anexos ?? []).map((a) => [a.id, a]));

  // A leitura MAIS RECENTE de cada documento. Extrair de novo é legítimo (o dono pode ter
  // trocado de modelo), e mostrar a primeira tentativa seria mostrar a desatualizada.
  const leituraPorDocumento = new Map<string, LeituraDoComprovante>();
  for (const e of extracoes ?? []) {
    if (leituraPorDocumento.has(e.document_id)) continue;
    const leitura = paraLeitura(e as LinhaDeExtracao);
    if (leitura) leituraPorDocumento.set(e.document_id, leitura);
  }

  const itens: ComprovanteNaLista[] = [];
  for (const d of visiveis) {
    const anexo = anexoPorId.get(d.attachment_id);
    if (!anexo) continue;
    if (!isMimeAceito(d.mime_detectado)) continue;

    itens.push({
      id: d.id,
      attachmentId: d.attachment_id,
      nomeArquivo: anexo.file_name ?? "comprovante",
      mime: d.mime_detectado,
      sizeBytes: d.size_bytes,
      sha256: d.content_sha256,
      observacao: d.observacao,
      enviadoEm: dateInSaoPaulo(new Date(d.created_at)),
      enviadoEmISO: d.created_at,
      virouLancamento: anexo.entity_type !== DOCUMENT_ENTITY_TYPE,
      leitura: leituraPorDocumento.get(d.id) ?? null,
    });
  }

  return { itens, teto: TETO_DE_COMPROVANTES, saturado };
}

export type ComprovanteEmDetalhe = {
  readonly documento: ComprovanteNaLista;
  /** Gerada AGORA, válida por 5 minutos. Nunca guardada. */
  readonly urlAssinada: string | null;
  /** Outros envios com o MESMO conteúdo, byte a byte. Certeza, não heurística. */
  readonly enviosAnteriores: readonly EnvioAnterior[];
};

export async function getComprovante(
  userId: string,
  documentoId: string,
): Promise<ComprovanteEmDetalhe | null> {
  const supabase = await createClient();

  const lista = await getComprovantes(userId);
  const documento = lista.itens.find((d) => d.id === documentoId);
  if (!documento) return null;

  /**
   * Os OUTROS envios com o mesmo `content_sha256`.
   *
   * ⚠️ O índice é COMUM, não único — reenviar um arquivo depois de descartá-lo é legítimo, e
   * uma restrição de unicidade aqui recusaria isso. O que se faz com a coincidência é
   * sinalizar (`vision/duplicates.ts`), nunca bloquear.
   */
  const { data: mesmoConteudo } = await supabase
    .from("ai_documents")
    .select("id, attachment_id, created_at")
    .eq("user_id", userId)
    .eq("content_sha256", documento.sha256)
    .neq("id", documentoId)
    .order("created_at", { ascending: false })
    .limit(10);

  const outros = mesmoConteudo ?? [];
  let enviosAnteriores: EnvioAnterior[] = [];

  if (outros.length > 0) {
    const { data: anexos } = await supabase
      .from("attachments")
      .select("id, entity_type")
      .eq("user_id", userId)
      .in(
        "id",
        outros.map((o) => o.attachment_id),
      );
    const tipoPorAnexo = new Map((anexos ?? []).map((a) => [a.id, a.entity_type]));

    enviosAnteriores = outros.map((o) => ({
      documentoId: o.id,
      enviadoEm: dateInSaoPaulo(new Date(o.created_at)),
      virouLancamento: tipoPorAnexo.get(o.attachment_id) !== DOCUMENT_ENTITY_TYPE,
    }));
  }

  return {
    documento,
    urlAssinada: await urlAssinadaDoDocumento(supabase, userId, documento.attachmentId),
    enviosAnteriores,
  };
}
