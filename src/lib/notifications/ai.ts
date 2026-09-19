/**
 * Fase 18-F · Bloco 1 — as notificações do módulo de IA. PURO, sem I/O.
 *
 * Mesma divisão de Dieta (16-F) e Treinos (17-F): aqui se decide "isto é verdade sobre os
 * dados"; o I/O mora em `./ai-cron.ts` e a decisão de ENTREGAR é de `filterByPrefs`, num
 * lugar só (invariante 24).
 *
 * INTEGRA, NÃO REIMPLEMENTA: o limiar do orçamento sai de `nivelAtingido` + `deveAvisar`
 * (`lib/ai/usage/budget.ts`, 18-A) — as MESMAS funções que a tela de consumo usa para decidir
 * quando avisar. Uma segunda cópia da regra faria o sino e `/ia/consumo` discordarem sobre em
 * que ponto o dono é avisado, que é o mesmo defeito que o reuso de `getUsageSummary` evita no
 * total (invariante 24 da 17-F).
 *
 * ═══════════════════════ POR QUE ESTAS QUATRO, E NÃO AS DEZ DO DOC ═══════════════════════
 *
 * O doc da fase listava dez tipos. Quatro caíram com as automações (que ficaram fora do
 * recorte) e dois avisariam sobre algo que acontece na frente do dono, com ele olhando a tela
 * ("análise de imagem concluída", "relatório concluído").
 *
 * ⛔ E "ação aguardando confirmação" é IMPOSSÍVEL de notificar de forma útil: a proposta
 * expira em 10 minutos e o Cron roda 2×/dia. O aviso chegaria para uma proposta morta. O que
 * sobrevive e merece atenção é o OPOSTO — a execução que ficou em `executando` sem desfecho,
 * que não expira e bloqueia nova tentativa (invariante 52).
 *
 * Sem `Date.now()`: `hoje` é SEMPRE injetado.
 */

import { formatDate } from "@/lib/format";
import { deveAvisar, nivelAtingido } from "@/lib/ai/usage/budget";
import { insightsLink, settingsLink, stuckActionsLink, usageLink } from "@/lib/search/ai-links";
import type { NotificationPriority, NotificationType } from "./constants";

/** Mesmo shape de `NotificationCandidate` em generate.ts (evita import circular). */
type Candidate = {
  type: NotificationType;
  priority: NotificationPriority;
  title: string;
  description: string | null;
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  dedupe_key: string;
};

const DIA_MS = 86_400_000;

/**
 * A segunda-feira da semana de uma data pura. Aritmética em `Date.UTC` porque data pura não
 * tem fuso — convertê-la para `Date` local faria a semana virar no fuso errado.
 */
export function segundaDaSemana(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const ms = Date.UTC(y, m - 1, d);
  // getUTCDay(): 0 = domingo. Domingo pertence à semana que começou 6 dias antes.
  const diaDaSemana = new Date(ms).getUTCDay();
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  return new Date(ms - recuo * DIA_MS).toISOString().slice(0, 10);
}

export type GenAiBudget = {
  readonly escopo: "diario" | "mensal";
  /** 'yyyy-MM-dd' no diário, 'yyyy-MM' no mensal. Entra na chave de dedupe. */
  readonly competencia: string;
  readonly totalUsd: number;
  /** `null` = sem teto configurado. Sem teto não há percentual, então não há aviso. */
  readonly limiteUsd: number | null;
  /** `ai_user_preferences.budget_alert_level_reached` — o nível já avisado. */
  readonly nivelJaAvisado: number;
};

export type GenAiProviderProblem = {
  readonly provider: string;
  readonly motivo: "credencial" | "indisponivel" | "job_barrado";
  readonly desde: string;
};

export type GenAiStuckAction = {
  readonly executionId: string;
  readonly command: string;
  /** Instante ISO em que a vaga foi reservada. */
  readonly iniciadaEm: string;
};

export type GenAiInsight = {
  readonly insightId: string;
  readonly titulo: string;
  readonly geradoEm: string;
};

