import "server-only";

/**
 * Fase 18-A — IA · Leituras das telas. COLUNAS EXPLÍCITAS, nunca `select('*')`.
 *
 * Uma consulta ampla por tela, derivando o resto em memória — o padrão do projeto para
 * evitar N+1. E nenhuma leitura daqui traz `ciphertext`, `wrapped_dek`, `iv` ou `auth_tag`:
 * material criptográfico só é lido no caminho que decifra (`credential-store.ts`).
 */

import { createClient } from "@/lib/supabase/server";
import type { LeituraDoDono } from "@/lib/supabase/owner";
import type { ClienteDaIa } from "./server/client";
import { AI_PROVIDERS, type AiProviderId } from "./core/contracts";
import { cantoValido, CANTO_PADRAO, type CantoDoBotao } from "./painel";
import { PROVIDER_REGISTRY } from "./providers/registry";
import {
  computeBudgetUsage,
  nivelAtingido,
  type RunForBudget,
  type RunStatus as BudgetRunStatus,
} from "./usage/budget";
import { round6, sumRunCost } from "./usage/meter";
import type { ProviderConfigView } from "./core/router";
import type {
  ToolCallStatus,
  ToolPermission,
  ToolWritePermission,
} from "./tools/contracts";
import {
  parseArgumentos,
  parseRefs,
  type RunSources,
  type ToolCallRecord,
} from "./tools/sources";
import type {
  AiPreferencesView,
  ConversationDetail,
  ConversationListItem,
  ConversationMessage,
  MessageRunInfo,
  ProviderCardView,
  ProviderUsageRow,
  UsagePeriodSummary,
} from "./types";

/** Quantas mensagens do histórico vão para o provedor. Teto de custo e de contexto. */
export const MAX_HISTORY_MESSAGES = 20;
/** Teto do histórico em caracteres, aplicado depois do corte por quantidade. */
export const MAX_HISTORY_CHARS = 24_000;

// ─────────────────────────── Configurações e preferências ───────────────────────────

export async function getProviderCards(
  userId: string,
  /** 18-E Bloco 4 — sem sessão (Cron). `userId` já era explícito; falta só o client. */
  client?: ClienteDaIa,
): Promise<ProviderCardView[]> {
  const supabase = client ?? (await createClient());

  const [configs, creds] = await Promise.all([
    supabase
      .from("ai_provider_configs")
      .select(
        "provider, enabled, display_name, default_model, economy_model, advanced_model, vision_model, timeout_ms, max_retries, daily_limit, monthly_limit, fallback_allowed, fallback_order",
      )
      .eq("user_id", userId),
    supabase
      .from("ai_provider_credentials")
      .select("provider, status, last_four, last_validated_at")
      .eq("user_id", userId),
  ]);

  const porProvedor = new Map(
    (configs.data ?? []).map((c) => [c.provider as AiProviderId, c]),
  );
  const credPorProvedor = new Map(
    (creds.data ?? []).map((c) => [c.provider as AiProviderId, c]),
  );

  // Os quatro aparecem SEMPRE, mesmo sem linha no banco: a tela precisa oferecer o que
  // ainda não foi configurado, e não só o que já foi.
  return AI_PROVIDERS.map((provider) => {
    const cfg = porProvedor.get(provider);
    const cred = credPorProvedor.get(provider);
    const meta = PROVIDER_REGISTRY[provider];

    return {
      provider,
      label: meta.label,
      enabled: cfg?.enabled ?? false,
      displayName: cfg?.display_name ?? null,
      defaultModel: cfg?.default_model ?? null,
      economyModel: cfg?.economy_model ?? null,
      advancedModel: cfg?.advanced_model ?? null,
      visionModel: cfg?.vision_model ?? null,
      timeoutMs: cfg?.timeout_ms ?? 60_000,
      maxRetries: cfg?.max_retries ?? 1,
      dailyLimit: cfg?.daily_limit ?? null,
      monthlyLimit: cfg?.monthly_limit ?? null,
      fallbackAllowed: cfg?.fallback_allowed ?? false,
      fallbackOrder: cfg?.fallback_order ?? [],
      credentialStatus: (cred?.status as ProviderCardView["credentialStatus"]) ?? null,
      lastFour: cred?.last_four ?? null,
      lastValidatedAt: cred?.last_validated_at ?? null,
      keyHint: meta.keyHint,
      consoleUrl: meta.consoleUrl,
    };
  });
}

