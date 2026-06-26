import { parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { HabitHeatCell } from "@/types/database";

/** Classe de preenchimento por intensidade (fração de hábitos do dia concluídos). */
function cellClass(cell: HabitHeatCell): string {
  if (cell.scheduled === 0) return "bg-muted/40";
  if (cell.rate === 0) return "bg-muted";
  if (cell.rate <= 0.34) return "bg-primary/30";
  if (cell.rate <= 0.67) return "bg-primary/55";
  if (cell.rate < 1) return "bg-primary/80";
  return "bg-primary";
}

const LEGEND = [
  { label: "0%", className: "bg-muted" },
  { label: "—", className: "bg-primary/30" },
  { label: "—", className: "bg-primary/55" },
  { label: "—", className: "bg-primary/80" },
  { label: "100%", className: "bg-primary" },
];

/**
 * Heatmap (estilo "contribuições") da consistência diária: cada coluna é uma semana,
 * cada linha um dia da semana (dom→sáb). Intensidade = fração dos hábitos do dia
 * concluídos. `cells` vem em ordem cronológica (mais antigo → hoje).
 */
export function HabitHeatmap({ cells }: { cells: HabitHeatCell[] }) {
  if (cells.length === 0) return null;
  const firstWeekday = parseISO(cells[0].date).getDay();
  const pad = Array.from({ length: firstWeekday }, (_, i) => i);

  return (
    <div className="space-y-3">
      <div
        className="grid grid-flow-col grid-rows-7 gap-1"
        style={{ gridAutoColumns: "minmax(0, 1fr)" }}
      >
        {pad.map((i) => (
          <span key={`pad-${i}`} className="aspect-square rounded-[3px]" />
        ))}
        {cells.map((cell) => (
          <span
            key={cell.date}
            title={
              cell.scheduled === 0
                ? `${formatDate(cell.date)} — sem hábitos`
                : `${formatDate(cell.date)} — ${cell.done}/${cell.scheduled} concluído(s)`
            }
            className={cn(
              "aspect-square rounded-[3px] ring-1 ring-inset ring-border/40",
              cellClass(cell),
            )}
          />
        ))}
      </div>
      <div className="flex items-center justify-end gap-1.5 text-xs text-muted-foreground">
        <span>Menos</span>
        {LEGEND.map((l, i) => (
          <span
            key={i}
            className={cn("size-3 rounded-[3px] ring-1 ring-inset ring-border/40", l.className)}
          />
        ))}
        <span>Mais</span>
      </div>
    </div>
  );
}
