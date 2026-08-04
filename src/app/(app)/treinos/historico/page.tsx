import type { Metadata } from "next";
import { hojeISO } from "@/lib/format";
import { facetsFromHistory, getSessionHistory } from "@/lib/training/history-queries";
import { getTrainingPreferences } from "@/lib/training/queries";
import { HistoryClient } from "./history-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Histórico · Treinos" };

/**
 * Fase 17-D — Histórico de treinos.
 *
 * Server Component: **uma leitura ampla** (sessões + exercícios + séries do período) e todo o
 * filtro em memória, como no resto do módulo. `hoje` vem do servidor em Brasília (`hojeISO()`)
 * — o cliente nunca decide que dia é hoje pelo relógio do aparelho.
 *
 * ⛔ Tudo que esta tela mostra saiu do SNAPSHOT da sessão. Nenhuma consulta volta ao
 * treino-modelo: renomear um exercício hoje não pode mudar o que aconteceu em março.
 */
export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const flat: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    flat[key] = Array.isArray(value) ? value[0] : value;
  }

  const [history, preferences] = await Promise.all([
    getSessionHistory({ days: 730 }),
    getTrainingPreferences(),
  ]);

  return (
    <HistoryClient
      items={history}
      facets={facetsFromHistory(history)}
      params={flat}
      hoje={hojeISO()}
      preferences={{
        includeWarmup: preferences.countWarmupInVolume,
        unilateralRule: preferences.unilateralVolumeRule,
        weekStartsOn: preferences.weekStartsOn,
      }}
    />
  );
}
