import type { Metadata } from "next";
import { getHabitsDashboard } from "@/lib/habits/queries";
import { getTrainingPreferences } from "@/lib/training/queries";
import { HABIT_VIEWS, type HabitView } from "@/lib/habits/constants";
import { hojeISO } from "@/lib/format";
import { HabitsClient } from "./habits-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Hábitos" };

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function HabitosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const sp = await searchParams;
  const viewRaw = first(sp.view);
  const view: HabitView = (HABIT_VIEWS as readonly string[]).includes(
    viewRaw ?? "",
  )
    ? (viewRaw as HabitView)
    : "hoje";

  const todayIso = hojeISO();
  // 07-B · D1 — qual hábito REFLETE os treinos (17-F). Só leitura: sem linha de preferências,
  // `getTrainingPreferences` devolve o padrão (`habitId: null`) e não cria nada.
  const [dashboard, treinos] = await Promise.all([
    getHabitsDashboard(todayIso),
    getTrainingPreferences(),
  ]);

  return (
    <HabitsClient
      dashboard={dashboard}
      view={view}
      todayIso={todayIso}
      habitoVinculadoId={treinos.habitId}
    />
  );
}
