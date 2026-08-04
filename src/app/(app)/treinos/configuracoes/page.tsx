import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { createClient } from "@/lib/supabase/server";
import { getGoogleConnectionStatus } from "@/lib/calendar/queries";
import { getTrainingPreferences } from "@/lib/training/queries";
import { getTrainingLocations } from "@/lib/training/session-queries";
import { TrainingLocationsClient } from "@/components/training/session/locations-client";
import { TrainingIntegrationsCard } from "@/components/training/integrations-card";
import { TrainingPreferencesClient } from "./preferences-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurações · Treinos" };

/**
 * Fase 17-A (+ 17-C + 17-F) — Preferências do módulo Treinos.
 *
 * A 17-C acrescentou os **locais de treino** e o estoque de anilhas de cada um — é o que
 * alimenta a calculadora de anilhas da sessão ao vivo.
 *
 * A 17-F acrescentou as **integrações**: o hábito que reflete as sessões e o atalho para o
 * espelho na agenda. As duas nascem desligadas — nenhuma informação sai do módulo sem escolha.
 */
export default async function ConfiguracoesPage() {
  const supabase = await createClient();

  const [preferences, locations, google, habitsRes] = await Promise.all([
    getTrainingPreferences(),
    getTrainingLocations(),
    getGoogleConnectionStatus(),
    supabase
      .from("habits")
      .select("id,name,is_active")
      .eq("is_active", true)
      .order("position", { ascending: true })
      .limit(100),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Preferências do módulo Treinos. Valem para todos os submódulos."
      />
      <TrainingPreferencesClient preferences={preferences} />
      <TrainingIntegrationsCard
        habitId={preferences.habitId}
        habits={(habitsRes.data ?? []).map((row) => ({ id: row.id, name: row.name }))}
        googleConnected={google.status.connected}
        googleSyncEnabled={google.status.trainingSyncEnabled}
      />
      <TrainingLocationsClient locations={locations} />
    </div>
  );
}