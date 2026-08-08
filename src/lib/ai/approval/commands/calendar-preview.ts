import "server-only";

/**
 * Fase 18-C · Bloco 4 — IA · A METADE QUE SÓ LÊ dos commands da Agenda.
 *
 * Mesma partição de `todo-preview.ts` e `habits-preview.ts`, e pelo mesmo motivo: a partir de
 * `tools/` não pode existir caminho de import até uma função que escreve. Por isso este
 * arquivo NÃO importa `calendar/services.ts` — nem para perguntar se o Google está conectado.
 * Quem responde isso é `calendar/queries.ts`, que só lê.
 */

import { z } from "zod";
import { addDays } from "date-fns";
import { getCalendarEvents, getGoogleConnectionStatus } from "@/lib/calendar/queries";
import { calendarEventSchema, type CalendarEventInput } from "@/lib/validators/calendar";
import { EVENT_TYPES, EVENT_TYPE_LABELS, type EventType } from "@/lib/calendar/constants";
import {
  DURACAO_PADRAO_MINUTOS,
  instanteDoEvento,
  somarMinutosNaHora,
} from "@/lib/calendar/instants";
import { dateInSaoPaulo, formatDate, hojeISO, timeInSaoPaulo } from "@/lib/format";
import { EfeitoImpossivel, type EfeitoProposto } from "../contracts";

const ROTA_DA_AGENDA = "/agenda";

/* ══════════════════════════════════════════════════════════════════════════════════════
   Entrada
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * ⚠️ A ENTRADA É HORA DE PAREDE, NUNCA INSTANTE — e a decisão é deliberada.
 *
 * Aceitar `start_at` em ISO deixaria o modelo escolher o fuso, e ele erraria: "amanhã às 19h"
 * viraria `19:00Z` (16h em Brasília) na primeira vez que ele resolvesse ser prestativo. Aqui
 * ele diz o que o usuário disse — data e hora do relógio — e quem converte para instante é o
 * servidor, com `instanteDoEvento`, a mesma função do formulário.
 */
export const criarEventoEntrada = z
  .object({
    titulo: z.string().trim().min(1).max(200),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data no formato AAAA-MM-DD"),
    hora_inicio: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Horário no formato HH:MM")
      .nullable()
      .optional(),
    hora_fim: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Horário no formato HH:MM")
      .nullable()
      .optional(),
    dia_inteiro: z.boolean().nullable().optional(),
    local: z.string().trim().max(300).nullable().optional(),
    descricao: z.string().trim().max(2000).nullable().optional(),
    tipo: z.enum(EVENT_TYPES).nullable().optional(),
  })
  .strict();
export type CriarEventoEntrada = z.infer<typeof criarEventoEntrada>;

export const excluirEventoEntrada = z.object({ evento_id: z.uuid() }).strict();
export type ExcluirEventoEntrada = z.infer<typeof excluirEventoEntrada>;

