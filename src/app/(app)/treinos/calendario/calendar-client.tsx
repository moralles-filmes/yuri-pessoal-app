"use client";

/**
 * Fase 17-B — Treinos · Calendário de planejamento (cliente).
 *
 * Três visões (semana, mês, lista), arrastar para reagendar, duplicar semana, aplicar programa,
 * marcar descanso e registrar justificativa.
 *
 * ⛔ TRÊS REGRAS QUE ESTA TELA CUMPRE:
 *
 * 1. **"Atrasado" e "hoje" nunca vêm do banco.** Saem de `derivePlannedStatus(entry, hoje)`,
 *    com o `hoje` que o SERVIDOR calculou em Brasília. O relógio do aparelho do usuário não
 *    decide que dia é hoje.
 * 2. **Reagendar preserva a data original.** Quem decide o que guardar é `rescheduleEntry`
 *    (pura, testada); a tela mostra "era 03/08" quando isso aconteceu.
 * 3. **"Concluído" não existe aqui.** Quem conclui um treino é a sessão ao vivo (17-C). Esta
 *    tela registra "não realizado" (com motivo) e "cancelado" — fatos que o usuário decide.
 */
import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Eraser,
  GripVertical,
  Moon,
  Plus,
  Repeat,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page-header";
import { useChaveDeAbertura, useItemRetido } from "@/components/shared/use-item-retido";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { ConsistencyCalendar } from "@/components/training/consistency-calendar";
import type { MetricOptions, MetricSession } from "@/lib/training/metrics";
import { cn } from "@/lib/utils";
import {
  DERIVED_SCHEDULE_STATUS_LABELS,
  SCHEDULE_SOURCE_LABELS,
  TRAINING_BASE_PATH,
  WEEKDAY_SHORT_LABELS,
  type DerivedScheduleStatus,
} from "@/lib/training/constants";
import {
  addDaysIso,
  buildScheduleWeek,
  derivePlannedStatus,
  groupByDate,
  monthGridIso,
  summarizeAdherence,
} from "@/lib/training/schedule";
import type { ScheduledWorkout, TrainingProgram, TrainingWorkout } from "@/lib/training/types";
import {
  clearTrainingWeek,
  deleteScheduledWorkout,
  rescheduleScheduledWorkout,
  toggleRestDay,
} from "@/lib/actions/training-schedule";

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const NewEntryDialog = dynamic(
  () => import("./new-entry-dialog").then((m) => m.NewEntryDialog),
  { ssr: false },
);
const OutcomeDialog = dynamic(
  () => import("./outcome-dialog").then((m) => m.OutcomeDialog),
  { ssr: false },
);
const GenerateDialog = dynamic(
  () => import("./generate-dialog").then((m) => m.GenerateDialog),
  { ssr: false },
);
const DuplicateWeekDialog = dynamic(
  () => import("./duplicate-week-dialog").then((m) => m.DuplicateWeekDialog),
  { ssr: false },
);

type View = "semana" | "mes" | "lista" | "consistencia";

const VIEW_LABELS: Record<View, string> = {
  semana: "Semana",
  mes: "Mês",
  lista: "Lista",
  consistencia: "Consistência",
};

const STATUS_STYLES: Record<DerivedScheduleStatus, string> = {
  planejado: "border-border bg-card",
  hoje: "border-primary/50 bg-primary/10",
  atrasado: "border-destructive/40 bg-destructive/5",
  concluido: "border-emerald-500/40 bg-emerald-500/10",
  nao_realizado: "border-muted bg-muted/60 opacity-80",
  reagendado: "border-border bg-muted/40",
  cancelado: "border-border bg-muted/40 line-through opacity-70",
};

/** "03/08" a partir de data pura — sem converter para Date, sem fuso. */
export const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

