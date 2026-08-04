"use client";

/**
 * Fase 17-E — Treinos · Formulário de meta.
 *
 * ═══════════ A META É DO USUÁRIO. O SISTEMA NÃO SUGERE NADA ═══════════
 *
 * Nenhum campo vem pré-sugerido com um alvo "recomendado", não há faixa "ideal" e não existe
 * cálculo de carga máxima. A tela pergunta o que a pessoa quer acompanhar e registra.
 *
 * ═══════════ MEDIDA CORPORAL VEM DO MÓDULO CENTRAL ═══════════
 *
 * A lista de medidas é a de `body_measurement_types` (16-E) — a MESMA do módulo Dieta. Um
 * peso registrado aqui aparece lá, e vice-versa.
 */
import * as React from "react";
import { useForm, useWatch, type Resolver } from "react-hook-form";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  GOAL_DIRECTION_LABELS,
  GOAL_DIRECTIONS,
  GOAL_KIND_HINTS,
  GOAL_KIND_LABELS,
  GOAL_KINDS,
  GOAL_METRIC_LABELS,
  GOAL_METRIC_UNITS,
  GOAL_PERIOD_LABELS,
  GOAL_PERIODS,
  METRICS_BY_KIND,
  METRICS_REQUIRING_EXERCISE,
  type GoalKind,
  type GoalMetric,
  type TrainingGoal,
} from "@/lib/training/goals";
import { trainingGoalSchema } from "@/lib/validators/training-goals";
import { mapServerFieldErrors, serverErrorMessage } from "@/lib/forms/server-errors";
import { createTrainingGoal, updateTrainingGoal } from "@/lib/actions/training-goals";
import type { MeasurementType } from "@/lib/body/types";
import { Field } from "./field";

/** Os campos que ESTA tela mostra. Erro de campo fora daqui vai para o toast, não some. */
const FORM_FIELDS = [
  "name",
  "description",
  "goal_kind",
  "metric",
  "exercise_id",
  "muscle_group_id",
  "program_id",
  "body_measurement_type_id",
  "direction",
  "period",
  "starts_on",
  "ends_on",
  "start_value",
  "target_value",
  "unit",
  "milestones",
  "notes",
] as const;

const NONE = "__nenhum__";

type MilestoneField = { value: string; label: string; due_on: string };

type FormValues = {
  name: string;
  description: string;
  goal_kind: GoalKind;
  metric: GoalMetric;
  exercise_id: string;
  muscle_group_id: string;
  program_id: string;
  body_measurement_type_id: string;
  direction: string;
  period: string;
  starts_on: string;
  ends_on: string;
  start_value: string;
  target_value: string;
  unit: string;
  milestones: MilestoneField[];
  notes: string;
};

function toDefaults(goal: TrainingGoal | null, hoje: string): FormValues {
  return {
    name: goal?.name ?? "",
    description: goal?.description ?? "",
    goal_kind: goal?.kind ?? "frequencia",
    metric: goal?.metric ?? "treinos_por_semana",
    exercise_id: goal?.exerciseId ?? "",
    muscle_group_id: goal?.muscleGroupId ?? "",
    program_id: goal?.programId ?? "",
    body_measurement_type_id: goal?.bodyMeasurementTypeId ?? "",
    direction: goal?.direction ?? "aumentar",
    period: goal?.period ?? "semanal",
    starts_on: goal?.startsOn ?? hoje,
    ends_on: goal?.endsOn ?? "",
    // Vazio significa "use o primeiro valor observado" — nunca 0.
    start_value: goal?.startValue === null || goal?.startValue === undefined ? "" : String(goal.startValue),
    target_value: goal ? String(goal.targetValue) : "",
    unit: goal?.unit ?? GOAL_METRIC_UNITS.treinos_por_semana,
    milestones: (goal?.milestones ?? []).map((milestone) => ({
      value: String(milestone.value),
      label: milestone.label ?? "",
      due_on: milestone.dueOn ?? "",
    })),
    notes: goal?.notes ?? "",
  };
}

