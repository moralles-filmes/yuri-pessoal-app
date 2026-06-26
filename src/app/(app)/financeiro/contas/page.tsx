import { getAccounts } from "@/lib/finance/queries";
import { AccountsClient } from "./accounts-client";

export const dynamic = "force-dynamic";

export default async function ContasPage() {
  const accounts = await getAccounts();
  return <AccountsClient accounts={accounts} />;
}
