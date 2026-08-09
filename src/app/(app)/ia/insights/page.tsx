import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Info } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { InsightsClient } from "@/components/ai/insights-client";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAiPreferences } from "@/lib/ai/queries";
import { getInsights, getUltimaVarredura } from "@/lib/ai/server/insight-queries";
import { AVISO_DOS_INSIGHTS } from "@/lib/ai/constants";
import { dateInSaoPaulo, timeInSaoPaulo } from "@/lib/format";
import type { ModuloDeInsight } from "@/lib/ai/insights/contracts";

export const metadata: Metadata = { title: "Insights · IA" };
export const dynamic = "force-dynamic";

/**
 * Fase 18-E · Bloco 3 — IA · Insights.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ESTA É A ÚNICA PORTA DE GERAÇÃO, E O CARD DO DASHBOARD SÓ EXIBE.                   ║
 * ║                                                                                       ║
 * ║ "O dashboard não chama a IA no carregamento" fica verdadeiro POR CONSTRUÇÃO, e não    ║
 * ║ por uma checagem que alguém pode esquecer: a geração mora em arquivos que o dashboard ║
 * ║ não alcança, e há teste de import provando.                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════════════ O QUE ESTA TELA SE RECUSA A FAZER ═══════════════════════
 *
 *  • NÃO gera nada sozinha. Nenhum insight nasce ao abrir a página — só no clique.
 *  • NÃO oferece um módulo cuja chave `allow_*` está desligada. Oferecer levaria a um erro
 *    que o dono só descobriria depois de pedir.
 *  • NÃO mostra número que não venha de uma linha de `ai_insight_sources`. O texto gravado
 *    guarda tokens; `render.ts` os resolve aqui.
 *  • NÃO esconde o insight expirado: ele sai da lista de vigentes e continua legível, com os
 *    números que tinha. Expirar não apaga.
 */
export default async function InsightsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // O relógio real entra AQUI, na casca. Tudo abaixo recebe `agora`.
  const agora = new Date();
  const [insights, prefs, varredura] = await Promise.all([
    getInsights(agora),
    getAiPreferences(user.id),
    // 18-E Bloco 4 — o que a varredura automática fez da última vez. `null` = nunca rodou.
    getUltimaVarredura(),
  ]);

  /**
   * ⚠️ **A LISTA DE MÓDULOS OFERECIDOS SAI DAS CHAVES DO DONO.** Derivada, não escrita à
   * mão — é a mesma disciplina de `toolsForPermission` na 18-B: uma lista escrita à mão
   * ficaria para trás nos dois sentidos (botão que não liga nada, ou módulo pronto sem botão).
   */
  const disponiveis: ModuloDeInsight[] = [
    ...(prefs.permissions.allow_finance ? (["financeiro"] as const) : []),
    ...(prefs.permissions.allow_training ? (["treinos"] as const) : []),
    ...(prefs.permissions.allow_nutrition ? (["dieta"] as const) : []),
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        title="Insights"
        description="Análises sobre números que o sistema já mediu. Elas só são geradas quando você pede."
      />

      <div className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 text-muted-foreground">{AVISO_DOS_INSIGHTS}</p>
      </div>

      <InsightsClient insights={insights} disponiveis={disponiveis} />

      {/*
        ⛔ 18-E Bloco 4 — O RODAPÉ DA VARREDURA.

        Sem ele, `ai_insight_jobs` seria um registro que ninguém lê, e "job barrado registra o
        motivo sanitizado" valeria só no papel. Ele mostra o desfecho de CADA módulo — inclusive
        os pulados, com o porquê —, porque o que NÃO aconteceu é justamente o que o dono não tem
        como descobrir sozinho.
      */}
      {prefs.allowInsightJobs ? (
        <p className="text-xs text-muted-foreground">
          {varredura === null ? (
            "A análise automática está ligada, mas ainda não rodou nenhuma vez."
          ) : (
            <>
              Última varredura automática:{" "}
              {dateInSaoPaulo(new Date(varredura.executadaEm))} às{" "}
              {timeInSaoPaulo(new Date(varredura.executadaEm))}
              {" — "}
              {varredura.modulos
                .map((m) =>
                  m.motivo ? `${ROTULO[m.modulo]}: ${m.desfecho} (${m.motivo})` : `${ROTULO[m.modulo]}: ${m.desfecho}`,
                )
                .join(" · ")}
            </>
          )}
        </p>
      ) : null}
    </div>
  );
}

/** Os mesmos nomes que o resto da tela usa. */
const ROTULO: Record<ModuloDeInsight, string> = {
  financeiro: "Financeiro",
  treinos: "Treinos",
  dieta: "Dieta",
};
