"use client";

/**
 * Fase 15 — Módulo TO-DO · Cliente principal.
 *
 * Amarra navegação, visões, filtros, ações em massa e diálogos. Segue o padrão do
 * projeto: o SERVIDOR lê tudo (`page.tsx`), este componente só deriva em memória com
 * os módulos puros (`filters`, `status`) e chama Server Actions para mutar.
 *
 * O estado de navegação vive na URL (`?v=`, `?id=`, `?view=`, `?m=`) — recarregar a
 * página ou compartilhar o link mantém exatamente a mesma tela.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  ArrowUpDown,
  CalendarRange,
  CheckCheck,
  Copy,
  Filter as FilterIcon,
  Group,
  Inbox,
  LayoutGrid,
  List,
  ListTodo,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Star,
  Sun,
  Tag,
  Trash2,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SortableList } from "@/components/shared/sortable-list";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import {
  TODO_GROUPS,
  TODO_GROUP_LABELS,
  TODO_PRIORITIES,
  TODO_PRIORITY_LABELS,
  TODO_SORTS,
  TODO_SORT_LABELS,
  TODO_VIEWS,
  TODO_VIEW_LABELS,
  type TodoGroup,
  type TodoPriority,
  type TodoSort,
  type TodoView,
} from "@/lib/todo/constants";
import {
  buildTaskTree,
  countActiveFilters,
  filterTasks,
  groupTasks,
  isCompletedToday,
  isInbox,
  sortTasks,
  type TodoGroupLookups,
} from "@/lib/todo/filters";
import { daysBetween, isOverdue, isDueToday, isUpcoming } from "@/lib/todo/status";
import {
  bulkTodoTasks,
  completeTodoTask,
  deleteTodoTask,
  archiveTodoTask,
  duplicateTodoTask,
  moveTodoTask,
  reopenTodoTask,
  reorderTodoTasks,
  rescheduleTodoTask,
  setTodoParent,
  setTodoPriority,
  snoozeTodoTask,
} from "@/lib/actions/todo";
import {
  archiveTodoProject,
  duplicateTodoProject,
  reorderTodoLabels,
  reorderTodoProjects,
  reorderTodoSections,
  toggleTodoProjectFavorite,
} from "@/lib/actions/todo-projects";
import {
  reorderTodoSavedFilters,
  saveTodoPreference,
} from "@/lib/actions/todo-extras";
import { TaskRow, type TaskRowActions } from "@/components/todo/task-row";
import { TaskBoard, type BoardColumn } from "@/components/todo/task-board";
import { TaskCalendar } from "@/components/todo/task-calendar";
import { TaskDetailSheet } from "@/components/todo/task-detail-sheet";
import { QuickTaskInput } from "@/components/todo/quick-task-input";
import { TodoNav, TodoNavDrawer, type TodoNavCounts, type TodoRoute } from "@/components/todo/todo-nav";
import { ColorDot, PriorityFlag } from "@/components/todo/badges";
import {
  DeleteProjectDialog,
  DeleteSectionDialog,
  LabelDialog,
  MakeSubtaskDialog,
  MoveTaskDialog,
  PickDateDialog,
  ProjectDialog,
  SaveFilterDialog,
  SectionDialog,
} from "@/components/todo/todo-dialogs";
import type {
  TodoFilterDefinition,
  TodoLabel,
  TodoPreference,
  TodoProject,
  TodoSavedFilter,
  TodoSummary,
  TodoTask,
} from "@/lib/todo/types";

const NO_SECTION = "__sem_secao__";

/**
 * Recoloca `ids` (subconjunto visível, já na nova ordem) no início de `all`, mantendo
 * o resto no fim. A navegação lista só projetos ativos / filtros marcados para a barra,
 * então a reordenação precisa preservar quem ficou de fora da tela.
 */
function reorderSubset<T extends { id: string }>(all: T[], ids: string[]): T[] {
  const byId = new Map(all.map((item) => [item.id, item]));
  const moved = ids
    .map((id) => byId.get(id))
    .filter((item): item is T => item !== undefined);
  const movedIds = new Set(ids);
  return [...moved, ...all.filter((item) => !movedIds.has(item.id))];
}

