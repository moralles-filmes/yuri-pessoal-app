import type { Metadata } from "next";
import Link from "next/link";
import { Dumbbell, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import { getExercises, getTrainingPreferences } from "@/lib/training/queries";
import {
  getDraftSession,
  getExerciseHistory,
  getRunningSession,
  getTrainingLocations,
} from "@/lib/training/session-queries";
import { previousPerformance, suggestFromPrevious, type PreviousSuggestion } from "@/lib/training/previous";
import { createClient } from "@/lib/supabase/server";
import { SessionLiveClient } from "@/components/training/session/session-live-client";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Treino em andamento · Treinos" };

/**
 * Fase 17-C — A tela do treino acontecendo.
 *
 * ⛔ **Tudo que esta página mostra vem do SNAPSHOT da sessão** — nome do treino, exercícios,
 * séries previstas, cargas planejadas. Nenhuma linha de `training_workouts` é lida aqui.
 * Editar o treino-modelo depois não muda absolutamente nada do que está nesta tela.
 *
 * A única leitura do catálogo é para OFERECER substituições e novos exercícios: decisão sobre
 * o que vem agora, não renderização do que já aconteceu.
 *
 * ═══════════ RECUPERAÇÃO ═══════════
 *
 * Não há "sessão da aba": a sessão em execução vive no servidor. Fechar a aba no meio do treino
 * e reabrir cai exatamente aqui, com tudo no lugar — inclusive o descanso, que é recalculado a
 * partir do `started_at` gravado.
 */
export default async function SessaoPage() {
  const session = await getRunningSession();

  if (!session) {
    const draft = await getDraftSession();
    return (
      <div className="space-y-5">
        <PageHeader
          title="Treino em andamento"
          description="Aqui fica o treino acontecendo, série por série."
        />

        {draft ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <RotateCcw className="size-4 text-primary" />
                Você deixou uma preparação em aberto
              </CardTitle>
              <CardDescription>
                {draft.workoutName} · preparado em {formatDate(draft.sessionDate)}. Continue de
                onde parou ou comece outro treino.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button asChild>
                <Link href={`${TRAINING_BASE_PATH}/sessao/preparar?id=${draft.id}`}>
                  <Play className="size-4" />
                  Continuar preparação
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link href={`${TRAINING_BASE_PATH}/sessao/preparar`}>Escolher outro treino</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={Dumbbell}
            title="Nenhum treino em andamento"
            description="Escolha o treino, revise os exercícios e comece. Você pode usar o treino programado de hoje, um treino cadastrado, repetir o último ou montar um treino livre."
          >
            <Button asChild>
              <Link href={`${TRAINING_BASE_PATH}/sessao/preparar`}>
                <Play className="size-4" />
                Iniciar treino
              </Link>
            </Button>
          </EmptyState>
        )}
      </div>
    );
  }

  const exerciseIds = session.exercises
    .map((exercise) => exercise.exerciseId)
    .filter((id): id is string => Boolean(id));

  const [catalog, preferences, locations, history] = await Promise.all([
    getExercises(),
    getTrainingPreferences(),
    getTrainingLocations(),
    getExerciseHistory(exerciseIds, { excludeSessionId: session.id }),
  ]);

  // Valores da última vez — SUGESTÃO. Nada é aplicado sozinho; a tela mostra ao lado do campo.
  const suggestionsByExercise: Record<string, PreviousSuggestion[]> = {};
  for (const exercise of session.exercises) {
    const previous = previousPerformance(history, {
      exerciseId: exercise.exerciseId,
      exerciseName: exercise.exerciseName,
      source: "qualquer_treino",
      excludeSessionId: session.id,
    });
    suggestionsByExercise[exercise.id] = suggestFromPrevious(previous, exercise.sets.length);
  }

  // Alternativas cadastradas pelo usuário (17-A), na ordem de prioridade DELE.
  const supabase = await createClient();
  const { data: alternatives } = await supabase
    .from("training_exercise_alternatives")
    .select("exercise_id,alternative_exercise_id,position")
    .in("exercise_id", exerciseIds.length > 0 ? exerciseIds : ["00000000-0000-0000-0000-000000000000"])
    .order("position", { ascending: true });

  const alternativesByExercise: Record<string, string[]> = {};
  for (const row of alternatives ?? []) {
    const list = alternativesByExercise[row.exercise_id] ?? [];
    list.push(row.alternative_exercise_id);
    alternativesByExercise[row.exercise_id] = list;
  }

  const location = locations.find((item) => item.id === session.locationId) ?? null;

  return (
    <SessionLiveClient
      session={session}
      catalog={catalog}
      alternativesByExercise={alternativesByExercise}
      location={location}
      suggestionsByExercise={suggestionsByExercise}
      difficultyScale={preferences.difficultyScale}
    />
  );
}
