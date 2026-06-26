import { describe, expect, it } from "vitest";
import {
  courseOverdueReason,
  courseProgress,
  minutesInRange,
  nextLesson,
  sessionDateSet,
  totalMinutes,
  type LessonLike,
  type SessionLike,
} from "@/lib/studies/progress";
import { formatMinutes, minutesToHours } from "@/lib/studies/constants";

const lesson = (
  module_position: number,
  position: number,
  is_done: boolean,
  title = `${module_position}.${position}`,
): LessonLike => ({ module_position, position, is_done, title });

describe("courseProgress", () => {
  it("curso sem aulas → 0 (não divide por zero)", () => {
    expect(courseProgress(0, 0)).toBe(0);
  });
  it("todas as aulas concluídas → 100", () => {
    expect(courseProgress(8, 8)).toBe(100);
  });
  it("metade concluída → 50", () => {
    expect(courseProgress(10, 5)).toBe(50);
  });
  it("arredonda para inteiro (1 de 3 → 33)", () => {
    expect(courseProgress(3, 1)).toBe(33);
  });
  it("nunca passa de 100 nem fica negativo", () => {
    expect(courseProgress(4, 9)).toBe(100);
    expect(courseProgress(4, -2)).toBe(0);
  });
});

describe("nextLesson", () => {
  it("retorna a primeira não concluída na ordem (módulo, aula)", () => {
    const lessons = [
      lesson(1, 0, true),
      lesson(1, 1, true),
      lesson(2, 0, false, "alvo"),
      lesson(2, 1, false),
    ];
    expect(nextLesson(lessons)?.title).toBe("alvo");
  });
  it("respeita a ordenação mesmo fora de ordem na entrada", () => {
    const lessons = [
      lesson(2, 0, false, "modulo2"),
      lesson(1, 0, false, "modulo1"),
    ];
    expect(nextLesson(lessons)?.title).toBe("modulo1");
  });
  it("todas concluídas → null", () => {
    expect(nextLesson([lesson(1, 0, true), lesson(1, 1, true)])).toBeNull();
  });
  it("sem aulas → null", () => {
    expect(nextLesson([])).toBeNull();
  });
});

describe("totalMinutes / minutesInRange (horas semana/mês)", () => {
  const sessions: SessionLike[] = [
    { session_date: "2026-06-01", duration_minutes: 30 },
    { session_date: "2026-06-10", duration_minutes: 60 },
    { session_date: "2026-06-22", duration_minutes: 45 },
    { session_date: "2026-06-26", duration_minutes: 90 },
  ];

  it("soma o total de minutos", () => {
    expect(totalMinutes(sessions)).toBe(225);
  });
  it("horas da SEMANA (janela 22→26): 45 + 90 = 135", () => {
    expect(minutesInRange(sessions, "2026-06-22", "2026-06-28")).toBe(135);
  });
  it("horas do MÊS (janela 01→30): tudo", () => {
    expect(minutesInRange(sessions, "2026-06-01", "2026-06-30")).toBe(225);
  });
  it("janela vazia → 0", () => {
    expect(minutesInRange(sessions, "2026-05-01", "2026-05-31")).toBe(0);
  });
  it("limites são inclusivos", () => {
    expect(minutesInRange(sessions, "2026-06-26", "2026-06-26")).toBe(90);
  });
});

describe("sessionDateSet", () => {
  it("colapsa múltiplas sessões do mesmo dia em uma data", () => {
    const set = sessionDateSet([
      { session_date: "2026-06-26", duration_minutes: 30 },
      { session_date: "2026-06-26", duration_minutes: 20 },
      { session_date: "2026-06-25", duration_minutes: 10 },
    ]);
    expect([...set].sort()).toEqual(["2026-06-25", "2026-06-26"]);
  });
});

describe("courseOverdueReason", () => {
  const today = "2026-06-26";
  it("não conta cursos que não estão em andamento", () => {
    expect(
      courseOverdueReason(
        { status: "pausado", target_date: "2026-01-01" },
        null,
        today,
      ),
    ).toBeNull();
  });
  it("'target' quando passou da data-alvo", () => {
    expect(
      courseOverdueReason(
        { status: "em_andamento", target_date: "2026-06-20" },
        "2026-06-25",
        today,
      ),
    ).toBe("target");
  });
  it("'inactive' quando nunca teve sessão", () => {
    expect(
      courseOverdueReason(
        { status: "em_andamento", target_date: null },
        null,
        today,
      ),
    ).toBe("inactive");
  });
  it("'inactive' quando a última sessão foi há mais de 7 dias", () => {
    expect(
      courseOverdueReason(
        { status: "em_andamento", target_date: null },
        "2026-06-18",
        today,
      ),
    ).toBe("inactive");
  });
  it("em dia quando estudou recentemente e sem data-alvo vencida", () => {
    expect(
      courseOverdueReason(
        { status: "em_andamento", target_date: "2026-12-31" },
        "2026-06-24",
        today,
      ),
    ).toBeNull();
  });
});

describe("formatMinutes / minutesToHours", () => {
  it("formata pt-BR amigável", () => {
    expect(formatMinutes(0)).toBe("0min");
    expect(formatMinutes(45)).toBe("45min");
    expect(formatMinutes(60)).toBe("1h");
    expect(formatMinutes(200)).toBe("3h 20min");
  });
  it("negativos viram 0min", () => {
    expect(formatMinutes(-30)).toBe("0min");
  });
  it("converte minutos em horas com 1 casa", () => {
    expect(minutesToHours(200)).toBe(3.3);
    expect(minutesToHours(0)).toBe(0);
  });
});
