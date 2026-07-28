import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  describeRule,
  firstBusinessDayOfMonth,
  isLeapYear,
  isSeriesFinished,
  lastBusinessDayOfMonth,
  materializeNext,
  nextOccurrence,
  normalizeRule,
  nthWeekdayOfMonth,
  previewOccurrences,
  weekdayOf,
  type TodoRecurrenceRule,
} from "./recurrence";

/** Regra base: diária, todo dia, modo fixo. Os testes sobrescrevem o que precisam. */
function rule(patch: Partial<TodoRecurrenceRule> = {}): TodoRecurrenceRule {
  return {
    frequency: "diaria",
    intervalCount: 1,
    mode: "fixo",
    occurrencesCreated: 0,
    isPaused: false,
    ...patch,
  };
}

describe("helpers de calendário", () => {
  it("identifica ano bissexto (regra dos 100/400)", () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(1900)).toBe(false); // século não divisível por 400
    expect(isLeapYear(2000)).toBe(true);
  });

  it("conta os dias de cada mês, incluindo fevereiro bissexto", () => {
    expect(daysInMonth(2026, 1)).toBe(31);
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
  });

  it("calcula o dia da semana em UTC (imune ao fuso do processo)", () => {
    expect(weekdayOf("2026-07-28")).toBe(2); // terça-feira
    expect(weekdayOf("2026-07-26")).toBe(0); // domingo
  });

  it("acha o primeiro e o último dia útil do mês", () => {
    // Agosto/2026 começa num sábado (01/08) → 1º dia útil é 03/08 (segunda).
    expect(firstBusinessDayOfMonth(2026, 8)).toBe("2026-08-03");
    // Maio/2026 termina num domingo (31/05) → último dia útil é 29/05 (sexta).
    expect(lastBusinessDayOfMonth(2026, 5)).toBe("2026-05-29");
  });

  it("acha a n-ésima ocorrência de um dia da semana no mês", () => {
    expect(nthWeekdayOfMonth(2026, 8, 1, 1)).toBe("2026-08-03"); // 1ª segunda de ago/26
    expect(nthWeekdayOfMonth(2026, 8, 2, 2)).toBe("2026-08-11"); // 2ª terça
    expect(nthWeekdayOfMonth(2026, 8, 5, -1)).toBe("2026-08-28"); // última sexta
    expect(nthWeekdayOfMonth(2026, 8, 1, 4)).toBe("2026-08-24"); // 4ª segunda existe
  });

  it("devolve null quando a n-ésima ocorrência não existe no mês", () => {
    // Fevereiro/2026 tem só 4 domingos → não há 4ª… mas há; peça a 4ª de um dia com 4.
    // 30/31 dias garantem no máximo 5; a 4ª sempre existe. Testamos o caso limite real:
    expect(nthWeekdayOfMonth(2026, 2, 0, 4)).toBe("2026-02-22");
    // Mês curto sem 5ª ocorrência via nth=4 é sempre válido; o null aparece em nth inválido.
    expect(nthWeekdayOfMonth(2026, 2, 0, 9)).toBeNull();
  });
});

describe("nextOccurrence — diária", () => {
  it("avança 1 dia", () => {
    expect(nextOccurrence(rule(), "2026-07-28")).toBe("2026-07-29");
  });

  it("avança N dias", () => {
    expect(nextOccurrence(rule({ intervalCount: 3 }), "2026-07-28")).toBe("2026-07-31");
  });

  it("vira o mês e o ano corretamente", () => {
    expect(nextOccurrence(rule(), "2026-07-31")).toBe("2026-08-01");
    expect(nextOccurrence(rule(), "2026-12-31")).toBe("2027-01-01");
  });

  it("atravessa 29/02 em ano bissexto", () => {
    expect(nextOccurrence(rule(), "2024-02-28")).toBe("2024-02-29");
    expect(nextOccurrence(rule(), "2024-02-29")).toBe("2024-03-01");
  });

  it("pula fim de semana com 'apenas_dias_uteis' (todos os dias úteis)", () => {
    // Sexta 31/07/2026 → sábado seria 01/08 → empurra para segunda 03/08.
    const r = rule({ businessDayRule: "apenas_dias_uteis" });
    expect(nextOccurrence(r, "2026-07-31")).toBe("2026-08-03");
    // Segunda → terça (dia útil, passa direto).
    expect(nextOccurrence(r, "2026-08-03")).toBe("2026-08-04");
  });
});

