import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { getTrainingPreferences } from "@/lib/training/queries";
import { getTrainingLocations } from "@/lib/training/session-queries";
import { TrainingLocationsClient } from "@/components/training/session/locations-client";
import { TrainingPreferencesClient } from "./preferences-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurações · Treinos" };

/**
 * Fase 17-A (+ 17-C) — Preferências do módulo Treinos.
 *
 * A 17-C acrescentou os **locais de treino** e o estoque de anilhas de cada um — é o que
 * alimenta a calculadora de anilhas da sessão ao vivo.
 */
export default async function ConfiguracoesPage() {
  const [preferences, locations] = await Promise.all([
    getTrainingPreferences(),
    getTrainingLocations(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Preferências do módulo Treinos. Valem para todos os submódulos."
      />
      <TrainingPreferencesClient preferences={preferences} />
      <TrainingLocationsClient locations={locations} />
    </div>
  );
}
