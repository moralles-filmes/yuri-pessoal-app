"use client";

/**
 * Fase 17-A — Treinos · Catálogo de exercícios (cliente).
 *
 * Orquestra filtro, seleção múltipla, ações em massa e os diálogos. O catálogo inteiro vem de
 * uma consulta só e é filtrado em memória (`applyExerciseFilters`), o que deixa a busca
 * instantânea enquanto o usuário digita; a lista renderiza em blocos para não montar centenas
 * de nós de uma vez.
 *
 * O estado dos filtros mora na URL — voltar, recarregar ou salvar o link devolve exatamente
 * a mesma visão.
 *
 * A REGRA QUE A INTERFACE PRECISA RESPEITAR: exercício da base do sistema é somente leitura.
 * Editar e excluir não aparecem para ele; favoritar, arquivar e personalizar aparecem, porque
 * viram preferência do usuário — e a ação em massa relata quantos itens foram ignorados em
 * vez de silenciar.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Copy,
  Dumbbell,
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
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { TRACKING_TYPE_LABELS } from "@/lib/training/constants";
import {
  applyExerciseFilters,
  filtersFromParams,
  paramsFromFilters,
} from "@/lib/training/filters";
import type {
  Equipment,
  ExerciseAlternative,
  ExerciseFilterState,
  ExerciseListItem,
  MuscleGroup,
} from "@/lib/training/types";
import {
  bulkTrainingExercises,
  deleteTrainingExercise,
  duplicateTrainingExercise,
  setTrainingExercisePref,
} from "@/lib/actions/training-exercises";
import { ExerciseFilters } from "@/components/training/exercise-filters";
import { ExerciseFormDialog } from "@/components/training/exercise-form-dialog";
import { ExerciseDetailSheet } from "@/components/training/exercise-detail-sheet";

const PAGE_SIZE = 60;

export function ExercisesClient({
  exercises,
  groups,
  equipment,
  alternatives,
}: {
  exercises: ExerciseListItem[];
  groups: MuscleGroup[];
  equipment: Equipment[];
  alternatives: ExerciseAlternative[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = React.useMemo(
    () => filtersFromParams(Object.fromEntries(searchParams.entries())),
    [searchParams],
  );

  const visible = React.useMemo(
    () => applyExerciseFilters(exercises, filters),
    [exercises, filters],
  );

  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [detailOpen, setDetailOpen] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ExerciseListItem | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Filtro novo → volta ao topo da lista (ajuste durante o render, sem useEffect).
  const filterKey = searchParams.toString();
  const [lastFilterKey, setLastFilterKey] = React.useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setLimit(PAGE_SIZE);
    setSelected(new Set());
  }

  const detail = detailId ? (exercises.find((item) => item.id === detailId) ?? null) : null;

  function updateFilters(patch: Partial<ExerciseFilterState>) {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams(paramsFromFilters(next));
    router.replace(params.toString() ? `?${params}` : "?", { scroll: false });
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function toggleFavorite(exercise: ExerciseListItem) {
    setBusy(true);
    const result = await setTrainingExercisePref({
      exercise_id: exercise.id,
      is_favorite: !exercise.isFavorite,
    });
    setBusy(false);
    if (!result.ok) toast.error(result.error);
    else router.refresh();
  }

  async function toggleArchived(exercise: ExerciseListItem) {
    setBusy(true);
    const result = await setTrainingExercisePref({
      exercise_id: exercise.id,
      archived: !exercise.isArchived,
    });
    setBusy(false);
    if (!result.ok) toast.error(result.error);
    else {
      toast.success(exercise.isArchived ? "Restaurado." : "Arquivado.");
      router.refresh();
    }
  }

  async function duplicate(exercise: ExerciseListItem) {
    setBusy(true);
    const result = await duplicateTrainingExercise({ exercise_id: exercise.id });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Cópia criada. Agora ela é sua e pode ser editada.");
    router.refresh();
  }

  async function remove(exercise: ExerciseListItem) {
    if (!confirm(`Excluir “${exercise.displayName}”? Esta ação não pode ser desfeita.`)) return;
    setBusy(true);
    const result = await deleteTrainingExercise(exercise.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Exercício excluído.");
    setDetailOpen(false);
    router.refresh();
  }

  async function runBulk(action: string) {
    const ids = [...selected];
    if (ids.length === 0) return;

    if (action === "excluir") {
      const message = `Excluir ${ids.length} ${ids.length === 1 ? "exercício" : "exercícios"}? Exercícios da base do sistema serão ignorados. Esta ação não pode ser desfeita.`;
      if (!confirm(message)) return;
    }

    setBusy(true);
    const result = await bulkTrainingExercises({ ids, action });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const { affected, skipped, reason } = result.data;
    // Relatar o que foi ignorado é parte da ação: nada acontece em silêncio.
    toast.success(
      skipped > 0
        ? `${affected} ${affected === 1 ? "alterado" : "alterados"} · ${skipped} ignorado${skipped === 1 ? "" : "s"}${reason ? ` (${reason})` : ""}`
        : `${affected} ${affected === 1 ? "alterado" : "alterados"}.`,
    );
    setSelected(new Set());
    router.refresh();
  }

  const shown = visible.slice(0, limit);
  const allShownSelected = shown.length > 0 && shown.every((item) => selected.has(item.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Exercícios"
        description="Base do sistema + os seus. Duplique um exercício da base para editar à vontade."
      >
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Novo exercício
        </Button>
      </PageHeader>

      <ExerciseFilters
        filters={filters}
        groups={groups}
        equipment={equipment}
        total={exercises.length}
        visible={visible.length}
        onChange={updateFilters}
        onClear={() => router.replace("?", { scroll: false })}
      />

      {selected.size > 0 && (
        // `top-18` = 4.5rem: o Header do app é `sticky top-0 h-16`, então em `top-2` esta
        // barra de seleção rolava para trás dele e as ações em massa ficavam inalcançáveis.
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
              onClick={() => runBulk("desfavoritar")}
            >
              Desfavoritar
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => runBulk(filters.showArchived ? "restaurar" : "arquivar")}
            >
              {filters.showArchived ? "Restaurar" : "Arquivar"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => runBulk("excluir")}
            >
              Excluir
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          </div>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="Nenhum exercício encontrado"
          description="Ajuste os filtros ou cadastre um exercício seu."
        >
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="size-4" />
            Novo exercício
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="flex items-center gap-2 px-1">
            <Checkbox
              checked={allShownSelected}
              onCheckedChange={(checked) => {
                setSelected((current) => {
                  const next = new Set(current);
                  for (const item of shown) {
                    if (checked) next.add(item.id);
                    else next.delete(item.id);
                  }
                  return next;
                });
              }}
              aria-label="Selecionar todos os exercícios visíveis"
            />
            <span className="text-xs text-muted-foreground">Selecionar visíveis</span>
          </div>

          <ul className="space-y-2">
            {shown.map((exercise) => (
              <li key={exercise.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-xl border bg-card p-3 transition-colors",
                    selected.has(exercise.id) && "ring-1 ring-primary/40",
                  )}
                >
                  <Checkbox
                    checked={selected.has(exercise.id)}
                    onCheckedChange={() => toggleSelected(exercise.id)}
                    aria-label={`Selecionar ${exercise.displayName}`}
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setDetailId(exercise.id);
                      setDetailOpen(true);
                    }}
                    className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <p className="truncate text-sm font-medium">{exercise.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {exercise.primaryMuscleGroupName}
                      {exercise.equipmentName ? ` · ${exercise.equipmentName}` : ""}
                      {" · "}
                      {TRACKING_TYPE_LABELS[exercise.trackingType]}
                    </p>
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {!exercise.isSystemExercise && (
                      <Badge variant="secondary" className="hidden sm:inline-flex">
                        Seu
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      disabled={busy}
                      onClick={() => toggleFavorite(exercise)}
                      aria-label={
                        exercise.isFavorite
                          ? `Remover ${exercise.displayName} dos favoritos`
                          : `Adicionar ${exercise.displayName} aos favoritos`
                      }
                      aria-pressed={exercise.isFavorite}
                    >
                      <Star
                        className={cn(
                          "size-4",
                          exercise.isFavorite && "fill-primary text-primary",
                        )}
                      />
                    </Button>

                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label={`Ações de ${exercise.displayName}`}
                        >
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {exercise.isEditable && (
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(exercise);
                              setFormOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                            Editar
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem onClick={() => duplicate(exercise)}>
                          <Copy className="size-4" />
                          Duplicar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => toggleArchived(exercise)}>
                          {exercise.isArchived ? "Restaurar" : "Arquivar"}
                        </DropdownMenuItem>
                        {exercise.isEditable && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              variant="destructive"
                              onClick={() => remove(exercise)}
                            >
                              <Trash2 className="size-4" />
                              Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {visible.length > shown.length && (
            <div className="flex justify-center">
              <Button variant="outline" onClick={() => setLimit((value) => value + PAGE_SIZE)}>
                Mostrar mais ({visible.length - shown.length} restantes)
              </Button>
            </div>
          )}
        </>
      )}

      <ExerciseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        exercise={editing}
        groups={groups}
        equipment={equipment}
        onSaved={() => router.refresh()}
      />

      <ExerciseDetailSheet
        open={detailOpen}
        onOpenChange={setDetailOpen}
        exercise={detail}
        allExercises={exercises}
        alternatives={alternatives}
        onChanged={() => router.refresh()}
      />
    </div>
  );
}