/** O recorte que `core/router.ts` consome. Puro dado, sem decisão. */
export async function getRouterConfigs(
  userId: string,
  client?: ClienteDaIa,
): Promise<ProviderConfigView[]> {
  const cards = await getProviderCards(userId, client);
  return cards.map((c) => ({
    provider: c.provider,
    enabled: c.enabled,
    defaultModel: c.defaultModel,
    economyModel: c.economyModel,
    advancedModel: c.advancedModel,
    visionModel: c.visionModel,
    fallbackAllowed: c.fallbackAllowed,
    fallbackOrder: c.fallbackOrder,
    maxRetries: c.maxRetries,
    timeoutMs: c.timeoutMs,
    // `nao_validada` CONTA como utilizável: o usuário pode ter salvo a chave sem testar, e
    // recusar por isso o obrigaria a um teste burocrático antes da primeira conversa. Só
    // `invalida` — comprovadamente recusada pelo provedor — bloqueia.
    hasUsableCredential:
      c.credentialStatus === "valida" || c.credentialStatus === "nao_validada",
  }));
}

/**
 * Nenhuma leitura de módulo autorizada. É o padrão do usuário SEM linha em
 * `ai_user_preferences` — e tem de ser exatamente este: um `undefined` no lugar de `false`
 * daria "não sei" onde a resposta certa é "não".
 */
const SEM_PERMISSAO: Record<ToolPermission, boolean> = {
  allow_finance: false,
  allow_nutrition: false,
  allow_training: false,
  allow_body: false,
  allow_todo: false,
  allow_calendar: false,
  allow_tasks: false,
  allow_habits: false,
  allow_studies: false,
};

/**
 * A mesma disciplina de `SEM_PERMISSAO`, para a ESCRITA (18-C). Um usuário sem linha em
 * `ai_user_preferences` não autorizou nada — e "não autorizou" aqui pesa mais, porque o que
 * está do outro lado não é ler um número, é alterar um registro dele.
 */
const SEM_ESCRITA: Record<ToolWritePermission, boolean> = {
  allow_write_todo: false,
  allow_write_habits: false,
  allow_write_calendar: false,
  allow_write_nutrition: false,
  allow_write_finance: false,
};

const PREFS_PADRAO: AiPreferencesView = {
  defaultProvider: null,
  defaultModel: null,
  confirmationMode: "seguro",
  allowFallback: false,
  dailyBudget: null,
  monthlyBudget: null,
  budgetBlockOnLimit: true,
  budgetAlertLevelReached: 0,
  reservationMargin: 1.15,
  rateLimitPerMinute: 10,
  rateLimitPerHour: 120,
  permissions: SEM_PERMISSAO,
  writePermissions: SEM_ESCRITA,
  // 18-D. Nenhum arquivo sai do sistema sem o dono ligar isto explicitamente.
  allowVision: false,
  // 18-E Bloco 4. Sem linha de preferência, nenhuma varredura roda — e o teto do job é ZERO,
  // não o default da coluna: quem não tem preferência gravada não autorizou gasto nenhum.
  allowInsightJobs: false,
  jobMonthlyBudget: 0,
  // 18-F Bloco 2. Sem linha de preferência, o botão aparece no canto padrão: ele não
  // autoriza nada, e esconder de fábrica seria entregar o que ninguém acha.
  floatingCorner: CANTO_PADRAO,
  floatingHidden: false,
};

