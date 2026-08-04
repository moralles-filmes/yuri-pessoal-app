import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagesSquare, Settings } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { ChatClient } from "@/components/ai/chat-client";
import { BudgetAlert } from "@/components/ai/budget-alert";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAiPreferences, getRouterConfigs, getUsageSummary } from "@/lib/ai/queries";
import { usableProviders } from "@/lib/ai/core/router";
import { cryptoProblemMessage } from "@/lib/ai/server/crypto-readiness";
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

  const [configs, prefs] = await Promise.all([
    getRouterConfigs(user.id),
    getAiPreferences(user.id),
  ]);

  const agora = new Date();
  const [usoDia, usoMes] = await Promise.all([
    getUsageSummary(user.id, "dia", prefs.dailyBudget, agora),
    getUsageSummary(user.id, "mes", prefs.monthlyBudget, agora),
  ]);

  const problemaCripto = cryptoProblemMessage();
  const prontos = usableProviders(configs);

  const motivoBloqueio =
    problemaCripto ??
    (prontos.length === 0
      ? "Nenhum provedor de IA está configurado e ativo. Cadastre uma chave em Configurações para começar."
      : null);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Conversar"
        description="Assistente Pessoal. Converse, organize ideias e planeje — sem acesso aos seus registros nesta versão."
      >
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
        podeConversar={motivoBloqueio === null}
        motivoBloqueio={motivoBloqueio}
      />
    </div>
  );
}
