import { describe, expect, it } from "vitest";
import { tasksReport, type ReportTask } from "@/lib/reports/tasks";

const TODAY = "2026-06-26"; // sexta-feira

function t(over: Partial<ReportTask>): ReportTask {
  return { status: "pendente", due_date: null, completed_at: null, ...over };
}

describe("tasksReport", () => {
  it("conta abertas, concluídas, atrasadas, em andamento e canceladas", () => {
    const r = tasksReport({
      todayIso: TODAY,
      activeProjects: 3,
      tasks: [
        t({ status: "pendente", due_date: "2026-06-30" }), // aberta, no prazo
        t({ status: "pendente", due_date: "2026-06-20" }), // aberta, atrasada
        t({ status: "em_andamento", due_date: "2026-06-10" }), // aberta, atrasada, em andamento
        t({ status: "concluida", completed_at: "2026-06-25T10:00:00+00:00" }),
        t({ status: "cancelada" }),
      ],
    });
    expect(r.total).toBe(5);
    expect(r.open).toBe(3);
    expect(r.completed).toBe(1);
    expect(r.overdue).toBe(2);
    expect(r.inProgress).toBe(1);
    expect(r.cancelled).toBe(1);
    expect(r.activeProjects).toBe(3);
  });

  it("taxa de conclusão = concluídas / (concluídas + abertas), ignorando canceladas", () => {
    const r = tasksReport({
      todayIso: TODAY,
      activeProjects: 0,
      tasks: [
        t({ status: "concluida", completed_at: "2026-06-24T08:00:00Z" }),
        t({ status: "concluida", completed_at: "2026-06-24T09:00:00Z" }),
        t({ status: "pendente", due_date: "2026-07-10" }),
        t({ status: "pendente", due_date: "2026-06-01" }), // atrasada (ainda aberta)
        t({ status: "cancelada" }), // não entra na base
      ],
    });
    // 2 concluídas / (2 + 2 abertas) = 0.5
    expect(r.completionRate).toBeCloseTo(0.5, 5);
  });

  it("não quebra quando não há tarefas (taxa 0, semanas zeradas)", () => {
    const r = tasksReport({ todayIso: TODAY, activeProjects: 0, tasks: [], weeks: 4 });
    expect(r.completionRate).toBe(0);
    expect(r.weekly).toHaveLength(4);
    expect(r.weekly.every((w) => w.completed === 0)).toBe(true);
  });

  it("produtividade semanal conta concluídas pela semana do completed_at (segunda→domingo)", () => {
    // Semana atual (segunda 22/06 a domingo 28/06) deve capturar 25/06.
    const r = tasksReport({
      todayIso: TODAY,
      activeProjects: 0,
      weeks: 2,
      tasks: [
        t({ status: "concluida", completed_at: "2026-06-25T12:00:00Z" }), // semana atual
        t({ status: "concluida", completed_at: "2026-06-16T12:00:00Z" }), // semana anterior
        t({ status: "concluida", completed_at: "2026-06-15T12:00:00Z" }), // semana anterior (segunda)
      ],
    });
    expect(r.weekly).toHaveLength(2);
    const semanaAnterior = r.weekly[0];
    const semanaAtual = r.weekly[1];
    expect(semanaAnterior.weekStart).toBe("2026-06-15");
    expect(semanaAnterior.completed).toBe(2);
    expect(semanaAtual.weekStart).toBe("2026-06-22");
    expect(semanaAtual.completed).toBe(1);
  });
});
