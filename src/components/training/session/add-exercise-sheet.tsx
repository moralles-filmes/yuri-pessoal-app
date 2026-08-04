"use client";

/**
 * Fase 17-C — Treinos · Acrescentar um exercício durante a sessão.
 *
 * Gaveta própria em vez de reusar `exercise-picker-dialog.tsx` (17-B): aquele diálogo grava
 * direto no TREINO-MODELO, e aqui o exercício entra só nesta execução — marcado como `is_extra`
 * para a 17-D saber que a execução divergiu do planejado. Misturar os dois faria "adicionei um
 * exercício hoje" virar "mudei meu treino para sempre".
 */
import * as React from "react";
import { Plus, Search, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/training/filters";
import type { ExerciseListItem } from "@/lib/training/types";

const LIMIT = 40;

export function AddExerciseSheet({
  open,
  onOpenChange,
  catalog,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: ExerciseListItem[];
  onConfirm: (exerciseId: string) => void;
}) {
  const [search, setSearch] = React.useState("");
  const [onlyFavorites, setOnlyFavorites] = React.useState(false);

  // Reabrir zera a busca (ajuste durante o render, sem `useEffect`).
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSearch("");
      setOnlyFavorites(false);
    }
  }

  const term = normalizeText(search.trim());
  const results = catalog
    .filter((item) => !item.isArchived)
    .filter((item) => (onlyFavorites ? item.isFavorite : true))
    .filter((item) => (term ? normalizeText(item.displayName).includes(term) : true))
    .slice(0, LIMIT);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Plus className="size-4 text-primary" />
            Adicionar exercício ao treino de hoje
          </SheetTitle>
          <SheetDescription>
            Entra só nesta sessão. O treino-modelo continua como está.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-3 px-4 pb-6">
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar exercício"
                className="h-12 pl-9"
                aria-label="Buscar exercício"
              />
            </div>
            <Button
              variant={onlyFavorites ? "default" : "outline"}
              size="icon"
              className="size-12 shrink-0"
              onClick={() => setOnlyFavorites((value) => !value)}
              aria-label="Somente favoritos"
              aria-pressed={onlyFavorites}
            >
              <Star className={cn("size-4", onlyFavorites && "fill-current")} />
            </Button>
          </div>

          {results.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum exercício encontrado.
            </p>
          ) : (
            <div className="space-y-1.5">
              {results.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onConfirm(item.id);
                    onOpenChange(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-xl border p-3 text-left transition-colors hover:bg-accent/50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.displayName}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {item.primaryMuscleGroupName}
                      {item.equipmentName ? ` · ${item.equipmentName}` : ""}
                    </span>
                  </span>
                  {item.isFavorite && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      Favorito
                    </Badge>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
