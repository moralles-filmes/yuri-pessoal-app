import type { Metadata } from "next";
import { hojeISO } from "@/lib/format";
import { getTrainingPreferences } from "@/lib/training/queries";
import { getPrograms, getWorkouts } from "@/lib/training/routine-queries";
import { WorkoutsClient } from "./workouts-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Treinos · Treinos" };

/** Fase 17-B — Lista de treinos-modelo. */
export default async function TreinosModeloPage() {
  const [workouts, programs, preferences] = await Promise.all([
    getWorkouts(),
    getPrograms(),
    getTrainingPreferences(),
  ]);

  return (
    <WorkoutsClient
      workouts={workouts}
      programs={programs}
      hoje={hojeISO()}
      defaultRestSeconds={preferences.defaultRestSeconds}
    />
  );
}
