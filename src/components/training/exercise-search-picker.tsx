"use client";

/**
 * Treinos · Escolher UM exercício do catálogo, digitando.
 *
 * ⛔ O PROBLEMA QUE ISTO RESOLVE: escolher uma alternativa ou um substituto era um `Select`
 * cru com o catálogo inteiro dentro — mais de cem itens para achar rolando, sem digitar nada.
 * Com 107 exercícios isso não é uma lista, é um labirinto.
 *
 * A busca é a mesma do catálogo (`matchesSearch`, da 17-A): alcança nome, apelido, grupo
 * muscular e equipamento, com os termos em qualquer ordem. Um segundo mecanismo de busca faria
 * "supino incl" achar aqui o que não acha lá.
 *
 * O estado é local — este seletor não mexe na URL.
 */
import * as React from "react";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { matchesSearch } from "@/lib/training/filters";
import type { ExerciseListItem } from "@/lib/training/types";

/** Teto de itens desenhados de uma vez — a busca é o caminho, não a rolagem infinita. */
const LIMIT = 50;

export function ExerciseSearchPicker({
  exercises,
  onSelect,
  triggerLabel,
  title,
  description,
  disabled,
  className,
}: {
  exercises: ExerciseListItem[];
  onSelect: (exerciseId: string) => void;
  triggerLabel: string;
  title: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  // Reabrir começa do zero (ajuste durante o render, sem `useEffect`).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setSearch("");
  }

  const results = React.useMemo(
    () => exercises.filter((exercise) => matchesSearch(exercise, search)),
    [exercises, search],
  );
  const shown = results.slice(0, LIMIT);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled || exercises.length === 0}
          className={className}
        >
          <Search className="size-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      {/* `sm:max-w-lg` porque o `max-w-*` sem prefixo não vence o `sm:max-w-sm` da primitiva. */}
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por nome, grupo ou equipamento…"
            aria-label="Buscar exercício"
            className="h-10 pl-9"
            autoFocus
          />
        </div>

        <p className="text-xs text-muted-foreground" aria-live="polite">
          {results.length === 0
            ? "Nenhum exercício encontrado."
            : `${results.length} ${results.length === 1 ? "exercício" : "exercícios"}`}
        </p>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-1.5 py-1">
            {shown.map((exercise) => (
              <button
                key={exercise.id}
                type="button"
                onClick={() => {
                  onSelect(exercise.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg border p-2.5 text-left transition-colors hover:bg-accent"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {exercise.displayName}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {exercise.primaryMuscleGroupName}
                    {exercise.equipmentName ? ` · ${exercise.equipmentName}` : ""}
                  </span>
                </span>
                {exercise.isFavorite && (
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    Favorito
                  </Badge>
                )}
              </button>
            ))}
          </div>

          {results.length > shown.length && (
            <p className="py-2 text-center text-xs text-muted-foreground">
              Mostrando {shown.length} de {results.length} — refine a busca para ver o resto.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
