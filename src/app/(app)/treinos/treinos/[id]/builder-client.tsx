"use client";

/**
 * Fase 17-B — Treinos · Construtor de treino-modelo.
 *
 * Arrastar para reordenar (com alternativa por teclado), configurar séries, agrupar superset,
 * definir alternativas — tudo sobre o MESMO treino, sem sair da tela.
 *
 * ⛔ DUAS COISAS QUE ESTA TELA NÃO PODE ERRAR:
 *
 * • **Superset furado é bloqueado.** A validação vem de `validateSupersets` (pura, testada) e
 *   roda também no servidor. Uma ordem impossível aqui viraria uma sessão impossível na 17-C.
 * • **Todo número exibido sai de `workout.ts`.** Total de séries, séries por grupo muscular e
 *   duração estimada saem de `summarizeWorkout` — a mesma função que a lista de treinos usa,
 *   para as duas telas nunca discordarem.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  Dumbbell,
  GitBranch,
  Layers,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { SortableList } from "@/components/shared/sortable-list";
import { StatCard } from "@/components/shared/stat-card";
import { cn } from "@/lib/utils";
import {
  SET_TYPE_LABELS,
  TRAINING_BASE_PATH,
  TRAINING_GOAL_LABELS,
} from "@/lib/training/constants";
import {
  expandPlannedSets,
  repRangeLabel,
  secondsLabel,
  summarizeWorkout,
} from "@/lib/training/workout";
import type {
  ExerciseListItem,
  MuscleGroup,
  TrainingProgram,
  TrainingWorkout,
  WorkoutExercise,
} from "@/lib/training/types";
import {
  createWorkoutVersion,
  duplicateTrainingWorkout,
  removeWorkoutExercise,
  reorderWorkoutExercises,
} from "@/lib/actions/training-workouts";
import { ExercisePickerDialog } from "@/components/training/exercise-picker-dialog";
import { WorkoutExerciseSheet } from "@/components/training/workout-exercise-sheet";
import { WorkoutFormDialog } from "@/components/training/workout-form-dialog";

export function WorkoutBuilderClient({
  workout,
  versions,
  programs,
  catalog,
  groups,
  defaultRestSeconds,
}: {
  workout: TrainingWorkout;
  versions: TrainingWorkout[];
  programs: TrainingProgram[];
  catalog: ExerciseListItem[];
  groups: MuscleGroup[];
  defaultRestSeconds: number;
}) {
  const router = useRouter();

  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const editing = workout.exercises.find((item) => item.id === editingId) ?? null;
  const groupName = React.useMemo(
    () => new Map(groups.map((group) => [group.id, group.name])),
    [groups],
  );

  const summary = React.useMemo(
    () => summarizeWorkout(workout.exercises, { defaultRestSeconds }),
    [workout.exercises, defaultRestSeconds],
  );

  async function reorder(orderedIds: string[]) {
    setBusy(true);
    const result = await reorderWorkoutExercises({ ids: orderedIds });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  async function moveBy(id: string, offset: number) {
    const ids = workout.exercises.map((item) => item.id);
    const from = ids.indexOf(id);
    const to = from + offset;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    next.splice(to, 0, next.splice(from, 1)[0]);
    await reorder(next);
  }

  async function remove(item: WorkoutExercise) {
    if (
      !confirm(
        `Tirar “${item.exerciseName}” deste treino? As séries configuradas dele também saem. O exercício continua no catálogo.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const result = await removeWorkoutExercise(item.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Exercício removido do treino.");
    router.refresh();
  }

  async function saveAsNewVersion() {
    if (
      !confirm(
        `Salvar como nova versão cria o “${workout.name} v${workout.version + 1}” e arquiva a versão atual — que continua legível para comparação. O planejamento futuro passa a apontar para a nova. Continuar?`,
      )
    ) {
      return;
    }
    setBusy(true);
    const result = await createWorkoutVersion({ id: workout.id });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Versão ${result.data.version} criada. A anterior ficou arquivada e legível.`);
    router.push(`${TRAINING_BASE_PATH}/treinos/${result.data.id}`);
  }

  async function duplicate() {
    setBusy(true);
    const result = await duplicateTrainingWorkout({ id: workout.id });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Cópia criada.");
    router.push(`${TRAINING_BASE_PATH}/treinos/${result.data.id}`);
  }

  const otherVersions = versions.filter((item) => item.id !== workout.id);

  return (
    <div className="space-y-5">
      <PageHeader
        title={workout.name}
        description={
          workout.description ??
          `${TRAINING_GOAL_LABELS[workout.goal]}${workout.programName ? ` · ${workout.programName}` : " · avulso"}`
        }
      >
        <Button variant="outline" size="sm" onClick={() => setFormOpen(true)}>
          <Pencil className="size-4" />
          Editar dados
        </Button>
        <Button size="sm" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4" />
          Adicionar exercícios
        </Button>
      </PageHeader>

      {workout.isSuperseded && (
        <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          Esta é uma <strong>versão anterior</strong> (v{workout.version}), mantida para
          comparação. Ela continua legível, mas o planejamento futuro aponta para a versão mais
          nova.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Exercícios"
          value={String(summary.exerciseCount)}
          icon={Dumbbell}
          hint={workout.shortName ? `Apelido: ${workout.shortName}` : "Sem apelido"}
        />
        <StatCard
          label="Séries de trabalho"
          value={String(summary.sets.working)}
          icon={Layers}
          hint={
            summary.sets.warmup > 0
              ? `+ ${summary.sets.warmup} de aquecimento`
              : "Nenhum aquecimento marcado"
          }
        />
        <StatCard
          label="Duração estimada"
          value={summary.duration.totalMinutes > 0 ? `${summary.duration.totalMinutes} min` : "—"}
          icon={Clock}
          hint={
            summary.duration.isPartial
              ? "Parcial: alguma série está sem alvo"
              : `Execução ${secondsLabel(summary.duration.executionSeconds)} + descanso ${secondsLabel(summary.duration.restSeconds)}`
          }
        />
        <StatCard
          label="Versão"
          value={`v${workout.version}`}
          icon={GitBranch}
          hint={
            otherVersions.length > 0
              ? `${otherVersions.length} outra(s) versão(ões)`
              : "Versão única"
          }
        />
      </div>

      {!summary.supersets.ok && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="size-4" />
            Superset com problema
          </p>
          <ul className="mt-1.5 space-y-1 text-sm text-muted-foreground">
            {summary.supersets.issues.map((issue) => (
              <li key={`${issue.group}-${issue.kind}`}>{issue.message}</li>
            ))}
          </ul>
        </div>
      )}

      {workout.exercises.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Treino ainda sem exercícios"
          description="Adicione exercícios do catálogo e configure séries, descanso e supersets."
        >
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <Plus className="size-4" />
            Adicionar exercícios
          </Button>
        </EmptyState>
      ) : (
        <SortableList
          items={workout.exercises}
          getId={(item) => item.id}
          onReorder={reorder}
          className="space-y-2"
          renderItem={(item, handle) => (
            <ExerciseRow
              item={item}
              handle={handle}
              busy={busy}
              onConfigure={() => setEditingId(item.id)}
              onUp={() => moveBy(item.id, -1)}
              onDown={() => moveBy(item.id, 1)}
              onRemove={() => remove(item)}
            />
          )}
        />
      )}

      {/* Séries por grupo muscular — principal e secundário SEPARADOS, sempre. */}
      {summary.exerciseCount > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Séries por grupo muscular</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <MuscleBars
              title="Como grupo principal"
              counts={summary.muscles.primary}
              names={groupName}
            />
            <MuscleBars
              title="Como grupo secundário"
              counts={summary.muscles.secondary}
              names={groupName}
            />
            <p className="text-xs text-muted-foreground">
              As duas contagens ficam separadas de propósito. Somar as duas faria uma remada
              parecer treinar bíceps tanto quanto costas.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" disabled={busy} onClick={duplicate}>
          <Copy className="size-4" />
          Duplicar treino
        </Button>
        <Button variant="outline" size="sm" disabled={busy} onClick={saveAsNewVersion}>
          <GitBranch className="size-4" />
          Salvar como nova versão
        </Button>
        <Button asChild variant="ghost" size="sm">
          <Link href={`${TRAINING_BASE_PATH}/treinos`}>Voltar aos treinos</Link>
        </Button>
      </div>

      {otherVersions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Outras versões deste treino</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {otherVersions
                .sort((a, b) => b.version - a.version)
                .map((version) => (
                  <li key={version.id}>
                    <Link
                      href={`${TRAINING_BASE_PATH}/treinos/${version.id}`}
                      className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Badge variant="secondary" className="shrink-0">
                        v{version.version}
                      </Badge>
                      <span className="min-w-0 flex-1 truncate">{version.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {version.exercises.length} exercícios
                      </span>
                    </Link>
                  </li>
                ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Versões antigas servem para comparar intenções. O que protege o histórico de
              execução é o registro da sessão, que chega na Subfase 17-C.
            </p>
          </CardContent>
        </Card>
      )}

      <ExercisePickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        workoutId={workout.id}
        exercises={catalog}
        groups={groups}
        onAdded={() => router.refresh()}
      />

      <WorkoutFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        workout={workout}
        programs={programs}
        onSaved={() => router.refresh()}
      />

      <WorkoutExerciseSheet
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditingId(null)}
        item={editing}
        catalog={catalog}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}

/* ───────────────────────────── Linha do exercício ───────────────────────────── */

function ExerciseRow({
  item,
  handle,
  busy,
  onConfigure,
  onUp,
  onDown,
  onRemove,
}: {
  item: WorkoutExercise;
  handle: React.ReactNode;
  busy: boolean;
  onConfigure: () => void;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  const sets = expandPlannedSets(item);
  const first = sets[0];

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
      {handle}

      <button
        type="button"
        onClick={onConfigure}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
          <span className="truncate">{item.exerciseName}</span>
          {item.supersetGroup && (
            <Badge variant="secondary" className="shrink-0">
              Bloco {item.supersetGroup}
            </Badge>
          )}
          {item.isWarmup && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              aquecimento
            </Badge>
          )}
          {item.sets.length > 0 && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              séries configuradas
            </Badge>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {sets.length} {sets.length === 1 ? "série" : "séries"}
          {first?.targetRepsMin !== null || first?.targetRepsMax !== null
            ? ` × ${repRangeLabel(first.targetRepsMin, first.targetRepsMax)}`
            : ""}
          {first?.targetDurationSeconds !== null && first?.targetDurationSeconds !== undefined
            ? ` × ${secondsLabel(first.targetDurationSeconds)}`
            : ""}
          {first?.restSeconds !== null && first?.restSeconds !== undefined
            ? ` · descanso ${secondsLabel(first.restSeconds)}`
            : ""}
          {" · "}
          {item.primaryMuscleGroupName}
          {item.setType !== "trabalho" ? ` · ${SET_TYPE_LABELS[item.setType]}` : ""}
        </p>
      </button>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={busy}
          onClick={onUp}
          aria-label={`Mover ${item.exerciseName} para cima`}
        >
          <ChevronUp className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={busy}
          onClick={onDown}
          aria-label={`Mover ${item.exerciseName} para baixo`}
        >
          <ChevronDown className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={onConfigure}
          aria-label={`Configurar ${item.exerciseName}`}
        >
          <Settings2 className="size-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          disabled={busy}
          onClick={onRemove}
          aria-label={`Tirar ${item.exerciseName} do treino`}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────────── Barras por grupo ───────────────────────────── */

function MuscleBars({
  title,
  counts,
  names,
}: {
  title: string;
  counts: Record<string, number>;
  names: Map<string, string>;
}) {
  const rows = Object.entries(counts)
    .map(([id, count]) => ({ id, name: names.get(id) ?? "Sem grupo", count }))
    .sort((a, b) => b.count - a.count);

  if (rows.length === 0) {
    return (
      <div>
        <p className="text-xs font-medium text-muted-foreground">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">Nenhum.</p>
      </div>
    );
  }

  const max = Math.max(...rows.map((row) => row.count));

  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center gap-2">
            <span className="w-32 shrink-0 truncate text-sm">{row.name}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
              <span
                className={cn("block h-full rounded-full bg-primary/70")}
                style={{ width: `${(row.count / max) * 100}%` }}
              />
            </span>
            <span className="w-6 shrink-0 text-right text-sm tabular-nums">{row.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
