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
import dynamic from "next/dynamic";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { roundForDisplay } from "@/lib/nutrition/calc";
import {
  DAY_KINDS,
  DAY_KIND_LABELS,
  GOAL_DEFAULT_NUTRIENTS,
  GOAL_TYPE_HINTS,
  GOAL_TYPE_LABELS,
  WEEKDAY_LABELS,
  type DayKind,
} from "@/lib/nutrition/constants";
import {
  ADHERENCE_FORMULA,
  dayTargets,
  distributedPercent,
  goalPeriodForDate,
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
import { mensagemDaAction } from "@/lib/forms/mensagem-da-action";

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const PeriodDialog = dynamic(
  () => import("./period-dialog").then((m) => m.PeriodDialog),
  { ssr: false },
);
const ProfileDialog = dynamic(
  () => import("./profile-dialog").then((m) => m.ProfileDialog),
  { ssr: false },
);

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
  const periodDialogMontado = useLazyDialog(periodDialog !== null);
  const profileDialogMontado = useLazyDialog(profileOpen);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível concluir." }));
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

      {periodDialogMontado && (
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
              toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível salvar." }));
            }
          }}
        />
      )}

      {profileDialogMontado && (
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
              toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível salvar." }));
            }
          }}
        />
      )}
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
