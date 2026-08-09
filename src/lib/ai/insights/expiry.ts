/**
 * Fase 18-E — IA · QUANDO UM INSIGHT DEIXA DE VALER. Puro, `hoje` injetado.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ DOIS CASOS, E ELES SÃO DIFERENTES                                                     ║
 * ║                                                                                       ║
 * ║ PERÍODO EM CURSO (esta semana, este mês): o insight expira QUANDO O PERÍODO TERMINA.  ║
 * ║ A partir dali os números que ele cita deixaram de ser os do período inteiro — "você    ║
 * ║ gastou X este mês" dito no dia 9 continua verdadeiro sobre os 9 dias, e falso sobre o  ║
 * ║ mês. O texto não muda; o que muda é o significado de "este mês".                       ║
 * ║                                                                                       ║
 * ║ PERÍODO FECHADO (o mês passado): os números não vão mudar mais, então o insight não    ║
 * ║ fica errado. Ele fica VELHO — e um painel cheio de leituras de meses antigos esconde a ║
 * ║ de agora. Expira num horizonte fixo, por relevância, não por correção.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ **EXPIRAR NÃO APAGA.** O insight sai da lista de vigentes e do card do dashboard, e
 * continua legível com os números que tinha — eles são snapshot (`ai_insight_sources`). É a
 * mesma disciplina que faz um relatório de período passado sair do snapshot na Dieta.
 */

import { saoPauloWallClockToInstant } from "@/lib/format";

import type { PeriodoDoIndicador } from "./contracts";
import { somarDias } from "./temporal";

/**
 * Quantos dias um insight sobre período JÁ FECHADO fica na lista.
 *
 * 30 dias é decisão de produto, não de correção: um mês é tempo de o dono voltar e reler, e
 * curto o bastante para o painel não virar arquivo morto. O número está aqui, nomeado, para
 * mudá-lo ser um commit e não uma caça.
 */
export const DIAS_DE_VIDA_DE_PERIODO_FECHADO = 30;

/**
 * O instante em que o insight vence, em ISO.
 *
 * @param periodo  o período que o insight analisa (datas PURAS)
 * @param hoje     `yyyy-MM-dd` em Brasília, injetado pelo servidor
 *
 * ⚠️ **A meia-noite é a de BRASÍLIA, não a de UTC.** `saoPauloWallClockToInstant` faz a
 * conversão; um `new Date(data)` cru daria a meia-noite UTC, que em Brasília é 21h do dia
 * anterior — e o insight do mês expiraria três horas antes de o mês acabar.
 */
export function expiraEm(periodo: PeriodoDoIndicador, hoje: string): string {
  const emCurso = periodo.ate >= hoje;

  // Em curso: vence na virada do dia seguinte ao último dia do período.
  // Fechado: vence na virada do dia seguinte ao fim do horizonte contado de hoje.
  const ultimoDia = emCurso
    ? periodo.ate
    : somarDias(hoje, DIAS_DE_VIDA_DE_PERIODO_FECHADO);

  return saoPauloWallClockToInstant(somarDias(ultimoDia, 1), "00:00").toISOString();
}

/**
 * ⚠️ O CHECK do banco recusa `expires_at <= created_at`, e um período fechado ontem com
 * horizonte zero cairia nele. Esta função nunca devolve um instante passado porque o menor
 * caso — período que termina hoje — já vence na virada de hoje para amanhã, que é futuro em
 * qualquer horário do dia. Testado.
 */
export function jaExpirou(expiresAt: string, agora: Date): boolean {
  return new Date(expiresAt).getTime() <= agora.getTime();
}
