"use client";

/**
 * Fase 17-C — Preparação, etapa 1: de onde vem o treino de hoje.
 *
 * Sete caminhos, todos explícitos:
 *   programado · cadastrado · recente · favorito · vazio · repetir o último · duplicar sessão
 *
 * A escolha vira `origin_kind` na sessão — organizacional, não muda regra de cálculo nenhuma.
 * Depois de escolher, o usuário SEMPRE passa pela etapa 2 antes de começar: nada é iniciado
 * num toque só sem ele ver o que vai ser congelado.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarCheck,
  ClipboardList,
  Copy,
  History,
  Loader2,
  Plus,
  Repeat,
  Search,
  Star,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { normalizeText } from "@/lib/training/filters";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import { summarizeWorkout } from "@/lib/training/workout";
import { formatDuration } from "@/lib/training/timers";
import type {
  ScheduledWorkout,
  TrainingLocation,
  TrainingPreferences,
  TrainingWorkout,
} from "@/lib/training/types";
import type { SessionListItem } from "@/lib/training/session-queries";
import { createSession } from "@/lib/actions/training-sessions";

export function PrepareChooseClient({
  scheduledToday,
  workouts,
  recentSessions,
  locations,
  catalogSize,
  defaultWorkoutId,
  defaultScheduledId,
  preferences,
}: {
  scheduledToday: ScheduledWorkout[];
  workouts: TrainingWorkout[];
  recentSessions: SessionListItem[];
  locations: TrainingLocation[];
  catalogSize: number;
  defaultWorkoutId: string | null;
  defaultScheduledId: string | null;
  preferences: TrainingPreferences;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [emptyName, setEmptyName] = React.useState("");

  const start = async (input: Record<string, unknown>) => {
    setBusy(true);
    const result = await createSession({
      location_id: locations.find((item) => item.isDefault)?.id ?? null,
      ...input,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.push(`${TRAINING_BASE_PATH}/sessao/preparar?id=${result.data.id}`);
  };

  /*
   * Um link direto (`?treino=` ou `?planejado=`) DESTACA a escolha em vez de iniciar sozinho.
   * Preparar um treino cria uma sessão no banco — fazer isso por efeito, sem toque, deixaria
   * rascunhos órfãos toda vez que alguém abrisse o link por engano ou desse "voltar".
   */
  const highlighted =
    (defaultWorkoutId
      ? workouts.find((workout) => workout.id === defaultWorkoutId)
      : undefined) ?? null;

  const highlightedEntry =
    (defaultScheduledId
      ? scheduledToday.find((entry) => entry.id === defaultScheduledId)
      : undefined) ?? null;

  const term = normalizeText(search.trim());
  const filtered = term
    ? workouts.filter((workout) => normalizeText(workout.name).includes(term))
    : workouts;

  const favorites = workouts.filter((workout) => workout.isFavorite);
  const lastSession = recentSessions[0] ?? null;

  return (
    <div className="space-y-4">
      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Preparando o treino…
        </p>
      )}

      {(highlighted || highlightedEntry) && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {highlightedEntry?.workoutName ?? highlighted?.name ?? "Treino"}
            </CardTitle>
            <CardDescription>
              Você veio de um atalho. Confirme para revisar este treino antes de começar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="h-12"
              disabled={busy}
              onClick={() =>
                highlightedEntry
                  ? start({
                      origin_kind: "planejado",
                      workout_id: highlightedEntry.workoutId,
                      scheduled_workout_id: highlightedEntry.id,
                    })
                  : start({ origin_kind: "modelo", workout_id: highlighted?.id })
              }
            >
              Preparar este treino
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ───────── Programado para hoje ───────── */}
      {scheduledToday.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <CalendarCheck className="size-4 text-primary" />
              Programado para hoje
            </CardTitle>
            <CardDescription>
              Ao finalizar, este dia do calendário é marcado como concluído automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {scheduledToday.map((entry) => (
              <button
                key={entry.id}
                type="button"
                disabled={busy || !entry.workoutId}
                onClick={() =>
                  start({
                    origin_kind: "planejado",
                    workout_id: entry.workoutId,
                    scheduled_workout_id: entry.id,
                  })
                }
                className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-60"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {entry.workoutName ?? entry.title ?? "Treino removido"}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {entry.plannedTime ? `Previsto para ${entry.plannedTime.slice(0, 5)}` : "Sem horário definido"}
                    {entry.programName ? ` · ${entry.programName}` : ""}
                  </span>
                </span>
                <Badge>Programado</Badge>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ───────── Atalhos ───────── */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="size-4 text-primary" />
              Repetir o último treino
            </CardTitle>
            <CardDescription>
              {lastSession
                ? `${lastSession.workoutName} · ${formatDate(lastSession.sessionDate)} · ${lastSession.setCount} séries`
                : "Você ainda não tem nenhuma sessão registrada."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="h-11 w-full"
              variant="outline"
              disabled={busy || !lastSession}
              onClick={() => start({ origin_kind: "repetir" })}
            >
              Usar o último
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="size-4 text-primary" />
              Treino livre
            </CardTitle>
            <CardDescription>
              Comece vazio e vá adicionando exercícios durante o treino. {catalogSize} exercícios
              no catálogo.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label className="text-xs text-muted-foreground" htmlFor="nome-treino-livre">
              Nome do treino
            </Label>
            <Input
              id="nome-treino-livre"
              value={emptyName}
              onChange={(event) => setEmptyName(event.target.value)}
              placeholder="Ex.: Treino na academia do hotel"
              className="h-11"
            />
            <Button
              className="h-11 w-full"
              variant="outline"
              disabled={busy || emptyName.trim().length === 0}
              onClick={() => start({ origin_kind: "vazio", title: emptyName.trim() })}
            >
              Começar do zero
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ───────── Favoritos ───────── */}
      {favorites.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="size-4 text-primary" />
              Favoritos
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {favorites.map((workout) => (
              <Button
                key={workout.id}
                variant="outline"
                className="h-11"
                disabled={busy}
                onClick={() => start({ origin_kind: "favorito", workout_id: workout.id })}
              >
                {workout.name}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* ───────── Treinos cadastrados ───────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ClipboardList className="size-4 text-primary" />
            Treinos cadastrados
          </CardTitle>
          <CardDescription>
            {workouts.length} {workouts.length === 1 ? "treino disponível" : "treinos disponíveis"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar treino"
              className="h-11 pl-9"
              aria-label="Buscar treino"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum treino encontrado.
            </p>
          ) : (
            filtered.map((workout) => {
              const summary = summarizeWorkout(workout.exercises, {
                defaultRestSeconds: preferences.defaultRestSeconds,
              });
              return (
                <button
                  key={workout.id}
                  type="button"
                  disabled={busy}
                  onClick={() => start({ origin_kind: "modelo", workout_id: workout.id })}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent/50",
                    busy && "opacity-60",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{workout.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {summary.exerciseCount} exercícios · {summary.sets.working} séries de
                      trabalho
                      {summary.duration.totalMinutes > 0
                        ? ` · ~${summary.duration.totalMinutes} min`
                        : ""}
                      {workout.programName ? ` · ${workout.programName}` : ""}
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </CardContent>
      </Card>

      {/* ───────── Duplicar uma sessão passada ───────── */}
      {recentSessions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="size-4 text-primary" />
              Duplicar uma sessão passada
            </CardTitle>
            <CardDescription>
              O que foi EXECUTADO vira o plano de hoje — cargas e repetições entram como
              sugestão editável.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentSessions.map((item) => (
              <button
                key={item.id}
                type="button"
                disabled={busy}
                onClick={() => start({ origin_kind: "duplicar", source_session_id: item.id })}
                className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors hover:bg-accent/50 disabled:opacity-60"
              >
                <Copy className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{item.workoutName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDate(item.sessionDate)} · {item.setCount} séries
                    {item.totalSeconds ? ` · ${formatDuration(item.totalSeconds)}` : ""}
                  </span>
                </span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
