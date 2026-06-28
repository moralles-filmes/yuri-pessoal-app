"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarCheck,
  Flame,
  ListChecks,
  Pencil,
  Plus,
  Power,
  Repeat,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { SortableList } from "@/components/shared/sortable-list";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { RoutineTypeBadge } from "@/components/tasks/badges";
import { cn } from "@/lib/utils";
import { RoutineFormDialog } from "./routine-form";
import {
  deleteRoutine,
  reorderRoutines,
  seedDefaultRoutines,
  setRoutineDone,
  setRoutineItemDone,
  toggleRoutineActive,
} from "@/lib/actions/routines";
import { ROUTINE_FREQUENCY_LABELS } from "@/lib/tasks/constants";
import type { RoutineWithToday } from "@/types/database";

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function frequencySummary(r: RoutineWithToday): string {
  if (r.frequency === "diaria") return ROUTINE_FREQUENCY_LABELS.diaria;
  const days = (r.weekdays ?? []).map((d) => WEEKDAY_SHORT[d]).join(", ");
  return days || ROUTINE_FREQUENCY_LABELS[r.frequency];
}

export function RoutinesClient({
  routines,
  todayIso,
}: {
  routines: RoutineWithToday[];
  todayIso: string;
}) {
  const router = useRouter();
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<RoutineWithToday | undefined>();

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }
  function openEdit(r: RoutineWithToday) {
    setEditing(r);
    setFormOpen(true);
  }

  const active = routines.filter((r) => r.is_active);
  const todays = active.filter((r) => r.scheduledToday);
  const doneToday = todays.filter((r) => r.todayLog?.is_done).length;

  async function run(
    action: Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) {
    const res = await action;
    if (res.ok) {
      toast.success(okMsg);
      router.refresh();
    } else {
      toast.error(res.error ?? "Não foi possível concluir.");
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Rotinas"
        description="Manhã, noite, trabalho, estudos e exercícios — com check-in diário e frequência."
      >
        <Button size="sm" onClick={openCreate}>
          <Plus /> Nova rotina
        </Button>
      </PageHeader>

      {routines.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="Comece suas rotinas"
          description="Crie do zero ou adicione as rotinas sugeridas (Manhã, Noite, Trabalho, Estudos, Exercícios)."
        >
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              run(seedDefaultRoutines(), "Rotinas sugeridas adicionadas.")
            }
          >
            <Plus /> Adicionar sugeridas
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus /> Nova rotina
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Feitas hoje"
              value={`${doneToday}/${todays.length}`}
              icon={CalendarCheck}
              hint="Rotinas agendadas para hoje"
            />
            <StatCard
              label="Rotinas ativas"
              value={String(active.length)}
              icon={Repeat}
            />
            <StatCard
              label="Total"
              value={String(routines.length)}
              icon={ListChecks}
            />
          </div>

          {/* Hoje */}
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Rotinas de hoje ({todays.length})
            </h2>
            {todays.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhuma rotina agendada para hoje.
              </p>
            ) : (
              <div className="grid gap-3">
                {todays.map((r) => (
                  <RoutineTodayCard key={r.id} routine={r} todayIso={todayIso} />
                ))}
              </div>
            )}
          </section>

          {/* Todas */}
          <AllRoutinesSection routines={routines} onEdit={openEdit} run={run} />
        </>
      )}

      <RoutineFormDialog
        routine={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </div>
  );
}

