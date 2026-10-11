"use client";

import * as React from "react";
import { toast } from "sonner";
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
import { Textarea } from "@/components/ui/textarea";
import type { TrainingProgram, TrainingWorkout } from "@/lib/training/types";
import {
  createScheduledWorkout,
} from "@/lib/actions/training-schedule";
import { Field } from "@/components/training/field";
import { shortDate } from "./calendar-client";

export function NewEntryDialog({
  open,
  date,
  workouts,
  programs,
  onClose,
  onSaved,
}: {
  /** Quem decide é o pai: carregado sob demanda, o diálogo fica montado e anima o fechamento. */
  open: boolean;
  date: string;
  workouts: TrainingWorkout[];
  programs: TrainingProgram[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [workoutId, setWorkoutId] = React.useState("");
  const [programId, setProgramId] = React.useState("");
  const [time, setTime] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const available = workouts.filter((workout) => !workout.isArchived && !workout.isSuperseded);

  async function save() {
    setSaving(true);
    const result = await createScheduledWorkout({
      scheduled_date: date,
      entry_kind: "treino",
      workout_id: workoutId || null,
      program_id: programId || null,
      planned_time: time || null,
      notes,
    });
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Dia planejado.");
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Planejar {shortDate(date)}</DialogTitle>
          <DialogDescription>
            Escolha o treino do dia. Você pode deixar sem treino e decidir depois.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Treino">
            <Select value={workoutId} onValueChange={setWorkoutId}>
              <SelectTrigger aria-label="Treino do dia">
                <SelectValue placeholder="Escolher treino…" />
              </SelectTrigger>
              <SelectContent>
                {available.map((workout) => (
                  <SelectItem key={workout.id} value={workout.id}>
                    {workout.shortName ? `${workout.shortName} — ${workout.name}` : workout.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="Programa (opcional)">
            <Select value={programId} onValueChange={setProgramId}>
              <SelectTrigger aria-label="Programa">
                <SelectValue placeholder="Nenhum" />
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

          <Field label="Horário previsto" hint="Horário de Brasília.">
            <Input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
          </Field>

          <Field label="Observação">
            <Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={saving} onClick={save}>
            Planejar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
