import { Badge } from "@/components/ui/badge";
import { getStudiesCardData } from "@/lib/dashboard/queries";
import { formatMinutes } from "@/lib/studies/constants";
import { courseIcon } from "@/components/studies/badges";
import { periodWord, type DashWindow } from "@/lib/dashboard/period";
import { Metric, CardEmpty } from "./primitives";

/** Corpo do card Estudos — em andamento, horas no período, atrasados, sequência. */
export async function StudiesCard({
  window,
  todayIso,
}: {
  window: DashWindow;
  todayIso: string;
}) {
  const d = await getStudiesCardData(todayIso, window);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Em andamento" value={String(d.inProgress)} />
        <Metric
          label={`Horas ${periodWord(window.period)}`}
          value={formatMinutes(d.minutesPeriod)}
          accent
        />
      </div>

      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/40 p-2.5 text-center text-xs">
        <div>
          <p className="font-semibold tabular-nums">{formatMinutes(d.minutesWeek)}</p>
          <p className="text-muted-foreground">semana</p>
        </div>
        <div>
          <p className="font-semibold tabular-nums">{formatMinutes(d.minutesMonth)}</p>
          <p className="text-muted-foreground">mês</p>
        </div>
        <div>
          <p className="font-semibold tabular-nums">{d.streak} 🔥</p>
          <p className="text-muted-foreground">sequência</p>
        </div>
      </div>

      {d.overdue > 0 && (
        <Badge
          variant="outline"
          className="border-amber-500/40 text-amber-600 dark:text-amber-400"
        >
          {d.overdue} estudo(s) atrasado(s)
        </Badge>
      )}

      <div className="space-y-1.5 border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground">Cursos em andamento</p>
        {d.courses.length === 0 ? (
          <CardEmpty>Nenhum curso em andamento.</CardEmpty>
        ) : (
          d.courses.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span aria-hidden>{courseIcon(c.icon, c.category)}</span>
              <span className="truncate">{c.title}</span>
              {c.overdue && (
                <span
                  aria-hidden
                  title="Atrasado"
                  className="ml-auto size-2 shrink-0 rounded-full bg-amber-500"
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
