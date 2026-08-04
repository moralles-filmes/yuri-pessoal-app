import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hojeISO } from "@/lib/format";
import { getCurrentUser } from "@/lib/supabase/server";
import { addDaysIso, isDateIso } from "@/lib/nutrition/calendar";
import { getReportPackage } from "@/lib/nutrition/report-queries";
import {
  adherenceRanking,
  buildDailyReports,
  diaryFrequency,
  marketSpendReport,
  nutrientReport,
  planAdherenceReport,
  substitutionRanking,
  summarizePeriod,
  topFoods,
  topMeals,
} from "@/lib/nutrition/reports";
import { ReportsClient } from "./reports-client";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Relatórios · Dieta" };

/** Período padrão: os últimos 30 dias, incluindo hoje. */
const DEFAULT_DAYS = 30;

/**
 * Fase 16-E — Relatórios do módulo Dieta.
 *
 * Server Component. Toda a agregação acontece AQUI, com as funções puras de
 * `src/lib/nutrition/reports.ts` — o cliente recebe resultado pronto e não recalcula nada.
 *
 * ⛔ O consumo do período vem do SNAPSHOT do diário (via `getReportPackage` → `getDiaryMeals`),
 * nunca do catálogo atual: editar um alimento hoje não pode mudar o relatório do mês passado.
 * E a meta de cada dia é a que VALIA NELE — `buildDailyReports` resolve dia a dia.
 */
export default async function RelatoriosPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const hoje = hojeISO();

  // Datas puras, validadas. Intervalo invertido é corrigido em vez de estourar a tela.
  const to = isDateIso(params.ate) ? params.ate : hoje;
  const fromParam = isDateIso(params.de) ? params.de : addDaysIso(to, -(DEFAULT_DAYS - 1));
  const from = fromParam > to ? addDaysIso(to, -(DEFAULT_DAYS - 1)) : fromParam;

  const pkg = await getReportPackage(from, to);

  const daily = buildDailyReports(pkg.meals, pkg.periods, from, to, pkg.dayKinds);
  const summary = summarizePeriod(daily, from, to);

  return (
    <ReportsClient
      hoje={hoje}
      from={from}
      to={to}
      daily={daily}
      summary={summary}
      nutrients={nutrientReport(daily, summary, pkg.definitions)}
      definitions={pkg.definitions}
      topFoods={topFoods(pkg.meals)}
      topMeals={topMeals(pkg.meals)}
      substitutions={substitutionRanking(pkg.substitutions)}
      market={marketSpendReport(pkg.shoppingLists)}
      planAdherence={planAdherenceReport(pkg.planned, pkg.meals, pkg.plannedContext)}
      frequency={diaryFrequency(daily)}
      measurements={pkg.measurements}
      measurementTypes={pkg.measurementTypes}
      ranking={adherenceRanking(daily, 3)}
    />
  );
}