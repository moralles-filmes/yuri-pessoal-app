import type { Metadata } from "next";
import { getRoutinesWithToday } from "@/lib/tasks/queries";
import { hojeISO } from "@/lib/format";
import { RoutinesClient } from "./routines-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rotinas" };

export default async function RotinasPage() {
  const todayIso = hojeISO();
  const routines = await getRoutinesWithToday(todayIso);

  return <RoutinesClient routines={routines} todayIso={todayIso} />;
}
