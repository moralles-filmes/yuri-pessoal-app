"use client";

/**
 * Fase 17-E — Treinos · Calendário de consistência (mapa de calor).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ SEM LINGUAGEM DE CULPA. ESTA É A REGRA CENTRAL DA TELA.                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O calendário mostra o que aconteceu: dia treinado, treino iniciado e não finalizado,
 * descanso planejado, dia que estava planejado e não teve treino, e dia livre. **Nenhum deles
 * é pintado como erro.** Não há vermelho de alarme, não há "você falhou", não há contagem de
 * "faltas". Um dia livre é um dia livre — férias, trabalho, cansaço e vida acontecem.
 *
 * A classificação inteira sai de `consistencyCalendar` (`dashboards.ts`, puro e testado), que
 * por sua vez usa `metrics.ts` para o volume do dia. A tela só desenha.
 *
 * O mapa nunca é a única leitura: cada dia tem `title` e `aria-label` descritivos, e abaixo há
 * o resumo em texto com a contagem por estado.
 */
import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { WEEKDAY_LABELS, WEEKDAY_SHORT_LABELS } from "@/lib/training/constants";
import {
  CONSISTENCY_STATE_LABELS,
  consistencyCalendar,
  summarizeConsistency,
  type ConsistencyDay,
  type ConsistencyState,
  type PlannedDay,
} from "@/lib/training/dashboards";
import type { MetricOptions, MetricSession } from "@/lib/training/metrics";
import { addDaysIso, monthGridIso, startOfMonthIso } from "@/lib/training/schedule";
import { textoDoDiaDaConsistencia } from "./rotulos-da-consistencia";

/**
 * Tons por estado.
 *
 * Treinado é a cor de destaque do sistema; parcial é a mesma, mais fraca; descanso é violeta;
 * planejado-sem-treino é um contorno tracejado — visível, mas sem peso visual de erro; livre é
 * o fundo neutro do card.
 *
 * ⛔ Descanso era `sky`. Enquanto a marca foi dourada os dois conviviam; com a marca azul,
 * `bg-primary/45` (parcial) e `bg-sky-500/20` (descanso) viram dois azuis pálidos lado a lado
 * numa grade lida de relance. Estado que só se distingue por opacidade não se distingue.
 */
const STATE_STYLE: Record<ConsistencyState, string> = {
  treinado: "bg-primary text-primary-foreground",
  parcial: "bg-primary/45 text-foreground",
  descanso: "bg-violet-500/25 text-foreground",
  planejado_sem_execucao: "border border-dashed border-muted-foreground/50 bg-transparent",
  livre: "bg-muted/50",
  // Contorno fino (D4): sem ele, o dia que ainda vai chegar era um buraco igual ao fundo do
  // card — não dava para ver onde a grade terminava.
  futuro: "bg-transparent text-muted-foreground/60 ring-1 ring-inset ring-border",
};

/** O anel de hoje: o mesmo na célula e na legenda. */
const HOJE_STYLE = "ring-2 ring-primary ring-offset-1 ring-offset-background";

const ORDER: ConsistencyState[] = [
  "treinado",
  "parcial",
  "descanso",
  "planejado_sem_execucao",
  "livre",
];

