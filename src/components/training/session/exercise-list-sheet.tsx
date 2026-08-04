"use client";

/**
 * Fase 17-C — Treinos · Lista de exercícios da sessão (gaveta).
 *
 * Reordenar, escolher outro como próximo, pular, voltar depois, mandar para o fim, substituir
 * e acrescentar exercício.
 *
 * ⚠️ **Nenhuma série registrada se perde em nenhuma dessas ações.** As séries pertencem ao
 * exercício, não à posição — a reordenação mexe só em `executed_position`, e a `planned_position`
 * (a ordem com que o treino foi planejado) fica intacta para a 17-D comparar depois.
 *
 * Reordenar tem alternativa por teclado (as setas ↑ ↓), porque arrastar não é acessível e
 * porque no meio de um treino, com uma mão, arrastar é justamente o gesto mais difícil.
 */
import * as React from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ListOrdered,
  Play,
  Plus,
  Repeat,
  SkipForward,
  Undo2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { DERIVED_EXERCISE_STATUS_LABELS } from "@/lib/training/constants";
import { isSetDone } from "@/lib/training/session-machine";
import type { SessionExercise } from "@/lib/training/types";

export function ExerciseListSheet({
  open,
  onOpenChange,
  exercises,
  currentExerciseId,
  onSelect,
  onMove,
  onSkip,
  onResume,
  onSubstitute,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercises: SessionExercise[];
  currentExerciseId: string | null;
  onSelect: (exerciseId: string) => void;
  onMove: (exerciseId: string, mode: "proximo" | "fim" | "cima" | "baixo") => void;
  onSkip: (exerciseId: string) => void;
  onResume: (exerciseId: string) => void;
  onSubstitute: (exerciseId: string) => void;
  onAdd: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[88vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <ListOrdered className="size-4 text-primary" />
            Exercícios do treino
          </SheetTitle>
          <SheetDescription>
            Reordenar, pular e substituir não apagam nenhuma série já registrada.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-2 px-4 pb-6">
          {exercises.map((exercise, index) => {
            const done = exercise.sets.filter((set) => isSetDone(set.status)).length;
            const isCurrent = exercise.id === currentExerciseId;
            const isSkipped = exercise.status === "pulado";
            const isSubstituted = exercise.status === "substituido";

            return (
              <div
                key={exercise.id}
                className={cn(
                  "rounded-xl border p-3",
                  isCurrent && "border-primary bg-primary/5",
                  (isSkipped || isSubstituted) && "opacity-70",
                )}
              >
                <div className="flex items-start gap-2">
                  <span className="w-5 shrink-0 pt-0.5 text-center text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{exercise.exerciseName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {done} de {exercise.sets.length}{" "}
                      {exercise.sets.length === 1 ? "série" : "séries"}
                      {exercise.muscleGroup ? ` · ${exercise.muscleGroup}` : ""}
                      {exercise.supersetGroup ? ` · bloco ${exercise.supersetGroup}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary" className="shrink-0 text-[10px]">
                    {DERIVED_EXERCISE_STATUS_LABELS[exercise.derivedStatus]}
                  </Badge>
                </div>

                {exercise.skipReason && (
                  <p className="mt-1.5 pl-7 text-xs text-muted-foreground">
                    Motivo: {exercise.skipReason}
                  </p>
                )}

                {!isSubstituted && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-7">
                    {!isCurrent && !isSkipped && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => {
                          onSelect(exercise.id);
                          onOpenChange(false);
                        }}
                      >
                        <Play className="size-3.5" />
                        Fazer agora
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      onClick={() => onMove(exercise.id, "cima")}
                      disabled={index === 0}
                      aria-label={`Mover ${exercise.exerciseName} para cima`}
                    >
                      <ArrowUp className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-9"
                      onClick={() => onMove(exercise.id, "baixo")}
                      disabled={index === exercises.length - 1}
                      aria-label={`Mover ${exercise.exerciseName} para baixo`}
                    >
                      <ArrowDown className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9"
                      onClick={() => onMove(exercise.id, "fim")}
                    >
                      <ChevronsDown className="size-3.5" />
                      Para o fim
                    </Button>
                    {isSkipped ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9"
                        onClick={() => onResume(exercise.id)}
                      >
                        <Undo2 className="size-3.5" />
                        Voltar
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9"
                        onClick={() => onSkip(exercise.id)}
                      >
                        <SkipForward className="size-3.5" />
                        Pular
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9"
                      onClick={() => onSubstitute(exercise.id)}
                    >
                      <Repeat className="size-3.5" />
                      Substituir
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          <Button variant="outline" className="h-12 w-full" onClick={onAdd}>
            <Plus className="size-4" />
            Adicionar exercício
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
