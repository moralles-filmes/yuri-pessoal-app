import Link from "next/link";
import { getAgendaCardData } from "@/lib/dashboard/queries";
import { eventColor, eventDotStyle } from "@/lib/calendar/colors";
import { emBrasilia, eventTimeRange, longDateLabel } from "@/lib/calendar/format";
import { relativeDayLabel } from "@/lib/calendar/upcoming";
import { dateInSaoPaulo } from "@/lib/format";
import { rotuloDoDia } from "@/lib/dashboard/rotulos";
import { periodWord, type DashWindow } from "@/lib/dashboard/period";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Quadro } from "./primitives";

/** Corpo do card Agenda — contagem do dia/período + próximos compromissos. */
export async function AgendaCard({
  window,
  now,
}: {
  window: DashWindow;
  now: Date;
}) {
  const d = await getAgendaCardData(window, now);
  const diaDeHoje = rotuloDoDia(dateInSaoPaulo(now));

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Quadro valor={String(d.countToday)} rotulo={`Eventos hoje (${diaDeHoje})`} />
        <Quadro
          valor={String(d.countWindow)}
          rotulo={`Eventos ${periodWord(window.period)}`}
        />
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Próximos compromissos</p>
        {d.upcoming.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-4 text-center">
            <p className="text-sm text-muted-foreground">Sem compromissos próximos.</p>
            <Link
              href="/agenda"
              className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            >
              Adicionar evento
            </Link>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {d.upcoming.map((ev) => {
              const rel = relativeDayLabel(ev.start, now);
              return (
                <li key={ev.id}>
                  <Link
                    href={`/agenda?view=dia&date=${dateInSaoPaulo(ev.start)}`}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted"
                  >
                    <span
                      aria-hidden
                      className="size-2.5 shrink-0 rounded-full"
                      style={eventDotStyle(eventColor(ev))}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{ev.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {rel ?? longDateLabel(emBrasilia(ev.start))} ·{" "}
                        {eventTimeRange(ev.start, ev.end, ev.allDay)}
                      </p>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
