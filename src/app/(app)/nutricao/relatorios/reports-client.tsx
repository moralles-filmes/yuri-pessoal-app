"use client";

/**
 * Fase 16-E — Dieta e Alimentação · Relatórios.
 *
 * ══ O QUE ESTA TELA GARANTE ══
 * 1. Todo número vem de `src/lib/nutrition/reports.ts` (puro e testado), que soma o SNAPSHOT
 *    do diário e resolve a meta VIGENTE EM CADA DIA. Nada é recalculado aqui.
 * 2. A QUALIDADE VIAJA COM O NÚMERO: total parcial é rotulado como parcial, sempre.
 * 3. NENHUMA AFIRMAÇÃO DE CAUSALIDADE entre comida e corpo. As séries aparecem lado a lado,
 *    com o aviso escrito na tela.
 * 4. Gasto com mercado é INFORMAÇÃO, não lançamento: virar transação financeira é decisão
 *    explícita do usuário, e esta tela não cria nada no financeiro.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  CalendarRange,
  Download,
  FileSpreadsheet,
  Percent,
  Repeat,
  ShoppingCart,
  UtensilsCrossed,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ReportBarChart } from "@/components/reports/report-bar-chart";
import { MeasurementChart } from "@/components/body/measurement-chart";
import { TotalQualityBadge } from "@/components/nutrition/nutrient-value";
import { formatCurrency } from "@/lib/format";
import { roundForDisplay, TOTAL_QUALITY_HINTS } from "@/lib/nutrition/calc";
import { addDaysIso, shortDateLabel } from "@/lib/nutrition/calendar";
import { CORE_NUTRIENTS, NUTRIENT_GROUP_LABELS, type NutrientGroup } from "@/lib/nutrition/constants";
import { buildSeries } from "@/lib/body/measurements";
import {
  MISSING_PRICE_HINT,
  PARTIAL_PERIOD_HINT,
  REPORT_CORRELATION_DISCLAIMER,
  type DailyReport,
  type DiaryFrequency,
  type FoodRanking,
  type MarketSpendReport,
  type MealRanking,
  type NutrientRow,
  type PeriodSummary,
  type PlanAdherenceReport,
  type SubstitutionRanking,
} from "@/lib/nutrition/reports";
import { toCsv } from "@/lib/reports/csv";
import { downloadCsv } from "@/lib/reports/download";
import { downloadXlsx } from "@/lib/reports/xlsx";
import {
  DAILY_REPORT_HEADERS,
  MEASUREMENT_HEADERS,
  NUTRIENT_REPORT_HEADERS,
  SUBSTITUTION_HEADERS,
  TOP_FOODS_HEADERS,
  dailyReportRows,
  measurementRows,
  nutrientReportRows,
  periodTitle,
  substitutionRows,
  topFoodsRows,
} from "@/lib/nutrition/csv-export";
import type { NutrientDefinition } from "@/lib/nutrition/types";
import type { MeasurementType, MeasurementWithType } from "@/lib/body/types";

const MACRO_CODES = {
  energia: CORE_NUTRIENTS.energia,
  proteina: CORE_NUTRIENTS.proteina,
  carboidrato: CORE_NUTRIENTS.carboidrato,
  lipidios: CORE_NUTRIENTS.lipidios,
  fibra: CORE_NUTRIENTS.fibra,
};

/** Grupos que a aba de micronutrientes mostra. */
const MICRO_GROUPS: NutrientGroup[] = ["mineral", "vitamina", "aminoacido", "outro"];

export type ReportsClientProps = {
  hoje: string;
  from: string;
  to: string;
  daily: DailyReport[];
  summary: PeriodSummary;
  nutrients: NutrientRow[];
  definitions: Record<string, NutrientDefinition>;
  topFoods: FoodRanking[];
  topMeals: MealRanking[];
  substitutions: SubstitutionRanking[];
  market: MarketSpendReport;
  planAdherence: PlanAdherenceReport;
  frequency: DiaryFrequency;
  measurements: MeasurementWithType[];
  measurementTypes: MeasurementType[];
  /** Dias de maior e menor aderência — só dias que tinham meta E registro. */
  ranking: { best: DailyReport[]; worst: DailyReport[] };
};

