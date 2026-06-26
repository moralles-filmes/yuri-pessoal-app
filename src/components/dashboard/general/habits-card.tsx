import { getHabitsCardData } from "@/lib/dashboard/queries";
import { periodWord, type DashWindow } from "@/lib/dashboard/period";
import { HabitsCardBody } from "./habits-card-body";

/** Server wrapper do card Hábitos: lê os dados e entrega ao corpo interativo (check-in). */
export async function HabitsCard({
  window,
  todayIso,
}: {
  window: DashWindow;
  todayIso: string;
}) {
  const data = await getHabitsCardData(todayIso, window);
  return (
    <HabitsCardBody data={data} todayIso={todayIso} periodLabel={periodWord(window.period)} />
  );
}
