import "server-only";

/**
 * Fase 18-A — IA · Transições de `ai_runs` / `ai_messages` / `ai_usage_events`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ TODA TRANSIÇÃO É UM UPDATE CONDICIONAL AO ESTADO ANTERIOR.                            ║
 * ║                                                                                       ║
 * ║   reserved  → streaming | completed | cancelled | failed                              ║
 * ║   streaming → completed | cancelled | failed                                          ║
 * ║   terminais → (nenhuma)  ← imutáveis                                                  ║
 * ║                                                                                       ║
 * ║ Terminal não tem origem permitida, então uma SEGUNDA tentativa de fechar é no-op      ║
 * ║ silencioso. É exatamente assim que o `finally` do runner e o reconciliador nunca se   ║
 * ║ contradizem: quem chegar primeiro vence, o outro não encontra linha e não faz nada.   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import type { AiProviderId, AiUsage } from "@/lib/ai/core/contracts";
import type { AiError } from "@/lib/ai/core/errors";
import { type AiRate, PRICING_VERSION, rateSnapshot } from "@/lib/ai/core/pricing";
import { availabilityRecord, computeAttemptCost } from "@/lib/ai/usage/meter";
import { sanitizedForStorage } from "@/lib/ai/security/redact";

/** Estados não-terminais. Todo fechamento é condicionado a estar num deles. */
const ABERTOS = ["reserved", "streaming"] as const;

export type BeginRunInput = {
  readonly conversationId: string | null;
  readonly agentId: string;
  readonly promptVersion: string;
  readonly userText: string;
  readonly provider: AiProviderId;
  readonly model: string;
  readonly reservedCost: number;
  readonly reservationRateVersion: string;
  readonly reservationTtlSeconds: number;
  readonly title: string | null;
};

export type BeginRunOutput = {
  readonly conversationId: string;
  readonly userMessageId: string;
  readonly runId: string;
  readonly assistantMessageId: string;
  readonly correlationId: string;
};

/** Códigos que a função SQL levanta. O Route Handler traduz cada um em HTTP. */
export type BeginRunErrorCode =
  | "AI_NOT_AUTHENTICATED"
  | "AI_MESSAGE_EMPTY"
  | "AI_MESSAGE_TOO_LONG"
  | "AI_AGENT_NOT_ALLOWED"
  | "AI_PROMPT_VERSION_REQUIRED"
  | "AI_INVALID_RESERVATION"
  | "AI_PROVIDER_NOT_AVAILABLE"
  | "AI_CREDENTIAL_NOT_AVAILABLE"
  | "AI_MODEL_NOT_AVAILABLE"
  | "AI_RATE_LIMITED"
  | "AI_BUDGET_EXCEEDED_DAILY"
  | "AI_BUDGET_EXCEEDED_MONTHLY"
  | "AI_CONVERSATION_NOT_AVAILABLE"
  | "AI_ADMISSION_BUSY"
  | "AI_UNKNOWN";

/**
 * A admissão inteira, atômica, numa transação do banco. Nada é inserido daqui de fora —
 * quatro inserts independentes produziriam, na primeira falha de rede, run sem mensagem ou
 * reserva financeira presa.
 */
export async function beginChatRun(
  input: BeginRunInput,
): Promise<
  { ok: true; value: BeginRunOutput } | { ok: false; code: BeginRunErrorCode }
> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("ai_begin_chat_run", {
    // O tipo gerado (18-B) é MAIS ESTRITO que o banco: `p_conversation_id` não tem `default`
    // no SQL, então PRECISA ser enviado — omitir a chave faz o PostgREST não achar a função.
    // Só que em PL/pgSQL todo parâmetro aceita NULL, e aqui NULL É SIGNIFICATIVO: é assim que
    // se pede uma conversa NOVA (a função ramifica em `if p_conversation_id is not null`).
    // O gerador não expressa "obrigatório, mas aceita null" — daí o cast estreito. Se um dia
    // o SQL ganhar `default null` neste parâmetro (precisaria de nova migration), o tipo vira
    // opcional e este cast pode sair.
    p_conversation_id: input.conversationId as unknown as string,
    p_agent_id: input.agentId,
    p_prompt_version: input.promptVersion,
    p_user_text: input.userText,
    p_selected_provider: input.provider,
    p_selected_model: input.model,
    p_reserved_cost: input.reservedCost,
    p_reservation_rate_version: input.reservationRateVersion,
    p_reservation_ttl_seconds: input.reservationTtlSeconds,
    // `p_title` TEM `default null` no SQL: omitir a chave (via `?? undefined`) faz o
    // PostgREST usar o default — sem cast, e com o mesmo comportamento de passar null.
    p_title: input.title ?? undefined,
  });

  if (error) {
    return { ok: false, code: classifyBeginError(error.message, error.code) };
  }

  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return { ok: false, code: "AI_UNKNOWN" };

  return {
    ok: true,
    value: {
      conversationId: linha.conversation_id,
      userMessageId: linha.user_message_id,
      runId: linha.run_id,
      assistantMessageId: linha.assistant_message_id,
      correlationId: linha.correlation_id,
    },
  };
}

const CODIGOS_CONHECIDOS: readonly BeginRunErrorCode[] = [
  "AI_NOT_AUTHENTICATED",
  "AI_MESSAGE_EMPTY",
  "AI_MESSAGE_TOO_LONG",
  "AI_AGENT_NOT_ALLOWED",
  "AI_PROMPT_VERSION_REQUIRED",
  "AI_INVALID_RESERVATION",
  "AI_PROVIDER_NOT_AVAILABLE",
  "AI_CREDENTIAL_NOT_AVAILABLE",
  "AI_MODEL_NOT_AVAILABLE",
  "AI_RATE_LIMITED",
  "AI_BUDGET_EXCEEDED_DAILY",
  "AI_BUDGET_EXCEEDED_MONTHLY",
  "AI_CONVERSATION_NOT_AVAILABLE",
];

function classifyBeginError(
  mensagem: string | undefined,
  sqlState: string | undefined,
): BeginRunErrorCode {
  // `55P03` = lock_not_available: o `SET LOCAL lock_timeout='3s'` estourou. Não houve falha,
  // houve CONCORRÊNCIA — por isso vira 429 com Retry-After, e nunca 500.
  if (sqlState === "55P03" || sqlState === "57014") return "AI_ADMISSION_BUSY";

  const texto = mensagem ?? "";
  for (const codigo of CODIGOS_CONHECIDOS) {
    if (texto.includes(codigo)) return codigo;
  }
  return "AI_UNKNOWN";
}

// ─────────────────────────── Heartbeat e persistência incremental ───────────────────────

/**
 * Cadência do heartbeat. NUNCA por token: um stream rápido escreveria centenas de UPDATEs
 * por segundo, e o banco viraria o gargalo da resposta. A lease é de 5 min — 30× este
 * intervalo, folga suficiente para uma resposta lenta continuar viva.
 */
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const LEASE_MS = 5 * 60_000;

/**
 * Bate o heartbeat E grava o texto parcial na mesma escrita.
 *
 * "Persistência incremental" aqui significa periódica, não por delta. Gravar cada pedaço
 * seria uma escrita por token; gravar só no fim perderia tudo se o processo caísse. A cada
 * 10 s custa uma escrita e limita a perda à última janela — e a mensagem já está no banco
 * desde a admissão, então recarregar a página no meio nunca perde a conversa.
 */
export async function heartbeatAndPersist(
  runId: string,
  userId: string,
  assistantMessageId: string,
  textoParcial: string,
): Promise<void> {
  const supabase = await createClient();
  const agora = new Date();

  await supabase
    .from("ai_runs")
    .update({
      last_heartbeat_at: agora.toISOString(),
      lease_expires_at: new Date(agora.getTime() + LEASE_MS).toISOString(),
    })
    .eq("id", runId)
    .eq("user_id", userId)
    .in("status", [...ABERTOS]);

  await supabase
    .from("ai_messages")
    .update({ content: textoParcial })
    .eq("id", assistantMessageId)
    .eq("user_id", userId)
    .eq("status", "streaming");
}

