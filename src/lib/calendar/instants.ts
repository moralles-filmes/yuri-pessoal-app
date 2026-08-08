/**
 * Agenda · A conversão "data + hora de parede" → INSTANTE. Pura, e agora compartilhada.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE ISTO SAIU DE DENTRO DO FORMULÁRIO (18-C · Bloco 4)                            ║
 * ║                                                                                       ║
 * ║ Eram três linhas dentro de `event-form.tsx`, e três linhas que decidem em que DIA o    ║
 * ║ compromisso cai. Enquanto só o formulário criava evento, morar lá era razoável. A IA   ║
 * ║ passou a criar também — e reescrever a conversão no command daria dois eventos         ║
 * ║ diferentes para a mesma frase, com a divergência aparecendo só entre 21h e 00h BRT.    ║
 * ║                                                                                       ║
 * ║ As duas convenções que ela carrega, e que não se adivinha lendo o schema:              ║
 * ║   • hora informada é hora de BRASÍLIA, nunca do aparelho de quem digitou;              ║
 * ║   • "dia inteiro" é ancorado ao MEIO-DIA UTC — a mesma convenção do Google. Meia-noite ║
 * ║     colocaria o evento no dia anterior em qualquer fuso a oeste de Greenwich.          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { saoPauloWallClockToInstant } from "@/lib/format";

/** A âncora de "dia inteiro". Meio-dia UTC = 09:00 em Brasília — longe das duas viradas. */
export const ANCORA_DE_DIA_INTEIRO = "T12:00:00.000Z";

/**
 * `data` é data pura (`AAAA-MM-DD`); `hora` é `HH:MM` **em Brasília**. Devolve o instante ISO
 * que vai para `calendar_events.start_at`/`end_at`.
 */
export function instanteDoEvento(
  data: string,
  hora: string,
  diaInteiro: boolean,
): string {
  if (diaInteiro) return `${data}${ANCORA_DE_DIA_INTEIRO}`;
  return saoPauloWallClockToInstant(data, hora || "00:00").toISOString();
}

/** Uma hora depois, no relógio. É o padrão que o formulário já usava para o fim do evento. */
export const DURACAO_PADRAO_MINUTOS = 60;

/**
 * Soma minutos a uma hora de parede `HH:MM`, devolvendo `HH:MM`.
 *
 * ⚠️ Aritmética de RELÓGIO, não de instante — e por isso satura em 23:59 em vez de virar o
 * dia. Um evento que começa 23:30 e "termina 00:30" precisaria mudar a data de fim também, e
 * inventar essa mudança escondida seria pior que encostar no fim do dia: quem propõe evento
 * que cruza a meia-noite informa o fim explicitamente.
 */
export function somarMinutosNaHora(hora: string, minutos: number): string {
  const [h, m] = hora.split(":").map((n) => Number(n));
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hora;
  const total = Math.min(h * 60 + m + minutos, 23 * 60 + 59);
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}
