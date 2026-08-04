import type { Metadata } from "next";
import {
  getFoodCategories,
  getFoodDetail,
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
export default async function AlimentosPage({
  searchParams,
}: {
  // `?alimento=<id>` é o deep-link da busca global (16-F).
  searchParams: Promise<{ alimento?: string }>;
}) {
  const { alimento } = await searchParams;

  const [foods, categories, sources, tags, nutrientList, initialDetail] = await Promise.all([
    getFoods(),
    getFoodCategories(),
    getFoodSources(),
    getFoodTags(),
    getNutrientDefinitions(),
    // A RLS decide: id inexistente ou de outro usuário devolve `null` e a tela abre normal.
    alimento ? getFoodDetail(alimento) : Promise.resolve(null),
  ]);

  return (
    <FoodsClient
      foods={foods}
      categories={categories}
      sources={sources}
      tags={tags}
      nutrientList={nutrientList}
      nutrients={indexNutrients(nutrientList)}
      initialDetail={initialDetail}
    />
  );
}
