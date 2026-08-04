import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { ConversationList } from "@/components/ai/conversation-list";
import { getCurrentUser } from "@/lib/supabase/server";
import { listConversations } from "@/lib/ai/queries";
import { reconcileOwnRuns } from "@/lib/ai/server/reconcile";

export const metadata: Metadata = { title: "Conversas · IA" };
export const dynamic = "force-dynamic";

/**
 * Fase 18-A — IA · Conversas.
 *
 * Segundo gatilho da reconciliação preguiçosa. Ela roda ANTES da leitura para a lista já
 * sair com os estados corretos — do contrário um run travado apareceria como "em andamento"
 * numa conversa que morreu ontem.
 */
export default async function ConversasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await reconcileOwnRuns();
  const conversas = await listConversations(user.id, true);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Conversas"
        description="Histórico das suas conversas com o assistente. Favoritar, arquivar e excluir."
      />
      <ConversationList conversas={conversas} />
    </div>
  );
}
