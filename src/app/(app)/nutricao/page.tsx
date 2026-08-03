import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Apple,
  CalendarRange,
  Clock,
  Droplets,
  NotebookPen,
  Target,
  UtensilsCrossed,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { hojeISO, timeInSaoPaulo } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { roundForDisplay } from "@/lib/nutrition/calc";
import { shortTime, timeToMinutes, weekDays } from "@/lib/nutrition/calendar";
import { CORE_NUTRIENTS, MACRO_ORDER } from "@/lib/nutrition/constants";
import {
  dayTotals,
  effectiveMealStatus,
  rangeTotals,
  summarizeDay,
  upcomingMeals,
  type NowContext,
} from "@/lib/nutrition/diary";
import {
  ensureMealTypes,
  getDiaryMeals,
  getGoalPeriods,
  getPlannedMeals,
  getWaterForDate,
} from "@/lib/nutrition/diary-queries";
import { adherence, dayTargets, goalPeriodForDate, progressForDay } from "@/lib/nutrition/goals";
import {
  getFoodCategories,
  getFoods,
  getNutrientDefinitions,
  getNutrientValueCount,
  getOfficialSources,
  indexNutrients,
  summarizeCatalog,
} from "@/lib/nutrition/queries";
import { AdherenceBadge, GoalProgressBar } from "@/components/nutrition/goal-progress-bar";
import { TotalQualityBadge } from "@/components/nutrition/nutrient-value";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dieta e Alimentação" };

/**
 * Fase 16-B — Visão geral do módulo.
 *
 * A 16-A entregou aqui só o estado do catálogo, porque não havia consumo para mostrar. Agora a
 * tela responde a pergunta real: **como está o meu dia?**
 *
 * Todo número somado carrega o selo de qualidade quando não é exato — um "1.850 kcal" com um
 * item sem energia analisada é o mínimo conhecido, não o total do dia.
 *
 * "Agora" (data e hora em Brasília) é resolvido no servidor e passado às funções puras: nada
 * chama `Date.now()` dentro da lógica.
 */
