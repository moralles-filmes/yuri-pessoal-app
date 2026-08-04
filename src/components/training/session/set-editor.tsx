"use client";

/**
 * Fase 17-C — Treinos · Registro de uma série.
 *
 * ═══════════ OS CAMPOS SAEM DE `tracking.ts`, A ÚNICA MATRIZ ═══════════
 *
 * Este componente não decide o que perguntar: ele consulta `fieldsForTracking`. Uma prancha
 * não pede carga, uma barra assistida pede ASSISTÊNCIA (que subtrai) em vez de peso na barra,
 * uma esteira pede distância e tempo. Reimplementar essa decisão aqui criaria a segunda matriz
 * que o módulo inteiro existe para evitar.
 *
 * ═══════════ UMA MÃO, SUADO, NO CELULAR ═══════════
 *
 * Alvos de toque de 48px, `inputMode="decimal"` para abrir o teclado numérico, botões de −/+
 * no incremento real do exercício, e o botão de concluir ocupando a largura toda. Nada de
 * campo pequeno que exige precisão.
 */
import * as React from "react";
import { Check, Minus, Plus, SkipForward, Undo2, Weight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  DIFFICULTY_LEVELS,
  DIFFICULTY_LEVEL_LABELS,
  type DifficultyLevel,
  type DifficultyScale,
} from "@/lib/training/constants";
import {
  METRIC_FIELD_LABELS,
  fieldsForTracking,
  type MetricField,
} from "@/lib/training/tracking";
import type { SessionExercise, SessionSet } from "@/lib/training/types";

export type SetValuesDraft = {
  reps: string;
  weight: string;
  additionalWeight: string;
  assistanceWeight: string;
  duration: string;
  distance: string;
  calories: string;
  incline: string;
  resistance: string;
  repsLeft: string;
  repsRight: string;
  rir: string;
  rpe: string;
  difficulty: DifficultyLevel | null;
  notes: string;
};

export const emptyDraft = (): SetValuesDraft => ({
  reps: "",
  weight: "",
  additionalWeight: "",
  assistanceWeight: "",
  duration: "",
  distance: "",
  calories: "",
  incline: "",
  resistance: "",
  repsLeft: "",
  repsRight: "",
  rir: "",
  rpe: "",
  difficulty: null,
  notes: "",
});

const text = (value: number | null): string => (value === null ? "" : String(value));

/**
 * Preenche o rascunho.
 *
 * Ordem de prioridade: o que já foi registrado > o planejado congelado > a sugestão da última
 * vez. **Nada é aplicado sozinho no servidor** — isto é só o valor inicial do campo, que o
 * usuário edita antes de confirmar.
 */
export function draftFromSet(
  set: SessionSet,
  suggestion?: {
    weightKg: number | null;
    additionalWeightKg: number | null;
    assistanceWeightKg: number | null;
    reps: number | null;
    durationSeconds: number | null;
    distanceM: number | null;
  } | null,
): SetValuesDraft {
  const done = set.status === "concluida" || set.status === "falhou";

  return {
    ...emptyDraft(),
    reps: text(done ? set.reps : (set.reps ?? suggestion?.reps ?? set.plannedRepsMax ?? set.plannedRepsMin)),
    weight: text(done ? set.weightKg : (set.weightKg ?? set.plannedWeightKg ?? suggestion?.weightKg ?? null)),
    additionalWeight: text(
      done
        ? set.additionalWeightKg
        : (set.additionalWeightKg ?? set.plannedAdditionalWeightKg ?? suggestion?.additionalWeightKg ?? null),
    ),
    assistanceWeight: text(
      done
        ? set.assistanceWeightKg
        : (set.assistanceWeightKg ?? set.plannedAssistanceWeightKg ?? suggestion?.assistanceWeightKg ?? null),
    ),
    duration: text(
      done ? set.durationSeconds : (set.durationSeconds ?? set.plannedDurationSeconds ?? suggestion?.durationSeconds ?? null),
    ),
    distance: text(done ? set.distanceM : (set.distanceM ?? set.plannedDistanceM ?? suggestion?.distanceM ?? null)),
    calories: text(set.calories),
    incline: text(set.inclinePercent),
    resistance: text(set.resistanceLevel),
    repsLeft: text(set.repsLeft),
    repsRight: text(set.repsRight),
    rir: text(set.rir ?? set.plannedRir),
    rpe: text(set.rpe ?? set.plannedRpe),
    difficulty: set.difficulty,
    notes: set.notes ?? "",
  };
}