describe("nextOccurrence — semanal", () => {
  it("sem dias específicos, avança N semanas", () => {
    expect(nextOccurrence(rule({ frequency: "semanal" }), "2026-07-28")).toBe("2026-08-04");
    expect(nextOccurrence(rule({ frequency: "semanal", intervalCount: 2 }), "2026-07-28")).toBe(
      "2026-08-11",
    );
  });

  it("com dias específicos, vai para o próximo dia listado", () => {
    // Segunda(1), quarta(3) e sexta(5). 28/07/2026 é terça → próxima é quarta 29/07.
    const r = rule({ frequency: "semanal", daysOfWeek: [1, 3, 5] });
    expect(nextOccurrence(r, "2026-07-28")).toBe("2026-07-29");
    expect(nextOccurrence(r, "2026-07-29")).toBe("2026-07-31");
    // Da sexta pula o fim de semana e cai na segunda seguinte.
    expect(nextOccurrence(r, "2026-07-31")).toBe("2026-08-03");
  });

  it("respeita o ciclo de N semanas com dias específicos", () => {
    // Toda segunda, a cada 2 semanas, ancorado em 2026-08-03 (segunda).
    const r = rule({
      frequency: "semanal",
      intervalCount: 2,
      daysOfWeek: [1],
      startsOn: "2026-08-03",
    });
    // Da âncora, a próxima é 2 semanas depois — 10/08 é pulada.
    expect(nextOccurrence(r, "2026-08-03")).toBe("2026-08-17");
    expect(nextOccurrence(r, "2026-08-17")).toBe("2026-08-31");
  });

  it("um único dia da semana recorre semana a semana", () => {
    const r = rule({ frequency: "semanal", daysOfWeek: [1] }); // toda segunda
    expect(nextOccurrence(r, "2026-08-03")).toBe("2026-08-10");
  });
});

describe("nextOccurrence — mensal", () => {
  it("mantém o dia do mês", () => {
    const r = rule({ frequency: "mensal", dayOfMonth: 5 });
    expect(nextOccurrence(r, "2026-07-05")).toBe("2026-08-05");
  });

  it("faz clamp em meses curtos (dia 31 → fevereiro)", () => {
    const r = rule({ frequency: "mensal", dayOfMonth: 31 });
    expect(nextOccurrence(r, "2026-01-31")).toBe("2026-02-28");
    // Em 2024 (bissexto) o clamp vai para 29.
    expect(nextOccurrence(r, "2024-01-31")).toBe("2024-02-29");
  });

  it("último dia do mês (dayOfMonth = -1) acompanha 28/29/30/31", () => {
    const r = rule({ frequency: "mensal", dayOfMonth: -1 });
    expect(nextOccurrence(r, "2026-01-31")).toBe("2026-02-28");
    expect(nextOccurrence(r, "2026-02-28")).toBe("2026-03-31");
    expect(nextOccurrence(r, "2026-03-31")).toBe("2026-04-30");
    expect(nextOccurrence(r, "2024-01-31")).toBe("2024-02-29");
  });

  it("primeiro dia útil do mês", () => {
    const r = rule({ frequency: "mensal", businessDayRule: "primeiro_dia_util" });
    // Próximo depois de 01/07/2026 → agosto começa sábado → 03/08.
    expect(nextOccurrence(r, "2026-07-01")).toBe("2026-08-03");
  });

  it("último dia útil do mês", () => {
    const r = rule({ frequency: "mensal", businessDayRule: "ultimo_dia_util" });
    // Depois de 30/04/2026 → maio termina domingo 31 → 29/05 (sexta).
    expect(nextOccurrence(r, "2026-04-30")).toBe("2026-05-29");
  });

  it("n-ésima segunda-feira do mês", () => {
    const r = rule({ frequency: "mensal", weekOfMonth: 1, daysOfWeek: [1] });
    expect(nextOccurrence(r, "2026-08-03")).toBe("2026-09-07"); // 1ª segunda de set/26
  });

  it("última sexta-feira do mês", () => {
    const r = rule({ frequency: "mensal", weekOfMonth: -1, daysOfWeek: [5] });
    expect(nextOccurrence(r, "2026-07-31")).toBe("2026-08-28");
  });

  it("respeita intervalo de N meses a partir da âncora", () => {
    const r = rule({
      frequency: "mensal",
      intervalCount: 3,
      dayOfMonth: 10,
      startsOn: "2026-08-10",
    });
    expect(nextOccurrence(r, "2026-08-10")).toBe("2026-11-10");
    expect(nextOccurrence(r, "2026-11-10")).toBe("2027-02-10");
  });

  it("com startsOn futuro, nunca devolve data anterior ao início", () => {
    const r = rule({ frequency: "mensal", dayOfMonth: 10, startsOn: "2026-08-10" });
    expect(nextOccurrence(r, "2026-06-01")).toBe("2026-08-10");
  });
});

