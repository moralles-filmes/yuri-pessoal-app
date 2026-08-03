import { describe, expect, it } from "vitest";
import {
  addDaysIso,
  diffDaysIso,
  eachDayIso,
  endOfMonthIso,
  isDateIso,
  isWithin,
  longDateLabel,
  minutesToTime,
  monthGrid,
  monthLabel,
  relativeDayLabel,
  shortDateLabel,
  shortTime,
  startOfMonthIso,
  startOfWeekIso,
  timeToMinutes,
  weekDays,
  weekdayOf,
} from "./calendar";

describe("weekdayOf", () => {
  it("usa 0 = domingo, como habits.weekdays", () => {
    expect(weekdayOf("2026-08-02")).toBe(0); // domingo
    expect(weekdayOf("2026-08-03")).toBe(1); // segunda
    expect(weekdayOf("2026-08-08")).toBe(6); // sábado
  });

  it("devolve -1 para data inválida em vez de fingir um dia", () => {
    expect(weekdayOf("2026-02-31")).toBe(-1);
    expect(weekdayOf("nada")).toBe(-1);
    expect(weekdayOf("")).toBe(-1);
  });
});

describe("addDaysIso — viradas", () => {
  it("vira o mês", () => {
    expect(addDaysIso("2026-08-31", 1)).toBe("2026-09-01");
    expect(addDaysIso("2026-09-01", -1)).toBe("2026-08-31");
  });

  it("vira o ano", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDaysIso("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("trata fevereiro em ano bissexto e não bissexto", () => {
    expect(addDaysIso("2028-02-28", 1)).toBe("2028-02-29"); // 2028 é bissexto
    expect(addDaysIso("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDaysIso("2100-02-28", 1)).toBe("2100-03-01"); // século não divisível por 400
    expect(addDaysIso("2000-02-28", 1)).toBe("2000-02-29");
  });
});

describe("diffDaysIso", () => {
  it("conta dias inteiros nos dois sentidos", () => {
    expect(diffDaysIso("2026-08-03", "2026-08-10")).toBe(7);
    expect(diffDaysIso("2026-08-10", "2026-08-03")).toBe(-7);
    expect(diffDaysIso("2026-08-03", "2026-08-03")).toBe(0);
  });

  it("atravessa a virada do ano", () => {
    expect(diffDaysIso("2026-12-30", "2027-01-02")).toBe(3);
  });
});

describe("isWithin — período com fim em aberto", () => {
  it("inclui as bordas", () => {
    expect(isWithin("2026-08-01", "2026-08-01", "2026-08-31")).toBe(true);
    expect(isWithin("2026-08-31", "2026-08-01", "2026-08-31")).toBe(true);
  });

  it("exclui fora do intervalo", () => {
    expect(isWithin("2026-07-31", "2026-08-01", "2026-08-31")).toBe(false);
    expect(isWithin("2026-09-01", "2026-08-01", "2026-08-31")).toBe(false);
  });

  it("fim nulo vale para sempre", () => {
    expect(isWithin("2099-01-01", "2026-08-01", null)).toBe(true);
    expect(isWithin("2020-01-01", "2026-08-01", null)).toBe(false);
  });
});

describe("semana", () => {
  it("começa na segunda por padrão", () => {
    expect(startOfWeekIso("2026-08-05")).toBe("2026-08-03"); // quarta → segunda
    expect(startOfWeekIso("2026-08-03")).toBe("2026-08-03");
    expect(startOfWeekIso("2026-08-09")).toBe("2026-08-03"); // domingo fecha a semana
  });

  it("aceita semana começando no domingo", () => {
    expect(startOfWeekIso("2026-08-05", 0)).toBe("2026-08-02");
    expect(startOfWeekIso("2026-08-09", 0)).toBe("2026-08-09");
  });

  it("weekDays devolve os 7 dias em ordem", () => {
    expect(weekDays("2026-08-05")).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
      "2026-08-06",
      "2026-08-07",
      "2026-08-08",
      "2026-08-09",
    ]);
  });

  it("atravessa a virada do mês", () => {
    expect(weekDays("2026-09-01")).toEqual([
      "2026-08-31",
      "2026-09-01",
      "2026-09-02",
      "2026-09-03",
      "2026-09-04",
      "2026-09-05",
      "2026-09-06",
    ]);
  });
});

