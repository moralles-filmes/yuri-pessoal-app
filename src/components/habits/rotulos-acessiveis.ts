/**
 * REDESIGN-07-B · D2 — o texto que diz o estado de um dia SEM depender da cor.
 *
 * O heatmap e a semana da água pintavam o estado (fração concluída, meta batida, hoje) só pela
 * cor, mais um `title` que leitor de tela e toque não garantem. Estas funções montam o texto
 * que vai num `sr-only` ao lado de cada célula. Puras, sem `Date`: a data é `yyyy-MM-dd` e é
 * formatada como TEXTO (`formatDate` não converte data pura), e "hoje" é o `todayIso` do
 * servidor, injetado — nunca "a última célula".
 *
 * Só apresentação: nenhuma conta é refeita aqui. `done`/`scheduled` e "meta batida" (`done`)
 * chegam prontos de `lib/habits/queries.ts`.
 */
import { formatDate } from "@/lib/format";
import { formatAmount, formatHabitValue, type HabitUnit } from "@/lib/habits/constants";

export function ehHoje(date: string, hoje: string): boolean {
  return date === hoje;
}

function quando(date: string, hoje: string): string {
  return `${formatDate(date)}${ehHoje(date, hoje) ? ", hoje" : ""}`;
}

/** Célula do heatmap. Sem hábito agendado não é 0%: é "sem hábitos agendados". */
export function textoDaCelula(cell: { date: string; done: number; scheduled: number }, hoje: string): string {
  if (cell.scheduled === 0) return `${quando(cell.date, hoje)} — sem hábitos agendados`;
  const verbo = cell.scheduled === 1 ? "concluído" : "concluídos";
  return `${quando(cell.date, hoje)} — ${cell.done} de ${cell.scheduled} ${verbo}`;
}

/** Dia da semana da água: valor de meta, na unidade do hábito, e se a meta foi batida. */
export function textoDoDiaDaAgua(
  dia: { date: string; value: number; done: boolean },
  hoje: string,
  meta: number,
  unidade: HabitUnit,
): string {
  const batida = dia.done ? ", meta batida" : "";
  return `${quando(dia.date, hoje)} — ${formatAmount(dia.value)} de ${formatHabitValue(meta, unidade)}${batida}`;
}

/** O que segue o número da chama ("6" + " dias seguidos"), lido pelo leitor de tela. */
export function textoDaSequencia(count: number): string {
  return count === 1 ? " dia seguido" : " dias seguidos";
}
