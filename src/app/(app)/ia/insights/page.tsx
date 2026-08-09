import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Info } from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { InsightsClient } from "@/components/ai/insights-client";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAiPreferences } from "@/lib/ai/queries";
import { getInsights } from "@/lib/ai/server/insight-queries";
import { AVISO_DOS_INSIGHTS } from "@/lib/ai/constants";
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
  const [insights, prefs] = await Promise.all([
    getInsights(agora),
    getAiPreferences(user.id),
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
    </div>
  );
}
