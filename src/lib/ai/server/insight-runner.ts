import "server-only";

/**
 * Fase 18-E — IA · O RUNNER DO INSIGHT. Uma chamada, sem laço, sem streaming.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ O DASHBOARD NÃO ALCANÇA ESTE ARQUIVO, E ISSO É TESTE DE IMPORT.                    ║
 * ║                                                                                       ║
 * ║ Geração e leitura são metades separadas: `/ia/insights` GERA (por clique do dono, ou  ║
 * ║ pelo job se ele o ligar); o card do dashboard só LÊ `ai_insights` vigentes. "O        ║
 * ║ dashboard não chama a IA no carregamento" fica verdadeiro POR CONSTRUÇÃO — o mesmo    ║
 * ║ raciocínio que separou os três processos da 18-D.                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **A DEDUPLICAÇÃO ACONTECE ANTES DA ADMISSÃO**, e é isso que a faz valer alguma coisa:
 * deduplicar depois cumpriria a letra do critério de aceite e faria o dono pagar por respostas
 * que o sistema jogaria fora.
 *
 * ⚠️ **O INSIGHT QUE NÃO PASSA NA VALIDAÇÃO NÃO É GRAVADO**, e o run fecha `failed` com o
 * código declarado. Erra para "não mostrar nada", nunca para "mostrar algo não conferido".
 */

import type { AiProviderId, AiUsage } from "@/lib/ai/core/contracts";
import { aiError, type AiError } from "@/lib/ai/core/errors";
import { decideFallback } from "@/lib/ai/core/fallback";
import type { AiModelEntry } from "@/lib/ai/core/models";
import { type AiRate, PRICING_VERSION, rateFor } from "@/lib/ai/core/pricing";
import { routeRequest } from "@/lib/ai/core/router";
import { safeUserMessage } from "@/lib/ai/security/redact";
import { computeAttemptCost } from "@/lib/ai/usage/meter";
import {
  computeReservation,
  estimarTokensDeEntrada,
  projetarCustoDoDestino,
  RESERVA_TTL_SEGUNDOS,
} from "@/lib/ai/usage/reservation";
import { createProviderClient } from "@/lib/ai/providers/provider-factory";
import { getAiPreferences, getRouterConfigs } from "@/lib/ai/queries";
import { coletarDieta } from "@/lib/ai/insights/collectors/nutrition";
import { coletarFinanceiro } from "@/lib/ai/insights/collectors/finance";
import { coletarTreinos } from "@/lib/ai/insights/collectors/training";
import { confiancaDoInsight } from "@/lib/ai/insights/confidence";
import {
  type Indicador,
  type ModuloDeInsight,
  indicadorCoerente,
} from "@/lib/ai/insights/contracts";
import { chaveDeDeduplicacao } from "@/lib/ai/insights/dedupe";
import { expiraEm } from "@/lib/ai/insights/expiry";
import {
  INSIGHT_SYSTEM_PROMPT,
  montarMensagemDoInsight,
  versaoDoPromptDeInsight,
} from "@/lib/ai/insights/prompt";
import {
  DESCRICAO_DO_SCHEMA,
  INSIGHT_JSON_SCHEMA,
  insightDoModeloSchema,
  NOME_DO_SCHEMA,
} from "@/lib/ai/insights/schema";
import { validarInsight } from "@/lib/ai/insights/validate";
import { dateInSaoPaulo } from "@/lib/format";
import { gravarInsight, buscarInsightPorChave } from "./insight-store";
import {
  beginInsightRun,
  closeAttempt,
  completeRun,
  failRun,
  MENSAGEM_ADMISSAO,
  startAttempt,
  type AttemptType,
} from "./run-store";
import { resolveApiKey } from "./credential-store";
import { AI_CRYPTO_NOT_CONFIGURED, getCryptoReadiness } from "./crypto-readiness";

type Alvo = { readonly provider: AiProviderId; readonly model: AiModelEntry };

/** O agente é fixo por módulo, e o RPC o fixa de novo no banco. */
export const agenteDoInsight = (modulo: ModuloDeInsight) => `insights.${modulo}`;

export type InsightRunnerInput = {
  readonly userId: string;
  readonly modulo: ModuloDeInsight;
  /** Injetado — nunca `new Date()` aqui dentro. */
  readonly agora: Date;
  readonly janela?: number;
  readonly abortSignal?: AbortSignal;
};

export type InsightRunnerResult =
  | { readonly ok: true; readonly insightId: string; readonly reaproveitado: boolean }
  | { readonly ok: false; readonly code: string; readonly message: string };

const erro = (code: string, message: string): InsightRunnerResult => ({
  ok: false,
  code,
  message,
});

