import type { Metadata } from "next";
import {
  getEquipment,
  getExerciseAlternatives,
  getExercises,
  getMuscleGroups,
} from "@/lib/training/queries";
import { ExercisesClient } from "./exercises-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Exercícios · Treinos" };

/**
 * Fase 17-A — Catálogo de exercícios.
 *
 * Server Component: uma leitura ampla por entidade e o cruzamento em memória (padrão do
 * projeto). Os filtros rodam no cliente sobre a lista já carregada, então a busca responde
 * enquanto o usuário digita, sem ida ao servidor a cada tecla.
 */
export default async function ExerciciosPage() {
  const [exercises, groups, equipment, alternatives] = await Promise.all([
    getExercises(),
    getMuscleGroups(),
    getEquipment(),
    getExerciseAlternatives(),
  ]);

  return (
    <ExercisesClient
      exercises={exercises}
      groups={groups}
      equipment={equipment}
      alternatives={alternatives}
    />
  );
}
