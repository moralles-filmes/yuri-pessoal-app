"use client";

/**
 * Fase 17-A — Treinos · Cadastro e edição de exercício.
 *
 * A decisão de UX central: **o tipo de acompanhamento aparece com explicação e mostra ao vivo
 * quais campos aquele exercício vai pedir na hora do treino**. Escolher "peso corporal com
 * assistência" e ver "vai pedir: repetições, assistência" evita que o usuário descubra a
 * consequência da escolha só meses depois, no meio de uma série.
 *
 * Exercícios da base do sistema nunca chegam aqui para edição — o catálogo oferece "Duplicar".
 */
import * as React from "react";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  EXERCISE_TYPES,
  EXERCISE_TYPE_LABELS,
  LATERALITIES,
  LATERALITY_LABELS,
  MOVEMENT_PATTERNS,
  MOVEMENT_PATTERN_LABELS,
  MUSCLE_ROLES,
  MUSCLE_ROLE_LABELS,
  TRACKING_TYPES,
  TRACKING_TYPE_HINTS,
  TRACKING_TYPE_LABELS,
  type TrackingType,
} from "@/lib/training/constants";
import { METRIC_FIELD_LABELS, fieldsForTracking } from "@/lib/training/tracking";
import { trainingExerciseSchema } from "@/lib/validators/training";
import {
  createTrainingExercise,
  updateTrainingExercise,
} from "@/lib/actions/training-exercises";
import type { Equipment, ExerciseListItem, MuscleGroup } from "@/lib/training/types";

const NONE = "__nenhum__";

type FormValues = {
  name: string;
  alternative_name: string;
  description: string;
  primary_muscle_group_id: string;
  equipment_id: string;
  movement_pattern: string;
  exercise_type: string;
  tracking_type: string;
  laterality: string;
  instructions: string;
  tips: string;
  common_mistakes: string;
  notes: string;
  video_url: string;
  default_rest_seconds: string;
  default_increment_kg: string;
  secondary_muscles: { muscle_group_id: string; role: string }[];
};

function toDefaults(exercise: ExerciseListItem | null, groups: MuscleGroup[]): FormValues {
  return {
    name: exercise?.name ?? "",
    alternative_name: exercise?.alternativeName ?? "",
    description: exercise?.description ?? "",
    primary_muscle_group_id: exercise?.primaryMuscleGroupId ?? groups[0]?.id ?? "",
    equipment_id: exercise?.equipmentId ?? "",
    movement_pattern: exercise?.movementPattern ?? "outros",
    exercise_type: exercise?.exerciseType ?? "forca",
    tracking_type: exercise?.trackingType ?? "peso_reps",
    laterality: exercise?.laterality ?? "bilateral",
    instructions: exercise?.instructions ?? "",
    tips: exercise?.tips ?? "",
    common_mistakes: exercise?.commonMistakes ?? "",
    notes: exercise?.notes ?? "",
    video_url: exercise?.videoUrl ?? "",
    default_rest_seconds: "",
    default_increment_kg: "",
    secondary_muscles:
      exercise?.secondaryMuscles.map((muscle) => ({
        muscle_group_id: muscle.muscleGroupId,
        role: muscle.role,
      })) ?? [],
  };
}

