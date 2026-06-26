import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getTasksCardData } from "@/lib/dashboard/queries";
import { formatDate } from "@/lib/format";
import { Metric, CardEmpty } from "./primitives";

/** Corpo do card Tarefas & Rotinas — hoje/atrasadas/em andamento + rotinas do dia. */
export async function TasksCard({ todayIso }: { todayIso: string }) {
  const d = await getTasksCardData(todayIso);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Hoje" value={String(d.dueToday)} />
        <Metric label="Atrasadas" value={String(d.overdue)} accent={d.overdue > 0} />
        <Metric label="Em andamento" value={String(d.inProgress)} />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">
          {d.openTotal} tarefa(s) aberta(s)
        </p>
        {d.list.length === 0 ? (
          <CardEmpty>Nenhuma tarefa aberta. 🎉</CardEmpty>
        ) : (
          d.list.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{t.title}</span>
              {t.effective === "atrasada" ? (
                <Badge
                  variant="outline"
                  className="shrink-0 border-destructive/30 text-destructive"
                >
                  Atrasada
                </Badge>
              ) : t.due_date ? (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDate(t.due_date)}
                </span>
              ) : null}
            </div>
          ))
        )}
      </div>

      {d.routines.length > 0 && (
        <div className="space-y-1.5 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">Rotinas de hoje</p>
          {d.routines.map((r) => (
            <div key={r.id} className="flex items-center gap-2 text-sm">
              <span
                aria-hidden
                className={cn("size-2.5 shrink-0 rounded-full", !r.done && "opacity-40")}
                style={{ backgroundColor: r.color ?? "var(--primary)" }}
              />
              <span className={cn("truncate", r.done && "text-muted-foreground line-through")}>
                {r.icon ? `${r.icon} ` : ""}
                {r.name}
              </span>
              {r.done && (
                <span className="ml-auto text-xs text-emerald-500">feito</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
