import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChatClient } from "@/components/ai/chat-client";
import { VazioDaConversa } from "@/components/ai/vazio-da-conversa";
import { getCurrentUser } from "@/lib/supabase/server";
import { getConversation, getRunSources } from "@/lib/ai/queries";
import { prontidaoDoChat } from "@/lib/ai/server/chat-readiness";
import { formatUsdOrUnavailable } from "@/lib/ai/constants";
import { reconcileOwnRuns } from "@/lib/ai/server/reconcile";
import { AI_LINK_BASE, conversationsLink } from "@/lib/search/ai-links";

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

  const [detalhe, prontidao] = await Promise.all([
    getConversation(user.id, id),
    prontidaoDoChat(user.id),
  ]);

  if (!detalhe) notFound();

  // A trilha de leitura de cada execução da conversa. UMA consulta para todas as execuções —
  // uma por run seria N+1 na tela que mais tem runs.
  const fontes = await getRunSources(user.id, Object.keys(detalhe.runs));

  const arquivada = detalhe.conversation.status === "arquivada";
  const motivoBloqueio = arquivada
    ? "Esta conversa está arquivada. Reative-a na lista de conversas para continuar."
    : prontidao.motivoBloqueio;

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
          <Button asChild variant="ghost" size="icon">
            <Link href={AI_LINK_BASE} aria-label="Nova conversa"><Plus className="size-4" /></Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={conversationsLink()}>
              <ArrowLeft className="size-4" /> Voltar
            </Link>
          </Button>
        </div>
      </PageHeader>

      <ChatClient
        compacto
        conversationId={detalhe.conversation.id}
        initialMessages={detalhe.messages}
        runs={detalhe.runs}
        sources={fontes}
        podeConversar={motivoBloqueio === null}
        podeCruzarModulos={prontidao.podeCruzarModulos}
        motivoBloqueio={motivoBloqueio}
        vazio={<VazioDaConversa />}
      />
    </div>
  );
}
