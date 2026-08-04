"use client";

/**
 * Fase 17-B — Treinos · Cadastro e edição do treino-modelo (dados gerais).
 *
 * Só o "cabeçalho" do treino mora aqui: nome, apelido, objetivo, programa e observações. Os
 * exercícios, as séries e os supersets vivem no construtor (`/treinos/treinos/[id]`) — misturar
 * as duas coisas num diálogo só daria um formulário que ninguém termina de preencher.
 */
import * as React from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
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
import { mapServerFieldErrors, serverErrorMessage } from "@/lib/forms/server-errors";
import { TRAINING_GOALS, TRAINING_GOAL_LABELS } from "@/lib/training/constants";
import { workoutSchema } from "@/lib/validators/training-routines";
import {
  createTrainingWorkout,
  updateTrainingWorkout,
} from "@/lib/actions/training-workouts";
import type { TrainingProgram, TrainingWorkout } from "@/lib/training/types";
import { Field } from "./field";

const NONE = "__nenhum__";

/** Os campos que ESTA tela mostra. Erro de campo fora daqui vai para o toast, não some. */
const FORM_FIELDS = [
  "name",
  "short_name",
  "description",
  "goal",
  "program_id",
  "estimated_minutes",
  "notes",
] as const;

type FormValues = {
  name: string;
  short_name: string;
  description: string;
  goal: string;
  program_id: string;
  estimated_minutes: string;
  notes: string;
};

function toDefaults(workout: TrainingWorkout | null, programId?: string | null): FormValues {
  return {
    name: workout?.name ?? "",
    short_name: workout?.shortName ?? "",
    description: workout?.description ?? "",
    goal: workout?.goal ?? "personalizado",
    program_id: workout?.programId ?? programId ?? "",
    estimated_minutes: workout?.estimatedMinutes ? String(workout.estimatedMinutes) : "",
    notes: workout?.notes ?? "",
  };
}

export function WorkoutFormDialog({
  open,
  onOpenChange,
  workout,
  programs,
  defaultProgramId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workout: TrainingWorkout | null;
  programs: TrainingProgram[];
  defaultProgramId?: string | null;
  onSaved: (id?: string) => void;
}) {
  const isEditing = Boolean(workout);

  const form = useForm<FormValues>({
    resolver: zodResolver(workoutSchema) as unknown as Resolver<FormValues>,
    defaultValues: toDefaults(workout, defaultProgramId),
  });

  const formKey = `${workout?.id ?? "novo"}:${open}`;
  const [lastKey, setLastKey] = React.useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    form.reset(toDefaults(workout, defaultProgramId));
  }

  const values = useWatch({ control: form.control });
  const [saving, setSaving] = React.useState(false);

  async function onSubmit(data: FormValues) {
    setSaving(true);
    const payload = { ...data, program_id: data.program_id || null };
    const result = workout
      ? await updateTrainingWorkout({ ...payload, id: workout.id, status: workout.status })
      : await createTrainingWorkout(payload);
    setSaving(false);

    if (!result.ok) {
      // O servidor recusou: destaca o que dá para destacar e diz o resto em voz alta.
      const mapped = mapServerFieldErrors(result.fieldErrors, FORM_FIELDS);
      for (const { name, message } of mapped.toSet) {
        form.setError(name as keyof FormValues, { type: "server", message });
      }
      toast.error(serverErrorMessage(result.error, mapped));
      return;
    }
    toast.success(isEditing ? "Treino atualizado." : "Treino criado. Agora monte os exercícios.");
    onOpenChange(false);
    onSaved(result.data && "id" in result.data ? result.data.id : undefined);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar treino" : "Novo treino"}</DialogTitle>
          <DialogDescription>
            Os exercícios, as séries e os supersets são configurados no construtor, depois de
            criar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Nome"
              error={form.formState.errors.name?.message}
              className="sm:col-span-2"
            >
              <Input {...form.register("name")} placeholder="Treino A — Peito e tríceps" autoFocus />
            </Field>

            <Field
              label="Apelido curto"
              hint="Aparece no calendário. Ex.: A, B, Push."
              error={form.formState.errors.short_name?.message}
            >
              <Input {...form.register("short_name")} placeholder="A" maxLength={20} />
            </Field>

            <Field
              label="Objetivo"
              hint="Organização sua, nunca prescrição."
              error={form.formState.errors.goal?.message}
            >
              <Select
                value={values.goal ?? "personalizado"}
                onValueChange={(value) => form.setValue("goal", value)}
              >
                <SelectTrigger aria-label="Objetivo do treino">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_GOALS.map((goal) => (
                    <SelectItem key={goal} value={goal}>
                      {TRAINING_GOAL_LABELS[goal]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="Programa"
              hint="Um treino pode ficar avulso e ser reaproveitado depois."
              error={form.formState.errors.program_id?.message}
            >
              <Select
                value={values.program_id || NONE}
                onValueChange={(value) =>
                  form.setValue("program_id", value === NONE ? "" : value)
                }
              >
                <SelectTrigger aria-label="Programa do treino">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Sem programa (avulso)</SelectItem>
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

            <Field
              label="Duração estimada (min)"
              hint="Vazio usa a estimativa calculada das séries."
              error={form.formState.errors.estimated_minutes?.message}
            >
              <Input {...form.register("estimated_minutes")} inputMode="numeric" placeholder="60" />
            </Field>

            <Field
              label="Descrição"
              className="sm:col-span-2"
              error={form.formState.errors.description?.message}
            >
              <Textarea {...form.register("description")} rows={2} />
            </Field>

            <Field
              label="Observações"
              className="sm:col-span-2"
              error={form.formState.errors.notes?.message}
            >
              <Textarea {...form.register("notes")} rows={2} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar treino"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