export async function getAiPreferences(
  userId: string,
  /** 18-E Bloco 4 — sem sessão (Cron). `userId` já era explícito; falta só o client. */
  client?: ClienteDaIa,
): Promise<AiPreferencesView> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("ai_user_preferences")
    .select(
      "default_provider, default_model, confirmation_mode, allow_fallback, allow_finance, allow_nutrition, allow_training, allow_body, allow_todo, allow_calendar, allow_tasks, allow_habits, allow_studies, allow_write_todo, allow_write_habits, allow_write_calendar, allow_write_nutrition, allow_write_finance, allow_vision, allow_insight_jobs, job_monthly_budget, daily_budget, monthly_budget, budget_block_on_limit, budget_alert_level_reached, reservation_margin, rate_limit_per_minute, rate_limit_per_hour, floating_corner, floating_hidden",
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return PREFS_PADRAO;

  return {
    defaultProvider: (data.default_provider as AiProviderId | null) ?? null,
    defaultModel: data.default_model,
    confirmationMode: data.confirmation_mode as AiPreferencesView["confirmationMode"],
    allowFallback: data.allow_fallback,
    dailyBudget: data.daily_budget,
    monthlyBudget: data.monthly_budget,
    budgetBlockOnLimit: data.budget_block_on_limit,
    budgetAlertLevelReached: data.budget_alert_level_reached,
    reservationMargin: data.reservation_margin,
    rateLimitPerMinute: data.rate_limit_per_minute,
    rateLimitPerHour: data.rate_limit_per_hour,
    // `=== true` e não `?? false`: coluna ausente, nula ou de tipo inesperado vira DESLIGADA.
    // Autorização de leitura nunca sai de coerção.
    permissions: {
      allow_finance: data.allow_finance === true,
      allow_nutrition: data.allow_nutrition === true,
      allow_training: data.allow_training === true,
      allow_body: data.allow_body === true,
      allow_todo: data.allow_todo === true,
      allow_calendar: data.allow_calendar === true,
      allow_tasks: data.allow_tasks === true,
      allow_habits: data.allow_habits === true,
      allow_studies: data.allow_studies === true,
    },
    // Mesmo `=== true` da leitura, e aqui ele importa ainda mais: a coerção que
    // transformasse um `null` em "ligado" autorizaria a IA a propor alteração num módulo
    // que o dono nunca liberou.
    writePermissions: {
      allow_write_todo: data.allow_write_todo === true,
      allow_write_habits: data.allow_write_habits === true,
      allow_write_calendar: data.allow_write_calendar === true,
      allow_write_nutrition: data.allow_write_nutrition === true,
      allow_write_finance: data.allow_write_finance === true,
    },
    // 18-D. Mesmo `=== true`, e pela razão mais forte de todas: o que está do outro lado
    // desta coerção não é ler um número nem alterar um registro — é um documento do dono
    // saindo deste sistema para uma empresa fora dele, sem volta.
    allowVision: data.allow_vision === true,
    // 18-E Bloco 4. Mesmo `=== true`: chave ausente é chave DESLIGADA, nunca "ainda não sei".
    allowInsightJobs: data.allow_insight_jobs === true,
    jobMonthlyBudget: data.job_monthly_budget ?? 0,
    /**
     * 18-F Bloco 2. `cantoValido` e não um cast: mesma disciplina do `=== true` das chaves
     * acima. Um valor inesperado (coluna lida por código de outra versão, linha adulterada)
     * viraria classe CSS inexistente e o botão sumiria da tela sem erro nenhum. Cai no padrão.
     */
    floatingCorner: cantoValido(data.floating_corner),
    floatingHidden: data.floating_hidden === true,
  };
}

/**
 * 18-F Bloco 2 — a leitura ESTREITA, para o layout do app.
 *
 * ⛔ POR QUE NÃO `getAiPreferences`. Esta consulta roda em TODA navegação de `(app)`, porque o
 * botão vive na casca. `getAiPreferences` traz 28 colunas e serve a uma tela de configuração
 * que o dono abre de vez em quando; trazer as 28 a cada clique de menu seria pagar o preço de
 * uma tela em todas elas. São duas colunas, e é uma PROJEÇÃO da mesma linha — não uma segunda
 * verdade: quem grava continua sendo `saveAiPreferences` e `definirBotaoFlutuante`.
 *
 * Sem sessão ou sem linha, devolve o padrão. Esta leitura nunca falha a navegação.
 */
export async function getFloatingButtonPrefs(
  userId: string,
): Promise<{ canto: CantoDoBotao; oculto: boolean }> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_user_preferences")
    .select("floating_corner, floating_hidden")
    .eq("user_id", userId)
    .maybeSingle();

  return {
    canto: cantoValido(data?.floating_corner),
    oculto: data?.floating_hidden === true,
  };
}

// ─────────────────────────── Conversas ───────────────────────────

export async function listConversations(
  userId: string,
  incluirArquivadas = false,
): Promise<ConversationListItem[]> {
  const supabase = await createClient();
  let q = supabase
    .from("ai_conversations")
    .select("id, title, agent_id, status, is_favorite, last_message_at, created_at")
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(100);

  if (!incluirArquivadas) q = q.eq("status", "ativa");

  const { data } = await q;
  return (data ?? []).map((c) => ({
    id: c.id,
    title: c.title,
    agentId: c.agent_id,
    status: c.status as ConversationListItem["status"],
    isFavorite: c.is_favorite,
    lastMessageAt: c.last_message_at,
    createdAt: c.created_at,
  }));
}