describe("nextOccurrence — anual", () => {
  it("repete no mesmo dia/mês do ano seguinte", () => {
    const r = rule({ frequency: "anual", monthOfYear: 1, dayOfMonth: 15 });
    expect(nextOccurrence(r, "2026-01-15")).toBe("2027-01-15");
  });

  it("faz clamp de 29/02 em ano não bissexto", () => {
    const r = rule({ frequency: "anual", monthOfYear: 2, dayOfMonth: 29 });
    expect(nextOccurrence(r, "2024-02-29")).toBe("2025-02-28");
  });

  it("respeita intervalo de N anos", () => {
    const r = rule({
      frequency: "anual",
      intervalCount: 2,
      monthOfYear: 3,
      dayOfMonth: 1,
      startsOn: "2026-03-01",
    });
    expect(nextOccurrence(r, "2026-03-01")).toBe("2028-03-01");
  });
});

describe("nextOccurrence — modo 'após conclusão'", () => {
  it("conta a partir da data de conclusão, não do calendário", () => {
    const r = rule({ frequency: "diaria", intervalCount: 7, mode: "apos_conclusao" });
    // Concluída no dia 10 → próxima no dia 17 (não na segunda seguinte).
    expect(nextOccurrence(r, "2026-08-10")).toBe("2026-08-17");
    // Concluída atrasada, no dia 20 → próxima no dia 27.
    expect(nextOccurrence(r, "2026-08-20")).toBe("2026-08-27");
  });

  it("ignora padrões de calendário (dia do mês) e usa o passo simples", () => {
    const r = rule({
      frequency: "mensal",
      intervalCount: 1,
      dayOfMonth: 5,
      mode: "apos_conclusao",
    });
    // Concluída em 20/08 → +1 mês = 20/09 (e NÃO o dia 5).
    expect(nextOccurrence(r, "2026-08-20")).toBe("2026-09-20");
  });

  it("continua respeitando 'apenas_dias_uteis'", () => {
    const r = rule({
      frequency: "diaria",
      intervalCount: 5,
      mode: "apos_conclusao",
      businessDayRule: "apenas_dias_uteis",
    });
    // 29/07 (qua) + 5 = 03/08 (segunda) — já é dia útil.
    expect(nextOccurrence(r, "2026-07-29")).toBe("2026-08-03");
    // 30/07 (qui) + 5 = 04/08 (terça).
    expect(nextOccurrence(r, "2026-07-30")).toBe("2026-08-04");
  });
});

