import "server-only";

/**
 * Fase 18-A — IA · O orquestrador do run inteiro.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A ORDEM ABAIXO NÃO É ESTILO. Cada passo existe porque o anterior o torna possível.    ║
 * ║                                                                                       ║
 * ║  1. keyring pronto?      → sem cripto, nenhuma credencial é aberta                    ║
 * ║  2. preferências         → as flags `allow_*` decidem QUEM pode responder              ║
 * ║  3. agente pelo roteador → `agent_id` do cliente é PREFERÊNCIA, não autorização        ║
 * ║  4. rota + reserva       → precisa da cadeia de fallback JÁ resolvida                  ║
 * ║  5. admissão atômica     → COMMITA aqui, antes de qualquer chamada externa             ║
 * ║  6. tentativas           → cada uma é uma linha própria em `ai_usage_events`           ║
 * ║  7. fechamento           → condicional ao estado; `finally` e reconciliador convivem   ║
 * ║                                                                                       ║
 * ║ NENHUMA transação e NENHUM lock permanecem abertos do passo 6 em diante.               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import type {
  AiMessage,
  AiProviderId,
  AiStreamEvent,
  AiUsage,
} from "@/lib/ai/core/contracts";
import { aiError, type AiError } from "@/lib/ai/core/errors";
import { decideFallback } from "@/lib/ai/core/fallback";
import type { AiModelEntry } from "@/lib/ai/core/models";
import { type AiRate, PRICING_VERSION, rateFor } from "@/lib/ai/core/pricing";
import { routeRequest } from "@/lib/ai/core/router";
import { buildSystemPrompt, findAgent, promptVersionOf } from "@/lib/ai/agents/registry";
import {
  blocoDeContextoDeRoteamento,
  moduloDoAgente,
  routeAgent,
} from "@/lib/ai/agents/routing";
import { blocoDeMemorias, memoriasParaOPrompt } from "@/lib/ai/memory/prompt";
import { getMemoriasVigentes } from "@/lib/ai/memory/queries";
import type { ToolCallStatus } from "@/lib/ai/tools/audit";
import type { PropostaParaATela } from "@/lib/ai/tools/executor";
import { toolDefinitionsFor, UNEXPECTED_TOOL_CALL } from "@/lib/ai/tools/registry";
import { MAX_TOOL_STEPS } from "@/lib/ai/tools/limits";
import { textoDasMensagens } from "@/lib/ai/core/text";
import { safeUserMessage } from "@/lib/ai/security/redact";
import { computeAttemptCost } from "@/lib/ai/usage/meter";
import {
  computeReservation,
  estimarTokensDeEntrada,
  projetarCustoDoDestino,
  RESERVA_TTL_SEGUNDOS,
} from "@/lib/ai/usage/reservation";
import { createProviderClient } from "@/lib/ai/providers/provider-factory";
import {
  getAiPreferences,
  getHistoryForPrompt,
  getRouterConfigs,
} from "@/lib/ai/queries";
import { dateInSaoPaulo } from "@/lib/format";
import { AI_CRYPTO_NOT_CONFIGURED, getCryptoReadiness } from "./crypto-readiness";
import { resolveApiKey } from "./credential-store";
import {
  beginChatRun,
  cancelRun,
  closeAttempt,
  completeRun,
  failRun,
  HEARTBEAT_INTERVAL_MS,
  heartbeatAndPersist,
  markStreaming,
  MENSAGEM_ADMISSAO,
  startAttempt,
  type AttemptType,
} from "./run-store";
import { runToolLoop } from "./tool-loop";

export type ChatRunnerEvent =
  | {
      readonly type: "start";
      readonly conversationId: string;
      readonly runId: string;
      readonly assistantMessageId: string;
      readonly provider: AiProviderId;
      readonly model: string;
      readonly correlationId: string;
    }
  | { readonly type: "delta"; readonly text: string }
  /** Trocou de provedor no meio. A tela MOSTRA quem respondeu — não é detalhe interno. */
  | {
      readonly type: "switch";
      readonly provider: AiProviderId;
      readonly model: string;
      readonly motivo: string;
    }
  /**
   * Uma ferramenta foi executada (ou recusada) DENTRO desta resposta. A tela mostra o que
   * foi consultado — leitura de dado do usuário nunca acontece em silêncio.
   */
  | {
      readonly type: "tool";
      readonly toolName: string;
      /**
       * O MESMO vocabulário de `ai_tool_calls.status` (`tools/audit.ts`), não uma cópia dele:
       * repetir os literais aqui deixaria um status novo entrar na auditoria sem que o `tsc`
       * apontasse a tela desatualizada. `import type` é apagado na compilação — nada de
       * `server-only` chega ao bundle por causa desta linha.
       */
      readonly status: ToolCallStatus;
      readonly registros: number;
    }
  /**
   * 18-C · Bloco 4 — uma alteração foi PREPARADA e aguarda a confirmação do dono. Nada foi
   * escrito em módulo nenhum. A tela desenha o cartão com a previsão e os dois botões; quem
   * executa é uma Server Action, fora deste streaming.
   *
   * ⚠️ Cancelar a resposta agora NÃO cancela a proposta: ela é uma linha gravada, com prazo
   * próprio de 10 minutos. E confirmar depois NÃO depende deste stream estar vivo — é
   * exatamente essa separação que torna "cancelar o streaming não desfaz ação confirmada"
   * verdadeiro por construção.
   */
  | { readonly type: "proposta"; readonly proposta: PropostaParaATela }
  | {
      readonly type: "done";
      readonly finishReason: string;
      readonly provider: AiProviderId;
      readonly model: string;
    }
  | {
      readonly type: "error";
      readonly code: string;
      readonly message: string;
      readonly retryAfterSeconds?: number;
    };

