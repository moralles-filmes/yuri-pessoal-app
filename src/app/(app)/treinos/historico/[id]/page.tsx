import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSession, getSessionEvents } from "@/lib/training/session-queries";
import { getSessionHistory, trainingSessionToMetric } from "@/lib/training/history-queries";
import { getTrainingPreferences } from "@/lib/training/queries";
import { SessionDetailClient } from "./session-detail-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Treino · Histórico" };

/**
 * Fase 17-D — Detalhe de um treino passado.
 *
 * ⛔ **Só o snapshot.** `getSession` (17-C) não tem uma única referência a `training_workouts`:
 * nome do treino, nome do exercício, tipo de acompanhamento, séries previstas e cargas
 * planejadas saem do que foi congelado ao iniciar. Editar ou excluir o modelo depois não muda
 * nada desta tela.
 *
 * As comparações (sessão anterior, melhor sessão, média das últimas quatro) são calculadas em
 * `history.ts` sobre o mesmo histórico congelado.
 */
export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [session, events, history, preferences] = await Promise.all([
    getSession(id),
    getSessionEvents(id),
    getSessionHistory({ days: 730 }),
    getTrainingPreferences(),
  ]);

  if (!session) notFound();

  return (
    <SessionDetailClient
      session={session}
      current={trainingSessionToMetric(session)}
      history={history}
      events={events}
      preferences={{
        includeWarmup: preferences.countWarmupInVolume,
        unilateralRule: preferences.unilateralVolumeRule,
        oneRmFormula: preferences.oneRmFormula,
      }}
    />
  );
}
