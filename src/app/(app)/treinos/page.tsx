import type { Metadata } from "next";
import Link from "next/link";
import {
  CalendarCheck,
  CalendarRange,
  ClipboardList,
  Dumbbell,
  History,
  Layers,
  Settings,
  Star,
  Trophy,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { hojeISO } from "@/lib/format";
import {
  TRAINING_BASE_PATH,
  TRAINING_SECTIONS,
  MUSCLE_REGION_LABELS,
} from "@/lib/training/constants";
import {
  getEquipment,
  getExercises,
  getMuscleGroups,
  getTrainingPreferences,
  summarizeCatalog,
} from "@/lib/training/queries";
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
import { aggregateSessions, formatVolumeKg, frequencyMetrics } from "@/lib/training/metrics";
import { DERIVED_SCHEDULE_STATUS_LABELS } from "@/lib/training/constants";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Treinos" };

/**
 * Fase 17-D — Visão geral do módulo Treinos.
 *
 * Continua mostrando o que EXISTE, nunca o que existirá. A 17-B trouxe a rotina (programas,
 * treinos-modelo e planejamento) e a 17-D trouxe o que foi de fato treinado — por isso os
 * números dos últimos 30 dias aparecem aqui, todos saídos de `metrics.ts`, a mesma fonte do
 * histórico e dos recordes. Sem treino registrado no período, a tela diz isso em vez de
 * mostrar "0 kg" com cara de resultado.
 */
export default async function TreinosPage() {
  const hoje = hojeISO();

  const [exercises, groups, equipment, preferences, programs, workouts, scheduled, history] =
    await Promise.all([
      getExercises(),
      getMuscleGroups(),
      getEquipment(),
      getTrainingPreferences(),
      getPrograms(),
      getWorkouts(),
      getScheduledWorkouts(addDaysIso(hoje, -14), addDaysIso(hoje, 21)),
      getSessionHistory({ from: addDaysIso(hoje, -29), to: hoje }),
    ]);

  const summary = summarizeCatalog(exercises);
  // 17-D — os números do período saem de `metrics.ts`, com a regra do usuário aplicada.
  const metricOptions = {
    includeWarmup: preferences.countWarmupInVolume,
    unilateralRule: preferences.unilateralVolumeRule,
  };
  const last30 = aggregateSessions(history, metricOptions);
  const frequency = frequencyMetrics(history, hoje, { weekStartsOn: preferences.weekStartsOn });
  const routines = summarizeRoutines(programs, workouts);
  const week = buildScheduleWeek(scheduled, hoje, hoje, preferences.weekStartsOn);
  const next = nextScheduledEntry(scheduled, hoje);
  const groupById = new Map(groups.map((g) => [g.id, g]));

  const topGroups = Object.entries(summary.byMuscleGroup)
    .map(([id, count]) => ({ group: groupById.get(id), count }))
    .filter((item): item is { group: NonNullable<typeof item.group>; count: number } =>
      Boolean(item.group),
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const upcoming = TRAINING_SECTIONS.filter((section) => section.status !== "pronto");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Treinos"
        description="Musculação, hipertrofia, força e condicionamento — do catálogo de exercícios ao histórico."
      >
        <Button asChild variant="outline" size="sm">
          <Link href={`${TRAINING_BASE_PATH}/exercicios`}>
            <Dumbbell className="size-4" />
            Catálogo
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link href={`${TRAINING_BASE_PATH}/hoje`}>
            <CalendarCheck className="size-4" />
            Treino de hoje
          </Link>
        </Button>
      </PageHeader>

      {/* 17-D — o que foi realmente treinado. Sem sessão no período, a tela diz isso. */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">Últimos 30 dias</h2>
          <div className="flex gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href={`${TRAINING_BASE_PATH}/historico`}>
                <History className="size-4" />
                Histórico
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`${TRAINING_BASE_PATH}/recordes`}>
                <Trophy className="size-4" />
                Recordes
              </Link>
            </Button>
          </div>
        </div>

        {last30.sessionCount === 0 ? (
          <p className="rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
            Nenhum treino registrado nos últimos 30 dias. Quando você finalizar uma sessão, o
            volume, as séries e a frequência aparecem aqui.
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Treinos"
                value={String(last30.sessionCount)}
                icon={CalendarCheck}
                hint={`${frequency.trainedDays} dia(s) treinados`}
              />
              <StatCard
                label="Volume"
                value={formatVolumeKg(last30.totals.volumeKg)}
                icon={Dumbbell}
                hint={
                  last30.totals.quality === "parcial"
                    ? "Parcial — alguma série ficou fora do cálculo"
                    : "carga × repetições"
                }
              />
              <StatCard
                label="Séries"
                value={String(last30.totals.sets)}
                icon={ClipboardList}
                hint={`${last30.totals.workingSets} de trabalho`}
              />
              <StatCard
                label="Sequência"
                value={`${frequency.currentWeekStreak} sem.`}
                icon={CalendarRange}
                hint={`maior sequência: ${frequency.longestWeekStreak}`}
              />
            </div>
            {last30.totals.quality === "parcial" && (
              <p className="text-xs text-muted-foreground">
                O volume do período está marcado como parcial: alguma série não tinha dado
                suficiente para entrar na conta. O motivo aparece no histórico.
              </p>
            )}
          </>
        )}
      </section>

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
          hint={
            routines.activePrograms > 0
              ? `${routines.activePrograms} em uso`
              : "Nenhum em uso"
          }
        />
        <StatCard
          label="Planejado nesta semana"
          value={String(week.counts.total)}
          icon={CalendarRange}
          hint={
            week.counts.descanso > 0
              ? `${week.counts.descanso} dia(s) de descanso marcados`
              : "Nenhum descanso marcado"
          }
        />
        <StatCard
          label="Exercícios disponíveis"
          value={String(summary.totalExercises)}
          icon={Dumbbell}
          hint={`${summary.systemExercises} da base · ${summary.ownExercises} seus`}
        />
      </div>

      {/* A semana planejada — status derivado da data, nunca gravado. */}
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
                    {entry
                      ? (entry.workoutName ?? "Treino")
                      : day.hasRest
                        ? "Descanso"
                        : "—"}
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
              <Link href={`${TRAINING_BASE_PATH}/calendario`}>
                <CalendarRange className="size-4" />
                Planejar a semana
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Catálogo por grupo muscular</CardTitle>
            <CardDescription>
              Contagem pelo grupo <strong>principal</strong> de cada exercício. Um exercício
              aparece uma vez só, mesmo trabalhando vários músculos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {topGroups.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum exercício no catálogo ainda.</p>
            ) : (
              <ul className="space-y-2">
                {topGroups.map(({ group, count }) => (
                  <li key={group.id}>
                    <Link
                      href={`${TRAINING_BASE_PATH}/exercicios?grupo=${group.id}`}
                      className="flex items-center gap-3 rounded-lg px-2 py-1.5 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0 flex-1 truncate text-sm">{group.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {MUSCLE_REGION_LABELS[group.region]}
                      </span>
                      <span className="w-8 shrink-0 text-right text-sm font-medium tabular-nums">
                        {count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">De onde vem a base de exercícios</CardTitle>
            <CardDescription>Procedência declarada, como no catálogo de alimentos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              Os {summary.systemExercises} exercícios da base são{" "}
              <strong className="text-foreground">conteúdo autoral</strong>, produzido para este
              projeto. Nada foi copiado de aplicativos de treino: sem imagem, sem vídeo, sem texto
              de instrução e sem banco de dados de terceiros.
            </p>
            <p>
              A classificação (grupo muscular, equipamento, padrão de movimento) é uma aproximação
              útil para organizar treino — não é laudo biomecânico. Você pode duplicar qualquer
              exercício da base e ajustar a classificação na sua cópia.
            </p>
            <p className="text-xs">
              Procedência completa em <code>data/training/exercise-base/ATTRIBUTION.md</code>.
            </p>
          </CardContent>
        </Card>
      </div>

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
        Favoritos no catálogo: {summary.favorites} · {groups.length} grupos musculares ·{" "}
        {equipment.length} equipamentos · incremento padrão {preferences.defaultIncrementKg}{" "}
        {preferences.weightUnit}. <Star className="inline size-3" /> Metas, medidas corporais e
        dashboards por período chegam na Subfase 17-E.
      </p>
    </div>
  );
}
