import "server-only";

/**
 * Fase 18-C — IA · As duas ferramentas da Agenda. CASCAS FINAS.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NENHUM `.from()` E NENHUM `select()` NESTE ARQUIVO.                                   ║
 * ║ Tudo sai de `calendar/queries.ts`, que já expande as recorrências pelo módulo puro    ║
 * ║ `expandRowsToOccurrences`. Reimplementar a expansão aqui faria a IA listar um evento  ║
 * ║ semanal uma vez só — ou listá-lo num dia em que ele não acontece.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⚠️ EVENTO É INSTANTE (`timestamptz`), NÃO DATA PURA. LEIA SEMPRE EM BRASÍLIA.          ║
 * ║                                                                                       ║
 * ║ `start`/`end` são `Date`. Formatar com `toISOString().slice(0,10)` devolveria o dia   ║
 * ║ em UTC — e entre 21h e 00h BRT isso é o dia SEGUINTE. Um compromisso das 22h de       ║
 * ║ sexta seria relatado como sábado. Por isso todo instante sai daqui por                 ║
 * ║ `dateInSaoPaulo` / `timeInSaoPaulo`, nunca por getter de `Date` nem por `slice`.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `user_id` não aparece em lugar nenhum: as queries rodam sob RLS, com a sessão do usuário.
 */

import { z } from "zod";
import {
  getCalendarEvents,
  getUpcomingCalendarEvents,
} from "@/lib/calendar/queries";
import { EVENT_TYPE_LABELS } from "@/lib/calendar/constants";
import type { CalendarEventLite } from "@/lib/calendar/events";
import { dateInSaoPaulo, timeInSaoPaulo } from "@/lib/format";
import { emptyToolOutput, type ToolOutput, type ToolRef } from "../contracts";

/** ⚠️ `.strict()` nos dois: campo a mais é erro, e é por aqui que `user_id` seria barrado. */
export const getUpcomingInput = z
  .object({
    dias: z.number().int().min(1).max(180).optional(),
  })
  .strict();

export const getDayInput = z
  .object({
    // Data pura 'yyyy-MM-dd'. Ausente = hoje.
    data: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use uma data no formato AAAA-MM-DD.")
      .optional(),
  })
  .strict();

const HORIZONTE_PADRAO_DIAS = 14;

/**
 * O teto de EVENTOS devolvidos por `getUpcomingCalendarEvents` — o parâmetro `limit` dela,
 * cujo padrão é 5. Pedimos explicitamente, e pedimos TETO + 1 pelo mesmo motivo de sempre:
 * a linha extra não é usada em nada além de provar que o teto foi atingido. Sem ela, 60
 * eventos devolvidos são indistinguíveis de "existem exatamente 60".
 */
const TETO_EVENTOS = 60;

const refDoEvento = (e: CalendarEventLite): ToolRef => ({
  tipo: "evento",
  // Instância de recorrência não tem linha própria: o id que abre a tela é o do evento
  // mestre. Usar o id sintético da ocorrência daria um link que não resolve.
  id: e.recurrenceParentId ?? e.id,
  rota: `/agenda?date=${dateInSaoPaulo(e.start)}`,
});

function itemDoEvento(e: CalendarEventLite) {
  return {
    titulo: e.title,
    tipo: EVENT_TYPE_LABELS[e.tipo],
    // Data e hora SEMPRE em Brasília — ver o cabeçalho.
    data: dateInSaoPaulo(e.start),
    hora_inicio: e.allDay ? null : timeInSaoPaulo(e.start),
    hora_fim: e.allDay ? null : timeInSaoPaulo(e.end),
    dia_inteiro: e.allDay,
    local: e.location ?? null,
    // "Este evento se repete" muda o que uma resposta pode afirmar sobre ele.
    ocorrencia_de_recorrencia: e.recurrenceParentId !== null && e.recurrenceParentId !== undefined,
    origem: e.origin ?? "local",
  };
}

export async function getUpcoming(input: { dias?: number }): Promise<ToolOutput> {
  const dias = input.dias ?? HORIZONTE_PADRAO_DIAS;
  const agora = new Date();

  const encontrados = await getUpcomingCalendarEvents(agora, TETO_EVENTOS + 1, dias);

  const saturou = encontrados.length > TETO_EVENTOS;
  const eventos = saturou ? encontrados.slice(0, TETO_EVENTOS) : encontrados;

  const de = dateInSaoPaulo(agora);
  // O fim da janela sai da última ocorrência devolvida quando há alguma; senão, a janela
  // pedida não tem um instante concreto para nomear e `periodo.ate` fica sendo o início.
  const ate = eventos.length > 0 ? dateInSaoPaulo(eventos[eventos.length - 1].start) : de;

  if (eventos.length === 0) {
    return {
      ...emptyToolOutput(
        `Nenhum compromisso nos próximos ${dias} dias. Isso é ausência de evento cadastrado na agenda deste sistema — eventos que só existam em outro calendário não conectado não aparecem aqui.`,
      ),
      periodo: { de, ate: de },
    };
  }

  return {
    periodo: { de, ate },
    contagem: eventos.length,
    completude: saturou ? "parcial" : "exato",
    ...(saturou
      ? {
          motivo_incompleto: `A janela tem mais de ${TETO_EVENTOS} compromissos e a consulta traz os ${TETO_EVENTOS} mais próximos. Peça uma janela menor para uma lista que feche.`,
        }
      : {}),
    agregados: {
      compromissos: eventos.length,
      janela_dias: dias,
      proximo: itemDoEvento(eventos[0]),
      dias_com_compromisso: new Set(eventos.map((e) => dateInSaoPaulo(e.start))).size,
    },
    itens: eventos.map(itemDoEvento),
    refs: eventos.map(refDoEvento),
  };
}

export async function getDay(input: { data?: string }): Promise<ToolOutput> {
  const dia = input.data ?? dateInSaoPaulo(new Date());

  /**
   * ⚠️ A janela do dia é construída em HORA DE BRASÍLIA, não no fuso do processo.
   *
   * `new Date("2026-08-07T00:00:00")` (sem sufixo) é meia-noite LOCAL — o que muda conforme
   * o `TZ` do processo. Na Vercel, em UTC, isso pegaria de 21h do dia anterior às 21h do dia,
   * e o compromisso das 22h sumiria da consulta. `-03:00` é explícito: a agenda deste sistema
   * é de Brasília, e o `TZ` do processo é rede de segurança, não a defesa.
   */
  const inicio = new Date(`${dia}T00:00:00-03:00`);
  const fim = new Date(`${dia}T23:59:59.999-03:00`);

  const eventos = await getCalendarEvents(inicio, fim);

  if (eventos.length === 0) {
    return {
      ...emptyToolOutput(
        `Nenhum compromisso em ${dia}. Isso é ausência de evento cadastrado, não uma agenda que foi consultada e estava vazia por outro motivo.`,
      ),
      periodo: { de: dia, ate: dia },
    };
  }

  const comHora = eventos.filter((e) => !e.allDay);

  return {
    periodo: { de: dia, ate: dia },
    contagem: eventos.length,
    completude: "exato",
    agregados: {
      compromissos: eventos.length,
      dia_inteiro: eventos.length - comHora.length,
      com_horario: comHora.length,
      primeiro_horario: comHora.length > 0 ? timeInSaoPaulo(comHora[0].start) : null,
    },
    itens: eventos.map(itemDoEvento),
    refs: eventos.map(refDoEvento),
  };
}
