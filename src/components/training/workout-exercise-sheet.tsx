"use client";

/**
 * Fase 17-B — Treinos · Configuração de um exercício dentro do treino.
 *
 * ⛔ A REGRA QUE ESTA TELA CUMPRE: **a configuração respeita o `tracking_type`.**
 *
 * Um exercício de duração não pede peso; um de distância pede distância; um assistido pede
 * assistência (que SUBTRAI carga) e não peso na barra. Quem decide isso é `fieldsForTracking`,
 * de `src/lib/training/tracking.ts` — a ÚNICA matriz de medição do módulo. Esta tela não tem
 * lista própria de "campos por tipo": ela pergunta à matriz e desenha o que ela responder.
 *
 * Três abas: séries (uniformes ou uma a uma), bloco/técnica e alternativas daquele exercício
 * NAQUELE treino.
 */
import * as React from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  SET_TECHNIQUES,
  SET_TECHNIQUE_LABELS,
  SET_TYPES,
  SET_TYPE_LABELS,
  TRACKING_TYPE_HINTS,
  TRACKING_TYPE_LABELS,
} from "@/lib/training/constants";
import { METRIC_FIELD_LABELS, fieldsForTracking, type MetricField } from "@/lib/training/tracking";
import { expandPlannedSets, repRangeLabel, secondsLabel } from "@/lib/training/workout";
import type { ExerciseListItem, WorkoutExercise } from "@/lib/training/types";
import {
  addWorkoutAlternative,
  removeWorkoutAlternative,
  setWorkoutSets,
  updateWorkoutExercise,
} from "@/lib/actions/training-workouts";
import { Field } from "./field";

const NONE = "__nenhum__";
const SUPERSET_LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

/** Estado local de uma série configurada (tudo string, como todo formulário do projeto). */
type SetDraft = {
  key: string;
  set_type: string;
  target_reps_min: string;
  target_reps_max: string;
  target_duration_seconds: string;
  target_distance_m: string;
  planned_weight_kg: string;
  planned_additional_weight_kg: string;
  planned_assistance_weight_kg: string;
  rest_seconds: string;
  target_rir: string;
  is_warmup: boolean;
};

const str = (value: number | null | undefined) =>
  value === null || value === undefined ? "" : String(value);

function draftFrom(source: Partial<SetDraft> = {}, index = 0): SetDraft {
  return {
    key: `s-${index}-${Math.random().toString(36).slice(2, 8)}`,
    set_type: "trabalho",
    target_reps_min: "",
    target_reps_max: "",
    target_duration_seconds: "",
    target_distance_m: "",
    planned_weight_kg: "",
    planned_additional_weight_kg: "",
    planned_assistance_weight_kg: "",
    rest_seconds: "",
    target_rir: "",
    is_warmup: false,
    ...source,
  };
}

export function WorkoutExerciseSheet({
  open,
  onOpenChange,
  item,
  catalog,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: WorkoutExercise | null;
  catalog: ExerciseListItem[];
  onChanged: () => void;
}) {
  if (!item) return null;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <Inner key={item.id} item={item} catalog={catalog} onChanged={onChanged} />
      </SheetContent>
    </Sheet>
  );
}