/** `reserved` → `streaming`, no PRIMEIRO delta. Condicional, como todas as demais. */
export async function markStreaming(runId: string, userId: string): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from("ai_runs")
    .update({ status: "streaming" })
    .eq("id", runId)
    .eq("user_id", userId)
    .eq("status", "reserved");
}

// ─────────────────────────── Fechamentos ───────────────────────────

type FecharInput = {
  readonly runId: string;
  readonly userId: string;
  readonly assistantMessageId: string;
  readonly textoFinal: string;
  readonly startedAtMs: number;
  readonly attemptCount: number;
  readonly fallbackCount: number;
  readonly completedProvider: AiProviderId | null;
  readonly completedModel: string | null;
};

export async function completeRun(input: FecharInput): Promise<void> {
  await fecharRun(input, "completed", null, null);
}

export async function cancelRun(
  input: FecharInput,
  motivo: string,
): Promise<void> {
  await fecharRun(input, "cancelled", null, motivo);
}

export async function failRun(input: FecharInput, error: AiError): Promise<void> {
  await fecharRun(input, "failed", error, null);
}

/**
 * O fechamento, num lugar só. O `WHERE ... IN ('reserved','streaming')` é o que garante que
 * duas rotas concorrentes (o `finally` do runner e o reconciliador) nunca produzam estados
 * contraditórios: a segunda simplesmente não casa e não escreve nada.
 */
async function fecharRun(
  input: FecharInput,
  status: "completed" | "cancelled" | "failed",
  error: AiError | null,
  cancelReason: string | null,
): Promise<void> {
  const supabase = await createClient();
  const agora = new Date();

  const { data } = await supabase
    .from("ai_runs")
    .update({
      status,
      completed_at: agora.toISOString(),
      total_latency_ms: Math.max(0, agora.getTime() - input.startedAtMs),
      attempt_count: input.attemptCount,
      fallback_count: input.fallbackCount,
      completed_provider: input.completedProvider,
      completed_model: input.completedModel,
      error_code: error?.code ?? null,
      error_message_sanitized: error ? sanitizedForStorage(error) : null,
      cancel_reason: cancelReason,
    })
    .eq("id", input.runId)
    .eq("user_id", input.userId)
    .in("status", [...ABERTOS])
    .select("id");

  // Se ninguém casou, outro caminho já fechou este run. Não é erro — é a regra funcionando.
  if (!data || data.length === 0) return;

  const statusMensagem =
    status === "completed" ? "complete" : status === "cancelled" ? "cancelled" : "failed";

  await supabase
    .from("ai_messages")
    .update({ content: input.textoFinal, status: statusMensagem })
    .eq("id", input.assistantMessageId)
    .eq("user_id", input.userId)
    .eq("status", "streaming");
}

// ─────────────────────────── Tentativas ───────────────────────────

/**
 * `TOOL_STEP` (18-B) é a chamada ao modelo que CONTINUA o laço depois de uma ferramenta —
 * não é repetição (`RETRY`) nem troca de provedor (`FALLBACK`). Ela é uma linha própria
 * porque é uma chamada paga própria: medir a resposta inteira como uma tentativa só
 * esconderia o custo do laço, que é justamente o que a reserva por passos existe para cobrir.
 */
export type AttemptType = "PRIMARY" | "RETRY" | "FALLBACK" | "TOOL_STEP";

export type StartAttemptInput = {
  readonly runId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly agentId: string;
  readonly attemptIndex: number;
  readonly attemptType: AttemptType;
  readonly provider: AiProviderId;
  readonly modelId: string;
  readonly rate: AiRate;
};

