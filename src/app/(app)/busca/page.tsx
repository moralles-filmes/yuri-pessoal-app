import { searchAll } from "@/lib/search/queries";
import { BuscaClient } from "./busca-client";

export const dynamic = "force-dynamic";

export default async function BuscaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const groups = q.trim().length >= 2 ? await searchAll(q) : [];
  return <BuscaClient initialQuery={q} initialGroups={groups} />;
}
