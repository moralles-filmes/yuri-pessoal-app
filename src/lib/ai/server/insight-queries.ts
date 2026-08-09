import "server-only";

/**
 * Fase 18-E — IA · As leituras de insight, para a tela e para o card.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTE ARQUIVO É A METADE "LEITURA", E ELE NÃO ALCANÇA O RUNNER.                     ║
 * ║                                                                                       ║
 * ║ É por isso que o card do dashboard pode importá-lo sem que o dashboard passe a poder  ║
 * ║ chamar a IA. As duas metades moram em arquivos diferentes de propósito, e há teste de ║
 * ║ import em `boundaries.test.ts` mantendo assim.                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **A FK COMPOSTA `(insight_id, user_id)` IMPEDE O EMBED DO PostgREST** — a mesma pedra
 * das fotos de evolução na 16-E. As duas consultas separadas são de propósito, não descuido.
 */

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

import type { Confianca } from "@/lib/ai/insights/confidence";
import type { ModuloDeInsight, TipoDeInsight } from "@/lib/ai/insights/contracts";
import type { FonteDoInsight } from "@/lib/ai/insights/render";
import {
  type EstadoResolvido,
  type LinhaDeFeedback,
  estadoDoInsight,
} from "@/lib/ai/insights/state";

type Client = SupabaseClient<Database>;

export type InsightNaTela = {
  readonly id: string;
  readonly modulo: ModuloDeInsight;
  readonly tipo: TipoDeInsight;
  readonly prioridade: "baixa" | "media" | "alta";
  readonly confianca: Confianca;
  readonly titulo: string;
  readonly resumo: string;
  /** ⚠️ COM os tokens. Quem resolve é `render.ts`, na hora de mostrar. */
  readonly explicacao: string;
  readonly periodoDe: string;
  readonly periodoAte: string;
  readonly expiresAt: string;
  readonly criadoEm: string;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
  readonly fontes: readonly FonteDoInsight[];
  readonly estado: EstadoResolvido;
};

/** Teto da lista. Uma tela com centenas de análises não é uma tela, é um arquivo. */
export const TETO_DA_LISTA = 60;

export async function getInsights(
  agora: Date,
  opcoes?: { readonly userId?: string; readonly client?: Client; readonly limite?: number },
): Promise<InsightNaTela[]> {
  const supabase = opcoes?.client ?? (await createClient());
  const limite = Math.min(opcoes?.limite ?? TETO_DA_LISTA, TETO_DA_LISTA);

  let consulta = supabase
    .from("ai_insights")
    .select(
      "id, modulo, tipo, prioridade, confianca, titulo, resumo, explicacao, periodo_de, periodo_ate, expires_at, created_at, provider, model, prompt_version",
    )
    .order("created_at", { ascending: false })
    .limit(limite);

  // O Cron não tem sessão e usa service role: ali o `user_id` é explícito e obrigatório.
  if (opcoes?.userId) consulta = consulta.eq("user_id", opcoes.userId);

  const { data: linhas } = await consulta;
  if (!linhas || linhas.length === 0) return [];

  const ids = linhas.map((l) => l.id);

  // Duas consultas separadas: a FK composta bloqueia o embed (16-E).
  const [{ data: fontes }, { data: feedback }] = await Promise.all([
    supabase
      .from("ai_insight_sources")
      .select(
        "insight_id, indicador_id, rotulo, valor, indisponivel_porque, unidade, qualidade, motivo_incompleto, periodo_de, periodo_ate, n, regra_de_contagem, rota, ordem",
      )
      .in("insight_id", ids)
      .order("ordem", { ascending: true }),
    supabase
      .from("ai_insight_feedback")
      .select("insight_id, decisao, adiado_ate, created_at")
      .in("insight_id", ids),
  ]);

  const fontesPorInsight = new Map<string, FonteDoInsight[]>();
  for (const f of fontes ?? []) {
    const lista = fontesPorInsight.get(f.insight_id) ?? [];
    lista.push({
      indicador_id: f.indicador_id,
      rotulo: f.rotulo,
      valor: f.valor,
      indisponivel_porque: f.indisponivel_porque,
      unidade: f.unidade,
      qualidade: f.qualidade as "exato" | "parcial",
      motivo_incompleto: f.motivo_incompleto,
      periodo_de: f.periodo_de,
      periodo_ate: f.periodo_ate,
      n: f.n,
      regra_de_contagem: f.regra_de_contagem,
      rota: f.rota,
    });
    fontesPorInsight.set(f.insight_id, lista);
  }

  const feedbackPorInsight = new Map<string, LinhaDeFeedback[]>();
  for (const f of feedback ?? []) {
    const lista = feedbackPorInsight.get(f.insight_id) ?? [];
    lista.push({
      decisao: f.decisao as LinhaDeFeedback["decisao"],
      adiado_ate: f.adiado_ate,
      created_at: f.created_at,
    });
    feedbackPorInsight.set(f.insight_id, lista);
  }

  return linhas.map((l) => ({
    id: l.id,
    modulo: l.modulo as ModuloDeInsight,
    tipo: l.tipo as TipoDeInsight,
    prioridade: l.prioridade as "baixa" | "media" | "alta",
    confianca: l.confianca as Confianca,
    titulo: l.titulo,
    resumo: l.resumo,
    explicacao: l.explicacao,
    periodoDe: l.periodo_de,
    periodoAte: l.periodo_ate,
    expiresAt: l.expires_at,
    criadoEm: l.created_at,
    provider: l.provider,
    model: l.model,
    promptVersion: l.prompt_version,
    fontes: fontesPorInsight.get(l.id) ?? [],
    // ⛔ O ESTADO É DERIVADO NA LEITURA, com `agora` injetado. `ai_insights` não tem coluna
    // de status (invariante 35 da 18-C).
    estado: estadoDoInsight(l.expires_at, feedbackPorInsight.get(l.id) ?? [], agora),
  }));
}