function Inner({
  item,
  catalog,
  onChanged,
}: {
  item: WorkoutExercise;
  catalog: ExerciseListItem[];
  onChanged: () => void;
}) {
  const fields = React.useMemo(
    () => fieldsForTracking(item.trackingType, item.laterality),
    [item.trackingType, item.laterality],
  );
  const uses = React.useCallback(
    (field: MetricField) => fields.required.includes(field) || fields.optional.includes(field),
    [fields],
  );

  /* ── Configuração geral do exercício ──
   * Tudo string, como todo formulário do projeto: o Zod da action normaliza e converte. Sem a
   * anotação explícita, o TypeScript estreitaria `set_type` para o valor atual do exercício e
   * o `<Select>` não conseguiria trocar para outro tipo.
   */
  const [general, setGeneral] = React.useState<{
    default_sets: string;
    target_reps_min: string;
    target_reps_max: string;
    target_duration_seconds: string;
    target_distance_m: string;
    planned_weight_kg: string;
    planned_additional_weight_kg: string;
    planned_assistance_weight_kg: string;
    rest_seconds: string;
    target_rir: string;
    set_type: string;
    technique: string;
    superset_group: string;
    is_warmup: boolean;
    counts_in_volume: boolean;
    tempo: string;
    notes: string;
  }>({
    default_sets: String(item.defaultSets),
    target_reps_min: str(item.targetRepsMin),
    target_reps_max: str(item.targetRepsMax),
    target_duration_seconds: str(item.targetDurationSeconds),
    target_distance_m: str(item.targetDistanceM),
    planned_weight_kg: str(item.plannedWeightKg),
    planned_additional_weight_kg: str(item.plannedAdditionalWeightKg),
    planned_assistance_weight_kg: str(item.plannedAssistanceWeightKg),
    rest_seconds: str(item.restSeconds),
    target_rir: str(item.targetRir),
    set_type: item.setType,
    technique: item.technique ?? "",
    superset_group: item.supersetGroup ?? "",
    is_warmup: item.isWarmup,
    counts_in_volume: item.countsInVolume,
    tempo: item.tempo ?? "",
    notes: item.notes ?? "",
  });

  /* ── Séries configuradas ── */
  const [perSet, setPerSet] = React.useState<boolean>(item.sets.length > 0);
  const [sets, setSets] = React.useState<SetDraft[]>(
    item.sets.map((set, index) =>
      draftFrom(
        {
          set_type: set.setType,
          target_reps_min: str(set.targetRepsMin),
          target_reps_max: str(set.targetRepsMax),
          target_duration_seconds: str(set.targetDurationSeconds),
          target_distance_m: str(set.targetDistanceM),
          planned_weight_kg: str(set.plannedWeightKg),
          planned_additional_weight_kg: str(set.plannedAdditionalWeightKg),
          planned_assistance_weight_kg: str(set.plannedAssistanceWeightKg),
          rest_seconds: str(set.restSeconds),
          target_rir: str(set.targetRir),
          is_warmup: set.isWarmup,
        },
        index,
      ),
    ),
  );

  const [saving, setSaving] = React.useState(false);

  // Pré-visualização pela MESMA função que a sessão ao vivo vai consumir (17-C).
  const preview = React.useMemo(
    () =>
      expandPlannedSets({
        id: item.id,
        trackingType: item.trackingType,
        laterality: item.laterality,
        defaultSets: Number(general.default_sets) || 1,
        targetRepsMin: toNum(general.target_reps_min),
        targetRepsMax: toNum(general.target_reps_max),
        targetDurationSeconds: toNum(general.target_duration_seconds),
        targetDistanceM: toNum(general.target_distance_m),
        plannedWeightKg: toNum(general.planned_weight_kg),
        plannedAdditionalWeightKg: toNum(general.planned_additional_weight_kg),
        plannedAssistanceWeightKg: toNum(general.planned_assistance_weight_kg),
        restSeconds: toNum(general.rest_seconds),
        targetRir: toNum(general.target_rir),
        targetRpe: null,
        setType: general.set_type as never,
        isWarmup: general.is_warmup,
        countsInVolume: general.counts_in_volume,
        notes: null,
        sets: perSet
          ? sets.map((set, index) => ({
              setNumber: index + 1,
              setType: set.set_type as never,
              targetRepsMin: toNum(set.target_reps_min),
              targetRepsMax: toNum(set.target_reps_max),
              targetDurationSeconds: toNum(set.target_duration_seconds),
              targetDistanceM: toNum(set.target_distance_m),
              plannedWeightKg: toNum(set.planned_weight_kg),
              plannedAdditionalWeightKg: toNum(set.planned_additional_weight_kg),
              plannedAssistanceWeightKg: toNum(set.planned_assistance_weight_kg),
              restSeconds: toNum(set.rest_seconds),
              targetRir: toNum(set.target_rir),
              targetRpe: null,
              isWarmup: set.is_warmup,
              countsInVolume: true,
              notes: null,
            }))
          : [],
      }),
    [item, general, perSet, sets],
  );

  async function save() {
    setSaving(true);

    const configResult = await updateWorkoutExercise({
      id: item.id,
      default_sets: general.default_sets,
      target_reps_min: general.target_reps_min,
      target_reps_max: general.target_reps_max,
      target_duration_seconds: general.target_duration_seconds,
      target_distance_m: general.target_distance_m,
      planned_weight_kg: general.planned_weight_kg,
      planned_additional_weight_kg: general.planned_additional_weight_kg,
      planned_assistance_weight_kg: general.planned_assistance_weight_kg,
      rest_seconds: general.rest_seconds,
      target_rir: general.target_rir,
      target_rpe: "",
      set_type: general.set_type,
      technique: general.technique || null,
      superset_group: general.superset_group || null,
      is_warmup: general.is_warmup,
      counts_in_volume: general.counts_in_volume,
      increment_kg: "",
      tempo: general.tempo,
      notes: general.notes,
    });

    if (!configResult.ok) {
      setSaving(false);
      toast.error(configResult.error);
      return;
    }

    // Lista vazia é escolha válida: significa "voltar às séries uniformes".
    const setsResult = await setWorkoutSets({
      workout_exercise_id: item.id,
      sets: perSet
        ? sets.map((set) => ({
            set_type: set.set_type,
            target_reps_min: set.target_reps_min,
            target_reps_max: set.target_reps_max,
            target_duration_seconds: set.target_duration_seconds,
            target_distance_m: set.target_distance_m,
            planned_weight_kg: set.planned_weight_kg,
            planned_additional_weight_kg: set.planned_additional_weight_kg,
            planned_assistance_weight_kg: set.planned_assistance_weight_kg,
            rest_seconds: set.rest_seconds,
            target_rir: set.target_rir,
            target_rpe: "",
            is_warmup: set.is_warmup,
            counts_in_volume: true,
            notes: "",
          }))
        : [],
    });

    setSaving(false);

    if (!setsResult.ok) {
      toast.error(setsResult.error);
      return;
    }
    toast.success("Exercício do treino salvo.");
    onChanged();
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle className="text-base">{item.exerciseName}</SheetTitle>
        <SheetDescription>
          {item.primaryMuscleGroupName}
          {item.equipmentName ? ` · ${item.equipmentName}` : ""} ·{" "}
          {TRACKING_TYPE_LABELS[item.trackingType]}
        </SheetDescription>
      </SheetHeader>

      <div className="space-y-4 px-4 pb-6">
        <div className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
          <p>{TRACKING_TYPE_HINTS[item.trackingType]}</p>
          <p className="mt-1.5 text-foreground">
            Na hora do treino, cada série vai pedir:{" "}
            <strong>
              {fields.required.map((field) => METRIC_FIELD_LABELS[field]).join(", ") ||
                "nenhum campo obrigatório"}
            </strong>
            .
          </p>
        </div>

        <Tabs defaultValue="series">
          <TabsList className="w-full">
            <TabsTrigger value="series" className="flex-1">
              Séries
            </TabsTrigger>
            <TabsTrigger value="bloco" className="flex-1">
              Bloco
            </TabsTrigger>
            <TabsTrigger value="alternativas" className="flex-1">
              Alternativas
            </TabsTrigger>
          </TabsList>

          {/* ───────────── Séries ───────────── */}
          <TabsContent value="series" className="space-y-4 pt-4">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div className="min-w-0 pr-3">
                <Label className="text-sm">Séries diferentes entre si</Label>
                <p className="text-xs text-muted-foreground">
                  Ligue para top set + back-off, pirâmide ou drop set planejado. Desligado, todas
                  as séries são iguais.
                </p>
              </div>
              <Switch
                checked={perSet}
                onCheckedChange={(checked) => {
                  setPerSet(checked);
                  if (checked && sets.length === 0) {
                    setSets(
                      Array.from({ length: Number(general.default_sets) || 3 }, (_, index) =>
                        draftFrom(
                          {
                            target_reps_min: general.target_reps_min,
                            target_reps_max: general.target_reps_max,
                            planned_weight_kg: general.planned_weight_kg,
                            rest_seconds: general.rest_seconds,
                          },
                          index,
                        ),
                      ),
                    );
                  }
                }}
                aria-label="Configurar cada série separadamente"
              />
            </div>

            {!perSet ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Séries">
                  <Input
                    value={general.default_sets}
                    onChange={(event) =>
                      setGeneral((current) => ({ ...current, default_sets: event.target.value }))
                    }
                    inputMode="numeric"
                  />
                </Field>

                {uses("reps") && (
                  <>
                    <Field label="Repetições (mín.)">
                      <Input
                        value={general.target_reps_min}
                        onChange={(event) =>
                          setGeneral((c) => ({ ...c, target_reps_min: event.target.value }))
                        }
                        inputMode="numeric"
                        placeholder="8"
                      />
                    </Field>
                    <Field label="Repetições (máx.)">
                      <Input
                        value={general.target_reps_max}
                        onChange={(event) =>
                          setGeneral((c) => ({ ...c, target_reps_max: event.target.value }))
                        }
                        inputMode="numeric"
                        placeholder="12"
                      />
                    </Field>
                  </>
                )}

                {uses("duration") && (
                  <Field label="Duração (segundos)">
                    <Input
                      value={general.target_duration_seconds}
                      onChange={(event) =>
                        setGeneral((c) => ({ ...c, target_duration_seconds: event.target.value }))
                      }
                      inputMode="numeric"
                      placeholder="45"
                    />
                  </Field>
                )}

                {uses("distance") && (
                  <Field label="Distância (metros)">
                    <Input
                      value={general.target_distance_m}
                      onChange={(event) =>
                        setGeneral((c) => ({ ...c, target_distance_m: event.target.value }))
                      }
                      inputMode="decimal"
                      placeholder="3000"
                    />
                  </Field>
                )}

                {uses("weight") && (
                  <Field label="Carga planejada (kg)">
                    <Input
                      value={general.planned_weight_kg}
                      onChange={(event) =>
                        setGeneral((c) => ({ ...c, planned_weight_kg: event.target.value }))
                      }
                      inputMode="decimal"
                      placeholder="60"
                    />
                  </Field>
                )}

                {uses("additionalWeight") && (
                  <Field label="Carga adicional (kg)" hint="Soma ao seu peso corporal.">
                    <Input
                      value={general.planned_additional_weight_kg}
                      onChange={(event) =>
                        setGeneral((c) => ({
                          ...c,
                          planned_additional_weight_kg: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="10"
                    />
                  </Field>
                )}

                {uses("assistanceWeight") && (
                  <Field label="Assistência (kg)" hint="SUBTRAI carga: deixa o exercício mais fácil.">
                    <Input
                      value={general.planned_assistance_weight_kg}
                      onChange={(event) =>
                        setGeneral((c) => ({
                          ...c,
                          planned_assistance_weight_kg: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="30"
                    />
                  </Field>
                )}

                <Field label="Descanso (segundos)" hint="Vazio usa o padrão do módulo.">
                  <Input
                    value={general.rest_seconds}
                    onChange={(event) =>
                      setGeneral((c) => ({ ...c, rest_seconds: event.target.value }))
                    }
                    inputMode="numeric"
                    placeholder="90"
                  />
                </Field>

                <Field label="RIR alvo" hint="Repetições em reserva. Opcional.">
                  <Input
                    value={general.target_rir}
                    onChange={(event) =>
                      setGeneral((c) => ({ ...c, target_rir: event.target.value }))
                    }
                    inputMode="numeric"
                    placeholder="2"
                  />
                </Field>

                <Field label="Tipo de série" className="sm:col-span-2">
                  <Select
                    value={general.set_type}
                    onValueChange={(value) => setGeneral((c) => ({ ...c, set_type: value }))}
                  >
                    <SelectTrigger aria-label="Tipo de série">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SET_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {SET_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            ) : (
              <div className="space-y-2">
                {sets.map((set, index) => (
                  <div key={set.key} className="rounded-lg border p-3">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="shrink-0">
                        Série {index + 1}
                      </Badge>
                      <Select
                        value={set.set_type}
                        onValueChange={(value) =>
                          setSets((current) =>
                            current.map((s, i) => (i === index ? { ...s, set_type: value } : s)),
                          )
                        }
                      >
                        <SelectTrigger className="h-8 flex-1" aria-label={`Tipo da série ${index + 1}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SET_TYPES.map((type) => (
                            <SelectItem key={type} value={type}>
                              {SET_TYPE_LABELS[type]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0"
                        onClick={() => setSets((current) => current.filter((_, i) => i !== index))}
                        aria-label={`Remover série ${index + 1}`}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {uses("reps") && (
                        <>
                          <SetInput
                            label="Reps mín."
                            value={set.target_reps_min}
                            onChange={(value) => patchSet(setSets, index, "target_reps_min", value)}
                          />
                          <SetInput
                            label="Reps máx."
                            value={set.target_reps_max}
                            onChange={(value) => patchSet(setSets, index, "target_reps_max", value)}
                          />
                        </>
                      )}
                      {uses("duration") && (
                        <SetInput
                          label="Duração (s)"
                          value={set.target_duration_seconds}
                          onChange={(value) =>
                            patchSet(setSets, index, "target_duration_seconds", value)
                          }
                        />
                      )}
                      {uses("distance") && (
                        <SetInput
                          label="Distância (m)"
                          value={set.target_distance_m}
                          onChange={(value) => patchSet(setSets, index, "target_distance_m", value)}
                        />
                      )}
                      {uses("weight") && (
                        <SetInput
                          label="Carga (kg)"
                          value={set.planned_weight_kg}
                          onChange={(value) => patchSet(setSets, index, "planned_weight_kg", value)}
                        />
                      )}
                      {uses("additionalWeight") && (
                        <SetInput
                          label="Adicional (kg)"
                          value={set.planned_additional_weight_kg}
                          onChange={(value) =>
                            patchSet(setSets, index, "planned_additional_weight_kg", value)
                          }
                        />
                      )}
                      {uses("assistanceWeight") && (
                        <SetInput
                          label="Assist. (kg)"
                          value={set.planned_assistance_weight_kg}
                          onChange={(value) =>
                            patchSet(setSets, index, "planned_assistance_weight_kg", value)
                          }
                        />
                      )}
                      <SetInput
                        label="Descanso (s)"
                        value={set.rest_seconds}
                        onChange={(value) => patchSet(setSets, index, "rest_seconds", value)}
                      />
                      <SetInput
                        label="RIR"
                        value={set.target_rir}
                        onChange={(value) => patchSet(setSets, index, "target_rir", value)}
                      />
                    </div>
                  </div>
                ))}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSets((current) => [...current, draftFrom({}, current.length)])}
                  disabled={sets.length >= 30}
                >
                  <Plus className="size-4" />
                  Acrescentar série
                </Button>
                {sets.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Sem nenhuma série configurada, o treino volta a usar séries iguais.
                  </p>
                )}
              </div>
            )}

            {/* Pré-visualização pela mesma função que a sessão ao vivo consome. */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <p className="text-xs font-medium">
                Como vai aparecer no treino ({preview.length}{" "}
                {preview.length === 1 ? "série" : "séries"})
              </p>
              <ul className="mt-2 space-y-1">
                {preview.map((set) => (
                  <li key={set.setNumber} className="flex items-center gap-2 text-xs">
                    <span className="w-12 shrink-0 text-muted-foreground">#{set.setNumber}</span>
                    <span className={cn("truncate", set.isWarmup && "text-muted-foreground")}>
                      {describeSet(set)}
                    </span>
                    {set.isWarmup && (
                      <Badge variant="secondary" className="shrink-0 text-[10px]">
                        aquecimento
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </TabsContent>

          {/* ───────────── Bloco / técnica ───────────── */}
          <TabsContent value="bloco" className="space-y-4 pt-4">
            <Field
              label="Bloco de superset"
              hint="Exercícios com a mesma letra e em posições vizinhas formam um bloco. O sistema recusa um superset furado."
            >
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setGeneral((c) => ({ ...c, superset_group: "" }))}
                  aria-pressed={!general.superset_group}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    !general.superset_group
                      ? "border-primary/50 bg-primary/10 font-medium"
                      : "hover:bg-accent",
                  )}
                >
                  Sem bloco
                </button>
                {SUPERSET_LETTERS.map((letter) => (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => setGeneral((c) => ({ ...c, superset_group: letter }))}
                    aria-pressed={general.superset_group === letter}
                    className={cn(
                      "size-9 rounded-lg border text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      general.superset_group === letter
                        ? "border-primary/50 bg-primary/10 font-medium"
                        : "hover:bg-accent",
                    )}
                  >
                    {letter}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Técnica" hint="Rótulo do que você pretende fazer. Não muda o cálculo.">
              <Select
                value={general.technique || NONE}
                onValueChange={(value) =>
                  setGeneral((c) => ({ ...c, technique: value === NONE ? "" : value }))
                }
              >
                <SelectTrigger aria-label="Técnica">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Nenhuma</SelectItem>
                  {SET_TECHNIQUES.map((technique) => (
                    <SelectItem key={technique} value={technique}>
                      {SET_TECHNIQUE_LABELS[technique]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Separator />

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Label className="text-sm">Este exercício é aquecimento</Label>
                <p className="text-xs text-muted-foreground">
                  Aquecimento não entra no volume principal por padrão.
                </p>
              </div>
              <Switch
                checked={general.is_warmup}
                onCheckedChange={(checked) => setGeneral((c) => ({ ...c, is_warmup: checked }))}
                aria-label="Marcar como aquecimento"
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="min-w-0">
                <Label className="text-sm">Contar no volume</Label>
                <p className="text-xs text-muted-foreground">
                  Desligue para exercícios que você não quer somar nos totais (17-D).
                </p>
              </div>
              <Switch
                checked={general.counts_in_volume}
                onCheckedChange={(checked) =>
                  setGeneral((c) => ({ ...c, counts_in_volume: checked }))
                }
                aria-label="Contar no volume"
              />
            </div>

            <Field label="Cadência (tempo)" hint="Ex.: 3-1-1-0. Opcional.">
              <Input
                value={general.tempo}
                onChange={(event) => setGeneral((c) => ({ ...c, tempo: event.target.value }))}
                placeholder="3-1-1-0"
              />
            </Field>

            <Field label="Observação">
              <Textarea
                value={general.notes}
                onChange={(event) => setGeneral((c) => ({ ...c, notes: event.target.value }))}
                rows={2}
              />
            </Field>
          </TabsContent>

          {/* ───────────── Alternativas ───────────── */}
          <TabsContent value="alternativas" className="space-y-3 pt-4">
            <AlternativesTab item={item} catalog={catalog} onChanged={onChanged} />
          </TabsContent>
        </Tabs>

        <div className="sticky bottom-0 -mx-4 border-t bg-background px-4 py-3">
          <Button className="w-full" disabled={saving} onClick={save}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Salvar exercício
          </Button>
        </div>
      </div>
    </>
  );
}

/* ───────────────────────────── Alternativas ───────────────────────────── */

function AlternativesTab({
  item,
  catalog,
  onChanged,
}: {
  item: WorkoutExercise;
  catalog: ExerciseListItem[];
  onChanged: () => void;
}) {
  const [choice, setChoice] = React.useState("");
  const [working, setWorking] = React.useState(false);

  const taken = new Set([item.exerciseId, ...item.alternatives.map((a) => a.alternativeExerciseId)]);
  const available = catalog.filter((exercise) => !taken.has(exercise.id) && !exercise.isArchived);

  async function add(exerciseId: string) {
    setWorking(true);
    const result = await addWorkoutAlternative({
      workout_exercise_id: item.id,
      alternative_exercise_id: exerciseId,
    });
    setWorking(false);
    setChoice("");
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onChanged();
  }

  async function remove(id: string) {
    const result = await removeWorkoutAlternative(id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onChanged();
  }

  return (
    <>
      <p className="rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        Alternativas <strong>deste exercício neste treino</strong> — para quando o aparelho está
        ocupado. É organização sua: o sistema <strong>não afirma</strong> que os exercícios são
        biomecanicamente equivalentes.
      </p>

      {item.alternatives.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma alternativa cadastrada.</p>
      ) : (
        <ul className="space-y-2">
          {item.alternatives.map((alternative) => (
            <li
              key={alternative.id}
              className="flex items-center gap-2 rounded-lg border p-2.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{alternative.alternativeName}</span>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => remove(alternative.id)}
                aria-label={`Remover ${alternative.alternativeName}`}
              >
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <Select
        value={choice}
        onValueChange={(value) => {
          setChoice(value);
          add(value);
        }}
        disabled={working}
      >
        <SelectTrigger aria-label="Adicionar alternativa">
          <SelectValue placeholder="Adicionar alternativa…" />
        </SelectTrigger>
        <SelectContent>
          {available.slice(0, 200).map((exercise) => (
            <SelectItem key={exercise.id} value={exercise.id}>
              {exercise.displayName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

/* ───────────────────────────── Utilitários locais ───────────────────────────── */

function toNum(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function patchSet(
  setSets: React.Dispatch<React.SetStateAction<SetDraft[]>>,
  index: number,
  key: keyof SetDraft,
  value: string,
) {
  setSets((current) => current.map((set, i) => (i === index ? { ...set, [key]: value } : set)));
}

function SetInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label className="text-[10px] text-muted-foreground">{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        className="mt-0.5 h-8"
        aria-label={label}
      />
    </div>
  );
}

/** Descrição curta de uma série já expandida. Nunca inventa "0" para alvo não definido. */
function describeSet(set: ReturnType<typeof expandPlannedSets>[number]): string {
  const parts: string[] = [];

  if (set.targetRepsMin !== null || set.targetRepsMax !== null) {
    parts.push(`${repRangeLabel(set.targetRepsMin, set.targetRepsMax)} reps`);
  }
  if (set.targetDurationSeconds !== null) parts.push(secondsLabel(set.targetDurationSeconds));
  if (set.targetDistanceM !== null) parts.push(`${set.targetDistanceM} m`);
  if (set.plannedWeightKg !== null) parts.push(`${set.plannedWeightKg} kg`);
  if (set.plannedAdditionalWeightKg !== null) parts.push(`+${set.plannedAdditionalWeightKg} kg`);
  if (set.plannedAssistanceWeightKg !== null) {
    // O sinal aparece na tela: assistência ALIVIA a carga.
    parts.push(`−${set.plannedAssistanceWeightKg} kg de assistência`);
  }
  if (set.restSeconds !== null) parts.push(`descanso ${secondsLabel(set.restSeconds)}`);
  if (set.targetRir !== null) parts.push(`RIR ${set.targetRir}`);

  return parts.length > 0 ? parts.join(" · ") : "sem alvo definido";
}
