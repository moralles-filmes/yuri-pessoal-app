"use server";

import { authContext } from "@/lib/actions/helpers";
import { searchAll } from "@/lib/search/queries";
import type { SearchGroup } from "@/lib/search/types";

/** Busca global (Server Action usada como RPC pelo command palette do header). */
export async function globalSearch(query: string): Promise<SearchGroup[]> {
  const ctx = await authContext();
  if (!ctx) return [];
  return searchAll(query);
}
