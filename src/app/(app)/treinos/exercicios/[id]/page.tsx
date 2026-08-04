import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExercises, getTrainingPreferences } from "@/lib/training/queries";
import {
  exerciseSessionsToMetric,
  getExerciseSessions,
  getPersonalRecords,
} from "@/lib/training/history-queries";
import { ExerciseHistoryClient } from "./exercise-history-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Exercício · Treinos" };

/**
 * Fase 17-D — Histórico de um exercício.
 *
 * O CABEÇALHO usa o nome atual do catálogo (é a página daquele exercício). O HISTÓRICO usa os
 * nomes congelados de cada sessão: renomear o exercício muda o título, e não muda uma linha do
 * que já aconteceu.
 */
export default async function ExercicioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const [exercises, entries, records, preferences] = await Promise.all([
    getExercises(),
    getExerciseSessions(id),
    getPersonalRecords(),
    getTrainingPreferences(),
  ]);

  const exercise = exercises.find((item) => item.id === id);
  if (!exercise) notFound();

  return (
    <ExerciseHistoryClient
      exercise={exercise}
      entries={entries}
      sessions={exerciseSessionsToMetric(entries)}
      records={records.filter((record) => record.exerciseId === id)}
      preferences={{
        includeWarmup: preferences.countWarmupInVolume,
        unilateralRule: preferences.unilateralVolumeRule,
        oneRmFormula: preferences.oneRmFormula,
      }}
    />
  );
}
