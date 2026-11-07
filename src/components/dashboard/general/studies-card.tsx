import { Badge } from "@/components/ui/badge";
import { getStudiesCardData } from "@/lib/dashboard/queries";
import { formatMinutes } from "@/lib/studies/constants";
import { courseIcon } from "@/components/studies/badges";
import { periodWord, type DashWindow } from "@/lib/dashboard/period";
import { Quadro, CardEmpty } from "./primitives";

/** Corpo do card Estudos — quadros de em andamento, horas no período e atrasados. */
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
      <div className="grid grid-cols-3 gap-2">
        <Quadro valor={String(d.inProgress)} rotulo="Em andamento" />
        <Quadro
          valor={formatMinutes(d.minutesPeriod)}
          rotulo={`Horas ${periodWord(window.period)}`}
        />
        <Quadro valor={String(d.overdue)} rotulo="Atrasados" tom="ambar" />
      </div>

      <div className="space-y-1.5 border-t pt-3">
        <p className="text-xs font-medium text-muted-foreground">Cursos em andamento</p>
        {d.courses.length === 0 ? (
          <CardEmpty>Nenhum curso em andamento.</CardEmpty>
        ) : (
          d.courses.map((c) => (
            <div key={c.id} className="flex items-center gap-2 text-sm">
              <span aria-hidden>{courseIcon(c.icon, c.category)}</span>
              <span className="min-w-0 truncate">{c.title}</span>
              {c.overdue && (
                <Badge
                  variant="outline"
                  className="ml-auto shrink-0 border-amber-500/40 text-amber-600 dark:text-amber-400"
                >
                  atrasado
                </Badge>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
