import {
  getCategoriesEnsureSeed,
  getSubcategories,
} from "@/lib/finance/queries";
import { CategoriesClient } from "./categories-client";

export const dynamic = "force-dynamic";

export default async function CategoriasPage() {
  const [categories, subcategories] = await Promise.all([
    getCategoriesEnsureSeed(),
    getSubcategories(),
  ]);
  return (
    <CategoriesClient categories={categories} subcategories={subcategories} />
  );
}
