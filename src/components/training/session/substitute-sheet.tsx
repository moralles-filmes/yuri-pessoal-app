"use client";

/**
 * Fase 17-C — Treinos · Substituir um exercício durante a sessão.
 *
 * ⛔ **SUBSTITUIÇÃO É REGISTRO, NÃO EQUIVALÊNCIA.**
 *
 * A tela agrupa alternativas por critérios OBJETIVOS — as cadastradas por você, o mesmo padrão
 * de movimento, o mesmo grupo muscular, as favoritas e a busca — e diz, com todas as letras,
 * que o sistema **não afirma** que os exercícios são equivalentes. Quem decide é o usuário; o
 * sistema só guarda o que foi decidido, com o motivo e o momento.
 *
 * A ordem das alternativas cadastradas é a prioridade DELE (17-A), não um ranking calculado.
 */
import * as React from "react";
import { Repeat, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { normalizeText } from "@/lib/training/filters";
import {
  MOVEMENT_PATTERN_LABELS,
  SUBSTITUTION_REASONS,
  SUBSTITUTION_REASON_LABELS,
  type MovementPattern,
  type SubstitutionReason,
} from "@/lib/training/constants";
import type { ExerciseListItem, SessionExercise } from "@/lib/training/types";

type Group = { title: string; hint: string; items: ExerciseListItem[] };

export function SubstituteSheet({
  open,
  onOpenChange,
  exercise,
  catalog,
  alternativeIds,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: SessionExercise | null;
  catalog: ExerciseListItem[];
  /** Alternativas que o próprio usuário cadastrou para este exercício (17-A / 17-B). */
  alternativeIds: string[];
  onConfirm: (input: {
    substituteExerciseId: string;
    reason: SubstitutionReason;
    reasonNotes: string | null;
  }) => void;
  busy?: boolean;
}) {
  const [search, setSearch] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState<SubstitutionReason | "">("");
  const [notes, setNotes] = React.useState("");

  // Reabrir a gaveta para outro exercício limpa a escolha (ajuste durante o render).
  const [lastExerciseId, setLastExerciseId] = React.useState(exercise?.id ?? null);
  if ((exercise?.id ?? null) !== lastExerciseId) {
    setLastExerciseId(exercise?.id ?? null);
    setSelected(null);
    setReason("");
    setNotes("");
    setSearch("");
  }

  if (!exercise) return null;

  const available = catalog.filter(
    (item) => !item.isArchived && item.id !== exercise.exerciseId,
  );

  const term = normalizeText(search.trim());
  const searched = term
    ? available.filter((item) => normalizeText(item.displayName).includes(term))
    : [];

  const groups: Group[] = term
    ? [
        {
          title: "Resultados da busca",
          hint: `${searched.length} ${searched.length === 1 ? "exercício" : "exercícios"}`,
          items: searched.slice(0, 30),
        },
      ]
    : [
        {
          title: "Alternativas que você cadastrou",
          hint: "Na ordem de prioridade que você definiu",
          items: alternativeIds
            .map((id) => available.find((item) => item.id === id))
            .filter((item): item is ExerciseListItem => Boolean(item)),
        },
        {
          title: "Mesmo padrão de movimento",
          hint: exercise.movementPattern
            ? MOVEMENT_PATTERN_LABELS[exercise.movementPattern as MovementPattern] ??
              "Classificação do catálogo"
            : "Classificação do catálogo",
          items: available
            .filter((item) => item.movementPattern === exercise.movementPattern)
            .slice(0, 12),
        },
        {
          title: "Mesmo grupo muscular",
          hint: exercise.muscleGroup ?? "Grupo principal",
          items: available
            .filter((item) => item.primaryMuscleGroupName === exercise.muscleGroup)
            .slice(0, 12),
        },
        {
          title: "Favoritos",
          hint: "Marcados por você",
          items: available.filter((item) => item.isFavorite).slice(0, 12),
        },
      ].filter((group) => group.items.length > 0);

  const canConfirm = Boolean(selected) && reason !== "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Repeat className="size-4 text-primary" />
            Substituir {exercise.exerciseName}
          </SheetTitle>
          <SheetDescription>
            As sugestões são agrupadas por padrão de movimento, grupo muscular e pelas
            alternativas que você cadastrou. <strong>O sistema não afirma que são equivalentes</strong> —
            ele apenas registra o que você escolheu, com o motivo e o momento.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar exercício"
              className="h-12 pl-9"
              aria-label="Buscar exercício"
            />
          </div>

          <div className="space-y-4">
            {groups.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Nenhum exercício encontrado com esse nome.
              </p>
            )}
            {groups.map((group) => (
              <div key={group.title}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {group.title}
                </p>
                <p className="text-xs text-muted-foreground">{group.hint}</p>
                <div className="mt-2 space-y-1.5">
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelected(item.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl border p-3 text-left transition-colors",
                        selected === item.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-accent/50",
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          {item.displayName}
                        </span>
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
              </div>
            ))}
          </div>

          {/* O motivo é obrigatório e sem valor padrão: um registro sem motivo não explica
              nada seis meses depois. */}
          <div>
            <Label className="text-xs text-muted-foreground">Motivo da substituição</Label>
            <Select
              value={reason}
              onValueChange={(value) => setReason(value as SubstitutionReason)}
            >
              <SelectTrigger className="mt-1.5 h-12 w-full">
                <SelectValue placeholder="Escolha o motivo" />
              </SelectTrigger>
              <SelectContent>
                {SUBSTITUTION_REASONS.map((item) => (
                  <SelectItem key={item} value={item}>
                    {SUBSTITUTION_REASON_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {reason === "dor_desconforto" && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
              <p>
                O registro fica guardado como você anotou. Este aplicativo não avalia lesão nem
                indica tratamento — se a dor persistir, procure orientação de um profissional.
              </p>
            </div>
          )}

          <div>
            <Label className="text-xs text-muted-foreground">Observação (opcional)</Label>
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
              className="mt-1.5"
            />
          </div>

          <Button
            className="h-12 w-full text-base"
            disabled={!canConfirm || busy}
            onClick={() => {
              if (!selected || reason === "") return;
              onConfirm({
                substituteExerciseId: selected,
                reason,
                reasonNotes: notes.trim() || null,
              });
            }}
          >
            Confirmar substituição
          </Button>
          <p className="text-xs text-muted-foreground">
            As séries que você já fez neste exercício continuam registradas.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
