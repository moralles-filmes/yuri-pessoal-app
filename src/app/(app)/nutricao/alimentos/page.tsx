import type { Metadata } from "next";
import {
  getFoodCategories,
  getFoodSources,
  getFoodTags,
  getFoods,
  getNutrientDefinitions,
  indexNutrients,
} from "@/lib/nutrition/queries";
import { FoodsClient } from "./foods-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Alimentos · Dieta" };

/**
 * Fase 16-A — Catálogo de alimentos.
 *
 * Server Component: uma leitura ampla por entidade e o cruzamento em memória (padrão do
 * projeto). Os filtros rodam no cliente sobre a lista já carregada, então a busca responde
 * enquanto o usuário digita, sem ida ao servidor a cada tecla.
 */
export default async function AlimentosPage() {
  const [foods, categories, sources, tags, nutrientList] = await Promise.all([
    getFoods(),
    getFoodCategories(),
    getFoodSources(),
    getFoodTags(),
    getNutrientDefinitions(),
  ]);

  return (
    <FoodsClient
      foods={foods}
      categories={categories}
      sources={sources}
      tags={tags}
      nutrientList={nutrientList}
      nutrients={indexNutrients(nutrientList)}
    />
  );
}
