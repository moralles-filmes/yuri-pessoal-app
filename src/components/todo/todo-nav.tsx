"use client";

/**
 * Fase 15 — Módulo TO-DO · Navegação interna.
 *
 * Coluna fixa no desktop; no celular vira uma gaveta (Sheet) aberta por um botão no
 * cabeçalho — assim as visões e os projetos continuam a um toque, sem espremer a tela.
 *
 * Projetos, etiquetas e filtros salvos são reordenáveis por arraste (`SortableList`,
 * o mesmo de hábitos/rotinas): a alça tem suporte a teclado e a toque, então o arraste
 * nunca é o único caminho. Cada linha tem também um botão "editar" SEMPRE visível —
 * nada depende de hover, que não existe em telas de toque.
 */
import * as React from "react";
import {
  Archive,
  CalendarRange,
  CheckCheck,
  ChevronDown,
  Filter,
  Inbox,
  ListTodo,
  Pencil,
  Plus,
  Star,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SortableList } from "@/components/shared/sortable-list";
import { cn } from "@/lib/utils";
import { ColorDot } from "@/components/todo/badges";
import type { TodoLabel, TodoProject, TodoSavedFilter } from "@/lib/todo/types";

export type TodoRoute =
  | { kind: "view"; value: "entrada" | "hoje" | "proximos" | "todas" | "concluidas" }
  | { kind: "projeto"; id: string }
  | { kind: "etiqueta"; id: string }
  | { kind: "filtro"; id: string }
  | { kind: "arquivados" };

export interface TodoNavCounts {
  entrada: number;
  hoje: number;
  proximos: number;
  todas: number;
  atrasadas: number;
}

function sameRoute(a: TodoRoute, b: TodoRoute): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "view" && b.kind === "view") return a.value === b.value;
  if (a.kind === "arquivados") return true;
  return "id" in a && "id" in b && a.id === b.id;
}

/**
 * Linha da navegação. A alça de arraste e o botão "editar" são IRMÃOS do botão de
 * navegação (nunca aninhados dentro dele) — botão dentro de botão é HTML inválido e
 * quebra teclado e leitores de tela.
 */
function NavButton({
  active,
  icon: Icon,
  label,
  count,
  danger,
  dot,
  onClick,
  handle,
  action,
}: {
  active: boolean;
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  count?: number;
  danger?: boolean;
  dot?: React.ReactNode;
  onClick: () => void;
  /** Alça de arraste fornecida pelo `SortableList`. */
  handle?: React.ReactNode;
  /** Ação secundária (editar) à direita. */
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "group flex items-center rounded-lg transition-colors",
        active ? "bg-sidebar-accent" : "hover:bg-muted",
        handle && "pl-1",
        action && "pr-1",
      )}
    >
      {handle}
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          handle ? "pr-1 pl-0.5" : "px-2.5",
          active
            ? "font-medium text-sidebar-accent-foreground"
            : "text-muted-foreground group-hover:text-foreground",
        )}
      >
        {Icon && <Icon className="size-4 shrink-0" />}
        {dot}
        <span className="min-w-0 flex-1 truncate text-left">{label}</span>
        {count !== undefined && count > 0 && (
          <span
            className={cn(
              "shrink-0 rounded-full px-1.5 py-0.5 text-[0.7rem] tabular-nums",
              danger ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground",
            )}
          >
            {count}
          </span>
        )}
      </button>
      {action}
    </div>
  );
}

/** Botão "editar" da linha — sempre visível (telas de toque não têm hover). */
function NavEditAction({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={label}
      onClick={onClick}
      className="shrink-0 text-muted-foreground/50 hover:text-foreground"
    >
      <Pencil />
    </Button>
  );
}

function NavSection({
  title,
  action,
  children,
  defaultOpen = true,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-1 px-2.5 py-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-1 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase transition-colors hover:text-foreground"
        >
          <ChevronDown className={cn("size-3 transition-transform", !open && "-rotate-90")} />
          {title}
        </button>
        {action}
      </div>
      {open && <div className="space-y-0.5">{children}</div>}
    </div>
  );
}