export function TodoClient({
  tasks,
  projects,
  labels,
  savedFilters,
  preference,
  summary,
  todayIso,
  userId,
  route,
  view,
  monthIso,
  openTaskId,
}: {
  tasks: TodoTask[];
  projects: TodoProject[];
  labels: TodoLabel[];
  savedFilters: TodoSavedFilter[];
  preference: TodoPreference;
  summary: TodoSummary;
  todayIso: string;
  userId: string;
  route: TodoRoute;
  view: TodoView;
  monthIso: string;
  /** `?task=<id>` — abre o painel direto (usado pela busca global e pelas notificações). */
  openTaskId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [, startTransition] = React.useTransition();

  /* ── Navegação (URL) ── */
  const navigate = React.useCallback(
    (patch: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) params.delete(key);
        else params.set(key, value);
      }
      router.replace(`/todo?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const goTo = React.useCallback(
    (next: TodoRoute) => {
      if (next.kind === "view") navigate({ v: next.value, id: null });
      else if (next.kind === "arquivados") navigate({ v: "arquivados", id: null });
      else navigate({ v: next.kind, id: next.id });
    },
    [navigate],
  );

  /* ── Estado local ── */
  const [navOpen, setNavOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [showCompleted, setShowCompleted] = React.useState(preference.showCompleted);
  const [sortBy, setSortBy] = React.useState<TodoSort>(preference.sortBy);
  const [groupBy, setGroupBy] = React.useState<TodoGroup>(preference.groupBy);
  const [priorityFilter, setPriorityFilter] = React.useState<TodoPriority[]>([]);
  const [labelFilter, setLabelFilter] = React.useState<string[]>([]);
  const [extraFilters, setExtraFilters] = React.useState<TodoFilterDefinition>({});
  const [selection, setSelection] = React.useState<string[]>([]);
  const [expanded, setExpanded] = React.useState<string[]>([]);
  const [adding, setAdding] = React.useState(false);

  // Diálogos.
  const [detailTask, setDetailTask] = React.useState<TodoTask | null>(null);
  const [projectDialog, setProjectDialog] = React.useState<{ open: boolean; project: TodoProject | null }>({ open: false, project: null });
  const [deleteProject, setDeleteProject] = React.useState<TodoProject | null>(null);
  const [sectionDialog, setSectionDialog] = React.useState<{
    projectId: string;
    sectionId: string | null;
  } | null>(null);
  const [deleteSection, setDeleteSection] = React.useState<{
    id: string;
    taskCount: number;
  } | null>(null);
  const [labelDialog, setLabelDialog] = React.useState<{ open: boolean; label: TodoLabel | null }>({ open: false, label: null });
  const [moveTask, setMoveTask] = React.useState<TodoTask | null>(null);
  const [pickDateTask, setPickDateTask] = React.useState<TodoTask | null>(null);
  const [subtaskTask, setSubtaskTask] = React.useState<TodoTask | null>(null);
  const [saveFilterDialog, setSaveFilterDialog] = React.useState<{
    open: boolean;
    filter: TodoSavedFilter | null;
  }>({ open: false, filter: null });

  /* ── Ordem manual de projetos, etiquetas e filtros (UI otimista) ──
   * A lista reordena na hora e volta a seguir o servidor no próximo revalidate.
   * Ajuste durante o render comparando a prop anterior — o lint do React 19 do
   * projeto proíbe useEffect para espelhar props. Mesmo padrão de hábitos/rotinas. */
  const [orderedProjects, setOrderedProjects] = React.useState(projects);
  const [prevProjects, setPrevProjects] = React.useState(projects);
  if (projects !== prevProjects) {
    setPrevProjects(projects);
    setOrderedProjects(projects);
  }

  const [orderedLabels, setOrderedLabels] = React.useState(labels);
  const [prevLabels, setPrevLabels] = React.useState(labels);
  if (labels !== prevLabels) {
    setPrevLabels(labels);
    setOrderedLabels(labels);
  }

  const [orderedFilters, setOrderedFilters] = React.useState(savedFilters);
  const [prevFilters, setPrevFilters] = React.useState(savedFilters);
  if (savedFilters !== prevFilters) {
    setPrevFilters(savedFilters);
    setOrderedFilters(savedFilters);
  }

  // Abre o painel quando a URL traz `?task=<id>` (link vindo da busca global ou de uma
  // notificação). Sincroniza no render, guardado por "id já processado" — o projeto
  // evita useEffect para espelhar props (exigência do lint do React 19).
  const [handledTaskParam, setHandledTaskParam] = React.useState<string | null>(null);
  if (openTaskId && handledTaskParam !== openTaskId) {
    setHandledTaskParam(openTaskId);
    const target = tasks.find((t) => t.id === openTaskId);
    if (target) setDetailTask(target);
  }
  if (!openTaskId && handledTaskParam !== null) setHandledTaskParam(null);

  /* ── Atalho de teclado: "T" abre a criação rápida ──
     Escolhido por não colidir com nada já usado no app (o lançamento rápido global é
     por botão, e "Q" não está livre em todos os navegadores para busca rápida). */
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const typing =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setAdding(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── Contexto da rota ── */
  const currentProject =
    route.kind === "projeto" ? (projects.find((p) => p.id === route.id) ?? null) : null;
  const currentLabel =
    route.kind === "etiqueta" ? (labels.find((l) => l.id === route.id) ?? null) : null;
  const currentFilter =
    route.kind === "filtro" ? (savedFilters.find((f) => f.id === route.id) ?? null) : null;

  /* ── Filtro efetivo ── */
  const filterDefinition = React.useMemo<TodoFilterDefinition>(() => {
    const base: TodoFilterDefinition = { ...(currentFilter?.definition ?? {}), ...extraFilters };

    if (search.trim()) base.search = search.trim();
    if (priorityFilter.length) base.priorities = priorityFilter;
    if (labelFilter.length) base.labelIds = labelFilter;

    switch (route.kind) {
      case "view":
        if (route.value === "concluidas") {
          base.statuses = ["concluida"];
          base.includeCompleted = true;
        } else if (showCompleted) {
          base.includeCompleted = true;
        }
        break;
      case "projeto":
        base.projectIds = [route.id];
        if (showCompleted) base.includeCompleted = true;
        break;
      case "etiqueta":
        base.labelIds = [...(base.labelIds ?? []), route.id];
        if (showCompleted) base.includeCompleted = true;
        break;
      default:
        if (showCompleted) base.includeCompleted = true;
    }
    return base;
  }, [currentFilter, extraFilters, search, priorityFilter, labelFilter, route, showCompleted]);

  /* ── Lista visível ── */
  const visibleTasks = React.useMemo(() => {
    let list = filterTasks(tasks, filterDefinition, todayIso);

    if (route.kind === "view") {
      if (route.value === "entrada") list = list.filter(isInbox);
      else if (route.value === "hoje")
        list = list.filter(
          (t) => isDueToday(t, todayIso) || isOverdue(t, todayIso) || isCompletedToday(t, todayIso),
        );
      else if (route.value === "proximos") list = list.filter((t) => isUpcoming(t, todayIso));
    }
    return sortTasks(list, sortBy, sortBy === "prioridade" ? "asc" : "asc");
  }, [tasks, filterDefinition, route, todayIso, sortBy]);

  /* ── Contadores da navegação ── */
  const navCounts = React.useMemo<TodoNavCounts>(() => {
    const open = tasks.filter((t) => t.status === "pendente" || t.status === "em_andamento");
    return {
      entrada: open.filter(isInbox).length,
      hoje: open.filter((t) => isDueToday(t, todayIso) || isOverdue(t, todayIso)).length,
      proximos: open.filter((t) => isUpcoming(t, todayIso)).length,
      todas: open.length,
      atrasadas: summary.overdue,
    };
  }, [tasks, todayIso, summary.overdue]);

  /* ── Ações ── */
  function run(promise: Promise<{ ok: boolean; error?: string }>, success?: string) {
    startTransition(async () => {
      const res = await promise;
      if (res.ok) {
        if (success) toast.success(success);
        router.refresh();
      } else {
        toast.error(res.error ?? "Não foi possível concluir a ação.");
      }
    });
  }

  const toggleComplete = React.useCallback(
    (task: TodoTask) => {
      if (task.status === "concluida") {
        run(reopenTodoTask(task.id), "Tarefa reaberta.");
        return;
      }
      const pendingSubtasks = task.subtaskCount - task.subtaskDoneCount;
      if (pendingSubtasks > 0) {
        // Regra da fase: concluir mãe com subtarefas pendentes SEMPRE pergunta.
        toast("Esta tarefa tem subtarefas pendentes", {
          description: `${pendingSubtasks} subtarefa(s) ainda em aberto. O que fazer?`,
          duration: 10000,
          action: {
            label: "Concluir tudo",
            onClick: () => run(completeTodoTask(task.id, true), "Tarefa e subtarefas concluídas."),
          },
          cancel: {
            label: "Só esta",
            onClick: () => run(completeTodoTask(task.id, false), "Tarefa concluída."),
          },
        });
        return;
      }
      startTransition(async () => {
        const res = await completeTodoTask(task.id);
        if (!res.ok) {
          toast.error(res.error ?? "Não foi possível concluir.");
          return;
        }
        if (res.data.recurred && res.data.nextDate) {
          toast.success(`Concluída. Próxima ocorrência em ${formatDate(res.data.nextDate)}.`);
        } else {
          toast.success("Tarefa concluída.", {
            action: {
              label: "Desfazer",
              onClick: () => run(reopenTodoTask(task.id), "Conclusão desfeita."),
            },
          });
        }
        router.refresh();
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router],
  );

  const rowActions: TaskRowActions = {
    onOpen: (task) => setDetailTask(task),
    onToggleComplete: toggleComplete,
    onSnooze: (task, days) =>
      run(snoozeTodoTask(task.id, days), days === 1 ? "Adiada para amanhã." : `Adiada ${days} dias.`),
    onPickDate: (task) => setPickDateTask(task),
    onPriority: (task, priority) => run(setTodoPriority(task.id, priority), "Prioridade alterada."),
    onMove: (task) => setMoveTask(task),
    onDuplicate: (task) => run(duplicateTodoTask(task.id), "Tarefa duplicada."),
    onMakeSubtask: (task) => setSubtaskTask(task),
    onPromote: (task) => run(setTodoParent(task.id, null), "Agora é uma tarefa principal."),
    onArchive: (task) => run(archiveTodoTask(task.id, true), "Tarefa arquivada."),
    onDelete: (task) => {
      const extra =
        task.subtaskCount > 0
          ? ` As ${task.subtaskCount} subtarefa(s) também serão excluídas.`
          : "";
      toast("Excluir esta tarefa?", {
        description: `“${task.title}”.${extra} Não há como desfazer.`,
        duration: 10000,
        action: {
          label: "Excluir",
          onClick: () => run(deleteTodoTask(task.id, "serie"), "Tarefa excluída."),
        },
        cancel: { label: "Cancelar", onClick: () => {} },
      });
    },
    onAddSubtask: (task) => setDetailTask(task),
  };

  /* ── Agrupamento ── */
  const lookups: TodoGroupLookups = React.useMemo(
    () => ({
      projectName: (id) => projects.find((p) => p.id === id)?.name ?? "Caixa de entrada",
      projectColor: (id) => projects.find((p) => p.id === id)?.color ?? null,
      sectionName: (id) => {
        for (const project of projects) {
          const section = project.sections.find((s) => s.id === id);
          if (section) return section.name;
        }
        return "Sem seção";
      },
      dateLabel: (iso) => {
        if (!iso) return "Sem data";
        const diff = daysBetween(todayIso, iso);
        if (diff === 0) return "Hoje";
        if (diff === 1) return "Amanhã";
        if (diff === -1) return "Ontem";
        return formatDate(iso);
      },
    }),
    [projects, todayIso],
  );

  const activeFilterCount = countActiveFilters({
    ...extraFilters,
    ...(priorityFilter.length ? { priorities: priorityFilter } : {}),
    ...(labelFilter.length ? { labelIds: labelFilter } : {}),
    ...(search.trim() ? { search } : {}),
  });

  function clearFilters() {
    setSearch("");
    setPriorityFilter([]);
    setLabelFilter([]);
    setExtraFilters({});
  }

  function persistPreference(patch: Partial<TodoPreference>) {
    const scope = currentProject ? `project:${currentProject.id}` : "global";
    run(
      saveTodoPreference({
        scope,
        view,
        sort_by: patch.sortBy ?? sortBy,
        group_by: patch.groupBy ?? groupBy,
        show_completed: patch.showCompleted ?? showCompleted,
      }),
    );
  }

  /* ── Reordenação manual (projetos, etiquetas, filtros, seções) ──
   * A navegação envia só os ids da lista visível; `reorderSubset` recoloca esse
   * pedaço no início do array completo para a UI otimista não perder ninguém. */
  function handleReorderProjects(ids: string[]) {
    setOrderedProjects((prev) => reorderSubset(prev, ids));
    startTransition(async () => {
      const res = await reorderTodoProjects(ids);
      if (!res.ok) {
        toast.error(res.error ?? "Não foi possível salvar a ordem dos projetos.");
        setOrderedProjects(projects);
        router.refresh();
      }
    });
  }

  function handleReorderLabels(ids: string[]) {
    setOrderedLabels((prev) => reorderSubset(prev, ids));
    startTransition(async () => {
      const res = await reorderTodoLabels(ids);
      if (!res.ok) {
        toast.error(res.error ?? "Não foi possível salvar a ordem das etiquetas.");
        setOrderedLabels(labels);
        router.refresh();
      }
    });
  }

  function handleReorderFilters(ids: string[]) {
    setOrderedFilters((prev) => reorderSubset(prev, ids));
    startTransition(async () => {
      const res = await reorderTodoSavedFilters(ids);
      if (!res.ok) {
        toast.error(res.error ?? "Não foi possível salvar a ordem dos filtros.");
        setOrderedFilters(savedFilters);
        router.refresh();
      }
    });
  }

  /** Move uma seção do projeto atual uma posição para a esquerda/direita. */
  function handleMoveSection(sectionId: string, direction: -1 | 1) {
    if (!currentProject) return;
    const ids = currentProject.sections.map((s) => s.id);
    const from = ids.indexOf(sectionId);
    const to = from + direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    run(reorderTodoSections(next));
  }

  /* ── Cabeçalho da visão ── */
  const headerInfo = getHeaderInfo(route, currentProject, currentLabel, currentFilter);

  return (
    <div className="flex gap-6">
      <TodoNav
        route={route}
        counts={navCounts}
        projects={orderedProjects}
        labels={orderedLabels}
        savedFilters={orderedFilters}
        onNavigate={goTo}
        onNewProject={() => setProjectDialog({ open: true, project: null })}
        onNewLabel={() => setLabelDialog({ open: true, label: null })}
        onManageFilters={() => setSaveFilterDialog({ open: true, filter: null })}
        onEditProject={(project) => setProjectDialog({ open: true, project })}
        onEditLabel={(label) => setLabelDialog({ open: true, label })}
        onEditFilter={(filter) => setSaveFilterDialog({ open: true, filter })}
        onReorderProjects={handleReorderProjects}
        onReorderLabels={handleReorderLabels}
        onReorderFilters={handleReorderFilters}
      />
      <TodoNavDrawer
        open={navOpen}
        onOpenChange={setNavOpen}
        route={route}
        counts={navCounts}
        projects={orderedProjects}
        labels={orderedLabels}
        savedFilters={orderedFilters}
        onNavigate={goTo}
        onNewProject={() => setProjectDialog({ open: true, project: null })}
        onNewLabel={() => setLabelDialog({ open: true, label: null })}
        onManageFilters={() => setSaveFilterDialog({ open: true, filter: null })}
        onEditProject={(project) => setProjectDialog({ open: true, project })}
        onEditLabel={(label) => setLabelDialog({ open: true, label })}
        onEditFilter={(filter) => setSaveFilterDialog({ open: true, filter })}
        onReorderProjects={handleReorderProjects}
        onReorderLabels={handleReorderLabels}
        onReorderFilters={handleReorderFilters}
      />

      <div className="min-w-0 flex-1 space-y-4">
        {/* Cabeçalho */}
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              className="mt-0.5 lg:hidden"
              aria-label="Abrir navegação do TO-DO"
              onClick={() => setNavOpen(true)}
            >
              <Menu />
            </Button>
            <PageHeader title={headerInfo.title} description={headerInfo.description} className="flex-1">
              {currentProject && (
                <ProjectMenu
                  project={currentProject}
                  onEdit={() => setProjectDialog({ open: true, project: currentProject })}
                  onNewSection={() =>
                    setSectionDialog({ projectId: currentProject.id, sectionId: null })
                  }
                  onDuplicate={() =>
                    run(duplicateTodoProject(currentProject.id), "Projeto duplicado.")
                  }
                  onFavorite={() =>
                    run(
                      toggleTodoProjectFavorite(currentProject.id, !currentProject.isFavorite),
                      currentProject.isFavorite ? "Removido dos favoritos." : "Adicionado aos favoritos.",
                    )
                  }
                  onArchive={() =>
                    run(archiveTodoProject(currentProject.id, true), "Projeto arquivado.")
                  }
                  onDelete={() => setDeleteProject(currentProject)}
                />
              )}
              <Button onClick={() => setAdding(true)}>
                <Plus /> Adicionar tarefa
              </Button>
            </PageHeader>
          </div>

          <TodoSummaryStrip summary={summary} />
        </div>

        {/* Barra de filtros / ordenação / visão */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar tarefas…"
              aria-label="Buscar tarefas"
              className="pl-8"
            />
          </div>

          <FilterMenu
            labels={labels}
            priorityFilter={priorityFilter}
            labelFilter={labelFilter}
            extraFilters={extraFilters}
            activeCount={activeFilterCount}
            onPriorityToggle={(p) =>
              setPriorityFilter((prev) =>
                prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
              )
            }
            onLabelToggle={(id) =>
              setLabelFilter((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
              )
            }
            onExtraToggle={(key) =>
              setExtraFilters((prev) => ({ ...prev, [key]: prev[key] ? null : true }))
            }
            onClear={clearFilters}
            onSave={() => setSaveFilterDialog({ open: true, filter: null })}
          />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <ArrowUpDown /> {TODO_SORT_LABELS[sortBy]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
              {TODO_SORTS.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={sortBy === s}
                  onCheckedChange={() => {
                    setSortBy(s);
                    persistPreference({ sortBy: s });
                  }}
                >
                  {TODO_SORT_LABELS[s]}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Group /> {TODO_GROUP_LABELS[groupBy]}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Agrupar por</DropdownMenuLabel>
              {TODO_GROUPS.map((g) => (
                <DropdownMenuCheckboxItem
                  key={g}
                  checked={groupBy === g}
                  onCheckedChange={() => {
                    setGroupBy(g);
                    persistPreference({ groupBy: g });
                  }}
                >
                  {TODO_GROUP_LABELS[g]}
                </DropdownMenuCheckboxItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={showCompleted}
                onCheckedChange={(checked) => {
                  setShowCompleted(checked === true);
                  persistPreference({ showCompleted: checked === true });
                }}
              >
                Mostrar concluídas
              </DropdownMenuCheckboxItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Alternador de visão — o quadro só faz sentido dentro de um projeto. */}
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-border p-0.5">
            {TODO_VIEWS.filter((v) => v !== "quadro" || currentProject).map((v) => {
              const Icon = v === "lista" ? List : v === "quadro" ? LayoutGrid : CalendarRange;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => navigate({ view: v })}
                  aria-pressed={view === v}
                  aria-label={TODO_VIEW_LABELS[v]}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs transition-colors",
                    view === v
                      ? "bg-primary/15 text-primary"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Ações em massa */}
        {selection.length > 0 && (
          <BulkBar
            count={selection.length}
            projects={projects}
            labels={labels}
            onClear={() => setSelection([])}
            onAction={(payload) =>
              startTransition(async () => {
                const res = await bulkTodoTasks({ ids: selection, ...payload });
                if (res.ok) {
                  toast.success(`${res.data.count} tarefa(s) atualizadas.`);
                  setSelection([]);
                  router.refresh();
                } else {
                  toast.error(res.error ?? "Não foi possível aplicar a ação.");
                }
              })
            }
          />
        )}

        {/* Criação rápida */}
        {adding && (
          <QuickTaskInput
            autoFocus
            projects={projects}
            labels={labels}
            todayIso={todayIso}
            defaultProjectId={currentProject?.id ?? null}
            defaultDate={route.kind === "view" && route.value === "hoje" ? todayIso : null}
            onDone={() => setAdding(false)}
            onCancel={() => setAdding(false)}
          />
        )}

        {/* Conteúdo */}
        {route.kind === "arquivados" ? (
          <ArchivedProjects
            projects={projects.filter((p) => p.status === "arquivado")}
            onRestore={(id) => run(archiveTodoProject(id, false), "Projeto restaurado.")}
            onOpen={(id) => goTo({ kind: "projeto", id })}
          />
        ) : view === "calendario" ? (
          <TaskCalendar
            tasks={visibleTasks}
            monthIso={monthIso}
            todayIso={todayIso}
            onMonthChange={(m) => navigate({ m })}
            onOpenTask={setDetailTask}
            onReschedule={(taskId, dateIso) =>
              run(rescheduleTodoTask(taskId, dateIso), "Tarefa reagendada.")
            }
            onCreateAt={() => setAdding(true)}
          />
        ) : view === "quadro" && currentProject ? (
          <TaskBoard
            columns={buildBoardColumns(currentProject, visibleTasks)}
            project={currentProject}
            projects={projects}
            labels={labels}
            todayIso={todayIso}
            onOpenTask={setDetailTask}
            onToggleComplete={toggleComplete}
            onMoveTask={(taskId, sectionId, position) =>
              run(
                moveTodoTask(taskId, {
                  project_id: currentProject.id,
                  section_id: sectionId,
                  position,
                }),
              )
            }
            onEditSection={(sectionId) =>
              setSectionDialog({ projectId: currentProject.id, sectionId })
            }
            onDeleteSection={(id, taskCount) => setDeleteSection({ id, taskCount })}
            onMoveSection={handleMoveSection}
          />
        ) : route.kind === "view" && route.value === "hoje" ? (
          <TodayView
            tasks={visibleTasks}
            todayIso={todayIso}
            projects={projects}
            actions={rowActions}
            selection={selection}
            onSelectionChange={setSelection}
            expanded={expanded}
            onToggleExpand={(id) =>
              setExpanded((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
              )
            }
            allTasks={tasks}
          />
        ) : (
          <GroupedList
            tasks={visibleTasks}
            allTasks={tasks}
            groupBy={groupBy}
            lookups={lookups}
            todayIso={todayIso}
            projects={projects}
            actions={rowActions}
            sortable={sortBy === "manual" && groupBy === "nenhum"}
            onReorder={(ids) => run(reorderTodoTasks(ids))}
            selection={selection}
            onSelectionChange={setSelection}
            expanded={expanded}
            onToggleExpand={(id) =>
              setExpanded((prev) =>
                prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
              )
            }
            emptyState={
              <EmptyState
                icon={headerInfo.icon}
                title={headerInfo.emptyTitle}
                description={headerInfo.emptyDescription}
              >
                <Button onClick={() => setAdding(true)}>
                  <Plus /> Adicionar tarefa
                </Button>
              </EmptyState>
            }
          />
        )}
      </div>

      {/* Diálogos e painel */}
      <TaskDetailSheet
        task={detailTask}
        open={detailTask !== null}
        onOpenChange={(open) => {
          if (open) return;
          setDetailTask(null);
          // Limpa o `?task=` para o painel não reabrir a cada navegação.
          if (openTaskId) navigate({ task: null });
        }}
        projects={projects}
        labels={labels}
        allTasks={tasks}
        userId={userId}
      />
      <ProjectDialog
        open={projectDialog.open}
        onOpenChange={(open) => setProjectDialog({ open, project: open ? projectDialog.project : null })}
        project={projectDialog.project}
        projects={projects}
      />
      <DeleteProjectDialog
        open={deleteProject !== null}
        onOpenChange={(open) => !open && setDeleteProject(null)}
        project={deleteProject}
        projects={projects}
      />
      <SectionDialog
        open={sectionDialog !== null}
        onOpenChange={(open) => !open && setSectionDialog(null)}
        projectId={sectionDialog?.projectId ?? ""}
        section={
          sectionDialog?.sectionId
            ? (currentProject?.sections.find((s) => s.id === sectionDialog.sectionId) ?? null)
            : null
        }
      />
      <DeleteSectionDialog
        open={deleteSection !== null}
        onOpenChange={(open) => !open && setDeleteSection(null)}
        section={
          deleteSection
            ? (currentProject?.sections.find((s) => s.id === deleteSection.id) ?? null)
            : null
        }
        siblings={
          currentProject?.sections.filter((s) => s.id !== deleteSection?.id) ?? []
        }
        taskCount={deleteSection?.taskCount ?? 0}
      />
      <LabelDialog
        open={labelDialog.open}
        onOpenChange={(open) => setLabelDialog({ open, label: open ? labelDialog.label : null })}
        label={labelDialog.label}
        labels={labels}
      />
      <MoveTaskDialog
        open={moveTask !== null}
        onOpenChange={(open) => !open && setMoveTask(null)}
        task={moveTask}
        projects={projects}
      />
      <PickDateDialog
        open={pickDateTask !== null}
        onOpenChange={(open) => !open && setPickDateTask(null)}
        task={pickDateTask}
      />
      <MakeSubtaskDialog
        open={subtaskTask !== null}
        onOpenChange={(open) => !open && setSubtaskTask(null)}
        task={subtaskTask}
        candidates={tasks}
      />
      <SaveFilterDialog
        open={saveFilterDialog.open}
        onOpenChange={(open) =>
          setSaveFilterDialog({ open, filter: open ? saveFilterDialog.filter : null })
        }
        definition={filterDefinition}
        filter={saveFilterDialog.filter}
      />
    </div>
  );
}

/* ───────────────────────────── Cabeçalho da visão ───────────────────────────── */

function getHeaderInfo(
  route: TodoRoute,
  project: TodoProject | null,
  label: TodoLabel | null,
  filter: TodoSavedFilter | null,
) {
  if (route.kind === "projeto" && project) {
    return {
      title: project.name,
      description:
        project.description ??
        `${project.openTasks} pendente(s) · ${project.completedTasks} concluída(s)`,
      icon: ListTodo,
      emptyTitle: "Projeto sem tarefas",
      emptyDescription: "Adicione a primeira tarefa para começar a organizar este projeto.",
    };
  }
  if (route.kind === "etiqueta" && label) {
    return {
      title: `@${label.name}`,
      description: label.description ?? `${label.taskCount} tarefa(s) com esta etiqueta`,
      icon: Tag,
      emptyTitle: "Nenhuma tarefa com esta etiqueta",
      emptyDescription: "Marque tarefas com esta etiqueta para vê-las agrupadas aqui.",
    };
  }
  if (route.kind === "filtro" && filter) {
    return {
      title: filter.name,
      description: filter.description ?? "Filtro salvo",
      icon: FilterIcon,
      emptyTitle: "Nenhuma tarefa neste filtro",
      emptyDescription: "Ajuste as regras do filtro ou crie tarefas que se encaixem nele.",
    };
  }
  if (route.kind === "arquivados") {
    return {
      title: "Projetos arquivados",
      description: "Projetos fora de circulação. Podem ser restaurados a qualquer momento.",
      icon: Archive,
      emptyTitle: "Nenhum projeto arquivado",
      emptyDescription: "Projetos arquivados aparecem aqui.",
    };
  }

  const value = route.kind === "view" ? route.value : "todas";
  switch (value) {
    case "entrada":
      return {
        title: "Caixa de entrada",
        description: "Tudo o que você capturou e ainda não organizou em um projeto.",
        icon: Inbox,
        emptyTitle: "Caixa de entrada vazia",
        emptyDescription: "Nada pendente de organização. Capture novas ideias assim que surgirem.",
      };
    case "hoje":
      return {
        title: "Hoje",
        description: "O que vence hoje, o que ficou para trás e o que já saiu do caminho.",
        icon: Sun,
        emptyTitle: "Nenhuma tarefa para hoje",
        emptyDescription: "Aproveite o dia ou adicione uma nova tarefa.",
      };
    case "proximos":
      return {
        title: "Próximos",
        description: "Planejamento dos próximos dias e semanas.",
        icon: CalendarRange,
        emptyTitle: "Nada agendado à frente",
        emptyDescription: "Programe tarefas com data para vê-las aqui.",
      };
    case "concluidas":
      return {
        title: "Concluídas",
        description: "Histórico do que já foi entregue.",
        icon: CheckCheck,
        emptyTitle: "Nenhuma tarefa concluída ainda",
        emptyDescription: "As tarefas que você concluir aparecem aqui.",
      };
    default:
      return {
        title: "Todas as tarefas",
        description: "Visão geral de tudo, com filtros combináveis.",
        icon: ListTodo,
        emptyTitle: "Nenhuma tarefa encontrada",
        emptyDescription: "Ajuste os filtros ou crie a primeira tarefa.",
      };
  }
}

/* ───────────────────────────── Indicadores ───────────────────────────── */

function TodoSummaryStrip({ summary }: { summary: TodoSummary }) {
  const items = [
    { label: "Pendentes", value: summary.pending },
    { label: "Para hoje", value: summary.dueToday },
    { label: "Atrasadas", value: summary.overdue, danger: summary.overdue > 0 },
    { label: "Urgentes (P1)", value: summary.p1 },
    { label: "Concluídas hoje", value: summary.completedToday },
    { label: "Conclusão na semana", value: `${summary.weeklyCompletionRate}%` },
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "rounded-lg border border-border bg-card px-2.5 py-1.5",
            item.danger && "border-destructive/30",
          )}
        >
          <p className="text-[0.65rem] text-muted-foreground">{item.label}</p>
          <p
            className={cn(
              "text-sm font-semibold tabular-nums",
              item.danger && "text-destructive",
            )}
          >
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ───────────────────────────── Menu do projeto ───────────────────────────── */

function ProjectMenu({
  project,
  onEdit,
  onNewSection,
  onDuplicate,
  onFavorite,
  onArchive,
  onDelete,
}: {
  project: TodoProject;
  onEdit: () => void;
  onNewSection: () => void;
  onDuplicate: () => void;
  onFavorite: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label={`Ações do projeto ${project.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil /> Editar projeto
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onNewSection}>
          <Plus /> Nova seção
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onDuplicate}>
          <Copy /> Duplicar projeto (sem as tarefas)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onFavorite}>
          <Star /> {project.isFavorite ? "Remover dos favoritos" : "Favoritar"}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onArchive}>
          <Archive /> Arquivar projeto
        </DropdownMenuItem>
        <DropdownMenuItem variant="destructive" onClick={onDelete}>
          <Trash2 /> Excluir projeto
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ───────────────────────────── Filtros ───────────────────────────── */

