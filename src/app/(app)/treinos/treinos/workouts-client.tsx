"use client";

/**
 * Fase 17-B — Treinos · Lista de treinos-modelo (cliente).
 *
 * Filtros combináveis com contagem, seleção múltipla, ações em massa e exclusão que sempre
 * pergunta o destino do planejamento futuro.
 *
 * **Versões substituídas ficam escondidas por padrão.** Elas continuam existindo e legíveis —
 * mas mostrar "Treino A v1, v2, v3" numa lista de rotina só faria o usuário procurar qual é a
 * boa. Um filtro traz todas de volta.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ClipboardList,
  Clock,
  Copy,
  FolderInput,
  Layers,
  MoreHorizontal,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { useUrlText } from "@/lib/forms/use-url-text";
import { normalizeText } from "@/lib/training/filters";
import {
  TRAINING_BASE_PATH,
  TRAINING_GOALS,
  TRAINING_GOAL_LABELS,
  type TrainingGoal,
} from "@/lib/training/constants";
import { summarizeWorkout } from "@/lib/training/workout";
import type { TrainingProgram, TrainingWorkout } from "@/lib/training/types";
import {
  bulkTrainingWorkouts,
  deleteTrainingWorkout,
  duplicateTrainingWorkout,
  getTrainingWorkoutDependencies,
  moveWorkoutsToProgram,
} from "@/lib/actions/training-workouts";
import { WorkoutFormDialog } from "@/components/training/workout-form-dialog";
import {
  DeleteWithDestinationDialog,
  type DependencyLine,
} from "@/components/training/delete-with-destination-dialog";

const ALL = "__todos__";
const AVULSO = "__avulso__";

export function WorkoutsClient({
  workouts,
  programs,
  hoje,
  defaultRestSeconds,
}: {
  workouts: TrainingWorkout[];
  programs: TrainingProgram[];
  hoje: string;
  defaultRestSeconds: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // A busca responde na hora e alcança a URL depois da pausa — controlada pela URL, cada
  // tecla esperava a ida ao servidor desta página `force-dynamic`.
  const [search, setSearch] = useUrlText(searchParams.get("q") ?? "", (value) =>
    setParam("q", value || null),
  );
  const programFilter = searchParams.get("programa");
  const goalFilter = (searchParams.get("objetivo") as TrainingGoal | null) ?? null;
  const onlyFavorites = searchParams.get("favoritos") === "1";
  const showSuperseded = searchParams.get("versoes") === "1";
  const showArchived = searchParams.get("arquivados") === "1";

  const visible = React.useMemo(() => {
    const terms = normalizeText(search).split(/\s+/).filter(Boolean);
    return workouts.filter((workout) => {
      if (workout.isArchived !== showArchived) return false;
      if (!showSuperseded && workout.isSuperseded) return false;
      if (programFilter === AVULSO && workout.programId) return false;
      if (programFilter && programFilter !== AVULSO && workout.programId !== programFilter) {
        return false;
      }
      if (goalFilter && workout.goal !== goalFilter) return false;
      if (onlyFavorites && !workout.isFavorite) return false;
      if (terms.length === 0) return true;
      const haystack = normalizeText(
        `${workout.name} ${workout.shortName ?? ""} ${workout.description ?? ""}`,
      );
      return terms.every((term) => haystack.includes(term));
    });
  }, [workouts, search, programFilter, goalFilter, onlyFavorites, showSuperseded, showArchived]);

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<TrainingWorkout | null>(null);
  const [deleting, setDeleting] = React.useState<TrainingWorkout | null>(null);
  const [dependencies, setDependencies] = React.useState<DependencyLine[] | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Filtro novo limpa a seleção (ajuste durante o render, sem useEffect).
  const filterKey = searchParams.toString();
  const [lastFilterKey, setLastFilterKey] = React.useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setSelected(new Set());
  }

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(params.toString() ? `?${params}` : "?", { scroll: false });
  }

  async function openDelete(workout: TrainingWorkout) {
    setDeleting(workout);
    setDependencies(null);
    const result = await getTrainingWorkoutDependencies(workout.id, hoje);
    setDependencies(
      result.ok
        ? [
            { label: "dia(s) planejados a partir de hoje", count: result.data.scheduledFuture },
            { label: "dia(s) já passados (nunca são alterados)", count: result.data.scheduledPast },
            { label: "programa(s) que usam este treino", count: result.data.programs },
          ]
        : [],
    );
  }

  async function confirmDelete(destination: string, targetId: string | null) {
    if (!deleting) return;
    const result = await deleteTrainingWorkout({
      id: deleting.id,
      scheduled_destination: destination,
      target_workout_id: targetId,
    });

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.scheduledAffected > 0
        ? `Treino excluído. ${result.data.scheduledAffected} dia(s) planejados tratados como você escolheu.`
        : "Treino excluído.",
    );
    setDeleting(null);
    router.refresh();
  }

  async function duplicate(workout: TrainingWorkout) {
    setBusy(true);
    const result = await duplicateTrainingWorkout({ id: workout.id });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Cópia criada, com os exercícios e as séries.");
    router.refresh();
  }

  async function runBulk(action: string) {
    const ids = [...selected];
    if (ids.length === 0) return;

    setBusy(true);
    const result = await bulkTrainingWorkouts({ ids, action });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`${result.data.affected} treino(s) atualizados.`);
    setSelected(new Set());
    router.refresh();
  }

  async function moveSelected(programId: string | null) {
    const ids = [...selected];
    if (ids.length === 0) return;

    setBusy(true);
    const result = await moveWorkoutsToProgram({ ids, program_id: programId });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      programId ? "Treinos movidos para o programa." : "Treinos agora são avulsos.",
    );
    setSelected(new Set());
    router.refresh();
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Treinos"
        description="Modelos reutilizáveis: exercícios, séries, descansos e supersets. Um treino pode ser avulso ou compor vários programas."
      >
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Novo treino
        </Button>
      </PageHeader>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar treino…"
          className="h-9 w-full sm:w-56"
          aria-label="Buscar treino"
        />
        <Select
          value={programFilter ?? ALL}
          onValueChange={(value) => setParam("programa", value === ALL ? null : value)}
        >
          <SelectTrigger className="h-9 w-full sm:w-52" aria-label="Filtrar por programa">
            <SelectValue placeholder="Programa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os programas</SelectItem>
            <SelectItem value={AVULSO}>Sem programa (avulsos)</SelectItem>
            {programs
              .filter((program) => !program.isArchived)
              .map((program) => (
                <SelectItem key={program.id} value={program.id}>
                  {program.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={goalFilter ?? ALL}
          onValueChange={(value) => setParam("objetivo", value === ALL ? null : value)}
        >
          <SelectTrigger className="h-9 w-full sm:w-44" aria-label="Filtrar por objetivo">
            <SelectValue placeholder="Objetivo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os objetivos</SelectItem>
            {TRAINING_GOALS.map((goal) => (
              <SelectItem key={goal} value={goal}>
                {TRAINING_GOAL_LABELS[goal]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={onlyFavorites ? "default" : "outline"}
          size="sm"
          onClick={() => setParam("favoritos", onlyFavorites ? null : "1")}
        >
          <Star className="size-4" />
          Favoritos
        </Button>
        <Button
          variant={showSuperseded ? "default" : "outline"}
          size="sm"
          onClick={() => setParam("versoes", showSuperseded ? null : "1")}
        >
          Versões antigas
        </Button>
        <Button
          variant={showArchived ? "default" : "outline"}
          size="sm"
          onClick={() => setParam("arquivados", showArchived ? null : "1")}
        >
          Arquivados
        </Button>
        <span className="ml-auto text-xs text-muted-foreground">
          {visible.length} de {workouts.length}
        </span>
      </div>

      {selected.size > 0 && (
        // `top-18` = 4.5rem: mesma razão de exercises-client — em `top-2` a barra sumia
        // atrás do Header (`sticky top-0 h-16`) ao rolar a lista.
        <div className="sticky top-18 z-10 flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
          <span className="text-sm font-medium">
            {selected.size} {selected.size === 1 ? "selecionado" : "selecionados"}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk("favoritar")}>
              Favoritar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => runBulk(showArchived ? "restaurar" : "arquivar")}
            >
              {showArchived ? "Restaurar" : "Arquivar"}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => runBulk("duplicar")}>
              Duplicar
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy}>
                  <FolderInput className="size-4" />
                  Mover para
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => moveSelected(null)}>
                  Sem programa (avulsos)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {programs
                  .filter((program) => !program.isArchived)
                  .map((program) => (
                    <DropdownMenuItem key={program.id} onClick={() => moveSelected(program.id)}>
                      {program.name}
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={showArchived ? "Nenhum treino arquivado" : "Nenhum treino ainda"}
          description="Um treino-modelo guarda os exercícios, as séries e os descansos que você repete."
        >
          {!showArchived && (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-4" />
              Novo treino
            </Button>
          )}
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {visible.map((workout) => {
            const summary = summarizeWorkout(workout.exercises, { defaultRestSeconds });
            return (
              <li key={workout.id}>
                <div
                  className={cn(
                    "flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3 transition-colors",
                    selected.has(workout.id) && "ring-1 ring-primary/40",
                  )}
                >
                  <Checkbox
                    checked={selected.has(workout.id)}
                    onCheckedChange={() =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (next.has(workout.id)) next.delete(workout.id);
                        else next.add(workout.id);
                        return next;
                      })
                    }
                    aria-label={`Selecionar ${workout.name}`}
                  />

                  <Link
                    href={`${TRAINING_BASE_PATH}/treinos/${workout.id}`}
                    className="min-w-0 flex-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{workout.name}</span>
                      {workout.shortName && (
                        <Badge variant="secondary" className="shrink-0">
                          {workout.shortName}
                        </Badge>
                      )}
                      {workout.isSuperseded && (
                        <Badge variant="secondary" className="shrink-0 text-[10px]">
                          v{workout.version} (substituída)
                        </Badge>
                      )}
                      {workout.isFavorite && <Star className="size-3.5 fill-primary text-primary" />}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {workout.exercises.length}{" "}
                      {workout.exercises.length === 1 ? "exercício" : "exercícios"} ·{" "}
                      {summary.sets.working} séries de trabalho
                      {summary.duration.totalMinutes > 0
                        ? ` · ~${summary.duration.totalMinutes} min`
                        : ""}
                      {workout.programName ? ` · ${workout.programName}` : " · avulso"}
                    </p>
                  </Link>

                  {!summary.supersets.ok && (
                    <Badge variant="secondary" className="shrink-0 text-[10px] text-destructive">
                      superset com problema
                    </Badge>
                  )}

                  <div className="flex shrink-0 items-center gap-1">
                    <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
                      <Link href={`${TRAINING_BASE_PATH}/treinos/${workout.id}`}>
                        <Layers className="size-4" />
                        Montar
                      </Link>
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Ações de ${workout.name}`}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(workout);
                            setFormOpen(true);
                          }}
                        >
                          <Pencil className="size-4" />
                          Editar dados
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => duplicate(workout)}>
                          <Copy className="size-4" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant="destructive" onClick={() => openDelete(workout)}>
                          <Trash2 className="size-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {visible.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" />
          A duração é uma <strong>estimativa</strong>: execução das séries + descanso
          configurado. Não inclui troca de aparelho nem espera.
        </p>
      )}

      <WorkoutFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        workout={editing}
        programs={programs}
        onSaved={(id) => {
          if (id) router.push(`${TRAINING_BASE_PATH}/treinos/${id}`);
          else router.refresh();
        }}
      />

      {deleting && (
        <DeleteWithDestinationDialog
          open
          onOpenChange={(open) => !open && setDeleting(null)}
          title="Excluir treino-modelo"
          itemName={deleting.name}
          dependencies={dependencies ?? []}
          loadingDependencies={dependencies === null}
          options={[
            {
              value: "manter",
              label: "Manter os dias planejados",
              description:
                "Os dias continuam na agenda, marcados como “treino removido”. Nada some do seu histórico de planejamento.",
            },
            {
              value: "trocar",
              label: "Trocar por outro treino",
              description: "Os dias futuros passam a apontar para o treino que você escolher.",
              requiresTarget: true,
            },
            {
              value: "remover",
              label: "Remover os dias futuros",
              description: "Os dias planejados a partir de hoje são apagados. O passado fica.",
              tone: "destructive",
            },
          ]}
          targetLabel="Treino substituto"
          targets={workouts
            .filter((item) => item.id !== deleting.id && !item.isArchived && !item.isSuperseded)
            .map((item) => ({ id: item.id, name: item.name }))}
          confirmLabel="Excluir treino"
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}