/**
 * Os insights VIGENTES, para o card do dashboard.
 *
 * ⚠️ O filtro de estado acontece em memória, e não num `where` — porque o estado é derivado
 * de `expires_at` MAIS as linhas de feedback, e um `where expires_at > now()` deixaria passar
 * o que o dono dispensou. Uma segunda regra de "o que é vigente" no SQL divergiria de
 * `state.ts` no primeiro caso novo.
 */
export async function getInsightsVigentes(
  agora: Date,
  opcoes?: { readonly userId?: string; readonly client?: Client; readonly limite?: number },
): Promise<InsightNaTela[]> {
  const todos = await getInsights(agora, opcoes);
  return todos.filter((i) => i.estado.estado === "vigente");
}

/* ═══════════════ 18-E · Bloco 4 — a última varredura automática ═══════════════ */

export type LinhaDaVarredura = {
  readonly modulo: ModuloDeInsight;
  readonly desfecho: "gerado" | "reaproveitado" | "pulado" | "falhou";
  readonly motivo: string | null;
};

export type UltimaVarredura = {
  readonly executadaEm: string;
  readonly modulos: readonly LinhaDaVarredura[];
};

/**
 * A última execução do job, para o rodapé de `/ia/insights`.
 *
 * ⛔ **Sem isto, `ai_insight_jobs` seria um registro que ninguém lê** — e um registro que
 * ninguém lê é primo do botão que não liga nada. O critério "job barrado registra o motivo
 * sanitizado" só vale de verdade quando o dono tem onde ver o motivo.
 *
 * ⚠️ Devolve `null` quando nunca houve varredura — e a tela escreve isso, em vez de mostrar
 * um rodapé vazio que pareceria "rodou e não fez nada".
 */
export async function getUltimaVarredura(
  opcoes?: { readonly userId?: string; readonly client?: Client },
): Promise<UltimaVarredura | null> {
  const supabase = opcoes?.client ?? (await createClient());

  let consulta = supabase
    .from("ai_insight_jobs")
    .select("modulo, desfecho, motivo, executed_at")
    .order("executed_at", { ascending: false })
    // Três módulos por execução; o teto pega a última rodada inteira com folga.
    .limit(12);

  if (opcoes?.userId) consulta = consulta.eq("user_id", opcoes.userId);

  const { data } = await consulta;
  const linhas = data ?? [];
  if (linhas.length === 0) return null;

  // Só a execução MAIS RECENTE. Misturar duas rodadas mostraria "Dieta pulada" ao lado de
  // "Dieta gerada" — dois fatos verdadeiros em momentos diferentes, lidos como contradição.
  const maisRecente = linhas[0].executed_at;

  return {
    executadaEm: maisRecente,
    modulos: linhas
      .filter((l) => l.executed_at === maisRecente)
      .map((l) => ({
        modulo: l.modulo as ModuloDeInsight,
        desfecho: l.desfecho as LinhaDaVarredura["desfecho"],
        motivo: l.motivo,
      })),
  };
}
