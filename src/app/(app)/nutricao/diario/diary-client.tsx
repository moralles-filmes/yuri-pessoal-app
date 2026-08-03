"use client";

/**
 * Fase 16-B — Dieta e Alimentação · Diário alimentar (cliente).
 *
 * ══ O QUE ESTA TELA PRECISA DEIXAR ÓBVIO ══
 *
 * 1. O TOTAL PODE SER PARCIAL. Todo número somado carrega um selo de qualidade quando não é
 *    exato. "1.850 kcal" com um item sem energia analisada é um piso, não o valor do dia — e
 *    esconder isso faria a pessoa tomar decisão sobre um número que não existe.
 *
 * 2. PENDENTE É DERIVADO. O estado de cada refeição vem de `effectiveMealStatus(meal, agora)`,
 *    calculado no render. Nada de "pendente" gravado no banco.
 *
 * 3. PLANEJADO ≠ CONSUMIDO. Quando a refeição veio do planejamento, a comparação aparece lado
 *    a lado — e o plano continua intacto, aconteça o que acontecer com o consumo.
 *
 * `agora` chega do servidor (data e minutos em Brasília) e é fixo durante a renderização:
 * nenhum componente chama `Date.now()`, que faria servidor e cliente divergirem na hidratação.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Clock,
  Droplets,
  MoreHorizontal,
  Plus,
  Trash2,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { cn } from "@/lib/utils";
import {
  formatNutrientAmount,
  roundForDisplay,
  type NutrientTotal,
} from "@/lib/nutrition/calc";
import {
  addDaysIso,
  longDateLabel,
  relativeDayLabel,
  shortDateLabel,
  shortTime,
  weekDays,
} from "@/lib/nutrition/calendar";
import {
  CHANGE_KIND_LABELS,
  CORE_NUTRIENTS,
  EFFECTIVE_MEAL_STATUS_HINTS,
  EFFECTIVE_MEAL_STATUS_LABELS,
  MACRO_ORDER,
  MEAL_STATUSES,
  MEAL_STATUS_LABELS,
  type MealStatus,
} from "@/lib/nutrition/constants";
import {
  comparePlannedVsConsumed,
  dayTotals,
  effectiveMealStatus,
  entryCounts,
  mealTotals,
  rangeTotals,
  sortMealsByTime,
  summarizeDay,
  type NowContext,
  type PlannedFoodData,
} from "@/lib/nutrition/diary";
import {
  adherence,
  dayTargets,
  goalPeriodForDate,
  progressForDay,
} from "@/lib/nutrition/goals";
import { describeSnapshotPortion } from "@/lib/nutrition/snapshot";
import type {
  DiaryMeal,
  FoodListItem,
  GoalPeriod,
  MealType,
  NutrientDefinition,
  PlannedMeal,
} from "@/lib/nutrition/types";
import {
  addDiaryEntry,
  addDiaryFreeEntry,
  confirmPlannedMeal,
  deleteDiaryEntry,
  deleteDiaryMeal,
  importPlannedDay,
  saveDiaryMeal,
  setDiaryMealStatus,
  updateDiaryEntryQuantity,
} from "@/lib/actions/nutrition-diary";
import { AdherenceBadge, GoalProgressBar } from "@/components/nutrition/goal-progress-bar";
import {
  FoodPickerDialog,
  type PickerMeasure,
} from "@/components/nutrition/food-picker-dialog";
import { TotalQualityBadge } from "@/components/nutrition/nutrient-value";

type WaterDay = { habitId: string; name: string; unit: string; target: number; value: number; done: boolean };

export type DiaryClientProps = {
  date: string;
  hoje: string;
  minutosAgora: number;
  view: "dia" | "semana";
  meals: DiaryMeal[];
  weekMeals: DiaryMeal[];
  planned: PlannedMeal[];
  mealTypes: MealType[];
  periods: GoalPeriod[];
  foods: FoodListItem[];
  measures: [string, PickerMeasure[]][];
  foodData: [string, PlannedFoodData][];
  foodNames: [string, string][];
  nutrients: Record<string, NutrientDefinition>;
  water: WaterDay | null;
};

export function DiaryClient(props: DiaryClientProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  // `now` precisa ser estável entre renders: ele entra nas dependências dos memos e, se
  // fosse recriado, o resumo do dia recalcularia a cada render sem nenhum dado ter mudado.
  const now: NowContext = React.useMemo(
    () => ({ hoje: props.hoje, minutosAgora: props.minutosAgora }),
    [props.hoje, props.minutosAgora],
  );
  const measures = React.useMemo(() => new Map(props.measures), [props.measures]);
  const foodData = React.useMemo(() => new Map(props.foodData), [props.foodData]);
  const foodNames = React.useMemo(() => new Map(props.foodNames), [props.foodNames]);
  const plannedById = React.useMemo(
    () => new Map(props.planned.map((meal) => [meal.id, meal])),
    [props.planned],
  );

  const orderedMeals = React.useMemo(() => sortMealsByTime(props.meals), [props.meals]);
  const totals = React.useMemo(() => dayTotals(props.meals), [props.meals]);
  const summary = React.useMemo(() => summarizeDay(props.meals, now), [props.meals, now]);

  // Meta VIGENTE NA DATA consultada — nunca "a meta de agora".
  const period = React.useMemo(
    () => goalPeriodForDate(props.periods, props.date),
    [props.periods, props.date],
  );
  const targets = React.useMemo(
    () => dayTargets(period, { date: props.date, dayKind: null }),
    [period, props.date],
  );
  const progress = React.useMemo(() => progressForDay(totals, targets), [totals, targets]);
  const dayAdherence = React.useMemo(() => adherence(progress), [progress]);

  /* ── Navegação por data e visão (estado na URL, padrão do projeto) ── */
  function goTo(next: { date?: string; view?: string }) {
    const search = new URLSearchParams(params.toString());
    if (next.date) search.set("data", next.date);
    if (next.view) search.set("visao", next.view);
    router.push(`/nutricao/diario?${search.toString()}`);
  }

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

  /* ── Diálogos ── */
  const [pickerMealId, setPickerMealId] = React.useState<string | null>(null);
  const [freeMealId, setFreeMealId] = React.useState<string | null>(null);
  const [newMealOpen, setNewMealOpen] = React.useState(false);
  const [editEntry, setEditEntry] = React.useState<{ id: string; label: string; quantity: number } | null>(null);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Diário alimentar"
        description="O que foi realmente consumido, dia a dia."
      >
        <Button variant="outline" onClick={() => setNewMealOpen(true)} disabled={pending}>
          <Plus className="size-4" />
          Refeição
        </Button>
      </PageHeader>

      {/* ── Barra de datas ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Dia anterior"
          onClick={() => goTo({ date: addDaysIso(props.date, -1) })}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Próximo dia"
          onClick={() => goTo({ date: addDaysIso(props.date, 1) })}
        >
          <ChevronRight className="size-4" />
        </Button>

        <div className="min-w-0">
          <p className="text-sm font-semibold">{relativeDayLabel(props.date, props.hoje)}</p>
          <p className="text-xs text-muted-foreground">{longDateLabel(props.date)}</p>
        </div>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={props.date}
            onChange={(event) => event.target.value && goTo({ date: event.target.value })}
            className="w-40"
            aria-label="Escolher data"
          />
          {props.date !== props.hoje && (
            <Button variant="ghost" size="sm" onClick={() => goTo({ date: props.hoje })}>
              Hoje
            </Button>
          )}
          <div className="flex rounded-lg border p-0.5">
            {(["dia", "semana"] as const).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => goTo({ view })}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  props.view === view
                    ? "bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {view === "dia" ? "Dia" : "Semana"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {props.view === "semana" ? (
        <WeekView
          date={props.date}
          hoje={props.hoje}
          meals={props.weekMeals}
          nutrients={props.nutrients}
          onPickDay={(day) => goTo({ date: day, view: "dia" })}
        />
      ) : (
        <>
          {/* ── Indicadores do dia ── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Energia"
              value={
                totals[CORE_NUTRIENTS.energia]
                  ? `${roundForDisplay(totals[CORE_NUTRIENTS.energia].amount, 0).toLocaleString("pt-BR")} kcal`
                  : "—"
              }
              icon={UtensilsCrossed}
              hint={
                targets[CORE_NUTRIENTS.energia]?.amount
                  ? `Meta: ${roundForDisplay(targets[CORE_NUTRIENTS.energia].amount!, 0).toLocaleString("pt-BR")} kcal`
                  : "Sem meta definida"
              }
            />
            <StatCard
              label="Refeições"
              value={`${summary.consumidas}/${summary.total}`}
              icon={Check}
              hint={
                summary.pendentes > 0
                  ? `${summary.pendentes} pendente${summary.pendentes > 1 ? "s" : ""}${summary.atrasadas > 0 ? ` · ${summary.atrasadas} atrasada${summary.atrasadas > 1 ? "s" : ""}` : ""}`
                  : "Nada pendente"
              }
            />
            <Card>
              <CardContent className="space-y-1.5 p-5">
                <p className="text-sm font-medium text-muted-foreground">Aderência</p>
                <AdherenceBadge percent={dayAdherence.percent} quality={dayAdherence.quality} />
                <p className="text-xs text-muted-foreground">
                  {dayAdherence.counted > 0
                    ? `${dayAdherence.counted} nutriente${dayAdherence.counted > 1 ? "s" : ""} com meta`
                    : "Defina metas para acompanhar"}
                </p>
              </CardContent>
            </Card>
            <WaterCard water={props.water} />
          </div>

          {/* ── Macros contra a meta ── */}
          {Object.keys(targets).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Metas do dia</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {MACRO_ORDER.filter((code) => progress[code]).map((code) => (
                  <GoalProgressBar
                    key={code}
                    progress={progress[code]}
                    definition={props.nutrients[code]}
                    label={props.nutrients[code]?.shortName ?? props.nutrients[code]?.name ?? code}
                  />
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Trazer o planejamento do dia ── */}
          {props.planned.length > 0 &&
            props.planned.some((meal) => !props.meals.some((m) => m.plannedMealId === meal.id)) && (
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-sm font-medium">
                      Há {props.planned.length} refeição{props.planned.length > 1 ? "ões" : ""}{" "}
                      planejada{props.planned.length > 1 ? "s" : ""} para este dia.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Trazer para o diário não registra consumo — cada refeição continua
                      esperando a sua confirmação.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      run(async () => {
                        const result = await importPlannedDay(props.date);
                        return result.ok
                          ? { ok: true }
                          : { ok: false, error: result.error };
                      }, "Planejamento trazido para o diário.")
                    }
                  >
                    Trazer planejamento
                  </Button>
                </CardContent>
              </Card>
            )}

          {/* ── Refeições ── */}
          {orderedMeals.length === 0 ? (
            <EmptyState
              icon={UtensilsCrossed}
              title="Nada registrado neste dia"
              description="Adicione uma refeição para começar a registrar o que você comeu."
            >
              <Button onClick={() => setNewMealOpen(true)}>
                <Plus className="size-4" />
                Adicionar refeição
              </Button>
            </EmptyState>
          ) : (
            <div className="space-y-3">
              {orderedMeals.map((meal) => (
                <MealCard
                  key={meal.id}
                  meal={meal}
                  now={now}
                  planned={meal.plannedMealId ? (plannedById.get(meal.plannedMealId) ?? null) : null}
                  foodNames={foodNames}
                  foodData={foodData}
                  measures={measures}
                  nutrients={props.nutrients}
                  pending={pending}
                  onAddFood={() => setPickerMealId(meal.id)}
                  onAddFree={() => setFreeMealId(meal.id)}
                  onEditEntry={setEditEntry}
                  onRun={run}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Diálogos ── */}
      <FoodPickerDialog
        open={pickerMealId !== null}
        onOpenChange={(open) => !open && setPickerMealId(null)}
        foods={props.foods}
        measures={measures}
        title="Registrar consumo"
        description="Escolha o alimento e a porção. Os valores nutricionais são congelados agora — editar o alimento depois não muda este registro."
        onConfirm={async (picked) => {
          const result = await addDiaryEntry({
            diary_meal_id: pickerMealId,
            food_id: picked.foodId,
            quantity: picked.quantity,
            measure_id: picked.measureId,
            notes: picked.notes,
          });
          if (result.ok) {
            toast.success("Consumo registrado.");
            setPickerMealId(null);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível registrar.");
          }
        }}
      />

      <FreeEntryDialog
        open={freeMealId !== null}
        onOpenChange={(open) => !open && setFreeMealId(null)}
        onConfirm={async (label) => {
          const result = await addDiaryFreeEntry({ diary_meal_id: freeMealId, label });
          if (result.ok) {
            toast.success("Item registrado sem valor nutricional.");
            setFreeMealId(null);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível registrar.");
          }
        }}
      />

      <NewMealDialog
        open={newMealOpen}
        onOpenChange={setNewMealOpen}
        date={props.date}
        mealTypes={props.mealTypes}
        onConfirm={async (payload) => {
          const result = await saveDiaryMeal(payload);
          if (result.ok) {
            toast.success("Refeição adicionada.");
            setNewMealOpen(false);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível adicionar.");
          }
        }}
      />

      <EditQuantityDialog
        entry={editEntry}
        onOpenChange={(open) => !open && setEditEntry(null)}
        onConfirm={async (quantity) => {
          if (!editEntry) return;
          const result = await updateDiaryEntryQuantity({
            entry_id: editEntry.id,
            quantity,
          });
          if (result.ok) {
            toast.success("Quantidade atualizada.");
            setEditEntry(null);
            router.refresh();
          } else {
            toast.error(result.error ?? "Não foi possível atualizar.");
          }
        }}
      />
    </div>
  );
}

/* ═══════════════════════════ Refeição ═══════════════════════════ */

function MealCard({
  meal,
  now,
  planned,
  foodNames,
  foodData,
  measures,
  nutrients,
  pending,
  onAddFood,
  onAddFree,
  onEditEntry,
  onRun,
}: {
  meal: DiaryMeal;
  now: NowContext;
  planned: PlannedMeal | null;
  foodNames: Map<string, string>;
  foodData: Map<string, PlannedFoodData>;
  measures: Map<string, PickerMeasure[]>;
  nutrients: Record<string, NutrientDefinition>;
  pending: boolean;
  onAddFood: () => void;
  onAddFree: () => void;
  onEditEntry: (entry: { id: string; label: string; quantity: number }) => void;
  onRun: (action: () => Promise<{ ok: boolean; error?: string }>, success: string) => void;
}) {
  const state = effectiveMealStatus(meal, now);
  const totals = mealTotals(meal.entries);
  const energia: NutrientTotal | undefined = totals[CORE_NUTRIENTS.energia];

  const comparison = planned
    ? comparePlannedVsConsumed(planned.items, meal.entries, {
        foodNames,
        foodData,
        measures: new Map(
          [...measures.values()].flat().map((m) => [m.id, { label: m.label, grams: m.grams, milliliters: m.milliliters }]),
        ),
      })
    : null;

  return (
    <Card className={cn(state.isLate && "border-amber-500/40")}>
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div className="min-w-0">
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            {meal.mealTypeIcon && <span aria-hidden>{meal.mealTypeIcon}</span>}
            <span className="truncate">{meal.title || meal.mealTypeName}</span>
            <StatusBadge status={state.status} isLate={state.isLate} />
          </CardTitle>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {meal.plannedTime && (
              <span className="inline-flex items-center gap-1">
                <Clock className="size-3" />
                Previsto {shortTime(meal.plannedTime)}
              </span>
            )}
            {meal.consumedTime && <span>Consumido {shortTime(meal.consumedTime)}</span>}
            {state.minutesLate !== null && state.isLate && (
              <span className="text-amber-600 dark:text-amber-400">
                {state.minutesLate} min de atraso
              </span>
            )}
            {state.daysLate !== null && (
              <span className="text-amber-600 dark:text-amber-400">
                {state.daysLate} dia{state.daysLate > 1 ? "s" : ""} sem registro
              </span>
            )}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {energia && (
            <span className="hidden items-center gap-1.5 text-sm font-semibold tabular-nums sm:inline-flex">
              {roundForDisplay(energia.amount, 0).toLocaleString("pt-BR")} kcal
              <TotalQualityBadge quality={energia.quality} />
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Ações da refeição">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {planned && (
                <>
                  <DropdownMenuItem
                    disabled={pending}
                    onClick={() =>
                      onRun(async () => {
                        const result = await confirmPlannedMeal({
                          planned_meal_id: planned.id,
                          diary_date: meal.diaryDate,
                        });
                        if (!result.ok) return { ok: false, error: result.error };
                        if (result.data.falhas.length > 0) {
                          toast.warning(result.data.falhas.join(" "));
                        }
                        return { ok: true };
                      }, "Refeição confirmada conforme o planejado.")
                    }
                  >
                    <Check className="size-4" />
                    Confirmar o planejado
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {MEAL_STATUSES.filter((status) => status !== meal.status).map((status) => (
                <DropdownMenuItem
                  key={status}
                  disabled={pending}
                  onClick={() =>
                    onRun(
                      () => setDiaryMealStatus({ meal_id: meal.id, status }),
                      `Marcada como ${MEAL_STATUS_LABELS[status].toLowerCase()}.`,
                    )
                  }
                >
                  {MEAL_STATUS_LABELS[status]}
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  if (!confirm("Excluir esta refeição e todos os itens registrados nela?")) return;
                  onRun(() => deleteDiaryMeal(meal.id), "Refeição excluída.");
                }}
              >
                <Trash2 className="size-4" />
                Excluir refeição
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {meal.entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada registrado nesta refeição ainda.</p>
        ) : (
          <ul className="divide-y">
            {meal.entries.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p
                    className={cn(
                      "truncate text-sm",
                      !entryCounts(entry) && "text-muted-foreground line-through",
                    )}
                  >
                    {entry.foodNameSnapshot}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{describeSnapshotPortion(entry) || "sem quantidade"}</span>
                    {entry.changeKind !== "extra" && (
                      <Badge variant="outline" className="text-[10px]">
                        {CHANGE_KIND_LABELS[entry.changeKind]}
                      </Badge>
                    )}
                    {entry.entryKind === "livre" && entryCounts(entry) && (
                      <Badge variant="secondary" className="text-[10px]">
                        Sem valor nutricional
                      </Badge>
                    )}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-xs tabular-nums text-muted-foreground">
                    {entry.energyKcal === null
                      ? "—"
                      : `${roundForDisplay(entry.energyKcal, 0).toLocaleString("pt-BR")} kcal`}
                  </span>
                  {entry.entryKind === "alimento" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-xs"
                      disabled={pending}
                      onClick={() =>
                        onEditEntry({
                          id: entry.id,
                          label: entry.foodNameSnapshot,
                          quantity: entry.quantity,
                        })
                      }
                    >
                      Quantidade
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    aria-label={`Excluir ${entry.foodNameSnapshot}`}
                    disabled={pending}
                    onClick={() => onRun(() => deleteDiaryEntry(entry.id), "Item excluído.")}
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Planejado × consumido, derivado na leitura. O plano não é alterado por nada aqui. */}
        {comparison && comparison.rows.length > 0 && (
          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-medium">Planejado × consumido</p>
            <ul className="mt-2 space-y-1">
              {comparison.rows.map((row, index) => (
                <li
                  key={`${row.plannedItemId ?? row.entryId ?? index}`}
                  className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground"
                >
                  <span className="font-medium text-foreground">
                    {row.plannedLabel ?? row.consumedLabel ?? "Item"}
                  </span>
                  <Badge variant="outline" className="text-[10px]">
                    {row.kind === "nao_registrado"
                      ? row.isOptional
                        ? "Opcional, não registrado"
                        : "Não registrado"
                      : CHANGE_KIND_LABELS[row.kind]}
                  </Badge>
                </li>
              ))}
            </ul>
            {comparison.diff[CORE_NUTRIENTS.energia] && (
              <p className="mt-2 text-xs text-muted-foreground">
                Diferença de energia:{" "}
                <strong className="text-foreground tabular-nums">
                  {comparison.diff[CORE_NUTRIENTS.energia].diff >= 0 ? "+" : "−"}
                  {roundForDisplay(
                    Math.abs(comparison.diff[CORE_NUTRIENTS.energia].diff),
                    0,
                  ).toLocaleString("pt-BR")}{" "}
                  kcal
                </strong>{" "}
                em relação ao planejado
                <TotalQualityBadge
                  quality={comparison.diff[CORE_NUTRIENTS.energia].quality}
                  className="ms-1.5"
                />
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={onAddFood} disabled={pending}>
            <Plus className="size-4" />
            Alimento
          </Button>
          <Button variant="ghost" size="sm" onClick={onAddFree} disabled={pending}>
            Item sem valor nutricional
          </Button>
        </div>

        {/* Totais da refeição, com os macros e a qualidade de cada um. */}
        {meal.entries.some(entryCounts) && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-t pt-2">
            {MACRO_ORDER.filter((code) => totals[code]).map((code) => {
              const definition = nutrients[code];
              const total = totals[code];
              return (
                <span key={code} className="inline-flex items-baseline gap-1 text-xs">
                  <span className="text-muted-foreground">
                    {definition?.shortName ?? definition?.name ?? code}
                  </span>
                  <span className="font-medium tabular-nums">
                    {definition ? formatNutrientAmount(total.amount, definition) : roundForDisplay(total.amount, 1)}
                    {definition ? ` ${definition.unit}` : ""}
                  </span>
                  <TotalQualityBadge quality={total.quality} />
                </span>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status, isLate }: { status: keyof typeof EFFECTIVE_MEAL_STATUS_LABELS; isLate: boolean }) {
  const tone =
    status === "consumida"
      ? "bg-primary/15 text-primary"
      : status === "pendente"
        ? isLate
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
          : "bg-muted text-muted-foreground"
        : status === "nao_consumida"
          ? "bg-destructive/10 text-destructive"
          : "bg-muted text-muted-foreground";

  return (
    <span
      className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide", tone)}
      title={EFFECTIVE_MEAL_STATUS_HINTS[status]}
    >
      {EFFECTIVE_MEAL_STATUS_LABELS[status]}
    </span>
  );
}

/* ═══════════════════════════ Semana ═══════════════════════════ */

function WeekView({
  date,
  hoje,
  meals,
  nutrients,
  onPickDay,
}: {
  date: string;
  hoje: string;
  meals: DiaryMeal[];
  nutrients: Record<string, NutrientDefinition>;
  onPickDay: (day: string) => void;
}) {
  const days = weekDays(date);
  const byDay = new Map<string, DiaryMeal[]>();
  for (const meal of meals) {
    const list = byDay.get(meal.diaryDate);
    if (list) list.push(meal);
    else byDay.set(meal.diaryDate, [meal]);
  }

  const dayTotalsList = days.map((day) => dayTotals(byDay.get(day) ?? []));
  const weekTotal = rangeTotals(dayTotalsList);
  const energiaSemana = weekTotal[CORE_NUTRIENTS.energia];
  const definition = nutrients[CORE_NUTRIENTS.energia];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            Semana de {shortDateLabel(days[0])} a {shortDateLabel(days[6])}
            {energiaSemana && <TotalQualityBadge quality={energiaSemana.quality} />}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Total da semana:{" "}
            <strong className="text-foreground tabular-nums">
              {energiaSemana
                ? `${roundForDisplay(energiaSemana.amount, 0).toLocaleString("pt-BR")} kcal`
                : "—"}
            </strong>
            {energiaSemana && (
              <>
                {" · "}média de{" "}
                <strong className="text-foreground tabular-nums">
                  {roundForDisplay(energiaSemana.amount / 7, 0).toLocaleString("pt-BR")} kcal/dia
                </strong>
              </>
            )}
          </p>
          {energiaSemana?.quality === "parcial" && (
            <p className="mt-1 text-xs text-muted-foreground">
              A semana tem itens sem todos os nutrientes analisados: o total é o mínimo
              conhecido, não o valor real.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {days.map((day, index) => {
          const dayMeals = byDay.get(day) ?? [];
          const total = dayTotalsList[index][CORE_NUTRIENTS.energia];
          return (
            <button
              key={day}
              type="button"
              onClick={() => onPickDay(day)}
              className={cn(
                "rounded-lg border p-3 text-left transition-colors hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                day === hoje && "border-primary/40 bg-primary/5",
              )}
            >
              <p className="text-xs font-medium">{relativeDayLabel(day, hoje)}</p>
              <p className="text-[11px] text-muted-foreground">{shortDateLabel(day)}</p>
              <p className="mt-2 text-sm font-semibold tabular-nums">
                {total
                  ? `${roundForDisplay(total.amount, 0).toLocaleString("pt-BR")} ${definition?.unit ?? "kcal"}`
                  : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {dayMeals.length === 0
                  ? "Sem registro"
                  : `${dayMeals.length} refeição${dayMeals.length > 1 ? "ões" : ""}`}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════ Água ═══════════════════════════ */

/**
 * A água vem do módulo Hábitos (Fase 10) e é SÓ LEITURA aqui.
 * Duplicar o registro faria os dois módulos discordarem no dia seguinte.
 */
function WaterCard({ water }: { water: WaterDay | null }) {
  if (!water) {
    return (
      <Card>
        <CardContent className="space-y-1.5 p-5">
          <p className="text-sm font-medium text-muted-foreground">Água</p>
          <p className="text-sm">Sem hábito de água cadastrado.</p>
          <Link href="/habitos" className="text-xs text-primary underline-offset-4 hover:underline">
            Criar em Hábitos
          </Link>
        </CardContent>
      </Card>
    );
  }

  const percent = water.target > 0 ? Math.min(100, (water.value / water.target) * 100) : 0;
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">Água</p>
          <Droplets className="size-4 text-primary" />
        </div>
        <p className="text-2xl font-semibold tabular-nums">
          {water.value.toLocaleString("pt-BR")}
          <span className="ms-1 text-sm font-normal text-muted-foreground">
            / {water.target.toLocaleString("pt-BR")} {water.unit}
          </span>
        </p>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
        </div>
        <Link href="/habitos" className="text-xs text-primary underline-offset-4 hover:underline">
          Registrar em Hábitos
        </Link>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════ Diálogos ═══════════════════════════ */

function NewMealDialog({
  open,
  onOpenChange,
  date,
  mealTypes,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  mealTypes: MealType[];
  onConfirm: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const active = mealTypes.filter((type) => type.isActive);
  const [mealTypeId, setMealTypeId] = React.useState(active[0]?.id ?? "");
  const [time, setTime] = React.useState("");
  const [status, setStatus] = React.useState<MealStatus>("fora_do_planejamento");
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      const first = active[0];
      setMealTypeId(first?.id ?? "");
      setTime(first?.defaultTime ? first.defaultTime.slice(0, 5) : "");
      setStatus("fora_do_planejamento");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova refeição</DialogTitle>
          <DialogDescription>
            Em {longDateLabel(date)}. Você registra os alimentos depois de criar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="meal-type">Tipo</Label>
            <select
              id="meal-type"
              value={mealTypeId}
              onChange={(event) => {
                setMealTypeId(event.target.value);
                const type = active.find((t) => t.id === event.target.value);
                setTime(type?.defaultTime ? type.defaultTime.slice(0, 5) : "");
              }}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {active.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.icon ? `${type.icon} ` : ""}
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="meal-time">Horário previsto</Label>
              <Input
                id="meal-time"
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meal-status">Situação</Label>
              <select
                id="meal-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as MealStatus)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {MEAL_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {MEAL_STATUS_LABELS[value]}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!mealTypeId || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm({
                diary_date: date,
                meal_type_id: mealTypeId,
                planned_time: time || null,
                status,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FreeEntryDialog({
  open,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (label: string) => Promise<void>;
}) {
  const [label, setLabel] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [lastOpen, setLastOpen] = React.useState(open);
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setLabel("");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Item sem valor nutricional</DialogTitle>
          <DialogDescription>
            Para o que você comeu mas não sabe a composição. O item fica registrado, e o total
            do dia passa a ser marcado como parcial — em vez de fingir que ele não existiu ou
            de inventar calorias para ele.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="free-label">O que foi consumido</Label>
          <Input
            id="free-label"
            autoFocus
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Ex.: almoço na casa da minha mãe"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!label.trim() || saving}
            onClick={async () => {
              setSaving(true);
              await onConfirm(label.trim());
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Registrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditQuantityDialog({
  entry,
  onOpenChange,
  onConfirm,
}: {
  entry: { id: string; label: string; quantity: number } | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (quantity: number) => Promise<void>;
}) {
  const [quantity, setQuantity] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const [lastId, setLastId] = React.useState<string | null>(entry?.id ?? null);
  if ((entry?.id ?? null) !== lastId) {
    setLastId(entry?.id ?? null);
    setQuantity(entry ? String(entry.quantity) : "");
    setSaving(false);
  }

  return (
    <Dialog open={entry !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ajustar quantidade</DialogTitle>
          <DialogDescription>
            {entry?.label}. Os valores nutricionais são recalculados agora, a partir do
            catálogo atual, e congelados de novo.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="edit-quantity">Quantidade</Label>
          <Input
            id="edit-quantity"
            autoFocus
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !Number(quantity.replace(",", "."))}
            onClick={async () => {
              setSaving(true);
              await onConfirm(Number(quantity.replace(",", ".")));
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