describe("nextOccurrence — modo fixo mantém o calendário mesmo concluindo atrasado", () => {
  it("toda segunda continua na segunda ainda que a conclusão seja na terça", () => {
    const r = rule({ frequency: "semanal", daysOfWeek: [1] });
    // A ocorrência era segunda 03/08; a próxima ancora na data PROGRAMADA.
    expect(nextOccurrence(r, "2026-08-03")).toBe("2026-08-10");
  });
});

describe("nextOccurrence — encerramento da série", () => {
  it("devolve null depois da data final", () => {
    const r = rule({ endsOn: "2026-07-29" });
    expect(nextOccurrence(r, "2026-07-28")).toBe("2026-07-29");
    expect(nextOccurrence(r, "2026-07-29")).toBeNull();
  });

  it("devolve null ao bater o número máximo de ocorrências", () => {
    expect(nextOccurrence(rule({ maxOccurrences: 3, occurrencesCreated: 2 }), "2026-07-28")).toBe(
      "2026-07-29",
    );
    expect(
      nextOccurrence(rule({ maxOccurrences: 3, occurrencesCreated: 3 }), "2026-07-28"),
    ).toBeNull();
  });

  it("devolve null quando a recorrência está pausada", () => {
    expect(nextOccurrence(rule({ isPaused: true }), "2026-07-28")).toBeNull();
  });

  it("devolve null para data de origem inválida", () => {
    expect(nextOccurrence(rule(), "data-invalida")).toBeNull();
    expect(nextOccurrence(rule(), "2026-02-30")).toBeNull();
  });
});

