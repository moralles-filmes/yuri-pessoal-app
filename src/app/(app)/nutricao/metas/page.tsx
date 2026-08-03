import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hojeISO } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  ensureMealTypes,
  getGoalPeriods,
  getMealTypes,
  getNutritionProfile,
} from "@/lib/nutrition/diary-queries";
import { getNutrientDefinitions, indexNutrients } from "@/lib/nutrition/queries";
import { GoalsClient } from "./goals-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Metas nutricionais · Dieta" };

/**
 * Fase 16-B — Metas nutricionais.
 *
 * `hoje` é resolvido no servidor, em Brasília, e desce como prop: é ele que decide qual
 * período está vigente. Calcular no cliente faria a meta "virar" às 21h para quem estivesse
 * com o aparelho em outro fuso.
 */
export default async function MetasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await ensureMealTypes(user.id);

  const [periods, mealTypes, nutrientList, profile] = await Promise.all([
    getGoalPeriods(),
    getMealTypes(),
    getNutrientDefinitions(),
    getNutritionProfile(),
  ]);

  return (
    <GoalsClient
      hoje={hojeISO()}
      periods={periods}
      mealTypes={mealTypes}
      nutrients={indexNutrients(nutrientList)}
      nutrientList={nutrientList}
      profile={profile}
    />
  );
}
