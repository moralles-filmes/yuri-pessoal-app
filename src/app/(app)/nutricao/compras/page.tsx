import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hojeISO } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { getFoods } from "@/lib/nutrition/queries";
import { getRecipes } from "@/lib/nutrition/recipe-queries";
import { getShoppingPackage } from "@/lib/nutrition/shopping-queries";
import { ShoppingClient } from "./shopping-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Lista de compras · Dieta" };

/**
 * Fase 16-D — Lista de compras e despensa.
 *
 * Server Component: lê tudo numa passada (`getShoppingPackage` também semeia os corredores de
 * mercado na primeira visita) e entrega ao cliente. A consolidação NÃO acontece aqui — ela é
 * feita pela action de geração, no servidor, com o planejamento e o catálogo reais.
 *
 * `hoje` vem do servidor (`hojeISO()`, Brasília): nenhuma função pura do módulo chama
 * `Date.now()`, e a data do "gerar a semana" precisa ser a do fuso do usuário, não a do
 * aparelho dele.
 */
export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; lista?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;

  const [pkg, foods, recipes] = await Promise.all([
    getShoppingPackage(user.id),
    getFoods(),
    getRecipes(),
  ]);

  return (
    <ShoppingClient
      hoje={hojeISO()}
      lists={pkg.lists}
      categories={pkg.categories}
      pantry={pkg.pantry}
      foods={foods}
      recipes={recipes.map((recipe) => ({ id: recipe.id, name: recipe.name }))}
      aba={params.aba === "despensa" ? "despensa" : "lista"}
      listaId={params.lista ?? null}
    />
  );
}