export function GoalFormDialog({
  open,
  onOpenChange,
  goal,
  hoje,
  exercises,
  muscleGroups,
  programs,
  measurementTypes,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: TrainingGoal | null;
  hoje: string;
  exercises: { id: string; name: string }[];
  muscleGroups: { id: string; name: string }[];
  programs: { id: string; name: string }[];
  measurementTypes: MeasurementType[];
  onSaved: () => void;
}) {
  const isEditing = Boolean(goal);

  const form = useForm<FormValues>({
    resolver: zodResolver(trainingGoalSchema) as unknown as Resolver<FormValues>,
    defaultValues: toDefaults(goal, hoje),
  });

  // Ajuste durante o render (React Compiler ligado) — nada de setState em useEffect.
  const formKey = `${goal?.id ?? "nova"}:${open}`;
  const [lastKey, setLastKey] = React.useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    form.reset(toDefaults(goal, hoje));
  }

  const values = useWatch({ control: form.control });
  const [saving, setSaving] = React.useState(false);

  const kind = (values.goal_kind ?? "frequencia") as GoalKind;
  const metric = (values.metric ?? "treinos_por_semana") as GoalMetric;
  const period = values.period ?? "semanal";
  const milestones = (values.milestones ?? []) as MilestoneField[];

  const needsExercise = METRICS_REQUIRING_EXERCISE.includes(metric);
  const needsMuscleGroup = metric === "series_grupo_muscular";
  const needsBodyType = metric === "medida_corporal";
  const isCustom = metric === "personalizada";

  /** Trocar a família reposiciona a medição e a unidade — nada fica incoerente na tela. */
  function changeKind(nextKind: GoalKind) {
    const nextMetric = METRICS_BY_KIND[nextKind][0];
    form.setValue("goal_kind", nextKind);
    form.setValue("metric", nextMetric);
    if (!isCustomMetric(nextMetric)) form.setValue("unit", GOAL_METRIC_UNITS[nextMetric]);
    if (nextKind === "corporal") form.setValue("direction", "reduzir");
  }

  function changeMetric(nextMetric: GoalMetric) {
    form.setValue("metric", nextMetric);
    if (!isCustomMetric(nextMetric) && GOAL_METRIC_UNITS[nextMetric]) {
      form.setValue("unit", GOAL_METRIC_UNITS[nextMetric]);
    }
  }

  function changeMeasurementType(typeId: string) {
    form.setValue("body_measurement_type_id", typeId);
    // A unidade acompanha o tipo: gravar "cm" numa meta de peso deixaria o histórico incomparável.
    const type = measurementTypes.find((item) => item.id === typeId);
    if (type) form.setValue("unit", type.unit);
  }

  function addMilestone() {
    form.setValue("milestones", [...milestones, { value: "", label: "", due_on: "" }]);
  }

  function removeMilestone(index: number) {
    form.setValue(
      "milestones",
      milestones.filter((_, i) => i !== index),
    );
  }

  async function onSubmit(data: FormValues) {
    setSaving(true);
    const payload = { ...data, status: goal?.status ?? "ativa" };
    const result = goal
      ? await updateTrainingGoal({ ...payload, id: goal.id })
      : await createTrainingGoal(payload);
    setSaving(false);

    if (!result.ok) {
      const mapped = mapServerFieldErrors(result.fieldErrors, FORM_FIELDS);
      for (const { name, message } of mapped.toSet) {
        form.setError(name as keyof FormValues, { type: "server", message });
      }
      toast.error(serverErrorMessage(result.error, mapped));
      return;
    }
    toast.success(isEditing ? "Meta atualizada." : "Meta criada.");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar meta" : "Nova meta"}</DialogTitle>
          <DialogDescription>
            Você define o que acompanhar, o alvo e o prazo. O sistema só compara o número
            registrado com o que você pediu — não recomenda alvo, carga nem prazo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <Field label="Nome" error={form.formState.errors.name?.message}>
            <Input {...form.register("name")} placeholder="4 treinos por semana" autoFocus />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Tipo de meta"
              hint={GOAL_KIND_HINTS[kind]}
              error={form.formState.errors.goal_kind?.message}
            >
              <Select value={kind} onValueChange={(value) => changeKind(value as GoalKind)}>
                <SelectTrigger aria-label="Tipo de meta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_KINDS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {GOAL_KIND_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="O que acompanhar" error={form.formState.errors.metric?.message}>
              <Select value={metric} onValueChange={(value) => changeMetric(value as GoalMetric)}>
                <SelectTrigger aria-label="Medição da meta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICS_BY_KIND[kind].map((item) => (
                    <SelectItem key={item} value={item}>
                      {GOAL_METRIC_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {needsExercise && (
              <Field label="Exercício" error={form.formState.errors.exercise_id?.message}>
                <Select
                  value={values.exercise_id || NONE}
                  onValueChange={(value) =>
                    form.setValue("exercise_id", value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger aria-label="Exercício da meta">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {exercises.map((exercise) => (
                      <SelectItem key={exercise.id} value={exercise.id}>
                        {exercise.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {needsMuscleGroup && (
              <Field label="Grupo muscular" error={form.formState.errors.muscle_group_id?.message}>
                <Select
                  value={values.muscle_group_id || NONE}
                  onValueChange={(value) =>
                    form.setValue("muscle_group_id", value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger aria-label="Grupo muscular da meta">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {muscleGroups.map((group) => (
                      <SelectItem key={group.id} value={group.id}>
                        {group.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {needsBodyType && (
              <Field
                label="Medida corporal"
                hint="A mesma lista do módulo de medidas — o dado é compartilhado com a Dieta."
                error={form.formState.errors.body_measurement_type_id?.message}
              >
                <Select
                  value={values.body_measurement_type_id || NONE}
                  onValueChange={(value) => changeMeasurementType(value === NONE ? "" : value)}
                >
                  <SelectTrigger aria-label="Medida corporal da meta">
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {measurementTypes
                      .filter((type) => type.isActive)
                      .map((type) => (
                        <SelectItem key={type.id} value={type.id}>
                          {type.name} ({type.unit})
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            )}

            {kind === "organizacao" && (
              <Field
                label="Programa (opcional)"
                hint="Limita a meta a um programa. Em branco, vale para todo o planejamento."
                error={form.formState.errors.program_id?.message}
              >
                <Select
                  value={values.program_id || NONE}
                  onValueChange={(value) =>
                    form.setValue("program_id", value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger aria-label="Programa da meta">
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Todos</SelectItem>
                    {programs.map((program) => (
                      <SelectItem key={program.id} value={program.id}>
                        {program.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>

          <fieldset className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-2">
            <legend className="px-1 text-sm font-medium">Alvo</legend>

            <Field label="Direção" error={form.formState.errors.direction?.message}>
              <Select
                value={values.direction ?? "aumentar"}
                onValueChange={(value) => form.setValue("direction", value)}
              >
                <SelectTrigger aria-label="Direção da meta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_DIRECTIONS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {GOAL_DIRECTION_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Unidade" error={form.formState.errors.unit?.message}>
              <Input {...form.register("unit")} placeholder="kg" disabled={needsBodyType} />
            </Field>

            <Field
              label="Valor inicial (opcional)"
              hint="Em branco, o sistema usa o primeiro valor observado depois do início. Não é zero."
              error={form.formState.errors.start_value?.message}
            >
              <Input inputMode="decimal" {...form.register("start_value")} placeholder="—" />
            </Field>

            <Field label="Valor-alvo" error={form.formState.errors.target_value?.message}>
              <Input inputMode="decimal" {...form.register("target_value")} placeholder="0" />
            </Field>
          </fieldset>

          <fieldset className="grid gap-4 rounded-xl border border-border p-4 sm:grid-cols-3">
            <legend className="px-1 text-sm font-medium">Período</legend>

            <Field label="Recorrência" error={form.formState.errors.period?.message}>
              <Select value={period} onValueChange={(value) => form.setValue("period", value)}>
                <SelectTrigger aria-label="Período da meta">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_PERIODS.map((item) => (
                    <SelectItem key={item} value={item}>
                      {GOAL_PERIOD_LABELS[item]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Início" error={form.formState.errors.starts_on?.message}>
              <Input type="date" {...form.register("starts_on")} />
            </Field>

            <Field
              label={period === "personalizado" ? "Prazo final" : "Prazo final (opcional)"}
              hint={period === "personalizado" ? undefined : "Em branco, a meta acompanha sem vencer."}
              error={form.formState.errors.ends_on?.message}
            >
              <Input type="date" {...form.register("ends_on")} />
            </Field>
          </fieldset>

          {/* ── Marcos intermediários ── */}
          <fieldset className="space-y-3 rounded-xl border border-border p-4">
            <legend className="px-1 text-sm font-medium">Marcos intermediários</legend>
            <p className="text-xs text-muted-foreground">
              Pontos no caminho até o alvo. São opcionais e servem só para você acompanhar — não
              mudam a meta nem geram cobrança.
            </p>

            {milestones.map((milestone, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_1fr_auto]">
                <Input
                  inputMode="decimal"
                  aria-label={`Valor do marco ${index + 1}`}
                  placeholder="Valor"
                  {...form.register(`milestones.${index}.value` as const)}
                />
                <Input
                  aria-label={`Nome do marco ${index + 1}`}
                  placeholder="Nome (opcional)"
                  {...form.register(`milestones.${index}.label` as const)}
                />
                <Input
                  type="date"
                  aria-label={`Prazo do marco ${index + 1}`}
                  {...form.register(`milestones.${index}.due_on` as const)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-9 text-muted-foreground hover:text-destructive"
                  onClick={() => removeMilestone(index)}
                  aria-label={`Remover o marco ${index + 1}`}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}

            {milestones.length < 10 && (
              <Button type="button" variant="outline" size="sm" onClick={addMilestone}>
                <Plus className="size-4" />
                Adicionar marco
              </Button>
            )}
          </fieldset>

          {isCustom && (
            <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              Numa meta personalizada, <strong>você registra o valor</strong> pela tela da meta.
              As demais são calculadas a partir dos treinos registrados e das medidas corporais.
            </p>
          )}

          <Field label="Observações" error={form.formState.errors.notes?.message}>
            <Textarea {...form.register("notes")} rows={2} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar meta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

const isCustomMetric = (metric: GoalMetric): boolean => metric === "personalizada";
