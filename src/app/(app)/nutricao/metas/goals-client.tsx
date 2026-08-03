"use client";

/**
 * Fase 16-B — Dieta e Alimentação · Metas nutricionais (cliente).
 *
 * ══ AS DUAS COISAS QUE ESTA TELA EXISTE PARA DEIXAR CLARAS ══
 *
 * 1. META TEM HISTÓRICO. Mudar de objetivo NÃO edita o alvo atual: encerra o período vigente
 *    e abre outro. A tela mostra os dois botões separados ("editar este período" ≠ "começar
 *    novo período") justamente porque a diferença muda o passado ou o preserva.
 *
 * 2. NADA É PRESCRITO. O estimador de gasto energético é opcional, mostra a fórmula usada e
 *    só preenche o campo — quem grava é o usuário, clicando em salvar.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  Calculator,
  Pencil,
  Plus,
  Target,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { roundForDisplay } from "@/lib/nutrition/calc";
import { longDateLabel } from "@/lib/nutrition/calendar";
import {
  ACTIVITY_LEVELS,
  ACTIVITY_LEVEL_HINTS,
  ACTIVITY_LEVEL_LABELS,
  DAY_KINDS,
  DAY_KIND_LABELS,
  GOAL_DEFAULT_NUTRIENTS,
  GOAL_DIRECTIONS,
  GOAL_DIRECTION_LABELS,
  GOAL_TYPES,
  GOAL_TYPE_HINTS,
  GOAL_TYPE_LABELS,
  PROFILE_SEXES,
  PROFILE_SEX_LABELS,
  WEEKDAY_LABELS,
  type DayKind,
  type GoalType,
} from "@/lib/nutrition/constants";
import {
  ADHERENCE_FORMULA,
  ESTIMATE_DISCLAIMER,
  dayTargets,
  distributedPercent,
  estimateEnergyExpenditure,
  goalPeriodForDate,
  missingForEstimate,
  overlappingPeriods,
} from "@/lib/nutrition/goals";
import type {
  GoalPeriod,
  MealType,
  NutrientDefinition,
  NutritionProfile,
} from "@/lib/nutrition/types";
import {
  deleteGoalPeriod,
  saveGoalItems,
  saveGoalPeriod,
  saveNutritionProfile,
  startNewGoalPeriod,
} from "@/lib/actions/nutrition-goals";

type ScopeState = {
  weekday: number | null;
  dayKind: DayKind | null;
  mealTypeId: string | null;
};

export function GoalsClient({
  hoje,
  periods,
  mealTypes,
  nutrients,
  nutrientList,
  profile,
}: {
  hoje: string;
  periods: GoalPeriod[];
  mealTypes: MealType[];
  nutrients: Record<string, NutrientDefinition>;
  nutrientList: NutrientDefinition[];
  profile: NutritionProfile | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const current = React.useMemo(() => goalPeriodForDate(periods, hoje), [periods, hoje]);
  const overlaps = React.useMemo(() => overlappingPeriods(periods), [periods]);

  const [selectedId, setSelectedId] = React.useState<string | null>(current?.id ?? periods[0]?.id ?? null);
  const selected = periods.find((period) => period.id === selectedId) ?? current ?? periods[0] ?? null;

  const [scope, setScope] = React.useState<ScopeState>({ weekday: null, dayKind: null, mealTypeId: null });
  const [periodDialog, setPeriodDialog] = React.useState<"novo" | "editar" | "suceder" | null>(null);
  const [profileOpen, setProfileOpen] = React.useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Não foi possível concluir.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Metas nutricionais"
        description="Calorias, macros e distribuição por refeição — com histórico por período."
      >
        <Button variant="outline" onClick={() => setProfileOpen(true)}>
          <Calculator className="size-4" />
          Perfil
        </Button>
        <Button onClick={() => setPeriodDialog("novo")}>
          <Plus className="size-4" />
          Período
        </Button>
      </PageHeader>

      {periods.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma meta definida"
          description="Crie um período de meta para acompanhar calorias e macros. Nada é definido automaticamente: os valores são os que você escolher."
        >
          <Button onClick={() => setPeriodDialog("novo")}>
            <Plus className="size-4" />
            Criar período
          </Button>
        </EmptyState>
      ) : (
        <>
          {overlaps.length > 0 && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="flex items-start gap-3 p-4">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="text-xs">
                  <p className="font-medium text-amber-800 dark:text-amber-300">
                    Há {overlaps.length} sobreposição{overlaps.length > 1 ? "ões" : ""} entre períodos.
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    Quando duas metas cobrem o mesmo dia, vale a que começou mais tarde. Ajuste as
                    datas se não for isso que você quer.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Histórico de períodos ── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Períodos</CardTitle>
              <CardDescription>
                A meta de um dia é a que estava vigente naquele dia — alterar a meta de hoje não
                muda nenhum relatório anterior.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {periods.map((period) => {
                const isCurrent = current?.id === period.id;
                return (
                  <button
                    key={period.id}
                    type="button"
                    onClick={() => setSelectedId(period.id)}
                    className={cn(
                      "flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      selected?.id === period.id && "border-primary/40 bg-primary/5",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        {period.name || GOAL_TYPE_LABELS[period.goalType]}
                        {isCurrent && (
                          <Badge variant="secondary" className="text-[10px]">
                            Vigente
                          </Badge>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatDate(period.startsOn)} —{" "}
                        {period.endsOn ? formatDate(period.endsOn) : "em aberto"} ·{" "}
                        {GOAL_TYPE_LABELS[period.goalType]} · {period.items.length} valor
                        {period.items.length === 1 ? "" : "es"}
                      </p>
                      {period.reason && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{period.reason}</p>
                      )}
                    </div>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          {selected && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setPeriodDialog("editar")}>
                  <Pencil className="size-4" />
                  Editar este período
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPeriodDialog("suceder")}>
                  <CalendarClock className="size-4" />
                  Começar novo período
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive"
                  disabled={pending}
                  onClick={() => {
                    if (
                      !confirm(
                        "Excluir este período e todos os seus valores? O que já foi registrado no diário não é afetado.",
                      )
                    )
                      return;
                    run(() => deleteGoalPeriod(selected.id), "Período excluído.");
                  }}
                >
                  <Trash2 className="size-4" />
                  Excluir
                </Button>
              </div>

              <ScopePicker
                period={selected}
                mealTypes={mealTypes}
                scope={scope}
                onChange={setScope}
              />

              <GoalTable
                key={`${selected.id}-${scope.weekday}-${scope.dayKind}-${scope.mealTypeId}`}
                period={selected}
                scope={scope}
                hoje={hoje}
                nutrients={nutrients}
                nutrientList={nutrientList}
                mealTypes={mealTypes}
                pending={pending}
                onSave={(items) =>
                  run(
                    () =>
                      saveGoalItems({
                        period_id: selected.id,
                        weekday: scope.weekday,
                        day_kind: scope.dayKind,
                        meal_type_id: scope.mealTypeId,
                        items,
                      }),
                    "Metas salvas.",
                  )
                }
              />

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Como a aderência é calculada</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{ADHERENCE_FORMULA}</p>
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      <PeriodDialog
        mode={periodDialog}
        onOpenChange={(open) => !open && setPeriodDialog(null)}
        hoje={hoje}
        period={periodDialog === "editar" ? selected : null}
        onConfirm={async (payload) => {
          const result =
            periodDialog === "suceder" && selected
              ? await startNewGoalPeriod(payload, selected.id)
              : await saveGoalPeriod(payload, periodDialog === "editar" ? selected?.id : undefined);
          if (result.ok) {
            toast.success(
              periodDialog === "suceder"
                ? "Período anterior encerrado e novo criado — o histórico foi preservado."
                : "Período salvo.",
            );
            setPeriodDialog(null);
            if ("data" in result && result.data && "id" in result.data) setSelectedId(result.data.id);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível salvar.");
          }
        }}
      />

      <ProfileDialog
        open={profileOpen}
        onOpenChange={setProfileOpen}
        profile={profile}
        hoje={hoje}
        onConfirm={async (payload) => {
          const result = await saveNutritionProfile(payload);
          if (result.ok) {
            toast.success("Perfil salvo.");
            setProfileOpen(false);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível salvar.");
          }
        }}
      />
    </div>
  );
}

/* ═══════════════════════════ Escopo ═══════════════════════════ */