export function ExerciseFormDialog({
  open,
  onOpenChange,
  exercise,
  groups,
  equipment,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exercise: ExerciseListItem | null;
  groups: MuscleGroup[];
  equipment: Equipment[];
  onSaved: () => void;
}) {
  const isEditing = Boolean(exercise);

  const form = useForm<FormValues>({
    resolver: zodResolver(trainingExerciseSchema) as unknown as Resolver<FormValues>,
    defaultValues: toDefaults(exercise, groups),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "secondary_muscles",
  });

  // Reabrir o diálogo com outro exercício precisa recarregar o formulário. Ajuste durante o
  // render (padrão do projeto com o React Compiler ligado) — nada de setState em useEffect.
  const formKey = `${exercise?.id ?? "novo"}:${open}`;
  const [lastKey, setLastKey] = React.useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    form.reset(toDefaults(exercise, groups));
  }

  // `useWatch` em vez de `form.watch()`: o React Compiler está ligado e não consegue
  // memoizar o `watch` — uma assinatura só, e todo o formulário lê daqui.
  const values = useWatch({ control: form.control });
  const trackingType = (values.tracking_type ?? "peso_reps") as TrackingType;
  const laterality = values.laterality ?? "bilateral";
  const primaryGroupId = values.primary_muscle_group_id;

  const preview = React.useMemo(
    () => fieldsForTracking(trackingType, laterality as never),
    [trackingType, laterality],
  );

  const [saving, setSaving] = React.useState(false);

  async function onSubmit(values: FormValues) {
    setSaving(true);
    const payload = {
      ...values,
      equipment_id: values.equipment_id || null,
      secondary_muscles: values.secondary_muscles.filter((m) => m.muscle_group_id),
    };
    const result = exercise
      ? await updateTrainingExercise({ ...payload, id: exercise.id })
      : await createTrainingExercise(payload);
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(isEditing ? "Exercício atualizado." : "Exercício criado.");
    onOpenChange(false);
    onSaved();
  }

  const availableGroups = groups.filter((group) => group.id !== primaryGroupId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar exercício" : "Novo exercício"}</DialogTitle>
          <DialogDescription>
            Só o nome, o grupo muscular e o tipo de acompanhamento são obrigatórios. O resto é
            organização sua.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" error={form.formState.errors.name?.message} className="sm:col-span-2">
              <Input {...form.register("name")} placeholder="Supino reto com barra" autoFocus />
            </Field>

            <Field label="Nome alternativo">
              <Input {...form.register("alternative_name")} placeholder="Supino horizontal" />
            </Field>

            <Field label="Grupo muscular principal" error={form.formState.errors.primary_muscle_group_id?.message}>
              <Select
                value={values.primary_muscle_group_id ?? ""}
                onValueChange={(value) => form.setValue("primary_muscle_group_id", value)}
              >
                <SelectTrigger aria-label="Grupo muscular principal">
                  <SelectValue placeholder="Escolha" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {group.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Equipamento">
              <Select
                value={values.equipment_id || NONE}
                onValueChange={(value) =>
                  form.setValue("equipment_id", value === NONE ? "" : value)
                }
              >
                <SelectTrigger aria-label="Equipamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Não informado</SelectItem>
                  {equipment.map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Padrão de movimento">
              <Select
                value={values.movement_pattern ?? "outros"}
                onValueChange={(value) => form.setValue("movement_pattern", value)}
              >
                <SelectTrigger aria-label="Padrão de movimento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_PATTERNS.map((value) => (
                    <SelectItem key={value} value={value}>
                      {MOVEMENT_PATTERN_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Tipo de exercício">
              <Select
                value={values.exercise_type ?? "forca"}
                onValueChange={(value) => form.setValue("exercise_type", value)}
              >
                <SelectTrigger aria-label="Tipo de exercício">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXERCISE_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {EXERCISE_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Lateralidade">
              <Select
                value={values.laterality ?? "bilateral"}
                onValueChange={(value) => form.setValue("laterality", value)}
              >
                <SelectTrigger aria-label="Lateralidade">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LATERALITIES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {LATERALITY_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Separator />

          {/* O contrato de medição, explicado antes de o usuário escolher. */}
          <div className="space-y-2">
            <Field label="Tipo de acompanhamento">
              <Select
                value={values.tracking_type ?? "peso_reps"}
                onValueChange={(value) => form.setValue("tracking_type", value)}
              >
                <SelectTrigger aria-label="Tipo de acompanhamento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TRACKING_TYPES.map((value) => (
                    <SelectItem key={value} value={value}>
                      {TRACKING_TYPE_LABELS[value]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
              <p>{TRACKING_TYPE_HINTS[trackingType]}</p>
              <p className="mt-2 text-foreground">
                Durante o treino, cada série vai pedir:{" "}
                <strong>
                  {preview.required.map((field) => METRIC_FIELD_LABELS[field]).join(", ") ||
                    "nenhum campo obrigatório"}
                </strong>
                {preview.optional.length > 0 && (
                  <>
                    {" "}
                    (opcional:{" "}
                    {preview.optional.map((field) => METRIC_FIELD_LABELS[field]).join(", ")})
                  </>
                )}
                .
              </p>
            </div>
          </div>

          <Separator />

          {/* Grupos secundários */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm">Grupos secundários</Label>
                <p className="text-xs text-muted-foreground">
                  O grupo principal não pode se repetir aqui.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({ muscle_group_id: availableGroups[0]?.id ?? "", role: "secundario" })
                }
                disabled={availableGroups.length === 0}
              >
                <Plus className="size-4" />
                Adicionar
              </Button>
            </div>

            {fields.length === 0 && (
              <p className="text-xs text-muted-foreground">Nenhum grupo secundário.</p>
            )}

            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <Select
                  value={values.secondary_muscles?.[index]?.muscle_group_id ?? ""}
                  onValueChange={(value) =>
                    form.setValue(`secondary_muscles.${index}.muscle_group_id`, value)
                  }
                >
                  <SelectTrigger className="flex-1" aria-label={`Grupo secundário ${index + 1}`}>
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select
                  value={values.secondary_muscles?.[index]?.role ?? "secundario"}
                  onValueChange={(value) => form.setValue(`secondary_muscles.${index}.role`, value)}
                >
                  <SelectTrigger className="w-[150px]" aria-label={`Papel do grupo ${index + 1}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MUSCLE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {MUSCLE_ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => remove(index)}
                  aria-label={`Remover grupo secundário ${index + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Descanso padrão (segundos)" hint="Vazio usa o padrão do módulo.">
              <Input
                {...form.register("default_rest_seconds")}
                inputMode="numeric"
                placeholder="90"
              />
            </Field>
            <Field label="Incremento de carga (kg)" hint="Vazio usa o do equipamento.">
              <Input
                {...form.register("default_increment_kg")}
                inputMode="decimal"
                placeholder="2,5"
              />
            </Field>

            <Field label="Instruções de execução" className="sm:col-span-2">
              <Textarea {...form.register("instructions")} rows={3} />
            </Field>
            <Field label="Dicas">
              <Textarea {...form.register("tips")} rows={2} />
            </Field>
            <Field label="Erros comuns">
              <Textarea {...form.register("common_mistakes")} rows={2} />
            </Field>
            <Field
              label="Link de vídeo"
              hint="Opcional, e só link seu ou público. Nenhum vídeo de terceiro é embutido."
              error={form.formState.errors.video_url?.message}
              className="sm:col-span-2"
            >
              <Input {...form.register("video_url")} placeholder="https://…" />
            </Field>
            <Field label="Observações" className="sm:col-span-2">
              <Textarea {...form.register("notes")} rows={2} />
            </Field>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar exercício"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  error,
  className,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && !error && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