function AllRoutinesSection({
  routines,
  onEdit,
  run,
}: {
  routines: RoutineWithToday[];
  onEdit: (r: RoutineWithToday) => void;
  run: (
    action: Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) => Promise<void>;
}) {
  const router = useRouter();
  // Optimistic UI: reordena na hora; sincroniza quando o servidor revalida
  // (a prop `routines` chega ordenada por position). Ajuste durante o render
  // comparando a prop anterior (padrão React, sem useEffect).
  const [ordered, setOrdered] = React.useState(routines);
  const [prevRoutines, setPrevRoutines] = React.useState(routines);
  if (routines !== prevRoutines) {
    setPrevRoutines(routines);
    setOrdered(routines);
  }

  async function handleReorder(orderedIds: string[]) {
    const byId = new Map(ordered.map((r) => [r.id, r]));
    const next = orderedIds
      .map((id) => byId.get(id))
      .filter((r): r is RoutineWithToday => Boolean(r));
    setOrdered(next);
    const res = await reorderRoutines(orderedIds);
    if (!res.ok) {
      toast.error(res.error ?? "Não foi possível salvar a nova ordem.");
      setOrdered(routines);
      router.refresh();
    }
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Todas as rotinas
        </h2>
        <p className="text-xs text-muted-foreground">Arraste ⠿ para reordenar</p>
      </div>
      <SortableList
        items={ordered}
        getId={(r) => r.id}
        onReorder={handleReorder}
        className="grid gap-2"
        renderItem={(r, handle) => (
          <Card className={cn(!r.is_active && "opacity-60")}>
            <CardContent className="flex items-center gap-3 p-3.5">
              {handle}
              <span className="text-xl" aria-hidden>
                {r.icon || "🔁"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{r.name}</span>
                  <RoutineTypeBadge type={r.type} />
                  {!r.is_active && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inativa
                    </Badge>
                  )}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {frequencySummary(r)}
                  {r.time_of_day ? ` · ${r.time_of_day.slice(0, 5)}` : ""}
                  {r.items.length > 0 ? ` · ${r.items.length} passo(s)` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Editar rotina"
                  onClick={() => onEdit(r)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={r.is_active ? "Desativar" : "Ativar"}
                  onClick={() =>
                    run(
                      toggleRoutineActive(r.id, !r.is_active),
                      r.is_active ? "Rotina desativada." : "Rotina ativada.",
                    )
                  }
                >
                  <Power className={cn(r.is_active && "text-emerald-600")} />
                </Button>
                <DeleteConfirmDialog
                  title="Excluir rotina"
                  description={`Excluir "${r.name}"? O histórico de check-ins também será removido.`}
                  successMessage="Rotina excluída."
                  onConfirm={() => deleteRoutine(r.id)}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Excluir rotina"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>
        )}
      />
    </section>
  );
}

function RoutineTodayCard({
  routine: r,
  todayIso,
}: {
  routine: RoutineWithToday;
  todayIso: string;
}) {
  const router = useRouter();
  const completed = new Set(r.todayLog?.completed_items ?? []);
  const done = Boolean(r.todayLog?.is_done);

  async function run(action: Promise<{ ok: boolean; error?: string }>) {
    const res = await action;
    if (res.ok) router.refresh();
    else toast.error(res.error ?? "Não foi possível registrar.");
  }

  return (
    <Card
      className="border-l-4"
      style={{ borderLeftColor: r.color ?? "var(--primary)" }}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <Checkbox
            checked={done}
            aria-label={`Concluir ${r.name}`}
            onCheckedChange={(v) => run(setRoutineDone(r.id, todayIso, Boolean(v)))}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "font-medium",
                  done && "text-muted-foreground line-through decoration-1",
                )}
              >
                {r.icon ? `${r.icon} ` : ""}
                {r.name}
              </span>
              <RoutineTypeBadge type={r.type} />
            </div>
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>
                Semana: {r.adherence7.done}/{r.adherence7.scheduled}
              </span>
              {r.streak > 0 && (
                <span className="inline-flex items-center gap-0.5 text-primary">
                  <Flame className="size-3" /> {r.streak}
                </span>
              )}
            </p>
          </div>
        </div>

        {r.items.length > 0 && (
          <ul className="space-y-1 pl-1">
            {r.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2">
                <Checkbox
                  checked={completed.has(item.id)}
                  aria-label={item.label}
                  onCheckedChange={(v) =>
                    run(setRoutineItemDone(r.id, todayIso, item.id, Boolean(v)))
                  }
                />
                <span
                  className={cn(
                    "text-sm",
                    completed.has(item.id) &&
                      "text-muted-foreground line-through decoration-1",
                  )}
                >
                  {item.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