export function ConsistencyCalendar({
  sessions,
  planned,
  hoje,
  months = 6,
  options,
  weekStartsOn = 1,
}: {
  sessions: MetricSession[];
  planned: PlannedDay[];
  hoje: string;
  /** Quantos meses mostrar, terminando no mês de `hoje`. */
  months?: number;
  options?: MetricOptions;
  weekStartsOn?: number;
}) {
  // A janela começa no primeiro dia do mês mais antigo exibido.
  const firstMonth = React.useMemo(() => {
    let cursor = startOfMonthIso(hoje);
    for (let i = 1; i < months; i += 1) cursor = startOfMonthIso(addDaysIso(cursor, -1));
    return cursor;
  }, [hoje, months]);

  const days = React.useMemo(
    () =>
      consistencyCalendar(
        sessions,
        planned,
        { from: firstMonth, to: hoje },
        hoje,
        options ?? {},
      ),
    [sessions, planned, firstMonth, hoje, options],
  );

  const byDate = React.useMemo(
    () => new Map(days.map((day) => [day.date, day])),
    [days],
  );
  const summary = summarizeConsistency(days);

  // Um bloco por mês, do mais antigo para o mais recente.
  const monthKeys = React.useMemo(() => {
    const keys: string[] = [];
    let cursor = firstMonth;
    for (let i = 0; i < months; i += 1) {
      keys.push(cursor);
      cursor = startOfMonthIso(addDaysIso(cursor, 32));
    }
    return keys;
  }, [firstMonth, months]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Consistência</CardTitle>
        <p className="text-xs text-muted-foreground">
          Os últimos {months} meses, dia a dia. É um registro do que aconteceu — dia livre não é
          falta, e não há cobrança aqui.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4 overflow-x-auto pb-1">
          {monthKeys.map((monthStart) => (
            <MonthBlock
              key={monthStart}
              monthStart={monthStart}
              byDate={byDate}
              weekStartsOn={weekStartsOn}
              hoje={hoje}
            />
          ))}
        </div>

        {/* Legenda — o mapa nunca é a única leitura do dado. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          {ORDER.map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <span
                className={cn("inline-block size-3 rounded-[3px]", STATE_STYLE[state])}
                aria-hidden="true"
              />
              {CONSISTENCY_STATE_LABELS[state]}
              <span className="tabular-nums">({summary[state]})</span>
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className={cn("inline-block size-3 rounded-[3px]", STATE_STYLE.futuro)} aria-hidden="true" />
            {CONSISTENCY_STATE_LABELS.futuro}
          </li>
          <li className="flex items-center gap-1.5">
            <span className={cn("inline-block size-3 rounded-[3px] bg-muted/50", HOJE_STYLE)} aria-hidden="true" />
            Hoje
          </li>
        </ul>
      </CardContent>
    </Card>
  );
}

const MONTH_SHORT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function MonthBlock({
  monthStart,
  byDate,
  weekStartsOn,
  hoje,
}: {
  monthStart: string;
  byDate: Map<string, ConsistencyDay>;
  weekStartsOn: number;
  hoje: string;
}) {
  const grid = monthGridIso(monthStart, weekStartsOn);
  const monthPrefix = monthStart.slice(0, 7);
  const label = `${MONTH_SHORT[Number(monthStart.slice(5, 7)) - 1]}/${monthStart.slice(2, 4)}`;

  // Cabeçalho de dias da semana na ordem configurada (domingo pode ser o primeiro).
  const weekdays = Array.from({ length: 7 }, (_, i) => (weekStartsOn + i) % 7);

  return (
    <div className="shrink-0">
      <p className="mb-1 text-xs font-medium text-muted-foreground">{label}</p>
      <table className="border-separate border-spacing-[2px]">
        <caption className="sr-only">Consistência de treinos em {label}</caption>
        <thead>
          <tr>
            {weekdays.map((weekday) => (
              <th
                key={weekday}
                scope="col"
                className="text-[9px] font-normal text-muted-foreground"
              >
                {/* Uma letra só é ambígua (S S, Q Q): o nome inteiro vai ao leitor de tela. */}
                <span aria-hidden="true">{WEEKDAY_SHORT_LABELS[weekday].slice(0, 1)}</span>
                <span className="sr-only">{WEEKDAY_LABELS[weekday]}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.map((week) => (
            <tr key={week[0]}>
              {week.map((date) => {
                // Dia de outro mês na grade: espaço em branco, sem estado.
                if (!date.startsWith(monthPrefix)) {
                  return <td key={date} className="size-4" aria-hidden="true" />;
                }
                const day = byDate.get(date);
                const state: ConsistencyState = day?.state ?? "futuro";
                const description = textoDoDiaDaConsistencia(date, day, hoje);

                return (
                  <td key={date} className="p-0">
                    <span
                      className={cn(
                        "block size-4 rounded-[3px]",
                        STATE_STYLE[state],
                        date === hoje && HOJE_STYLE,
                      )}
                      title={description}
                      aria-label={description}
                      aria-current={date === hoje ? "date" : undefined}
                      role="img"
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
