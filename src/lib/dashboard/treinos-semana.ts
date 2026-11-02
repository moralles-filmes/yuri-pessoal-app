/**
 * REDESIGN-06 T12 — as barras da semana do card de Treinos (D-06-M2). Puro.
 *
 * Invariante 22 de Treinos: o calendário não cobra. Nenhum estado vira "falta": dia planejado
 * que passou sem treino é dia livre, e a sessão abandonada (`parcial`) continua sendo treino.
 */
import type { ConsistencyDay } from "@/lib/training/dashboards";

export type EstadoDoDiaNaSemana = "treinou" | "planejado" | "descanso" | "livre" | "a_seguir";

const ROTULOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** Rótulo do dia da semana de uma data pura (`yyyy-MM-dd`), sem fuso: aritmética em UTC. */
function rotuloDoDia(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return ROTULOS[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()];
}

function estadoDoDia(dia: ConsistencyDay): EstadoDoDiaNaSemana {
  switch (dia.state) {
    case "treinado":
    case "parcial":
      return "treinou";
    case "planejado_sem_execucao":
      // Só "hoje" ainda pode acontecer; num dia que passou, é dia livre — nunca falta.
      return dia.isToday ? "planejado" : "livre";
    case "descanso":
      return "descanso";
    case "futuro":
      return "a_seguir";
    case "livre":
      return "livre";
  }
}

export function semanaDoCard(
  dias: readonly ConsistencyDay[],
): { data: string; rotulo: string; estado: EstadoDoDiaNaSemana }[] {
  return dias.map((dia) => ({
    data: dia.date,
    rotulo: rotuloDoDia(dia.date),
    estado: estadoDoDia(dia),
  }));
}
