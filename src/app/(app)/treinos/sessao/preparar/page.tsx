import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shared/page-header";
import { hojeISO } from "@/lib/format";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import { getExercises, getTrainingPreferences } from "@/lib/training/queries";
import { getScheduledWorkouts, getWorkouts } from "@/lib/training/routine-queries";
import { entriesForDay } from "@/lib/training/schedule";
import {
  getExerciseHistory,
  getRecentSessions,
  getRunningSession,
  getSession,
  getTrainingLocations,
} from "@/lib/training/session-queries";
import { previousPerformance, type PreviousPerformance } from "@/lib/training/previous";
import { PrepareChooseClient } from "@/components/training/session/prepare-choose-client";
import { getLatestWeight } from "@/lib/body/queries";
import { PrepareReviewClient } from "@/components/training/session/prepare-review-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Preparar treino · Treinos" };

/**
 * Fase 17-C — Preparação da sessão.
 *
 * Duas etapas, na mesma rota:
 *   1. **Escolher** o treino — programado, cadastrado, recente, favorito, vazio, repetir o
 *      último ou duplicar uma sessão passada.
 *   2. **Revisar** tudo antes de começar — ordem, séries, repetições, cargas, descansos,
 *      RIR/RPE, superset — mais a configuração geral (local, descanso padrão, som, vibração,
 *      avanço automático, tela ativa, unidade, energia, disposição, sono, dor).
 *
 * ⚠️ Os ajustes valem **só para a sessão de hoje**. O treino-modelo não é tocado: quem quer
 * mudar o modelo faz isso no construtor (17-B), e a diferença entre as duas coisas é o que
 * separa intenção de execução.
 *
 * Os valores da última vez aparecem como SUGESTÃO ao lado do planejado. Nada muda sozinho.
 */
export default async function PrepararPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; treino?: string; planejado?: string }>;
}) {
  const params = await searchParams;

  // Um treino em execução tem precedência: preparar outro enquanto um está rolando seria
  // justamente o cenário de "duas sessões ativas" que o módulo não permite em silêncio.
  const running = await getRunningSession();
  if (running && !params.id) redirect(`${TRAINING_BASE_PATH}/sessao`);

  const preferences = await getTrainingPreferences();
  const locations = await getTrainingLocations();

  /* ───────────── Etapa 2: revisar uma preparação existente ───────────── */
  if (params.id) {
    const session = await getSession(params.id);
    if (!session || !session.snapshot) redirect(`${TRAINING_BASE_PATH}/sessao/preparar`);
    if (!["rascunho", "pronta"].includes(session.status)) {
      redirect(`${TRAINING_BASE_PATH}/sessao`);
    }

    const exerciseIds = session.snapshot.exercises
      .map((exercise) => exercise.exerciseId)
      .filter((id): id is string => Boolean(id));

    // 17-E — o peso mais recente do MÓDULO CENTRAL `body_*` (16-E), só para PRÉ-PREENCHER o
    // campo. O que ficar gravado na sessão continua sendo o peso DAQUELE treino, congelado —
    // `training_sessions.body_weight_kg` não é, e não vira, histórico de medida.
    const [history, latestWeight] = await Promise.all([
      getExerciseHistory(exerciseIds, { excludeSessionId: session.id }),
      getLatestWeight(session.sessionDate),
    ]);

    // Duas fontes, porque as duas respostas são legítimas e diferentes: "a última vez que fiz
    // este exercício" e "a última vez que fiz este exercício NESTE treino". Quem escolhe é o
    // usuário, na própria tela.
    const previousAny: Record<string, PreviousPerformance | null> = {};
    const previousSame: Record<string, PreviousPerformance | null> = {};

    for (const exercise of session.snapshot.exercises) {
      const key = exercise.workoutExerciseId ?? String(exercise.plannedPosition);
      previousAny[key] = previousPerformance(history, {
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        source: "qualquer_treino",
        excludeSessionId: session.id,
      });
      previousSame[key] = previousPerformance(history, {
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        source: "mesmo_modelo",
        workoutId: session.workoutId,
        excludeSessionId: session.id,
      });
    }

    return (
      <div className="space-y-5">
        <PageHeader
          title="Revisar antes de começar"
          description="Ajuste séries, cargas, descansos e ordem. Vale só para o treino de hoje — o modelo continua como está."
        />
        <PrepareReviewClient
          session={session}
          snapshot={session.snapshot}
          locations={locations}
          previousAny={previousAny}
          previousSame={previousSame}
          difficultyScale={preferences.difficultyScale}
          latestWeight={
            latestWeight ? { valueKg: latestWeight.value, measuredOn: latestWeight.measuredOn } : null
          }
        />
      </div>
    );
  }

  /* ───────────── Etapa 1: escolher o treino ───────────── */
  const hoje = hojeISO();

  const [workouts, entries, recent, catalog] = await Promise.all([
    getWorkouts(),
    getScheduledWorkouts(hoje, hoje),
    getRecentSessions(10),
    getExercises(),
  ]);

  const scheduledToday = entriesForDay(entries, hoje).filter(
    (entry) => entry.entryKind === "treino" && entry.status === "planejado",
  );

  const live = workouts.filter((workout) => !workout.isArchived && !workout.isSuperseded);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Iniciar treino"
        description="Escolha de onde o treino de hoje vem. Você revisa tudo antes de começar."
      />
      <PrepareChooseClient
        scheduledToday={scheduledToday}
        workouts={live}
        recentSessions={recent}
        locations={locations}
        catalogSize={catalog.length}
        defaultWorkoutId={params.treino ?? null}
        defaultScheduledId={params.planejado ?? null}
        preferences={preferences}
      />
    </div>
  );
}
