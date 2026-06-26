import { describe, expect, it } from "vitest";
import {
  compareTasks,
  effectiveTaskStatus,
  isDueToday,
  isOpen,
  isOverdue,
  type TaskLike,
} from "@/lib/tasks/status";
import type { TaskPriority } from "@/lib/tasks/constants";

const TODAY = "2026-06-26";

describe("isOverdue / effectiveTaskStatus", () => {
  it("vencida no passado e ainda aberta → atrasada", () => {
    const t: TaskLike = { status: "pendente", due_date: "2026-06-20" };
    expect(isOverdue(t, TODAY)).toBe(true);
    expect(effectiveTaskStatus(t, TODAY)).toBe("atrasada");
  });
  it("vence hoje não é atrasada", () => {
    const t: TaskLike = { status: "em_andamento", due_date: TODAY };
    expect(isOverdue(t, TODAY)).toBe(false);
    expect(effectiveTaskStatus(t, TODAY)).toBe("em_andamento");
  });
  it("concluída/cancelada nunca é atrasada", () => {
    expect(
      isOverdue({ status: "concluida", due_date: "2020-01-01" }, TODAY),
    ).toBe(false);
    expect(
      effectiveTaskStatus({ status: "cancelada", due_date: "2020-01-01" }, TODAY),
    ).toBe("cancelada");
  });
  it("sem data de vencimento nunca é atrasada", () => {
    expect(isOverdue({ status: "pendente", due_date: null }, TODAY)).toBe(false);
  });
});

describe("isDueToday / isOpen", () => {
  it("isDueToday só para abertas com due_date = hoje", () => {
    expect(isDueToday({ status: "pendente", due_date: TODAY }, TODAY)).toBe(true);
    expect(isDueToday({ status: "concluida", due_date: TODAY }, TODAY)).toBe(false);
  });
  it("isOpen para pendente/em_andamento", () => {
    expect(isOpen({ status: "pendente", due_date: null })).toBe(true);
    expect(isOpen({ status: "em_andamento", due_date: null })).toBe(true);
    expect(isOpen({ status: "concluida", due_date: null })).toBe(false);
  });
});

describe("compareTasks", () => {
  type T = TaskLike & { priority: TaskPriority; position?: number | null };
  it("atrasadas vêm antes das no prazo", () => {
    const overdue: T = { status: "pendente", due_date: "2026-06-20", priority: "baixa" };
    const future: T = { status: "pendente", due_date: "2026-12-01", priority: "urgente" };
    expect(compareTasks(overdue, future, TODAY)).toBeLessThan(0);
  });
  it("desempata por vencimento mais cedo, depois prioridade", () => {
    const a: T = { status: "pendente", due_date: "2026-07-01", priority: "baixa" };
    const b: T = { status: "pendente", due_date: "2026-07-05", priority: "urgente" };
    expect(compareTasks(a, b, TODAY)).toBeLessThan(0); // a vence antes
    const c: T = { status: "pendente", due_date: "2026-07-01", priority: "media" };
    expect(compareTasks(a, c, TODAY)).toBeGreaterThan(0); // mesma data, c mais prioritária
  });
  it("tarefas sem data vão para o fim", () => {
    const dated: T = { status: "pendente", due_date: "2026-07-01", priority: "baixa" };
    const undated: T = { status: "pendente", due_date: null, priority: "urgente" };
    expect(compareTasks(dated, undated, TODAY)).toBeLessThan(0);
  });
});
