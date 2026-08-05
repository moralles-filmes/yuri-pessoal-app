/**
 * Fase 18-B — IA · Os tetos do laço de ferramentas. Puro, sem I/O.
 *
 * ═══════════════════════ POR QUE UM TETO DURO, E POR QUE 3 ═══════════════════════
 *
 * Para LEITURA, dois passos bastam na esmagadora maioria dos casos (consultar → responder,
 * ou consultar → refinar → responder). O terceiro cobre a consulta cruzada do orquestrador.
 *
 * Um laço sem teto é um laço em que o modelo decide quanto o usuário gasta. Estourado o
 * teto, o modelo responde com o que já tem — e a resposta DECLARA que houve corte, porque um
 * número apresentado como completo depois de um laço interrompido é a mesma mentira que a
 * subfase inteira existe para impedir.
 */

import { MAX_UNTRUSTED_CHARS } from "@/lib/ai/security/untrusted";
import { CARACTERES_POR_TOKEN } from "@/lib/ai/usage/tokens";

/** Passos de FERRAMENTA por run. `1 + MAX_TOOL_STEPS` chamadas ao modelo, no pior caso. */
export const MAX_TOOL_STEPS = 3;

/** Ferramentas executadas em UM passo. Duas leituras em paralelo é normal; vinte não é. */
export const MAX_TOOLS_POR_PASSO = 4;

/**
 * Quanto um resultado de ferramenta acrescenta ao contexto do passo seguinte, em tokens.
 * Determinístico porque `wrapUntrusted` já corta em `MAX_UNTRUSTED_CHARS` — não é chute.
 */
export const TOKENS_POR_RESULTADO_DE_FERRAMENTA = Math.ceil(
  MAX_UNTRUSTED_CHARS / CARACTERES_POR_TOKEN,
);

/** Aviso que acompanha a resposta quando o laço foi interrompido pelo teto. */
export const AVISO_TETO_DE_PASSOS =
  "A consulta foi interrompida no limite de passos: a resposta pode estar incompleta.";
