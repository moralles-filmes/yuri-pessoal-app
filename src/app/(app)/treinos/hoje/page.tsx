import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarRange,
  Clock,
  Dumbbell,
  Layers,
  Moon,
  Timer,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { hojeISO } from "@/lib/format";
import { getMuscleGroups, getTrainingPreferences } from "@/lib/training/queries";
import { getScheduledWorkouts, getWorkouts } from "@/lib/training/routine-queries";
import {
  addDaysIso,
  derivePlannedStatus,
  entriesForDay,
  nextScheduledEntry,
  overdueEntries,
} from "@/lib/training/schedule";
import {
  expandPlannedSets,
  repRangeLabel,
  secondsLabel,
  summarizeWorkout,
} from "@/lib/training/workout";
import {
  DERIVED_SCHEDULE_STATUS_LABELS,
  SET_TYPE_LABELS,
  TRAINING_BASE_PATH,
} from "@/lib/training/constants";
import type { ScheduledWorkout, TrainingWorkout } from "@/lib/training/types";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Treino de hoje · Treinos" };

/**
 * Fase 17-B — Treino de hoje.
 *
 * Mostra o que está programado para hoje, com grupos musculares, número de exercícios, total
 * de séries e duração estimada — tudo saindo de `summarizeWorkout`, a mesma função do
 * construtor e da lista, para as três telas nunca discordarem.
 *
 * **Ainda não existe "Iniciar treino".** A sessão ao vivo chega na Subfase 17-C, e a tela diz
 * isso em vez de mostrar um botão que não faz nada.
 */