function tipoDaTentativa(
  attemptIndex: number,
  anterior: Alvo | null,
  atual: Alvo,
): AttemptType {
  if (attemptIndex === 1) return "PRIMARY";
  if (!anterior) return "RETRY";
  return anterior.provider !== atual.provider || anterior.model.id !== atual.model.id
    ? "FALLBACK"
    : "RETRY";
}

/**
 * Chama o coletor do módulo. É o único ponto do runner que toca dado do dono, e ele o faz
 * pela TERCEIRA PORTA declarada (`insights/collectors/`) — com a chave `allow_*` já conferida
 * pela Server Action e pelo RPC.
 */
async function coletar(
  modulo: ModuloDeInsight,
  hoje: string,
  janela: number | undefined,
): Promise<{ indicadores: readonly Indicador[]; periodo: { de: string; ate: string } }> {
  if (modulo === "financeiro") return coletarFinanceiro(hoje, janela ?? undefined);
  if (modulo === "treinos") return coletarTreinos(hoje, janela ?? undefined);
  return coletarDieta(hoje, janela ?? undefined);
}

export async function runInsight(
  input: InsightRunnerInput,
): Promise<InsightRunnerResult> {
  const readiness = getCryptoReadiness();
  if (!readiness.ready) return erro(AI_CRYPTO_NOT_CONFIGURED, readiness.message);

  const hoje = dateInSaoPaulo(input.agora);

  // ── 1. Os números, ANTES de qualquer coisa que custe dinheiro ──────────────────────
  const coleta = await coletar(input.modulo, hoje, input.janela);

  /**
   * ⚠️ O COERENTE RODA SOBRE O QUE O COLETOR DEVOLVEU. Ele é código nosso, mas escrito uma
   * vez por módulo e depois por módulo novo; um indicador incoerente (ausência sem motivo,
   * parcial sem motivo, rota que não é interna) viraria uma linha de `ai_insight_sources`
   * que a tela não sabe mostrar — e o CHECK do banco recusaria a gravação depois de a
   * chamada já ter acontecido e sido paga.
   */
  const indicadores = coleta.indicadores.filter(indicadorCoerente);
  if (indicadores.length === 0) {
    return erro(
      "NO_INDICATORS",
      "Não há número medido suficiente neste módulo para uma análise. Registre alguma coisa e tente de novo.",
    );
  }

  // ── 2. DEDUPLICAÇÃO ANTES DA CHAMADA ───────────────────────────────────────────────
  const dedupeKey = chaveDeDeduplicacao({
    modulo: input.modulo,
    periodo: coleta.periodo,
    indicadores,
  });

  const existente = await buscarInsightPorChave(input.userId, dedupeKey);
  if (existente) {
    return { ok: true, insightId: existente.id, reaproveitado: true };
  }

  // ── 3. Rota, tarifas e reserva ─────────────────────────────────────────────────────
  const [configs, prefs] = await Promise.all([
    getRouterConfigs(input.userId),
    getAiPreferences(input.userId),
  ]);

  const rota = routeRequest({
    configs,
    defaultProvider: prefs.defaultProvider,
    defaultModel: prefs.defaultModel,
    modelPreference: null,
    requiredCapabilities: ["saida_estruturada"],
    hoje,
  });

  if (!rota.ok) return erro(rota.error.code, safeUserMessage(rota.error));

  const { provider, model, config, fallbackChain } = rota.value;
  const fallbackLigado = config.fallbackAllowed && prefs.allowFallback;
  const alvos: Alvo[] = [{ provider, model }, ...(fallbackLigado ? fallbackChain : [])];

  const tarifas: AiRate[] = [];
  for (const alvo of alvos) {
    const r = rateFor(alvo.provider, alvo.model.id, hoje);
    if (r) tarifas.push(r);
  }
  if (tarifas.length === 0) {
    return erro(
      "MODEL_WITHOUT_RATE",
      "O modelo escolhido não tem tarifa cadastrada e por isso não pode ser usado.",
    );
  }

  const mensagens = montarMensagemDoInsight({ modulo: input.modulo, indicadores });

  /**
   * ⚠️ Os indicadores entram na conta dos tokens de entrada. Eles são a MAIOR parte do prompt
   * — o texto de sistema é fixo e pequeno, e a lista cresce com o módulo e a janela. Contar
   * só o prompt de sistema reservaria por baixo, e o orçamento deixaria passar em silêncio
   * exatamente o que ele existe para barrar (a lição do `tokensDeArquivos` na 18-D).
   */
  const tokensDeEntrada = estimarTokensDeEntrada(
    INSIGHT_SYSTEM_PROMPT +
      JSON.stringify(INSIGHT_JSON_SCHEMA) +
      JSON.stringify(mensagens),
  );

  const reserva = computeReservation({
    rates: tarifas,
    tokensEntradaEstimados: tokensDeEntrada,
    tokensDeArquivos: 0,
    tetoDeSaida: model.outputCapTokens,
    maxRetries: config.maxRetries,
    maxFallbacks: Math.max(0, alvos.length - 1),
    margem: prefs.reservationMargin,
    // ⛔ ZERO, e não por omissão: um insight não tem laço de ferramentas, e o tipo da
    // requisição (`AiObjectRequest`) não tem campo `tools` para carregar uma.
    maxToolSteps: 0,
  });

  // ── 4. ADMISSÃO ATÔMICA — a chave do módulo é conferida pelo BANCO também ──────────
  const admissao = await beginInsightRun({
    modulo: input.modulo,
    promptVersion: versaoDoPromptDeInsight(),
    provider,
    model: model.id,
    reservedCost: reserva.valorUsd,
    reservationRateVersion: PRICING_VERSION,
    reservationTtlSeconds: RESERVA_TTL_SEGUNDOS,
  });

  if (!admissao.ok) return erro(admissao.code, MENSAGEM_ADMISSAO[admissao.code]);

  const runId = admissao.value.runId;
  const inicioMs = Date.now();

  let attemptIndex = 0;
  let retriesUsed = 0;
  let fallbackCount = 0;
  let alvoIdx = 0;
  let alvoAnterior: Alvo | null = null;
  let custoAcumulado = 0;

  const contexto = (concluiu = false) => ({
    runId,
    userId: input.userId,
    assistantMessageId: null,
    textoFinal: "",
    startedAtMs: inicioMs,
    attemptCount: attemptIndex,
    fallbackCount,
    completedProvider: concluiu
      ? ((alvoAnterior?.provider ?? provider) as AiProviderId)
      : null,
    completedModel: concluiu ? (alvoAnterior?.model.id ?? model.id) : null,
  });

  const desistir = async (e: AiError): Promise<InsightRunnerResult> => {
    await failRun(contexto(), e);
    return erro(e.code, safeUserMessage(e));
  };

  // ── 5. Tentativas ──────────────────────────────────────────────────────────────────
  while (alvoIdx < alvos.length) {
    const alvo = alvos[alvoIdx];
    const tarifa = rateFor(alvo.provider, alvo.model.id, hoje);
    if (!tarifa) {
      alvoIdx += 1;
      continue;
    }

    attemptIndex += 1;
    const tipo = tipoDaTentativa(attemptIndex, alvoAnterior, alvo);
    if (tipo === "FALLBACK") fallbackCount += 1;

    const tentativa = await startAttempt({
      runId,
      userId: input.userId,
      conversationId: null,
      agentId: agenteDoInsight(input.modulo),
      attemptIndex,
      attemptType: tipo,
      provider: alvo.provider,
      modelId: alvo.model.id,
      rate: tarifa,
    });

    if (!tentativa) {
      return desistir(
        aiError(
          "ERRO_PERMANENTE",
          "ATTEMPT_NOT_RECORDED",
          "Não foi possível registrar a execução. Nenhuma chamada foi feita.",
        ),
      );
    }

    alvoAnterior = alvo;

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
      return desistir(chave.error);
    }

    const inicioTentativa = Date.now();
    const client = createProviderClient(alvo.provider, chave.value);

    // ⛔ A ÚNICA CHAMADA EXTERNA. Sem streaming, sem ferramentas.
    const resposta = await client.generateObject({
      model: alvo.model.id,
      system: INSIGHT_SYSTEM_PROMPT,
      messages: mensagens,
      maxOutputTokens: alvo.model.outputCapTokens,
      // Não é criação livre: queremos a leitura mais provável dos números, não uma variação.
      temperature: 0,
      timeoutMs: config.timeoutMs,
      abortSignal: input.abortSignal,
      schema: INSIGHT_JSON_SCHEMA,
      schemaName: NOME_DO_SCHEMA,
      schemaDescription: DESCRICAO_DO_SCHEMA,
    });

    const uso: AiUsage = resposta.usage;
    const fecharTentativa = async (
      status: "completed" | "failed" | "cancelled",
      errorCode: string | null,
    ) => {
      await closeAttempt({
        attemptId: tentativa.id,
        userId: input.userId,
        status,
        usage: uso,
        rate: tarifa,
        latencyMs: Date.now() - inicioTentativa,
        providerRequestId: resposta.providerRequestId,
        errorCode,
      });
      const parcial = computeAttemptCost(uso, tarifa);
      if (parcial.totalUsd !== null) custoAcumulado += parcial.totalUsd;
    };

    // ── 6. O NOSSO Zod, depois a validação de conteúdo ───────────────────────────────
    let erroDaTentativa: AiError | null = resposta.ok ? null : resposta.error;

    if (resposta.ok) {
      const validadaPeloZod = insightDoModeloSchema.safeParse(resposta.value);

      if (!validadaPeloZod.success) {
        /**
         * ⚠️ Fora da forma é ERRO_TEMPORARIO de propósito — é a classe que autoriza
         * `decideFallback` a repetir ou trocar de modelo, e uma segunda tentativa costuma
         * voltar bem-formada. A mensagem do Zod NÃO entra: ela cita nomes do nosso schema.
         */
        erroDaTentativa = aiError(
          "ERRO_TEMPORARIO",
          "INSIGHT_SCHEMA_INVALID",
          "A análise voltou fora do formato esperado.",
        );
      } else {
        const conferido = validarInsight(validadaPeloZod.data, indicadores);

        if (!conferido.ok) {
          /**
           * ⛔ TAMBÉM TEMPORÁRIO, e a decisão é deliberada: escrever um dígito ou usar uma
           * palavra de cobrança é falha de OBEDIÊNCIA, não de capacidade. A tentativa
           * seguinte costuma acertar, e desistir na primeira gastaria a reserva do dono para
           * não entregar nada. O que NÃO acontece em hipótese nenhuma é gravar o texto: a
           * recusa vem antes de qualquer escrita.
           */
          erroDaTentativa = aiError(
            "ERRO_TEMPORARIO",
            conferido.recusas[0].codigo,
            `A análise gerada não passou na conferência: ${conferido.recusas[0].motivo}`,
          );
        } else {
          await fecharTentativa("completed", null);
          await completeRun(contexto(true));

          // ── 7. A CONFIANÇA É DERIVADA AQUI, e só desce ────────────────────────────
          const { confianca } = confiancaDoInsight(indicadores, conferido.citados);

          const gravado = await gravarInsight({
            userId: input.userId,
            runId,
            modulo: input.modulo,
            insight: validadaPeloZod.data,
            confianca,
            indicadores,
            citados: conferido.citados,
            periodo: coleta.periodo,
            dedupeKey,
            expiresAt: expiraEm(coleta.periodo, hoje),
            provider: alvo.provider,
            model: alvo.model.id,
            promptVersion: versaoDoPromptDeInsight(),
          });

          if (!gravado) {
            return erro(
              "INSIGHT_NOT_RECORDED",
              "A análise foi feita, mas não foi possível registrá-la. Tente de novo.",
            );
          }

          return { ok: true, insightId: gravado.id, reaproveitado: false };
        }
      }
    }

    const e =
      erroDaTentativa ??
      aiError("ERRO_TEMPORARIO", "NO_RESULT", "A análise terminou sem resultado.");

    await fecharTentativa(
      e.class === "CANCELADO_PELO_USUARIO" ? "cancelled" : "failed",
      e.code,
    );

    if (input.abortSignal?.aborted) {
      return desistir(
        aiError("CANCELADO_PELO_USUARIO", "INSIGHT_ABORTED", "A análise foi interrompida."),
      );
    }

    const proximoAlvo = alvos[alvoIdx + 1];
    const tarifaProximo = proximoAlvo
      ? rateFor(proximoAlvo.provider, proximoAlvo.model.id, hoje)
      : null;
    const custoProjetado =
      tarifaProximo && proximoAlvo
        ? projetarCustoDoDestino(
            tarifaProximo,
            tokensDeEntrada,
            proximoAlvo.model.outputCapTokens,
          )
        : Number.POSITIVE_INFINITY;

    const veredito = decideFallback({
      errorClass: e.class,
      fallbackAllowed: fallbackLigado,
      fallbackTargetsLeft: alvos.length - (alvoIdx + 1),
      retriesUsed,
      maxRetries: config.maxRetries,
      reservaRestante: Math.max(0, reserva.valorUsd - custoAcumulado),
      custoProjetadoDoDestino: custoProjetado,
    });

    if (veredito.kind === "retry") {
      retriesUsed += 1;
      continue;
    }
    if (veredito.kind === "fallback") {
      alvoIdx += 1;
      continue;
    }

    return desistir(e);
  }

  return desistir(
    aiError(
      "ERRO_PERMANENTE",
      "NO_TARGET_SUCCEEDED",
      "Nenhum provedor autorizado conseguiu produzir uma análise conferida.",
    ),
  );
}
