/**
 * Fase 18-C — IA · O que a ferramenta da Agenda relata bate com o que a tela mostra.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O CASO QUE ESTE ARQUIVO EXISTE PARA FIXAR: EVENTO É INSTANTE, LIDO EM BRASÍLIA.       ║
 * ║                                                                                       ║
 * ║ Um compromisso às 22h BRT de 07/08 é `2026-08-08T01:00:00Z` em UTC. Formatado com      ║
 * ║ `toISOString().slice(0,10)` — ou com qualquer getter de `Date` num processo em UTC —   ║
 * ║ ele vira 08/08. A IA relataria o compromisso no dia SEGUINTE.                          ║
 * ║                                                                                       ║
 * ║ Por isso as fixtures usam instantes ABSOLUTOS (com `Z`) e os valores esperados estão   ║
 * ║ em BRT. A suíte precisa passar em qualquer fuso — confira com `TZ=UTC`.                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarEventLite } from "@/lib/calendar/events";

let eventosFalsos: CalendarEventLite[] = [];
let ultimaJanela: { from: Date; to: Date } | null = null;
let ultimoUpcoming: { now: Date; limit: number; horizonDays: number } | null = null;

vi.mock("@/lib/calendar/queries", () => ({
  getCalendarEvents: async (from: Date, to: Date) => {
    ultimaJanela = { from, to };
    return eventosFalsos;
  },
  getUpcomingCalendarEvents: async (now: Date, limit: number, horizonDays: number) => {
    ultimoUpcoming = { now, limit, horizonDays };
    return eventosFalsos.slice(0, limit);
  },
}));

const { getUpcoming, getDay } = await import("./calendar");

/* ═══════════════════════════ Fixtures mínimas ═══════════════════════════ */

function evento(
  over: Partial<CalendarEventLite> & { id: string; title: string; start: Date },
): CalendarEventLite {
  return {
    end: new Date(over.start.getTime() + 3_600_000),
    allDay: false,
    // `EVENT_TYPES` é fechado: pessoal · trabalho · estudos · exercicios · rotina.
    tipo: "pessoal",
    ...over,
  } as CalendarEventLite;
}

/**
 * ⚠️ 2026-08-08T01:00:00Z é **22h do dia 07/08 em Brasília** (BRT = UTC-3).
 * É o caso que quebra qualquer leitura em UTC.
 */
const NOITE_DE_07 = new Date("2026-08-08T01:00:00.000Z");
/** 2026-08-07T13:00:00Z = 10h do dia 07/08 em Brasília. */
const MANHA_DE_07 = new Date("2026-08-07T13:00:00.000Z");

beforeEach(() => {
  eventosFalsos = [];
  ultimaJanela = null;
  ultimoUpcoming = null;
});

/* ═══════════════════════════════ Testes ═══════════════════════════════ */

describe("o instante é lido em Brasília, nunca em UTC", () => {
  it("22h BRT continua sendo o dia 07, não o 08", async () => {
    eventosFalsos = [evento({ id: "e1", title: "Jantar", start: NOITE_DE_07 })];

    const saida = await getDay({ data: "2026-08-07" });
    const item = saida.itens[0] as { data: string; hora_inicio: string | null };

    expect(item.data).toBe("2026-08-07");
    expect(item.hora_inicio).toBe("22:00");
  });

  /**
   * A janela do dia é construída com `-03:00` explícito. Num processo em UTC,
   * `new Date("2026-08-07T00:00:00")` seria meia-noite UTC — a janela pegaria de 21h do dia
   * 06 às 21h do dia 07, e o jantar das 22h ficaria de fora da consulta.
   */
  it("a janela consultada cobre o dia inteiro em Brasília", async () => {
    eventosFalsos = [evento({ id: "e1", title: "Jantar", start: NOITE_DE_07 })];
    await getDay({ data: "2026-08-07" });

    expect(ultimaJanela).not.toBeNull();
    expect(ultimaJanela!.from.toISOString()).toBe("2026-08-07T03:00:00.000Z");
    // 23:59:59.999 BRT do dia 07 = 02:59:59.999Z do dia 08.
    expect(ultimaJanela!.to.toISOString()).toBe("2026-08-08T02:59:59.999Z");
    // O evento das 22h BRT cai DENTRO dessa janela.
    expect(NOITE_DE_07.getTime()).toBeGreaterThan(ultimaJanela!.from.getTime());
    expect(NOITE_DE_07.getTime()).toBeLessThan(ultimaJanela!.to.getTime());
  });
});

