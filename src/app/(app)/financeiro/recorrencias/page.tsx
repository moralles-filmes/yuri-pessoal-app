import {
  getAccounts,
  getCategories,
  getCreditCards,
  getRecurrences,
} from "@/lib/finance/queries";
import { RecurringClient } from "./recurring-client";

export const dynamic = "force-dynamic";

export default async function RecorrenciasPage() {
  const [recurrences, accounts, categories, cards] = await Promise.all([
    getRecurrences(),
    getAccounts(),
    getCategories(),
    getCreditCards(),
  ]);

  return (
    <RecurringClient
      recurrences={recurrences}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      cards={cards.map((c) => ({ id: c.id, name: c.nome, ativo: c.ativo }))}
    />
  );
}
