import "server-only";

/**
 * Fase 18-E — IA · O I/O das três tabelas de insight.
 *
 * ⛔ **ELE MORA AQUI E NÃO EM `insights/`** porque `insights/` é camada PURA: há teste de
 * fronteira varrendo `.from(` e `select(` naquela pasta. A decisão (o que é um número, o que
 * se pode agregar, se o texto passa, quando vence) é lá; a conversa com o banco é aqui.
 *
 * ⚠️ **SÓ TABELAS `ai_*`.** Nenhuma tabela de módulo do dono é tocada por este arquivo — a
 * mesma disciplina de `tools/audit.ts` e de `approval/`.
 */

import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

import type { Indicador, ModuloDeInsight } from "@/lib/ai/insights/contracts";
import type { Confianca } from "@/lib/ai/insights/confidence";
import type { InsightGerado } from "@/lib/ai/insights/contracts";

type Client = SupabaseClient<Database>;

export type InsightGravado = {
  readonly id: string;
  readonly dedupeKey: string;
};

export type GravarInsightInput = {
  readonly userId: string;
  readonly runId: string;
  readonly modulo: ModuloDeInsight;
  readonly insight: InsightGerado;
  readonly confianca: Confianca;
  readonly indicadores: readonly Indicador[];
  /** Só os CITADOS viram fonte — ver a nota em `fontesCitadas`. */
  readonly citados: readonly string[];
  readonly periodo: { readonly de: string; readonly ate: string };
  readonly dedupeKey: string;
  readonly expiresAt: string;
  readonly provider: string;
  readonly model: string;
  readonly promptVersion: string;
};

/**
 * O insight já existente para esta chave, se houver.
 *
 * ⚠️ **ELE DEVOLVE O EXISTENTE SEJA QUAL FOR O ESTADO DELE — inclusive expirado.** O desenho
 * dizia "não expirado", e a `unique (user_id, dedupe_key)` alcança o expirado: com o filtro
 * do desenho, regenerar depois do vencimento bateria em `23505`. A saída não é afrouxar a
 * chave. Se ela repete, os dados não mudaram — e um segundo texto sobre os mesmos números não
 * é informação nova, é gasto. Quem quer números novos tem dados novos, e aí a chave é outra.
 */
export async function buscarInsightPorChave(
  userId: string,
  dedupeKey: string,
  client?: Client,
): Promise<{ id: string; expires_at: string } | null> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("ai_insights")
    .select("id, expires_at")
    .eq("user_id", userId)
    .eq("dedupe_key", dedupeKey)
    .maybeSingle();
  return data ?? null;
}

/**
 * ⚠️ **SÓ OS INDICADORES CITADOS VIRAM LINHA DE `ai_insight_sources`.**
 *
 * `ai_insight_sources` é o SNAPSHOT que sustenta o texto, não o log da chamada. Gravar os
 * doze indicadores enviados quando o texto cita três guardaria nove cópias de dado pessoal
 * dentro de `ai_*` que nada sustenta — e a exceção declarada à invariante 20 vale só na
 * medida em que a cópia é necessária para o insight continuar legível.
 *
 * Os indicadores que o modelo ignorou continuam existindo no módulo de origem, onde sempre
 * estiveram.
 */
function fontesCitadas(
  indicadores: readonly Indicador[],
  citados: readonly string[],
): Indicador[] {
  const conhecidos = new Set(citados);
  return indicadores.filter((i) => conhecidos.has(i.id));
}

/**
 * Grava o insight e as fontes.
 *
 * ⚠️ **A ORDEM É INSIGHT → FONTES, e a falha do segundo passo apaga o primeiro.** Sem isso,
 * uma queda entre os dois deixaria um insight com texto cheio de tokens e nenhuma fonte — e
 * `render.ts` mostraria "[número indisponível]" para sempre, num registro que ninguém teria
 * como consertar. O PostgREST não dá transação entre duas tabelas por aqui; o `delete`
 * compensatório é o mais próximo, e ele é seguro porque a linha acabou de nascer.
 */
export async function gravarInsight(
  input: GravarInsightInput,
  client?: Client,
): Promise<InsightGravado | null> {
  const supabase = client ?? (await createClient());

  const { data, error } = await supabase
    .from("ai_insights")
    .insert({
      user_id: input.userId,
      run_id: input.runId,
      modulo: input.modulo,
      tipo: input.insight.tipo,
      prioridade: input.insight.prioridade,
      confianca: input.confianca,
      titulo: input.insight.titulo,
      resumo: input.insight.resumo,
      // ⛔ COM OS TOKENS. Nunca o texto renderizado.
      explicacao: input.insight.explicacao,
      periodo_de: input.periodo.de,
      periodo_ate: input.periodo.ate,
      dedupe_key: input.dedupeKey,
      expires_at: input.expiresAt,
      provider: input.provider,
      model: input.model,
      prompt_version: input.promptVersion,
    })
    .select("id")
    .single();

  if (error || !data) return null;

  const fontes = fontesCitadas(input.indicadores, input.citados);
  if (fontes.length > 0) {
    const { error: erroFontes } = await supabase.from("ai_insight_sources").insert(
      fontes.map((i, ordem) => ({
        user_id: input.userId,
        insight_id: data.id,
        indicador_id: i.id,
        rotulo: i.rotulo,
        valor: i.valor,
        indisponivel_porque: i.indisponivel_porque ?? null,
        unidade: i.unidade,
        qualidade: i.qualidade,
        motivo_incompleto: i.motivo_incompleto ?? null,
        periodo_de: i.periodo.de,
        periodo_ate: i.periodo.ate,
        n: i.n,
        regra_de_contagem: i.regra_de_contagem ?? null,
        rota: i.rota,
        ordem,
      })),
    );

    if (erroFontes) {
      await supabase.from("ai_insights").delete().eq("id", data.id).eq("user_id", input.userId);
      return null;
    }
  }

  return { id: data.id, dedupeKey: input.dedupeKey };
}

/** Uma decisão do dono. Append-only: nunca `update`, nunca `delete`. */
export async function registrarFeedback(input: {
  readonly userId: string;
  readonly insightId: string;
  readonly decisao: "util" | "inutil" | "dispensado" | "adiado" | "nao_mostrar";
  readonly adiadoAte?: string | null;
}): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("ai_insight_feedback").insert({
    user_id: input.userId,
    insight_id: input.insightId,
    decisao: input.decisao,
    adiado_ate: input.adiadoAte ?? null,
  });
  return !error;
}
