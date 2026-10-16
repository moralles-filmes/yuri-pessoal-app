/**
 * REDESIGN-07-C · D4 — o texto de cada dia do calendário do mês do diário.
 *
 * `cellLabel` (`lib/nutrition/diary-month.ts`, intocado) já diz energia, meta e itens. Faltava
 * dizer a data por extenso, que é HOJE (com `hoje` do servidor, injetado), que o dia é de
 * fora do mês (as bordas da grade), as refeições pendentes, e que um dia PASSADO com
 * planejamento não teve registro — `cellLabel` dizia só "Sem registro".
 */
import { longDateLabel } from "@/lib/nutrition/calendar";
import { cellLabel, type MonthDayCell } from "@/lib/nutrition/diary-month";

export function textoDaCelulaDoMes(cell: MonthDayCell, hoje: string): string {
  const partes = [longDateLabel(cell.date)];
  if (cell.date === hoje) partes.push("hoje");
  if (!cell.inMonth) partes.push("fora do mês");
  partes.push(cellLabel(cell));
  if (!cell.hasRecord && !cell.isFuture && cell.planned > 0) {
    partes.push(cell.planned === 1 ? "1 refeição planejada, sem registro" : `${cell.planned} refeições planejadas, sem registro`);
  }
  if (cell.pending > 0) {
    partes.push(cell.pending === 1 ? "1 refeição pendente" : `${cell.pending} refeições pendentes`);
  }
  return partes.join(" · ");
}