const EXTRA_FILTER_OPTIONS: { key: keyof TodoFilterDefinition; label: string }[] = [
  { key: "onlyOverdue", label: "Atrasadas" },
  { key: "onlyToday", label: "De hoje" },
  { key: "onlyUpcoming", label: "Futuras" },
  { key: "onlyNoDate", label: "Sem data" },
  { key: "onlyRecurring", label: "Recorrentes" },
  { key: "onlyWithReminder", label: "Com lembrete" },
  { key: "onlyWithComments", label: "Com comentário" },
  { key: "onlyWithAttachments", label: "Com anexo" },
  { key: "onlyParents", label: "Só tarefas principais" },
  { key: "onlySubtasks", label: "Só subtarefas" },
];

function FilterMenu({
  labels,
  priorityFilter,
  labelFilter,
  extraFilters,
  activeCount,
  onPriorityToggle,
  onLabelToggle,
  onExtraToggle,
  onClear,
  onSave,
}: {
  labels: TodoLabel[];
  priorityFilter: TodoPriority[];
  labelFilter: string[];
  extraFilters: TodoFilterDefinition;
  activeCount: number;
  onPriorityToggle: (p: TodoPriority) => void;
  onLabelToggle: (id: string) => void;
  onExtraToggle: (key: keyof TodoFilterDefinition) => void;
  onClear: () => void;
  onSave: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <FilterIcon /> Filtros
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/15 px-1.5 text-[0.7rem] text-primary">
              {activeCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[70vh] w-60 overflow-y-auto">
        <DropdownMenuLabel>Prioridade</DropdownMenuLabel>
        {TODO_PRIORITIES.map((p) => (
          <DropdownMenuCheckboxItem
            key={p}
            checked={priorityFilter.includes(p)}
            onCheckedChange={() => onPriorityToggle(p)}
          >
            <span className="inline-flex items-center gap-1.5">
              <PriorityFlag priority={p} />
              {TODO_PRIORITY_LABELS[p]}
            </span>
          </DropdownMenuCheckboxItem>
        ))}

        {labels.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Etiquetas</DropdownMenuLabel>
            {labels.map((label) => (
              <DropdownMenuCheckboxItem
                key={label.id}
                checked={labelFilter.includes(label.id)}
                onCheckedChange={() => onLabelToggle(label.id)}
              >
                <span className="inline-flex items-center gap-1.5">
                  <ColorDot color={label.color} />@{label.name}
                </span>
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Situação</DropdownMenuLabel>
        {EXTRA_FILTER_OPTIONS.map((option) => (
          <DropdownMenuCheckboxItem
            key={String(option.key)}
            checked={extraFilters[option.key] === true}
            onCheckedChange={() => onExtraToggle(option.key)}
          >
            {option.label}
          </DropdownMenuCheckboxItem>
        ))}

        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onSave}>
          <Star /> Salvar este filtro
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onClear}>
          <X /> Limpar filtros
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ───────────────────────────── Ações em massa ───────────────────────────── */

function BulkBar({
  count,
  projects,
  labels,
  onClear,
  onAction,
}: {
  count: number;
  projects: TodoProject[];
  labels: TodoLabel[];
  onClear: () => void;
  onAction: (payload: Record<string, unknown>) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
      <span className="text-sm font-medium">{count} selecionada(s)</span>
      <Separator orientation="vertical" className="h-5" />

      <Button size="sm" variant="outline" onClick={() => onAction({ action: "concluir" })}>
        <CheckCheck /> Concluir
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAction({ action: "reabrir" })}>
        <RotateCcw /> Reabrir
      </Button>
      <Button size="sm" variant="outline" onClick={() => onAction({ action: "adiar", days: 1 })}>
        <Sun /> Adiar 1 dia
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">
            <MoreHorizontal /> Mais
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-[60vh] w-56 overflow-y-auto">
          <DropdownMenuLabel>Prioridade</DropdownMenuLabel>
          {TODO_PRIORITIES.map((p) => (
            <DropdownMenuItem
              key={p}
              onClick={() => onAction({ action: "prioridade", priority: p })}
            >
              <PriorityFlag priority={p} />
              {TODO_PRIORITY_LABELS[p]}
            </DropdownMenuItem>
          ))}

          <DropdownMenuSeparator />
          <DropdownMenuLabel>Mover para projeto</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => onAction({ action: "mover_projeto", project_id: null })}>
            <Inbox /> Caixa de entrada
          </DropdownMenuItem>
          {projects
            .filter((p) => p.status === "ativo")
            .map((p) => (
              <DropdownMenuItem
                key={p.id}
                onClick={() => onAction({ action: "mover_projeto", project_id: p.id })}
              >
                <ColorDot color={p.color} />
                {p.name}
              </DropdownMenuItem>
            ))}

          {labels.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Etiquetas</DropdownMenuLabel>
              {labels.map((label) => (
                <DropdownMenuItem
                  key={label.id}
                  onClick={() => onAction({ action: "adicionar_etiqueta", label_id: label.id })}
                >
                  <ColorDot color={label.color} />
                  Aplicar @{label.name}
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onAction({ action: "arquivar" })}>
            <Archive /> Arquivar
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={() => {
              toast("Excluir as tarefas selecionadas?", {
                description: `${count} tarefa(s) serão apagadas. Não há como desfazer.`,
                duration: 10000,
                action: { label: "Excluir", onClick: () => onAction({ action: "excluir" }) },
                cancel: { label: "Cancelar", onClick: () => {} },
              });
            }}
          >
            <Trash2 /> Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button size="sm" variant="ghost" className="ml-auto" onClick={onClear}>
        <X /> Limpar seleção
      </Button>
    </div>
  );
}

/* ───────────────────────────── Listas ───────────────────────────── */

function GroupedList({
  tasks,
  allTasks,
  groupBy,
  lookups,
  todayIso,
  projects,
  actions,
  sortable,
  onReorder,
  selection,
  onSelectionChange,
  expanded,
  onToggleExpand,
  emptyState,
}: {
  tasks: TodoTask[];
  allTasks: TodoTask[];
  groupBy: TodoGroup;
  lookups: TodoGroupLookups;
  todayIso: string;
  projects: TodoProject[];
  actions: TaskRowActions;
  sortable: boolean;
  onReorder: (ids: string[]) => void;
  selection: string[];
  onSelectionChange: (ids: string[]) => void;
  expanded: string[];
  onToggleExpand: (id: string) => void;
  emptyState: React.ReactNode;
}) {
  if (tasks.length === 0) return <>{emptyState}</>;

  const groups = groupTasks(tasks, groupBy, lookups, todayIso);

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.key} className="space-y-2">
          {group.label && (
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              {group.color && <ColorDot color={group.color} />}
              {group.label}
              <span className="text-xs font-normal text-muted-foreground">
                ({group.tasks.length})
              </span>
            </h2>
          )}
          <TaskTreeList
            tasks={group.tasks}
            allTasks={allTasks}
            todayIso={todayIso}
            projects={projects}
            actions={actions}
            sortable={sortable}
            onReorder={onReorder}
            selection={selection}
            onSelectionChange={onSelectionChange}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
          />
        </section>
      ))}
    </div>
  );
}

/** Lista com subtarefas aninhadas e (opcionalmente) arrastáveis. */
function TaskTreeList({
  tasks,
  allTasks,
  todayIso,
  projects,
  actions,
  sortable,
  onReorder,
  selection,
  onSelectionChange,
  expanded,
  onToggleExpand,
}: {
  tasks: TodoTask[];
  allTasks: TodoTask[];
  todayIso: string;
  projects: TodoProject[];
  actions: TaskRowActions;
  sortable: boolean;
  onReorder: (ids: string[]) => void;
  selection: string[];
  onSelectionChange: (ids: string[]) => void;
  expanded: string[];
  onToggleExpand: (id: string) => void;
}) {
  const tree = buildTaskTree(tasks);
  const selectionMode = selection.length > 0;

  const toggleSelected = (id: string, checked: boolean) => {
    onSelectionChange(checked ? [...selection, id] : selection.filter((x) => x !== id));
  };

  const renderRow = (task: TodoTask, handle?: React.ReactNode, depth = 0) => {
    const children = allTasks.filter((t) => t.parentTaskId === task.id);
    const isExpanded = expanded.includes(task.id);
    return (
      <div key={task.id} className="space-y-1.5">
        <TaskRow
          task={task}
          todayIso={todayIso}
          projects={projects}
          actions={actions}
          handle={handle}
          depth={depth}
          selectionMode={selectionMode}
          selected={selection.includes(task.id)}
          onSelectedChange={(checked) => toggleSelected(task.id, checked)}
          expandable={children.length > 0}
          expanded={isExpanded}
          onToggleExpand={() => onToggleExpand(task.id)}
        />
        {isExpanded &&
          children.map((child) => renderRow(child, undefined, depth + 1))}
      </div>
    );
  };

  if (sortable) {
    return (
      <SortableList
        items={tree}
        getId={(t) => t.id}
        onReorder={onReorder}
        renderItem={(task, handle) => renderRow(task, handle)}
        className="space-y-1.5"
      />
    );
  }

  return (
    <div className="space-y-1.5">
      {tree.map((task) => renderRow(task))}
      {/* Seleção múltipla: caixa de "selecionar" some quando nada está marcado, então
          oferecemos um jeito explícito de entrar no modo. */}
      {!selectionMode && tasks.length > 1 && (
        <button
          type="button"
          onClick={() => onSelectionChange([tasks[0].id])}
          className="flex items-center gap-2 px-1 pt-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <Checkbox checked={false} aria-hidden className="pointer-events-none" />
          Selecionar várias tarefas
        </button>
      )}
    </div>
  );
}

/** Visão "Hoje": separa Atrasadas · Hoje · Concluídas hoje. */
function TodayView({
  tasks,
  todayIso,
  projects,
  actions,
  selection,
  onSelectionChange,
  expanded,
  onToggleExpand,
  allTasks,
}: {
  tasks: TodoTask[];
  todayIso: string;
  projects: TodoProject[];
  actions: TaskRowActions;
  selection: string[];
  onSelectionChange: (ids: string[]) => void;
  expanded: string[];
  onToggleExpand: (id: string) => void;
  allTasks: TodoTask[];
}) {
  const overdue = tasks.filter((t) => isOverdue(t, todayIso));
  const today = tasks.filter((t) => isDueToday(t, todayIso));
  const done = tasks.filter((t) => isCompletedToday(t, todayIso));

  if (tasks.length === 0) {
    return (
      <EmptyState
        icon={Sun}
        title="Nenhuma tarefa para hoje"
        description="Aproveite o dia ou adicione uma nova tarefa."
      />
    );
  }

  const sections = [
    { key: "atrasadas", title: "Atrasadas", tasks: overdue, danger: true },
    { key: "hoje", title: "Hoje", tasks: today, danger: false },
    { key: "concluidas", title: "Concluídas hoje", tasks: done, danger: false },
  ].filter((s) => s.tasks.length > 0);

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section.key} className="space-y-2">
          <h2
            className={cn(
              "text-sm font-semibold",
              section.danger && "text-destructive",
            )}
          >
            {section.title}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">
              ({section.tasks.length})
            </span>
          </h2>
          <TaskTreeList
            tasks={section.tasks}
            allTasks={allTasks}
            todayIso={todayIso}
            projects={projects}
            actions={actions}
            sortable={false}
            onReorder={() => {}}
            selection={selection}
            onSelectionChange={onSelectionChange}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
          />
        </section>
      ))}
    </div>
  );
}