describe("mês", () => {
  it("acha o primeiro e o último dia", () => {
    expect(startOfMonthIso("2026-08-17")).toBe("2026-08-01");
    expect(endOfMonthIso("2026-08-17")).toBe("2026-08-31");
    expect(endOfMonthIso("2026-02-10")).toBe("2026-02-28");
    expect(endOfMonthIso("2028-02-10")).toBe("2028-02-29");
    expect(endOfMonthIso("2026-04-10")).toBe("2026-04-30");
  });

  it("monta a grade com semanas completas", () => {
    const grid = monthGrid("2026-08-15");
    expect(grid[0][0]).toBe("2026-07-27"); // segunda anterior
    expect(grid.every((week) => week.length === 7)).toBe(true);
    const last = grid[grid.length - 1];
    expect(last[6] >= "2026-08-31").toBe(true);
  });

  it("cobre o mês inteiro na virada do ano", () => {
    const grid = monthGrid("2026-12-10");
    const dias = grid.flat();
    expect(dias).toContain("2026-12-01");
    expect(dias).toContain("2026-12-31");
  });
});

describe("eachDayIso", () => {
  it("inclui as duas pontas", () => {
    expect(eachDayIso("2026-08-03", "2026-08-05")).toEqual([
      "2026-08-03",
      "2026-08-04",
      "2026-08-05",
    ]);
  });

  it("devolve vazio quando o fim vem antes do início", () => {
    expect(eachDayIso("2026-08-05", "2026-08-03")).toEqual([]);
  });
});

describe("horário como minutos do dia", () => {
  it("converte 'HH:mm:ss' e 'HH:mm'", () => {
    expect(timeToMinutes("12:30:00")).toBe(750);
    expect(timeToMinutes("07:00")).toBe(420);
    expect(timeToMinutes("00:00")).toBe(0);
    expect(timeToMinutes("23:59")).toBe(1439);
  });

  it("devolve nulo para ausência e para hora inválida", () => {
    expect(timeToMinutes(null)).toBeNull();
    expect(timeToMinutes("")).toBeNull();
    expect(timeToMinutes("25:00")).toBeNull();
    expect(timeToMinutes("12:99")).toBeNull();
  });

  it("volta para texto", () => {
    expect(minutesToTime(750)).toBe("12:30");
    expect(minutesToTime(0)).toBe("00:00");
    expect(shortTime("19:30:00")).toBe("19:30");
    expect(shortTime(null)).toBe("");
  });
});

describe("rótulos — formatados a partir do TEXTO, sem fuso", () => {
  it("data por extenso", () => {
    expect(longDateLabel("2026-08-03")).toBe("3 de agosto de 2026");
    expect(monthLabel("2026-12-01")).toBe("dezembro de 2026");
    expect(shortDateLabel("2026-08-03")).toBe("03/08");
  });

  it("relativo com 'hoje' injetado", () => {
    expect(relativeDayLabel("2026-08-03", "2026-08-03")).toBe("Hoje");
    expect(relativeDayLabel("2026-08-02", "2026-08-03")).toBe("Ontem");
    expect(relativeDayLabel("2026-08-04", "2026-08-03")).toBe("Amanhã");
    expect(relativeDayLabel("2026-08-10", "2026-08-03")).toBe("10 de agosto de 2026");
  });

  it("relativo funciona na virada do ano", () => {
    expect(relativeDayLabel("2026-12-31", "2027-01-01")).toBe("Ontem");
    expect(relativeDayLabel("2027-01-01", "2026-12-31")).toBe("Amanhã");
  });
});

describe("isDateIso", () => {
  it("só aceita o formato de data pura", () => {
    expect(isDateIso("2026-08-03")).toBe(true);
    expect(isDateIso("2026-08-03T10:00:00Z")).toBe(false);
    expect(isDateIso("03/08/2026")).toBe(false);
    expect(isDateIso(null)).toBe(false);
  });
});
