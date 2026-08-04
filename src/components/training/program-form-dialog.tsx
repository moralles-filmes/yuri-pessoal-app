"use client";

/**
 * Fase 17-B — Treinos · Cadastro e edição de programa.
 *
 * A decisão de UX que importa aqui: **objetivo e nível são organizacionais**, e a tela diz
 * isso com todas as letras. Um app que apresenta "Hipertrofia · Avançado" como se fosse
 * prescrição está afirmando algo que não pode sustentar — este não afirma.
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
import {
  PROGRAM_STATUSES,
  PROGRAM_STATUS_LABELS,
  TRAINING_GOALS,
  TRAINING_GOAL_LABELS,
  TRAINING_LEVELS,
  TRAINING_LEVEL_LABELS,
} from "@/lib/training/constants";
import { programSchema } from "@/lib/validators/training-routines";
import { mapServerFieldErrors, serverErrorMessage } from "@/lib/forms/server-errors";
import {
  createTrainingProgram,
  updateTrainingProgram,
} from "@/lib/actions/training-programs";
import type { TrainingProgram } from "@/lib/training/types";
import { Field } from "./field";

/** Os campos que ESTA tela mostra. Erro de campo fora daqui vai para o toast, não some. */
const FORM_FIELDS = [
  "name",
  "description",
  "goal",
  "level",
  "status",
  "starts_on",
  "ends_on",
  "duration_weeks",
  "weekly_frequency",
  "notes",
] as const;

type FormValues = {
  name: string;
  description: string;
  goal: string;
  level: string;
  status: string;
  starts_on: string;
  ends_on: string;
  duration_weeks: string;
  weekly_frequency: string;
  notes: string;
};

function toDefaults(program: TrainingProgram | null): FormValues {
  return {
    name: program?.name ?? "",
    description: program?.description ?? "",
    goal: program?.goal ?? "personalizado",
    level: program?.level ?? "nao_informado",
    status: program?.status ?? "rascunho",
    starts_on: program?.startsOn ?? "",
    ends_on: program?.endsOn ?? "",
    duration_weeks: program?.durationWeeks ? String(program.durationWeeks) : "",
    weekly_frequency: program?.weeklyFrequency ? String(program.weeklyFrequency) : "",
    notes: program?.notes ?? "",
  };
}

export function ProgramFormDialog({
  open,
  onOpenChange,
  program,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  program: TrainingProgram | null;
  onSaved: () => void;
}) {
  const isEditing = Boolean(program);

  const form = useForm<FormValues>({
    resolver: zodResolver(programSchema) as unknown as Resolver<FormValues>,
    defaultValues: toDefaults(program),
  });

  // Reabrir com outro programa recarrega o formulário. Ajuste durante o render (React
  // Compiler ligado) — nada de setState em useEffect.
  const formKey = `${program?.id ?? "novo"}:${open}`;
  const [lastKey, setLastKey] = React.useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    form.reset(toDefaults(program));
  }

  const values = useWatch({ control: form.control });
  const [saving, setSaving] = React.useState(false);

  async function onSubmit(data: FormValues) {
    setSaving(true);
    const result = program
      ? await updateTrainingProgram({ ...data, id: program.id, is_active: program.isActive })
      : await createTrainingProgram(data);
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
    toast.success(isEditing ? "Programa atualizado." : "Programa criado.");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar programa" : "Novo programa"}</DialogTitle>
          <DialogDescription>
            Um programa agrupa treinos (ABC, Push/Pull/Legs, Upper/Lower). Só o nome é
            obrigatório.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Nome"
              error={form.formState.errors.name?.message}
              className="sm:col-span-2"
            >
              <Input {...form.register("name")} placeholder="ABC — hipertrofia" autoFocus />
            </Field>

            <Field
              label="Objetivo"
              hint="Serve para organizar e achar. Não é prescrição."
              error={form.formState.errors.goal?.message}
            >
              <Select
                value={values.goal ?? "personalizado"}
                onValueChange={(value) => form.setValue("goal", value)}
              >
                <SelectTrigger aria-label="Objetivo do programa">
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
              label="Nível"
              hint="Como você classifica este programa para si."
              error={form.formState.errors.level?.message}
            >
              <Select
                value={values.level ?? "nao_informado"}
                onValueChange={(value) => form.setValue("level", value)}
              >
                <SelectTrigger aria-label="Nível do programa">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRAINING_LEVELS.map((level) => (
                    <SelectItem key={level} value={level}>
                      {TRAINING_LEVEL_LABELS[level]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Início" error={form.formState.errors.starts_on?.message}>
              <Input type="date" {...form.register("starts_on")} />
            </Field>

            <Field label="Fim" error={form.formState.errors.ends_on?.message}>
              <Input type="date" {...form.register("ends_on")} />
            </Field>

            <Field label="Duração (semanas)" error={form.formState.errors.duration_weeks?.message}>
              <Input {...form.register("duration_weeks")} inputMode="numeric" placeholder="12" />
            </Field>

            <Field label="Treinos por semana" error={form.formState.errors.weekly_frequency?.message}>
              <Input {...form.register("weekly_frequency")} inputMode="numeric" placeholder="4" />
            </Field>

            {isEditing && (
              <Field label="Situação" error={form.formState.errors.status?.message}>
                <Select
                  value={values.status ?? "rascunho"}
                  onValueChange={(value) => form.setValue("status", value)}
                >
                  <SelectTrigger aria-label="Situação do programa">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PROGRAM_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {PROGRAM_STATUS_LABELS[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

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

          <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
            Objetivo e nível são <strong>organização sua</strong>. O sistema não recomenda
            programa, não avalia condicionamento e não promete resultado.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar programa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
