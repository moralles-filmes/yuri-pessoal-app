import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  CalendarRange,
  ClipboardList,
  Dumbbell,
  History,
  Layers,
  Play,
  Scale,
  Settings,
  Target,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { hojeISO } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { getLatestWeight, getMeasurementTypes } from "@/lib/body/queries";
import { formatMeasurement } from "@/lib/body/measurements";
import {
  DERIVED_SCHEDULE_STATUS_LABELS,
  TRAINING_BASE_PATH,
  TRAINING_SECTIONS,
} from "@/lib/training/constants";
import { getTrainingPreferences } from "@/lib/training/queries";
import {
  getPrograms,
  getScheduledWorkouts,
  getWorkouts,
  summarizeRoutines,
} from "@/lib/training/routine-queries";
import {
  addDaysIso,
  buildScheduleWeek,
  derivePlannedStatus,
  nextScheduledEntry,
} from "@/lib/training/schedule";
import { getSessionHistory } from "@/lib/training/history-queries";
import { getTrainingGoals, getGoalProgressEntries, resolveGoals } from "@/lib/training/goal-queries";
import { getExercises, getMuscleGroups } from "@/lib/training/queries";
import { getMeasurements } from "@/lib/body/queries";
import {
  adherence,
  buildDashboard,
  comparePeriods,
  dashboardRange,
  deltaLabel,
  previousRange,
  sessionsInRange,
  weeklyGoalStreak,
} from "@/lib/training/dashboards";
import { aggregateSessions, formatVolumeKg } from "@/lib/training/metrics";
import { durationLabel, shortDateLabelIso } from "@/lib/training/history";
import {
  GOAL_STATUS_LABELS,
  formatGoalValue,
  isGoalOpen,
  sortGoalsForDisplay,
} from "@/lib/training/goals";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Treinos" };

/**
 * Fase 17-E — Visão geral do módulo Treinos, completa.
 *
 * Resumo do dia, resumo da semana (com comparação), metas em andamento, evolução recente e
 * ações rápidas. **Todo número sai de `metrics.ts` (17-D)** por meio de `dashboards.ts`; o
 * peso corporal vem do módulo central `body_*` (16-E), o mesmo da Dieta.
 *
 * A tela continua mostrando o que EXISTE: sem treino no período, ela diz isso em vez de
 * exibir "0 kg" com cara de resultado.
 */
