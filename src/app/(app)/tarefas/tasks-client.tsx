"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  FolderKanban,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { TaskCard } from "@/components/tasks/task-card";
import { KanbanBoard } from "@/components/tasks/kanban-board";
import { TaskCalendar } from "@/components/tasks/task-calendar";
import { RoutineTypeBadge } from "@/components/tasks/badges";
import { TaskFormDialog } from "./task-form";
import { TaskDetailsDialog } from "./task-details";
import { ProjectFormDialog } from "./project-form";
import { archiveProject, deleteProject } from "@/lib/actions/projects";
import { setRoutineDone } from "@/lib/actions/routines";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  TASK_STORED_STATUSES,
  TASK_VIEWS,
  TASK_VIEW_LABELS,
  type TaskView,
} from "@/lib/tasks/constants";
import { buildWeekDays } from "@/lib/calendar/grid";
import {
  compareTasks,
  isDueToday,
  isOverdue,
} from "@/lib/tasks/status";
import { toDateInputValue } from "@/lib/format";
import type {
  ProjectWithCount,
  RoutineWithToday,
  TaskWithRelations,
} from "@/types/database";

const ALL = "all";
const NO_PROJECT = "none";

const weekdayFmt = new Intl.DateTimeFormat("pt-BR", { weekday: "long" });
const dayFmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export function TasksClient({
  tasks,
  projects,
  events,
  routines,
  view,
  dateIso,
  todayIso,
  userId,
}: {
  tasks: TaskWithRelations[];
  projects: ProjectWithCount[];
  events: { id: string; title: string; start_at: string }[];
  routines: RoutineWithToday[];
  view: TaskView;
  dateIso: string;
  todayIso: string;
  userId: string;
}) {
  const router = useRouter();

  const [projectFilter, setProjectFilter] = React.useState<string>(ALL);
  const [priorityFilter, setPriorityFilter] = React.useState<string>(ALL);
  const [statusFilter, setStatusFilter] = React.useState<string>(ALL);
  const [query, setQuery] = React.useState("");

  const [formOpen, setFormOpen] = React.useState(false);
  const [formTask, setFormTask] = React.useState<TaskWithRelations | null>(null);
  const [formDate, setFormDate] = React.useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const selected = selectedId
    ? tasks.find((t) => t.id === selectedId) ?? null
    : null;

  const projectOptions = projects
    .filter((p) => !p.is_archived)
    .map((p) => ({ id: p.id, name: p.name }));

  function navigate(updates: { view?: TaskView; date?: string }) {
    const v = updates.view ?? view;
    const d = updates.date ?? dateIso;
    router.push(`/tarefas?view=${v}&date=${d}`);
  }

  function openCreate(date?: string | null) {
    setFormTask(null);
    setFormDate(date ?? null);
    setFormOpen(true);
  }
  function openEdit(task: TaskWithRelations) {
    setFormTask(task);
    setFormDate(null);
    setDetailsOpen(false);
    setFormOpen(true);
  }
  function openDetails(task: TaskWithRelations) {
    setSelectedId(task.id);
    setDetailsOpen(true);
  }

  // Base filtrada por projeto (vale para todas as visões).
  const projectScoped = React.useMemo(
    () =>
      tasks.filter((t) => {
        if (projectFilter === ALL) return true;
        if (projectFilter === NO_PROJECT) return !t.project_id;
        return t.project_id === projectFilter;
      }),
    [tasks, projectFilter],
  );

  // Filtros adicionais (lista): prioridade, status efetivo, busca.
  const listFiltered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return projectScoped.filter((t) => {
      if (priorityFilter !== ALL && t.priority !== priorityFilter) return false;
      if (statusFilter !== ALL) {
        if (statusFilter === "atrasada") {
          if (!isOverdue(t, todayIso)) return false;
        } else if (t.status !== statusFilter) {
          return false;
        }
      }
      if (q) {
        const hay = `${t.title} ${t.tags.join(" ")} ${t.notes ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [projectScoped, priorityFilter, statusFilter, query, todayIso]);

  const sorted = (arr: TaskWithRelations[]) =>
    [...arr].sort((a, b) => compareTasks(a, b, todayIso));

  const counts = {
    abertas: tasks.filter((t) => t.status === "pendente" || t.status === "em_andamento")
      .length,
    atrasadas: tasks.filter((t) => isOverdue(t, todayIso)).length,
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Tarefas & Rotinas"
        description="Demandas, projetos, kanban e visões — organize o que precisa ser feito."
      >
        <ProjectsManager projects={projects} />
        <Button size="sm" onClick={() => openCreate()}>
          <Plus /> Nova tarefa
        </Button>
      </PageHeader>

      {/* Filtro por projeto (chips) */}
      <div className="flex flex-wrap items-center gap-2">
        <ProjectChip
          active={projectFilter === ALL}
          onClick={() => setProjectFilter(ALL)}
          label="Todos"
        />
        {projectOptions.map((p) => {
          const full = projects.find((x) => x.id === p.id);
          return (
            <ProjectChip
              key={p.id}
              active={projectFilter === p.id}
              onClick={() => setProjectFilter(p.id)}
              label={p.name}
              color={full?.color}
              count={full?.open_tasks}
            />
          );
        })}
        <ProjectChip
          active={projectFilter === NO_PROJECT}
          onClick={() => setProjectFilter(NO_PROJECT)}
          label="Sem projeto"
        />
      </div>

      {/* Seletor de visão */}
      <div className="-mx-1 overflow-x-auto px-1">
        <div className="inline-flex rounded-lg border p-0.5">
          {TASK_VIEWS.map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => navigate({ view: v })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                view === v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {TASK_VIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo por visão */}
      {view === "lista" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="relative sm:col-span-2 xl:col-span-2">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por título, tag ou observação…"
                className="pl-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="sr-only">Prioridade</Label>
              <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Prioridade" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Toda prioridade</SelectItem>
                  {TASK_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {TASK_PRIORITY_LABELS[p]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="sr-only">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Todo status</SelectItem>
                  <SelectItem value="atrasada">{TASK_STATUS_LABELS.atrasada}</SelectItem>
                  {TASK_STORED_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {TASK_STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <TaskList
            tasks={sorted(listFiltered)}
            todayIso={todayIso}
            onEdit={openEdit}
            onOpen={openDetails}
            onCreate={() => openCreate()}
            emptyTitle="Nenhuma tarefa encontrada"
            emptyDescription="Crie sua primeira tarefa ou ajuste os filtros."
          />
        </div>
      )}

      {view === "kanban" && (
        <KanbanBoard
          tasks={projectScoped.filter((t) => t.status !== "cancelada")}
          todayIso={todayIso}
          onEdit={openEdit}
          onOpen={openDetails}
        />
      )}

      {view === "calendario" && (
        <TaskCalendar
          monthDateIso={dateIso}
          todayIso={todayIso}
          tasks={projectScoped}
          onOpen={openDetails}
          onNavigate={(d) => navigate({ date: d })}
        />
      )}

      {view === "hoje" && (
        <TodayView
          tasks={projectScoped}
          routines={routines}
          todayIso={todayIso}
          counts={counts}
          onEdit={openEdit}
          onOpen={openDetails}
          onCreate={() => openCreate(todayIso)}
          onGoOverdue={() => navigate({ view: "atrasadas" })}
        />
      )}

      {view === "semana" && (
        <WeekView
          tasks={projectScoped}
          todayIso={todayIso}
          onEdit={openEdit}
          onOpen={openDetails}
          onCreate={openCreate}
        />
      )}

      {view === "atrasadas" && (
        <TaskList
          tasks={sorted(projectScoped.filter((t) => isOverdue(t, todayIso)))}
          todayIso={todayIso}
          onEdit={openEdit}
          onOpen={openDetails}
          emptyTitle="Nada atrasado 🎉"
          emptyDescription="Você está em dia com suas tarefas."
        />
      )}

      {view === "concluidas" && (
        <TaskList
          tasks={projectScoped
            .filter((t) => t.status === "concluida")
            .sort((a, b) => (b.completed_at ?? "").localeCompare(a.completed_at ?? ""))}
          todayIso={todayIso}
          onEdit={openEdit}
          onOpen={openDetails}
          emptyTitle="Nenhuma tarefa concluída"
          emptyDescription="As tarefas que você concluir aparecerão aqui."
        />
      )}

      <TaskFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        task={formTask}
        projects={projectOptions}
        events={events}
        defaultDate={formDate}
      />

      <TaskDetailsDialog
        task={selected}
        todayIso={todayIso}
        userId={userId}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        onEdit={openEdit}
      />
    </div>
  );
}

/* ───────────────────────────── Subcomponentes ───────────────────────────── */

function ProjectChip({
  active,
  onClick,
  label,
  color,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  color?: string | null;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "text-muted-foreground hover:bg-accent",
      )}
    >
      {color && (
        <span
          aria-hidden
          className="size-2 rounded-full"
          style={{ backgroundColor: color }}
        />
      )}
      {label}
      {typeof count === "number" && count > 0 && (
        <span className="rounded-full bg-background px-1.5 text-xs tabular-nums">
          {count}
        </span>
      )}
    </button>
  );
}

function TaskList({
  tasks,
  todayIso,
  onEdit,
  onOpen,
  onCreate,
  emptyTitle,
  emptyDescription,
}: {
  tasks: TaskWithRelations[];
  todayIso: string;
  onEdit: (t: TaskWithRelations) => void;
  onOpen: (t: TaskWithRelations) => void;
  onCreate?: () => void;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (tasks.length === 0) {
    return (
      <EmptyState icon={ListChecks} title={emptyTitle} description={emptyDescription}>
        {onCreate && (
          <Button size="sm" onClick={onCreate}>
            <Plus /> Nova tarefa
          </Button>
        )}
      </EmptyState>
    );
  }
  return (
    <div className="grid gap-2">
      {tasks.map((t) => (
        <TaskCard
          key={t.id}
          task={t}
          todayIso={todayIso}
          onEdit={onEdit}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

function TodayView({
  tasks,
  routines,
  todayIso,
  counts,
  onEdit,
  onOpen,
  onCreate,
  onGoOverdue,
}: {
  tasks: TaskWithRelations[];
  routines: RoutineWithToday[];
  todayIso: string;
  counts: { abertas: number; atrasadas: number };
  onEdit: (t: TaskWithRelations) => void;
  onOpen: (t: TaskWithRelations) => void;
  onCreate: () => void;
  onGoOverdue: () => void;
}) {
  const todays = tasks.filter(
    (t) =>
      isDueToday(t, todayIso) ||
      (!t.due_date && t.status === "em_andamento"),
  );
  const todaysRoutines = routines.filter((r) => r.is_active && r.scheduledToday);

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        {counts.atrasadas > 0 && (
          <button
            type="button"
            onClick={onGoOverdue}
            className="flex w-full items-center justify-between rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-left text-sm"
          >
            <span className="font-medium text-destructive">
              {counts.atrasadas} tarefa(s) atrasada(s)
            </span>
            <span className="text-xs text-muted-foreground">Ver todas →</span>
          </button>
        )}
        <h2 className="text-sm font-medium text-muted-foreground">
          Para hoje ({todays.length})
        </h2>
        {todays.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Dia tranquilo por aqui"
            description="Nada vence hoje. Que tal adiantar algo?"
          >
            <Button size="sm" onClick={onCreate}>
              <Plus /> Nova tarefa
            </Button>
          </EmptyState>
        ) : (
          <div className="grid gap-2">
            {todays.map((t) => (
              <TaskCard
                key={t.id}
                task={t}
                todayIso={todayIso}
                onEdit={onEdit}
                onOpen={onOpen}
              />
            ))}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">Rotinas de hoje</h2>
        <RoutinesTodayCard routines={todaysRoutines} todayIso={todayIso} />
      </div>
    </div>
  );
}

function RoutinesTodayCard({
  routines,
  todayIso,
}: {
  routines: RoutineWithToday[];
  todayIso: string;
}) {
  const router = useRouter();
  if (routines.length === 0) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">
          Nenhuma rotina para hoje.{" "}
          <a href="/rotinas" className="text-primary hover:underline">
            Gerenciar rotinas
          </a>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="divide-y p-0">
        {routines.map((r) => (
          <label
            key={r.id}
            className="flex cursor-pointer items-center gap-3 px-4 py-3"
          >
            <Checkbox
              checked={Boolean(r.todayLog?.is_done)}
              aria-label={r.name}
              onCheckedChange={async (v) => {
                const res = await setRoutineDone(r.id, todayIso, Boolean(v));
                if (res.ok) router.refresh();
                else toast.error(res.error);
              }}
            />
            <span className="flex-1 text-sm font-medium">{r.name}</span>
            <RoutineTypeBadge type={r.type} />
          </label>
        ))}
      </CardContent>
    </Card>
  );
}

function WeekView({
  tasks,
  todayIso,
  onEdit,
  onOpen,
  onCreate,
}: {
  tasks: TaskWithRelations[];
  todayIso: string;
  onEdit: (t: TaskWithRelations) => void;
  onOpen: (t: TaskWithRelations) => void;
  onCreate: (date?: string | null) => void;
}) {
  const today = parseLocalDate(todayIso);
  const days = buildWeekDays(today, { today });

  return (
    <div className="space-y-3">
      {days.map((day) => {
        const iso = toDateInputValue(day.date);
        const dayTasks = tasks
          .filter((t) => t.due_date === iso && t.status !== "cancelada")
          .sort((a, b) => compareTasks(a, b, todayIso));
        return (
          <div key={iso} className="space-y-2">
            <div className="flex items-center justify-between">
              <h3
                className={cn(
                  "text-sm font-medium capitalize",
                  day.isToday && "text-primary",
                )}
              >
                {weekdayFmt.format(day.date)}{" "}
                <span className="text-muted-foreground">{dayFmt.format(day.date)}</span>
              </h3>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Nova tarefa neste dia"
                onClick={() => onCreate(iso)}
              >
                <Plus />
              </Button>
            </div>
            {dayTasks.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
                Sem tarefas.
              </p>
            ) : (
              <div className="grid gap-2">
                {dayTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    todayIso={todayIso}
                    onEdit={onEdit}
                    onOpen={onOpen}
                    compact
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProjectsManager({ projects }: { projects: ProjectWithCount[] }) {
  const router = useRouter();
  const active = projects.filter((p) => !p.is_archived);
  const archived = projects.filter((p) => p.is_archived);

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
    <Sheet>
      <SheetTrigger asChild>
        <Button size="sm" variant="outline">
          <Settings2 /> Listas
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Projetos & listas</SheetTitle>
          <SheetDescription>
            Organize tarefas em listas. Excluir uma lista move suas tarefas para
            “Sem projeto”.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-4 px-4 pb-6">
          <ProjectFormDialog
            trigger={
              <Button size="sm" className="w-full">
                <Plus /> Nova lista
              </Button>
            }
          />

          {active.length === 0 && archived.length === 0 ? (
            <EmptyState
              icon={FolderKanban}
              title="Nenhuma lista ainda"
              description="Crie listas para separar tarefas por contexto."
            />
          ) : (
            <div className="space-y-2">
              {active.map((p) => (
                <ProjectRow key={p.id} project={p} onRun={run} />
              ))}
            </div>
          )}

          {archived.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Arquivadas</p>
              {archived.map((p) => (
                <ProjectRow key={p.id} project={p} onRun={run} archived />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProjectRow({
  project: p,
  onRun,
  archived = false,
}: {
  project: ProjectWithCount;
  onRun: (action: Promise<{ ok: boolean; error?: string }>, okMsg: string) => void;
  archived?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
      <span
        aria-hidden
        className="size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: p.color ?? "var(--muted-foreground)" }}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          {p.icon ? `${p.icon} ` : ""}
          {p.name}
        </p>
        {!archived && p.open_tasks > 0 && (
          <p className="text-xs text-muted-foreground">{p.open_tasks} aberta(s)</p>
        )}
      </div>
      <ProjectFormDialog
        project={p}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label="Editar lista">
            <Pencil />
          </Button>
        }
      />
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={archived ? "Desarquivar" : "Arquivar"}
        onClick={() =>
          onRun(
            archiveProject(p.id, !archived),
            archived ? "Lista desarquivada." : "Lista arquivada.",
          )
        }
      >
        {archived ? <ArchiveRestore /> : <Archive />}
      </Button>
      <DeleteConfirmDialog
        title="Excluir lista"
        description={`Excluir "${p.name}"? As tarefas vinculadas vão para “Sem projeto”.`}
        successMessage="Lista excluída."
        onConfirm={() => deleteProject(p.id)}
        trigger={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Excluir lista"
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        }
      />
    </div>
  );
}
