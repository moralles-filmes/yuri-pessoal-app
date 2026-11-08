import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagesSquare, Settings } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ChatClient } from "@/components/ai/chat-client";
import { VazioDaConversa } from "@/components/ai/vazio-da-conversa";
import { BudgetAlert } from "@/components/ai/budget-alert";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAiPreferences, getUsageSummary } from "@/lib/ai/queries";
import { prontidaoDoChat } from "@/lib/ai/server/chat-readiness";
import { reconcileOwnRuns } from "@/lib/ai/server/reconcile";
import { conversationsLink, settingsLink } from "@/lib/search/ai-links";

export const dynamic = "force-dynamic";

/**
 * Fase 18-A — IA · Conversar.
 *
 * Abrir esta página é um dos GATILHOS da reconciliação preguiçosa (a primária): um run
 * travado de uma sessão anterior é fechado aqui, e a reserva dele deixa de comprometer o
 * orçamento antes mesmo de o usuário digitar a primeira letra.
 */
export default async function IaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await reconcileOwnRuns();

  /**
   * 18-F Bloco 2 — a frase de bloqueio sai de `prontidaoDoChat`, não daqui.
   *
   * Ela era calculada nesta página, que até o Bloco 2 era o único caminho para o chat. Agora
   * o painel flutuante é o outro, e duas cópias divergiriam na primeira edição.
   */
  const [prontidao, prefs] = await Promise.all([
    prontidaoDoChat(user.id),
    getAiPreferences(user.id),
  ]);

  const agora = new Date();
  const [usoDia, usoMes] = await Promise.all([
    getUsageSummary(user.id, "dia", prefs.dailyBudget, agora),
    getUsageSummary(user.id, "mes", prefs.monthlyBudget, agora),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader title="Assistente">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost" size="icon">
            <Link href={conversationsLink()} aria-label="Conversas">
              <MessagesSquare className="size-4" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon">
            <Link href={settingsLink()} aria-label="Configurações">
              <Settings className="size-4" />
            </Link>
          </Button>
        </div>
      </PageHeader>

      <BudgetAlert
        dia={usoDia}
        mes={usoMes}
        nivelJaRegistrado={prefs.budgetAlertLevelReached}
      />

      <ChatClient
        conversationId={null}
        initialMessages={[]}
        runs={{}}
        podeConversar={prontidao.podeConversar}
        podeCruzarModulos={prontidao.podeCruzarModulos}
        motivoBloqueio={prontidao.motivoBloqueio}
        vazio={<VazioDaConversa />}
      />
    </div>
  );
}