export default async function TreinosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const hoje = hojeISO();

  const [
    exercises,
    groups,
    preferences,
    programs,
    workouts,
    scheduled,
    history,
    goals,
    measurements,
    measurementTypes,
    latestWeight,
  ] = await Promise.all([
    getExercises(),
    getMuscleGroups(),
    getTrainingPreferences(),
    getPrograms(),
    getWorkouts(),
    getScheduledWorkouts(addDaysIso(hoje, -120), addDaysIso(hoje, 21)),
    getSessionHistory({ from: addDaysIso(hoje, -120), to: hoje }),
    getTrainingGoals(),
    getMeasurements({ from: addDaysIso(hoje, -365), to: hoje }),
    getMeasurementTypes(),
    getLatestWeight(hoje),
  ]);

  const metricOptions = {
    includeWarmup: preferences.countWarmupInVolume,
    unilateralRule: preferences.unilateralVolumeRule,
    weekStartsOn: preferences.weekStartsOn,
  };

  // ── Semana atual, com comparação (dashboards.ts consome metrics.ts) ──
  const weekRange = dashboardRange("semana", hoje, preferences.weekStartsOn);
  const dashboard = buildDashboard(history, "semana", weekRange, hoje, metricOptions);
  const lastWeek = aggregateSessions(
    sessionsInRange(history, previousRange("semana", weekRange)),
    metricOptions,
  );
  const weekComparison = comparePeriods(dashboard.metrics, lastWeek);

  const plannedDays = scheduled.map((entry) => ({
    scheduledDate: entry.scheduledDate,
    entryKind: entry.entryKind,
    status: entry.status,
  }));
  const weekAdherence = adherence(plannedDays, dashboard.metrics.trainedDays, weekRange, hoje);
  const goalStreak = preferences.weeklyWorkoutGoal
    ? weeklyGoalStreak(history, preferences.weeklyWorkoutGoal, hoje, preferences.weekStartsOn)
    : 0;

  // ── Metas em andamento ──
  const progressEntries = goals.length > 0 ? await getGoalProgressEntries(goals.map((g) => g.id)) : [];
  const resolved = resolveGoals({
    goals,
    history,
    planned: plannedDays,
    measurements,
    measurementTypes,
    progressEntries,
    exerciseNames: new Map(exercises.map((exercise) => [exercise.id, exercise.name])),
    muscleGroupNames: new Map(groups.map((group) => [group.id, group.name])),
    programNames: new Map(programs.map((program) => [program.id, program.name])),
    hoje,
    options: { ...metricOptions, oneRmFormula: preferences.oneRmFormula },
  });
  const openGoals = sortGoalsForDisplay(
    resolved
      .filter((item) => isGoalOpen(item.progress.status))
      .map((item) => ({
        ...item,
        status: item.progress.status,
        endsOn: item.goal.endsOn,
        position: item.goal.position,
        name: item.goal.name,
      })),
  ).slice(0, 4);

  // ── Hoje ──
  const todayEntries = scheduled.filter((entry) => entry.scheduledDate === hoje);
  const todaySessions = history.filter((item) => item.sessionDate === hoje);
  const todayMetrics = todaySessions.length > 0 ? aggregateSessions(todaySessions, metricOptions) : null;

  const routines = summarizeRoutines(programs, workouts);
  const week = buildScheduleWeek(scheduled, hoje, hoje, preferences.weekStartsOn);
  const next = nextScheduledEntry(scheduled, hoje);

  const weightType = measurementTypes.find((type) => type.slug === "peso");
  const upcoming = TRAINING_SECTIONS.filter((section) => section.status !== "pronto");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treinos"
        description="Musculação, hipertrofia, força e condicionamento — do catálogo de exercícios às metas e relatórios."
      >
        <Button asChild variant="outline" size="sm">
          <Link href={`${TRAINING_BASE_PATH}/exercicios`}>
            <Dumbbell className="size-4" />
            Catálogo
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href={`${TRAINING_BASE_PATH}/sessao/preparar`}>
            <Play className="size-4" />
            Iniciar treino
          </Link>
        </Button>
      </PageHeader>

      {/* ═══ Hoje ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Hoje</CardTitle>
          <CardDescription>
            {todayMetrics
              ? `${todaySessions.length} treino(s) registrado(s) hoje.`
              : todayEntries.some((entry) => entry.entryKind === "treino")
                ? "Você tem treino programado para hoje."
                : todayEntries.some((entry) => entry.entryKind === "descanso")
                  ? "Hoje está marcado como descanso."
                  : "Nada programado para hoje. Você pode treinar assim mesmo."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {todayMetrics && (
            <div className="grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Volume de hoje"
                value={
                  todayMetrics.totals.units.includes("kg")
                    ? formatVolumeKg(todayMetrics.totals.volumeKg)
                    : "—"
                }
                icon={Dumbbell}
                hint={todayMetrics.totals.quality === "parcial" ? "parcial" : "carga × repetições"}
              />
              <StatCard
                label="Séries"
                value={String(todayMetrics.totals.sets)}
                icon={ClipboardList}
              />
              <StatCard
                label="Tempo"
                value={todayMetrics.totalSeconds > 0 ? durationLabel(todayMetrics.totalSeconds) : "—"}
                icon={CalendarCheck}
              />
            </div>
          )}

          {todayEntries.length > 0 && (
            <ul className="space-y-1.5 text-sm">
              {todayEntries.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="text-[10px]">
                    {DERIVED_SCHEDULE_STATUS_LABELS[derivePlannedStatus(entry, hoje)]}
                  </Badge>
                  <span>
                    {entry.entryKind === "descanso"
                      ? "Descanso"
                      : (entry.workoutName ?? entry.title ?? "Treino")}
                  </span>
                  {entry.plannedTime && (
                    <span className="text-xs text-muted-foreground">
                      {entry.plannedTime.slice(0, 5)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`${TRAINING_BASE_PATH}/hoje`}>
                <CalendarCheck className="size-4" />
                Treino de hoje
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`${TRAINING_BASE_PATH}/calendario`}>
                <CalendarRange className="size-4" />
                Planejar a semana
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Esta semana ═══ */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Esta semana · {dashboard.label}</h2>
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={`${TRAINING_BASE_PATH}/relatorios`}>
                <BarChart3 className="size-4" />
                Relatórios
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`${TRAINING_BASE_PATH}/historico`}>
                <History className="size-4" />
                Histórico
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Treinos"
            value={String(dashboard.metrics.sessionCount)}
            icon={CalendarCheck}
            hint={`${deltaLabel(weekComparison.sessions)} vs. semana anterior`}
          />
          <StatCard
            label="Volume"
            value={
              dashboard.metrics.totals.units.includes("kg")
                ? formatVolumeKg(dashboard.metrics.totals.volumeKg)
                : "—"
            }
            icon={Dumbbell}
            hint={
              dashboard.metrics.totals.quality === "parcial"
                ? "parcial — veja o motivo no histórico"
                : `${deltaLabel(weekComparison.volumeKg)} vs. semana anterior`
            }
          />
          <StatCard
            label="Aderência"
            value={
              weekAdherence.percent === null
                ? "—"
                : `${weekAdherence.percent.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
            }
            icon={Target}
            hint={
              weekAdherence.percent === null
                ? "nada planejado nesta semana"
                : `${weekAdherence.done} de ${weekAdherence.planned} dias planejados`
            }
          />
          <StatCard
            label="Sequência"
            value={`${dashboard.frequency.currentWeekStreak} sem.`}
            icon={CalendarRange}
            hint={
              preferences.weeklyWorkoutGoal
                ? `${goalStreak} semana(s) batendo a meta de ${preferences.weeklyWorkoutGoal}`
                : `maior sequência: ${dashboard.frequency.longestWeekStreak}`
            }
          />
        </div>

        {dashboard.metrics.sessionCount === 0 && (
          <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            Nenhum treino registrado nesta semana ainda. Quando você finalizar uma sessão, o
            volume, as séries e a aderência aparecem aqui.
          </p>
        )}
      </section>

      {/* ═══ Metas + evolução corporal ═══ */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Metas em andamento</CardTitle>
            <CardDescription>
              O valor sai dos treinos registrados e das medidas corporais — o sistema não sugere
              alvo nenhum.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openGoals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma meta em andamento.{" "}
                <Link href={`${TRAINING_BASE_PATH}/metas`} className="underline underline-offset-2">
                  Criar uma meta
                </Link>
                .
              </p>
            ) : (
              <ul className="space-y-3">
                {openGoals.map((item) => (
                  <li key={item.goal.id} className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{item.goal.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {GOAL_STATUS_LABELS[item.progress.status]}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 text-sm">
                      <span className="tabular-nums">
                        {formatGoalValue(item.value.value, item.unit)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        de {formatGoalValue(item.goal.targetValue, item.unit)}
                      </span>
                    </div>
                    {item.progress.percent !== null ? (
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${item.progress.percent}%` }}
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">{item.value.reason}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={`${TRAINING_BASE_PATH}/metas`}>
                <Target className="size-4" />
                Todas as metas
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Evolução recente</CardTitle>
            <CardDescription>
              Desempenho e corpo lado a lado. Correlação não é causa — o sistema mostra os dois,
              sem afirmar que um explica o outro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard
                label="Peso corporal"
                value={
                  latestWeight && weightType
                    ? formatMeasurement(
                        latestWeight.value,
                        latestWeight.unit,
                        weightType.decimals,
                      )
                    : "—"
                }
                icon={Scale}
                hint={
                  latestWeight
                    ? `medido em ${shortDateLabelIso(latestWeight.measuredOn)}`
                    : "nenhuma medição registrada"
                }
              />
              <StatCard
                label="Séries na semana"
                value={String(dashboard.metrics.totals.sets)}
                icon={ClipboardList}
                hint={`${dashboard.metrics.totals.workingSets} de trabalho`}
              />
            </div>

            {dashboard.muscleGroups.length > 0 && (
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Seu registro de treinamento por grupo, nesta semana:
                </p>
                <ul className="space-y-1 text-sm">
                  {dashboard.muscleGroups.slice(0, 5).map((share) => (
                    <li key={share.group} className="flex items-baseline justify-between gap-3">
                      <span className="truncate">{share.group}</span>
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {share.sets} série(s)
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={`${TRAINING_BASE_PATH}/evolucao`}>
                  <TrendingUp className="size-4" />
                  Evolução
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={`${TRAINING_BASE_PATH}/recordes`}>
                  <Trophy className="size-4" />
                  Recordes
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ═══ A semana planejada ═══ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Sua semana</CardTitle>
          <CardDescription>
            {next
              ? `Próximo treino: ${next.entry.workoutName ?? "sem treino definido"} em ${next.daysAhead} dia(s).`
              : "Nada planejado à frente. Monte a semana no calendário."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {week.days.map((day) => {
              const entry = day.entries.find((item) => item.entryKind === "treino");
              const derived = entry ? derivePlannedStatus(entry, hoje) : null;
              return (
                <li
                  key={day.date}
                  className={`rounded-lg border p-2 text-xs ${day.isToday ? "border-primary/50 bg-primary/5" : ""}`}
                >
                  <p className="font-medium text-muted-foreground">
                    {day.date.slice(8, 10)}/{day.date.slice(5, 7)}
                  </p>
                  <p className="mt-1 truncate">
                    {entry ? (entry.workoutName ?? "Treino") : day.hasRest ? "Descanso" : "—"}
                  </p>
                  {derived && derived !== "planejado" && (
                    <Badge variant="secondary" className="mt-1 text-[9px]">
                      {DERIVED_SCHEDULE_STATUS_LABELS[derived]}
                    </Badge>
                  )}
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`${TRAINING_BASE_PATH}/calendario?visao=consistencia`}>
                <CalendarRange className="size-4" />
                Consistência
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`${TRAINING_BASE_PATH}/treinos`}>
                <ClipboardList className="size-4" />
                Meus treinos
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ═══ Catálogo e rotina ═══ */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Treinos-modelo"
          value={String(routines.workouts)}
          icon={ClipboardList}
          hint={
            routines.emptyWorkouts > 0
              ? `${routines.emptyWorkouts} ainda sem exercícios`
              : "Todos com exercícios"
          }
        />
        <StatCard
          label="Programas"
          value={String(routines.programs)}
          icon={Layers}
          hint={routines.activePrograms > 0 ? `${routines.activePrograms} em uso` : "Nenhum em uso"}
        />
        <StatCard
          label="Exercícios disponíveis"
          value={String(exercises.length)}
          icon={Dumbbell}
          hint={`${exercises.filter((exercise) => exercise.isSystemExercise).length} da base`}
        />
        <StatCard
          label="Metas cadastradas"
          value={String(goals.length)}
          icon={Target}
          hint={`${openGoals.length} em andamento`}
        />
      </div>

      {upcoming.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que ainda vem</CardTitle>
            <CardDescription>
              O módulo é entregue em 6 subfases. Cada seção abaixo já tem rota e diz em qual delas
              chega — nada de link morto nem de tela que finge funcionar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {upcoming.map((section) => (
                <li
                  key={section.slug}
                  className="flex items-start justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{section.title}</p>
                    <p className="text-xs text-muted-foreground">{section.description}</p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {section.phase.replace("Subfase ", "")}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={`${TRAINING_BASE_PATH}/exercicios`}>
            <Dumbbell className="size-4" />
            Exercícios
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`${TRAINING_BASE_PATH}/programas`}>
            <Layers className="size-4" />
            Programas
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`${TRAINING_BASE_PATH}/configuracoes`}>
            <Settings className="size-4" />
            Configurações
          </Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {groups.length} grupos musculares · incremento padrão {preferences.defaultIncrementKg}{" "}
        {preferences.weightUnit} · regra de volume:{" "}
        {preferences.countWarmupInVolume ? "aquecimento incluído" : "aquecimento fora"}. As
        medidas corporais são as mesmas do módulo de Dieta — não existe duas fontes de peso.
      </p>
    </div>
  );
}
