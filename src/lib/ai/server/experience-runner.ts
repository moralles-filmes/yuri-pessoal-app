import "server-only";

/**
 * Fase 18-F · Bloco 4 — IA · O RUNNER DA EXPERIÊNCIA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ELE NÃO CHAMA O MODELO, NÃO ABRE TENTATIVA E NÃO MEDE NADA.                           ║
 * ║                                                                                       ║
 * ║ Ele lê o catálogo, confere as chaves, deriva os argumentos do dia e entrega um PLANO  ║
 * ║ pronto a `runChat` — que já é dono da admissão, da reserva, do retry, do fallback, da ║
 * ║ medição por chamada e do fechamento. Uma terceira cópia daquele laço erraria a regra  ║
 * ║ de "só uma tentativa aberta por run", que é do BANCO e que nenhum teste de unidade    ║
 * ║ pega.                                                                                 ║
 * ║                                                                                       ║
 * ║ ⛔ E ele é o ÚNICO arquivo do sistema que importa `experiences/catalog`. Há teste de   ║
 * ║ fronteira em `boundaries.test.ts` sobre isso, nos dois sentidos: só ele alcança o      ║
 * ║ catálogo, e só o Route Handler do chat alcança este arquivo.                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { SECURITY_PROMPT } from "@/lib/ai/agents/security-prompt";
import { experienciaPorId } from "@/lib/ai/experiences/catalog";
import { MAX_FERRAMENTAS_POR_EXPERIENCIA } from "@/lib/ai/experiences/contracts";
import { decidirLeituras } from "@/lib/ai/experiences/selection";
import { getAiPreferences } from "@/lib/ai/queries";
import { TOKENS_POR_RESULTADO_DE_FERRAMENTA } from "@/lib/ai/tools/limits";
import { dateInSaoPaulo } from "@/lib/format";
import { MENSAGEM_ADMISSAO } from "./run-store";
import { runChat, type ChatRunnerEvent } from "./chat-runner";

/**
 * O código do único erro que NÃO vem do RPC de admissão — ele é decidido aqui, antes de
 * qualquer gasto, e por isso não está em `MENSAGEM_ADMISSAO`. O Route Handler lhe dá um
 * status HTTP próprio.
 */
export const AI_EXPERIENCE_WITHOUT_DATA = "AI_EXPERIENCE_WITHOUT_DATA";

export type ExperienceRunnerInput = {
  readonly userId: string;
  readonly experiencia: string;
  readonly providerPreference?: string | null;
  readonly modelPreference?: string | null;
  readonly abortSignal: AbortSignal;
  readonly agora: Date;
};

export async function* runExperience(
  input: ExperienceRunnerInput,
): AsyncGenerator<ChatRunnerEvent> {
  const experiencia = experienciaPorId(input.experiencia);
  if (!experiencia) {
    yield {
      type: "error",
      code: "AI_EXPERIENCE_NOT_AVAILABLE",
      message: MENSAGEM_ADMISSAO.AI_EXPERIENCE_NOT_AVAILABLE,
    };
    return;
  }

  const prefs = await getAiPreferences(input.userId);

  /**
   * ⛔ O INTERRUPTOR DO MECANISMO VEM PRIMEIRO, e ele zera tudo — a regra que `insights/job.ts`
   * fixou para `allow_insight_jobs` (invariante 77). O RPC confere de novo, dentro da
   * transação; isto aqui existe para não gastar uma ida ao banco e para o motivo sair em
   * português.
   */
  if (!prefs.allowCrossModule) {
    yield {
      type: "error",
      code: "AI_CROSS_MODULE_NOT_ALLOWED",
      message: MENSAGEM_ADMISSAO.AI_CROSS_MODULE_NOT_ALLOWED,
    };
    return;
  }

  /**
   * `hoje` é resolvido AQUI, em Brasília, e injetado no catálogo. Nada dentro de
   * `experiences/` chama `new Date()`: é isso que torna o catálogo testável sem congelar
   * relógio, e é isso que impede um panorama de virar o dia às 21h na Vercel.
   */
  const hoje = dateInSaoPaulo(input.agora);
  const decisao = decidirLeituras(experiencia, prefs.permissions, hoje);

  /**
   * ⛔ TODOS OS MÓDULOS PULADOS ⇒ RECUSA ANTES DE GASTAR.
   *
   * É a lição do `NO_INDICATORS` da 18-E: chamar o modelo para escrever um panorama sem um
   * único dado faria o dono pagar por uma resposta que o sistema sabia, de antemão, que seria
   * vazia. E o motivo já está escrito — `decisao.aviso` diz exatamente o que ligar.
   *
   * ⚠️ Repare na assimetria com o parágrafo acima, e ela é deliberada: UM módulo desligado é
   * pulado e declarado (invariante 77); TODOS desligados é recusa. Desligar a Agenda não pode
   * calar o panorama inteiro, mas um panorama sobre nada não é um panorama.
   */
  if (decisao.leituras.length === 0) {
    yield {
      type: "error",
      code: AI_EXPERIENCE_WITHOUT_DATA,
      message: `Nenhum módulo deste panorama está liberado para leitura. ${decisao.aviso}`.trim(),
    };
    return;
  }

  yield* runChat({
    userId: input.userId,
    // A experiência SEMPRE abre conversa nova (§7.3) — e o RPC nem tem parâmetro para outra.
    conversationId: null,
    text: experiencia.titulo,
    agentId: null,
    pageContext: null,
    providerPreference: input.providerPreference ?? null,
    modelPreference: input.modelPreference ?? null,
    abortSignal: input.abortSignal,
    agora: input.agora,
    plano: {
      id: experiencia.id,
      agentId: `experiencias.${experiencia.id}`,
      promptVersion: experiencia.promptVersion,
      /**
       * ⛔ A TRAVA DE SEGURANÇA VEM PRIMEIRO, como em `buildSystemPrompt`. O prompt de
       * redação é um PERFIL; ele não substitui o prompt-base, e é por isso que ele não
       * repete nenhuma das regras dele.
       *
       * ⚠️ A MEMÓRIA não entra aqui: quem a concatena é `chat-runner`, depois disto, para a
       * ordem "segurança → perfil → memória" ser montada num lugar só (invariante 98).
       */
      system: `${SECURITY_PROMPT}\n\n---\n\n${experiencia.prompt}`,
      userText: experiencia.titulo,
      leituras: decisao.leituras,
      modulos: decisao.modulos,
      aviso: decisao.aviso,
      /**
       * ⛔ O TETO DO CATÁLOGO, nunca `decisao.leituras.length`. Um panorama com um módulo
       * ligado reserva o mesmo que um com quatro — porque o que se reserva é o pior caso
       * autorizado, e não o caso da vez.
       */
      tokensDeContextoReservados:
        MAX_FERRAMENTAS_POR_EXPERIENCIA * TOKENS_POR_RESULTADO_DE_FERRAMENTA,
    },
  });
}
