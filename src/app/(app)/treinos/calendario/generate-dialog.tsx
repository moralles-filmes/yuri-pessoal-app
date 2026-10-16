"use client";

import * as React from "react";
import {
  CalendarRange,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import {
  WEEKDAY_SHORT_LABELS,
} from "@/lib/training/constants";
import {
  addDaysIso,
  startOfWeekIso,
} from "@/lib/training/schedule";
import type { TrainingProgram, TrainingWorkout } from "@/lib/training/types";
import {
  applyProgramToSchedule,
  generateTrainingSchedule,
} from "@/lib/actions/training-schedule";
import { mensagemDaAction } from "@/lib/forms/mensagem-da-action";
import { Field } from "@/components/training/field";

export function GenerateDialog({
  open,
  workouts,
  programs,
  reference,
  weekStartsOn,
  onClose,
  onSaved,
}: {
  /** Quem decide é o pai: carregado sob demanda, o diálogo fica montado e anima o fechamento. */
  open: boolean;
  workouts: TrainingWorkout[];
  programs: TrainingProgram[];
  reference: string;
  weekStartsOn: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const weekStart = startOfWeekIso(reference, weekStartsOn);

  const [mode, setMode] = React.useState<"rotina" | "programa">("rotina");
  const [from, setFrom] = React.useState(weekStart);
  const [to, setTo] = React.useState(addDaysIso(weekStart, 27));
  const [weekdays, setWeekdays] = React.useState<number[]>([1, 3, 5]);
  const [rotation, setRotation] = React.useState<string[]>([]);
  const [weekInterval, setWeekInterval] = React.useState("1");
  const [includeRest, setIncludeRest] = React.useState(false);
  const [time, setTime] = React.useState("");
  const [programId, setProgramId] = React.useState("");
  const [conflict, setConflict] = React.useState<"pular" | "substituir">("pular");
  const [saving, setSaving] = React.useState(false);

  const available = workouts.filter((workout) => !workout.isArchived && !workout.isSuperseded);

  async function save() {
    setSaving(true);
    const result =
      mode === "programa"
        ? await applyProgramToSchedule({
            program_id: programId,
            from,
            to,
            conflict,
            planned_time: time || null,
          })
        : await generateTrainingSchedule({
            from,
            to,
            weekdays,
            workout_ids: rotation,
            week_interval: weekInterval,
            include_rest_days: includeRest,
            planned_time: time || null,
            conflict,
          });
    setSaving(false);

    if (!result.ok) {
      toast.error(mensagemDaAction(result));
      return;
    }
    const { created, skipped, replaced } = result.data;
    toast.success(
      `${created} dia(s) planejados${replaced > 0 ? ` · ${replaced} substituídos` : ""}${
        skipped > 0 ? ` · ${skipped} dias preservados por já terem conteúdo` : ""
      }.`,
    );
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Gerar rotina</DialogTitle>
          <DialogDescription>
            Escolha os dias da semana e o rodízio de treinos. Nada que já está planejado é
            sobrescrito sem você mandar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-2">
            <Button
              aria-pressed={mode === "rotina"}
              variant={mode === "rotina" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("rotina")}
            >
              Montar rotina
            </Button>
            <Button
              aria-pressed={mode === "programa"}
              variant={mode === "programa" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("programa")}
            >
              Aplicar um programa
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="De">
              <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </Field>
            <Field label="Até">
              <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </Field>
          </div>

          {mode === "programa" ? (
            <Field
              label="Programa"
              hint="Usa os treinos do programa como rodízio e os dias sugeridos de cada um."
            >
              <Select value={programId} onValueChange={setProgramId}>
                <SelectTrigger aria-label="Programa a aplicar">
                  <SelectValue placeholder="Escolha o programa" />
                </SelectTrigger>
                <SelectContent>
                  {programs
                    .filter((program) => !program.isArchived)
                    .map((program) => (
                      <SelectItem key={program.id} value={program.id}>
                        {program.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          ) : (
            <>
              <Field label="Dias de treino">
                <div className="flex flex-wrap gap-1.5">
                  {WEEKDAY_SHORT_LABELS.map((label, weekday) => {
                    const on = weekdays.includes(weekday);
                    return (
                      <button
                        key={weekday}
                        type="button"
                        onClick={() =>
                          setWeekdays((current) =>
                            current.includes(weekday)
                              ? current.filter((day) => day !== weekday)
                              : [...current, weekday],
                          )
                        }
                        aria-pressed={on}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          on ? "border-primary/50 bg-primary/10 font-medium" : "hover:bg-accent",
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field
                label="Rodízio de treinos"
                hint="Clique na ordem do rodízio (A, B, C). O ciclo continua de uma semana para a outra."
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {available.slice(0, 20).map((workout) => (
                      <button
                        key={workout.id}
                        type="button"
                        onClick={() => setRotation((current) => [...current, workout.id])}
                        className="rounded-lg border px-2.5 py-1 text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {workout.shortName || workout.name}
                      </button>
                    ))}
                  </div>
                  {rotation.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 rounded-lg border bg-muted/40 p-2">
                      {rotation.map((id, index) => {
                        const workout = available.find((item) => item.id === id);
                        return (
                          <Badge key={`${id}-${index}`} variant="secondary" className="gap-1">
                            {workout?.shortName || workout?.name || "?"}
                            <button
                              type="button"
                              onClick={() =>
                                setRotation((current) => current.filter((_, i) => i !== index))
                              }
                              aria-label={`Tirar ${workout?.name ?? "treino"} da posição ${index + 1}`}
                            >
                              <X className="size-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}
                </div>
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="A cada quantas semanas" hint="1 = toda semana.">
                  <Input
                    value={weekInterval}
                    onChange={(event) => setWeekInterval(event.target.value)}
                    inputMode="numeric"
                  />
                </Field>
                <Field label="Horário previsto">
                  <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={includeRest}
                  onChange={(event) => setIncludeRest(event.target.checked)}
                  className="size-4 accent-primary"
                />
                Marcar os outros dias como descanso
              </label>
            </>
          )}

          <Field label="Quando o dia já tem algo planejado">
            <Select value={conflict} onValueChange={(value) => setConflict(value as typeof conflict)}>
              <SelectTrigger aria-label="Resolução de conflito">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pular">Preservar o que já está lá</SelectItem>
                <SelectItem value="substituir">Substituir (só o que continua pendente)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving || (mode === "programa" ? !programId : weekdays.length === 0)}
            onClick={save}
          >
            <CalendarRange className="size-4" />
            Gerar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
