/**
 * REDESIGN-07-C · D4 — os tons do calendário do mês do diário, num lugar só.
 *
 * A célula e a legenda liam classes diferentes: a legenda tinha 4 amostras para 6 tons, duas
 * delas com outra opacidade (`bg-muted/60` × `bg-muted/30`, `bg-destructive/25` ×
 * `bg-destructive/15`), e faltavam "menos de 60%" e "sem meta". Agora as duas saem de
 * `TONS_DO_MES`, e a faixa sai de `tomDaCelula` com os MESMOS limites de antes — lidos de
 * `cellIntensity`/`goalPercent` (`lib/nutrition/diary-month.ts`), não reescritos.
 *
 * ⛔ Sem julgamento (invariante 25 da Dieta): a faixa diz o percentual da meta, não "bom" ou
 * "ruim". Dia sem meta ou sem registro é neutro — não é dia ruim.
 */
import { cellIntensity, type MonthDayCell } from "@/lib/nutrition/diary-month";

export type TomDoMes = "sem_registro" | "sem_meta" | "abaixo" | "perto" | "na_meta" | "acima";

export const TONS_DO_MES: Record<TomDoMes, { classe: string; rotulo: string }> = {
  sem_registro: { classe: "bg-muted/30 text-muted-foreground", rotulo: "sem registro" },
  sem_meta: { classe: "bg-accent/40", rotulo: "registrado, sem meta no dia" },
  abaixo: { classe: "bg-primary/[0.07]", rotulo: "menos de 60% da meta" },
  perto: { classe: "bg-primary/15", rotulo: "de 60% a 89% da meta" },
  na_meta: { classe: "bg-primary/25", rotulo: "de 90% a 110% da meta" },
  acima: { classe: "bg-destructive/15", rotulo: "acima de 110% da meta" },
};

/** Ordem da legenda: do neutro ao "acima". */
export const ORDEM_DOS_TONS: readonly TomDoMes[] = ["sem_registro", "sem_meta", "abaixo", "perto", "na_meta", "acima"];

/** A faixa da célula — os mesmos limites que `cellTone` usava. */
export function tomDaCelula(cell: MonthDayCell): TomDoMes {
  if (!cell.hasRecord) return "sem_registro";
  const intensidade = cellIntensity(cell);
  if (intensidade === null) return "sem_meta";
  if (cell.goalPercent !== null && cell.goalPercent > 110) return "acima";
  if (intensidade >= 0.9) return "na_meta";
  if (intensidade >= 0.6) return "perto";
  return "abaixo";
}
