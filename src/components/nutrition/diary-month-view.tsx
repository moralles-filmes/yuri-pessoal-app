"use client";

/**
 * Fase 16-E — Dieta e Alimentação · Calendário do mês no diário.
 *
 * Fecha a pendência herdada da 16-B: `?visao=mes` existia na URL mas caía na semana.
 *
 * ══ DUAS COISAS QUE A TELA É OBRIGADA A FAZER ══
 *
 * 1. DIA SEM REGISTRO NÃO PODE PARECER DIA DE ZERO CALORIA. A célula sem registro fica em
 *    cinza, com um traço — nunca "0 kcal". Toda a decisão está em `buildMonthView`
 *    (`src/lib/nutrition/diary-month.ts`, puro e testado); aqui só se pinta.
 *
 * 2. O CALENDÁRIO NÃO É A ÚNICA FORMA DE LER O DADO (regra 6 da subfase). Cada célula tem
 *    `aria-label` com a leitura textual completa, e a tabela abaixo repete tudo em texto para
 *    quem não enxerga o mapa de cor.
 */
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { roundForDisplay, TOTAL_QUALITY_HINTS } from "@/lib/nutrition/calc";
import { monthLabel, shortDateLabel } from "@/lib/nutrition/calendar";
import { CORE_NUTRIENTS, WEEKDAY_SHORT_LABELS } from "@/lib/nutrition/constants";
import type { MonthView } from "@/lib/nutrition/diary-month";
import { ORDEM_DOS_TONS, TONS_DO_MES, tomDaCelula } from "./tons-do-mes";
import { textoDaCelulaDoMes } from "./rotulos-do-mes";

const kcal = (value: number | null): string =>
  value === null ? "—" : `${roundForDisplay(value, 0).toLocaleString("pt-BR")}`;

// A cor da célula e a legenda saem da MESMA fonte (`tons-do-mes.ts`, REDESIGN-07-C · D4): a
// escala vai do "menos de 60%" ao "acima de 110%" em tokens do design system, e funciona em
// dark e light porque usa `--primary` com opacidade. Sem meta ou sem registro → neutro.

