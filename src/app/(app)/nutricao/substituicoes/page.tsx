import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hojeISO } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAllMeasuresByFood } from "@/lib/nutrition/diary-queries";
import {
  getMealTemplates,
  getRecipes,
  getSubstitutionGroupsWithTotals,
  getSubstitutionLogs,
} from "@/lib/nutrition/recipe-queries";
import { getFoods, getNutrientDefinitions, indexNutrients } from "@/lib/nutrition/queries";
import { SubstitutionsClient } from "./substitutions-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Substituições · Dieta" };

/**
 * Fase 16-C — Substituições.
 *
 * Os totais do original e de cada alternativa são calculados no SERVIDOR
 * (`getSubstitutionGroupsWithTotals`): a comparação precisa dos dois lados em números, e o
 * navegador não tem a tabela de nutrientes.
 */
export default async function SubstituicoesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [groups, logs, foods, recipes, templates, nutrientList, measuresByFood] =
    await Promise.all([
      getSubstitutionGroupsWithTotals(),
      getSubstitutionLogs(),
      getFoods(),
      getRecipes(),
      getMealTemplates(),
      getNutrientDefinitions(),
      getAllMeasuresByFood(),
    ]);

  return (
    <SubstitutionsClient
      hoje={hojeISO()}
      groups={groups}
      logs={logs}
      foods={foods}
      recipes={recipes.map((recipe) => ({ id: recipe.id, name: recipe.name }))}
      templates={templates.map((template) => ({ id: template.id, name: template.name }))}
      measures={[...measuresByFood.entries()]}
      nutrients={indexNutrients(nutrientList)}
    />
  );
}
