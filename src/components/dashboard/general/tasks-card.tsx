import { cn } from "@/lib/utils";
import { getTasksCardData } from "@/lib/dashboard/queries";
import { Quadro } from "./primitives";

/** Corpo do card Tarefas & Rotinas — quadros de hoje/atrasadas/em andamento + rotinas do dia. */
export async function TasksCard({ todayIso }: { todayIso: string }) {
  const d = await getTasksCardData(todayIso);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Quadro valor={String(d.dueToday)} rotulo="Hoje" />
        <Quadro valor={String(d.overdue)} rotulo="Atrasadas" />
        <Quadro valor={String(d.inProgress)} rotulo="Em andamento" />
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
