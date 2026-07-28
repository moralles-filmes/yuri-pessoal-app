"use client";

/**
 * Fase 15 — Módulo TO-DO · Diálogos de gestão (projeto, seção, etiqueta, mover, data,
 * exclusões seguras, filtro salvo).
 *
 * Toda exclusão que pode levar tarefas junto passa por aqui e EXIGE uma escolha
 * explícita do usuário — nunca há um "excluir" que apaga tarefas em silêncio.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { TriangleAlert } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  TODO_COLORS,
  TODO_COLOR_DOT,
  TODO_COLOR_LABELS,
  TODO_VIEWS,
  TODO_VIEW_LABELS,
  type TodoColor,
  type TodoView,
} from "@/lib/todo/constants";
import {
  createTodoLabel,
  createTodoProject,
  createTodoSection,
  deleteTodoLabel,
  deleteTodoProject,
  deleteTodoSection,
  mergeTodoLabels,
  updateTodoLabel,
  updateTodoProject,
  updateTodoSection,
} from "@/lib/actions/todo-projects";
import { moveTodoTask, rescheduleTodoTask, setTodoParent } from "@/lib/actions/todo";
import {
  createTodoSavedFilter,
  deleteTodoSavedFilter,
  updateTodoSavedFilter,
} from "@/lib/actions/todo-extras";
import type {
  TodoFilterDefinition,
  TodoLabel,
  TodoProject,
  TodoSavedFilter,
  TodoTask,
} from "@/lib/todo/types";

/* ───────────────────────────── Seletor de cor ───────────────────────────── */

function ColorPicker({
  value,
  onChange,
}: {
  value: TodoColor;
  onChange: (color: TodoColor) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TODO_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onChange(color)}
          aria-label={TODO_COLOR_LABELS[color]}
          aria-pressed={value === color}
          className={cn(
            "grid size-7 place-items-center rounded-lg border transition-colors",
            value === color ? "border-primary" : "border-border hover:bg-muted",
          )}
        >
          <span className={cn("size-3.5 rounded-full", TODO_COLOR_DOT[color])} />
        </button>
      ))}
    </div>
  );
}

/* ───────────────────────────── Projeto ───────────────────────────── */

