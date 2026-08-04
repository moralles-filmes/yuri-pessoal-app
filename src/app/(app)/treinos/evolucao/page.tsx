import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hojeISO } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { getBodyOverview } from "@/lib/body/queries";
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
 * Fase 17-D + 17-E — Evolução.
 *
 * Desempenho (volume, frequência, progressão) sai de `metrics.ts` — a mesma fonte do histórico
 * e dos recordes, para os três concordarem entre si.
 *
 * A **evolução corporal** (17-E) vem do MÓDULO CENTRAL `body_*` (criado pela 16-E): as mesmas
 * tabelas, as mesmas funções e os mesmos componentes que o módulo Dieta usa. Não existe tabela
 * de peso dentro de `training_*` — e as fotos já chegam com URL assinada de vida curta, gerada
 * nesta requisição.
 */
export default async function EvolucaoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [history, rules, suggestions, muscleGroups, preferences, body] = await Promise.all([
    getSessionHistory({ days: 365 }),
    getProgressionRules(),
    getProgressionSuggestions(["pendente", "aceita", "ignorada"]),
    getMuscleGroups(),
    getTrainingPreferences(),
    // Cria os 16 tipos padrão na primeira visita (idempotente pelo unique (user_id, slug)).
    getBodyOverview(user.id),
  ]);

  return (
    <EvolutionClient
      history={history}
      facets={facetsFromHistory(history)}
      rules={rules}
      suggestions={suggestions}
      muscleGroups={muscleGroups.map((group) => ({ id: group.id, name: group.name }))}
      hoje={hojeISO()}
      body={{
        types: body.types,
        measurements: body.measurements,
        photos: body.photos,
      }}
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
