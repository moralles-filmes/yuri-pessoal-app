import { getAccounts, getBills, getCategories } from "@/lib/finance/queries";
import { BillsClient } from "./bills-client";

export const dynamic = "force-dynamic";

export default async function ContasFixasPage() {
  const [bills, categories, accounts] = await Promise.all([
    getBills(),
    getCategories(),
    getAccounts(),
  ]);

  return (
    <BillsClient
      bills={bills}
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
    />
  );
}