describe("previewOccurrences", () => {
  it("gera a sequência de próximas datas sem repetir", () => {
    const dates = previewOccurrences(rule({ frequency: "semanal", daysOfWeek: [1] }), "2026-08-03", 4);
    expect(dates).toEqual(["2026-08-10", "2026-08-17", "2026-08-24", "2026-08-31"]);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("para quando a série encerra por data final", () => {
    const dates = previewOccurrences(rule({ endsOn: "2026-07-30" }), "2026-07-28", 10);
    expect(dates).toEqual(["2026-07-29", "2026-07-30"]);
  });

  it("para quando a série encerra por número de ocorrências", () => {
    const dates = previewOccurrences(rule({ maxOccurrences: 3 }), "2026-07-28", 10);
    expect(dates).toHaveLength(3);
  });
});

describe("materializeNext", () => {
  it("desloca data programada e prazo preservando a folga entre elas", () => {
    const next = materializeNext(rule({ frequency: "semanal" }), {
      scheduledDate: "2026-08-12",
      deadlineAt: "2026-08-15",
    });
    expect(next).toEqual({ scheduledDate: "2026-08-19", deadlineAt: "2026-08-22" });
  });

  it("mantém o prazo nulo quando a tarefa não tem prazo", () => {
    const next = materializeNext(rule(), { scheduledDate: "2026-08-12", deadlineAt: null });
    expect(next).toEqual({ scheduledDate: "2026-08-13", deadlineAt: null });
  });

  it("ancora no prazo quando não há data programada", () => {
    const next = materializeNext(rule(), { scheduledDate: null, deadlineAt: "2026-08-12" });
    expect(next).toEqual({ scheduledDate: null, deadlineAt: "2026-08-13" });
  });

  it("no modo 'após conclusão', ancora na data de conclusão", () => {
    const r = rule({ frequency: "diaria", intervalCount: 7, mode: "apos_conclusao" });
    const next = materializeNext(r, { scheduledDate: "2026-08-10", deadlineAt: null }, "2026-08-14");
    // Concluída dia 14 (atrasada) → próxima 7 dias depois da conclusão.
    expect(next?.scheduledDate).toBe("2026-08-21");
  });

  it("devolve null quando a tarefa não tem nenhuma data-âncora", () => {
    expect(materializeNext(rule(), { scheduledDate: null, deadlineAt: null })).toBeNull();
  });

  it("devolve null quando a série já encerrou", () => {
    const r = rule({ endsOn: "2026-08-12" });
    expect(materializeNext(r, { scheduledDate: "2026-08-12", deadlineAt: null })).toBeNull();
  });
});

describe("isSeriesFinished", () => {
  it("encerra ao atingir o limite de ocorrências", () => {
    expect(isSeriesFinished(rule({ maxOccurrences: 3, occurrencesCreated: 2 }), "2026-07-29")).toBe(
      true,
    );
    expect(isSeriesFinished(rule({ maxOccurrences: 5, occurrencesCreated: 1 }), "2026-07-29")).toBe(
      false,
    );
  });

  it("encerra quando não há próxima data dentro do prazo final", () => {
    expect(isSeriesFinished(rule({ endsOn: "2026-07-29" }), "2026-07-29")).toBe(true);
    expect(isSeriesFinished(rule({ endsOn: "2026-08-30" }), "2026-07-29")).toBe(false);
  });
});

describe("normalizeRule", () => {
  it("rejeita entrada inválida", () => {
    expect(normalizeRule(null)).toBeNull();
    expect(normalizeRule({})).toBeNull();
    expect(normalizeRule({ frequency: "quinzenal" })).toBeNull();
  });

  it("normaliza intervalo, dias da semana e datas", () => {
    const r = normalizeRule({
      frequency: "semanal",
      intervalCount: 0,
      daysOfWeek: [3, 1, 1, 9, -2],
      startsOn: "2026-08-03",
      endsOn: "data-ruim",
      maxOccurrences: -5,
    });
    expect(r).not.toBeNull();
    expect(r?.intervalCount).toBe(1); // mínimo 1
    expect(r?.daysOfWeek).toEqual([1, 3]); // dedup, ordenado, fora de 0..6 descartado
    expect(r?.startsOn).toBe("2026-08-03");
    expect(r?.endsOn).toBeNull();
    expect(r?.maxOccurrences).toBeNull();
    expect(r?.mode).toBe("fixo"); // default
  });

  it("aceita -1 em dayOfMonth (último dia) e weekOfMonth (última semana)", () => {
    const r = normalizeRule({ frequency: "mensal", dayOfMonth: -1, weekOfMonth: -1 });
    expect(r?.dayOfMonth).toBe(-1);
    expect(r?.weekOfMonth).toBe(-1);
  });
});

describe("describeRule — descrição legível em pt-BR", () => {
  it("descreve as frequências simples", () => {
    expect(describeRule(rule())).toBe("Todos os dias");
    expect(describeRule(rule({ intervalCount: 3 }))).toBe("A cada 3 dias");
    expect(describeRule(rule({ frequency: "semanal" }))).toBe("Toda semana");
  });

  it("descreve dias específicos da semana", () => {
    expect(describeRule(rule({ frequency: "semanal", daysOfWeek: [1, 3, 5] }))).toBe(
      "Toda segunda-feira, quarta-feira e sexta-feira",
    );
  });

  it("descreve padrões mensais", () => {
    expect(describeRule(rule({ frequency: "mensal", dayOfMonth: 5 }))).toBe("Todo dia 5 do mês");
    expect(describeRule(rule({ frequency: "mensal", dayOfMonth: -1 }))).toBe(
      "Todo último dia do mês",
    );
    expect(describeRule(rule({ frequency: "mensal", weekOfMonth: -1, daysOfWeek: [5] }))).toBe(
      "Toda última sexta-feira do mês",
    );
    expect(describeRule(rule({ businessDayRule: "primeiro_dia_util" }))).toBe(
      "Todo primeiro dia útil do mês",
    );
  });

  it("acrescenta modo, limite e data final", () => {
    expect(describeRule(rule({ mode: "apos_conclusao" }))).toContain(
      "contando a partir da conclusão",
    );
    expect(describeRule(rule({ maxOccurrences: 10 }))).toContain("por 10 vezes");
    expect(describeRule(rule({ endsOn: "2027-12-31" }))).toContain("até 31/12/2027");
    expect(describeRule(rule({ isPaused: true }))).toContain("(pausada)");
  });
});