/**
 * A conversa inteira: mensagens + as execuções que as produziram.
 *
 * As duas leituras são separadas de propósito — `ai_messages` e `ai_runs` se apontam
 * mutuamente por FK COMPOSTA, e FK composta impede o embed do PostgREST (a 16-E documentou
 * o mesmo nas fotos de evolução). Juntar em memória é mais barato que abrir mão da FK.
 */
export async function getConversation(
  userId: string,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const supabase = await createClient();

  const { data: conversa } = await supabase
    .from("ai_conversations")
    .select("id, title, agent_id, status, is_favorite, last_message_at, created_at")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!conversa) return null;

  const [{ data: mensagens }, { data: runs }] = await Promise.all([
    supabase
      .from("ai_messages")
      .select("id, role, content, status, created_at, run_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(500),
    supabase
      .from("ai_runs")
      .select(
        "id, status, selected_provider, selected_model, completed_provider, completed_model, attempt_count, fallback_count, total_latency_ms, error_code, error_message_sanitized",
      )
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .limit(500),
  ]);

  const runIds = (runs ?? []).map((r) => r.id);
  const custosPorRun = new Map<string, (number | null)[]>();

  if (runIds.length > 0) {
    const { data: eventos } = await supabase
      .from("ai_usage_events")
      .select("run_id, estimated_cost")
      .eq("user_id", userId)
      .in("run_id", runIds);

    for (const ev of eventos ?? []) {
      const lista = custosPorRun.get(ev.run_id) ?? [];
      lista.push(ev.estimated_cost);
      custosPorRun.set(ev.run_id, lista);
    }
  }

  const runsInfo: Record<string, MessageRunInfo> = {};
  for (const r of runs ?? []) {
    const custos = custosPorRun.get(r.id) ?? [];
    const total = sumRunCost(custos);
    runsInfo[r.id] = {
      runId: r.id,
      status: r.status as MessageRunInfo["status"],
      provider: (r.completed_provider ?? r.selected_provider) as AiProviderId | null,
      model: r.completed_model ?? r.selected_model,
      // Sem NENHUMA tentativa medida, o custo é indisponível — não é zero.
      costUsd: custos.length === 0 || total.semCusto === custos.length ? null : total.totalUsd,
      custoParcial: total.parcial,
      avisoParcial: total.avisoParcial,
      attemptCount: r.attempt_count,
      fallbackCount: r.fallback_count,
      latencyMs: r.total_latency_ms,
      errorCode: r.error_code,
      errorMessage: r.error_message_sanitized,
    };
  }

  const lista: ConversationMessage[] = (mensagens ?? []).map((m) => ({
    id: m.id,
    role: m.role as ConversationMessage["role"],
    content: m.content,
    status: m.status as ConversationMessage["status"],
    createdAt: m.created_at,
    runId: m.run_id,
  }));

  return {
    conversation: {
      id: conversa.id,
      title: conversa.title,
      agentId: conversa.agent_id,
      status: conversa.status as ConversationListItem["status"],
      isFavorite: conversa.is_favorite,
      lastMessageAt: conversa.last_message_at,
      createdAt: conversa.created_at,
    },
    messages: lista,
    runs: runsInfo,
  };
}

/**
 * O histórico que vai para o provedor. Recortado por quantidade E por caracteres — as duas
 * coisas, porque 20 mensagens curtas e 20 mensagens gigantes custam muito diferente.
 *
 * Mensagem em `streaming`, `cancelled` ou `failed` fica de fora: mandar meia resposta de
 * volta como se fosse a fala do assistente ensinaria o modelo a continuar de onde parou uma
 * frase que o usuário nunca chegou a ver inteira.
 */
export async function getHistoryForPrompt(
  userId: string,
  conversationId: string,
): Promise<{ role: "user" | "assistant"; content: string }[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_messages")
    .select("role, content, status, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("status", "complete")
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY_MESSAGES);

  const recentesPrimeiro = data ?? [];
  const saida: { role: "user" | "assistant"; content: string }[] = [];
  let acumulado = 0;

  for (const m of recentesPrimeiro) {
    if (!m.content) continue;
    if (acumulado + m.content.length > MAX_HISTORY_CHARS) break;
    acumulado += m.content.length;
    saida.push({ role: m.role as "user" | "assistant", content: m.content });
  }

  return saida.reverse();
}

