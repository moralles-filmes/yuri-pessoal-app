import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckCircle2, Clock, Info, ListChecks, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { ActionHistoryClient } from "@/components/ai/action-history-client";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAiActionHistory } from "@/lib/ai/approval/queries";
import {
  ehFiltroDoHistorico,
  resumirHistorico,
  type FiltroDoHistorico,
} from "@/lib/ai/approval/history";
import { AVISO_DAS_ACOES } from "@/lib/ai/constants";

export const metadata: Metadata = { title: "Ações · IA" };
export const dynamic = "force-dynamic";

/**
 * Fase 18-C · Bloco 5 — IA · Ações realizadas pela IA.
 *
 * ═══════════════════════ O QUE ESTA TELA SE RECUSA A FAZER ═══════════════════════
 *
 *  • NÃO afirma que uma execução `executando` deu certo, nem que falhou. Ela reservou a vaga
 *    e não registrou o desfecho (claim-first do Bloco 3) — a tela diz isso com todas as
 *    letras e manda conferir no módulo, que é a única fonte que sabe.
 *  • NÃO esconde uma execução cuja conversa foi apagada. `ai_action_executions` não tem FK
 *    para a proposta exatamente para sobreviver a isso (invariante 38); omitir a linha aqui
 *    desfaria a decisão inteira, e a omissão seria invisível.
 *  • NÃO esconde o botão de desfazer sem dizer por quê (§3.7). Quando o command não declara
 *    inverso, a explicação vem do próprio descriptor.
 *  • NÃO vai buscar o registro atual no módulo para "enriquecer" a linha. O que se mostra é o
 *    que a ação FEZ, não o estado de agora.
 *
 * ⚠️ `searchParams` é Promise no Next 16.
 */
export default async function AcoesPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { filtro: bruto } = await searchParams;
  const filtro: FiltroDoHistorico = ehFiltroDoHistorico(bruto) ? bruto : "todas";

  // O relógio real entra AQUI, na casca — como em toda a 18-C. A derivação recebe `agora`.
  const historico = await getAiActionHistory(user.id, new Date());
  const resumo = resumirHistorico(historico.linhas);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Ações"
        description="O que o assistente preparou, o que você decidiu e o que foi aplicado nos seus módulos."
      />

      <div className="flex items-start gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="min-w-0 text-muted-foreground">{AVISO_DAS_ACOES}</p>
      </div>

      <div className="grid gap-4 @container sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Preparadas" value={String(resumo.total)} icon={ListChecks} />
        <StatCard label="Aplicadas" value={String(resumo.aplicadas)} icon={CheckCircle2} />
        <StatCard label="Aguardando você" value={String(resumo.aguardando)} icon={Clock} />
        <StatCard
          label="Precisam de atenção"
          value={String(resumo.problemas)}
          icon={TriangleAlert}
          hint={
            resumo.semDesfecho > 0
              ? `${resumo.semDesfecho} sem desfecho registrado`
              : "falhas e execuções sem desfecho"
          }
        />
      </div>

      <ActionHistoryClient
        linhas={historico.linhas}
        filtro={filtro}
        teto={historico.teto}
        saturado={historico.saturado}
      />
    </div>
  );
}
