import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { getAllMeasuresByFood } from "@/lib/nutrition/diary-queries";
import { getRecipeCategories, getRecipesWithTotals } from "@/lib/nutrition/recipe-queries";
import { getFoods, getNutrientDefinitions, indexNutrients } from "@/lib/nutrition/queries";
import { RecipesClient } from "./recipes-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Receitas · Dieta" };

/**
 * Fase 16-C — Receitas.
 *
 * Server Component. O TOTAL DE CADA RECEITA É CALCULADO AQUI, no servidor, a partir dos
 * ingredientes e do catálogo atual (`getRecipesWithTotals`). O cliente recebe o resultado e
 * apenas o escala para "por porção" e "por 100 g" — nenhuma tabela de nutrientes desce para o
 * navegador, e nenhum total nasce lá.
 */
export default async function ReceitasPage({
  searchParams,
}: {
  // `?receita=<id>` é o deep-link da busca global (16-F).
  searchParams: Promise<{ receita?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { receita } = await searchParams;

  const [recipes, categories, foods, nutrientList, measuresByFood] = await Promise.all([
    getRecipesWithTotals(),
    getRecipeCategories(),
    getFoods(),
    getNutrientDefinitions(),
    getAllMeasuresByFood(),
  ]);

  return (
    <RecipesClient
      recipes={recipes}
      categories={categories}
      foods={foods}
      measures={[...measuresByFood.entries()]}
      nutrients={indexNutrients(nutrientList)}
      // Só abre se a receita existir E for do usuário — a lista já veio filtrada pela RLS,
      // então um id de terceiro simplesmente não casa e a tela abre normal.
      initialDetailId={recipes.some((r) => r.id === receita) ? (receita ?? null) : null}
    />
  );
}
