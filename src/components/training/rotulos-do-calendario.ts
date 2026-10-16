/**
 * REDESIGN-07-C · D4 — o texto do calendário de Treinos (puro, testado em node).
 *
 * O estado de um dia não pode morar só na cor, e "hoje" não pode morar só num anel: cada
 * célula diz em palavras o que a cor e o anel dizem. `hoje` é sempre o do servidor, INJETADO
 * — a comparação é de texto (`yyyy-MM-dd`), imune a fuso.
 *
 * ⚠️ Bundle: este módulo só importa o que o calendário já carrega (`constants`, `schedule`).
 * Importar `history.ts`/`dashboards.ts` aqui por uma função de rótulo arrastava esses módulos
 * inteiros para a rota (+3,9 KB no calendário, medido). O texto da consistência mora em
 * `rotulos-da-consistencia.ts`; o do chip de série, em `session/rotulos-da-sessao.ts`.
 *
 * ⛔ Sem linguagem de cobrança (invariante 22 de Treinos): dia livre é dia livre.
 */
import {
  DERIVED_SCHEDULE_STATUS_LABELS,
  WEEKDAY_LABELS,
  type DerivedScheduleStatus,
  type ScheduleStatus,
} from "@/lib/training/constants";
import { derivePlannedStatus } from "@/lib/training/schedule";

/** O que a tela mostra: o status derivado, ou "descanso" — que não é treino atrasado. */
export type StatusExibido = DerivedScheduleStatus | "descanso";

export const ROTULOS_DO_STATUS: Record<StatusExibido, string> = {
  ...DERIVED_SCHEDULE_STATUS_LABELS,
  descanso: "Descanso",
};

/**
 * G2 — o descanso é gravado com `status: "planejado"`, e o mês e a lista o passavam por
 * `derivePlannedStatus`: descanso de ontem saía "Atrasado", em tom de alarme, e o de hoje,
 * "Hoje". A semana já tratava certo. Aqui o descanso nunca passa pela derivação (que não muda).
 */
export function statusExibido(
  entry: { entryKind: string; scheduledDate: string; status: ScheduleStatus },
  hoje: string,
): StatusExibido {
  if (entry.entryKind === "descanso") return "descanso";
  return derivePlannedStatus(entry, hoje);
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/** "Domingo, 11 de outubro de 2026" — a partir do TEXTO da data, sem fuso. */
export function dataPorExtenso(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [ano, mes, dia] = iso.split("-").map(Number);
  // Dia da semana em UTC: a data pura não tem fuso, e `getUTCDay` não lê o do processo.
  const semana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
  return `${WEEKDAY_LABELS[semana]}, ${dia} de ${MESES[mes - 1]} de ${ano}`;
}

const comHoje = (iso: string, hoje: string) => (iso === hoje ? `${dataPorExtenso(iso)} (hoje)` : dataPorExtenso(iso));

/** Nome da coluna de um dia na semana: data escrita e, se for o caso, "hoje". */
export function textoDaColunaDaSemana(date: string, hoje: string): string {
  return comHoje(date, hoje);
}

export function rotuloDeAdicionar(date: string, hoje: string): string {
  return `Adicionar treino em ${comHoje(date, hoje)}`;
}

export function rotuloDeDescanso(date: string, hoje: string, temDescanso: boolean): string {
  return `${temDescanso ? "Desmarcar" : "Marcar"} descanso em ${comHoje(date, hoje)}`;
}

/**
 * A célula do mês é um botão que adiciona treino; o nome dele diz o dia, se é hoje, se está
 * fora do mês, e cada coisa planejada com o seu status — o que o chip colorido mostra.
 */
export function rotuloDaCelulaDoMes(
  date: string,
  hoje: string,
  mes: string,
  entradas: { entryKind: string; scheduledDate: string; status: ScheduleStatus; nome: string }[],
): string {
  const partes = [comHoje(date, hoje)];
  if (!date.startsWith(mes)) partes.push("fora do mês");
  if (entradas.length === 0) partes.push("nada planejado");
  for (const e of entradas) {
    const status = statusExibido(e, hoje);
    partes.push(status === "descanso" ? "descanso" : `${e.nome}: ${ROTULOS_DO_STATUS[status].toLowerCase()}`);
  }
  return `${partes.join(" · ")}. Adicionar treino`;
}
