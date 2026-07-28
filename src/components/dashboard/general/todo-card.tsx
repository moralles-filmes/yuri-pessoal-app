/**
 * Fase 15 — Card do TO-DO no Dashboard Geral (Server Component).
 *
 * Mostra o pulso do dia: pendentes, o que vence hoje, atrasadas, urgentes, progresso da
 * semana e as próximas tarefas com link direto. As ações rápidas (concluir/adiar) ficam
 * no módulo — o card é de leitura, coerente com os demais cards do dashboard.
 */
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";
import { hojeISO } from "@/lib/format";
import { getTodoProjects, getTodoTasks, summarizeTodo } from "@/lib/todo/queries";
import { addDaysIso, weekdayOf } from "@/lib/todo/recurrence";
import { effectiveStatus, isDueToday, isOverdue, isUpcoming } from "@/lib/todo/status";
import { TODO_PRIORITY_SHORT } from "@/lib/todo/constants";
import { Metric, CardEmpty } from "./primitives";

export async function TodoCard({ todayIso }: { todayIso: string }) {
  const today = todayIso || hojeISO();
  const [tasks, projects] = await Promise.all([getTodoTasks(), getTodoProjects(today)]);

  const weekStartIso = addDaysIso(today, -weekdayOf(today));
  const weekEndIso = addDaysIso(weekStartIso, 6);
  const summary = summarizeTodo(tasks, projects, today, weekStartIso, weekEndIso);

  // Fila do dia: atrasadas primeiro, depois as de hoje, depois as próximas.
  const open = tasks.filter((t) => t.status === "pendente" || t.status === "em_andamento");
  const fila = [
    ...open.filter((t) => isOverdue(t, today)),
    ...open.filter((t) => isDueToday(t, today)),
    ...open.filter((t) => isUpcoming(t, today)),
  ]
    // Dentro de cada faixa, prioridade manda (P1 primeiro).
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 5);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Hoje" value={String(summary.dueToday)} />
        <Metric label="Atrasadas" value={String(summary.overdue)} accent={summary.overdue > 0} />
        <Metric label="Urgentes (P1)" value={String(summary.p1)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Metric label="Concluídas hoje" value={String(summary.completedToday)} />
        <Metric
          label="Conclusão na semana"
          value={`${summary.weeklyCompletionRate}%`}
          hint={`${summary.pending} pendente(s) no total`}
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">Próximas tarefas</p>
        {fila.length === 0 ? (
          <CardEmpty>Nada pendente. Aproveite o dia. 🎉</CardEmpty>
        ) : (
          fila.map((task) => {
            const status = effectiveStatus(task, today);
            const data = task.scheduledDate ?? task.deadlineAt;
            const link = task.projectId
              ? `/todo?v=projeto&id=${task.projectId}&task=${task.id}`
              : `/todo?v=todas&task=${task.id}`;
            return (
              <div key={task.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={link} className="min-w-0 flex-1 truncate hover:underline">
                  <span className="mr-1.5 text-xs text-muted-foreground tabular-nums">
                    {TODO_PRIORITY_SHORT[task.priority]}
                  </span>
                  {task.title}
                </Link>
                {status === "atrasada" ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-destructive/30 text-destructive"
                  >
                    Atrasada
                  </Badge>
                ) : data ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {data === today ? "Hoje" : formatDate(data)}
                  </span>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      {summary.activeProjects > 0 && (
        <p className="border-t pt-3 text-xs text-muted-foreground">
          {summary.activeProjects} projeto(s) ativo(s) · {summary.thisWeek} tarefa(s) nesta
          semana
        </p>
      )}
    </div>
  );
}