/**
 * Abre a tentativa ANTES de emitir a chamada, com `status = 'started'`.
 *
 * É essa linha que distingue os dois modos de queda sem inventar um estado de run:
 *   run `reserved` SEM tentativa         → caiu depois do commit e ANTES de chamar
 *   run `reserved` COM tentativa started → caiu DEPOIS de chamar (pode ter havido consumo)
 *
 * ═══════════════════════ IDEMPOTÊNCIA: INSERT PRIMEIRO ═══════════════════════
 *
 * `INSERT` → em `23505`, consulta a linha existente e devolve. NÃO é select-then-insert:
 * entre o SELECT e o INSERT cabem duas execuções, e as duas achariam "não existe". A
 * unicidade `(run_id, attempt_index)` é a autoridade; o código só reage a ela.
 */
export async function startAttempt(
  input: StartAttemptInput,
): Promise<{ id: string; jaExistia: boolean } | null> {
  const supabase = await createClient();
  const id = randomUUID();

  const { data, error } = await supabase
    .from("ai_usage_events")
    .insert({
      id,
      user_id: input.userId,
      run_id: input.runId,
      conversation_id: input.conversationId,
      agent_id: input.agentId,
      attempt_index: input.attemptIndex,
      attempt_type: input.attemptType,
      provider: input.provider,
      model_id: input.modelId,
      status: "started",
      rate_snapshot: rateSnapshot(input.rate),
      pricing_version: PRICING_VERSION,
      currency: "USD",
      was_fallback: input.attemptType === "FALLBACK",
      usage_availability: {},
    })
    .select("id")
    .single();

  if (!error && data) return { id: data.id, jaExistia: false };

  if (error?.code === "23505") {
    // Já aplicada: devolve a existente. Nunca recalcula, nunca soma de novo.
    const { data: existente } = await supabase
      .from("ai_usage_events")
      .select("id")
      .eq("run_id", input.runId)
      .eq("attempt_index", input.attemptIndex)
      .maybeSingle();
    if (existente) return { id: existente.id, jaExistia: true };
  }

  return null;
}

export type CloseAttemptInput = {
  readonly attemptId: string;
  readonly userId: string;
  readonly status: "completed" | "failed" | "cancelled";
  readonly usage: AiUsage | null;
  readonly rate: AiRate;
  readonly latencyMs: number;
  readonly providerRequestId: string | null;
  readonly errorCode: string | null;
};

/**
 * Fecha a tentativa e congela o custo.
 *
 * O UPDATE só alcança linha em `started` — a policy do banco exige isso, e é o que torna a
 * RETIFICAÇÃO DE USO TARDIO impossível na 18-A. Tentativa terminal é imutável, pela mesma
 * disciplina do snapshot nutricional (16-B) e da sessão de treino (17-C).
 */
export async function closeAttempt(input: CloseAttemptInput): Promise<void> {
  const supabase = await createClient();

  // Sem `usage`, custo NULO e ausência registrada — nunca zero.
  const custo = input.usage ? computeAttemptCost(input.usage, input.rate) : null;
  const disponibilidade = input.usage
    ? availabilityRecord(input.usage)
    : {
        input_tokens: "unavailable",
        output_tokens: "unavailable",
        cached_input_tokens: "unavailable",
        note: "A chamada terminou sem o provedor informar consumo.",
      };

  await supabase
    .from("ai_usage_events")
    .update({
      status: input.status,
      completed_at: new Date().toISOString(),
      latency_ms: Math.max(0, input.latencyMs),
      input_tokens: input.usage?.inputTokens ?? null,
      output_tokens: input.usage?.outputTokens ?? null,
      cached_input_tokens: input.usage?.cachedInputTokens ?? null,
      usage_availability: disponibilidade,
      estimated_cost: custo?.totalUsd ?? null,
      provider_request_id: input.providerRequestId,
      error_code: input.errorCode,
    })
    .eq("id", input.attemptId)
    .eq("user_id", input.userId)
    .eq("status", "started");
}
