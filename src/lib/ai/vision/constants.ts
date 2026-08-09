/**
 * Fase 18-D — IA · Onde o arquivo mora, e por quanto tempo ele é alcançável.
 *
 * Os valores espelham `src/lib/body/constants.ts` (16-E) de propósito: é a mesma disciplina,
 * no mesmo bucket, com o mesmo TTL. Um segundo padrão de guarda para o mesmo tipo de dado
 * seria a porta pela qual o mais frouxo dos dois vence.
 *
 * Puro. Nenhum I/O.
 */

import type { MimeAceito } from "./limits";

/** O bucket PRIVADO da Fase 14. Nunca um bucket novo, nunca um bucket público. */
export const DOCUMENT_BUCKET = "attachments";

/**
 * O `entity_type` do anexo enquanto ele é só um envio.
 *
 * ⚠️ Ele MUDA para `transaction` quando a proposta é executada e o comprovante passa a ser
 * anexo do lançamento. É essa troca — e não uma coluna de status — que responde "este
 * documento já virou alguma coisa?". Uma segunda coluna dizendo o mesmo divergiria.
 */
export const DOCUMENT_ENTITY_TYPE = "ia_documento";

/** 5 minutos, gerada A CADA LEITURA. Igual às fotos de evolução. */
export const DOCUMENT_SIGNED_URL_TTL_SECONDS = 300;

/**
 * A extensão do arquivo no bucket, derivada do MIME REAL (o que `sniffMime` decidiu), nunca
 * do nome que o cliente mandou. O nome original é guardado em `attachments.file_name` só
 * para a tela mostrar — ele não participa da composição de caminho nenhum.
 */
export const EXTENSAO_POR_MIME: Record<MimeAceito, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};
