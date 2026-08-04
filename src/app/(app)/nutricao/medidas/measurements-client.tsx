"use client";

/**
 * Fase 16-E — Medidas corporais e evolução (MÓDULO CENTRAL `body_*`).
 *
 * ══ O QUE ESTA TELA SE RECUSA A FAZER ══
 * Ela não avalia ninguém. Não há "peso ideal", faixa de IMC com juízo de valor, alvo sugerido
 * nem qualquer texto que transforme um número em veredito. Registrar é do usuário; concluir,
 * também. Todo cálculo vem de `src/lib/body/measurements.ts` (puro e testado) — nada é
 * recalculado aqui.
 *
 * Estado de navegação (tipo selecionado, período) vive na URL, como no resto do app.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarRange,
  Download,
  Loader2,
  Pencil,
  Plus,
  Ruler,
  Settings2,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/shared/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/shared/stat-card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { MeasurementChart, MeasurementTable } from "@/components/body/measurement-chart";
import { MeasurementTypesDialog } from "@/components/body/measurement-types-dialog";
import { ProgressPhotos } from "@/components/body/progress-photos";
import {
  CORRELATION_DISCLAIMER,
  EFFECTIVE_GOAL_STATUS_LABELS,
  GOAL_DIRECTION_LABELS,
  GOAL_DIRECTIONS,
  MEASUREMENT_CATEGORY_LABELS,
  MEASUREMENT_CATEGORY_ORDER,
  MEASUREMENT_CONDITION_LABELS,
  MEASUREMENT_CONDITIONS,
  MEASUREMENT_DISCLAIMER,
  MOVING_AVERAGE_HINT,
} from "@/lib/body/constants";
import {
  buildSeries,
  compareOnDates,
  formatDelta,
  formatMeasurement,
  formatPercent,
  goalForDate,
  goalProgress,
  hasEnoughForMovingAverage,
  registrationFrequency,
  summarizeType,
} from "@/lib/body/measurements";
import {
  deleteMeasurement,
  deleteMeasurementGoal,
  deleteMeasurements,
  saveMeasurement,
  saveMeasurementBatch,
  saveMeasurementGoal,
  setMeasurementGoalStatus,
} from "@/lib/actions/body-measurements";
import { addDaysIso, longDateLabel, shortDateLabel } from "@/lib/nutrition/calendar";
import { toCsv } from "@/lib/reports/csv";
import { downloadCsv } from "@/lib/reports/download";
import { MEASUREMENT_HEADERS, measurementRows } from "@/lib/nutrition/csv-export";
import type {
  MeasurementGoal,
  MeasurementType,
  MeasurementWithType,
  SignedProgressPhoto,
} from "@/lib/body/types";

const MOVING_WINDOW = 5;

/** Períodos oferecidos no filtro. `null` = histórico inteiro. */
const PERIODS: { value: string; label: string; days: number | null }[] = [
  { value: "30", label: "Últimos 30 dias", days: 30 },
  { value: "90", label: "Últimos 3 meses", days: 90 },
  { value: "180", label: "Últimos 6 meses", days: 180 },
  { value: "365", label: "Último ano", days: 365 },
  { value: "tudo", label: "Todo o histórico", days: null },
];

export type MeasurementsClientProps = {
  hoje: string;
  types: MeasurementType[];
  measurements: MeasurementWithType[];
  goals: MeasurementGoal[];
  photos: SignedProgressPhoto[];
  selectedTypeId: string | null;
  period: string;
};