export function ProjectDialog({
  open,
  onOpenChange,
  project,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null = criando. */
  project: TodoProject | null;
  projects: TodoProject[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [color, setColor] = React.useState<TodoColor>("gold");
  const [defaultView, setDefaultView] = React.useState<TodoView>("lista");
  const [favorite, setFavorite] = React.useState(false);
  const [parentId, setParentId] = React.useState("");

  const [seen, setSeen] = React.useState<string | null>(null);
  const key = project?.id ?? "__new__";
  if (open && seen !== key) {
    setSeen(key);
    setName(project?.name ?? "");
    setDescription(project?.description ?? "");
    setColor(project?.color ?? "gold");
    setDefaultView(project?.defaultView ?? "lista");
    setFavorite(project?.isFavorite ?? false);
    setParentId(project?.parentProjectId ?? "");
  }
  if (!open && seen !== null) setSeen(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name,
      description,
      color,
      default_view: defaultView,
      is_favorite: favorite,
      parent_project_id: parentId || null,
    };
    start(async () => {
      const res = project
        ? await updateTodoProject(project.id, payload)
        : await createTodoProject(payload);
      if (res.ok) {
        toast.success(project ? "Projeto atualizado." : "Projeto criado.");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Não foi possível salvar o projeto.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{project ? "Editar projeto" : "Novo projeto"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="pj-name" className="text-xs">
              Nome
            </Label>
            <Input
              id="pj-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Trabalho"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pj-desc" className="text-xs">
              Descrição (opcional)
            </Label>
            <Textarea
              id="pj-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cor</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Visualização padrão</Label>
              <Select value={defaultView} onValueChange={(v) => setDefaultView(v as TodoView)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TODO_VIEWS.map((v) => (
                    <SelectItem key={v} value={v}>
                      {TODO_VIEW_LABELS[v]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Projeto principal</Label>
              <Select
                value={parentId || "__none__"}
                onValueChange={(v) => setParentId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Nenhum" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {projects
                    .filter((p) => p.status === "ativo" && p.id !== project?.id)
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="pj-fav" className="text-xs">
              Favorito
            </Label>
            <Switch id="pj-fav" checked={favorite} onCheckedChange={setFavorite} />
          </div>
          <Button type="submit" className="w-full" disabled={pending || !name.trim()}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Exclusão de projeto — exige escolher o destino das tarefas. */
export function DeleteProjectDialog({
  open,
  onOpenChange,
  project,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: TodoProject | null;
  projects: TodoProject[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [strategy, setStrategy] = React.useState("mover_entrada");
  const [targetId, setTargetId] = React.useState("");
  const [confirmText, setConfirmText] = React.useState("");

  if (!project) return null;
  const destructive = strategy === "excluir_tudo";
  const canConfirm = !destructive || confirmText.trim().toUpperCase() === "EXCLUIR";

  function submit() {
    start(async () => {
      const res = await deleteTodoProject(project!.id, {
        strategy,
        target_project_id: strategy === "mover_projeto" ? targetId : null,
      });
      if (res.ok) {
        toast.success("Projeto excluído.");
        router.refresh();
        onOpenChange(false);
        setConfirmText("");
      } else {
        toast.error(res.error ?? "Não foi possível excluir o projeto.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir “{project.name}”</DialogTitle>
          <DialogDescription>
            Este projeto tem {project.totalTasks} tarefa(s). Escolha o que fazer com elas —
            nada é apagado sem a sua confirmação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">O que fazer com as tarefas</Label>
            <Select value={strategy} onValueChange={setStrategy}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mover_entrada">Mover para a Caixa de entrada</SelectItem>
                <SelectItem value="mover_projeto">Mover para outro projeto</SelectItem>
                <SelectItem value="excluir_tudo">Excluir o projeto e as tarefas</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {strategy === "mover_projeto" && (
            <div className="space-y-1.5">
              <Label className="text-xs">Projeto de destino</Label>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {projects
                    .filter((p) => p.id !== project.id && p.status === "ativo")
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {destructive && (
            <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
              <p className="flex items-start gap-2 text-xs text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                As {project.totalTasks} tarefa(s), com comentários e anexos, serão apagadas
                permanentemente. Não há como desfazer.
              </p>
              <div className="space-y-1.5">
                <Label htmlFor="pj-confirm" className="text-xs">
                  Digite EXCLUIR para confirmar
                </Label>
                <Input
                  id="pj-confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="EXCLUIR"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              className="flex-1"
              disabled={
                pending || !canConfirm || (strategy === "mover_projeto" && !targetId)
              }
              onClick={submit}
            >
              {pending ? "Excluindo…" : "Excluir projeto"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Seção ───────────────────────────── */

export function SectionDialog({
  open,
  onOpenChange,
  projectId,
  section,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** null = criando; preenchido = editando. */
  section?: { id: string; name: string; description: string | null } | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");

  const [seen, setSeen] = React.useState<string | null>(null);
  const key = section?.id ?? "__new__";
  if (open && seen !== key) {
    setSeen(key);
    setName(section?.name ?? "");
  }
  if (!open && seen !== null) setSeen(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const payload = { project_id: projectId, name };
      const res = section
        ? await updateTodoSection(section.id, payload)
        : await createTodoSection(payload);
      if (res.ok) {
        toast.success(section ? "Seção atualizada." : "Seção criada.");
        setName("");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Não foi possível salvar a seção.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{section ? "Editar seção" : "Nova seção"}</DialogTitle>
          <DialogDescription>
            As seções viram colunas no quadro e agrupamentos na lista.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Em andamento"
            aria-label="Nome da seção"
          />
          <Button type="submit" className="w-full" disabled={pending || !name.trim()}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Exclusão de seção — também exige escolher o destino das tarefas. */
export function DeleteSectionDialog({
  open,
  onOpenChange,
  section,
  siblings,
  taskCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  section: { id: string; name: string } | null;
  siblings: { id: string; name: string }[];
  taskCount: number;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [strategy, setStrategy] = React.useState("sem_secao");
  const [targetId, setTargetId] = React.useState("");

  if (!section) return null;

  function submit() {
    start(async () => {
      const res = await deleteTodoSection(section!.id, {
        strategy,
        target_section_id: strategy === "mover_secao" ? targetId : null,
      });
      if (res.ok) {
        toast.success("Seção excluída.");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Não foi possível excluir a seção.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Excluir seção “{section.name}”</DialogTitle>
          <DialogDescription>
            {taskCount > 0
              ? `Há ${taskCount} tarefa(s) nesta seção. Escolha o destino delas.`
              : "Esta seção está vazia."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {taskCount > 0 && (
            <>
              <Select value={strategy} onValueChange={setStrategy}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem_secao">Manter no projeto, sem seção</SelectItem>
                  <SelectItem value="mover_secao" disabled={siblings.length === 0}>
                    Mover para outra seção
                  </SelectItem>
                  <SelectItem value="excluir_tudo">Excluir as tarefas também</SelectItem>
                </SelectContent>
              </Select>

              {strategy === "mover_secao" && (
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Seção de destino" />
                  </SelectTrigger>
                  <SelectContent>
                    {siblings.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {strategy === "excluir_tudo" && (
                <p className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                  As {taskCount} tarefa(s) desta seção serão apagadas permanentemente.
                </p>
              )}
            </>
          )}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              variant={strategy === "excluir_tudo" ? "destructive" : "default"}
              className="flex-1"
              disabled={pending || (strategy === "mover_secao" && !targetId)}
              onClick={submit}
            >
              {pending ? "Excluindo…" : "Excluir seção"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Etiqueta ───────────────────────────── */

export function LabelDialog({
  open,
  onOpenChange,
  label,
  labels = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: TodoLabel | null;
  /** Todas as etiquetas — alimenta o seletor de mesclagem. */
  labels?: TodoLabel[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<TodoColor>("gold");
  const [mergeInto, setMergeInto] = React.useState("");

  const [seen, setSeen] = React.useState<string | null>(null);
  const key = label?.id ?? "__new__";
  if (open && seen !== key) {
    setSeen(key);
    setName(label?.name ?? "");
    setColor(label?.color ?? "gold");
    setMergeInto("");
  }
  if (!open && seen !== null) setSeen(null);

  const mergeTargets = labels.filter((l) => l.id !== label?.id);
  const mergeTarget = mergeTargets.find((l) => l.id === mergeInto) ?? null;

  function merge() {
    if (!label || !mergeTarget) return;
    start(async () => {
      const res = await mergeTodoLabels(label.id, mergeTarget.id);
      if (res.ok) {
        toast.success(
          `Etiquetas mescladas. ${res.data.moved} tarefa(s) agora usam @${mergeTarget.name}.`,
        );
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Não foi possível mesclar as etiquetas.");
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const payload = { name, color };
      const res = label
        ? await updateTodoLabel(label.id, payload)
        : await createTodoLabel(payload);
      if (res.ok) {
        toast.success(label ? "Etiqueta atualizada." : "Etiqueta criada.");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Não foi possível salvar a etiqueta.");
      }
    });
  }

  function remove() {
    if (!label) return;
    start(async () => {
      const res = await deleteTodoLabel(label.id);
      if (res.ok) {
        toast.success("Etiqueta excluída. As tarefas foram mantidas.");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Não foi possível excluir.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{label ? "Editar etiqueta" : "Nova etiqueta"}</DialogTitle>
          {label && (
            <DialogDescription>
              Usada em {label.taskCount} tarefa(s). Excluir a etiqueta não apaga nenhuma
              tarefa — apenas remove a marcação.
            </DialogDescription>
          )}
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lb-name" className="text-xs">
              Nome
            </Label>
            <Input
              id="lb-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: trabalho"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cor</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="flex gap-2">
            {label && (
              <Button type="button" variant="outline" onClick={remove} disabled={pending}>
                Excluir
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={pending || !name.trim()}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>

        {label && mergeTargets.length > 0 && (
          <div className="space-y-2 border-t border-border pt-3">
            <Label htmlFor="lb-merge" className="text-xs">
              Mesclar com outra etiqueta
            </Label>
            <Select value={mergeInto} onValueChange={setMergeInto}>
              <SelectTrigger id="lb-merge" className="w-full">
                <SelectValue placeholder="Escolha o destino…" />
              </SelectTrigger>
              <SelectContent>
                {mergeTargets.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    @{l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {mergeTarget && (
              <p className="text-xs text-muted-foreground">
                As {label.taskCount} tarefa(s) de <strong>@{label.name}</strong> passam a
                usar <strong>@{mergeTarget.name}</strong>, e <strong>@{label.name}</strong>{" "}
                é excluída. Nenhuma tarefa é apagada.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={merge}
              disabled={pending || !mergeTarget}
            >
              {pending ? "Mesclando…" : "Mesclar etiquetas"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Mover tarefa ───────────────────────────── */

export function MoveTaskDialog({
  open,
  onOpenChange,
  task,
  projects,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TodoTask | null;
  projects: TodoProject[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [projectId, setProjectId] = React.useState("");
  const [sectionId, setSectionId] = React.useState("");

  const [seen, setSeen] = React.useState<string | null>(null);
  if (open && task && seen !== task.id) {
    setSeen(task.id);
    setProjectId(task.projectId ?? "");
    setSectionId(task.sectionId ?? "");
  }
  if (!open && seen !== null) setSeen(null);

  if (!task) return null;
  const sections = projects.find((p) => p.id === projectId)?.sections ?? [];

  function submit() {
    start(async () => {
      const res = await moveTodoTask(task!.id, {
        project_id: projectId || null,
        section_id: sectionId || null,
        position: 0,
      });
      if (res.ok) {
        toast.success("Tarefa movida.");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Não foi possível mover.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Mover tarefa</DialogTitle>
          <DialogDescription className="truncate">{task.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Projeto</Label>
            <Select
              value={projectId || "__inbox__"}
              onValueChange={(v) => {
                setProjectId(v === "__inbox__" ? "" : v);
                setSectionId("");
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__inbox__">Caixa de entrada</SelectItem>
                {projects
                  .filter((p) => p.status === "ativo")
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          {sections.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs">Seção</Label>
              <Select
                value={sectionId || "__none__"}
                onValueChange={(v) => setSectionId(v === "__none__" ? "" : v)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem seção</SelectItem>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button className="w-full" onClick={submit} disabled={pending}>
            {pending ? "Movendo…" : "Mover"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Escolher data ───────────────────────────── */

export function PickDateDialog({
  open,
  onOpenChange,
  task,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TodoTask | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [date, setDate] = React.useState("");

  const [seen, setSeen] = React.useState<string | null>(null);
  if (open && task && seen !== task.id) {
    setSeen(task.id);
    setDate(task.scheduledDate ?? "");
  }
  if (!open && seen !== null) setSeen(null);

  if (!task) return null;

  function apply(value: string | null) {
    start(async () => {
      const res = await rescheduleTodoTask(task!.id, value);
      if (res.ok) {
        toast.success(value ? "Data atualizada." : "Data removida.");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Não foi possível reagendar.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Escolher data</DialogTitle>
          <DialogDescription className="truncate">{task.title}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            aria-label="Nova data programada"
          />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => apply(null)} disabled={pending}>
              Remover data
            </Button>
            <Button className="flex-1" onClick={() => apply(date || null)} disabled={pending}>
              {pending ? "Salvando…" : "Aplicar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Transformar em subtarefa ───────────────────────────── */

export function MakeSubtaskDialog({
  open,
  onOpenChange,
  task,
  candidates,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task: TodoTask | null;
  candidates: TodoTask[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [parentId, setParentId] = React.useState("");

  if (!task) return null;
  const options = candidates.filter((t) => t.id !== task.id && t.parentTaskId === null);

  function submit() {
    start(async () => {
      const res = await setTodoParent(task!.id, parentId || null);
      if (res.ok) {
        toast.success("Tarefa convertida em subtarefa.");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Não foi possível converter.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Transformar em subtarefa</DialogTitle>
          <DialogDescription className="truncate">
            “{task.title}” passará a pertencer à tarefa escolhida.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {options.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
              Não há outra tarefa principal disponível.
            </p>
          ) : (
            <Select value={parentId} onValueChange={setParentId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Escolha a tarefa principal" />
              </SelectTrigger>
              <SelectContent>
                {options.slice(0, 100).map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button className="w-full" onClick={submit} disabled={pending || !parentId}>
            {pending ? "Convertendo…" : "Converter"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ───────────────────────────── Salvar filtro ───────────────────────────── */

/**
 * Cria (`filter = null`) ou edita um filtro salvo.
 *
 * Na edição, a definição guardada é preservada por padrão; o usuário precisa marcar
 * explicitamente "substituir pelos filtros atuais" para sobrescrevê-la — assim abrir o
 * diálogo para renomear nunca troca o filtro por baixo dos panos.
 */
export function SaveFilterDialog({
  open,
  onOpenChange,
  definition,
  filter = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Filtros aplicados na tela agora. */
  definition: TodoFilterDefinition;
  filter?: TodoSavedFilter | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState<TodoColor>("gold");
  const [showInNav, setShowInNav] = React.useState(true);
  const [replaceDefinition, setReplaceDefinition] = React.useState(false);

  const [seen, setSeen] = React.useState<string | null>(null);
  const key = filter?.id ?? "__new__";
  if (open && seen !== key) {
    setSeen(key);
    setName(filter?.name ?? "");
    setColor(filter?.color ?? "gold");
    setShowInNav(filter?.showInNav ?? true);
    setReplaceDefinition(false);
  }
  if (!open && seen !== null) setSeen(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    start(async () => {
      const payload = {
        name,
        color,
        show_in_nav: showInNav,
        filter_definition:
          filter && !replaceDefinition ? filter.definition : definition,
      };
      const res = filter
        ? await updateTodoSavedFilter(filter.id, payload)
        : await createTodoSavedFilter(payload);
      if (res.ok) {
        toast.success(filter ? "Filtro atualizado." : "Filtro salvo.");
        setName("");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Não foi possível salvar o filtro.");
      }
    });
  }

  function remove() {
    if (!filter) return;
    start(async () => {
      const res = await deleteTodoSavedFilter(filter.id);
      if (res.ok) {
        toast.success("Filtro excluído. Nenhuma tarefa foi afetada.");
        router.refresh();
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Não foi possível excluir o filtro.");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{filter ? "Editar filtro salvo" : "Salvar filtro"}</DialogTitle>
          <DialogDescription>
            {filter
              ? "Um filtro salvo é só um atalho de visualização — excluí-lo não apaga nenhuma tarefa."
              : "O filtro atual fica guardado e acessível pela navegação lateral."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sf-name" className="text-xs">
              Nome
            </Label>
            <Input
              id="sf-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: Urgentes de hoje"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Cor</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
            <Label htmlFor="sf-nav" className="text-xs">
              Mostrar na navegação
            </Label>
            <Switch id="sf-nav" checked={showInNav} onCheckedChange={setShowInNav} />
          </div>
          {filter && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <Label htmlFor="sf-replace" className="text-xs leading-snug">
                Substituir pelos filtros aplicados agora
              </Label>
              <Switch
                id="sf-replace"
                checked={replaceDefinition}
                onCheckedChange={setReplaceDefinition}
              />
            </div>
          )}
          <div className="flex gap-2">
            {filter && (
              <Button type="button" variant="outline" onClick={remove} disabled={pending}>
                Excluir
              </Button>
            )}
            <Button type="submit" className="flex-1" disabled={pending || !name.trim()}>
              {pending ? "Salvando…" : filter ? "Salvar alterações" : "Salvar filtro"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