/** O `parse` na forma que o contrato pede. Reusado pelas duas metades. */
export function parseComEvento<T extends z.ZodType>(schema: T) {
  return (payload: unknown): { ok: true; valor: unknown } | { ok: false } => {
    const r = schema.safeParse(payload);
    return r.success ? { ok: true, valor: r.data } : { ok: false };
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   Resolução — os dois instantes
   ══════════════════════════════════════════════════════════════════════════════════════ */

export type HorarioResolvido = {
  readonly diaInteiro: boolean;
  readonly horaInicio: string;
  readonly horaFim: string;
  readonly inicio: string;
  readonly fim: string;
  /** O fim foi DEDUZIDO (uma hora depois), em vez de informado. Vira ressalva. */
  readonly fimDeduzido: boolean;
};

/**
 * Resolve início e fim.
 *
 * ⚠️ Sem hora e sem `dia_inteiro`, isto RECUSA em vez de escolher um horário. Um padrão
 * ("09:00", "a próxima hora cheia") criaria um compromisso num horário que ninguém disse, e o
 * dono confirmaria a proposta olhando o título. Recusar custa um passo do laço; adivinhar
 * custa um compromisso no horário errado.
 */
export function resolverHorario(d: CriarEventoEntrada): HorarioResolvido {
  const diaInteiro = d.dia_inteiro === true;

  if (diaInteiro) {
    return {
      diaInteiro: true,
      horaInicio: "",
      horaFim: "",
      inicio: instanteDoEvento(d.data, "", true),
      fim: instanteDoEvento(d.data, "", true),
      fimDeduzido: false,
    };
  }

  if (!d.hora_inicio) {
    throw new EfeitoImpossivel(
      "Falta o horário. Diga a que horas o compromisso começa, ou peça para marcá-lo como dia inteiro. Nada foi criado.",
    );
  }

  const horaFim = d.hora_fim ?? somarMinutosNaHora(d.hora_inicio, DURACAO_PADRAO_MINUTOS);
  const inicio = instanteDoEvento(d.data, d.hora_inicio, false);
  const fim = instanteDoEvento(d.data, horaFim, false);

  if (new Date(fim).getTime() < new Date(inicio).getTime()) {
    throw new EfeitoImpossivel(
      `O fim (${horaFim}) é anterior ao início (${d.hora_inicio}). Nada foi criado — confira os horários.`,
    );
  }

  return {
    diaInteiro: false,
    horaInicio: d.hora_inicio,
    horaFim,
    inicio,
    fim,
    fimDeduzido: d.hora_fim == null,
  };
}

/**
 * Traduz a entrada da IA para o schema do FORMULÁRIO — o ponto em que os dois caminhos
 * convergem. Daqui para baixo, `criarEventoNaAgenda` recebe o mesmo objeto que receberia
 * vindo do diálogo "Novo evento".
 *
 * ⚠️ Recorrência, lembrete, cor e `task_id` saem FIXOS. A ferramenta não os expõe: uma
 * recorrência criada por engano se multiplica no calendário do dono (e no Google), e um
 * lembrete que ele não pediu vira notificação no celular. Quem quer isso usa o formulário.
 */
export function paraOSchemaDoFormulario(
  d: CriarEventoEntrada,
  horario: HorarioResolvido,
): CalendarEventInput {
  return calendarEventSchema.parse({
    title: d.titulo,
    description: d.descricao ?? "",
    location: d.local ?? "",
    all_day: horario.diaInteiro,
    start_at: horario.inicio,
    end_at: horario.fim,
    tipo: (d.tipo ?? "pessoal") satisfies EventType,
    color: "",
    recurrence_freq: null,
    recurrence_interval: 1,
    recurrence_until: "",
    reminder_minutes: null,
    task_id: "",
  });
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   criarEvento
   ══════════════════════════════════════════════════════════════════════════════════════ */

/**
 * Os compromissos que já ocupam o mesmo intervalo.
 *
 * ⚠️ Isto entra na previsão, e portanto no HASH — de propósito. Se um compromisso conflitante
 * aparecer entre propor e confirmar, o hash diverge e a execução é recusada com "o mundo
 * mudou". É exatamente o caso em que o dono quer ser interrompido: ele confirmaria um horário
 * que passou a estar ocupado depois de ler a tela.
 */
async function conflitos(inicio: string, fim: string): Promise<string[]> {
  const de = new Date(inicio);
  const ate = new Date(fim);
  // Janela de um dia em volta: eventos recorrentes precisam ser expandidos para serem vistos.
  const eventos = await getCalendarEvents(addDays(de, -1), addDays(ate, 1));

  return eventos
    .filter((e) => {
      // Sobreposição estrita: encostar (um termina onde o outro começa) não é conflito.
      return e.start.getTime() < ate.getTime() && e.end.getTime() > de.getTime();
    })
    .map((e) =>
      e.allDay
        ? `${e.title} (dia inteiro)`
        : `${e.title} (${timeInSaoPaulo(e.start)}–${timeInSaoPaulo(e.end)})`,
    );
}

export async function preverCriarEvento(payload: unknown): Promise<EfeitoProposto> {
  const d = payload as CriarEventoEntrada;
  const horario = resolverHorario(d);
  const tipo = (d.tipo ?? "pessoal") as EventType;

  const linhas: { rotulo: string; valor: string }[] = [
    { rotulo: "Título", valor: d.titulo },
    { rotulo: "Data", valor: formatDate(`${d.data}T12:00:00.000Z`) },
    {
      rotulo: "Horário",
      valor: horario.diaInteiro ? "dia inteiro" : `${horario.horaInicio} às ${horario.horaFim}`,
    },
    { rotulo: "Tipo", valor: EVENT_TYPE_LABELS[tipo] },
  ];
  if (d.local) linhas.push({ rotulo: "Local", valor: d.local });

  const ressalvas: string[] = [];

  if (horario.fimDeduzido) {
    ressalvas.push(
      `Você não disse a que horas termina, então o compromisso fica com uma hora de duração (até ${horario.horaFim}) — o mesmo padrão do formulário da agenda.`,
    );
  }

  /**
   * ⚠️ A RESSALVA MAIS IMPORTANTE DESTE COMMAND, e a razão de ele ser diferente dos anteriores:
   * com a conta conectada, o compromisso NÃO fica no sistema. Ele vai para o calendário Google
   * do dono, chega ao celular dele e a quem compartilhe aquele calendário. Descobrir isso
   * depois de confirmar seria descobrir tarde demais.
   */
  const { status } = await getGoogleConnectionStatus();
  if (status.connected) {
    ressalvas.push(
      `Sua conta Google está conectada${status.email ? ` (${status.email})` : ""}: o compromisso também será criado no seu Google Agenda e aparecerá nos aparelhos sincronizados.`,
    );
  }

  const emConflito = await conflitos(horario.inicio, horario.fim);
  if (emConflito.length > 0) {
    ressalvas.push(
      `Já há ${emConflito.length === 1 ? "um compromisso" : `${emConflito.length} compromissos`} nesse horário: ${emConflito.join("; ")}. A agenda aceita sobreposição — isto é só um aviso.`,
    );
  }

  ressalvas.push(
    "O compromisso não se repete e não tem lembrete: a IA não cria repetição nem alerta. Ajuste na agenda, se quiser.",
  );

  const hoje = hojeISO();
  if (d.data < hoje) {
    ressalvas.push(`A data é passada (hoje é ${formatDate(`${hoje}T12:00:00.000Z`)}).`);
  }

  return {
    command: "criarEvento",
    payload: { ...d },
    // Sem entidade: o evento ainda não existe. As entidades são os registros RESOLVIDOS, e
    // aqui não há nenhum — declarar o próprio evento seria declarar um id que não existe.
    entidades: [],
    previsao: {
      resumo: horario.diaInteiro
        ? `Criar "${d.titulo}" na agenda em ${formatDate(`${d.data}T12:00:00.000Z`)}, o dia inteiro.`
        : `Criar "${d.titulo}" na agenda em ${formatDate(`${d.data}T12:00:00.000Z`)}, das ${horario.horaInicio} às ${horario.horaFim}.`,
      linhas,
      ressalvas,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════════════════
   excluirEvento — o `undo` declarado
   ══════════════════════════════════════════════════════════════════════════════════════ */

/** Carrega o evento pelo id, entre os de uma janela larga em volta de hoje. */
export async function carregarEvento(eventoId: string) {
  const hoje = new Date(`${hojeISO()}T12:00:00.000Z`);
  const eventos = await getCalendarEvents(addDays(hoje, -400), addDays(hoje, 400));
  const evento = eventos.find((e) => e.id === eventoId);
  if (!evento) {
    throw new EfeitoImpossivel(
      "O compromisso não existe mais (ou não é seu). Nada foi alterado.",
    );
  }
  return evento;
}

export async function preverExcluirEvento(payload: unknown): Promise<EfeitoProposto> {
  const { evento_id } = payload as ExcluirEventoEntrada;
  const evento = await carregarEvento(evento_id);
  const inicio = evento.start;

  const ressalvas = [
    "A exclusão não tem desfazer: o compromisso não volta com o mesmo registro.",
  ];
  const { status } = await getGoogleConnectionStatus();
  if (status.connected) {
    ressalvas.push(
      "Com o Google conectado, ele também é removido do seu Google Agenda — e some dos aparelhos sincronizados.",
    );
  }

  return {
    command: "excluirEvento",
    payload: { ...(payload as ExcluirEventoEntrada) },
    entidades: [{ tipo: "evento", id: evento_id, rota: ROTA_DA_AGENDA }],
    previsao: {
      resumo: `Excluir "${evento.title}" da agenda.`,
      linhas: [
        { rotulo: "Título", valor: evento.title },
        { rotulo: "Data", valor: formatDate(inicio) },
        {
          rotulo: "Horário",
          valor: evento.allDay ? "dia inteiro" : timeInSaoPaulo(inicio),
        },
      ],
      ressalvas,
    },
  };
}

/** A rota que a tela usa para levar ao dia do compromisso. */
export function rotaDoDia(instante: string): string {
  return `${ROTA_DA_AGENDA}?date=${dateInSaoPaulo(new Date(instante))}`;
}
