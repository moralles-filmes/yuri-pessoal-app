import type { Metadata } from "next";
import { hojeISO } from "@/lib/format";
import { getPrograms, getWorkouts } from "@/lib/training/routine-queries";
import { ProgramsClient } from "./programs-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Programas · Treinos" };

/**
 * Fase 17-B — Programas de treino.
 *
 * Server Component: leitura ampla + cruzamento em memória (padrão do projeto). `hoje` é
 * calculado NO SERVIDOR, em Brasília (`hojeISO()`), e desce como parâmetro — o cliente nunca
 * decide que dia é hoje pelo relógio do aparelho.
 */
export default async function ProgramasPage() {
  const [programs, workouts] = await Promise.all([getPrograms(), getWorkouts()]);

  return <ProgramsClient programs={programs} workouts={workouts} hoje={hojeISO()} />;
}
