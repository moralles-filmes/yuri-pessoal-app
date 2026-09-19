/**
 * Fase 18-F · Bloco 1 — leitura do módulo de IA para o Cron de notificações (SERVER-ONLY).
 *
 * Sem sessão: usa a **service role**, que IGNORA a RLS. Toda query carrega `user_id`
 * explicitamente. Aqui só há I/O — quem decide o que vira notificação é `./ai.ts`, puro.
 *
 * ⛔ O ORÇAMENTO NÃO É RECALCULADO AQUI. Ele sai de `getUsageSummary`, a MESMA função de
 * `/ia/consumo`, agora recebendo `LeituraDoDono`. Um segundo somatório faria o número do sino
 * divergir do número da tela — a lição da invariante 24 da 17-F.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { getUsageSummary } from "@/lib/ai/queries";
import { dateInSaoPaulo, saoPauloWallClockToInstant } from "@/lib/format";
import type { LeituraDoDono } from "@/lib/supabase/owner";
import type {
  AiGenInput,
  GenAiBudget,
  GenAiInsight,
  GenAiProviderProblem,
  GenAiStuckAction,
} from "./ai";

type Service = SupabaseClient<Database>;

/** Teto de linhas lidas por consulta. Declarado porque teto invisível é teto que mente. */
const TETO = 50;

/**
 * ⛔ `todayIso` é a data de BRASÍLIA, e `created_at` é `timestamptz`. Comparar com
 * `${todayIso}T00:00:00.000Z` cortaria o dia à meia-noite **UTC** — 21h BRT do dia anterior —,
 * e três horas da véspera entrariam como "hoje". `saoPauloWallClockToInstant` devolve o
 * instante da meia-noite em São Paulo, que é o corte que o dono enxerga.
 */
function inicioDoDiaEmSaoPaulo(todayIso: string): string {
  return saoPauloWallClockToInstant(todayIso).toISOString();
}

export async function buildAiGenInput(
  service: Service,
  userId: string,
  todayIso: string,
  agora: Date,
): Promise<AiGenInput> {
  const dono: LeituraDoDono = { client: service, userId };

  // ── Preferências: tetos e o nível já avisado ──
  const { data: prefs } = await service
    .from("ai_user_preferences")
    .select("daily_budget, monthly_budget, budget_alert_level_reached")
    .eq("user_id", userId)
    .maybeSingle();

  const budgets: GenAiBudget[] = [];
  if (prefs) {
    const jaAvisado = prefs.budget_alert_level_reached ?? 0;

    const mensal = await getUsageSummary(userId, "mes", prefs.monthly_budget, agora, dono);
    budgets.push({
      escopo: "mensal",
      competencia: todayIso.slice(0, 7),
      totalUsd: mensal.totalUsd,
      limiteUsd: mensal.limiteUsd,
      nivelJaAvisado: jaAvisado,
    });

    const diario = await getUsageSummary(userId, "dia", prefs.daily_budget, agora, dono);
    budgets.push({
      escopo: "diario",
      competencia: todayIso,
      totalUsd: diario.totalUsd,
      limiteUsd: diario.limiteUsd,
      nivelJaAvisado: jaAvisado,
    });
  }

  // ── Execuções sem desfecho (invariante 52: nem sucesso nem falha) ──
  const { data: paradas } = await service
    .from("ai_action_executions")
    .select("id, command, created_at")
    .eq("user_id", userId)
    .eq("status", "executando")
    .order("created_at", { ascending: false })
    .limit(TETO);

  const stuckActions: GenAiStuckAction[] = (paradas ?? []).map((e) => ({
    executionId: e.id,
    command: e.command,
    iniciadaEm: e.created_at,
  }));

  // ── Insights vigentes gerados hoje ──
  // `expires_at` no futuro = ainda vale a pena olhar. Insight expirado não vira aviso.
  const { data: insightRows } = await service
    .from("ai_insights")
    .select("id, titulo, created_at, expires_at")
    .eq("user_id", userId)
    .gte("expires_at", agora.toISOString())
    .gte("created_at", inicioDoDiaEmSaoPaulo(todayIso))
    .limit(TETO);

  const insights: GenAiInsight[] = (insightRows ?? []).map((i) => ({
    insightId: i.id,
    titulo: i.titulo,
    // ⛔ `.slice(0, 10)` aqui devolveria o dia em UTC e erraria a data entre 21h e 00h BRT.
    geradoEm: dateInSaoPaulo(new Date(i.created_at)),
  }));

  // ── Provedor com problema ──
  // Job barrado é o caso que ninguém descobre sozinho: ele roda sem o dono olhando.
  const { data: jobs } = await service
    .from("ai_insight_jobs")
    .select("desfecho, motivo, created_at")
    .eq("user_id", userId)
    .eq("desfecho", "pulado")
    .gte("created_at", inicioDoDiaEmSaoPaulo(todayIso))
    .limit(TETO);

  const providerProblems: GenAiProviderProblem[] = [];
  if ((jobs ?? []).length > 0) {
    providerProblems.push({
      provider: "análise automática",
      motivo: "job_barrado",
      desde: todayIso,
    });
  }

  return { hoje: todayIso, budgets, providerProblems, stuckActions, insights };
}
