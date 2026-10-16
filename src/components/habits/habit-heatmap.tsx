import { parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { ehHoje, textoDaCelula } from "@/components/habits/rotulos-acessiveis";
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

/**
 * REDESIGN-07-B · D2 — o estado deixa de depender só da COR.
 * - Dia sem hábito agendado não é 0%: perde o preenchimento e ganha contorno TRACEJADO (forma).
 * - Hoje ganha um ANEL (forma) e `aria-current="date"`.
 * - Cada célula leva o texto do estado (`sr-only`); o `title` continua para o mouse.
 * - A legenda mostra os rótulos que antes existiam só no código.
 * As faixas de `cellClass` NÃO mudam.
 */
const CELULA = "aspect-square rounded-[3px]";
const SEM_HABITOS = "border border-dashed border-muted-foreground/50";
const PREENCHIDA = "ring-1 ring-inset ring-border/40";
const ANEL_HOJE = "ring-2 ring-foreground ring-offset-1 ring-offset-card";

const LEGENDA = [
  { rotulo: "Sem hábitos", className: SEM_HABITOS },
  { rotulo: "0%", className: cn(PREENCHIDA, "bg-muted") },
  { rotulo: "até 34%", className: cn(PREENCHIDA, "bg-primary/30") },
  { rotulo: "até 67%", className: cn(PREENCHIDA, "bg-primary/55") },
  { rotulo: "até 99%", className: cn(PREENCHIDA, "bg-primary/80") },
  { rotulo: "100%", className: cn(PREENCHIDA, "bg-primary") },
  { rotulo: "Hoje", className: ANEL_HOJE },
];

/**
 * Heatmap (estilo "contribuições") da consistência diária: cada coluna é uma semana,
 * cada linha um dia da semana (dom→sáb). Intensidade = fração dos hábitos do dia
 * concluídos. `cells` vem em ordem cronológica (mais antigo → hoje). `hoje` é o
 * `todayIso` do servidor — nunca "a última célula".
 */
export function HabitHeatmap({ cells, hoje }: { cells: HabitHeatCell[]; hoje: string }) {
  if (cells.length === 0) return null;
  const firstWeekday = parseISO(cells[0].date).getDay();
  const pad = Array.from({ length: firstWeekday }, (_, i) => i);

  return (
    <div className="space-y-3">
      <ol
        aria-label="Consistência diária das últimas 15 semanas"
        className="grid grid-flow-col grid-rows-7 gap-1"
        style={{ gridAutoColumns: "minmax(0, 1fr)" }}
      >
        {pad.map((i) => (
          <li key={`pad-${i}`} aria-hidden="true" className={CELULA} />
        ))}
        {cells.map((cell) => {
          const eHoje = ehHoje(cell.date, hoje);
          return (
            <li
              key={cell.date}
              title={textoDaCelula(cell, hoje)}
              aria-current={eHoje ? "date" : undefined}
              className={cn(
                CELULA,
                cell.scheduled === 0 ? SEM_HABITOS : cn(PREENCHIDA, cellClass(cell)),
                eHoje && ANEL_HOJE,
              )}
            >
              <span className="sr-only">{textoDaCelula(cell, hoje)}</span>
            </li>
          );
        })}
      </ol>
      <ul
        aria-label="Legenda"
        className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5 text-xs text-muted-foreground"
      >
        {LEGENDA.map((l) => (
          <li key={l.rotulo} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={cn("size-3 rounded-[3px]", l.className)} />
            {l.rotulo}
          </li>
        ))}
      </ul>
    </div>
  );
}