function NavContent({
  route,
  counts,
  projects,
  labels,
  savedFilters,
  onNavigate,
  onNewProject,
  onNewLabel,
  onManageFilters,
  onEditProject,
  onEditLabel,
  onEditFilter,
  onReorderProjects,
  onReorderLabels,
  onReorderFilters,
}: {
  route: TodoRoute;
  counts: TodoNavCounts;
  projects: TodoProject[];
  labels: TodoLabel[];
  savedFilters: TodoSavedFilter[];
  onNavigate: (route: TodoRoute) => void;
  onNewProject: () => void;
  onNewLabel: () => void;
  onManageFilters: () => void;
  onEditProject: (project: TodoProject) => void;
  onEditLabel: (label: TodoLabel) => void;
  onEditFilter: (filter: TodoSavedFilter) => void;
  /** Recebem apenas os ids da lista visível, na nova ordem. */
  onReorderProjects: (ids: string[]) => void;
  onReorderLabels: (ids: string[]) => void;
  onReorderFilters: (ids: string[]) => void;
}) {
  const active = projects.filter((p) => p.status === "ativo");
  const archived = projects.filter((p) => p.status === "arquivado");
  const favorites = active.filter((p) => p.isFavorite);
  const navFilters = savedFilters.filter((f) => f.showInNav);

  return (
    <nav aria-label="Navegação do TO-DO" className="space-y-3">
      <div className="space-y-0.5">
        <NavButton
          active={sameRoute(route, { kind: "view", value: "entrada" })}
          icon={Inbox}
          label="Caixa de entrada"
          count={counts.entrada}
          onClick={() => onNavigate({ kind: "view", value: "entrada" })}
        />
        <NavButton
          active={sameRoute(route, { kind: "view", value: "hoje" })}
          icon={Sun}
          label="Hoje"
          count={counts.hoje}
          danger={counts.atrasadas > 0}
          onClick={() => onNavigate({ kind: "view", value: "hoje" })}
        />
        <NavButton
          active={sameRoute(route, { kind: "view", value: "proximos" })}
          icon={CalendarRange}
          label="Próximos"
          count={counts.proximos}
          onClick={() => onNavigate({ kind: "view", value: "proximos" })}
        />
        <NavButton
          active={sameRoute(route, { kind: "view", value: "todas" })}
          icon={ListTodo}
          label="Todas as tarefas"
          count={counts.todas}
          onClick={() => onNavigate({ kind: "view", value: "todas" })}
        />
        <NavButton
          active={sameRoute(route, { kind: "view", value: "concluidas" })}
          icon={CheckCheck}
          label="Concluídas"
          onClick={() => onNavigate({ kind: "view", value: "concluidas" })}
        />
      </div>

      {favorites.length > 0 && (
        <NavSection title="Favoritos">
          {favorites.map((project) => (
            <NavButton
              key={project.id}
              active={sameRoute(route, { kind: "projeto", id: project.id })}
              dot={<ColorDot color={project.color} />}
              label={project.name}
              count={project.openTasks}
              onClick={() => onNavigate({ kind: "projeto", id: project.id })}
            />
          ))}
        </NavSection>
      )}

      <NavSection
        title="Projetos"
        action={
          <Button variant="ghost" size="icon-xs" aria-label="Novo projeto" onClick={onNewProject}>
            <Plus />
          </Button>
        }
      >
        {active.length === 0 ? (
          <p className="px-2.5 py-1 text-xs text-muted-foreground">
            Nenhum projeto ainda.
          </p>
        ) : (
          <SortableList
            items={active}
            getId={(project) => project.id}
            onReorder={onReorderProjects}
            className="space-y-0.5"
            renderItem={(project, handle) => (
              <NavButton
                handle={handle}
                action={
                  <NavEditAction
                    label={`Editar projeto ${project.name}`}
                    onClick={() => onEditProject(project)}
                  />
                }
                active={sameRoute(route, { kind: "projeto", id: project.id })}
                dot={
                  <span className="inline-flex items-center gap-1">
                    <ColorDot color={project.color} />
                    {project.isFavorite && (
                      <Star className="size-3 fill-primary text-primary" aria-hidden />
                    )}
                  </span>
                }
                label={project.name}
                count={project.openTasks}
                onClick={() => onNavigate({ kind: "projeto", id: project.id })}
              />
            )}
          />
        )}
        {archived.length > 0 && (
          <NavButton
            active={sameRoute(route, { kind: "arquivados" })}
            icon={Archive}
            label={`Projetos arquivados (${archived.length})`}
            onClick={() => onNavigate({ kind: "arquivados" })}
          />
        )}
      </NavSection>

      <NavSection
        title="Etiquetas"
        action={
          <Button variant="ghost" size="icon-xs" aria-label="Nova etiqueta" onClick={onNewLabel}>
            <Plus />
          </Button>
        }
        defaultOpen={labels.length > 0}
      >
        {labels.length === 0 ? (
          <p className="px-2.5 py-1 text-xs text-muted-foreground">
            Nenhuma etiqueta ainda.
          </p>
        ) : (
          <SortableList
            items={labels}
            getId={(label) => label.id}
            onReorder={onReorderLabels}
            className="space-y-0.5"
            renderItem={(label, handle) => (
              <NavButton
                handle={handle}
                action={
                  <NavEditAction
                    label={`Editar etiqueta ${label.name}`}
                    onClick={() => onEditLabel(label)}
                  />
                }
                active={sameRoute(route, { kind: "etiqueta", id: label.id })}
                dot={<ColorDot color={label.color} />}
                label={`@${label.name}`}
                count={label.taskCount}
                onClick={() => onNavigate({ kind: "etiqueta", id: label.id })}
              />
            )}
          />
        )}
      </NavSection>

      <NavSection
        title="Filtros salvos"
        action={
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Gerenciar filtros salvos"
            onClick={onManageFilters}
          >
            <Plus />
          </Button>
        }
        defaultOpen={navFilters.length > 0}
      >
        {navFilters.length === 0 ? (
          <p className="px-2.5 py-1 text-xs text-muted-foreground">
            Salve um filtro para acessá-lo daqui.
          </p>
        ) : (
          <SortableList
            items={navFilters}
            getId={(filter) => filter.id}
            onReorder={onReorderFilters}
            className="space-y-0.5"
            renderItem={(filter, handle) => (
              <NavButton
                handle={handle}
                action={
                  <NavEditAction
                    label={`Editar filtro ${filter.name}`}
                    onClick={() => onEditFilter(filter)}
                  />
                }
                active={sameRoute(route, { kind: "filtro", id: filter.id })}
                icon={Filter}
                label={filter.name}
                onClick={() => onNavigate({ kind: "filtro", id: filter.id })}
              />
            )}
          />
        )}
      </NavSection>
    </nav>
  );
}

export function TodoNav(props: React.ComponentProps<typeof NavContent>) {
  return (
    <aside className="hidden w-60 shrink-0 lg:block">
      <div className="sticky top-4 max-h-[calc(100vh-6rem)] overflow-y-auto pr-1">
        <NavContent {...props} />
      </div>
    </aside>
  );
}

/** Mesma navegação, em gaveta — usada no celular/tablet. */
export function TodoNavDrawer({
  open,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof NavContent> & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[17rem] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">TO-DO</SheetTitle>
        </SheetHeader>
        <div className="px-2 pb-6">
          <NavContent
            {...props}
            onNavigate={(route) => {
              props.onNavigate(route);
              onOpenChange(false);
            }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { NavContent as TodoNavContent };
