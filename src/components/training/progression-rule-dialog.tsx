"use client";

/**
 * Fase 17-D — Treinos · Regra de progressão (formulário).
 *
 * ═══════════ A REGRA É DO USUÁRIO, NÃO DO SISTEMA ═══════════
 *
 * Esta tela não recomenda nada: ela pergunta **quando você quer ser lembrado** de subir a
 * carga. O texto deixa isso explícito, e duas travas não são configuráveis de propósito —
 * a avaliação sempre olha pelo menos duas sessões, e **dor registrada sempre bloqueia**.
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { DIFFICULTY_LEVELS, DIFFICULTY_LEVEL_LABELS } from "@/lib/training/constants";
import { progressionRuleSchema } from "@/lib/validators/training-history";
import { mapServerFieldErrors, serverErrorMessage } from "@/lib/forms/server-errors";
import {
  createProgressionRule,
  updateProgressionRule,
} from "@/lib/actions/training-history";
import type { ProgressionRule } from "@/lib/training/progression";
import { Field } from "./field";

/** Os campos que ESTA tela mostra. Erro de campo fora daqui vai para o toast, não some. */
const FORM_FIELDS = [
  "name",
  "scope",
  "exercise_id",
  "muscle_group_id",
  "min_sessions",
  "require_top_of_range",
  "require_all_working_sets",
  "require_no_failure",
  "max_rir",
  "max_rpe",
  "max_difficulty",
  "increment_mode",
  "increment_kg",
  "increment_percent",
  "is_active",
  "notes",
] as const;

const NONE = "__nenhum__";

type FormValues = {
  name: string;
  scope: string;
  exercise_id: string;
  muscle_group_id: string;
  min_sessions: string;
  require_top_of_range: boolean;
  require_all_working_sets: boolean;
  require_no_failure: boolean;
  max_rir: string;
  max_rpe: string;
  max_difficulty: string;
  increment_mode: string;
  increment_kg: string;
  increment_percent: string;
  is_active: boolean;
  notes: string;
};

function toDefaults(rule: ProgressionRule | null): FormValues {
  return {
    name: rule?.name ?? "",
    scope: rule?.scope ?? "global",
    exercise_id: rule?.exerciseId ?? "",
    muscle_group_id: rule?.muscleGroupId ?? "",
    min_sessions: String(rule?.minSessions ?? 2),
    require_top_of_range: rule?.requireTopOfRange ?? true,
    require_all_working_sets: rule?.requireAllWorkingSets ?? true,
    require_no_failure: rule?.requireNoFailure ?? true,
    max_rir: rule?.maxRir === null || rule?.maxRir === undefined ? "" : String(rule.maxRir),
    max_rpe: rule?.maxRpe === null || rule?.maxRpe === undefined ? "" : String(rule.maxRpe),
    max_difficulty: rule?.maxDifficulty ?? "",
    increment_mode: rule?.incrementMode ?? "incremento_minimo",
    increment_kg:
      rule?.incrementKg === null || rule?.incrementKg === undefined ? "" : String(rule.incrementKg),
    increment_percent:
      rule?.incrementPercent === null || rule?.incrementPercent === undefined
        ? ""
        : String(rule.incrementPercent),
    is_active: rule?.isActive ?? true,
    notes: "",
  };
}