/* ───────────────────────────── Projetos arquivados ───────────────────────────── */

function ArchivedProjects({
  projects,
  onRestore,
  onOpen,
}: {
  projects: TodoProject[];
  onRestore: (id: string) => void;
  onOpen: (id: string) => void;
}) {
  if (projects.length === 0) {
    return (
      <EmptyState
        icon={Archive}
        title="Nenhum projeto arquivado"
        description="Projetos que você arquivar aparecem aqui e podem ser restaurados."
      />
    );
  }
  return (
    <ul className="space-y-2">
      {projects.map((project) => (
        <li
          key={project.id}
          className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2"
        >
          <ColorDot color={project.color} />
          <button
            type="button"
            onClick={() => onOpen(project.id)}
            className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline"
          >
            {project.name}
          </button>
          <span className="text-xs text-muted-foreground">
            {project.totalTasks} tarefa(s)
          </span>
          <Button variant="outline" size="sm" onClick={() => onRestore(project.id)}>
            <RotateCcw /> Restaurar
          </Button>
        </li>
      ))}
    </ul>
  );
}

/* ───────────────────────────── Kanban helpers ───────────────────────────── */

function buildBoardColumns(project: TodoProject, tasks: TodoTask[]): BoardColumn[] {
  const sections = project.sections.filter((s) => !s.archivedAt);
  const columns: BoardColumn[] = sections.map((section) => ({
    id: section.id,
    title: section.name,
    tasks: tasks
      .filter((t) => t.sectionId === section.id && t.parentTaskId === null)
      .sort((a, b) => a.position - b.position),
  }));

  columns.push({
    id: NO_SECTION,
    title: "Sem seção",
    tasks: tasks
      .filter((t) => t.sectionId === null && t.parentTaskId === null)
      .sort((a, b) => a.position - b.position),
  });

  return columns;
}
