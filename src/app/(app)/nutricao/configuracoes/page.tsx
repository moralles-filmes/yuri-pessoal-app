import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import {
  getFoodCategories,
  getFoodSources,
  getFoodTags,
  getFoods,
  getNutrientValueCount,
  summarizeCatalog,
} from "@/lib/nutrition/queries";
import { ensureMealTypes, getMealTypes } from "@/lib/nutrition/diary-queries";
import { getRecipeCategories } from "@/lib/nutrition/recipe-queries";
import { NutritionSettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurações da dieta · Dieta" };

/**
 * Fase 16-F — Configurações do módulo Dieta e Alimentação.
 *
 * É a casa das três gestões que existiam SEM interface nenhuma: tipos de refeição (16-B),
 * categorias de receita (16-C) e etiquetas de alimento (16-A). As actions estavam prontas e
 * testadas; faltava o gatilho — o mesmo padrão dos corredores de mercado e dos tipos de medida.
 *
 * Também é onde a PROCEDÊNCIA da base aparece por extenso: a licença da TACO exige citação, e
 * enterrar isso num arquivo do repositório não cumpre a exigência para quem usa o sistema.
 */
export default async function NutricaoConfiguracoesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Idempotente: cria os tipos padrão na primeira leitura (mesmo caminho do diário).
  await ensureMealTypes(user.id);

  const [mealTypes, recipeCategories, tags, foods, categories, sources, nutrientValues] =
    await Promise.all([
      getMealTypes(),
      getRecipeCategories(),
      getFoodTags(),
      getFoods(),
      getFoodCategories(),
      getFoodSources(),
      getNutrientValueCount(),
    ]);

  return (
    <NutritionSettingsClient
      mealTypes={mealTypes}
      recipeCategories={recipeCategories}
      tags={tags}
      sources={sources}
      summary={summarizeCatalog(foods, categories, nutrientValues)}
    />
  );
}
