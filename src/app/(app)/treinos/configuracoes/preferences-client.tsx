"use client";

/**
 * Fase 17-A — Treinos · Preferências do módulo (cliente).
 *
 * DECISÃO DE HONESTIDADE: várias destas preferências só passam a ter efeito em subfases
 * seguintes (cronômetro na 17-C, volume e 1RM na 17-D). Em vez de escondê-las ou de fingir
 * que já funcionam, cada bloco diz **a partir de quando vale**. Um interruptor que não faz
 * nada e não avisa é pior do que não existir.
 */
import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  AUTO_ADVANCE_LABELS,
  AUTO_ADVANCE_MODES,
  DIFFICULTY_SCALES,
  DIFFICULTY_SCALE_LABELS,
  ONE_RM_FORMULAS,
  ONE_RM_FORMULA_LABELS,
  UNILATERAL_VOLUME_RULES,
  UNILATERAL_VOLUME_RULE_LABELS,
  WEEKDAY_LABELS,
  WEIGHT_UNITS,
} from "@/lib/training/constants";
import { saveTrainingPreferences } from "@/lib/actions/training-preferences";
import type { TrainingPreferences } from "@/lib/training/types";

export function TrainingPreferencesClient({
  preferences,
}: {
  preferences: TrainingPreferences;
}) {
  const [values, setValues] = React.useState(preferences);
  const [saving, setSaving] = React.useState(false);

  // Recarregar do servidor (após salvar) precisa refletir aqui — ajuste durante o render.
  const [last, setLast] = React.useState(preferences);
  if (last !== preferences) {
    setLast(preferences);
    setValues(preferences);
  }

  function set<K extends keyof TrainingPreferences>(key: K, value: TrainingPreferences[K]) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  async function save() {
    setSaving(true);
    const result = await saveTrainingPreferences({
      weight_unit: values.weightUnit,
      difficulty_scale: values.difficultyScale,
      default_rest_seconds: values.defaultRestSeconds,
      default_increment_kg: values.defaultIncrementKg,
      week_starts_on: values.weekStartsOn,
      weekly_workout_goal: values.weeklyWorkoutGoal,
      auto_advance: values.autoAdvance,
      rest_sound_enabled: values.restSoundEnabled,
      rest_vibration_enabled: values.restVibrationEnabled,
      keep_screen_awake: values.keepScreenAwake,
      unilateral_volume_rule: values.unilateralVolumeRule,
      count_warmup_in_volume: values.countWarmupInVolume,
      one_rm_formula: values.oneRmFormula,
      progression_enabled: values.progressionEnabled,
    });
    setSaving(false);
    if (!result.ok) toast.error(result.error);
    else toast.success("Preferências salvas.");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Registro</CardTitle>
          <CardDescription>Como você mede e registra o treino.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldSelect
            label="Unidade de peso"
            value={values.weightUnit}
            onChange={(value) => set("weightUnit", value as TrainingPreferences["weightUnit"])}
            options={WEIGHT_UNITS.map((unit) => ({
              value: unit,
              label: unit === "kg" ? "Quilogramas (kg)" : "Libras (lb)",
            }))}
          />

          <FieldSelect
            label="Escala de dificuldade"
            hint="Simples usa fácil → falha. RIR e RPE são numéricas."
            value={values.difficultyScale}
            onChange={(value) =>
              set("difficultyScale", value as TrainingPreferences["difficultyScale"])
            }
            options={DIFFICULTY_SCALES.map((scale) => ({
              value: scale,
              label: DIFFICULTY_SCALE_LABELS[scale],
            }))}
          />

          <div>
            <Label className="text-xs text-muted-foreground">Descanso padrão (segundos)</Label>
            <Input
              className="mt-1.5"
              inputMode="numeric"
              value={String(values.defaultRestSeconds)}
              onChange={(event) => set("defaultRestSeconds", Number(event.target.value) || 0)}
            />
          </div>

          <div>
            <Label className="text-xs text-muted-foreground">Incremento padrão (kg)</Label>
            <Input
              className="mt-1.5"
              inputMode="decimal"
              value={String(values.defaultIncrementKg)}
              onChange={(event) =>
                set("defaultIncrementKg", Number(event.target.value.replace(",", ".")) || 0)
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Usado quando o exercício e o equipamento não têm um incremento próprio.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Semana</CardTitle>
          <CardDescription>Base do planejamento e dos dashboards.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <FieldSelect
            label="A semana começa em"
            value={String(values.weekStartsOn)}
            onChange={(value) => set("weekStartsOn", Number(value))}
            options={WEEKDAY_LABELS.map((label, index) => ({ value: String(index), label }))}
          />
          <div>
            <Label className="text-xs text-muted-foreground">Meta de treinos por semana</Label>
            <Input
              className="mt-1.5"
              inputMode="numeric"
              placeholder="Sem meta"
              value={values.weeklyWorkoutGoal === null ? "" : String(values.weeklyWorkoutGoal)}
              onChange={(event) =>
                set(
                  "weeklyWorkoutGoal",
                  event.target.value.trim() === "" ? null : Number(event.target.value) || 0,
                )
              }
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Vazio = sem meta. Nenhum número é sugerido pelo sistema.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Sessão de treino</CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              Passa a valer na 17-C
            </Badge>
          </div>
          <CardDescription>
            Cronômetro, avanço entre séries e recursos do aparelho. Ficam salvos agora e entram
            em uso quando a sessão ao vivo existir.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldSelect
            label="Avanço automático"
            value={values.autoAdvance}
            onChange={(value) => set("autoAdvance", value as TrainingPreferences["autoAdvance"])}
            options={AUTO_ADVANCE_MODES.map((mode) => ({
              value: mode,
              label: AUTO_ADVANCE_LABELS[mode],
            }))}
          />
          <ToggleRow
            id="pref-som"
            label="Som ao fim do descanso"
            checked={values.restSoundEnabled}
            onChange={(checked) => set("restSoundEnabled", checked)}
          />
          <ToggleRow
            id="pref-vibra"
            label="Vibração ao fim do descanso"
            hint="Só nos aparelhos que oferecem o recurso — onde não houver, a opção não aparece na sessão."
            checked={values.restVibrationEnabled}
            onChange={(checked) => set("restVibrationEnabled", checked)}
          />
          <ToggleRow
            id="pref-tela"
            label="Manter a tela ativa durante o treino"
            hint="Depende do suporte do navegador."
            checked={values.keepScreenAwake}
            onChange={(checked) => set("keepScreenAwake", checked)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">Volume e progressão</CardTitle>
            <Badge variant="secondary" className="text-[10px]">
              Em uso desde a 17-D
            </Badge>
          </div>
          <CardDescription>
            Como os números do histórico são calculados. A regra escolhida aqui aparece junto de
            cada total — nenhum número é apresentado sem dizer como foi contado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldSelect
            label="Exercício unilateral"
            hint="Vale para o histórico, os recordes e os gráficos. A regra vigente aparece junto de cada total."
            value={values.unilateralVolumeRule}
            onChange={(value) =>
              set("unilateralVolumeRule", value as TrainingPreferences["unilateralVolumeRule"])
            }
            options={UNILATERAL_VOLUME_RULES.map((rule) => ({
              value: rule,
              label: UNILATERAL_VOLUME_RULE_LABELS[rule],
            }))}
          />
          <ToggleRow
            id="pref-aquecimento"
            label="Contar séries de aquecimento no volume"
            hint="Por padrão o aquecimento fica fora do volume principal."
            checked={values.countWarmupInVolume}
            onChange={(checked) => set("countWarmupInVolume", checked)}
          />
          <FieldSelect
            label="Fórmula de 1RM estimado"
            hint="É sempre uma ESTIMATIVA, e a fórmula usada aparece junto do número."
            value={values.oneRmFormula}
            onChange={(value) => set("oneRmFormula", value as TrainingPreferences["oneRmFormula"])}
            options={ONE_RM_FORMULAS.map((formula) => ({
              value: formula,
              label: ONE_RM_FORMULA_LABELS[formula],
            }))}
          />
          <ToggleRow
            id="pref-progressao"
            label="Receber sugestões de progressão de carga"
            hint="A sugestão sempre mostra o motivo, nunca é aplicada sozinha e nunca aparece quando há dor registrada."
            checked={values.progressionEnabled}
            onChange={(checked) => set("progressionEnabled", checked)}
          />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-4 animate-spin" />}
          Salvar preferências
        </Button>
      </div>
    </div>
  );
}

function FieldSelect({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="mt-1.5 w-full" aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-normal">
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