export default async function HojePage() {
  const hoje = hojeISO();

  const [entries, workouts, groups, preferences] = await Promise.all([
    getScheduledWorkouts(addDaysIso(hoje, -30), addDaysIso(hoje, 30)),
    getWorkouts(),
    getMuscleGroups(),
    getTrainingPreferences(),
  ]);

  const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
  const groupName = new Map(groups.map((group) => [group.id, group.name]));

  const today = entriesForDay(entries, hoje);
  const todayWorkouts = today.filter((entry) => entry.entryKind === "treino");
  const isRestDay = today.some((entry) => entry.entryKind === "descanso");
  const next = nextScheduledEntry(entries, hoje);
  const overdue = overdueEntries(entries, hoje).slice(0, 5);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Treino de hoje"
        description="O que está programado para hoje e o que vem em seguida."
      >
        <Button asChild variant="outline" size="sm">
          <Link href={`${TRAINING_BASE_PATH}/calendario`}>
            <CalendarRange className="size-4" />
            Abrir calendário
          </Link>
        </Button>
      </PageHeader>

      {todayWorkouts.length === 0 ? (
        isRestDay ? (
          <EmptyState
            icon={Moon}
            title="Hoje é dia de descanso"
            description="Você marcou este dia como descanso no calendário."
          >
            <Button asChild variant="outline" size="sm">
              <Link href={`${TRAINING_BASE_PATH}/calendario`}>Ver a semana</Link>
            </Button>
          </EmptyState>
        ) : (
          <EmptyState
            icon={Dumbbell}
            title="Nada programado para hoje"
            description="Planeje a semana no calendário ou aplique um programa para preencher os dias de uma vez."
          >
            <Button asChild size="sm">
              <Link href={`${TRAINING_BASE_PATH}/calendario`}>
                <CalendarRange className="size-4" />
                Planejar
              </Link>
            </Button>
          </EmptyState>
        )
      ) : (
        <div className="space-y-4">
          {todayWorkouts.map((entry) => (
            <TodayCard
              key={entry.id}
              entry={entry}
              workout={entry.workoutId ? workoutById.get(entry.workoutId) : undefined}
              groupName={groupName}
              hoje={hoje}
              defaultRestSeconds={preferences.defaultRestSeconds}
            />
          ))}
        </div>
      )}

      {/* A sessão ao vivo é a 17-C. A tela diz isso — nada de botão decorativo. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Timer className="size-4 text-primary" />
            Registrar o treino durante a execução
          </CardTitle>
          <CardDescription>
            O botão <strong>Iniciar treino</strong> — com cronômetro, registro série a série e
            descanso — chega na <strong>Subfase 17-C</strong>. Até lá, esta tela mostra o
            planejamento, e o histórico de execução ainda não existe.
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Próximo treino</CardTitle>
          </CardHeader>
          <CardContent>
            {next ? (
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {next.entry.workoutName ?? next.entry.title ?? "Treino"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {next.daysAhead === 1 ? "Amanhã" : `Em ${next.daysAhead} dias`} ·{" "}
                    {next.entry.scheduledDate.slice(8, 10)}/{next.entry.scheduledDate.slice(5, 7)}
                    {next.entry.plannedTime ? ` · ${next.entry.plannedTime.slice(0, 5)}` : ""}
                  </p>
                </div>
                {next.entry.workoutId && (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`${TRAINING_BASE_PATH}/treinos/${next.entry.workoutId}`}>Ver</Link>
                  </Button>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nada planejado para os próximos dias.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Dias que passaram sem resposta</CardTitle>
            <CardDescription>
              Derivado da data — nada disso está gravado como &ldquo;atrasado&rdquo; no banco.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {overdue.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum dia em aberto. 👌</p>
            ) : (
              <ul className="space-y-1.5">
                {overdue.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-2 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                      {entry.scheduledDate.slice(8, 10)}/{entry.scheduledDate.slice(5, 7)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {entry.workoutName ?? entry.title ?? "Treino"}
                    </span>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {DERIVED_SCHEDULE_STATUS_LABELS[derivePlannedStatus(entry, hoje)]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
            {overdue.length > 0 && (
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href={`${TRAINING_BASE_PATH}/calendario?visao=lista`}>
                  Registrar o que aconteceu
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ───────────────────────────── Card do treino de hoje ───────────────────────────── */

function TodayCard({
  entry,
  workout,
  groupName,
  hoje,
  defaultRestSeconds,
}: {
  entry: ScheduledWorkout;
  workout: TrainingWorkout | undefined;
  groupName: Map<string, string>;
  hoje: string;
  defaultRestSeconds: number;
}) {
  const derived = derivePlannedStatus(entry, hoje);

  if (!workout) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{entry.title ?? "Treino removido"}</CardTitle>
          <CardDescription>
            Este dia estava planejado com um treino que não existe mais. O registro do
            planejamento continua aqui, em vez de sumir.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const summary = summarizeWorkout(workout.exercises, { defaultRestSeconds });
  const muscles = Object.entries(summary.muscles.primary)
    .map(([id, count]) => ({ name: groupName.get(id) ?? "Sem grupo", count }))
    .sort((a, b) => b.count - a.count);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <span className="truncate">{workout.name}</span>
              <Badge variant="secondary">{DERIVED_SCHEDULE_STATUS_LABELS[derived]}</Badge>
            </CardTitle>
            <CardDescription>
              {entry.plannedTime ? `Previsto para ${entry.plannedTime.slice(0, 5)} · ` : ""}
              {entry.programName ?? (workout.programName ?? "Treino avulso")}
              {entry.originalDate
                ? ` · reagendado (era ${entry.originalDate.slice(8, 10)}/${entry.originalDate.slice(5, 7)})`
                : ""}
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`${TRAINING_BASE_PATH}/treinos/${workout.id}`}>Abrir treino</Link>
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <Dumbbell className="size-4 text-muted-foreground" />
            {summary.exerciseCount} {summary.exerciseCount === 1 ? "exercício" : "exercícios"}
          </span>
          <span className="flex items-center gap-1.5">
            <Layers className="size-4 text-muted-foreground" />
            {summary.sets.working} séries de trabalho
            {summary.sets.warmup > 0 ? ` + ${summary.sets.warmup} de aquecimento` : ""}
          </span>
          <span className="flex items-center gap-1.5">
            <Clock className="size-4 text-muted-foreground" />
            {summary.duration.totalMinutes > 0
              ? `~${summary.duration.totalMinutes} min`
              : "Duração não estimada"}
            {summary.duration.isPartial && " (parcial)"}
          </span>
        </div>

        {muscles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {muscles.map((muscle) => (
              <Badge key={muscle.name} variant="secondary">
                {muscle.name} · {muscle.count}
              </Badge>
            ))}
          </div>
        )}

        {workout.exercises.length > 0 && (
          <ul className="space-y-1.5">
            {workout.exercises.map((item, index) => {
              const sets = expandPlannedSets(item);
              const first = sets[0];
              return (
                <li key={item.id} className="flex items-center gap-2 rounded-lg border p-2 text-sm">
                  <span className="w-5 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{item.exerciseName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {sets.length} {sets.length === 1 ? "série" : "séries"}
                      {first?.targetRepsMin !== null || first?.targetRepsMax !== null
                        ? ` × ${repRangeLabel(first.targetRepsMin, first.targetRepsMax)}`
                        : ""}
                      {first?.targetDurationSeconds !== null &&
                      first?.targetDurationSeconds !== undefined
                        ? ` × ${secondsLabel(first.targetDurationSeconds)}`
                        : ""}
                      {first?.restSeconds !== null && first?.restSeconds !== undefined
                        ? ` · descanso ${secondsLabel(first.restSeconds)}`
                        : ""}
                      {item.setType !== "trabalho" ? ` · ${SET_TYPE_LABELS[item.setType]}` : ""}
                    </span>
                  </span>
                  {item.supersetGroup && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      Bloco {item.supersetGroup}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {entry.notes && <p className="text-sm text-muted-foreground">{entry.notes}</p>}
      </CardContent>
    </Card>
  );
}