const toNumber = (value: string): number | null => {
  const cleaned = value.trim().replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

/** O rascunho vira o payload da action. Campo vazio vira `null`, jamais zero. */
export function draftToPayload(draft: SetValuesDraft) {
  return {
    reps: toNumber(draft.reps),
    weight_kg: toNumber(draft.weight),
    additional_weight_kg: toNumber(draft.additionalWeight),
    assistance_weight_kg: toNumber(draft.assistanceWeight),
    duration_seconds: toNumber(draft.duration),
    distance_m: toNumber(draft.distance),
    calories: toNumber(draft.calories),
    incline_percent: toNumber(draft.incline),
    resistance_level: toNumber(draft.resistance),
    reps_left: toNumber(draft.repsLeft),
    reps_right: toNumber(draft.repsRight),
    rir: toNumber(draft.rir),
    rpe: toNumber(draft.rpe),
    difficulty: draft.difficulty,
    notes: draft.notes.trim() || null,
  };
}

/* ───────────────────────────── Campo numérico grande ───────────────────────────── */

function NumberField({
  label,
  value,
  onChange,
  step,
  suffix,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  step?: number;
  suffix?: string;
  hint?: string;
  autoFocus?: boolean;
}) {
  const bump = (delta: number) => {
    const current = toNumber(value) ?? 0;
    const next = Math.max(0, Number((current + delta).toFixed(3)));
    onChange(String(next));
  };

  return (
    <div>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="mt-1.5 flex items-stretch gap-1.5">
        {step ? (
          <Button
            type="button"
            variant="outline"
            className="size-12 shrink-0 p-0"
            onClick={() => bump(-step)}
            aria-label={`Diminuir ${label}`}
          >
            <Minus className="size-4" />
          </Button>
        ) : null}
        <div className="relative min-w-0 flex-1">
          <Input
            value={value}
            onChange={(event) => onChange(event.target.value)}
            inputMode="decimal"
            // `text` em vez de `number`: no celular o `number` come vírgula e mostra setinhas
            // minúsculas — o oposto do que esta tela precisa.
            type="text"
            autoFocus={autoFocus}
            className={cn("h-12 text-center text-lg tabular-nums", suffix && "pr-10")}
            aria-label={label}
          />
          {suffix && (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
        {step ? (
          <Button
            type="button"
            variant="outline"
            className="size-12 shrink-0 p-0"
            onClick={() => bump(step)}
            aria-label={`Aumentar ${label}`}
          >
            <Plus className="size-4" />
          </Button>
        ) : null}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ───────────────────────────── O editor ───────────────────────────── */

export function SetEditor({
  exercise,
  set,
  draft,
  onDraftChange,
  difficultyScale,
  onConfirm,
  onSkip,
  onUndo,
  onOpenPlates,
  busy,
}: {
  exercise: SessionExercise;
  set: SessionSet;
  draft: SetValuesDraft;
  onDraftChange: (draft: SetValuesDraft) => void;
  difficultyScale: DifficultyScale;
  onConfirm: () => void;
  onSkip: () => void;
  onUndo: () => void;
  onOpenPlates: (targetKg: number | null) => void;
  busy?: boolean;
}) {
  const { required, optional } = fieldsForTracking(exercise.trackingType, exercise.laterality);
  const uses = (field: MetricField) => required.includes(field) || optional.includes(field);

  const patch = (part: Partial<SetValuesDraft>) => onDraftChange({ ...draft, ...part });
  const increment = exercise.incrementKg ?? 2.5;
  const isDone = set.status === "concluida" || set.status === "falhou";

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {uses("weight") && (
          <NumberField
            label={METRIC_FIELD_LABELS.weight}
            value={draft.weight}
            onChange={(weight) => patch({ weight })}
            step={increment}
            suffix="kg"
          />
        )}
        {uses("reps") && (
          <NumberField
            label={METRIC_FIELD_LABELS.reps}
            value={draft.reps}
            onChange={(reps) => patch({ reps })}
            step={1}
          />
        )}
        {uses("additionalWeight") && (
          <NumberField
            label={METRIC_FIELD_LABELS.additionalWeight}
            value={draft.additionalWeight}
            onChange={(additionalWeight) => patch({ additionalWeight })}
            step={increment}
            suffix="kg"
            hint="Soma à carga do corpo"
          />
        )}
        {uses("assistanceWeight") && (
          <NumberField
            label={METRIC_FIELD_LABELS.assistanceWeight}
            value={draft.assistanceWeight}
            onChange={(assistanceWeight) => patch({ assistanceWeight })}
            step={increment}
            suffix="kg"
            hint="Subtrai da carga do corpo"
          />
        )}
        {uses("duration") && (
          <NumberField
            label={METRIC_FIELD_LABELS.duration}
            value={draft.duration}
            onChange={(duration) => patch({ duration })}
            step={5}
            suffix="s"
          />
        )}
        {uses("distance") && (
          <NumberField
            label={METRIC_FIELD_LABELS.distance}
            value={draft.distance}
            onChange={(distance) => patch({ distance })}
            step={100}
            suffix="m"
          />
        )}
        {uses("calories") && (
          <NumberField
            label={METRIC_FIELD_LABELS.calories}
            value={draft.calories}
            onChange={(calories) => patch({ calories })}
            step={10}
            suffix="kcal"
            hint="Estimativa do aparelho"
          />
        )}
        {uses("incline") && (
          <NumberField
            label={METRIC_FIELD_LABELS.incline}
            value={draft.incline}
            onChange={(incline) => patch({ incline })}
            step={0.5}
            suffix="%"
          />
        )}
        {uses("resistance") && (
          <NumberField
            label={METRIC_FIELD_LABELS.resistance}
            value={draft.resistance}
            onChange={(resistance) => patch({ resistance })}
            step={1}
          />
        )}
        {uses("sides") && (
          <>
            <NumberField
              label="Repetições · esquerdo"
              value={draft.repsLeft}
              onChange={(repsLeft) => patch({ repsLeft })}
              step={1}
            />
            <NumberField
              label="Repetições · direito"
              value={draft.repsRight}
              onChange={(repsRight) => patch({ repsRight })}
              step={1}
            />
          </>
        )}
      </div>

      {uses("weight") && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-9"
          onClick={() => onOpenPlates(toNumber(draft.weight))}
        >
          <Weight className="size-4" />
          Calcular anilhas
        </Button>
      )}

      {/* Dificuldade: a escala é a das preferências do módulo (17-A), não uma escolha daqui. */}
      {difficultyScale === "simples" ? (
        <div>
          <Label className="text-xs text-muted-foreground">Como foi a série</Label>
          {/* 3 colunas no celular: `Button` é `whitespace-nowrap` e item de grid tem
              `min-width: auto`, então em 5 colunas o rótulo "Muito difícil" não cabia na
              célula (~57px numa tela de 375px) e alargava o grid, empurrando a página
              inteira na horizontal. */}
          <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-5">
            {DIFFICULTY_LEVELS.map((level) => (
              <Button
                key={level}
                type="button"
                variant={draft.difficulty === level ? "default" : "outline"}
                className="h-12 px-1 text-[11px] leading-tight"
                onClick={() => patch({ difficulty: draft.difficulty === level ? null : level })}
              >
                {DIFFICULTY_LEVEL_LABELS[level]}
              </Button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {difficultyScale === "rir" ? (
            <NumberField
              label="RIR (repetições em reserva)"
              value={draft.rir}
              onChange={(rir) => patch({ rir })}
              step={1}
            />
          ) : (
            <NumberField
              label="RPE (percepção de esforço)"
              value={draft.rpe}
              onChange={(rpe) => patch({ rpe })}
              step={0.5}
            />
          )}
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
        <Button
          type="button"
          className="h-14 text-base"
          onClick={onConfirm}
          disabled={busy}
        >
          <Check className="size-5" />
          {isDone ? "Salvar alteração" : `Concluir série ${set.setNumber}`}
        </Button>
        {isDone ? (
          <Button type="button" variant="outline" className="h-14" onClick={onUndo} disabled={busy}>
            <Undo2 className="size-4" />
            Desfazer
          </Button>
        ) : (
          <Button type="button" variant="outline" className="h-14" onClick={onSkip} disabled={busy}>
            <SkipForward className="size-4" />
            Pular série
          </Button>
        )}
      </div>
    </div>
  );
}
