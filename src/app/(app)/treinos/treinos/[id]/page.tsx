import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getExercises, getMuscleGroups, getTrainingPreferences } from "@/lib/training/queries";
import { getPrograms, getWorkouts } from "@/lib/training/routine-queries";
import { WorkoutBuilderClient } from "./builder-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Construtor de treino · Treinos" };

/**
 * Fase 17-B — Construtor de um treino-modelo.
 *
 * Next.js 16: `params` é uma Promise e precisa de `await`.
 */
export default async function TreinoBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [workouts, programs, catalog, groups, preferences] = await Promise.all([
    getWorkouts(),
    getPrograms(),
    getExercises(),
    getMuscleGroups(),
    getTrainingPreferences(),
  ]);

  const workout = workouts.find((item) => item.id === id);
  if (!workout) notFound();

  // Todas as versões do mesmo treino (mesmo `version_group_id`) — para comparar intenções.
  const versions = workouts.filter((item) => item.versionGroupId === workout.versionGroupId);

  return (
    <WorkoutBuilderClient
      workout={workout}
      versions={versions}
      programs={programs}
      catalog={catalog}
      groups={groups}
      defaultRestSeconds={preferences.defaultRestSeconds}
    />
  );
}
