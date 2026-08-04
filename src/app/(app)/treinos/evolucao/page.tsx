import type { Metadata } from "next";
import { hojeISO } from "@/lib/format";
import {
  facetsFromHistory,
  getProgressionRules,
  getProgressionSuggestions,
  getSessionHistory,
} from "@/lib/training/history-queries";
import { getMuscleGroups, getTrainingPreferences } from "@/lib/training/queries";
import { EvolutionClient } from "./evolution-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Evolução · Treinos" };

/**
 * Fase 17-D — Evolução de desempenho.
 *
 * Volume, frequência e distribuição por grupo muscular saem de `metrics.ts` — a mesma fonte do
 * histórico e dos recordes, para os três concordarem entre si.
 *
 * A **evolução corporal** (peso, medidas, fotos) chega na 17-E, com as tabelas `body_*`
 * compartilhadas com o módulo Dieta. Esta tela é só desempenho.
 */
export default async function EvolucaoPage() {
  const [history, rules, suggestions, muscleGroups, preferences] = await Promise.all([
    getSessionHistory({ days: 365 }),
    getProgressionRules(),
    getProgressionSuggestions(["pendente", "aceita", "ignorada"]),
    getMuscleGroups(),
    getTrainingPreferences(),
  ]);

  return (
    <EvolutionClient
      history={history}
      facets={facetsFromHistory(history)}
      rules={rules}
      suggestions={suggestions}
      muscleGroups={muscleGroups.map((group) => ({ id: group.id, name: group.name }))}
      hoje={hojeISO()}
      preferences={{
        includeWarmup: preferences.countWarmupInVolume,
        unilateralRule: preferences.unilateralVolumeRule,
        weekStartsOn: preferences.weekStartsOn,
        progressionEnabled: preferences.progressionEnabled,
        oneRmFormula: preferences.oneRmFormula,
      }}
    />
  );
}