export function DiaryMonthView({
  view,
  hoje,
  onPickDay,
  weekStartDay = 1,
}: {
  view: MonthView;
  /** "Hoje" do servidor (Brasília), injetado — nunca a data do aparelho. */
  hoje: string;
  onPickDay: (day: string) => void;
  /** 0 = domingo … 6 = sábado. O app usa segunda (1), como o resto do módulo. */
  weekStartDay?: number;
}) {
  const { summary } = view;
  const energia = summary.totals[CORE_NUTRIENTS.energia];

  // Cabeçalho de dias da semana, girado conforme o primeiro dia configurado.
  const weekdayHeaders = React.useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => WEEKDAY_SHORT_LABELS[(weekStartDay + i) % 7]),
    [weekStartDay],
  );

  const registeredDays = view.daily.filter((day) => day.hasRecord);

  return (
    <div className="space-y-4">
      {/* ── Resumo do mês ── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base capitalize">{monthLabel(view.monthStart)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          <p className="text-sm text-muted-foreground">
            Total do mês:{" "}
            <strong className="text-foreground tabular-nums">
              {energia ? `${kcal(energia.amount)} kcal` : "—"}
            </strong>
            {" · "}
            <strong className="text-foreground tabular-nums">
              {summary.daysWithRecord}
            </strong>{" "}
            de {summary.totalDays} dias com registro
          </p>
          {summary.daysWithRecord > 0 && energia && (
            <p className="text-sm text-muted-foreground">
              Média nos dias registrados:{" "}
              <strong className="text-foreground tabular-nums">
                {kcal(summary.averagePerRecordedDay[CORE_NUTRIENTS.energia]?.amount ?? null)} kcal
              </strong>
              {summary.adherence.percent !== null && (
                <>
                  {" · "}aderência média{" "}
                  <strong className="text-foreground tabular-nums">
                    {Math.round(summary.adherence.percent)}%
                  </strong>
                </>
              )}
            </p>
          )}
          {/*
            A honestidade que o módulo exige: dias não registrados ficam DE FORA da média, e a
            tela diz isso. Sem esta frase, "média de 1.800 kcal" num mês com 6 registros
            pareceria a média do mês inteiro.
          */}
          {summary.daysWithRecord > 0 && summary.daysWithRecord < summary.totalDays && (
            <p className="text-xs text-muted-foreground">
              A média considera apenas os dias em que você registrou algo. Os demais não entram
              como zero — eles são dias sem registro, não dias sem consumo.
            </p>
          )}
          {energia?.quality === "parcial" && (
            <p className="text-xs text-muted-foreground">{TOTAL_QUALITY_HINTS.parcial}</p>
          )}
        </CardContent>
      </Card>

      {/* ── Calendário ── */}
      <Card>
        <CardContent className="p-2 sm:p-4">
          {/* Grupo com nome, não `role="grid"`: um grid exige navegação por setas que esta
              grade não tem. Cada dia diz tudo no próprio nome; o cabeçalho é só visual. */}
          <div
            className="grid grid-cols-7 gap-1"
            role="group"
            aria-label={`Dias de ${monthLabel(view.monthStart)}`}
          >
            {weekdayHeaders.map((label) => (
              <div
                key={label}
                aria-hidden="true"
                className="pb-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
              >
                {label}
              </div>
            ))}

            {view.weeks.flat().map((cell) => (
              <button
                key={cell.date}
                type="button"
                onClick={() => onPickDay(cell.date)}
                // A leitura completa vai para o leitor de tela: a cor nunca é a única
                // portadora da informação.
                aria-label={textoDaCelulaDoMes(cell, hoje)}
                aria-current={cell.date === hoje ? "date" : undefined}
                className={cn(
                  "flex min-h-16 flex-col rounded-md border p-1.5 text-left transition-colors sm:min-h-20",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  "hover:border-primary/40",
                  TONS_DO_MES[tomDaCelula(cell)].classe,
                  !cell.inMonth && "opacity-40",
                  cell.date === hoje && "border-primary ring-1 ring-primary/30",
                )}
              >
                <span
                  className={cn(
                    "text-xs font-medium tabular-nums",
                    cell.date === hoje && "text-primary",
                  )}
                >
                  {cell.date.slice(8)}
                </span>

                {/* ⛔ Sem registro: traço, jamais "0 kcal". */}
                <span className="mt-auto text-[11px] tabular-nums text-muted-foreground">
                  {cell.hasRecord ? `${kcal(cell.energyKcal)}` : "—"}
                </span>

                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  {cell.hasRecord && <span>{cell.entries} it.</span>}
                  {cell.pending > 0 && (
                    <span className="text-amber-600 dark:text-amber-500" title="Refeição pendente">
                      ●
                    </span>
                  )}
                  {!cell.hasRecord && cell.planned > 0 && <span>{cell.planned} plan.</span>}
                </span>
              </button>
            ))}
          </div>

          {/* Legenda: as amostras são as classes da célula, da mesma fonte. */}
          <ul
            aria-label="Legenda"
            className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground"
          >
            {ORDEM_DOS_TONS.map((tom) => (
              <li key={tom} className="flex items-center gap-1">
                <span
                  aria-hidden="true"
                  className={cn("size-3 rounded-sm border", TONS_DO_MES[tom].classe)}
                />
                {TONS_DO_MES[tom].rotulo}
              </li>
            ))}
            <li className="flex items-center gap-1">
              <span aria-hidden="true" className="text-amber-600 dark:text-amber-500">
                ●
              </span>
              refeição pendente
            </li>
            <li className="flex items-center gap-1">
              <span aria-hidden="true" className="size-3 rounded-sm border border-primary ring-1 ring-primary/30" />
              hoje
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* ── Leitura textual: o calendário NUNCA é a única forma de ler o dado ── */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Dias com registro</CardTitle>
        </CardHeader>
        <CardContent>
          {registeredDays.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum registro neste mês. Escolha um dia no calendário para começar.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Consumo por dia registrado em {monthLabel(view.monthStart)}
                </caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="py-1.5 pe-3 font-medium">Dia</th>
                    <th scope="col" className="py-1.5 pe-3 text-right font-medium">Energia</th>
                    <th scope="col" className="py-1.5 pe-3 text-right font-medium">Meta</th>
                    <th scope="col" className="py-1.5 text-right font-medium">Itens</th>
                  </tr>
                </thead>
                <tbody>
                  {registeredDays.map((day) => {
                    const total = day.totals[CORE_NUTRIENTS.energia];
                    const target = day.targets[CORE_NUTRIENTS.energia]?.amount ?? null;
                    return (
                      <tr key={day.date} className="border-b last:border-0">
                        <td className="py-1.5 pe-3">
                          <button
                            type="button"
                            onClick={() => onPickDay(day.date)}
                            className="underline-offset-2 hover:underline"
                          >
                            {shortDateLabel(day.date)}
                          </button>
                        </td>
                        <td className="py-1.5 pe-3 text-right tabular-nums">
                          {total ? `${kcal(total.amount)} kcal` : "—"}
                          {total?.quality === "parcial" && (
                            <span
                              className="ms-1 text-xs text-muted-foreground"
                              title={TOTAL_QUALITY_HINTS.parcial}
                            >
                              *
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pe-3 text-right tabular-nums text-muted-foreground">
                          {target !== null ? `${kcal(target)} kcal` : "—"}
                        </td>
                        <td className="py-1.5 text-right tabular-nums">{day.entries}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] text-muted-foreground">
                * total parcial — algum item não tem todos os nutrientes analisados pela fonte.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}