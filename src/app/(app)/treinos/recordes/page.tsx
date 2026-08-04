import type { Metadata } from "next";
import { getPersonalRecords } from "@/lib/training/history-queries";
import { getTrainingPreferences } from "@/lib/training/queries";
import { RecordsClient } from "./records-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Recordes · Treinos" };

/**
 * Fase 17-D — Recordes pessoais consolidados.
 *
 * A tabela guarda o MELHOR de cada chave `(exercício, tipo de recorde)` e preserva a marca
 * anterior. Empate não gera recorde novo — por isso a lista não tem duplicidade.
 */
export default async function RecordesPage({
  searchParams,
}: {
  // 17-F — `?recorde=<id>` vem da busca global e da notificação de nova marca.
  searchParams: Promise<{ recorde?: string }>;
}) {
  const [{ recorde }, records, preferences] = await Promise.all([
    searchParams,
    getPersonalRecords(),
    getTrainingPreferences(),
  ]);

  return (
    <RecordsClient
      records={records}
      oneRmFormula={preferences.oneRmFormula}
      highlightId={recorde ?? null}
    />
  );
}
