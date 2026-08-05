import "server-only";

/**
 * Fase 18-A — IA · O orquestrador do run inteiro.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A ORDEM ABAIXO NÃO É ESTILO. Cada passo existe porque o anterior o torna possível.    ║
 * ║                                                                                       ║
 * ║  1. keyring pronto?      → sem cripto, nenhuma credencial é aberta                    ║
 * ║  2. agente no registry   → `agent_id` do cliente é texto, não autorização              ║
 * ║  3. rota resolvida       → provedor/modelo do cliente são PREFERÊNCIA                  ║
 * ║  4. reserva calculada    → precisa da cadeia de fallback JÁ resolvida                  ║
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
import { toolDefinitionsFor, UNEXPECTED_TOOL_CALL } from "@/lib/ai/tools/registry";
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
  startAttempt,
  type AttemptType,
  type BeginRunErrorCode,
} from "./run-store";

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
  readonly agentId: string;
  readonly providerPreference?: string | null;
  readonly modelPreference?: string | null;
  readonly abortSignal: AbortSignal;
  readonly agora: Date;
};

type Alvo = { readonly provider: AiProviderId; readonly model: AiModelEntry };

/**
 * Erros da ADMISSÃO viram texto pt-BR aqui, num lugar só. O Route Handler decide o status
 * HTTP a partir do código, e a tela mostra a mensagem — nem um nem outro reescreve o texto.
 */
const MENSAGEM_ADMISSAO: Record<BeginRunErrorCode, string> = {
  AI_NOT_AUTHENTICATED: "Sessão expirada. Faça login novamente.",
  AI_MESSAGE_EMPTY: "Escreva alguma coisa antes de enviar.",
  AI_MESSAGE_TOO_LONG: "A mensagem passou do tamanho máximo aceito.",
  AI_AGENT_NOT_ALLOWED: "Este assistente não está disponível.",
  AI_PROMPT_VERSION_REQUIRED: "Configuração interna do assistente incompleta.",
  AI_INVALID_RESERVATION: "Não foi possível calcular a reserva de custo desta mensagem.",
  AI_PROVIDER_NOT_AVAILABLE:
    "O provedor escolhido não está ativo. Ative-o em Configurações.",
  AI_CREDENTIAL_NOT_AVAILABLE:
    "Não há credencial utilizável para este provedor. Cadastre a chave em Configurações.",
  AI_MODEL_NOT_AVAILABLE:
    "O modelo escolhido não está configurado para este provedor.",
  AI_RATE_LIMITED: "Você enviou muitas mensagens em pouco tempo. Aguarde um instante.",
  AI_BUDGET_EXCEEDED_DAILY: "O orçamento diário de IA foi atingido.",
  AI_BUDGET_EXCEEDED_MONTHLY: "O orçamento mensal de IA foi atingido.",
  AI_CONVERSATION_NOT_AVAILABLE: "Esta conversa não está disponível.",
  AI_ADMISSION_BUSY: "Outra mensagem está sendo admitida agora. Tente de novo em segundos.",
  AI_UNKNOWN: "Não foi possível iniciar a resposta.",
};

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

  // ── 2. Agente do registry ESTÁTICO ─────────────────────────────────────────────────
  const agent = findAgent(input.agentId);
  if (!agent) {
    yield {
      type: "error",
      code: "AI_AGENT_NOT_ALLOWED",
      message: MENSAGEM_ADMISSAO.AI_AGENT_NOT_ALLOWED,
    };
    return;
  }

  // ── 3. Rota decidida pelo SERVIDOR ─────────────────────────────────────────────────
  const [configs, prefs] = await Promise.all([
    getRouterConfigs(input.userId),
    getAiPreferences(input.userId),
  ]);

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
  const system = buildSystemPrompt(agent);
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

  // A estimativa é sobre o prompt JÁ MONTADO, nunca sobre o texto cru do usuário.
  const promptMontado = system + mensagens.map((m) => m.content).join("\n");
  const reserva = computeReservation({
    rates: tarifas,
    tokensEntradaEstimados: estimarTokensDeEntrada(promptMontado),
    tetoDeSaida: model.outputCapTokens,
    maxRetries: config.maxRetries,
    maxFallbacks: Math.max(0, alvos.length - 1),
    margem: prefs.reservationMargin,
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

      try {
        const client = createProviderClient(alvo.provider, chave.value);
        const stream = client.streamText({
          model: alvo.model.id,
          system,
          messages: mensagens,
          maxOutputTokens: alvo.model.outputCapTokens,
          timeoutMs: config.timeoutMs,
          abortSignal: signal,
          // ⚠️ O registry DEIXOU DE SER VAZIO na 18-B: um agente com allowlist (hoje,
          // `treinos`) já manda definição ao provedor daqui. Mas o LAÇO DE FERRAMENTAS —
          // executar a chamada e devolver o `tool-result` ao modelo — só chega na Task 10.
          // Até lá, todo evento de tool call cai no ramo `UNEXPECTED_TOOL_CALL` abaixo e
          // encerra o run como `failed`: `agentId: "treinos"` QUEBRA o chat. É por isso
          // que esta branch não pode ser mesclada entre a Task 7 e a Task 10.
          tools: toolDefinitionsFor(agent.allowedTools),
        });

        for await (const evento of stream as AsyncIterable<AiStreamEvent>) {
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

          if (evento.type === "tool-call") {
            // NÃO PODE ACONTECER na 18-A. Não executamos, não interpretamos como ferramenta
            // válida e não deixamos o run seguir como se nada tivesse ocorrido.
            toolCallInesperada = true;
            erroDaTentativa = aiError(
              "ERRO_PERMANENTE",
              UNEXPECTED_TOOL_CALL,
              "O provedor tentou usar uma ferramenta que não foi oferecida. A execução foi encerrada por segurança.",
            );
            break;
          }

          if (evento.type === "finish") {
            usoFinal = evento.usage;
            providerRequestId = evento.providerRequestId;
            finishReason = evento.finishReason;
            concluiu = true;
            break;
          }

          if (evento.type === "error") {
            erroDaTentativa = evento.error;
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

      const latencia = Date.now() - inicioTentativa;

      // ── Cancelamento do usuário (ou queda do cliente, que é idêntica) ───────────────
      if (input.abortSignal.aborted) {
        await closeAttempt({
          attemptId: tentativa.id,
          userId: input.userId,
          status: "cancelled",
          usage: usoFinal,
          rate: tarifa,
          latencyMs: latencia,
          providerRequestId,
          errorCode: "CANCELLED",
        });
        await cancelRun(contexto(), "Cancelado pelo usuário ou queda da conexão.");
        fechado = true;
        return;
      }

      // ── Sucesso ────────────────────────────────────────────────────────────────────
      if (concluiu && !erroDaTentativa) {
        await closeAttempt({
          attemptId: tentativa.id,
          userId: input.userId,
          status: "completed",
          usage: usoFinal,
          rate: tarifa,
          latencyMs: latencia,
          providerRequestId,
          errorCode: null,
        });
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

      await closeAttempt({
        attemptId: tentativa.id,
        userId: input.userId,
        status: erro.class === "CANCELADO_PELO_USUARIO" ? "cancelled" : "failed",
        usage: usoFinal,
        rate: tarifa,
        latencyMs: latencia,
        providerRequestId,
        errorCode: erro.code,
      });

      if (usoFinal) {
        const parcial = computeAttemptCost(usoFinal, tarifa);
        if (parcial.totalUsd !== null) custoAcumulado += parcial.totalUsd;
      }

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
