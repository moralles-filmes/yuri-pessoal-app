/**
 * REDESIGN-07-C · D4 — o dia do calendário de consistência, em palavras (puro, testado).
 *
 * Mora separado de `rotulos-do-calendario.ts` porque depende de `dashboards`/`metrics`, que só
 * o calendário de consistência carrega — junto, essas dependências entravam em toda rota que
 * usasse qualquer rótulo de calendário.
 *
 * ⛔ Sem linguagem de cobrança (invariante 22 de Treinos): dia livre é dia livre.
 */
import { CONSISTENCY_STATE_LABELS, type ConsistencyDay } from "@/lib/training/dashboards";
import { formatVolumeKg } from "@/lib/training/metrics";

/** "11/10 (hoje): Treino registrado — Superior A". Sem dado = ainda vai chegar. */
export function textoDoDiaDaConsistencia(date: string, dia: ConsistencyDay | undefined, hoje: string): string {
  const quando = `${date.slice(8, 10)}/${date.slice(5, 7)}${date === hoje ? " (hoje)" : ""}`;
  if (!dia) return `${quando}: ${CONSISTENCY_STATE_LABELS.futuro.toLowerCase()}`;
  const partes = [`${quando}: ${CONSISTENCY_STATE_LABELS[dia.state]}`];
  if (dia.workouts.length > 0) partes.push(dia.workouts.join(", "));
  if (dia.volumeKg > 0) partes.push(formatVolumeKg(dia.volumeKg));
  return partes.join(" — ");
}
