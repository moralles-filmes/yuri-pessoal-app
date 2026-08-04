import type { Metadata } from "next";
import { getGoalsOverview } from "@/lib/training/goal-queries";
import { GoalsClient } from "./goals-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Metas · Treinos" };

/**
 * Fase 17-E — Metas de treino.
 *
 * Server Component. Três cuidados:
 *
 * • `hoje` é resolvido no SERVIDOR, em Brasília (`hojeISO` dentro de `getGoalsOverview`), e
 *   desce como prop: o status derivado (atingida, expirada, atrás do ritmo) não pode depender
 *   do relógio do aparelho do usuário.
 * • O valor atual de cada meta sai de `metrics.ts` (17-D) e do módulo central `body_*` (16-E).
 *   Esta tela não recalcula nada.
 * • As medidas corporais são as MESMAS do módulo Dieta — não existe segunda tabela de peso.
 */
export default async function MetasPage() {
  const overview = await getGoalsOverview();

  return (
    <GoalsClient
      goals={overview.goals}
      hoje={overview.hoje}
      exercises={overview.exercises}
      muscleGroups={overview.muscleGroups}
      programs={overview.programs}
      measurementTypes={overview.measurementTypes}
    />
  );
}