export default async function NutricaoPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  await ensureMealTypes(user.id);

  const hoje = hojeISO();
  const now: NowContext = {
    hoje,
    minutosAgora: timeToMinutes(timeInSaoPaulo(new Date())) ?? 0,
  };
  const week = weekDays(hoje);

  const [meals, weekMealsList, planned, periods, water, foods, categories, nutrientValues, sources, nutrientList] =
    await Promise.all([
      getDiaryMeals(hoje, hoje),
      getDiaryMeals(week[0], week[6]),
      getPlannedMeals(hoje, hoje),
      getGoalPeriods(),
      getWaterForDate(hoje),
      getFoods(),
      getFoodCategories(),
      getNutrientValueCount(),
      getOfficialSources(),
      getNutrientDefinitions(),
    ]);

  const nutrients = indexNutrients(nutrientList);
  const catalog = summarizeCatalog(foods, categories, nutrientValues);

  const totals = dayTotals(meals);
  const summary = summarizeDay(meals, now);
  const period = goalPeriodForDate(periods, hoje);
  const targets = dayTargets(period, { date: hoje, dayKind: null });
  const progress = progressForDay(totals, targets);
  const dayAdherence = adherence(progress);

  // Semana: um total por dia, combinados com `mergeTotals` para a qualidade continuar propagando.
  const weekByDay = new Map<string, typeof weekMealsList>();
  for (const meal of weekMealsList) {
    const list = weekByDay.get(meal.diaryDate);
    if (list) list.push(meal);
    else weekByDay.set(meal.diaryDate, [meal]);
  }
  const weekTotal = rangeTotals(week.map((day) => dayTotals(weekByDay.get(day) ?? [])));
  const weekEnergy = weekTotal[CORE_NUTRIENTS.energia];
  const diasComRegistro = week.filter((day) => (weekByDay.get(day) ?? []).length > 0).length;

  // Próximas refeições: as ainda sem desfecho, do diário de hoje. Se o dia ainda não foi
  // trazido do planejamento, mostramos o que está planejado.
  const proximas = upcomingMeals(meals, now, 3);
  const energia = totals[CORE_NUTRIENTS.energia];
  const metaEnergia = targets[CORE_NUTRIENTS.energia]?.amount ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dieta e Alimentação"
        description="Planeje, registre e acompanhe sua alimentação."
      >
        <Button asChild variant="outline">
          <Link href="/nutricao/planejamento">
            <CalendarRange className="size-4" />
            Planejar
          </Link>
        </Button>
        <Button asChild>
          <Link href="/nutricao/diario">
            <NotebookPen className="size-4" />
            Registrar hoje
          </Link>
        </Button>
      </PageHeader>

      {/* ── Indicadores do dia ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="space-y-1.5 p-5">
            <p className="text-sm font-medium text-muted-foreground">Energia hoje</p>
            <p className="flex items-center gap-2 text-2xl font-semibold tabular-nums">
              {energia ? roundForDisplay(energia.amount, 0).toLocaleString("pt-BR") : "—"}
              <span className="text-sm font-normal text-muted-foreground">kcal</span>
              {energia && <TotalQualityBadge quality={energia.quality} />}
            </p>
            <p className="text-xs text-muted-foreground">
              {metaEnergia
                ? `Meta: ${roundForDisplay(metaEnergia, 0).toLocaleString("pt-BR")} kcal`
                : "Sem meta definida"}
            </p>
          </CardContent>
        </Card>

        <StatCard
          label="Refeições de hoje"
          value={`${summary.consumidas}/${summary.total}`}
          icon={UtensilsCrossed}
          hint={
            summary.total === 0
              ? "Nada registrado ainda"
              : summary.pendentes > 0
                ? `${summary.pendentes} pendente${summary.pendentes > 1 ? "s" : ""}${summary.atrasadas > 0 ? ` · ${summary.atrasadas} atrasada${summary.atrasadas > 1 ? "s" : ""}` : ""}`
                : "Tudo em dia"
          }
        />

        <Card>
          <CardContent className="space-y-1.5 p-5">
            <p className="text-sm font-medium text-muted-foreground">Aderência do dia</p>
            <AdherenceBadge percent={dayAdherence.percent} quality={dayAdherence.quality} />
            <p className="text-xs text-muted-foreground">
              {dayAdherence.counted > 0 ? (
                `${dayAdherence.counted} nutriente${dayAdherence.counted > 1 ? "s" : ""} com meta`
              ) : (
                <Link href="/nutricao/metas" className="text-primary underline-offset-4 hover:underline">
                  Definir metas
                </Link>
              )}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-1.5 p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Água</p>
              <Droplets className="size-4 text-primary" />
            </div>
            {water ? (
              <>
                <p className="text-2xl font-semibold tabular-nums">
                  {water.value.toLocaleString("pt-BR")}
                  <span className="ms-1 text-sm font-normal text-muted-foreground">
                    / {water.target.toLocaleString("pt-BR")} {water.unit}
                  </span>
                </p>
                <Link
                  href="/habitos"
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  Registrar em Hábitos
                </Link>
              </>
            ) : (
              <>
                <p className="text-sm">Sem hábito de água.</p>
                <Link
                  href="/habitos"
                  className="text-xs text-primary underline-offset-4 hover:underline"
                >
                  Criar em Hábitos
                </Link>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Macros contra a meta ── */}
      {Object.keys(targets).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Metas de hoje</CardTitle>
            <CardDescription>
              {period?.name ? `Período: ${period.name}. ` : ""}
              A meta usada é a que está vigente hoje — relatórios de dias anteriores continuam
              respondendo pela meta que valia neles.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {MACRO_ORDER.filter((code) => progress[code]).map((code) => (
              <GoalProgressBar
                key={code}
                progress={progress[code]}
                definition={nutrients[code]}
                label={nutrients[code]?.shortName ?? nutrients[code]?.name ?? code}
              />
            ))}
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* ── Próximas refeições ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="size-4 text-primary" />
              Próximas refeições
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {proximas.length > 0 ? (
              proximas.map((meal) => {
                const state = effectiveMealStatus(meal, now);
                return (
                  <Link
                    key={meal.id}
                    href="/nutricao/diario"
                    className="flex items-center justify-between gap-3 rounded-lg border p-3 transition-colors hover:bg-accent/50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {meal.mealTypeIcon ? `${meal.mealTypeIcon} ` : ""}
                        {meal.title || meal.mealTypeName}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {meal.plannedTime ? `Previsto ${shortTime(meal.plannedTime)}` : "Sem horário"}
                      </span>
                    </span>
                    {state.isLate && (
                      <Badge variant="outline" className="shrink-0 text-[10px] text-amber-600 dark:text-amber-400">
                        Atrasada
                      </Badge>
                    )}
                  </Link>
                );
              })
            ) : planned.length > 0 ? (
              <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                <p>
                  Há {planned.length} refeição{planned.length > 1 ? "ões" : ""} planejada
                  {planned.length > 1 ? "s" : ""} para hoje, ainda não trazida
                  {planned.length > 1 ? "s" : ""} para o diário.
                </p>
                <Button asChild size="sm" variant="outline" className="mt-2">
                  <Link href="/nutricao/diario">Abrir o diário</Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nada pendente para hoje.{" "}
                <Link
                  href="/nutricao/planejamento"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  Planejar refeições
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Semana ── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="size-4 text-primary" />
              Esta semana
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="flex items-center gap-2 text-2xl font-semibold tabular-nums">
              {weekEnergy ? roundForDisplay(weekEnergy.amount, 0).toLocaleString("pt-BR") : "—"}
              <span className="text-sm font-normal text-muted-foreground">kcal</span>
              {weekEnergy && <TotalQualityBadge quality={weekEnergy.quality} />}
            </p>
            <p className="text-xs text-muted-foreground">
              {diasComRegistro} de 7 dias com registro
              {weekEnergy && diasComRegistro > 0 && (
                <>
                  {" · média de "}
                  <strong className="text-foreground tabular-nums">
                    {roundForDisplay(weekEnergy.amount / diasComRegistro, 0).toLocaleString("pt-BR")} kcal
                  </strong>{" "}
                  nos dias registrados
                </>
              )}
            </p>
            <Button asChild size="sm" variant="outline">
              <Link href="/nutricao/diario?visao=semana">Ver a semana</Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Procedência da base (a licença da TACO exige a citação visível) ── */}
      {sources.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex flex-wrap items-center gap-2 text-base">
              <Apple className="size-4 text-primary" />
              Base nutricional
              <Badge variant="outline" className="text-[10px]">
                {catalog.total.toLocaleString("pt-BR")} alimentos
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {catalog.nutrientValues.toLocaleString("pt-BR")} valores
              </Badge>
            </CardTitle>
            <CardDescription>
              De onde vêm os números. Nenhum valor foi estimado, arredondado para zero ou gerado
              automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {sources.map((source) => (
              <div key={source.id} className="space-y-1">
                <p className="text-sm font-medium">
                  {source.name}
                  {source.edition ? ` — ${source.edition}` : ""}
                </p>
                {source.citation && (
                  <p className="text-xs text-muted-foreground">{source.citation}</p>
                )}
              </div>
            ))}
            <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">
              Um nutriente ausente significa que a fonte <strong>não o analisou</strong> — não que
              ele seja zero. Todo total que dependa de um valor ausente aparece marcado como
              parcial, aqui e em todas as telas.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
