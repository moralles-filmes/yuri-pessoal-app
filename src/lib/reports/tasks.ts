/**
 * Fase 14 — Agregação PURA do relatório de Tarefas (testada em tasks.test.ts).
 *
 * SEM efeitos colaterais: `todayIso` é SEMPRE injetado ('yyyy-MM-dd' local). Reusa o
 * "status na leitura" da Fase 09 (effectiveTaskStatus/isOverdue) — nada de regra nova.
 * Recebe linhas já buscadas e devolve agregados planos (contagens + produtividade semanal).
 */
import { addDays, format, startOfWeek } from "date-fns";
import { dateInSaoPaulo } from "@/lib/format";
import { effectiveTaskStatus, isOverdue } from "@/lib/tasks/status";
import type { TaskStoredStatus } from "@/lib/tasks/constants";

const ISO = "yyyy-MM-dd";

export type ReportTask = {
  status: TaskStoredStatus;
  due_date: string | null;
  completed_at: string | null;
};

export type WeeklyCompleted = {
  weekStart: string;
  label: string;
  completed: number;
};

export type TasksReport = {
  total: number;
  open: number;
  completed: number;
  overdue: number;
  inProgress: number;
  cancelled: number;
  /** concluídas / (concluídas + em aberto), ignorando canceladas. 0 quando não há base. */
  completionRate: number;
  weekly: WeeklyCompleted[];
  activeProjects: number;
};

/**
 * 'yyyy-MM-ddT…' ou 'yyyy-MM-dd' → 'yyyy-MM-dd'.
 *
 * `completed_at` é `timestamptz` e o PostgREST devolve em UTC — fatiar os 10 primeiros
 * caracteres daria o dia em UTC, jogando a tarefa concluída no domingo às 22h (BRT) para
 * a semana seguinte no gráfico. Data pura passa direto (não é instante, não tem fuso).
 */
function dayOf(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : dateInSaoPaulo(d);
}

export function tasksReport(params: {
  tasks: ReportTask[];
  todayIso: string;
  activeProjects: number;
  weeks?: number;
}): TasksReport {
  const { tasks, todayIso, activeProjects, weeks = 8 } = params;
  const today = new Date(`${todayIso}T00:00:00`);

  let completed = 0;
  let overdue = 0;
  let inProgress = 0;
  let cancelled = 0;
  let open = 0;

  for (const t of tasks) {
    const eff = effectiveTaskStatus(t, todayIso);
    if (t.status === "concluida") completed++;
    else if (t.status === "cancelada") cancelled++;
    else {
      open++;
      if (t.status === "em_andamento") inProgress++;
      if (isOverdue(t, todayIso) || eff === "atrasada") overdue++;
    }
  }

  // Produtividade semanal: concluídas por semana (segunda→domingo, como o resto do app).
  const weekly: WeeklyCompleted[] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const ws = startOfWeek(addDays(today, -7 * w), { weekStartsOn: 1 });
    const weekStart = format(ws, ISO);
    const weekEnd = format(addDays(ws, 6), ISO);
    let n = 0;
    for (const t of tasks) {
      const d = dayOf(t.completed_at);
      if (t.status === "concluida" && d && d >= weekStart && d <= weekEnd) n++;
    }
    weekly.push({ weekStart, label: format(ws, "dd/MM"), completed: n });
  }

  const base = completed + open;
  return {
    total: tasks.length,
    open,
    completed,
    overdue,
    inProgress,
    cancelled,
    completionRate: base ? completed / base : 0,
    weekly,
    activeProjects,
  };
}
