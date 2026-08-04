import type { Metadata } from "next";
import { hojeISO } from "@/lib/format";
import { getMeasurementTypes, getMeasurements } from "@/lib/body/queries";
import { getPersonalRecords, getSessionHistory } from "@/lib/training/history-queries";
import { getScheduledWorkouts } from "@/lib/training/routine-queries";
import { getTrainingPreferences } from "@/lib/training/queries";
import { addDaysIso } from "@/lib/training/schedule";
import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Relatórios · Treinos" };

/**
 * Fase 17-E — Relatórios por período.
 *
 * Server Component: uma leitura ampla por entidade e o recorte em memória, no cliente, a cada
 * troca de filtro — sem ida ao servidor por clique.
 *
 * ⛔ Todo número exibido aqui sai de `metrics.ts` (17-D) por meio de `reports.ts`. O relatório
 * não recalcula volume, séries nem frequência: se recalculasse, discordaria do histórico.
 *
 * As medidas corporais vêm do MÓDULO CENTRAL `body_*` (16-E) — as mesmas do módulo Dieta.
 */
export default async function RelatoriosPage() {
  const hoje = hojeISO();
  // Dois anos cobrem a visão anual e a comparação com o ano anterior.
  const from = addDaysIso(hoje, -730);

  const [history, scheduled, records, measurements, measurementTypes, preferences] =
    await Promise.all([
      getSessionHistory({ from, to: hoje }),
      getScheduledWorkouts(from, addDaysIso(hoje, 60)),
      getPersonalRecords(),
      getMeasurements({ from, to: hoje }),
      getMeasurementTypes(),
      getTrainingPreferences(),
    ]);

  return (
    <ReportsClient
      history={history}
      planned={scheduled.map((entry) => ({
        scheduledDate: entry.scheduledDate,
        entryKind: entry.entryKind,
        status: entry.status,
      }))}
      records={records}
      measurements={measurements}
      measurementTypes={measurementTypes}
      hoje={hoje}
      preferences={{
        includeWarmup: preferences.countWarmupInVolume,
        unilateralRule: preferences.unilateralVolumeRule,
        weekStartsOn: preferences.weekStartsOn,
      }}
    />
  );
}
