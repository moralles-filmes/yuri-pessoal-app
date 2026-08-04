import type { Metadata } from "next";
import { hojeISO } from "@/lib/format";
import { getTrainingPreferences } from "@/lib/training/queries";
import { getPrograms, getScheduledWorkouts, getWorkouts } from "@/lib/training/routine-queries";
import {
  addDaysIso,
  endOfMonthIso,
  isDateIso,
  startOfMonthIso,
  startOfWeekIso,
} from "@/lib/training/schedule";
import { CalendarClient } from "./calendar-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Calendário · Treinos" };

/**
 * Fase 17-B — Calendário de planejamento.
 *
 * Next.js 16: `searchParams` é uma Promise. `hoje` sai de `hojeISO()` (Brasília) no SERVIDOR e
 * desce como parâmetro — o cliente nunca decide que dia é hoje pelo relógio do aparelho, que é
 * de onde vem todo bug de "o treino de hoje aparece como atrasado".
 */
export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<{ visao?: string; data?: string; programa?: string }>;
}) {
  const params = await searchParams;
  const hoje = hojeISO();

  const view = params.visao === "mes" ? "mes" : params.visao === "lista" ? "lista" : "semana";
  const reference = isDateIso(params.data) ? params.data : hoje;

  const preferences = await getTrainingPreferences();
  const weekStartsOn = preferences.weekStartsOn;

  // Carrega uma janela generosa: a visão de mês precisa das semanas vizinhas, e a lista fica
  // útil olhando algumas semanas para trás e para a frente.
  const { from, to } =
    view === "mes"
      ? {
          from: addDaysIso(startOfMonthIso(reference), -7),
          to: addDaysIso(endOfMonthIso(reference), 7),
        }
      : view === "lista"
        ? { from: addDaysIso(reference, -60), to: addDaysIso(reference, 60) }
        : {
            from: addDaysIso(startOfWeekIso(reference, weekStartsOn), -7),
            to: addDaysIso(startOfWeekIso(reference, weekStartsOn), 13),
          };

  const [entries, workouts, programs] = await Promise.all([
    getScheduledWorkouts(from, to),
    getWorkouts(),
    getPrograms(),
  ]);

  return (
    <CalendarClient
      entries={entries}
      workouts={workouts}
      programs={programs}
      hoje={hoje}
      reference={reference}
      view={view}
      weekStartsOn={weekStartsOn}
    />
  );
}