export function ProgressionRuleDialog({
  open,
  onOpenChange,
  rule,
  exercises,
  muscleGroups,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: ProgressionRule | null;
  exercises: { id: string; name: string }[];
  muscleGroups: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const isEditing = Boolean(rule);

  const form = useForm<FormValues>({
    resolver: zodResolver(progressionRuleSchema) as unknown as Resolver<FormValues>,
    defaultValues: toDefaults(rule),
  });

  // Ajuste durante o render (React Compiler ligado) — nada de setState em useEffect.
  const formKey = `${rule?.id ?? "nova"}:${open}`;
  const [lastKey, setLastKey] = React.useState(formKey);
  if (formKey !== lastKey) {
    setLastKey(formKey);
    form.reset(toDefaults(rule));
  }

  const values = useWatch({ control: form.control });
  const [saving, setSaving] = React.useState(false);

  async function onSubmit(data: FormValues) {
    setSaving(true);
    const result = rule
      ? await updateProgressionRule({ ...data, id: rule.id })
      : await createProgressionRule(data);
    setSaving(false);

    if (!result.ok) {
      const mapped = mapServerFieldErrors(result.fieldErrors, FORM_FIELDS);
      for (const { name, message } of mapped.toSet) {
        form.setError(name as keyof FormValues, { type: "server", message });
      }
      toast.error(serverErrorMessage(result.error, mapped));
      return;
    }
    toast.success(isEditing ? "Regra atualizada." : "Regra criada.");
    onOpenChange(false);
    onSaved();
  }

  const scope = values.scope ?? "global";
  const incrementMode = values.increment_mode ?? "incremento_minimo";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Editar regra" : "Nova regra de progressão"}</DialogTitle>
          <DialogDescription>
            Você define quando quer ser lembrado de subir a carga. O sistema confere a condição,
            explica o que viu e espera a sua decisão — nada é aplicado sozinho.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Nome"
              error={form.formState.errors.name?.message}
              className="sm:col-span-2"
            >
              <Input
                {...form.register("name")}
                placeholder="Fechou a faixa duas vezes → +incremento"
                autoFocus
              />
            </Field>

            <Field label="Vale para" error={form.formState.errors.scope?.message}>
              <Select value={scope} onValueChange={(value) => form.setValue("scope", value)}>
                <SelectTrigger aria-label="Escopo da regra">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="global">Todos os exercícios</SelectItem>
                  <SelectItem value="grupo">Um grupo muscular</SelectItem>
                  <SelectItem value="exercicio">Um exercício</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {scope === "exercicio" && (
              <Field label="Exercício" error={form.formState.errors.exercise_id?.message}>
                <Select
                  value={values.exercise_id || NONE}
                  onValueChange={(value) =>
                    form.setValue("exercise_id", value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger aria-label="Exercício da regra">
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

            {scope === "grupo" && (
              <Field label="Grupo muscular" error={form.formState.errors.muscle_group_id?.message}>
                <Select
                  value={values.muscle_group_id || NONE}
                  onValueChange={(value) =>
                    form.setValue("muscle_group_id", value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger aria-label="Grupo muscular da regra">
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
          </div>

          <fieldset className="space-y-3 rounded-xl border border-border p-4">
            <legend className="px-1 text-sm font-medium">Condição</legend>

            <Field
              label="Sessões avaliadas"
              hint="Mínimo de 2: uma série isolada nunca gera sugestão."
              error={form.formState.errors.min_sessions?.message}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={2}
                max={10}
                {...form.register("min_sessions")}
                className="max-w-[120px]"
              />
            </Field>

            <ToggleRow
              label="Atingir o topo da faixa de repetições"
              checked={values.require_top_of_range ?? true}
              onChange={(checked) => form.setValue("require_top_of_range", checked)}
            />
            <ToggleRow
              label="Em todas as séries de trabalho"
              hint="Desligado, basta a primeira série fechar a faixa."
              checked={values.require_all_working_sets ?? true}
              onChange={(checked) => form.setValue("require_all_working_sets", checked)}
            />
            <ToggleRow
              label="Sem série registrada como falha"
              checked={values.require_no_failure ?? true}
              onChange={(checked) => form.setValue("require_no_failure", checked)}
            />

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="RIR máximo"
                hint="Vazio = não avalia."
                error={form.formState.errors.max_rir?.message}
              >
                <Input type="number" inputMode="numeric" min={0} max={10} {...form.register("max_rir")} />
              </Field>
              <Field
                label="RPE máximo"
                hint="Vazio = não avalia."
                error={form.formState.errors.max_rpe?.message}
              >
                <Input type="number" inputMode="decimal" min={1} max={10} step="0.5" {...form.register("max_rpe")} />
              </Field>
              <Field
                label="Dificuldade máxima"
                error={form.formState.errors.max_difficulty?.message}
              >
                <Select
                  value={values.max_difficulty || NONE}
                  onValueChange={(value) =>
                    form.setValue("max_difficulty", value === NONE ? "" : value)
                  }
                >
                  <SelectTrigger aria-label="Dificuldade máxima">
                    <SelectValue placeholder="Não avalia" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não avalia</SelectItem>
                    {DIFFICULTY_LEVELS.map((level) => (
                      <SelectItem key={level} value={level}>
                        {DIFFICULTY_LEVEL_LABELS[level]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
              Dor registrada em qualquer das sessões avaliadas <strong>sempre</strong> bloqueia a
              sugestão. Isso não é configurável.
            </p>
          </fieldset>

          <fieldset className="space-y-3 rounded-xl border border-border p-4">
            <legend className="px-1 text-sm font-medium">Incremento sugerido</legend>

            <Field label="Como calcular" error={form.formState.errors.increment_mode?.message}>
              <Select
                value={incrementMode}
                onValueChange={(value) => form.setValue("increment_mode", value)}
              >
                <SelectTrigger aria-label="Modo de incremento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="incremento_minimo">
                    Menor salto realizável do exercício
                  </SelectItem>
                  <SelectItem value="fixo">Valor fixo em kg</SelectItem>
                  <SelectItem value="percentual">Percentual da carga atual</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {incrementMode === "fixo" && (
              <Field label="Incremento (kg)" error={form.formState.errors.increment_kg?.message}>
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.5"
                  {...form.register("increment_kg")}
                  className="max-w-[140px]"
                />
              </Field>
            )}

            {incrementMode === "percentual" && (
              <Field
                label="Percentual (%)"
                hint="O valor é arredondado para um salto realizável no equipamento."
                error={form.formState.errors.increment_percent?.message}
              >
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={25}
                  step="0.5"
                  {...form.register("increment_percent")}
                  className="max-w-[140px]"
                />
              </Field>
            )}
          </fieldset>

          <ToggleRow
            label="Regra ativa"
            hint="Desativada, ela deixa de gerar sugestões — sem apagar o histórico."
            checked={values.is_active ?? true}
            onChange={(checked) => form.setValue("is_active", checked)}
          />

          <Field label="Observações" error={form.formState.errors.notes?.message}>
            <Textarea {...form.register("notes")} rows={2} />
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {isEditing ? "Salvar" : "Criar regra"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex items-start gap-3">
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <div>
        <Label htmlFor={id} className="text-sm font-normal">
          {label}
        </Label>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}