export type AiGenInput = {
  readonly hoje: string;
  readonly budgets: readonly GenAiBudget[];
  readonly providerProblems: readonly GenAiProviderProblem[];
  readonly stuckActions: readonly GenAiStuckAction[];
  readonly insights: readonly GenAiInsight[];
};

const ESCOPO_LABEL: Record<GenAiBudget["escopo"], string> = {
  diario: "do dia",
  mensal: "do mês",
};

const MOTIVO_TEXTO: Record<GenAiProviderProblem["motivo"], string> = {
  credencial: "a chave não está sendo aceita",
  indisponivel: "as últimas chamadas não completaram",
  job_barrado: "a análise automática não rodou",
};

export function generateAiNotifications(input: AiGenInput): Candidate[] {
  const out: Candidate[] = [];

  // ─────────────── Orçamento ───────────────
  for (const b of input.budgets) {
    // `nivelAtingido` já devolve `null` para teto ausente ou não positivo — a decisão de
    // "sem teto não há percentual" mora lá, não aqui.
    const nivel = nivelAtingido(b.totalUsd, b.limiteUsd);
    if (!deveAvisar(nivel, b.nivelJaAvisado)) continue;

    out.push({
      type: "ai_budget_threshold",
      // Só o teto cheio é `medium`: nele a IA para de aceitar pedido novo.
      priority: nivel === 100 ? "medium" : "low",
      title: `IA: ${nivel}% do orçamento ${ESCOPO_LABEL[b.escopo]}`,
      description:
        nivel === 100
          ? "O teto foi alcançado. Você pode ajustá-lo nas configurações da IA."
          : "Dá para acompanhar o detalhe por modelo e por tentativa em Consumo.",
      link: usageLink(),
      entity_type: "ai_budget",
      entity_id: null,
      dedupe_key: `ai-orcamento:${b.escopo}:${b.competencia}:${nivel}`,
    });
  }

  // ─────────────── Provedor ───────────────
  for (const p of input.providerProblems) {
    out.push({
      type: "ai_provider_problem",
      priority: "medium",
      title: `IA: ${p.provider} precisa de atenção`,
      description: `Desde ${formatDate(p.desde)}, ${MOTIVO_TEXTO[p.motivo]}.`,
      link: settingsLink(),
      entity_type: "ai_provider",
      entity_id: null,
      dedupe_key: `ai-provedor:${p.provider}:${p.motivo}:${p.desde}`,
    });
  }

  // ─────────────── Ação sem desfecho ───────────────
  for (const a of input.stuckActions) {
    out.push({
      type: "ai_action_stuck",
      priority: "medium",
      title: "IA: uma ação ficou sem desfecho registrado",
      // ⛔ Não afirma que aconteceu nem que falhou — é exatamente o que não se sabe.
      description:
        "A ação reservou a vaga e não registrou o resultado. Vale conferir no módulo de destino antes de repetir.",
      link: stuckActionsLink(),
      entity_type: "ai_action_execution",
      entity_id: a.executionId,
      dedupe_key: `ai-sem-desfecho:${a.executionId}`,
    });
  }

  // ─────────────── Insight disponível ───────────────
  // ⚠️ UM aviso por SEMANA, não por insight e não por dia. A chave sai da semana justamente
  // para que cinco análises numa terça não virem cinco avisos.
  if (input.insights.length > 0) {
    const semana = segundaDaSemana(input.hoje);
    const quantos = input.insights.length;
    out.push({
      type: "ai_insight_available",
      priority: "low",
      title: quantos === 1 ? "IA: uma análise nova" : `IA: ${quantos} análises novas`,
      description:
        "Elas ficam disponíveis enquanto valerem, e você decide o que fazer com cada uma.",
      link: insightsLink(),
      entity_type: "ai_insight",
      entity_id: quantos === 1 ? input.insights[0].insightId : null,
      dedupe_key: `ai-insight-semana:${semana}`,
    });
  }

  return out;
}
