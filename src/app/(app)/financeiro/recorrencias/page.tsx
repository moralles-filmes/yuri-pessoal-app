import {
  getAccounts,
  getCategories,
  getCreditCards,
  getRecurrences,
  getSubcategories,
} from "@/lib/finance/queries";
import { RecurringClient } from "./recurring-client";

export const dynamic = "force-dynamic";

export default async function RecorrenciasPage() {
  const [recurrences, accounts, categories, subcategories, cards] = await Promise.all([
    getRecurrences(),
    getAccounts(),
    getCategories(),
    getSubcategories(),
    getCreditCards(),
  ]);

  return (
    <RecurringClient
      recurrences={recurrences}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind }))}
      // A inativa continua quando já está numa recorrência — senão a edição perderia o rótulo.
      subcategories={subcategories
        .filter((s) => s.is_active || recurrences.some((r) => r.subcategory_id === s.id))
        .map((s) => ({ id: s.id, name: s.name, category_id: s.category_id }))}
      cards={cards.map((c) => ({ id: c.id, name: c.nome, ativo: c.ativo }))}
    />
  );
}
