"use client";

/**
 * Fase 17-E — Treinos · Relatórios por período (cliente).
 *
 * ═══════════ TRÊS COISAS QUE ESTA TELA CUMPRE ═══════════
 *
 * 1. **Todo número vem de `metrics.ts`**, via `reports.ts`. A tela filtra e desenha.
 * 2. **A regra de contagem aparece junto do número**, e um total parcial diz o porquê.
 * 3. **O gráfico nunca é a única leitura**: `PeriodBarChart` já traz tabela equivalente, e o
 *    CSV leva os mesmos números com o contexto no cabeçalho.
 *
 * A comparação com o período anterior mostra "sem base" quando não havia nada antes — em vez
 * de "+100%" ou de um `NaN` disfarçado de zero.
 */
import * as React from "react";
import { BarChart3, Download, Info, Printer } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { Field } from "@/components/training/field";
import { MetricsSummary } from "@/components/training/metrics-summary";
import {
  DistributionBars,
  PeriodBarChart,
  type ChartPoint,
} from "@/components/training/training-charts";
import { downloadCsv } from "@/lib/reports/download";
import {
  DASHBOARD_PERIOD_LABELS,
  DASHBOARD_PERIODS,
  comparePeriods,
  dashboardRange,
  deltaLabel,
  previousRange,
  sessionsInRange,
  type DashboardPeriod,
  type MetricDelta,
} from "@/lib/training/dashboards";
import { aggregateSessions, formatVolumeKg, type MetricOptions } from "@/lib/training/metrics";
import { durationLabel, shortDateLabelIso } from "@/lib/training/history";
import type { HistoryItem } from "@/lib/training/history";
import type { PlannedDay } from "@/lib/training/dashboards";
import type { PersonalRecord } from "@/lib/training/history-queries";
import {
  REPORT_GRANULARITIES,
  REPORT_GRANULARITY_LABELS,
  buildPeriodReport,
  reportCsvSections,
  sectionsToCsv,
  type ReportGranularity,
} from "@/lib/training/reports";
import { formatRecordValue, recordTypeLabel } from "@/lib/training/records";
import { formatMeasurement } from "@/lib/body/measurements";
import type { MeasurementType, MeasurementWithType } from "@/lib/body/types";

const CUSTOM = "personalizado";