describe("calendar.get_day", () => {
  it("separa eventos com horário dos de dia inteiro", async () => {
    eventosFalsos = [
      evento({ id: "e1", title: "Reunião", start: MANHA_DE_07 }),
      evento({
        id: "e2",
        title: "Aniversário",
        start: new Date("2026-08-07T03:00:00.000Z"),
        allDay: true,
        tipo: "pessoal",
      }),
    ];

    const saida = await getDay({ data: "2026-08-07" });

    expect(saida.contagem).toBe(2);
    expect(saida.agregados).toMatchObject({
      compromissos: 2,
      dia_inteiro: 1,
      com_horario: 1,
      primeiro_horario: "10:00",
    });
  });

  it("evento de dia inteiro não ganha horário inventado", async () => {
    eventosFalsos = [
      evento({
        id: "e2",
        title: "Feriado",
        start: new Date("2026-08-07T03:00:00.000Z"),
        allDay: true,
      }),
    ];

    const item = (await getDay({ data: "2026-08-07" })).itens[0] as {
      hora_inicio: string | null;
      hora_fim: string | null;
    };
    expect(item.hora_inicio).toBeNull();
    expect(item.hora_fim).toBeNull();
  });

  /**
   * "Não há compromisso cadastrado" ≠ "você está livre". O sistema não sabe o que não foi
   * cadastrado, nem o que está num calendário não conectado.
   */
  it("dia vazio declara ausência de registro, não disponibilidade", async () => {
    const saida = await getDay({ data: "2026-08-07" });
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("ausência de evento cadastrado");
    expect(saida.periodo).toEqual({ de: "2026-08-07", ate: "2026-08-07" });
  });
});

describe("calendar.get_upcoming", () => {
  it("pede TETO + 1 à consulta, para poder provar saturação", async () => {
    eventosFalsos = [evento({ id: "e1", title: "X", start: MANHA_DE_07 })];
    await getUpcoming({});

    expect(ultimoUpcoming).not.toBeNull();
    // 60 é o teto declarado no adapter; a 61ª só serve de prova.
    expect(ultimoUpcoming!.limit).toBe(61);
    expect(ultimoUpcoming!.horizonDays).toBe(14);
  });

  it("a janela pedida chega à consulta", async () => {
    eventosFalsos = [evento({ id: "e1", title: "X", start: MANHA_DE_07 })];
    await getUpcoming({ dias: 45 });
    expect(ultimoUpcoming!.horizonDays).toBe(45);
  });

  it("saturar o teto marca o resultado como parcial, com o motivo", async () => {
    eventosFalsos = Array.from({ length: 61 }, (_, i) =>
      evento({ id: `e${i}`, title: `Evento ${i}`, start: MANHA_DE_07 }),
    );

    const saida = await getUpcoming({});
    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toContain("60");
    expect(saida.contagem).toBe(60);
  });

  it("abaixo do teto o resultado é exato", async () => {
    eventosFalsos = [evento({ id: "e1", title: "X", start: MANHA_DE_07 })];
    const saida = await getUpcoming({});
    expect(saida.completude).toBe("exato");
    expect(saida.motivo_incompleto).toBeUndefined();
  });

  it("conta dias distintos com compromisso, não eventos", async () => {
    eventosFalsos = [
      evento({ id: "a", title: "A", start: MANHA_DE_07 }),
      evento({ id: "b", title: "B", start: NOITE_DE_07 }),
      evento({ id: "c", title: "C", start: new Date("2026-08-09T13:00:00.000Z") }),
    ];

    const saida = await getUpcoming({});
    // Três eventos, DOIS dias (07 e 09 em Brasília — a noite do 07 não vira 08).
    expect(saida.contagem).toBe(3);
    expect(saida.agregados).toMatchObject({ compromissos: 3, dias_com_compromisso: 2 });
  });

  /**
   * Instância de recorrência não tem linha própria no banco: o id que abre a tela é o do
   * evento mestre. Um ref com o id sintético da ocorrência daria um link que não resolve.
   */
  it("a ref de uma ocorrência aponta para o id do evento mestre", async () => {
    eventosFalsos = [
      evento({
        id: "ocorrencia-123",
        title: "Semanal",
        start: MANHA_DE_07,
        recurrenceParentId: "mestre-1",
      }),
    ];

    const saida = await getUpcoming({});
    expect(saida.refs[0]).toEqual({
      tipo: "evento",
      id: "mestre-1",
      rota: "/agenda?date=2026-08-07",
    });
    expect((saida.itens[0] as { ocorrencia_de_recorrencia: boolean }).ocorrencia_de_recorrencia).toBe(
      true,
    );
  });

  it("evento avulso mantém o próprio id na ref", async () => {
    eventosFalsos = [evento({ id: "e1", title: "Avulso", start: MANHA_DE_07 })];
    const saida = await getUpcoming({});
    expect(saida.refs[0].id).toBe("e1");
    expect((saida.itens[0] as { ocorrencia_de_recorrencia: boolean }).ocorrencia_de_recorrencia).toBe(
      false,
    );
  });

  it("agenda vazia não afirma que o usuário está livre", async () => {
    const saida = await getUpcoming({ dias: 30 });
    expect(saida.contagem).toBe(0);
    expect(saida.observacao).toContain("ausência de evento cadastrado");
    expect(saida.observacao).not.toContain("livre");
  });
});
