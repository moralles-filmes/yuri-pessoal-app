import { describe, expect, it } from "vitest";
import {
  daysBetween,
  effectiveStatus,
  endsNextDay,
  endTime,
  hasNoDate,
  isClosed,
  isDeadlineNear,
  isDueToday,
  isOverdue,
  isUpcoming,
  subtaskProgress,
  trimTime,
  type TodoStatusInput,
} from "./status";

const HOJE = "2026-07-28";

function task(patch: Partial<TodoStatusInput> = {}): TodoStatusInput {
  return { status: "pendente", scheduledDate: null, deadlineAt: null, ...patch };
}

describe("isClosed", () => {
  it("considera concluída, cancelada e arquivada como fechadas", () => {
    expect(isClosed(task({ status: "concluida" }))).toBe(true);
    expect(isClosed(task({ status: "cancelada" }))).toBe(true);
    expect(isClosed(task({ status: "arquivada" }))).toBe(true);
  });

  it("pendente e em andamento seguem abertas", () => {
    expect(isClosed(task({ status: "pendente" }))).toBe(false);
    expect(isClosed(task({ status: "em_andamento" }))).toBe(false);
  });
});

describe("isOverdue — atraso derivado, nunca gravado", () => {
  it("atrasa pela data programada vencida", () => {
    expect(isOverdue(task({ scheduledDate: "2026-07-27" }), HOJE)).toBe(true);
  });

  it("atrasa pelo prazo final vencido, mesmo com data programada futura", () => {
    expect(
      isOverdue(task({ scheduledDate: "2026-07-30", deadlineAt: "2026-07-27" }), HOJE),
    ).toBe(true);
  });

  it("não atrasa quando a data é hoje ou futura", () => {
    expect(isOverdue(task({ scheduledDate: HOJE }), HOJE)).toBe(false);
    expect(isOverdue(task({ scheduledDate: "2026-07-29" }), HOJE)).toBe(false);
  });

  it("nunca atrasa tarefa já fechada", () => {
    expect(
      isOverdue(task({ status: "concluida", scheduledDate: "2026-01-01" }), HOJE),
    ).toBe(false);
    expect(
      isOverdue(task({ status: "cancelada", scheduledDate: "2026-01-01" }), HOJE),
    ).toBe(false);
  });

  it("tarefa sem data nunca atrasa", () => {
    expect(isOverdue(task(), HOJE)).toBe(false);
  });
});

describe("isDueToday", () => {
  it("reconhece data programada ou prazo de hoje", () => {
    expect(isDueToday(task({ scheduledDate: HOJE }), HOJE)).toBe(true);
    expect(isDueToday(task({ deadlineAt: HOJE }), HOJE)).toBe(true);
  });

  it("ignora tarefa fechada e datas de outros dias", () => {
    expect(isDueToday(task({ status: "concluida", scheduledDate: HOJE }), HOJE)).toBe(false);
    expect(isDueToday(task({ scheduledDate: "2026-07-29" }), HOJE)).toBe(false);
  });
});

describe("isUpcoming — a data mais próxima é que manda", () => {
  it("é futura quando ambas as datas são futuras", () => {
    expect(
      isUpcoming(task({ scheduledDate: "2026-07-30", deadlineAt: "2026-08-02" }), HOJE),
    ).toBe(true);
  });

  it("não é futura quando o prazo vence hoje", () => {
    expect(
      isUpcoming(task({ scheduledDate: "2026-07-30", deadlineAt: HOJE }), HOJE),
    ).toBe(false);
  });

  it("tarefa sem data não é futura", () => {
    expect(isUpcoming(task(), HOJE)).toBe(false);
  });
});

describe("hasNoDate", () => {
  it("detecta ausência das duas datas", () => {
    expect(hasNoDate(task())).toBe(true);
    expect(hasNoDate(task({ scheduledDate: HOJE }))).toBe(false);
    expect(hasNoDate(task({ deadlineAt: HOJE }))).toBe(false);
  });
});

describe("effectiveStatus", () => {
  it("devolve 'atrasada' para tarefa aberta com data vencida", () => {
    expect(effectiveStatus(task({ scheduledDate: "2026-07-01" }), HOJE)).toBe("atrasada");
  });

  it("devolve o status gravado quando não há atraso", () => {
    expect(effectiveStatus(task({ status: "em_andamento" }), HOJE)).toBe("em_andamento");
    expect(effectiveStatus(task({ status: "concluida", scheduledDate: "2026-01-01" }), HOJE)).toBe(
      "concluida",
    );
  });
});

describe("isDeadlineNear", () => {
  it("avisa quando o prazo cai dentro da janela", () => {
    expect(isDeadlineNear(task({ deadlineAt: "2026-07-30" }), HOJE)).toBe(true);
    expect(isDeadlineNear(task({ deadlineAt: HOJE }), HOJE)).toBe(true);
  });

  it("não avisa fora da janela nem para prazo já vencido", () => {
    expect(isDeadlineNear(task({ deadlineAt: "2026-08-15" }), HOJE)).toBe(false);
    expect(isDeadlineNear(task({ deadlineAt: "2026-07-01" }), HOJE)).toBe(false);
  });

  it("respeita uma janela customizada", () => {
    expect(isDeadlineNear(task({ deadlineAt: "2026-08-05" }), HOJE, 10)).toBe(true);
  });
});

describe("daysBetween", () => {
  it("conta dias inteiros, inclusive virando mês e ano", () => {
    expect(daysBetween("2026-07-28", "2026-07-31")).toBe(3);
    expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetween("2026-07-31", "2026-07-28")).toBe(-3);
    expect(daysBetween("2024-02-28", "2024-03-01")).toBe(2); // ano bissexto
  });
});

describe("subtaskProgress", () => {
  it("calcula o percentual concluído", () => {
    expect(subtaskProgress(1, 4)).toBe(25);
    expect(subtaskProgress(4, 4)).toBe(100);
    expect(subtaskProgress(0, 3)).toBe(0);
  });

  it("devolve null sem subtarefas (0% seria enganoso)", () => {
    expect(subtaskProgress(0, 0)).toBeNull();
  });

  it("nunca passa de 100%", () => {
    expect(subtaskProgress(9, 4)).toBe(100);
  });
});

describe("endTime / endsNextDay", () => {
  it("soma a duração ao horário inicial", () => {
    expect(endTime("09:00", 30)).toBe("09:30");
    expect(endTime("14:00", 120)).toBe("16:00");
  });

  it("passa da meia-noite devolvendo o horário do dia seguinte", () => {
    expect(endTime("23:30", 60)).toBe("00:30");
    expect(endsNextDay("23:30", 60)).toBe(true);
    expect(endsNextDay("09:00", 60)).toBe(false);
  });

  it("devolve null sem horário ou sem duração", () => {
    expect(endTime(null, 30)).toBeNull();
    expect(endTime("09:00", null)).toBeNull();
    expect(endTime("09:00", 0)).toBeNull();
  });
});

describe("trimTime", () => {
  it("corta os segundos do time do Postgres", () => {
    expect(trimTime("09:30:00")).toBe("09:30");
    expect(trimTime("09:30")).toBe("09:30");
    expect(trimTime(null)).toBeNull();
  });
});
