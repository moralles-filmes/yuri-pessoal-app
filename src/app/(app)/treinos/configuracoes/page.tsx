import type { Metadata } from "next";
import { PageHeader } from "@/components/shared/page-header";
import { getTrainingPreferences } from "@/lib/training/queries";
import { TrainingPreferencesClient } from "./preferences-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Configurações · Treinos" };

/** Fase 17-A — Preferências do módulo Treinos. */
export default async function ConfiguracoesPage() {
  const preferences = await getTrainingPreferences();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Preferências do módulo Treinos. Valem para todos os submódulos."
      />
      <TrainingPreferencesClient preferences={preferences} />
    </div>
  );
}