export function MeasurementsClient(props: MeasurementsClientProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = React.useTransition();

  const [formOpen, setFormOpen] = React.useState(false);
  const [batchOpen, setBatchOpen] = React.useState(false);
  const [typesOpen, setTypesOpen] = React.useState(false);

  /** Quantas medições cada tipo tem — derivado da lista já carregada, sem ida ao banco. */
  const measurementCountByType = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const m of props.measurements) {
      map.set(m.typeId, (map.get(m.typeId) ?? 0) + 1);
    }
    return map;
  }, [props.measurements]);
  const [goalOpen, setGoalOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<MeasurementWithType | null>(null);
  const [editingGoal, setEditingGoal] = React.useState<MeasurementGoal | null>(null);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const activeTypes = React.useMemo(
    () => props.types.filter((type) => type.isActive),
    [props.types],
  );

  const selectedType =
    props.types.find((type) => type.id === props.selectedTypeId) ?? activeTypes[0] ?? null;

  /** Início do período em DATA PURA — aritmética em `Date.UTC`, nunca `new Date()` local. */
  const periodDays = PERIODS.find((p) => p.value === props.period)?.days ?? null;
  const from = periodDays === null ? null : addDaysIso(props.hoje, -periodDays + 1);

  const typeMeasurements = React.useMemo(
    () =>
      selectedType
        ? props.measurements.filter((item) => item.typeId === selectedType.id)
        : [],
    [props.measurements, selectedType],
  );

  const inPeriod = React.useMemo(
    () => (from === null ? typeMeasurements : typeMeasurements.filter((m) => m.measuredOn >= from)),
    [typeMeasurements, from],
  );

  // O resumo usa o PERÍODO; o "valor inicial absoluto" usa o histórico inteiro. São perguntas
  // diferentes, e misturá-las faria "inicial" significar "o mais antigo que coube na tela".
  const summary = React.useMemo(() => summarizeType(inPeriod), [inPeriod]);
  const allTimeSummary = React.useMemo(() => summarizeType(typeMeasurements), [typeMeasurements]);

  const seriesFrom = from ?? (typeMeasurements[typeMeasurements.length - 1]?.measuredOn ?? props.hoje);
  const series = React.useMemo(
    () => buildSeries(inPeriod, seriesFrom, props.hoje, MOVING_WINDOW),
    [inPeriod, seriesFrom, props.hoje],
  );

  const goal = React.useMemo(
    () =>
      selectedType
        ? goalForDate(
            props.goals.filter((g) => g.typeId === selectedType.id),
            props.hoje,
          )
        : null,
    [props.goals, selectedType, props.hoje],
  );

  const progress = React.useMemo(
    () => (goal ? goalProgress(goal, typeMeasurements, props.hoje) : null),
    [goal, typeMeasurements, props.hoje],
  );

  const frequency = React.useMemo(
    () => registrationFrequency(inPeriod, seriesFrom, props.hoje),
    [inPeriod, seriesFrom, props.hoje],
  );

  function goTo(next: { tipo?: string; periodo?: string }) {
    const search = new URLSearchParams(params.toString());
    if (next.tipo) search.set("tipo", next.tipo);
    if (next.periodo) search.set("periodo", next.periodo);
    router.push(`/nutricao/medidas?${search.toString()}`);
  }

  function refresh() {
    router.refresh();
    setSelected(new Set());
  }

  function handleDelete(id: string) {
    if (!window.confirm("Excluir esta medição? A ação não pode ser desfeita.")) return;
    startTransition(async () => {
      const result = await deleteMeasurement(id);
      if (result.ok) {
        toast.success("Medição excluída.");
        refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  /**
   * Exclusão em massa. Só alcança o que está NO FILTRO ATUAL — mesma disciplina do
   * `selectionInScope` da 16-D: uma seleção feita num período não pode apagar registro que
   * o usuário nem está vendo.
   */
  function handleBulkDelete() {
    const visible = new Set(inPeriod.map((item) => item.id));
    const ids = [...selected].filter((id) => visible.has(id));
    if (ids.length === 0) return;
    if (!window.confirm(`Excluir ${ids.length} medição(ões)? A ação não pode ser desfeita.`)) return;

    startTransition(async () => {
      const result = await deleteMeasurements({ ids });
      if (result.ok) {
        toast.success(`${result.data.count} medição(ões) excluída(s).`);
        refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleExport() {
    const rows = measurementRows(inPeriod);
    downloadCsv(
      `medidas-${selectedType?.slug ?? "todas"}-${props.hoje}.csv`,
      toCsv(rows, MEASUREMENT_HEADERS),
    );
  }

  const decimals = selectedType?.decimals ?? 1;
  const unit = selectedType?.unit ?? "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Medidas e evolução"
        description="Peso, composição corporal, circunferências e fotos privadas."
      >
        {/* 16-F: `saveMeasurementType`/`reorderMeasurementTypes`/`deleteMeasurementType`
            existiam desde a 16-E sem nenhuma tela chamando. */}
        <Button variant="outline" onClick={() => setTypesOpen(true)} disabled={pending}>
          <Settings2 className="size-4" />
          Tipos de medida
        </Button>
        <Button variant="outline" onClick={() => setBatchOpen(true)} disabled={pending}>
          <Ruler className="size-4" />
          Sessão de medidas
        </Button>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} disabled={pending}>
          <Plus className="size-4" />
          Registrar
        </Button>
      </PageHeader>

      {/* O sistema não avalia ninguém — e diz isso, uma vez, no topo. */}
      <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        {MEASUREMENT_DISCLAIMER}
      </p>

      {activeTypes.length === 0 ? (
        <EmptyState
          icon={Ruler}
          title="Nenhuma medida ativa"
          description="Ative ou crie um tipo de medida nas configurações do módulo para começar a registrar."
        />
      ) : (
        <>
          {/* ── Seletor de medida e período ── */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-52 space-y-1.5">
              <Label htmlFor="type-select">Medida</Label>
              <Select
                value={selectedType?.id ?? ""}
                onValueChange={(value) => goTo({ tipo: value })}
              >
                <SelectTrigger id="type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEASUREMENT_CATEGORY_ORDER.filter((category) =>
                    activeTypes.some((type) => type.category === category),
                  ).map((category) => (
                    <React.Fragment key={category}>
                      <div className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {MEASUREMENT_CATEGORY_LABELS[category]}
                      </div>
                      {activeTypes
                        .filter((type) => type.category === category)
                        .map((type) => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.name}
                          </SelectItem>
                        ))}
                    </React.Fragment>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="min-w-44 space-y-1.5">
              <Label htmlFor="period-select">Período</Label>
              <Select value={props.period} onValueChange={(value) => goTo({ periodo: value })}>
                <SelectTrigger id="period-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIODS.map((period) => (
                    <SelectItem key={period.value} value={period.value}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="ms-auto flex gap-2">
              <Button variant="outline" onClick={handleExport} disabled={inPeriod.length === 0}>
                <Download className="size-4" />
                Exportar CSV
              </Button>
              <Button variant="outline" onClick={() => { setEditingGoal(goal); setGoalOpen(true); }}>
                <Target className="size-4" />
                {goal ? "Editar meta" : "Definir meta"}
              </Button>
            </div>
          </div>

          {/* ── Indicadores ── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Valor atual"
              value={
                summary.current !== null
                  ? formatMeasurement(summary.current, unit, decimals)
                  : "—"
              }
              icon={Ruler}
              hint={
                summary.currentDate
                  ? `Medido em ${longDateLabel(summary.currentDate)}`
                  : "Nenhuma medição no período"
              }
            />
            <StatCard
              label="No início do período"
              value={
                summary.initial !== null
                  ? formatMeasurement(summary.initial, unit, decimals)
                  : "—"
              }
              icon={CalendarRange}
              hint={
                summary.initialDate
                  ? `Medido em ${longDateLabel(summary.initialDate)}`
                  : "Sem referência no período"
              }
            />
            <StatCard
              label="Variação no período"
              value={summary.delta ? formatDelta(summary.delta.absolute, unit, decimals) : "—"}
              icon={
                summary.delta && summary.delta.absolute < 0 ? TrendingDown : TrendingUp
              }
              hint={
                summary.delta
                  ? `${formatPercent(summary.delta.percent)} em relação ao início`
                  : "Precisa de ao menos duas medições"
              }
            />
            <StatCard
              label="Desde o primeiro registro"
              value={
                allTimeSummary.delta
                  ? formatDelta(allTimeSummary.delta.absolute, unit, decimals)
                  : "—"
              }
              icon={TrendingUp}
              hint={
                allTimeSummary.initialDate
                  ? `Primeiro registro em ${shortDateLabel(allTimeSummary.initialDate)}`
                  : "Sem histórico ainda"
              }
            />
          </div>

          {/* ── Meta ── */}
          {goal && progress && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  Meta: {GOAL_DIRECTION_LABELS[goal.direction].toLowerCase()} para{" "}
                  {formatMeasurement(goal.targetValue, goal.unit, decimals)}
                  <Badge variant={progress.status === "atingida" ? "default" : "secondary"}>
                    {EFFECTIVE_GOAL_STATUS_LABELS[progress.status]}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {progress.startValue !== null && (
                    <>Partiu de {formatMeasurement(progress.startValue, goal.unit, decimals)}. </>
                  )}
                  {goal.targetDate && (
                    <>
                      Prazo em {longDateLabel(goal.targetDate)}
                      {progress.daysLeft !== null && (
                        <>
                          {" "}
                          ({progress.daysLeft >= 0
                            ? `${progress.daysLeft} dia(s) restantes`
                            : `${Math.abs(progress.daysLeft)} dia(s) atrás`})
                        </>
                      )}
                      .
                    </>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {progress.percent !== null ? (
                  <>
                    <div
                      className="h-2 w-full overflow-hidden rounded-full bg-muted"
                      role="progressbar"
                      aria-valuenow={Math.round(progress.percent)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label="Progresso da meta"
                    >
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          progress.reached ? "bg-emerald-500" : "bg-primary",
                        )}
                        style={{ width: `${progress.percent}%` }}
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      <strong className="text-foreground tabular-nums">
                        {Math.round(progress.percent)}%
                      </strong>{" "}
                      do caminho percorrido
                      {progress.remaining !== null && !progress.reached && (
                        <>
                          {" · "}faltam{" "}
                          <strong className="text-foreground tabular-nums">
                            {formatMeasurement(Math.abs(progress.remaining), goal.unit, decimals)}
                          </strong>
                        </>
                      )}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Registre uma medição a partir de {longDateLabel(goal.startsOn)} para
                    acompanhar o progresso.
                  </p>
                )}

                <div className="flex flex-wrap gap-2">
                  {goal.status === "ativa" ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await setMeasurementGoalStatus({ id: goal.id, status: "pausada" });
                            if (r.ok) { toast.success("Meta pausada."); refresh(); }
                            else toast.error(r.error);
                          })
                        }
                      >
                        Pausar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            const r = await setMeasurementGoalStatus({ id: goal.id, status: "concluida" });
                            if (r.ok) { toast.success("Meta concluída."); refresh(); }
                            else toast.error(r.error);
                          })
                        }
                      >
                        Concluir
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await setMeasurementGoalStatus({ id: goal.id, status: "ativa" });
                          if (r.ok) { toast.success("Meta reativada."); refresh(); }
                          else toast.error(r.error);
                        })
                      }
                    >
                      Reativar
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={pending}
                    onClick={() => {
                      if (!window.confirm("Excluir esta meta?")) return;
                      startTransition(async () => {
                        const r = await deleteMeasurementGoal(goal.id);
                        if (r.ok) { toast.success("Meta excluída."); refresh(); }
                        else toast.error(r.error);
                      });
                    }}
                  >
                    <Trash2 className="size-4" />
                    Excluir meta
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Gráfico + histórico + fotos ── */}
          <Tabs defaultValue="evolucao">
            <TabsList>
              <TabsTrigger value="evolucao">Evolução</TabsTrigger>
              <TabsTrigger value="historico">Histórico</TabsTrigger>
              <TabsTrigger value="comparar">Comparar datas</TabsTrigger>
              <TabsTrigger value="fotos">Fotos</TabsTrigger>
            </TabsList>

            <TabsContent value="evolucao" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {selectedType?.name ?? "Medida"} ao longo do tempo
                  </CardTitle>
                  <CardDescription>
                    {frequency.daysWithRecord} dia(s) com registro em {frequency.totalDays} dia(s)
                    {frequency.longestGapDays !== null && frequency.longestGapDays > 1 && (
                      <> · maior intervalo entre medições: {frequency.longestGapDays} dias</>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <MeasurementChart
                    series={series}
                    unit={unit}
                    decimals={decimals}
                    target={goal?.targetValue ?? null}
                    // A média móvel só aparece quando há medições suficientes. Abaixo disso a
                    // linha some — em vez de suavizar dois pontos e chamar de tendência.
                    showAverage={hasEnoughForMovingAverage(inPeriod.length, MOVING_WINDOW)}
                  />
                  {hasEnoughForMovingAverage(inPeriod.length, MOVING_WINDOW) ? (
                    <p className="text-xs text-muted-foreground">{MOVING_AVERAGE_HINT}</p>
                  ) : (
                    inPeriod.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        A média móvel aparece a partir de {MOVING_WINDOW} medições no período —
                        com menos que isso, ela sugeriria uma tendência que os dados ainda não
                        mostram.
                      </p>
                    )
                  )}
                  <p className="text-xs text-muted-foreground">{CORRELATION_DISCLAIMER}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Leitura em texto</CardTitle>
                  <CardDescription>
                    O mesmo conteúdo do gráfico, para leitura direta.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MeasurementTable
                    series={series}
                    unit={unit}
                    decimals={decimals}
                    caption={`Medições de ${selectedType?.name ?? "medida"} no período`}
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="historico" className="mt-4">
              <Card>
                <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-base">Histórico</CardTitle>
                  {selected.size > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive"
                      onClick={handleBulkDelete}
                      disabled={pending}
                    >
                      <Trash2 className="size-4" />
                      Excluir {selected.size}
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  {inPeriod.length === 0 ? (
                    <EmptyState
                      icon={Ruler}
                      title="Nenhuma medição no período"
                      description="Registre uma medição ou escolha um período maior."
                    />
                  ) : (
                    <ul className="divide-y">
                      {inPeriod.map((item) => (
                        <li key={item.id} className="flex items-center gap-3 py-2.5">
                          <Checkbox
                            checked={selected.has(item.id)}
                            onCheckedChange={(checked) => {
                              const next = new Set(selected);
                              if (checked) next.add(item.id);
                              else next.delete(item.id);
                              setSelected(next);
                            }}
                            aria-label={`Selecionar medição de ${longDateLabel(item.measuredOn)}`}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium tabular-nums">
                              {/* A unidade sai da MEDIÇÃO (congelada), não do tipo atual. */}
                              {formatMeasurement(item.value, item.unit, item.typeDecimals)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {longDateLabel(item.measuredOn)}
                              {item.measuredAt && ` · ${item.measuredAt}`}
                              {item.condition &&
                                ` · ${MEASUREMENT_CONDITION_LABELS[item.condition]}`}
                            </p>
                            {item.note && (
                              <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Editar medição"
                              onClick={() => { setEditing(item); setFormOpen(true); }}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Excluir medição"
                              className="text-destructive hover:text-destructive"
                              onClick={() => handleDelete(item.id)}
                              disabled={pending}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="comparar" className="mt-4">
              <CompareDates
                measurements={typeMeasurements}
                unit={unit}
                decimals={decimals}
                hoje={props.hoje}
              />
            </TabsContent>

            <TabsContent value="fotos" className="mt-4">
              <ProgressPhotos photos={props.photos} hoje={props.hoje} onChanged={refresh} />
            </TabsContent>
          </Tabs>
        </>
      )}

      <MeasurementDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        types={activeTypes}
        defaultTypeId={selectedType?.id ?? ""}
        hoje={props.hoje}
        editing={editing}
        onSaved={refresh}
      />

      <BatchDialog
        open={batchOpen}
        onOpenChange={setBatchOpen}
        types={activeTypes}
        hoje={props.hoje}
        onSaved={refresh}
      />

      <GoalDialog
        open={goalOpen}
        onOpenChange={setGoalOpen}
        types={activeTypes}
        defaultTypeId={selectedType?.id ?? ""}
        hoje={props.hoje}
        editing={editingGoal}
        onSaved={refresh}
      />

      {/* Passa TODOS os tipos (inclusive os desativados): é aqui que se reativa um.
          A contagem por tipo decide se a exclusão precisa perguntar o destino do histórico. */}
      <MeasurementTypesDialog
        open={typesOpen}
        onOpenChange={setTypesOpen}
        types={props.types}
        measurementCountByType={measurementCountByType}
      />
    </div>
  );
}

/* ───────────────────────────── Comparação entre datas ───────────────────────────── */

function CompareDates({
  measurements,
  unit,
  decimals,
  hoje,
}: {
  measurements: MeasurementWithType[];
  unit: string;
  decimals: number;
  hoje: string;
}) {
  const [fromDate, setFromDate] = React.useState(addDaysIso(hoje, -90));
  const [toDate, setToDate] = React.useState(hoje);

  const comparison = React.useMemo(
    () => compareOnDates(measurements, fromDate, toDate),
    [measurements, fromDate, toDate],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Comparar duas datas</CardTitle>
        <CardDescription>
          Usa a medição mais recente até cada data — você não precisa ter medido exatamente
          naqueles dias.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="compare-from">De</Label>
            <Input
              id="compare-from"
              type="date"
              value={fromDate}
              onChange={(event) => event.target.value && setFromDate(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="compare-to">Até</Label>
            <Input
              id="compare-to"
              type="date"
              value={toDate}
              onChange={(event) => event.target.value && setToDate(event.target.value)}
            />
          </div>
        </div>

        {comparison.delta === null ? (
          <p className="text-sm text-muted-foreground">
            {comparison.from === null
              ? "Não havia nenhuma medição registrada até a primeira data."
              : "Não há medição para a segunda data."}
          </p>
        ) : (
          <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-sm text-muted-foreground">
                {shortDateLabel(comparison.from!.date)}:
              </span>
              <span className="font-medium tabular-nums">
                {formatMeasurement(comparison.from!.value, unit, decimals)}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="text-sm text-muted-foreground">
                {shortDateLabel(comparison.to!.date)}:
              </span>
              <span className="font-medium tabular-nums">
                {formatMeasurement(comparison.to!.value, unit, decimals)}
              </span>
            </div>
            <p className="text-lg font-semibold tabular-nums">
              {formatDelta(comparison.delta.absolute, unit, decimals)}{" "}
              <span className="text-sm font-normal text-muted-foreground">
                ({formatPercent(comparison.delta.percent)}
                {comparison.days !== null && ` em ${comparison.days} dias`})
              </span>
            </p>

            {/* Comparar jejum com pós-treino é comparar contextos, não corpos. */}
            {comparison.conditionsDiffer && (
              <p className="text-xs text-amber-700 dark:text-amber-500">
                As duas medições foram feitas em condições diferentes
                {comparison.from?.condition && comparison.to?.condition && (
                  <>
                    {" "}({MEASUREMENT_CONDITION_LABELS[comparison.from.condition].toLowerCase()} e{" "}
                    {MEASUREMENT_CONDITION_LABELS[comparison.to.condition].toLowerCase()})
                  </>
                )}
                . Parte da diferença pode vir daí.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────────────────────── Formulários ───────────────────────────── */

function MeasurementDialog({
  open,
  onOpenChange,
  types,
  defaultTypeId,
  hoje,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: MeasurementType[];
  defaultTypeId: string;
  hoje: string;
  editing: MeasurementWithType | null;
  onSaved: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = {
      id: editing?.id,
      typeId: data.get("typeId"),
      measuredOn: data.get("measuredOn"),
      measuredAt: data.get("measuredAt"),
      value: data.get("value"),
      condition: data.get("condition") === "nenhuma" ? "" : data.get("condition"),
      note: data.get("note"),
    };

    startTransition(async () => {
      const result = await saveMeasurement(input);
      if (result.ok) {
        toast.success(editing ? "Medição atualizada." : "Medição registrada.");
        onOpenChange(false);
        onSaved();
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar medição" : "Registrar medição"}</DialogTitle>
          <DialogDescription>
            Anote a condição da medição: comparar jejum com pós-treino mistura contextos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" key={editing?.id ?? "new"}>
          <div className="space-y-1.5">
            <Label htmlFor="m-type">Medida</Label>
            <Select name="typeId" defaultValue={editing?.typeId ?? defaultTypeId}>
              <SelectTrigger id="m-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name} ({type.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-value">Valor</Label>
              <Input
                id="m-value"
                name="value"
                inputMode="decimal"
                defaultValue={editing ? String(editing.value).replace(".", ",") : ""}
                placeholder="72,4"
                required
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-date">Data</Label>
              <Input
                id="m-date"
                name="measuredOn"
                type="date"
                defaultValue={editing?.measuredOn ?? hoje}
                required
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-time">Horário (opcional)</Label>
              <Input id="m-time" name="measuredAt" type="time" defaultValue={editing?.measuredAt ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-condition">Condição</Label>
              <Select name="condition" defaultValue={editing?.condition ?? "nenhuma"}>
                <SelectTrigger id="m-condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Não informar</SelectItem>
                  {MEASUREMENT_CONDITIONS.map((condition) => (
                    <SelectItem key={condition} value={condition}>
                      {MEASUREMENT_CONDITION_LABELS[condition]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="m-note">Observação (opcional)</Label>
            <Textarea id="m-note" name="note" rows={2} defaultValue={editing?.note ?? ""} maxLength={500} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Sessão de medidas: a pessoa senta com a fita métrica e anota várias de uma vez. */
function BatchDialog({
  open,
  onOpenChange,
  types,
  hoje,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: MeasurementType[];
  hoje: string;
  onSaved: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    // Campo em branco é IGNORADO, não gravado como zero: quem não mediu o pescoço hoje não
    // mediu 0 cm de pescoço.
    const values = types
      .map((type) => ({ typeId: type.id, value: String(data.get(`v-${type.id}`) ?? "").trim() }))
      .filter((item) => item.value !== "");

    if (values.length === 0) {
      setError("Preencha ao menos uma medida.");
      return;
    }

    startTransition(async () => {
      const result = await saveMeasurementBatch({
        measuredOn: data.get("measuredOn"),
        measuredAt: data.get("measuredAt"),
        condition: data.get("condition") === "nenhuma" ? "" : data.get("condition"),
        note: data.get("note"),
        values,
      });
      if (result.ok) {
        toast.success(`${result.data.count} medida(s) registrada(s).`);
        onOpenChange(false);
        onSaved();
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sessão de medidas</DialogTitle>
          <DialogDescription>
            Registre várias medidas do mesmo momento. Deixe em branco o que não mediu — campo
            vazio não vira zero.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="b-date">Data</Label>
              <Input id="b-date" name="measuredOn" type="date" defaultValue={hoje} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-time">Horário</Label>
              <Input id="b-time" name="measuredAt" type="time" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="b-condition">Condição</Label>
              <Select name="condition" defaultValue="nenhuma">
                <SelectTrigger id="b-condition">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhuma">Não informar</SelectItem>
                  {MEASUREMENT_CONDITIONS.map((condition) => (
                    <SelectItem key={condition} value={condition}>
                      {MEASUREMENT_CONDITION_LABELS[condition]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3">
            {MEASUREMENT_CATEGORY_ORDER.filter((category) =>
              types.some((type) => type.category === category),
            ).map((category) => (
              <div key={category} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {MEASUREMENT_CATEGORY_LABELS[category]}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {types
                    .filter((type) => type.category === category)
                    .map((type) => (
                      <div key={type.id} className="flex items-center gap-2">
                        <Label htmlFor={`v-${type.id}`} className="min-w-0 flex-1 truncate text-sm font-normal">
                          {type.name}
                        </Label>
                        <Input
                          id={`v-${type.id}`}
                          name={`v-${type.id}`}
                          inputMode="decimal"
                          className="w-24"
                          placeholder={type.unit}
                          aria-label={`${type.name} em ${type.unit}`}
                        />
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="b-note">Observação (opcional)</Label>
            <Textarea id="b-note" name="note" rows={2} maxLength={500} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Registrar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GoalDialog({
  open,
  onOpenChange,
  types,
  defaultTypeId,
  hoje,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  types: MeasurementType[];
  defaultTypeId: string;
  hoje: string;
  editing: MeasurementGoal | null;
  onSaved: () => void;
}) {
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);

    startTransition(async () => {
      const result = await saveMeasurementGoal({
        id: editing?.id,
        typeId: data.get("typeId"),
        direction: data.get("direction"),
        startValue: data.get("startValue"),
        targetValue: data.get("targetValue"),
        startsOn: data.get("startsOn"),
        targetDate: data.get("targetDate"),
        note: data.get("note"),
      });
      if (result.ok) {
        toast.success(editing ? "Meta atualizada." : "Meta criada.");
        onOpenChange(false);
        onSaved();
      } else {
        setError(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar meta" : "Definir meta"}</DialogTitle>
          <DialogDescription>
            A meta é sua: você escolhe a medida, a direção e o alvo. O sistema não sugere
            valores nem avalia o resultado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4" key={editing?.id ?? "new"}>
          <div className="space-y-1.5">
            <Label htmlFor="g-type">Medida</Label>
            <Select name="typeId" defaultValue={editing?.typeId ?? defaultTypeId}>
              <SelectTrigger id="g-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {types.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name} ({type.unit})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-direction">Quero</Label>
              <Select name="direction" defaultValue={editing?.direction ?? "reduzir"}>
                <SelectTrigger id="g-direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_DIRECTIONS.map((direction) => (
                    <SelectItem key={direction} value={direction}>
                      {GOAL_DIRECTION_LABELS[direction]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-target">Alvo</Label>
              <Input
                id="g-target"
                name="targetValue"
                inputMode="decimal"
                defaultValue={editing ? String(editing.targetValue).replace(".", ",") : ""}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-start-value">Valor de partida (opcional)</Label>
            <Input
              id="g-start-value"
              name="startValue"
              inputMode="decimal"
              defaultValue={
                editing?.startValue !== null && editing?.startValue !== undefined
                  ? String(editing.startValue).replace(".", ",")
                  : ""
              }
              aria-describedby="g-start-hint"
            />
            <p id="g-start-hint" className="text-xs text-muted-foreground">
              Em branco, o sistema usa a primeira medição a partir da data de início.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="g-starts">Início</Label>
              <Input
                id="g-starts"
                name="startsOn"
                type="date"
                defaultValue={editing?.startsOn ?? hoje}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="g-deadline">Prazo (opcional)</Label>
              <Input
                id="g-deadline"
                name="targetDate"
                type="date"
                defaultValue={editing?.targetDate ?? ""}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="g-note">Observação (opcional)</Label>
            <Textarea id="g-note" name="note" rows={2} defaultValue={editing?.note ?? ""} maxLength={500} />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              Salvar meta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}