export type ChatRunnerInput = {
  readonly userId: string;
  readonly conversationId: string | null;
  readonly text: string;
  /**
   * PREFERÊNCIA do cliente. Quem decide é `routeAgent`, com as flags do usuário na mão.
   * `null` = nenhum agente pedido — o que NÃO é o mesmo que pedir o orquestrador.
   */
  readonly agentId: string | null;
  /** A página aberta, quando o usuário autoriza enviá-la (Task 11). */
  readonly pageContext?: { readonly rota: string; readonly modulo: string } | null;
  readonly providerPreference?: string | null;
  readonly modelPreference?: string | null;
  readonly abortSignal: AbortSignal;
  readonly agora: Date;
};

type Alvo = { readonly provider: AiProviderId; readonly model: AiModelEntry };

export async function* runChat(
  input: ChatRunnerInput,
): AsyncGenerator<ChatRunnerEvent> {
  // ── 1. Cripto pronta? ───────────────────────────────────────────────────────────────
  const readiness = getCryptoReadiness();
  if (!readiness.ready) {
    yield {
      type: "error",
      code: AI_CRYPTO_NOT_CONFIGURED,
      message: readiness.message,
    };
    return;
  }

  // ── 2. Preferências e configurações ────────────────────────────────────────────────
  //
  // Vêm ANTES do agente porque a escolha do agente depende das flags `allow_*`: o
  // especialista de um módulo cuja leitura não está autorizada simplesmente não existe para
  // esta mensagem, e a pergunta cai no orquestrador.
  const [configs, prefs] = await Promise.all([
    getRouterConfigs(input.userId),
    getAiPreferences(input.userId),
  ]);

  // ── 3. Agente escolhido pelo SERVIDOR, no registry ESTÁTICO ────────────────────────
  const decisao = routeAgent({
    texto: input.text,
    pageContext: input.pageContext ?? null,
    permissions: prefs.permissions,
    preferido: input.agentId,
  });
  const agent = findAgent(decisao.agentId);
  if (!agent) {
    yield {
      type: "error",
      code: "AI_AGENT_NOT_ALLOWED",
      message: MENSAGEM_ADMISSAO.AI_AGENT_NOT_ALLOWED,
    };
    return;
  }

  const hoje = dateInSaoPaulo(input.agora);

  const rota = routeRequest({
    configs,
    defaultProvider: prefs.defaultProvider,
    defaultModel: prefs.defaultModel,
    providerPreference: input.providerPreference,
    modelPreference: input.modelPreference,
    requiredCapabilities: agent.requiredCapabilities,
    hoje,
  });

  if (!rota.ok) {
    yield { type: "error", code: rota.error.code, message: safeUserMessage(rota.error) };
    return;
  }

  const { provider, model, config, fallbackChain } = rota.value;

  // Fallback exige as DUAS chaves ligadas: a do provedor e a do usuário. Uma sozinha não
  // basta — gastar em outro provedor é decisão que precisa estar explícita nos dois lugares.
  const fallbackLigado = config.fallbackAllowed && prefs.allowFallback;
  const alvos: Alvo[] = [
    { provider, model },
    ...(fallbackLigado ? fallbackChain : []),
  ];

  // ── 4. Prompt e reserva ────────────────────────────────────────────────────────────
  //
  // O motivo do roteamento entra no prompt de SISTEMA — e só ele. É fato do nosso roteador
  // (uma de seis constantes de `agents/routing.ts`), nunca texto do usuário nem resultado de
  // ferramenta: sem esse fato, o orquestrador não tem como dizer a verdade sobre por que a
  // pergunta chegou a ele, e a alternativa seria deixá-lo adivinhar.
  // A rota vai junto: ela diz QUAL tela o usuário tinha aberto, o que inclina a escolha da
  // ferramenta. Continua sendo fato do sistema — `blocoDeContextoDeRoteamento` a converte
  // numa descrição de allowlist e ignora o que não estiver nela.
  /**
   * ⚠️ 18-F Bloco 3 — A MEMÓRIA ENTRA POR ÚLTIMO, e a ordem é a garantia (§6.4). O prompt de
   * SEGURANÇA vem primeiro, o perfil do agente depois, o contexto do roteamento depois, e só
   * então as preferências do dono. Uma frase dele acima das travas seria injeção com um passo
   * humano no meio. `memory/prompt.test.ts` varre esta concatenação.
   *
   * ⚠️ E isto NÃO muda `promptVersionOf(agent)`. A versão registrada em `ai_runs` descreve o
   * PROMPT-BASE e o perfil; memória e contexto de roteamento são dado desta execução, como já
   * era o bloco de rota. Subir a versão a cada memória nova tornaria a coluna inútil.
   *
   * ⚠️ Custo: duas consultas a mais por mensagem, e SÓ com `allow_memory` ligada. Elas são
   * pequenas e recortadas pela RLS; ler memória junto do histórico acoplaria duas leituras
   * que não têm nada em comum.
   */
  const memorias = prefs.permissions.allow_memory
    ? await getMemoriasVigentes(input.userId, input.agora)
    : [];

  const system =
    buildSystemPrompt(agent) +
    blocoDeContextoDeRoteamento(decisao.motivo, input.pageContext?.rota ?? null) +
    blocoDeMemorias(
      memoriasParaOPrompt({
        memorias,
        moduloDoAgente: moduloDoAgente(agent.id),
        permissions: prefs.permissions,
        allowMemory: prefs.permissions.allow_memory,
      }),
    );
  const historico = input.conversationId
    ? await getHistoryForPrompt(input.userId, input.conversationId)
    : [];

  const mensagens: AiMessage[] = [
    ...historico.map((m) => ({ role: m.role, content: m.content })),
    { role: "user" as const, content: input.text },
  ];

  const tarifas: AiRate[] = [];
  for (const alvo of alvos) {
    const r = rateFor(alvo.provider, alvo.model.id, hoje);
    // O router já garantiu que existe tarifa; esta checagem é a rede.
    if (r) tarifas.push(r);
  }
  if (tarifas.length === 0) {
    yield {
      type: "error",
      code: "MODEL_WITHOUT_RATE",
      message: "O modelo escolhido não tem tarifa cadastrada e por isso não pode ser usado.",
    };
    return;
  }

  // As definições que VÃO ao provedor. Resolvidas uma vez: elas são a régua da chamada
  // inesperada (o que não foi oferecido não pode voltar) e o que decide se há laço.
  // ⚠️ As permissões entram AQUI desde a 18-C: um agente pode ter na allowlist ferramentas de
  // módulos com flags diferentes (o de Treinos tem `training` e `body`), e oferecer o que a
  // flag vai recusar queima um passo do laço por pergunta. O guard segue decidindo na execução.
  const definicoes = toolDefinitionsFor(
    agent.allowedTools,
    prefs.permissions,
    prefs.writePermissions,
  );
  const nomesOferecidos = definicoes.map((d) => d.name);

  // A estimativa é sobre o prompt JÁ MONTADO, nunca sobre o texto cru do usuário.
  //
  // ⚠️ `textoDasMensagens`, e não `map(m => m.content).join()`: `content` virou união na
  // 18-B, e concatenar partes direto produz `[object Object]` — 15 caracteres no lugar de um
  // bloco inteiro. A reserva ficaria menor que o custo, sem erro nenhum.
  const promptMontado = system + textoDasMensagens(mensagens);
  const reserva = computeReservation({
    rates: tarifas,
    tokensEntradaEstimados: estimarTokensDeEntrada(promptMontado),
    tetoDeSaida: model.outputCapTokens,
    maxRetries: config.maxRetries,
    maxFallbacks: Math.max(0, alvos.length - 1),
    margem: prefs.reservationMargin,
    // Só reserva passos se o agente TEM ferramenta oferecida. Sem ferramenta não há laço, e
    // reservar passos que não vão acontecer bloquearia orçamento à toa.
    maxToolSteps: definicoes.length > 0 ? MAX_TOOL_STEPS : 0,
  });

  // ── 5. ADMISSÃO ATÔMICA — o commit acontece aqui, antes de qualquer chamada externa ──
  const admissao = await beginChatRun({
    conversationId: input.conversationId,
    agentId: agent.id,
    promptVersion: promptVersionOf(agent),
    userText: input.text,
    provider,
    model: model.id,
    reservedCost: reserva.valorUsd,
    reservationRateVersion: PRICING_VERSION,
    reservationTtlSeconds: RESERVA_TTL_SEGUNDOS,
    title: input.conversationId ? null : tituloProvisorio(input.text),
  });

  if (!admissao.ok) {
    yield {
      type: "error",
      code: admissao.code,
      message: MENSAGEM_ADMISSAO[admissao.code],
      ...(admissao.code === "AI_ADMISSION_BUSY" || admissao.code === "AI_RATE_LIMITED"
        ? { retryAfterSeconds: 5 }
        : {}),
    };
    return;
  }

  const run = admissao.value;
  yield {
    type: "start",
    conversationId: run.conversationId,
    runId: run.runId,
    assistantMessageId: run.assistantMessageId,
    provider,
    model: model.id,
    correlationId: run.correlationId,
  };

  // ── 6. Tentativas ──────────────────────────────────────────────────────────────────
  const inicioMs = Date.now();
  let texto = "";
  let attemptIndex = 0;
  let retriesUsed = 0;
  let fallbackCount = 0;
  let alvoIdx = 0;
  let alvoAnterior: Alvo | null = null;
  let custoAcumulado = 0;
  let fechado = false;
  let ultimoHeartbeat = inicioMs;

  /**
   * ⚠️ O `step_index` é DO RUN, e o run é um só: `beginChatRun` já rodou, e retry e fallback
   * continuam dentro dele. Como `ai_run_steps_run_index_uidx` é `UNIQUE (run_id, step_index,
   * kind)`, um contador que vivesse dentro de `runToolLoop` reiniciaria a cada tentativa e a
   * segunda colidiria em `23505` — `startStep` devolveria `null` e a regra "sem trilha, sem
   * leitura" bloquearia TODA leitura depois do primeiro retry. Por isso o contador mora aqui,
   * ao lado de `attemptIndex`, e atravessa a cadeia inteira.
   */
  let stepIndex = 0;
  const proximoStepIndex = () => (stepIndex += 1);

  /**
   * `completed_provider`/`completed_model` significam "quem EFETIVAMENTE CONCLUIU" — por
   * isso ficam nulos quando o run falha ou é cancelado. Gravar ali o último provedor
   * tentado faria a tela dizer "respondido por X" numa resposta que nunca existiu.
   */
  const contexto = (concluiu = false) => ({
    runId: run.runId,
    userId: input.userId,
    assistantMessageId: run.assistantMessageId,
    textoFinal: texto,
    startedAtMs: inicioMs,
    attemptCount: attemptIndex,
    fallbackCount,
    completedProvider: concluiu
      ? ((alvoAnterior?.provider ?? provider) as AiProviderId)
      : null,
    completedModel: concluiu ? (alvoAnterior?.model.id ?? model.id) : null,
  });

  try {
    while (alvoIdx < alvos.length) {
      const alvo = alvos[alvoIdx];
      const tarifa = rateFor(alvo.provider, alvo.model.id, hoje);
      if (!tarifa) {
        alvoIdx += 1;
        continue;
      }

      attemptIndex += 1;
      const tipo: AttemptType = tipoDaTentativa(attemptIndex, alvoAnterior, alvo);
      if (tipo === "FALLBACK") fallbackCount += 1;

      if (attemptIndex > 1) {
        /**
         * ╔════════════════════════════════════════════════════════════════════════════════╗
         * ║ TENTATIVA NOVA COMEÇA COM O TEXTO ZERADO — E A TELA FAZ O MESMO NO `switch`.    ║
         * ║                                                                                 ║
         * ║ Sem isto, a narração da tentativa que falhou ficava colada na da seguinte: o    ║
         * ║ acumulador atravessava o retry e o fallback, e era ele que ia para              ║
         * ║ `heartbeatAndPersist` e para `completeRun`. A resposta gravada virava a mistura ║
         * ║ de duas respostas — e nenhuma leitura da conversa depois disso conseguiria      ║
         * ║ separá-las.                                                                      ║
         * ║                                                                                 ║
         * ║ ⚠️ Zerar SÓ AQUI é essencial: o passo TOOL_STEP também incrementa `attemptIndex`,║
         * ║ mas ele é a MESMA resposta continuando depois de uma ferramenta, não uma        ║
         * ║ tentativa nova — e não passa por este ponto (ele vive dentro de `chamarModelo`).║
         * ║                                                                                 ║
         * ║ ⚠️ E zerar só no servidor seria pior que não zerar: o `router.refresh()` do fim  ║
         * ║ do envio releria o texto novo e APAGARIA da tela algo que o usuário já tinha    ║
         * ║ lido. Por isso `chat-client.tsx` limpa a bolha no mesmo evento.                  ║
         * ╚════════════════════════════════════════════════════════════════════════════════╝
         */
        texto = "";
        yield {
          type: "switch",
          provider: alvo.provider,
          model: alvo.model.id,
          motivo:
            tipo === "RETRY"
              ? "Repetindo a chamada no mesmo modelo."
              : "Continuando em outro provedor.",
        };
      }

      const tentativa = await startAttempt({
        runId: run.runId,
        userId: input.userId,
        conversationId: run.conversationId,
        agentId: agent.id,
        attemptIndex,
        attemptType: tipo,
        provider: alvo.provider,
        modelId: alvo.model.id,
        rate: tarifa,
      });

      if (!tentativa) {
        const erro = aiError(
          "ERRO_PERMANENTE",
          "ATTEMPT_NOT_RECORDED",
          "Não foi possível registrar a execução. Nenhuma chamada foi feita.",
        );
        await failRun(contexto(), erro);
        fechado = true;
        yield { type: "error", code: erro.code, message: safeUserMessage(erro) };
        return;
      }

      alvoAnterior = alvo;

      // A credencial é decifrada AQUI, no instante da chamada, para UMA chamada.
      const chave = await resolveApiKey(input.userId, alvo.provider);
      if (!chave.ok) {
        await closeAttempt({
          attemptId: tentativa.id,
          userId: input.userId,
          status: "failed",
          usage: null,
          rate: tarifa,
          latencyMs: 0,
          providerRequestId: null,
          errorCode: chave.error.code,
        });
        await failRun(contexto(), chave.error);
        fechado = true;
        yield { type: "error", code: chave.error.code, message: safeUserMessage(chave.error) };
        return;
      }

      const inicioTentativa = Date.now();
      const { signal, dispose } = combinarSinais(input.abortSignal, config.timeoutMs);

      let usoFinal: AiUsage | null = null;
      let providerRequestId: string | null = null;
      let erroDaTentativa: AiError | null = null;
      let concluiu = false;
      let finishReason = "unknown";
      let toolCallInesperada = false;

      /**
       * ╔════════════════════════════════════════════════════════════════════════════════╗
       * ║ CADA CHAMADA AO MODELO É UMA TENTATIVA PRÓPRIA — E SÓ UMA FICA ABERTA.          ║
       * ║                                                                                 ║
       * ║ `ai_usage_events_one_active_uidx` é `UNIQUE (run_id) WHERE status = 'started'`. ║
       * ║ Abrir a tentativa do passo N+1 com a do passo N ainda aberta é `23505` EM        ║
       * ║ RUNTIME — nenhum teste de unidade da medição pega isso, porque a trava é do      ║
       * ║ banco. Por isso o fechamento acontece AQUI, num ponto só, e é a primeira coisa   ║
       * ║ que `chamarModelo` faz antes de abrir a seguinte.                                ║
       * ╚════════════════════════════════════════════════════════════════════════════════╝
       */
      let aberta: { id: string; inicio: number } | null = {
        id: tentativa.id,
        inicio: inicioTentativa,
      };

      const fecharTentativaAberta = async (
        status: "completed" | "failed" | "cancelled",
        errorCode: string | null,
      ) => {
        if (!aberta) return;
        const atual = aberta;
        aberta = null;
        await closeAttempt({
          attemptId: atual.id,
          userId: input.userId,
          status,
          usage: usoFinal,
          rate: tarifa,
          latencyMs: Date.now() - atual.inicio,
          providerRequestId,
          errorCode,
        });
        if (usoFinal) {
          const parcial = computeAttemptCost(usoFinal, tarifa);
          if (parcial.totalUsd !== null) custoAcumulado += parcial.totalUsd;
        }
        usoFinal = null;
        providerRequestId = null;
      };

      /**
       * A chamada ao provedor, uma por passo do laço. O passo 0 usa a tentativa já aberta
       * (PRIMARY/RETRY/FALLBACK); os seguintes abrem uma tentativa `TOOL_STEP` — que é o que
       * mantém a medição por CHAMADA, e não por resposta.
       */
      const chamarModelo = (
        msgs: readonly AiMessage[],
        passo: number,
      ): AsyncIterable<AiStreamEvent> =>
        (async function* () {
          if (passo > 0) {
            await fecharTentativaAberta("completed", null);
            attemptIndex += 1;
            const nova = await startAttempt({
              runId: run.runId,
              userId: input.userId,
              conversationId: run.conversationId,
              agentId: agent.id,
              attemptIndex,
              attemptType: "TOOL_STEP",
              provider: alvo.provider,
              modelId: alvo.model.id,
              rate: tarifa,
            });
            if (!nova) {
              yield {
                type: "error",
                error: aiError(
                  "ERRO_PERMANENTE",
                  "ATTEMPT_NOT_RECORDED",
                  "Não foi possível registrar a continuação da execução. A resposta foi interrompida.",
                ),
              };
              return;
            }
            aberta = { id: nova.id, inicio: Date.now() };
            concluiu = false;
          }

          const client = createProviderClient(alvo.provider, chave.value);
          yield* client.streamText({
            model: alvo.model.id,
            system,
            messages: msgs,
            maxOutputTokens: alvo.model.outputCapTokens,
            timeoutMs: config.timeoutMs,
            abortSignal: signal,
            // O laço executa SÓ o que passou pela allowlist do agente e pelo guard. O que
            // não está aqui não foi oferecido — e voltar assim mesmo encerra o run.
            tools: definicoes,
          });
        })();

      try {
        for await (const evento of runToolLoop({
          ctxBase: {
            runId: run.runId,
            // A conversa vem de `beginChatRun` (a admissão atômica), nunca do cliente: é ela
            // que a FK composta de `ai_action_proposals` confere contra o run e o dono.
            conversationId: run.conversationId,
            userId: input.userId,
            agent: { id: agent.id, allowedTools: agent.allowedTools },
            permissions: prefs.permissions,
            writePermissions: prefs.writePermissions,
          },
          mensagensIniciais: mensagens,
          ferramentasOferecidas: nomesOferecidos,
          proximoStepIndex,
          chamarModelo,
        })) {
          if (evento.type === "delta") {
            if (texto === "") await markStreaming(run.runId, input.userId);
            texto += evento.text;
            yield { type: "delta", text: evento.text };

            // Heartbeat + persistência periódicos. Nunca por token: um stream rápido
            // escreveria centenas de UPDATEs por segundo.
            const agoraMs = Date.now();
            if (agoraMs - ultimoHeartbeat >= HEARTBEAT_INTERVAL_MS) {
              ultimoHeartbeat = agoraMs;
              await heartbeatAndPersist(
                run.runId,
                input.userId,
                run.assistantMessageId,
                texto,
              );
            }
            continue;
          }

          if (evento.type === "tool") {
            yield {
              type: "tool",
              toolName: evento.toolName,
              status: evento.status,
              registros: evento.registros,
            };
            continue;
          }

          if (evento.type === "proposta") {
            yield { type: "proposta", proposta: evento.proposta };
            continue;
          }

          if (evento.type === "aviso") {
            // O corte NÃO é silencioso: ele entra na resposta que o usuário lê e na
            // mensagem que fica gravada. Uma resposta interrompida apresentada como
            // completa é a mesma família de mentira que a subfase inteira combate.
            const trecho = texto === "" ? evento.texto : `\n\n${evento.texto}`;
            texto += trecho;
            yield { type: "delta", text: trecho };
            continue;
          }

          if (evento.type === "tool-call-inesperada") {
            // Não executamos, não interpretamos como ferramenta válida e não deixamos o run
            // seguir como se nada tivesse ocorrido.
            toolCallInesperada = true;
            erroDaTentativa = aiError(
              "ERRO_PERMANENTE",
              UNEXPECTED_TOOL_CALL,
              "O provedor tentou usar uma ferramenta que não foi oferecida. A execução foi encerrada por segurança.",
            );
            break;
          }

          const doProvedor = evento.evento;

          if (doProvedor.type === "finish") {
            usoFinal = doProvedor.usage;
            providerRequestId = doProvedor.providerRequestId;
            finishReason = doProvedor.finishReason;
            concluiu = true;
            continue;
          }

          if (doProvedor.type === "error") {
            erroDaTentativa = doProvedor.error;
            break;
          }
        }
      } catch (e) {
        erroDaTentativa = aiError(
          "ERRO_TEMPORARIO",
          "STREAM_FAILED",
          e instanceof Error && e.name === "AbortError"
            ? "A resposta foi interrompida."
            : "A resposta foi interrompida por uma falha inesperada.",
        );
      } finally {
        dispose();
      }

      // ── Cancelamento do usuário (ou queda do cliente, que é idêntica) ───────────────
      if (input.abortSignal.aborted) {
        await fecharTentativaAberta("cancelled", "CANCELLED");
        await cancelRun(contexto(), "Cancelado pelo usuário ou queda da conexão.");
        fechado = true;
        return;
      }

      // ── Sucesso ────────────────────────────────────────────────────────────────────
      if (concluiu && !erroDaTentativa) {
        await fecharTentativaAberta("completed", null);
        await completeRun(contexto(true));
        fechado = true;
        yield {
          type: "done",
          finishReason,
          provider: alvo.provider,
          model: alvo.model.id,
        };
        return;
      }

      // ── Falha ──────────────────────────────────────────────────────────────────────
      const erro =
        erroDaTentativa ??
        aiError("ERRO_TEMPORARIO", "NO_FINISH", "A resposta terminou sem conclusão.");

      await fecharTentativaAberta(
        erro.class === "CANCELADO_PELO_USUARIO" ? "cancelled" : "failed",
        erro.code,
      );

      // Tool call inesperada NÃO tem recuperação: encerra o run, ponto.
      if (toolCallInesperada) {
        await failRun(contexto(), erro);
        fechado = true;
        yield { type: "error", code: erro.code, message: safeUserMessage(erro) };
        return;
      }

      const proximoAlvo = alvos[alvoIdx + 1];
      const tarifaProximo = proximoAlvo
        ? rateFor(proximoAlvo.provider, proximoAlvo.model.id, hoje)
        : null;
      const custoProjetado =
        tarifaProximo && proximoAlvo
          ? projetarCustoDoDestino(
              tarifaProximo,
              estimarTokensDeEntrada(promptMontado),
              proximoAlvo.model.outputCapTokens,
            )
          : Number.POSITIVE_INFINITY;

      const veredito = decideFallback({
        errorClass: erro.class,
        fallbackAllowed: fallbackLigado,
        fallbackTargetsLeft: alvos.length - (alvoIdx + 1),
        retriesUsed,
        maxRetries: config.maxRetries,
        reservaRestante: Math.max(0, reserva.valorUsd - custoAcumulado),
        custoProjetadoDoDestino: custoProjetado,
      });

      if (veredito.kind === "retry") {
        retriesUsed += 1;
        continue; // mesmo alvo
      }
      if (veredito.kind === "fallback") {
        alvoIdx += 1;
        continue;
      }

      await failRun(contexto(), erro);
      fechado = true;
      yield {
        type: "error",
        code: erro.code,
        message: `${safeUserMessage(erro)} ${veredito.motivo}`.trim(),
      };
      return;
    }

    // Saiu do laço sem sucesso: acabaram os alvos.
    const erro = aiError(
      "ERRO_PERMANENTE",
      "NO_TARGET_SUCCEEDED",
      "Nenhum provedor autorizado conseguiu responder.",
    );
    await failRun(contexto(), erro);
    fechado = true;
    yield { type: "error", code: erro.code, message: safeUserMessage(erro) };
  } finally {
    // Rede de segurança: se saímos por `return()` do consumidor (o navegador fechou a aba),
    // o run não pode ficar aberto prendendo orçamento. O UPDATE é condicional, então se
    // alguém já fechou, isto é no-op.
    if (!fechado) {
      await cancelRun(contexto(), "Conexão encerrada antes da conclusão.").catch(() => {});
    }
  }
}