/** Seletor de escopo: dia da semana, tipo de dia e refeição, conforme o tipo do período. */
function ScopePicker({
  period,
  mealTypes,
  scope,
  onChange,
}: {
  period: GoalPeriod;
  mealTypes: MealType[];
  scope: ScopeState;
  onChange: (scope: ScopeState) => void;
}) {
  const usesWeekday = period.goalType === "por_dia_semana";
  const usesDayKind = period.goalType === "treino_descanso";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Escopo</CardTitle>
        <CardDescription>{GOAL_TYPE_HINTS[period.goalType]}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3">
        {usesWeekday && (
          <div className="space-y-1.5">
            <Label htmlFor="scope-weekday">Dia da semana</Label>
            <select
              id="scope-weekday"
              value={scope.weekday ?? ""}
              onChange={(event) =>
                onChange({ ...scope, weekday: event.target.value === "" ? null : Number(event.target.value) })
              }
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Todos os dias</option>
              {WEEKDAY_LABELS.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        )}

        {usesDayKind && (
          <div className="space-y-1.5">
            <Label htmlFor="scope-daykind">Tipo de dia</Label>
            <select
              id="scope-daykind"
              value={scope.dayKind ?? ""}
              onChange={(event) =>
                onChange({ ...scope, dayKind: (event.target.value || null) as DayKind | null })
              }
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Qualquer dia</option>
              {DAY_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {DAY_KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="scope-meal">Refeição</Label>
          <select
            id="scope-meal"
            value={scope.mealTypeId ?? ""}
            onChange={(event) => onChange({ ...scope, mealTypeId: event.target.value || null })}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Dia inteiro</option>
            {mealTypes
              .filter((type) => type.isActive)
              .map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════ Tabela de valores ═══════════════════════════ */

function GoalTable({
  period,
  scope,
  hoje,
  nutrients,
  nutrientList,
  mealTypes,
  pending,
  onSave,
}: {
  period: GoalPeriod;
  scope: ScopeState;
  hoje: string;
  nutrients: Record<string, NutrientDefinition>;
  nutrientList: NutrientDefinition[];
  mealTypes: MealType[];
  pending: boolean;
  onSave: (items: { nutrient_code: string; target_amount: string | null; target_percent: string | null; min_amount: string | null; max_amount: string | null }[]) => void;
}) {
  // Os valores já cadastrados NESTE escopo alimentam o formulário.
  const existing = React.useMemo(() => {
    const map = new Map<string, { amount: string; percent: string; min: string; max: string }>();
    for (const item of period.items) {
      if (item.weekday !== scope.weekday) continue;
      if (item.dayKind !== scope.dayKind) continue;
      if ((item.mealTypeId ?? null) !== scope.mealTypeId) continue;
      map.set(item.nutrientCode, {
        amount: item.targetAmount === null ? "" : String(item.targetAmount),
        percent: item.targetPercent === null ? "" : String(item.targetPercent),
        min: item.minAmount === null ? "" : String(item.minAmount),
        max: item.maxAmount === null ? "" : String(item.maxAmount),
      });
    }
    return map;
  }, [period.items, scope]);

  const [extraCodes, setExtraCodes] = React.useState<string[]>([]);
  const codes = React.useMemo(() => {
    const base = new Set<string>([...GOAL_DEFAULT_NUTRIENTS, ...existing.keys(), ...extraCodes]);
    return [...base].sort(
      (a, b) => (nutrients[a]?.position ?? 999) - (nutrients[b]?.position ?? 999),
    );
  }, [existing, extraCodes, nutrients]);

  const [values, setValues] = React.useState<Record<string, { amount: string; percent: string; min: string; max: string }>>(
    () => Object.fromEntries(codes.map((code) => [code, existing.get(code) ?? { amount: "", percent: "", min: "", max: "" }])),
  );

  const isMealScope = scope.mealTypeId !== null;
  const dayGoals = React.useMemo(
    () => dayTargets(period, { date: hoje, dayKind: scope.dayKind }),
    [period, hoje, scope.dayKind],
  );

  function setField(code: string, field: "amount" | "percent" | "min" | "max", value: string) {
    setValues((current) => ({
      ...current,
      [code]: { ...(current[code] ?? { amount: "", percent: "", min: "", max: "" }), [field]: value },
    }));
  }

  const mealName = mealTypes.find((type) => type.id === scope.mealTypeId)?.name;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          {isMealScope ? (
            <>
              <UtensilsCrossed className="size-4 text-primary" />
              Meta de {mealName}
            </>
          ) : (
            <>
              <Target className="size-4 text-primary" />
              Meta do dia
            </>
          )}
        </CardTitle>
        <CardDescription>
          {isMealScope
            ? "Informe um valor absoluto ou um percentual da meta do dia. Campo vazio significa “sem meta”, não zero."
            : "Campo vazio significa “sem meta” — diferente de uma meta de zero."}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="pb-2 pe-3 font-medium">Nutriente</th>
                <th className="pb-2 pe-3 font-medium">Meta</th>
                {isMealScope && <th className="pb-2 pe-3 font-medium">% do dia</th>}
                <th className="pb-2 pe-3 font-medium">Mínimo</th>
                <th className="pb-2 font-medium">Máximo</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {codes.map((code) => {
                const definition = nutrients[code];
                const value = values[code] ?? { amount: "", percent: "", min: "", max: "" };
                const distributed = isMealScope
                  ? null
                  : distributedPercent(period, { date: hoje, dayKind: scope.dayKind }, code, dayGoals[code]?.amount ?? null);

                return (
                  <tr key={code}>
                    <td className="py-2 pe-3">
                      <p className="font-medium">{definition?.name ?? code}</p>
                      <p className="text-xs text-muted-foreground">
                        {definition?.unit}
                        {distributed !== null && (
                          <>
                            {" · "}
                            <span className={cn(distributed > 100 && "text-amber-600 dark:text-amber-400")}>
                              {roundForDisplay(distributed, 0)}% distribuído entre as refeições
                            </span>
                          </>
                        )}
                      </p>
                    </td>
                    <td className="py-2 pe-3">
                      <Input
                        inputMode="decimal"
                        value={value.amount}
                        onChange={(event) => setField(code, "amount", event.target.value)}
                        placeholder="—"
                        className="h-8 w-24"
                        aria-label={`Meta de ${definition?.name ?? code}`}
                      />
                    </td>
                    {isMealScope && (
                      <td className="py-2 pe-3">
                        <Input
                          inputMode="decimal"
                          value={value.percent}
                          onChange={(event) => setField(code, "percent", event.target.value)}
                          placeholder="—"
                          className="h-8 w-20"
                          aria-label={`Percentual do dia para ${definition?.name ?? code}`}
                        />
                      </td>
                    )}
                    <td className="py-2 pe-3">
                      <Input
                        inputMode="decimal"
                        value={value.min}
                        onChange={(event) => setField(code, "min", event.target.value)}
                        placeholder="—"
                        className="h-8 w-20"
                        aria-label={`Mínimo de ${definition?.name ?? code}`}
                      />
                    </td>
                    <td className="py-2">
                      <Input
                        inputMode="decimal"
                        value={value.max}
                        onChange={(event) => setField(code, "max", event.target.value)}
                        placeholder="—"
                        className="h-8 w-20"
                        aria-label={`Máximo de ${definition?.name ?? code}`}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value=""
            onChange={(event) => {
              if (event.target.value) setExtraCodes((current) => [...current, event.target.value]);
            }}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Adicionar micronutriente"
          >
            <option value="">Adicionar nutriente…</option>
            {nutrientList
              .filter((definition) => !codes.includes(definition.code))
              .map((definition) => (
                <option key={definition.code} value={definition.code}>
                  {definition.name} ({definition.unit})
                </option>
              ))}
          </select>

          <Button
            className="ms-auto"
            disabled={pending}
            onClick={() =>
              onSave(
                codes.map((code) => {
                  const value = values[code] ?? { amount: "", percent: "", min: "", max: "" };
                  return {
                    nutrient_code: code,
                    target_amount: value.amount || null,
                    target_percent: isMealScope ? value.percent || null : null,
                    min_amount: value.min || null,
                    max_amount: value.max || null,
                  };
                }),
              )
            }
          >
            {pending ? "Salvando…" : "Salvar metas deste escopo"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════ Diálogos ═══════════════════════════ */

function PeriodDialog({
  mode,
  onOpenChange,
  hoje,
  period,
  onConfirm,
}: {
  mode: "novo" | "editar" | "suceder" | null;
  onOpenChange: (open: boolean) => void;
  hoje: string;
  period: GoalPeriod | null;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [name, setName] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [startsOn, setStartsOn] = React.useState(hoje);
  const [endsOn, setEndsOn] = React.useState("");
  const [goalType, setGoalType] = React.useState<GoalType>("fixa");
  const [saving, setSaving] = React.useState(false);

  const [lastMode, setLastMode] = React.useState(mode);
  if (mode !== lastMode) {
    setLastMode(mode);
    if (mode) {
      setName(mode === "editar" ? (period?.name ?? "") : "");
      setReason(mode === "editar" ? (period?.reason ?? "") : "");
      setStartsOn(mode === "editar" ? (period?.startsOn ?? hoje) : hoje);
      setEndsOn(mode === "editar" ? (period?.endsOn ?? "") : "");
      setGoalType(mode === "editar" ? (period?.goalType ?? "fixa") : "fixa");
      setSaving(false);
    }
  }

  return (
    <Dialog open={mode !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "editar"
              ? "Editar período"
              : mode === "suceder"
                ? "Começar novo período"
                : "Novo período de meta"}
          </DialogTitle>
          <DialogDescription>
            {mode === "editar" ? (
              <>
                Editar altera a meta de <strong>todos os dias já vividos</strong> dentro deste
                período. Se o objetivo mudou, prefira “Começar novo período”.
              </>
            ) : mode === "suceder" ? (
              <>
                O período atual será encerrado na véspera da data escolhida, preservando os
                relatórios anteriores. Nada do que já foi registrado muda.
              </>
            ) : (
              "Nenhum valor é definido automaticamente — você escolhe os alvos depois de criar."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="period-name">Nome (opcional)</Label>
            <Input
              id="period-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: manutenção, preparação"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="period-start">Início</Label>
              <Input
                id="period-start"
                type="date"
                value={startsOn}
                onChange={(event) => setStartsOn(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="period-end">Fim (opcional)</Label>
              <Input
                id="period-end"
                type="date"
                value={endsOn}
                onChange={(event) => setEndsOn(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Vazio = vale daqui em diante.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="period-type">Como a meta varia</Label>
            <select
              id="period-type"
              value={goalType}
              onChange={(event) => setGoalType(event.target.value as GoalType)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {GOAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {GOAL_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">{GOAL_TYPE_HINTS[goalType]}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="period-reason">Motivo (opcional)</Label>
            <Textarea
              id="period-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="Por que esta meta existe. O sistema registra, não interpreta."
            />
          </div>

          {mode === "suceder" && startsOn && (
            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              O período atual será encerrado em {longDateLabel(startsOn)} menos um dia, e o novo
              vale a partir de {longDateLabel(startsOn)}.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!startsOn || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                name: name || undefined,
                reason: reason || undefined,
                starts_on: startsOn,
                ends_on: endsOn || undefined,
                goal_type: goalType,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Perfil + estimador.
 *
 * O botão do estimador NÃO grava meta: mostra o número, a fórmula e o aviso. Quem transforma
 * isso em alvo é o usuário, digitando na tabela de metas.
 */
function ProfileDialog({
  open,
  onOpenChange,
  profile,
  hoje,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: NutritionProfile | null;
  hoje: string;
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [birthDate, setBirthDate] = React.useState(profile?.birthDate ?? "");
  const [sex, setSex] = React.useState(profile?.sex ?? "nao_informado");
  const [height, setHeight] = React.useState(profile?.heightCm ? String(profile.heightCm) : "");
  const [weight, setWeight] = React.useState(profile?.weightKg ? String(profile.weightKg) : "");
  const [activity, setActivity] = React.useState(profile?.activityLevel ?? "nao_informado");
  const [direction, setDirection] = React.useState(profile?.goalDirection ?? "nao_informado");
  const [saving, setSaving] = React.useState(false);
  const [showEstimate, setShowEstimate] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setBirthDate(profile?.birthDate ?? "");
      setSex(profile?.sex ?? "nao_informado");
      setHeight(profile?.heightCm ? String(profile.heightCm) : "");
      setWeight(profile?.weightKg ? String(profile.weightKg) : "");
      setActivity(profile?.activityLevel ?? "nao_informado");
      setDirection(profile?.goalDirection ?? "nao_informado");
      setShowEstimate(false);
      setSaving(false);
    }
  }

  const draft = {
    sex,
    weightKg: weight ? Number(weight.replace(",", ".")) : null,
    heightCm: height ? Number(height.replace(",", ".")) : null,
    birthDate: birthDate || null,
    activityLevel: activity,
  };
  const estimate = estimateEnergyExpenditure(draft, hoje);
  const missing = missingForEstimate(draft);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Perfil nutricional</DialogTitle>
          <DialogDescription>
            Tudo aqui é opcional e informado por você. Serve para contextualizar as telas e para
            uma estimativa opcional de gasto energético.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-birth">Data de nascimento</Label>
              <Input
                id="profile-birth"
                type="date"
                value={birthDate}
                onChange={(event) => setBirthDate(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-sex">Sexo biológico</Label>
              <select
                id="profile-sex"
                value={sex}
                onChange={(event) => setSex(event.target.value as typeof sex)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {PROFILE_SEXES.map((value) => (
                  <option key={value} value={value}>
                    {PROFILE_SEX_LABELS[value]}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground">
                Usado apenas pela equação do estimador.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="profile-height">Altura (cm)</Label>
              <Input
                id="profile-height"
                inputMode="decimal"
                value={height}
                onChange={(event) => setHeight(event.target.value)}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="profile-weight">Peso (kg)</Label>
              <Input
                id="profile-weight"
                inputMode="decimal"
                value={weight}
                onChange={(event) => setWeight(event.target.value)}
                placeholder="—"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-activity">Nível de atividade</Label>
            <select
              id="profile-activity"
              value={activity}
              onChange={(event) => setActivity(event.target.value as typeof activity)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {ACTIVITY_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {ACTIVITY_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">{ACTIVITY_LEVEL_HINTS[activity]}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="profile-direction">Objetivo declarado</Label>
            <select
              id="profile-direction"
              value={direction}
              onChange={(event) => setDirection(event.target.value as typeof direction)}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {GOAL_DIRECTIONS.map((value) => (
                <option key={value} value={value}>
                  {GOAL_DIRECTION_LABELS[value]}
                </option>
              ))}
            </select>
          </div>

          {/* ── Estimador OPCIONAL ── */}
          <div className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">Estimativa de gasto energético</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={missing.length > 0}
                onClick={() => setShowEstimate((current) => !current)}
              >
                <Calculator className="size-4" />
                {showEstimate ? "Ocultar" : "Calcular"}
              </Button>
            </div>

            {missing.length > 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Faltam: {missing.join(", ")}. Sem esses dados a conta não é feita — estimar sem
                eles seria inventar.
              </p>
            ) : (
              showEstimate &&
              estimate && (
                <div className="mt-2 space-y-1.5">
                  <p className="text-sm">
                    <strong className="tabular-nums">
                      {Math.round(estimate.total).toLocaleString("pt-BR")} kcal/dia
                    </strong>{" "}
                    <span className="text-xs text-muted-foreground">
                      (basal: {Math.round(estimate.bmr).toLocaleString("pt-BR")} kcal)
                    </span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">{estimate.formula}</p>
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {ESTIMATE_DISCLAIMER}
                  </p>
                </div>
              )
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                birth_date: birthDate || undefined,
                sex,
                height_cm: height || undefined,
                weight_kg: weight || undefined,
                activity_level: activity,
                goal_direction: direction,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Salvar perfil"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