export function ReportsClient({
  history,
  planned,
  records,
  measurements,
  measurementTypes,
  hoje,
  preferences,
}: {
  history: HistoryItem[];
  planned: PlannedDay[];
  records: PersonalRecord[];
  measurements: MeasurementWithType[];
  measurementTypes: MeasurementType[];
  hoje: string;
  preferences: MetricOptions & { weekStartsOn: number };
}) {
  const options: MetricOptions = {
    includeWarmup: preferences.includeWarmup,
    unilateralRule: preferences.unilateralRule,
  };

  const [period, setPeriod] = React.useState<DashboardPeriod | typeof CUSTOM>("mes");
  const [granularity, setGranularity] = React.useState<ReportGranularity>("semana");
  const [customFrom, setCustomFrom] = React.useState(hoje.slice(0, 8) + "01");
  const [customTo, setCustomTo] = React.useState(hoje);

  const range =
    period === CUSTOM
      ? { from: customFrom, to: customTo }
      : dashboardRange(period, hoje, preferences.weekStartsOn);

  const report = buildPeriodReport(history, planned, range, granularity, hoje, {
    ...options,
    weekStartsOn: preferences.weekStartsOn,
  });

  // Comparação com o período anterior — só faz sentido nas janelas de calendário.
  const previous =
    period === CUSTOM
      ? null
      : aggregateSessions(
          sessionsInRange(history, previousRange(period, range)),
          options,
        );
  const comparison = previous ? comparePeriods(report.totals, previous) : null;

  const inRange = sessionsInRange(history, range);
  const recordsInRange = records.filter(
    (record) => record.achievedOn >= range.from && record.achievedOn <= range.to,
  );
  const measurementsInRange = measurements.filter(
    (measurement) => measurement.measuredOn >= range.from && measurement.measuredOn <= range.to,
  );

  const volumePoints: ChartPoint[] = report.buckets.map((bucket) => ({
    label: bucket.label,
    value: bucket.metrics.totals.volumeKg,
    display: formatVolumeKg(bucket.metrics.totals.volumeKg),
    isPartial: bucket.metrics.totals.quality === "parcial",
  }));

  const sessionPoints: ChartPoint[] = report.buckets.map((bucket) => ({
    label: bucket.label,
    value: bucket.metrics.sessionCount,
    display: `${bucket.metrics.sessionCount} treino(s)`,
  }));

  function exportCsv() {
    const csv = sectionsToCsv(
      reportCsvSections(report, {
        sessions: inRange,
        records: recordsInRange,
        measurements: measurementsInRange,
        options,
      }),
    );
    downloadCsv(`treinos-${range.from}-a-${range.to}.csv`, csv);
    toast.success("Relatório exportado. As fotos de evolução não vão no arquivo.");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description="Volume, frequência, aderência e evolução por período — os mesmos números do histórico."
      >
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer className="size-4" />
          Imprimir
        </Button>
        <Button size="sm" onClick={exportCsv} disabled={report.totals.sessionCount === 0}>
          <Download className="size-4" />
          Exportar CSV
        </Button>
      </PageHeader>

      {/* ── Filtros ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Período">
          <Select
            value={period}
            onValueChange={(value) => setPeriod(value as DashboardPeriod | typeof CUSTOM)}
          >
            <SelectTrigger aria-label="Período do relatório">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DASHBOARD_PERIODS.map((item) => (
                <SelectItem key={item} value={item}>
                  {DASHBOARD_PERIOD_LABELS[item]}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {period === CUSTOM ? (
          <>
            <Field label="De">
              <Input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </Field>
            <Field label="Até">
              <Input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </Field>
          </>
        ) : (
          <Field label="Janela">
            <div className="flex h-9 items-center rounded-md border border-input px-3 text-sm text-muted-foreground">
              {shortDateLabelIso(range.from)} a {shortDateLabelIso(range.to)}
            </div>
          </Field>
        )}

        <Field label="Agrupar">
          <Select
            value={granularity}
            onValueChange={(value) => setGranularity(value as ReportGranularity)}
          >
            <SelectTrigger aria-label="Agrupamento do relatório">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REPORT_GRANULARITIES.map((item) => (
                <SelectItem key={item} value={item}>
                  {REPORT_GRANULARITY_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {report.totals.sessionCount === 0 ? (
        <EmptyState
          icon={BarChart3}
          title="Nenhum treino registrado neste período"
          description="Escolha outro período ou registre um treino. O relatório mostra o que existe — não preenche o vazio com zeros."
        />
      ) : (
        <>
          <MetricsSummary
            totals={report.totals.totals}
            options={options}
            sessionCount={report.totals.sessionCount}
            totalSeconds={report.totals.totalSeconds}
          />

          {/* ── Comparação com o período anterior ── */}
          {comparison && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  Comparado com {DASHBOARD_PERIOD_LABELS[period as DashboardPeriod].toLowerCase()}{" "}
                  anterior
                </CardTitle>
                {comparison.partial && (
                  <p className="text-xs text-muted-foreground">
                    Um dos períodos tem total parcial — a comparação existe, mas com ressalva.
                  </p>
                )}
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <DeltaTile label="Treinos" delta={comparison.sessions} format={(v) => String(v)} />
                <DeltaTile label="Volume" delta={comparison.volumeKg} format={formatVolumeKg} />
                <DeltaTile label="Séries" delta={comparison.sets} format={(v) => String(v)} />
                <DeltaTile
                  label="Tempo ativo"
                  delta={comparison.activeSeconds}
                  format={(v) => durationLabel(v)}
                />
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Aderência"
              value={
                report.adherence.percent === null
                  ? "—"
                  : `${report.adherence.percent.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`
              }
              icon={Info}
              hint={
                report.adherence.percent === null
                  ? "nada planejado no período"
                  : `${report.adherence.done} de ${report.adherence.planned} dias planejados`
              }
            />
            <StatCard
              label="Média por treino"
              value={
                report.averageSessionSeconds === null
                  ? "—"
                  : durationLabel(report.averageSessionSeconds)
              }
              icon={Info}
            />
            <StatCard
              label="Volume médio"
              value={report.averageVolumeKg === null ? "—" : formatVolumeKg(report.averageVolumeKg)}
              icon={Info}
              hint="por treino"
            />
            <StatCard
              label="Treinos por semana"
              value={
                report.sessionsPerWeek === null
                  ? "—"
                  : report.sessionsPerWeek.toLocaleString("pt-BR", { maximumFractionDigits: 1 })
              }
              icon={Info}
              hint={`${report.daysTrained} dia(s) treinados`}
            />
          </div>

          <Tabs defaultValue="periodo">
            <TabsList>
              <TabsTrigger value="periodo">Por período</TabsTrigger>
              <TabsTrigger value="grupos">Grupos musculares</TabsTrigger>
              <TabsTrigger value="exercicios">Exercícios</TabsTrigger>
              <TabsTrigger value="corpo">Corpo e recordes</TabsTrigger>
            </TabsList>

            <TabsContent value="periodo" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Volume</CardTitle>
                </CardHeader>
                <CardContent>
                  <PeriodBarChart points={volumePoints} valueLabel="Volume" />
                  <p className="mt-2 text-xs text-muted-foreground">
                    Regra de contagem: {report.ruleLabel}.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Treinos</CardTitle>
                </CardHeader>
                <CardContent>
                  <PeriodBarChart points={sessionPoints} valueLabel="Treinos" />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="grupos" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Séries por grupo muscular</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Este é o <strong>seu registro de treinamento</strong> no período, pelo grupo
                    principal de cada exercício. O sistema não diz quantas séries por grupo você
                    deveria fazer.
                  </p>
                </CardHeader>
                <CardContent>
                  <DistributionBars
                    items={report.muscleGroups.map((share) => ({
                      label: share.group,
                      value: share.sets,
                      display: `${share.sets} série(s) · ${share.percent.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`,
                    }))}
                  />
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[420px] text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr className="border-b border-border">
                          <th scope="col" className="py-2 text-left font-medium">Grupo</th>
                          <th scope="col" className="py-2 text-right font-medium">Séries</th>
                          <th scope="col" className="py-2 text-right font-medium">Volume</th>
                          <th scope="col" className="py-2 text-right font-medium">Último treino</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.muscleGroups.map((share) => (
                          <tr key={share.group} className="border-b border-border/60">
                            <td className="py-1.5">{share.group}</td>
                            <td className="py-1.5 text-right tabular-nums">{share.sets}</td>
                            <td className="py-1.5 text-right tabular-nums">
                              {share.volumeKg > 0 ? formatVolumeKg(share.volumeKg) : "—"}
                            </td>
                            <td className="py-1.5 text-right text-muted-foreground">
                              {share.lastTrainedOn ? shortDateLabelIso(share.lastTrainedOn) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="exercicios" className="mt-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Exercícios mais treinados</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    O nome vem congelado da sessão: um exercício excluído do catálogo continua
                    aparecendo aqui, com o nome que tinha.
                  </p>
                </CardHeader>
                <CardContent className="overflow-x-auto">
                  <table className="w-full min-w-[420px] text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="border-b border-border">
                        <th scope="col" className="py-2 text-left font-medium">Exercício</th>
                        <th scope="col" className="py-2 text-right font-medium">Séries</th>
                        <th scope="col" className="py-2 text-right font-medium">Volume</th>
                        <th scope="col" className="py-2 text-right font-medium">Sessões</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.exercises.map((share) => (
                        <tr
                          key={share.exerciseId ?? share.exerciseName}
                          className="border-b border-border/60"
                        >
                          <td className="py-1.5">{share.exerciseName}</td>
                          <td className="py-1.5 text-right tabular-nums">{share.sets}</td>
                          <td className="py-1.5 text-right tabular-nums">
                            {share.volumeKg > 0 ? formatVolumeKg(share.volumeKg) : "—"}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">{share.sessions}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="corpo" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Medidas corporais no período</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Lidas do módulo central de medidas — as mesmas que aparecem na Dieta. Treino e
                    corpo aparecem lado a lado: <strong>correlação não é causa</strong>, e nada aqui
                    afirma que uma coisa causou a outra.
                  </p>
                </CardHeader>
                <CardContent>
                  {measurementsInRange.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma medição registrada neste período.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[380px] text-sm">
                        <thead className="text-xs text-muted-foreground">
                          <tr className="border-b border-border">
                            <th scope="col" className="py-2 text-left font-medium">Data</th>
                            <th scope="col" className="py-2 text-left font-medium">Medida</th>
                            <th scope="col" className="py-2 text-right font-medium">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {measurementsInRange.slice(0, 40).map((measurement) => (
                            <tr key={measurement.id} className="border-b border-border/60">
                              <td className="py-1.5">{shortDateLabelIso(measurement.measuredOn)}</td>
                              <td className="py-1.5">{measurement.typeName}</td>
                              <td className="py-1.5 text-right tabular-nums">
                                {formatMeasurement(
                                  measurement.value,
                                  measurement.unit,
                                  measurement.typeDecimals,
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {measurementTypes.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Nenhum tipo de medida cadastrado ainda.
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Recordes alcançados no período</CardTitle>
                </CardHeader>
                <CardContent>
                  {recordsInRange.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum recorde novo neste período.
                    </p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {recordsInRange.map((record) => (
                        <li key={record.id} className="flex flex-wrap items-baseline gap-2">
                          <span className="font-medium">{record.exerciseName ?? "Geral"}</span>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {recordTypeLabel(record.recordType, record.referenceWeightKg)}
                          </Badge>
                          <span className="tabular-nums">
                            {formatRecordValue(record.value, record.unit)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {shortDateLabelIso(record.achievedOn)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

/** Um número com a variação. "sem base" quando o período anterior não tinha o que comparar. */
function DeltaTile({
  label,
  delta,
  format,
}: {
  label: string;
  delta: MetricDelta;
  format: (value: number) => string;
}) {
  const tone =
    delta.percent === null
      ? "text-muted-foreground"
      : delta.percent > 0
        ? "text-emerald-600 dark:text-emerald-400"
        : delta.percent < 0
          ? "text-amber-600 dark:text-amber-400"
          : "text-muted-foreground";

  return (
    <div className="rounded-xl border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{format(delta.current)}</p>
      <p className={`text-xs tabular-nums ${tone}`}>
        {deltaLabel(delta)} · antes {format(delta.previous)}
      </p>
    </div>
  );
}
