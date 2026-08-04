"use client";

/**
 * Fase 17-B — Treinos · Escolher exercícios para o treino.
 *
 * Reusa o catálogo inteiro já carregado e os filtros puros da 17-A (`applyExerciseFilters`) —
 * o construtor não tem um segundo mecanismo de busca. Seleção múltipla porque montar um treino
 * é escolher 6 a 10 exercícios de uma vez, não abrir o diálogo dez vezes.
 */
import * as React from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { TRACKING_TYPE_LABELS } from "@/lib/training/constants";
import { applyExerciseFilters } from "@/lib/training/filters";
import { EMPTY_EXERCISE_FILTERS, type ExerciseListItem, type MuscleGroup } from "@/lib/training/types";
import { addExercisesToWorkout } from "@/lib/actions/training-workouts";

const ALL = "__todos__";
const LIMIT = 40;

export function ExercisePickerDialog({
  open,
  onOpenChange,
  workoutId,
  exercises,
  groups,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workoutId: string;
  exercises: ExerciseListItem[];
  groups: MuscleGroup[];
  onAdded: () => void;
}) {
  const [search, setSearch] = React.useState("");
  const [groupId, setGroupId] = React.useState<string | null>(null);
  const [onlyFavorites, setOnlyFavorites] = React.useState(false);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [limit, setLimit] = React.useState(LIMIT);

  // Reabrir zera a escolha (ajuste durante o render, sem useEffect).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSelected([]);
      setSearch("");
      setLimit(LIMIT);
    }
  }

  const visible = React.useMemo(
    () =>
      applyExerciseFilters(exercises, {
        ...EMPTY_EXERCISE_FILTERS,
        search,
        muscleGroupId: groupId,
        onlyFavorites,
      }),
    [exercises, search, groupId, onlyFavorites],
  );

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function confirm() {
    if (selected.length === 0) return;
    setSaving(true);
    const result = await addExercisesToWorkout({ workout_id: workoutId, exercise_ids: selected });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      selected.length === 1
        ? "Exercício adicionado ao treino."
        : `${selected.length} exercícios adicionados ao treino.`,
    );
    onOpenChange(false);
    onAdded();
  }

  const shown = visible.slice(0, limit);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Adicionar exercícios</DialogTitle>
          <DialogDescription>
            Escolha quantos quiser — eles entram no fim do treino e você configura séries e
            ordem depois.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-2">
          <div className="relative w-full sm:flex-1">
            <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar exercício…"
              className="h-9 pl-8"
              aria-label="Buscar exercício"
              autoFocus
            />
          </div>
          <Select
            value={groupId ?? ALL}
            onValueChange={(value) => setGroupId(value === ALL ? null : value)}
          >
            <SelectTrigger className="h-9 w-full sm:w-48" aria-label="Filtrar por grupo muscular">
              <SelectValue placeholder="Grupo muscular" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todos os grupos</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant={onlyFavorites ? "default" : "outline"}
            size="sm"
            onClick={() => setOnlyFavorites((value) => !value)}
          >
            Favoritos
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nenhum exercício encontrado com esses filtros.
            </p>
          ) : (
            <ul className="space-y-1.5 py-1">
              {shown.map((exercise) => (
                <li key={exercise.id}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors",
                      selected.includes(exercise.id)
                        ? "border-primary/50 bg-primary/5"
                        : "hover:bg-accent",
                    )}
                  >
                    <Checkbox
                      checked={selected.includes(exercise.id)}
                      onCheckedChange={() => toggle(exercise.id)}
                      aria-label={`Selecionar ${exercise.displayName}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {exercise.displayName}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {exercise.primaryMuscleGroupName}
                        {exercise.equipmentName ? ` · ${exercise.equipmentName}` : ""} ·{" "}
                        {TRACKING_TYPE_LABELS[exercise.trackingType]}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}

          {visible.length > shown.length && (
            <div className="flex justify-center py-2">
              <Button variant="outline" size="sm" onClick={() => setLimit((value) => value + LIMIT)}>
                Mostrar mais ({visible.length - shown.length} restantes)
              </Button>
            </div>
          )}
        </div>

        <DialogFooter className="border-t pt-4">
          <span className="mr-auto text-sm text-muted-foreground">
            {selected.length} {selected.length === 1 ? "selecionado" : "selecionados"}
          </span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={selected.length === 0 || saving} onClick={confirm}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Adicionar ao treino
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
