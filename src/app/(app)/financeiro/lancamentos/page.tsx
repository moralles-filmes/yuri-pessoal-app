import {
  getAccounts,
  getCategories,
  getCreditCards,
  getPeopleForSelect,
  getSubcategories,
  getTransactions,
  type TransactionFilters,
} from "@/lib/finance/queries";
import { TransactionsClient } from "./transactions-client";

export const dynamic = "force-dynamic";

function str(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

export default async function LancamentosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const filters: TransactionFilters = {
    type: str(sp.type),
    status: str(sp.status),
    accountId: str(sp.account),
    categoryId: str(sp.category),
    cardId: str(sp.card),
    month: str(sp.month),
  };

  const [transactions, accounts, categories, subcategories, cards, people] =
    await Promise.all([
      getTransactions(filters),
      getAccounts(),
      getCategories(),
      getSubcategories(),
      getCreditCards(),
      getPeopleForSelect(),
    ]);

  return (
    <TransactionsClient
      transactions={transactions}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
      categories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
      }))}
      subcategories={subcategories.map((s) => ({
        id: s.id,
        name: s.name,
        category_id: s.category_id,
      }))}
      cards={cards.map((c) => ({
        id: c.id,
        nome: c.nome,
        dia_fechamento: c.dia_fechamento,
        dia_vencimento: c.dia_vencimento,
      }))}
      people={people}
    />
  );
}