export function ReportsClient(props: ReportsClientProps) {
  const router = useRouter();
  const params = useSearchParams();

  const [from, setFrom] = React.useState(props.from);
  const [to, setTo] = React.useState(props.to);

  function applyPeriod(nextFrom: string, nextTo: string) {
    const search = new URLSearchParams(params.toString());
    search.set("de", nextFrom);
    search.set("ate", nextTo);
    router.push(`/nutricao/relatorios?${search.toString()}`);
  }

  const energia = props.summary.totals[MACRO_CODES.energia];
  const energiaMedia = props.summary.averagePerRecordedDay[MACRO_CODES.energia];

  const kcal = (value: number | null | undefined): string =>
    value === null || value === undefined
      ? "—"
      : `${roundForDisplay(value, 0).toLocaleString("pt-BR")} kcal`;

  /* ── Exportações ── */

  function exportDaily() {
    downloadCsv(
      `consumo-diario-${props.from}-a-${props.to}.csv`,
      toCsv(dailyReportRows(props.daily, MACRO_CODES), DAILY_REPORT_HEADERS),
    );
  }

  function exportNutrients() {
    downloadCsv(
      `nutrientes-${props.from}-a-${props.to}.csv`,
      toCsv(nutrientReportRows(props.nutrients, props.definitions), NUTRIENT_REPORT_HEADERS),
    );
  }

  /**
   * 16-F — o relatório INTEIRO numa planilha só, uma aba por seção.
   *
   * O CSV continua existindo por seção (é o padrão do projeto: texto, abre em qualquer
   * lugar). O XLSX resolve o caso de quem quer tudo de uma vez, sem cinco downloads.
   * A biblioteca é carregada só aqui dentro, por import dinâmico.
   */
  const [exportando, setExportando] = React.useState(false);

  async function exportWorkbook() {
    setExportando(true);
    try {
      await downloadXlsx(`dieta-${props.from}-a-${props.to}.xlsx`, [
        {
          name: "Consumo diário",
          headers: DAILY_REPORT_HEADERS,
          rows: dailyReportRows(props.daily, MACRO_CODES),
        },
        {
          name: "Nutrientes",
          headers: NUTRIENT_REPORT_HEADERS,
          rows: nutrientReportRows(props.nutrients, props.definitions),
        },
        {
          name: "Alimentos mais consumidos",
          headers: TOP_FOODS_HEADERS,
          rows: topFoodsRows(props.topFoods),
        },
        {
          name: "Substituições",
          headers: SUBSTITUTION_HEADERS,
          rows: substitutionRows(props.substitutions),
        },
        {
          name: "Medidas",
          headers: MEASUREMENT_HEADERS,
          rows: measurementRows(props.measurements),
        },
      ]);
      toast.success("Planilha gerada.");
    } catch {
      toast.error("Não foi possível gerar a planilha.");
    } finally {
      setExportando(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios"
        description={`Consumo, aderência e evolução — ${periodTitle(props.from, props.to)}.`}
      >
        <Button variant="outline" onClick={exportDaily} disabled={props.daily.length === 0}>
          <Download className="size-4" />
          CSV do período
        </Button>
        <Button
          variant="outline"
          onClick={() => void exportWorkbook()}
          disabled={exportando || props.daily.length === 0}
        >
          <FileSpreadsheet className="size-4" />
          {exportando ? "Gerando…" : "Planilha (.xlsx)"}
        </Button>
      </PageHeader>

      {/* ── Período ── */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="report-from">De</Label>
          <Input
            id="report-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-44"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="report-to">Até</Label>
          <Input
            id="report-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-44"
          />
        </div>
        <Button onClick={() => applyPeriod(from, to)} disabled={!from || !to || from > to}>
          Aplicar
        </Button>
        <div className="ms-auto flex flex-wrap gap-2">
          {[
            { label: "7 dias", days: 7 },
            { label: "30 dias", days: 30 },
            { label: "90 dias", days: 90 },
          ].map((preset) => (
            <Button
              key={preset.days}
              variant="outline"
              size="sm"
              onClick={() => {
                const start = addDaysIso(props.hoje, -(preset.days - 1));
                setFrom(start);
                setTo(props.hoje);
                applyPeriod(start, props.hoje);
              }}
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>

      {/* ── Indicadores do período ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Energia no período"
          value={energia ? kcal(energia.amount) : "—"}
          icon={UtensilsCrossed}
          hint={`${props.summary.daysWithRecord} de ${props.summary.totalDays} dias com registro`}
        />
        <StatCard
          label="Média por dia registrado"
          value={energiaMedia ? kcal(energiaMedia.amount) : "—"}
          icon={BarChart3}
          hint="Dias sem registro não entram como zero"
        />
        <StatCard
          label="Aderência média"
          value={
            props.summary.adherence.percent !== null
              ? `${Math.round(props.summary.adherence.percent)}%`
              : "—"
          }
          icon={Percent}
          hint={
            props.summary.adherence.counted > 0
              ? `${props.summary.adherence.counted} dia(s) com meta e registro`
              : "Nenhum dia com meta definida e registro"
          }
        />
        <StatCard
          label="Constância"
          value={
            props.frequency.percent !== null ? `${Math.round(props.frequency.percent)}%` : "—"
          }
          icon={CalendarRange}
          hint={`Maior sequência: ${props.frequency.longestStreak} dia(s)`}
        />
      </div>

      {/* A qualidade viaja com o número, e a tela é obrigada a mostrar. */}
      {props.summary.quality === "parcial" && (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
          <TotalQualityBadge quality="parcial" />
          <span>{PARTIAL_PERIOD_HINT}</span>
        </p>
      )}

      <Tabs defaultValue="consumo">
        <TabsList className="flex-wrap">
          <TabsTrigger value="consumo">Consumo</TabsTrigger>
          <TabsTrigger value="micro">Micronutrientes</TabsTrigger>
          <TabsTrigger value="alimentos">Alimentos</TabsTrigger>
          <TabsTrigger value="substituicoes">Substituições</TabsTrigger>
          <TabsTrigger value="mercado">Mercado</TabsTrigger>
          <TabsTrigger value="evolucao">Evolução</TabsTrigger>
        </TabsList>

        {/* ═══ Consumo ═══ */}
        <TabsContent value="consumo" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                Energia por dia
                {energia && <TotalQualityBadge quality={energia.quality} />}
              </CardTitle>
              <CardDescription>
                Dias sem registro aparecem vazios — não como zero.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReportBarChart
                data={props.daily
                  .filter((day) => day.hasRecord)
                  .map((day) => ({
                    label: shortDateLabel(day.date),
                    value: Math.round(day.totals[MACRO_CODES.energia]?.amount ?? 0),
                  }))}
                name="Energia"
                formatValue={(v) => `${v.toLocaleString("pt-BR")} kcal`}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Macronutrientes no período</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Totais e médias de macronutrientes no período
                  </caption>
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-1.5 pe-3 font-medium">Nutriente</th>
                      <th scope="col" className="py-1.5 pe-3 text-right font-medium">Total</th>
                      <th scope="col" className="py-1.5 pe-3 text-right font-medium">Média/dia</th>
                      <th scope="col" className="py-1.5 text-right font-medium">Qualidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.values(MACRO_CODES).map((code) => {
                      const total = props.summary.totals[code];
                      const average = props.summary.averagePerRecordedDay[code];
                      const def = props.definitions[code];
                      if (!def) return null;
                      return (
                        <tr key={code} className="border-b last:border-0">
                          <td className="py-1.5 pe-3">{def.name}</td>
                          <td className="py-1.5 pe-3 text-right tabular-nums">
                            {total
                              ? `${roundForDisplay(total.amount, def.precision).toLocaleString("pt-BR")} ${def.unit}`
                              : "—"}
                          </td>
                          <td className="py-1.5 pe-3 text-right tabular-nums">
                            {average
                              ? `${roundForDisplay(average.amount, def.precision).toLocaleString("pt-BR")} ${def.unit}`
                              : "—"}
                          </td>
                          <td className="py-1.5 text-right">
                            {total && <TotalQualityBadge quality={total.quality} />}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/*
            Dias de maior e menor aderência. Só entram dias que tinham META e REGISTRO — um dia
            sem registro apareceria como "pior dia" por esquecimento, não por consumo.
          */}
          {(props.ranking.best.length > 0 || props.ranking.worst.length > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Dias de maior e menor aderência</CardTitle>
                <CardDescription>
                  Considera apenas os dias em que havia meta definida e houve registro.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {[
                  { title: "Mais próximos da meta", days: props.ranking.best },
                  { title: "Mais distantes da meta", days: props.ranking.worst },
                ].map((column) => (
                  <div key={column.title} className="space-y-1.5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {column.title}
                    </p>
                    <ul className="space-y-1">
                      {column.days.map((day) => (
                        <li key={day.date} className="flex items-center justify-between text-sm">
                          <span>{shortDateLabel(day.date)}</span>
                          <span className="tabular-nums text-muted-foreground">
                            {day.adherence.percent !== null
                              ? `${Math.round(day.adherence.percent)}%`
                              : "—"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Planejado × consumido</CardTitle>
              <CardDescription>
                Quanto do que estava planejado virou registro no período.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {props.planAdherence.percent === null ? (
                <p className="text-sm text-muted-foreground">
                  Não havia refeições planejadas neste período.
                </p>
              ) : (
                <div className="space-y-2">
                  <p className="text-2xl font-semibold tabular-nums">
                    {Math.round(props.planAdherence.percent)}%
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {props.planAdherence.followed} de {props.planAdherence.plannedItems} itens
                    planejados foram registrados
                    {props.planAdherence.substituted > 0 &&
                      ` · ${props.planAdherence.substituted} substituído(s)`}
                    {props.planAdherence.notRegistered > 0 &&
                      ` · ${props.planAdherence.notRegistered} sem registro`}
                    {props.planAdherence.extras > 0 &&
                      ` · ${props.planAdherence.extras} item(ns) fora do plano`}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Micronutrientes ═══ */}
        <TabsContent value="micro" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Micronutrientes no período</CardTitle>
                <CardDescription>
                  A coluna &ldquo;dias incompletos&rdquo; diz em quantos dias algum item não
                  tinha esse nutriente analisado pela fonte — nesses casos o total é um piso,
                  não o valor real.
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={exportNutrients}>
                <Download className="size-4" />
                CSV
              </Button>
            </CardHeader>
            <CardContent>
              <NutrientTable
                rows={props.nutrients.filter((row) => MICRO_GROUPS.includes(row.group))}
                definitions={props.definitions}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Alimentos e refeições ═══ */}
        <TabsContent value="alimentos" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Mais consumidos</CardTitle>
                <CardDescription>
                  Agrupado pelo nome registrado na época — o histórico sobrevive à exclusão do
                  alimento no catálogo.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    `alimentos-${props.from}-a-${props.to}.csv`,
                    toCsv(topFoodsRows(props.topFoods), TOP_FOODS_HEADERS),
                  )
                }
                disabled={props.topFoods.length === 0}
              >
                <Download className="size-4" />
                CSV
              </Button>
            </CardHeader>
            <CardContent>
              {props.topFoods.length === 0 ? (
                <EmptyState
                  icon={UtensilsCrossed}
                  title="Nenhum registro no período"
                  description="Registre refeições no diário para ver o que mais aparece."
                />
              ) : (
                <ul className="divide-y">
                  {props.topFoods.map((food) => (
                    <li key={`${food.kind}-${food.label}`} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{food.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {food.times}× em {food.days} dia(s)
                          {food.withoutEnergy > 0 &&
                            ` · ${food.withoutEnergy} sem energia disponível`}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {kcal(food.energyKcal)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Refeições mais registradas</CardTitle>
            </CardHeader>
            <CardContent>
              {props.topMeals.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhuma refeição registrada.</p>
              ) : (
                <ul className="divide-y">
                  {props.topMeals.map((meal) => (
                    <li key={meal.mealTypeId} className="flex items-center gap-3 py-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{meal.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {meal.times} registro(s) · {meal.entries} item(ns)
                        </p>
                      </div>
                      <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                        {kcal(meal.energyKcal)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Substituições ═══ */}
        <TabsContent value="substituicoes" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-base">Substituições mais realizadas</CardTitle>
                <CardDescription>
                  Contagem do que você trocou. Os rótulos e as diferenças ficaram congelados na
                  hora da troca — o sistema não afirma que os itens são equivalentes.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadCsv(
                    `substituicoes-${props.from}-a-${props.to}.csv`,
                    toCsv(substitutionRows(props.substitutions), SUBSTITUTION_HEADERS),
                  )
                }
                disabled={props.substitutions.length === 0}
              >
                <Download className="size-4" />
                CSV
              </Button>
            </CardHeader>
            <CardContent>
              {props.substitutions.length === 0 ? (
                <EmptyState
                  icon={Repeat}
                  title="Nenhuma substituição no período"
                  description="Quando você troca um item por uma alternativa, a troca fica registrada e aparece aqui."
                />
              ) : (
                <ul className="divide-y">
                  {props.substitutions.map((item) => (
                    <li
                      key={`${item.originalLabel}-${item.replacementLabel}`}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm">
                          <span className="text-muted-foreground line-through">
                            {item.originalLabel}
                          </span>{" "}
                          → <span className="font-medium">{item.replacementLabel}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.times}× · última em {shortDateLabel(item.lastAppliedOn)}
                          {item.withoutDelta > 0 &&
                            ` · ${item.withoutDelta} sem diferença registrada`}
                        </p>
                      </div>
                      {item.deltaEnergyKcal !== null && (
                        <Badge variant="secondary" className="tabular-nums">
                          {item.deltaEnergyKcal > 0 ? "+" : ""}
                          {Math.round(item.deltaEnergyKcal)} kcal no total
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Mercado ═══ */}
        <TabsContent value="mercado" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Gasto com mercado</CardTitle>
              <CardDescription>
                Somado das listas de compras do período, a partir do preço que você registrou
                item a item.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {props.market.lists === 0 ? (
                <EmptyState
                  icon={ShoppingCart}
                  title="Nenhuma lista no período"
                  description="Gere uma lista de compras a partir do planejamento para acompanhar o gasto."
                />
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <StatCard
                      label="Pago (registrado)"
                      value={props.market.hasAnyPrice ? formatCurrency(props.market.realCents / 100) : "—"}
                      icon={ShoppingCart}
                      hint={`${props.market.lists} lista(s) no período`}
                    />
                    <StatCard
                      label="Estimado"
                      value={
                        props.market.estimatedCents > 0
                          ? formatCurrency(props.market.estimatedCents / 100)
                          : "—"
                      }
                      hint="Preços previstos antes da compra"
                    />
                    <StatCard
                      label="Itens sem preço"
                      value={String(props.market.itemsWithoutPrice)}
                      hint={`de ${props.market.items} item(ns)`}
                    />
                  </div>

                  {/* Ausência de preço não é zero — e o total precisa dizer isso. */}
                  {props.market.itemsWithoutPrice > 0 && (
                    <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
                      {MISSING_PRICE_HINT}
                    </p>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Gasto por lista de compras</caption>
                      <thead>
                        <tr className="border-b text-left text-xs text-muted-foreground">
                          <th scope="col" className="py-1.5 pe-3 font-medium">Lista</th>
                          <th scope="col" className="py-1.5 pe-3 text-right font-medium">Pago</th>
                          <th scope="col" className="py-1.5 text-right font-medium">Sem preço</th>
                        </tr>
                      </thead>
                      <tbody>
                        {props.market.byList.map((list) => (
                          <tr key={list.id} className="border-b last:border-0">
                            <td className="py-1.5 pe-3">
                              {list.name}
                              {list.from && list.to && (
                                <span className="block text-xs text-muted-foreground">
                                  {shortDateLabel(list.from)} a {shortDateLabel(list.to)}
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 pe-3 text-right tabular-nums">
                              {list.realCents > 0 ? formatCurrency(list.realCents / 100) : "—"}
                            </td>
                            <td className="py-1.5 text-right tabular-nums text-muted-foreground">
                              {list.itemsWithoutPrice}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/*
                    Regra 7 do prompt da subfase: virar lançamento financeiro é DECISÃO do
                    usuário. A tela informa o caminho e não cria nada sozinha.
                  */}
                  <p className="text-xs text-muted-foreground">
                    Este valor é apenas um resumo do que você anotou nas listas. Ele{" "}
                    <strong>não</strong> vira lançamento no financeiro automaticamente — se
                    quiser registrar a compra como despesa, faça isso em{" "}
                    <a href="/transacoes" className="underline underline-offset-2">
                      Transações
                    </a>
                    .
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ═══ Evolução (consumo × corpo) ═══ */}
        <TabsContent value="evolucao" className="mt-4 space-y-4">
          <EvolutionPanel
            measurements={props.measurements}
            types={props.measurementTypes}
            from={props.from}
            to={props.to}
            daily={props.daily}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────────────── Tabela de nutrientes ───────────────────────────── */

function NutrientTable({
  rows,
  definitions,
}: {
  rows: NutrientRow[];
  definitions: Record<string, NutrientDefinition>;
}) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nenhum micronutriente registrado no período. Eles aparecem conforme os alimentos
        consumidos tenham esses valores publicados pela fonte.
      </p>
    );
  }

  const byGroup = new Map<NutrientGroup, NutrientRow[]>();
  for (const row of rows) {
    const list = byGroup.get(row.group);
    if (list) list.push(row);
    else byGroup.set(row.group, [row]);
  }

  return (
    <div className="space-y-5">
      {[...byGroup.entries()].map(([group, groupRows]) => (
        <div key={group} className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {NUTRIENT_GROUP_LABELS[group]}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">{NUTRIENT_GROUP_LABELS[group]} no período</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th scope="col" className="py-1.5 pe-3 font-medium">Nutriente</th>
                  <th scope="col" className="py-1.5 pe-3 text-right font-medium">Média/dia</th>
                  <th scope="col" className="py-1.5 pe-3 text-right font-medium">Meta</th>
                  <th scope="col" className="py-1.5 pe-3 text-right font-medium">Dias incompletos</th>
                  <th scope="col" className="py-1.5 text-right font-medium">Qualidade</th>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((row) => {
                  const precision = definitions[row.code]?.precision ?? 1;
                  return (
                    <tr key={row.code} className="border-b last:border-0">
                      <td className="py-1.5 pe-3">{row.name}</td>
                      <td className="py-1.5 pe-3 text-right tabular-nums">
                        {roundForDisplay(row.averagePerDay, precision).toLocaleString("pt-BR")}{" "}
                        {row.unit}
                      </td>
                      <td className="py-1.5 pe-3 text-right tabular-nums text-muted-foreground">
                        {/* Sem meta ≠ 0% da meta. */}
                        {row.target !== null
                          ? `${roundForDisplay(row.target, precision).toLocaleString("pt-BR")} ${row.unit}${
                              row.percent !== null ? ` (${Math.round(row.percent)}%)` : ""
                            }`
                          : "—"}
                      </td>
                      <td className="py-1.5 pe-3 text-right tabular-nums text-muted-foreground">
                        {row.daysIncomplete > 0 ? row.daysIncomplete : "—"}
                      </td>
                      <td className="py-1.5 text-right">
                        <TotalQualityBadge quality={row.quality} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{TOTAL_QUALITY_HINTS.parcial}</p>
    </div>
  );
}

/* ───────────────────────────── Consumo × corpo ───────────────────────────── */

/**
 * As duas séries LADO A LADO — e nada além disso.
 *
 * Nenhum texto aqui relaciona uma coisa à outra, nenhum cálculo de correlação é feito, e o
 * aviso de que correlação não é causa fica visível junto dos gráficos (regra 2 da subfase).
 */
function EvolutionPanel({
  measurements,
  types,
  from,
  to,
  daily,
}: {
  measurements: MeasurementWithType[];
  types: MeasurementType[];
  from: string;
  to: string;
  daily: DailyReport[];
}) {
  const withData = React.useMemo(
    () => types.filter((type) => measurements.some((m) => m.typeId === type.id)),
    [types, measurements],
  );
  const [typeId, setTypeId] = React.useState<string>("");
  const selected = withData.find((type) => type.id === (typeId || withData[0]?.id)) ?? null;

  const series = React.useMemo(
    () =>
      selected
        ? buildSeries(
            measurements.filter((m) => m.typeId === selected.id),
            from,
            to,
          )
        : [],
    [measurements, selected, from, to],
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Consumo no período</CardTitle>
        </CardHeader>
        <CardContent>
          <ReportBarChart
            data={daily
              .filter((day) => day.hasRecord)
              .map((day) => ({
                label: shortDateLabel(day.date),
                value: Math.round(day.totals[CORE_NUTRIENTS.energia]?.amount ?? 0),
              }))}
            name="Energia"
            formatValue={(v) => `${v.toLocaleString("pt-BR")} kcal`}
            height={200}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Evolução corporal no mesmo período</CardTitle>
            <CardDescription>
              Dias sem medição ficam vazios: a linha é interrompida, não ligada por cima.
            </CardDescription>
          </div>
          {withData.length > 1 && (
            <Select value={selected?.id ?? ""} onValueChange={setTypeId}>
              <SelectTrigger className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {withData.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </CardHeader>
        <CardContent>
          {selected ? (
            <MeasurementChart
              series={series}
              unit={selected.unit}
              decimals={selected.decimals}
              height={200}
            />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhuma medida corporal registrada neste período.{" "}
              <a href="/nutricao/medidas" className="underline underline-offset-2">
                Registrar medidas
              </a>
            </p>
          )}
        </CardContent>
      </Card>

      <p className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
        {REPORT_CORRELATION_DISCLAIMER}
      </p>
    </>
  );
}