export function CalendarClient({
  entries,
  workouts,
  programs,
  hoje,
  reference,
  view,
  weekStartsOn,
  history,
  metricOptions,
}: {
  entries: ScheduledWorkout[];
  workouts: TrainingWorkout[];
  programs: TrainingProgram[];
  hoje: string;
  reference: string;
  view: View;
  weekStartsOn: number;
  /** 17-E — sessões executadas, para o mapa de consistência. Só o SNAPSHOT, como sempre. */
  history: MetricSession[];
  metricOptions: MetricOptions;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [busy, setBusy] = React.useState(false);
  const [newDate, setNewDate] = React.useState<string | null>(null);
  const [outcomeEntry, setOutcomeEntry] = React.useState<ScheduledWorkout | null>(null);
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [duplicateOpen, setDuplicateOpen] = React.useState(false);

  // Diálogos sob demanda (REDESIGN-07-C, D2). Antes eram `{x && <Dialog open/>}`: nasciam
  // limpos a cada abertura e fechavam num corte seco. Agora ficam montados depois da 1ª
  // abertura (`useLazyDialog`), desenham o último item até o fim da animação
  // (`useItemRetido`) e remontam a cada abertura (`useChaveDeAbertura`) — continuam nascendo
  // limpos.
  const novaDataExibida = useItemRetido(newDate);
  const resultadoExibido = useItemRetido(outcomeEntry);
  const novoMontado = useLazyDialog(newDate !== null);
  const resultadoMontado = useLazyDialog(outcomeEntry !== null);
  const gerarMontado = useLazyDialog(generateOpen);
  const duplicarMontado = useLazyDialog(duplicateOpen);
  const chaveNovo = useChaveDeAbertura(newDate !== null);
  const chaveResultado = useChaveDeAbertura(outcomeEntry !== null);
  const chaveGerar = useChaveDeAbertura(generateOpen);
  const chaveDuplicar = useChaveDeAbertura(duplicateOpen);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(params.toString() ? `?${params}` : "?", { scroll: false });
  }

  const week = React.useMemo(
    () => buildScheduleWeek(entries, reference, hoje, weekStartsOn),
    [entries, reference, hoje, weekStartsOn],
  );
  const adherence = React.useMemo(() => summarizeAdherence(entries, hoje), [entries, hoje]);

  const step = view === "mes" ? 30 : 7;
  const prev = view === "mes" ? previousMonth(reference) : addDaysIso(reference, -step);
  const next = view === "mes" ? nextMonth(reference) : addDaysIso(reference, step);

  async function handleDragEnd(event: DragEndEvent) {
    const entryId = String(event.active.id);
    const targetDate = event.over ? String(event.over.id) : null;
    if (!targetDate) return;

    const entry = entries.find((item) => item.id === entryId);
    if (!entry || entry.scheduledDate === targetDate) return;

    setBusy(true);
    const result = await rescheduleScheduledWorkout({ id: entryId, scheduled_date: targetDate });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`Movido para ${shortDate(targetDate)}. A data original ficou registrada.`);
    router.refresh();
  }

  async function markRest(date: string) {
    setBusy(true);
    const result = await toggleRestDay(date);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.data.isRest ? "Dia marcado como descanso." : "Descanso desmarcado.");
    router.refresh();
  }

  async function removeEntry(entry: ScheduledWorkout) {
    if (!confirm("Remover este dia do planejamento?")) return;
    setBusy(true);
    const result = await deleteScheduledWorkout(entry.id);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  async function clearWeek() {
    if (
      !confirm(
        "Limpar esta semana? Só os dias que continuam pendentes são removidos — dias com desfecho registrado ficam.",
      )
    ) {
      return;
    }
    setBusy(true);
    const result = await clearTrainingWeek(reference);
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(
      result.data.kept > 0
        ? `${result.data.removed} removidos · ${result.data.kept} preservados (já tinham desfecho).`
        : `${result.data.removed} dia(s) removidos.`,
    );
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Calendário"
        description="Planeje a semana: escolha os dias, associe um treino a cada um e marque os descansos."
      >
        <Button variant="outline" size="sm" onClick={() => setGenerateOpen(true)}>
          <Repeat className="size-4" />
          Gerar rotina
        </Button>
        <Button size="sm" onClick={() => setNewDate(hoje)}>
          <Plus className="size-4" />
          Adicionar dia
        </Button>
      </PageHeader>

      {/* Barra de navegação e visão */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setParam("data", prev)}
            aria-label="Período anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => setParam("data", null)}>
            Hoje
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setParam("data", next)}
            aria-label="Próximo período"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>

        <span className="text-sm font-medium">
          {view === "mes"
            ? monthLabelOf(reference)
            : `${shortDate(week.startDate)} – ${shortDate(week.endDate)}`}
        </span>

        <div className="ml-auto flex flex-wrap items-center gap-1">
          {(["semana", "mes", "lista", "consistencia"] as View[]).map((option) => (
            <Button
              key={option}
              variant={view === option ? "default" : "outline"}
              size="sm"
              onClick={() => setParam("visao", option === "semana" ? null : option)}
            >
              {VIEW_LABELS[option]}
            </Button>
          ))}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy}>
                Ações da semana
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setDuplicateOpen(true)}>
                <Copy className="size-4" />
                Duplicar esta semana
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setGenerateOpen(true)}>
                <Repeat className="size-4" />
                Gerar rotina / aplicar programa
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={clearWeek}>
                <Eraser className="size-4" />
                Limpar semana
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Aderência do que já passou */}
      {adherence.due > 0 && (
        <p className="text-xs text-muted-foreground">
          No período carregado: <strong>{adherence.done}</strong> concluídos ·{" "}
          <strong>{adherence.missed}</strong> não realizados · <strong>{adherence.open}</strong>{" "}
          ainda em aberto de {adherence.due} dias já vencidos
          {adherence.rate !== null && ` · ${Math.round(adherence.rate * 100)}% de aderência`}. Dias
          futuros não entram nessa conta.
        </p>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        {view === "semana" && (
          <WeekView
            week={week}
            hoje={hoje}
            onAdd={setNewDate}
            onRest={markRest}
            onOutcome={setOutcomeEntry}
            onRemove={removeEntry}
          />
        )}
        {view === "mes" && (
          <MonthView
            entries={entries}
            reference={reference}
            hoje={hoje}
            weekStartsOn={weekStartsOn}
            onAdd={setNewDate}
          />
        )}
      </DndContext>

      {view === "lista" && (
        <ListView
          entries={entries}
          hoje={hoje}
          onOutcome={setOutcomeEntry}
          onRemove={removeEntry}
        />
      )}

      {/* 17-E — mapa de consistência. O que aconteceu, sem cobrança. */}
      {view === "consistencia" && (
        <ConsistencyCalendar
          sessions={history}
          planned={entries.map((entry) => ({
            scheduledDate: entry.scheduledDate,
            entryKind: entry.entryKind,
            status: entry.status,
          }))}
          hoje={hoje}
          months={6}
          options={metricOptions}
          weekStartsOn={weekStartsOn}
        />
      )}

      {/* Diálogos */}
      {novoMontado && novaDataExibida && (
        <NewEntryDialog
          key={chaveNovo}
          open={newDate !== null}
          date={novaDataExibida}
          workouts={workouts}
          programs={programs}
          onClose={() => setNewDate(null)}
          onSaved={() => {
            setNewDate(null);
            router.refresh();
          }}
        />
      )}

      {resultadoMontado && resultadoExibido && (
        <OutcomeDialog
          key={chaveResultado}
          open={outcomeEntry !== null}
          entry={resultadoExibido}
          onClose={() => setOutcomeEntry(null)}
          onSaved={() => {
            setOutcomeEntry(null);
            router.refresh();
          }}
        />
      )}

      {gerarMontado && (
        <GenerateDialog
          key={chaveGerar}
          open={generateOpen}
          workouts={workouts}
          programs={programs}
          reference={reference}
          weekStartsOn={weekStartsOn}
          onClose={() => setGenerateOpen(false)}
          onSaved={() => {
            setGenerateOpen(false);
            router.refresh();
          }}
        />
      )}

      {duplicarMontado && (
        <DuplicateWeekDialog
          key={chaveDuplicar}
          open={duplicateOpen}
          reference={reference}
          weekStartsOn={weekStartsOn}
          onClose={() => setDuplicateOpen(false)}
          onSaved={() => {
            setDuplicateOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════ Visão de semana ═══════════════════════════ */

function WeekView({
  week,
  hoje,
  onAdd,
  onRest,
  onOutcome,
  onRemove,
}: {
  week: ReturnType<typeof buildScheduleWeek<ScheduledWorkout>>;
  hoje: string;
  onAdd: (date: string) => void;
  onRest: (date: string) => void;
  onOutcome: (entry: ScheduledWorkout) => void;
  onRemove: (entry: ScheduledWorkout) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
      {week.days.map((day) => (
        <DayColumn
          key={day.date}
          date={day.date}
          isToday={day.isToday}
          isPast={day.isPast}
          hasRest={day.hasRest}
          label={`${WEEKDAY_SHORT_LABELS[day.weekday]} ${shortDate(day.date)}`}
          onAdd={() => onAdd(day.date)}
          onRest={() => onRest(day.date)}
        >
          {day.entries.map((entry) => (
            <DraggableEntry
              key={entry.id}
              entry={entry}
              hoje={hoje}
              onOutcome={() => onOutcome(entry)}
              onRemove={() => onRemove(entry)}
            />
          ))}
        </DayColumn>
      ))}
    </div>
  );
}

function DayColumn({
  date,
  isToday,
  isPast,
  hasRest,
  label,
  onAdd,
  onRest,
  children,
}: {
  date: string;
  isToday: boolean;
  isPast: boolean;
  hasRest: boolean;
  label: string;
  onAdd: () => void;
  onRest: () => void;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-32 flex-col gap-1.5 rounded-xl border p-2 transition-colors",
        isToday && "border-primary/50 bg-primary/5",
        isPast && !isToday && "bg-muted/30",
        isOver && "border-primary bg-primary/10 ring-2 ring-primary/30",
      )}
    >
      <div className="flex items-center gap-1">
        <span
          className={cn(
            "text-xs font-medium",
            isToday ? "text-primary" : "text-muted-foreground",
          )}
        >
          {label}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <button
            type="button"
            onClick={onRest}
            aria-label={hasRest ? `Desmarcar descanso em ${date}` : `Marcar descanso em ${date}`}
            aria-pressed={hasRest}
            className={cn(
              "rounded p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              hasRest ? "text-primary" : "text-muted-foreground hover:bg-accent",
            )}
          >
            <Moon className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={onAdd}
            aria-label={`Adicionar treino em ${date}`}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function DraggableEntry({
  entry,
  hoje,
  onOutcome,
  onRemove,
}: {
  entry: ScheduledWorkout;
  hoje: string;
  onOutcome: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: entry.id,
  });
  const derived = derivePlannedStatus(entry, hoje);

  if (entry.entryKind === "descanso") {
    return (
      <div className="flex items-center gap-1.5 rounded-lg border border-dashed p-2 text-xs text-muted-foreground">
        <Moon className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{entry.title ?? "Descanso"}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remover marcação de descanso"
          className="rounded p-0.5 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-3" />
        </button>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={
        transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined
      }
      className={cn(
        "rounded-lg border p-2 text-xs",
        STATUS_STYLES[derived],
        isDragging && "z-20 opacity-90 shadow-lg",
      )}
    >
      <div className="flex items-start gap-1">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Arrastar ${entry.workoutName ?? "treino"} para outro dia`}
          className="mt-0.5 shrink-0 cursor-grab touch-none rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{entry.workoutName ?? entry.title ?? "Treino"}</p>
          {entry.plannedTime && (
            <p className="text-[10px] text-muted-foreground">{entry.plannedTime.slice(0, 5)}</p>
          )}
          {entry.originalDate && (
            <p className="text-[10px] text-muted-foreground">
              era {shortDate(entry.originalDate)}
            </p>
          )}
          {derived !== "planejado" && (
            <Badge variant="secondary" className="mt-1 text-[9px]">
              {DERIVED_SCHEDULE_STATUS_LABELS[derived]}
            </Badge>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`Ações de ${entry.workoutName ?? "treino"}`}
              className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {entry.workoutId && (
              <DropdownMenuItem asChild>
                <Link href={`${TRAINING_BASE_PATH}/treinos/${entry.workoutId}`}>Abrir treino</Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onOutcome}>Registrar desfecho</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={onRemove}>
              <Trash2 className="size-4" />
              Remover do planejamento
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Visão de mês ═══════════════════════════ */

function MonthView({
  entries,
  reference,
  hoje,
  weekStartsOn,
  onAdd,
}: {
  entries: ScheduledWorkout[];
  reference: string;
  hoje: string;
  weekStartsOn: number;
  onAdd: (date: string) => void;
}) {
  const grid = React.useMemo(
    () => monthGridIso(reference, weekStartsOn),
    [reference, weekStartsOn],
  );
  const byDate = React.useMemo(() => groupByDate(entries), [entries]);
  const month = reference.slice(0, 7);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[42rem]">
        <div className="grid grid-cols-7 gap-1 pb-1">
          {Array.from({ length: 7 }, (_, index) => (
            <div key={index} className="text-center text-[11px] font-medium text-muted-foreground">
              {WEEKDAY_SHORT_LABELS[(weekStartsOn + index) % 7]}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {grid.flat().map((date) => {
            const dayEntries = byDate.get(date) ?? [];
            const outside = !date.startsWith(month);
            return (
              <button
                key={date}
                type="button"
                onClick={() => onAdd(date)}
                className={cn(
                  "flex min-h-20 flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  outside && "opacity-40",
                  date === hoje && "border-primary/50 bg-primary/5",
                )}
                aria-label={`Adicionar treino em ${date}`}
              >
                <span className="text-[11px] font-medium tabular-nums">{date.slice(8, 10)}</span>
                {dayEntries.slice(0, 3).map((entry) => {
                  const derived = derivePlannedStatus(entry, hoje);
                  return (
                    <span
                      key={entry.id}
                      className={cn(
                        "w-full truncate rounded border px-1 py-0.5 text-[10px]",
                        STATUS_STYLES[derived],
                      )}
                    >
                      {entry.entryKind === "descanso"
                        ? "Descanso"
                        : (entry.workoutName ?? entry.title ?? "Treino")}
                    </span>
                  );
                })}
                {dayEntries.length > 3 && (
                  <span className="text-[10px] text-muted-foreground">
                    +{dayEntries.length - 3}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════ Visão de lista ═══════════════════════════ */

function ListView({
  entries,
  hoje,
  onOutcome,
  onRemove,
}: {
  entries: ScheduledWorkout[];
  hoje: string;
  onOutcome: (entry: ScheduledWorkout) => void;
  onRemove: (entry: ScheduledWorkout) => void;
}) {
  const sorted = [...entries].sort(
    (a, b) => a.scheduledDate.localeCompare(b.scheduledDate) || a.position - b.position,
  );

  if (sorted.length === 0) {
    return (
      <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
        Nada planejado neste período.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {sorted.map((entry) => {
        const derived = derivePlannedStatus(entry, hoje);
        return (
          <li
            key={entry.id}
            className={cn("flex flex-wrap items-center gap-3 rounded-xl border p-3", STATUS_STYLES[derived])}
          >
            <span className="w-14 shrink-0 text-sm font-medium tabular-nums">
              {shortDate(entry.scheduledDate)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {entry.entryKind === "descanso"
                  ? (entry.title ?? "Descanso")
                  : (entry.workoutName ?? entry.title ?? "Treino")}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {DERIVED_SCHEDULE_STATUS_LABELS[derived]}
                {entry.plannedTime ? ` · ${entry.plannedTime.slice(0, 5)}` : ""}
                {entry.originalDate ? ` · era ${shortDate(entry.originalDate)}` : ""}
                {entry.skipReason ? ` · ${entry.skipReason}` : ""}
                {entry.source !== "manual" ? ` · ${SCHEDULE_SOURCE_LABELS[entry.source]}` : ""}
              </p>
            </div>
            {entry.entryKind !== "descanso" && (
              <Button variant="outline" size="sm" onClick={() => onOutcome(entry)}>
                Desfecho
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => onRemove(entry)}
              aria-label="Remover do planejamento"
            >
              <Trash2 className="size-4" />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/* ═══════════════════════════ Diálogos ═══════════════════════════ */

/* ═══════════════════════════ Rótulos de período ═══════════════════════════ */

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** Formata a partir do TEXTO da data pura — nenhuma conversão de fuso acontece. */
function monthLabelOf(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return `${MONTHS[month - 1]} de ${year}`;
}

function previousMonth(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return month === 1 ? `${year - 1}-12-01` : `${year}-${String(month - 1).padStart(2, "0")}-01`;
}

function nextMonth(iso: string): string {
  const [year, month] = iso.split("-").map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, "0")}-01`;
}
