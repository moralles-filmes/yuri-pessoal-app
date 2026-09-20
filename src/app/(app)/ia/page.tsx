import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagesSquare, Settings } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ChatClient } from "@/components/ai/chat-client";
import { BudgetAlert } from "@/components/ai/budget-alert";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAiPreferences, getUsageSummary } from "@/lib/ai/queries";
import { RESUMO_DO_ASSISTENTE } from "@/lib/ai/constants";
import { prontidaoDoChat } from "@/lib/ai/server/chat-readiness";
import { reconcileOwnRuns } from "@/lib/ai/server/reconcile";

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
      {/*
        ⚠️ A descrição afirma a REGRA, nunca o ESTADO — mesma disciplina de `AVISO_SEM_ACESSO`
        e do prompt-base `seguranca-v3`. O texto da 18-A ("sem acesso aos seus registros nesta
        versão") era verdade enquanto o Tool Registry estava vazio e virou mentira quando as
        leituras de Treinos entraram nele. O texto de agora vale com as chaves ligadas ou
        desligadas, porque fala do que o sistema NÃO FAZ SEM AUTORIZAÇÃO.
      */}
      <PageHeader title="Conversar" description={RESUMO_DO_ASSISTENTE}>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/ia/conversas">
              <MessagesSquare className="size-4" /> Conversas
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/ia/configuracoes">
              <Settings className="size-4" /> Configurações
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
        motivoBloqueio={prontidao.motivoBloqueio}
      />
    </div>
  );
}
