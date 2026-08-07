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

/**
 * Passos de FERRAMENTA por TENTATIVA — não por run. Uma tentativa custa, no pior caso,
 * `1 + MAX_TOOL_STEPS` chamadas ao modelo; o run inteiro custa isso vezes o número de
 * tentativas: `(1 + maxRetries + maxFallbacks) × (1 + MAX_TOOL_STEPS)`.
 *
 * O laço reinicia a contagem de passos a cada tentativa (o que reinicia é o `passo`, nunca o
 * `step_index`, que é do run — ver `server/tool-loop.ts`). `computeReservation` já reserva
 * nessa mesma base: soma as chamadas do laço e DEPOIS multiplica pelas tentativas. Ler "por
 * run" aqui e ajustar a constante por esse número faria a reserva e o comportamento divergirem.
 */
export const MAX_TOOL_STEPS = 3;

/** Ferramentas executadas em UM passo. Duas leituras em paralelo é normal; vinte não é. */
export const MAX_TOOLS_POR_PASSO = 4;

/**
 * Folga para o que `renderUntrusted()` (`security/untrusted.ts`) acrescenta ALÉM do
 * `content` do bloco: o preâmbulo fixo de aviso (4 linhas), a linha `origem: <ferramenta>` e
 * as chaves do envelope JSON (`untrusted`, `source`, `truncated`, `content`). Medido chamando
 * a função real com um bloco no teto de `MAX_UNTRUSTED_CHARS`: ~379 caracteres com uma origem
 * de 1 caractere, ~437 com uma origem de 59 — o nome de ferramenta do registry estático é
 * sempre curto. 600 é uma folga confortável acima do pior caso medido, para não depender de
 * remedir toda vez que o texto do preâmbulo mudar uma palavra.
 */
export const OVERHEAD_RENDER_UNTRUSTED_CHARS = 600;

/**
 * Quanto UM resultado de ferramenta acrescenta ao contexto do passo seguinte, em tokens.
 * Determinístico porque `wrapUntrusted` já corta o `content` em `MAX_UNTRUSTED_CHARS` — não é
 * chute — e o envelope inteiro (preâmbulo + JSON) é coberto por `OVERHEAD_RENDER_UNTRUSTED_CHARS`.
 * Um passo pode disparar até `MAX_TOOLS_POR_PASSO` ferramentas em paralelo, cada uma virando um
 * bloco `wrapUntrusted` separado — é responsabilidade de quem soma (`usage/reservation.ts`)
 * multiplicar por `MAX_TOOLS_POR_PASSO`, não deste número, que é o custo de UM bloco.
 */
export const TOKENS_POR_RESULTADO_DE_FERRAMENTA = Math.ceil(
  (MAX_UNTRUSTED_CHARS + OVERHEAD_RENDER_UNTRUSTED_CHARS) / CARACTERES_POR_TOKEN,
);

/** Aviso que acompanha a resposta quando o laço foi interrompido pelo teto. */
export const AVISO_TETO_DE_PASSOS =
  "A consulta foi interrompida no limite de passos: a resposta pode estar incompleta.";
