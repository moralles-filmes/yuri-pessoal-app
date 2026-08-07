import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatClient } from "@/components/ai/chat-client";
import { getCurrentUser } from "@/lib/supabase/server";
import { getConversation, getRouterConfigs, getRunSources } from "@/lib/ai/queries";
import { usableProviders } from "@/lib/ai/core/router";
import { formatUsdOrUnavailable } from "@/lib/ai/constants";
import { cryptoProblemMessage } from "@/lib/ai/server/crypto-readiness";
import { reconcileOwnRuns } from "@/lib/ai/server/reconcile";

export const dynamic = "force-dynamic";

/**
 * Fase 18-A — IA · Uma conversa.
 *
 * Recarregar esta página no meio do streaming NÃO perde nada: a mensagem do assistente
 * existe no banco desde a admissão e o servidor grava o parcial periodicamente.
 *
 * ⚠️ No Next 16 `params` é uma Promise — sempre `await`.
 */
export default async function ConversaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await reconcileOwnRuns();

  const [detalhe, configs] = await Promise.all([
    getConversation(user.id, id),
    getRouterConfigs(user.id),
  ]);

  if (!detalhe) notFound();

  // A trilha de leitura de cada execução da conversa. UMA consulta para todas as execuções —
  // uma por run seria N+1 na tela que mais tem runs.
  const fontes = await getRunSources(user.id, Object.keys(detalhe.runs));

  const problemaCripto = cryptoProblemMessage();
  const prontos = usableProviders(configs);
  const arquivada = detalhe.conversation.status === "arquivada";

  const motivoBloqueio =
    problemaCripto ??
    (arquivada
      ? "Esta conversa está arquivada. Reative-a na lista de conversas para continuar."
      : prontos.length === 0
        ? "Nenhum provedor de IA está configurado e ativo. Cadastre uma chave em Configurações."
        : null);

  // O custo de cada execução da conversa. `null` continua sendo `null` — nunca zero.
  const execucoes = Object.values(detalhe.runs);
  const totalConhecido = execucoes
    .map((r) => r.costUsd)
    .filter((c): c is number => c !== null)
    .reduce((a, b) => a + b, 0);
  const semCusto = execucoes.filter((r) => r.costUsd === null).length;

  return (
    <div className="space-y-4">
      <PageHeader
        title={detalhe.conversation.title ?? "Conversa"}
        description={`${execucoes.length} ${execucoes.length === 1 ? "execução" : "execuções"} · ${formatUsdOrUnavailable(execucoes.length === 0 ? null : totalConhecido)}${
          semCusto > 0
            ? ` · ${semCusto} sem custo informado pelo provedor`
            : ""
        }`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {arquivada && <Badge variant="outline">arquivada</Badge>}
          <Button asChild variant="outline" size="sm">
            <Link href="/ia/conversas">
              <ArrowLeft className="size-4" /> Voltar
            </Link>
          </Button>
        </div>
      </PageHeader>

      <ChatClient
        conversationId={detalhe.conversation.id}
        initialMessages={detalhe.messages}
        runs={detalhe.runs}
        sources={fontes}
        podeConversar={motivoBloqueio === null}
        motivoBloqueio={motivoBloqueio}
      />
    </div>
  );
}