/** `PRIMARY` na primeira; `RETRY` quando repete provedor E modelo; `FALLBACK` quando muda. */
function tipoDaTentativa(
  attemptIndex: number,
  anterior: Alvo | null,
  atual: Alvo,
): AttemptType {
  if (attemptIndex === 1 || anterior === null) return "PRIMARY";
  const mesmo =
    anterior.provider === atual.provider && anterior.model.id === atual.model.id;
  return mesmo ? "RETRY" : "FALLBACK";
}

/**
 * Une o `AbortSignal` do cliente com o timeout do servidor.
 *
 * O timeout do SERVIDOR é menor que o `maxDuration` da plataforma de propósito: assim quem
 * encerra somos nós, e o estado fica consistente. Se a plataforma cortar primeiro, ninguém
 * roda o `finally` — e o run só seria recuperado pela reconciliação.
 */
function combinarSinais(
  externo: AbortSignal,
  timeoutMs: number,
): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController();

  const abortar = () => controller.abort();
  if (externo.aborted) abortar();
  else externo.addEventListener("abort", abortar, { once: true });

  const timer = setTimeout(abortar, Math.max(1000, timeoutMs));

  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      externo.removeEventListener("abort", abortar);
    },
  };
}

/** Título provisório da conversa nova: as primeiras palavras da pergunta. */
function tituloProvisorio(texto: string): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length <= 60 ? limpo : `${limpo.slice(0, 59)}…`;
}
