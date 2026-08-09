/**
 * Fase 18-D — IA · Os limites do arquivo, num lugar só.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ FOLHA: este arquivo NÃO IMPORTA NADA. É de propósito.                                 ║
 * ║                                                                                       ║
 * ║ Quem precisa destes números é a validação do envio (`vision/mime.ts`), a estimativa   ║
 * ║ de custo (`usage/vision-tokens.ts`) e a tela. A 18-A já se queimou com um CICLO entre ║
 * ║ `usage/reservation.ts` e `tools/limits.ts`, resolvido movendo as constantes para uma  ║
 * ║ folha sem dependência de volta. Mesmo remédio, aplicado antes da doença.               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro. Nenhum I/O.
 */

/**
 * Os MIMEs que o pipeline aceita — **allowlist, nunca lista de proibidos** (a lição do
 * `parseRefs` da 18-B: toda trava escrita como lista de proibidos vai ser furada).
 *
 * ⛔ **HEIC NÃO ESTÁ AQUI, e a ausência é uma decisão**, não um esquecimento. O iPhone
 * fotografa em HEIC por padrão, então este vai ser o formato mais recusado do sistema — e
 * ainda assim:
 *   • a Anthropic não o lista entre os formatos de imagem aceitos;
 *   • converter exigiria uma biblioteca de imagem que o projeto não tem e não vai ganhar
 *     por causa desta subfase.
 * Aceitar e falhar na chamada (já paga) seria pior que recusar no envio com o motivo escrito
 * e a instrução de como resolver (o iOS exporta JPEG ao compartilhar).
 *
 * ⚠️ `image/jpg` **não existe** como MIME — o registro oficial é `image/jpeg`. Ele não entra
 * aqui nem como cortesia: `sniffMime` decide pelos BYTES e sempre devolve a forma canônica,
 * então uma segunda grafia só criaria um caminho que nunca casa.
 */
export const MIMES_ACEITOS = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;

export type MimeAceito = (typeof MIMES_ACEITOS)[number];

export function isMimeAceito(valor: string): valor is MimeAceito {
  return (MIMES_ACEITOS as readonly string[]).includes(valor);
}

/** `imagem` exige a capacidade `visao`; `pdf` exige `arquivo`. Ver `core/capabilities.ts`. */
export type EspecieDeArquivo = "imagem" | "pdf";

export function especieDoMime(mime: MimeAceito): EspecieDeArquivo {
  return mime === "application/pdf" ? "pdf" : "imagem";
}

// ───────────────────────────── Limites de tamanho ─────────────────────────────

/**
 * Limites NOSSOS, conferidos contra o que os provedores publicam para não os ultrapassarem:
 * a Anthropic documenta 32 MB de requisição inteira e 600 páginas por requisição; o Gemini,
 * 20 MB de dados inline. Ficamos confortavelmente abaixo do MENOR deles, porque a requisição
 * carrega mais coisa além do arquivo (prompt de sistema, schema, instrução).
 */
export const LIMITE_BYTES_IMAGEM = 10 * 1024 * 1024;
export const LIMITE_BYTES_PDF = 16 * 1024 * 1024;

/**
 * Acima disto a imagem é RECUSADA, não redimensionada — sem biblioteca de imagem, encolher
 * não é uma opção honesta. 24 MP é folgado para foto de celular (as de 2026 giram em torno
 * de 12 MP), então o limite recusa arquivo esquisito sem atrapalhar o uso real.
 */
export const LIMITE_MEGAPIXELS = 24;

/** Comprovante tem 1 ou 2 páginas. 20 é folga generosa, não um alvo. */
export const LIMITE_PAGINAS_PDF = 20;

export function limiteDeBytes(especie: EspecieDeArquivo): number {
  return especie === "pdf" ? LIMITE_BYTES_PDF : LIMITE_BYTES_IMAGEM;
}

// ───────────────────────────── Tetos de token ─────────────────────────────

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTES DOIS NÚMEROS SÃO NOSSOS. NÃO SÃO A FÓRMULA DE NENHUM PROVEDOR.               ║
 * ║                                                                                       ║
 * ║ Eles existem para UM fim: a RESERVA de orçamento, que é a priori e tem de cobrir o    ║
 * ║ pior caso. São deliberadamente generosos, no mesmo espírito de `outputCapTokens` ("o  ║
 * ║ teto que NÓS enviamos").                                                              ║
 * ║                                                                                       ║
 * ║ Superestimar significa reservar demais: a pior consequência é o orçamento acusar      ║
 * ║ limite antes da hora, e o dono ver um número maior do que vai gastar. Subestimar      ║
 * ║ significa a chamada custar mais do que foi reservado — e aí o orçamento não protege    ║
 * ║ nada, que é o único desfecho inaceitável.                                              ║
 * ║                                                                                       ║
 * ║ O custo REAL nunca sai daqui: ele vem de `ai_usage_events`, com os tokens que o        ║
 * ║ provedor informou. Estes tetos morrem no instante em que a tentativa termina.          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export const TOKENS_POR_MEGAPIXEL = 2000;
export const TOKENS_POR_PAGINA_PDF = 3000;
