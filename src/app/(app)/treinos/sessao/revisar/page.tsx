import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import { getSession, getSessionEvents } from "@/lib/training/session-queries";
import { SessionReviewClient } from "@/components/training/session/session-review-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Revisar treino · Treinos" };

/**
 * Fase 17-C — Revisão e finalização.
 *
 * ⛔ Como toda tela de sessão, o resumo sai do SNAPSHOT + das linhas da execução. Editar o
 * treino-modelo depois não muda nem uma linha do que aparece aqui.
 *
 * **Nada é encerrado em silêncio:** finalizar mostra o resumo completo antes; descartar exige
 * confirmação reforçada; e sair sem decidir deixa a sessão em andamento, e não pela metade.
 */
export default async function RevisarPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const { id } = await searchParams;
  if (!id) redirect(`${TRAINING_BASE_PATH}/sessao`);

  const session = await getSession(id);
  if (!session) {
    return (
      <div className="space-y-5">
        <PageHeader title="Revisar treino" />
        <EmptyState
          icon={Dumbbell}
          title="Treino não encontrado"
          description="Esta sessão não existe mais ou foi descartada."
        >
          <Button asChild>
            <Link href={`${TRAINING_BASE_PATH}/hoje`}>Voltar para o treino de hoje</Link>
          </Button>
        </EmptyState>
      </div>
    );
  }

  const events = await getSessionEvents(session.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title={session.status === "concluida" ? "Treino concluído" : "Revisar e finalizar"}
        description={
          session.status === "concluida"
            ? "Resumo do que foi registrado. O histórico navegável chega na Subfase 17-D."
            : "Confira o resumo, avalie o treino e salve. Nada é encerrado em silêncio."
        }
      />
      <SessionReviewClient session={session} events={events} />
    </div>
  );
}