/** Teto da trilha lida de uma vez. Uma conversa de 500 mensagens não vira 5.000 linhas na tela. */
const MAX_TOOL_CALLS_POR_LEITURA = 500;

/**
 * As FONTES de cada resposta: o que foi consultado, quanto foi encontrado e para onde apontar.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR RUN**S**, NÃO POR RUN. O plano previa `getRunSources(userId, runId)`; a tela que a ║
 * ║ consome é a da CONVERSA, que tem uma execução por mensagem do assistente — uma consulta ║
 * ║ por run seria N+1 exatamente onde o projeto o proíbe. A assinatura recebe a lista e     ║
 * ║ devolve indexado por `run_id`, no mesmo formato de `ConversationDetail.runs`.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ **`ai_run_steps` NÃO é lido aqui, e a ausência é deliberada.** Um passo `started` sob run
 * terminal é resíduo de processo morto (timeout de plataforma, deploy no meio do stream): o
 * `finally` do laço não roda e `ai_reconcile_abandoned_runs` não toca `ai_run_steps`. Lê-lo
 * como "em andamento" faria a tela mostrar execuções eternas. Quem responde isso é o status do
 * RUN, que a tela já tem (`MessageRunInfo.status` → `execucaoEmAndamento`).
 *
 * Colunas EXPLÍCITAS, como todo este arquivo. `arguments_sanitized` e `refs` já saem do banco
 * como `jsonb` e passam por parsers puros — o `refs` vira `href`, então é validado antes.
 */
export async function getRunSources(
  userId: string,
  runIds: readonly string[],
): Promise<Record<string, RunSources>> {
  if (runIds.length === 0) return {};

  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_tool_calls")
    .select(
      "run_id, tool_name, tool_version, status, rejection_reason, records_read, duration_ms, refs, arguments_sanitized, created_at",
    )
    .eq("user_id", userId)
    .in("run_id", [...runIds])
    .order("created_at", { ascending: true })
    .limit(MAX_TOOL_CALLS_POR_LEITURA);

  const porRun: Record<string, RunSources> = {};

  for (const linha of data ?? []) {
    const chamada: ToolCallRecord = {
      toolName: linha.tool_name,
      toolVersion: linha.tool_version,
      status: linha.status as ToolCallStatus,
      rejectionReason: linha.rejection_reason,
      // `null` continua `null`: rejeição, falha e timeout não leram nada, e "nada" não é zero.
      recordsRead: linha.records_read,
      durationMs: linha.duration_ms,
      refs: parseRefs(linha.refs),
      argumentos: parseArgumentos(linha.arguments_sanitized),
      createdAt: linha.created_at,
    };

    const atual = porRun[linha.run_id];
    porRun[linha.run_id] = {
      runId: linha.run_id,
      chamadas: atual ? [...atual.chamadas, chamada] : [chamada],
    };
  }

  return porRun;
}

// ─────────────────────────── Consumo ───────────────────────────

/**
 * O consumo do período, pelas DUAS vias do invariante: custo real dos terminais + reserva
 * dos não-terminais. O dia e o mês são os de BRASÍLIA — em UTC o período "viraria" às 21h.
 */
export async function getUsageSummary(
  userId: string,
  periodo: "dia" | "mes",
  limiteUsd: number | null,
  agora: Date,
  /**
   * Fase 18-F. Ausente = leitura com sessão (as telas). Presente = service role, e então o
   * escopo do usuário deixa de vir da RLS e passa a ser NOSSO — por isso o objeto carrega o
   * `userId` junto e "client sem userId" não é representável (`lib/supabase/owner.ts`).
   *
   * ⛔ O sino usa ESTA função, não um somatório próprio: dois cálculos do mesmo gasto fariam
   * o número da notificação divergir do número de `/ia/consumo` (invariante 24 da 17-F).
   */
  dono?: LeituraDoDono,
): Promise<UsagePeriodSummary> {
  const supabase = dono?.client ?? (await createClient());
  const inicio = inicioDoPeriodoEmBrasilia(periodo, agora);

  const { data: runs } = await supabase
    .from("ai_runs")
    .select("id, status, reserved_cost, reservation_expires_at")
    .eq("user_id", userId)
    .gte("created_at", inicio.toISOString())
    .limit(2000);

  const runIds = (runs ?? []).map((r) => r.id);
  const custosPorRun = new Map<string, (number | null)[]>();

  if (runIds.length > 0) {
    const { data: eventos } = await supabase
      .from("ai_usage_events")
      .select("run_id, estimated_cost")
      .eq("user_id", userId)
      .in("run_id", runIds);

    for (const ev of eventos ?? []) {
      const lista = custosPorRun.get(ev.run_id) ?? [];
      lista.push(ev.estimated_cost);
      custosPorRun.set(ev.run_id, lista);
    }
  }

  const paraOrcamento: RunForBudget[] = (runs ?? []).map((r) => ({
    id: r.id,
    status: r.status as BudgetRunStatus,
    reservedCost: r.reserved_cost,
    reservationExpiresAt: r.reservation_expires_at,
    attemptCosts: custosPorRun.get(r.id) ?? [],
  }));

  const uso = computeBudgetUsage(paraOrcamento, agora.getTime());
  const percentual =
    limiteUsd !== null && limiteUsd > 0
      ? round6((uso.totalUsd / limiteUsd) * 100)
      : null;

  return {
    periodo,
    confirmadoUsd: uso.confirmadoUsd,
    reservadoUsd: uso.reservadoUsd,
    totalUsd: uso.totalUsd,
    limiteUsd,
    restanteUsd: limiteUsd === null ? null : round6(limiteUsd - uso.totalUsd),
    percentual,
    nivelDeAlerta: nivelAtingido(uso.totalUsd, limiteUsd),
    execucoesSemCusto: uso.execucoesSemCusto,
    runsComReservaAtiva: uso.runsComReservaAtiva,
    execucoes: paraOrcamento.length,
  };
}

export async function getUsageByModel(
  userId: string,
  periodo: "dia" | "mes",
  agora: Date,
): Promise<ProviderUsageRow[]> {
  const supabase = await createClient();
  const inicio = inicioDoPeriodoEmBrasilia(periodo, agora);

  const { data } = await supabase
    .from("ai_usage_events")
    .select("provider, model_id, estimated_cost")
    .eq("user_id", userId)
    .gte("created_at", inicio.toISOString())
    .limit(5000);

  const agregado = new Map<string, ProviderUsageRow>();
  for (const ev of data ?? []) {
    const chave = `${ev.provider}::${ev.model_id}`;
    const atual = agregado.get(chave) ?? {
      provider: ev.provider as AiProviderId,
      model: ev.model_id,
      execucoes: 0,
      custoUsd: 0,
      semCusto: 0,
    };
    agregado.set(chave, {
      ...atual,
      execucoes: atual.execucoes + 1,
      custoUsd:
        ev.estimated_cost === null
          ? atual.custoUsd
          : round6(atual.custoUsd + ev.estimated_cost),
      semCusto: atual.semCusto + (ev.estimated_cost === null ? 1 : 0),
    });
  }

  return [...agregado.values()].sort((a, b) => b.custoUsd - a.custoUsd);
}

/**
 * Início do dia/mês EM BRASÍLIA, devolvido como instante. A mesma conta que
 * `ai_begin_chat_run` faz em SQL — as duas precisam concordar, senão a tela mostraria um
 * consumo e o bloqueio usaria outro.
 */
function inicioDoPeriodoEmBrasilia(periodo: "dia" | "mes", agora: Date): Date {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(agora);

  const ano = Number(partes.find((p) => p.type === "year")?.value);
  const mes = Number(partes.find((p) => p.type === "month")?.value);
  const dia = periodo === "dia" ? Number(partes.find((p) => p.type === "day")?.value) : 1;

  // Meia-noite de Brasília. O deslocamento é obtido comparando o mesmo instante nos dois
  // fusos — sem tabela de horário de verão embutida, que envelheceria sozinha.
  const palpite = Date.UTC(ano, mes - 1, dia, 0, 0, 0);
  const offsetMs = offsetDeBrasiliaEm(new Date(palpite));
  return new Date(palpite - offsetMs);
}

function offsetDeBrasiliaEm(instante: Date): number {
  const local = new Date(
    instante.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }),
  );
  const utc = new Date(instante.toLocaleString("en-US", { timeZone: "UTC" }));
  return local.getTime() - utc.getTime();
}
