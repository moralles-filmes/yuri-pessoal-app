"use client";

/**
 * Fase 15 — Módulo TO-DO · Painel de detalhes da tarefa.
 *
 * Drawer lateral no desktop e praticamente tela cheia no celular (o `Sheet` já é
 * responsivo). Reúne tudo: campos, subtarefas, recorrência, lembretes, comentários,
 * anexos e histórico. Os detalhes pesados (comentários/anexos/histórico) só são
 * carregados quando o painel abre.
 */
import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  Clock,
  Download,
  History,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/lib/supabase/client";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  TODO_ATTACHMENT_ACCEPT,
  TODO_ATTACHMENT_ENTITY,
  TODO_ATTACHMENT_MAX_BYTES,
  TODO_ATTACHMENT_MIME_TYPES,
  TODO_PRIORITIES,
  TODO_PRIORITY_LABELS,
  TODO_REMINDER_OFFSETS,
  TODO_REMINDER_OFFSET_LABELS,
  TODO_STATUSES,
  TODO_STATUS_LABELS,
  activityLabel,
  type TodoPriority,
  type TodoStatus,
} from "@/lib/todo/constants";
import { endTime, endsNextDay } from "@/lib/todo/status";
import { updateTodoTask, createTodoTask, completeTodoTask } from "@/lib/actions/todo";
import {
  createTodoComment,
  createTodoReminder,
  deleteTodoAttachment,
  deleteTodoComment,
  deleteTodoReminder,
  getTodoAttachmentUrl,
  loadTodoTaskDetail,
  recordTodoAttachment,
} from "@/lib/actions/todo-extras";
import { LabelChip } from "@/components/todo/badges";
import {
  RecurrenceEditor,
  type RecurrenceFormValue,
} from "@/components/todo/recurrence-editor";
import type {
  TodoActivityEntry,
  TodoAttachment,
  TodoComment,
  TodoLabel,
  TodoProject,
  TodoReminder,
  TodoTask,
} from "@/lib/todo/types";

type Detail = {
  comments: TodoComment[];
  attachments: TodoAttachment[];
  reminders: TodoReminder[];
  activity: TodoActivityEntry[];
};

const EMPTY_DETAIL: Detail = { comments: [], attachments: [], reminders: [], activity: [] };

/** Converte a recorrência do domínio para o shape do formulário. */
function toFormRecurrence(task: TodoTask): RecurrenceFormValue | null {
  const r = task.recurrence;
  if (!r) return null;
  return {
    frequency: r.frequency,
    interval_count: r.intervalCount,
    days_of_week: r.daysOfWeek ?? null,
    day_of_month: r.dayOfMonth ?? null,
    month_of_year: r.monthOfYear ?? null,
    week_of_month: r.weekOfMonth ?? null,
    business_day_rule: r.businessDayRule ?? null,
    recurrence_mode: r.mode,
    starts_on: r.startsOn ?? null,
    ends_on: r.endsOn ?? null,
    max_occurrences: r.maxOccurrences ?? null,
    is_paused: r.isPaused ?? false,
  };
}

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  projects,
  labels,
  allTasks,
  userId,
}: {
  task: TodoTask | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: TodoProject[];
  labels: TodoLabel[];
  allTasks: TodoTask[];
  userId: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [detail, setDetail] = React.useState<Detail>(EMPTY_DETAIL);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  // Campos do formulário.
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [projectId, setProjectId] = React.useState("");
  const [sectionId, setSectionId] = React.useState("");
  const [status, setStatus] = React.useState<TodoStatus>("pendente");
  const [priority, setPriority] = React.useState<TodoPriority>(4);
  const [scheduledDate, setScheduledDate] = React.useState("");
  const [scheduledTime, setScheduledTime] = React.useState("");
  const [duration, setDuration] = React.useState("");
  const [deadline, setDeadline] = React.useState("");
  const [labelIds, setLabelIds] = React.useState<string[]>([]);
  const [recurrence, setRecurrence] = React.useState<RecurrenceFormValue | null>(null);

  // Reidrata o formulário quando a tarefa aberta muda (sem useEffect — o lint do
  // React 19 do projeto proíbe sincronizar props por efeito; o padrão adotado no
  // repo é ajustar o estado durante o render, guardado por um "id visto").
  const [seenId, setSeenId] = React.useState<string | null>(null);
  if (task && task.id !== seenId) {
    setSeenId(task.id);
    setTitle(task.title);
    setDescription(task.description ?? "");
    setProjectId(task.projectId ?? "");
    setSectionId(task.sectionId ?? "");
    setStatus(task.status);
    setPriority(task.priority);
    setScheduledDate(task.scheduledDate ?? "");
    setScheduledTime(task.scheduledTime ?? "");
    setDuration(task.durationMinutes ? String(task.durationMinutes) : "");
    setDeadline(task.deadlineAt ?? "");
    setLabelIds(task.labels.map((l) => l.id));
    setRecurrence(toFormRecurrence(task));
    setDetail(EMPTY_DETAIL);
  }

  const loadDetail = React.useCallback((taskId: string) => {
    setLoadingDetail(true);
    loadTodoTaskDetail(taskId)
      .then((d) => setDetail(d as Detail))
      .catch(() => setDetail(EMPTY_DETAIL))
      .finally(() => setLoadingDetail(false));
  }, []);

  // Carrega os detalhes na abertura.
  const [loadedFor, setLoadedFor] = React.useState<string | null>(null);
  if (open && task && loadedFor !== task.id) {
    setLoadedFor(task.id);
    loadDetail(task.id);
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  if (!task) return null;

  const project = projects.find((p) => p.id === projectId) ?? null;
  const sections = project?.sections.filter((s) => !s.archivedAt) ?? [];
  const subtasks = allTasks.filter((t) => t.parentTaskId === task.id);
  const parent = task.parentTaskId
    ? (allTasks.find((t) => t.id === task.parentTaskId) ?? null)
    : null;
  const computedEnd = endTime(scheduledTime || null, Number(duration) || null);

  function save() {
    start(async () => {
      const res = await updateTodoTask(task!.id, {
        title,
        description,
        project_id: projectId || null,
        section_id: sectionId || null,
        parent_task_id: task!.parentTaskId,
        status,
        priority,
        scheduled_date: scheduledDate || null,
        scheduled_time: scheduledTime || null,
        duration_minutes: duration || null,
        deadline_at: deadline || null,
        label_ids: labelIds,
        recurrence,
      });
      if (res.ok) {
        toast.success("Tarefa salva.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Não foi possível salvar.");
      }
    });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border">
          <SheetTitle className="text-base">Detalhes da tarefa</SheetTitle>
          <SheetDescription className="text-xs">
            Criada em {formatDate(task.createdAt.slice(0, 10))}
            {parent && ` · Subtarefa de "${parent.title}"`}
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="dados" className="flex-1">
          <div className="px-4 pt-3">
            <TabsList className="w-full">
              <TabsTrigger value="dados" className="flex-1 text-xs">
                Dados
              </TabsTrigger>
              <TabsTrigger value="subtarefas" className="flex-1 text-xs">
                Subtarefas {subtasks.length > 0 && `(${subtasks.length})`}
              </TabsTrigger>
              <TabsTrigger value="conversa" className="flex-1 text-xs">
                Notas
              </TabsTrigger>
              <TabsTrigger value="historico" className="flex-1 text-xs">
                Histórico
              </TabsTrigger>
            </TabsList>
          </div>

          {/* ─────────── Dados ─────────── */}
          <TabsContent value="dados" className="space-y-4 p-4">
            <div className="space-y-1.5">
              <Label htmlFor="td-title" className="text-xs">
                Título
              </Label>
              <Input
                id="td-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="td-desc" className="text-xs">
                Descrição
              </Label>
              <Textarea
                id="td-desc"
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detalhes, links, passos…"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Projeto</Label>
                <Select
                  value={projectId || "__inbox__"}
                  onValueChange={(v) => {
                    setProjectId(v === "__inbox__" ? "" : v);
                    // A seção pertence ao projeto antigo — não pode ser mantida.
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
              <div className="space-y-1.5">
                <Label className="text-xs">Seção</Label>
                <Select
                  value={sectionId || "__none__"}
                  onValueChange={(v) => setSectionId(v === "__none__" ? "" : v)}
                  disabled={sections.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Sem seção" />
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
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as TodoStatus)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TODO_STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {TODO_STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Prioridade</Label>
                <Select
                  value={String(priority)}
                  onValueChange={(v) => setPriority(Number(v) as TodoPriority)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TODO_PRIORITIES.map((p) => (
                      <SelectItem key={p} value={String(p)}>
                        {TODO_PRIORITY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="space-y-3">
              <p className="text-xs font-medium text-muted-foreground">Datas</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="td-sched" className="text-xs">
                    Data programada
                  </Label>
                  <Input
                    id="td-sched"
                    type="date"
                    value={scheduledDate}
                    onChange={(e) => setScheduledDate(e.target.value)}
                  />
                  <p className="text-[0.7rem] text-muted-foreground">Quando pretendo fazer.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="td-deadline" className="text-xs">
                    Prazo final
                  </Label>
                  <Input
                    id="td-deadline"
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                  />
                  <p className="text-[0.7rem] text-muted-foreground">Limite máximo.</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="td-time" className="text-xs">
                    Horário
                  </Label>
                  <Input
                    id="td-time"
                    type="time"
                    value={scheduledTime}
                    onChange={(e) => setScheduledTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="td-dur" className="text-xs">
                    Duração (min)
                  </Label>
                  <Input
                    id="td-dur"
                    type="number"
                    min={1}
                    inputMode="numeric"
                    placeholder="—"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  />
                </div>
              </div>
              {computedEnd && (
                <p className="flex items-center gap-1.5 text-[0.7rem] text-muted-foreground">
                  <Clock className="size-3" aria-hidden />
                  Termina às {computedEnd}
                  {endsNextDay(scheduledTime || null, Number(duration) || null) && " (dia seguinte)"}
                </p>
              )}
            </div>

            <Separator />

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Etiquetas</p>
              <div className="flex flex-wrap gap-1.5">
                {labels.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhuma etiqueta criada ainda.
                  </p>
                )}
                {labels.map((label) => {
                  const active = labelIds.includes(label.id);
                  return (
                    <button
                      key={label.id}
                      type="button"
                      aria-pressed={active}
                      onClick={() =>
                        setLabelIds((prev) =>
                          prev.includes(label.id)
                            ? prev.filter((id) => id !== label.id)
                            : [...prev, label.id],
                        )
                      }
                      className={cn(
                        "rounded-full transition-opacity",
                        !active && "opacity-45 hover:opacity-80",
                      )}
                    >
                      <LabelChip label={label} />
                    </button>
                  );
                })}
              </div>
            </div>

            <Separator />

            <RecurrenceEditor
              value={recurrence}
              onChange={setRecurrence}
              anchorDate={scheduledDate || deadline || null}
            />

            <Separator />

            <RemindersSection
              taskId={task.id}
              reminders={detail.reminders}
              scheduledDate={scheduledDate}
              scheduledTime={scheduledTime}
              onChanged={() => loadDetail(task.id)}
            />

            <div className="sticky bottom-0 -mx-4 border-t border-border bg-background px-4 py-3">
              <Button onClick={save} disabled={pending} className="w-full">
                {pending ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          </TabsContent>

          {/* ─────────── Subtarefas ─────────── */}
          <TabsContent value="subtarefas" className="space-y-3 p-4">
            <SubtasksSection
              parentTask={task}
              subtasks={subtasks}
              onChanged={() => router.refresh()}
            />
          </TabsContent>

          {/* ─────────── Notas (comentários + anexos) ─────────── */}
          <TabsContent value="conversa" className="space-y-4 p-4">
            {loadingDetail ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando…
              </p>
            ) : (
              <>
                <CommentsSection
                  taskId={task.id}
                  comments={detail.comments}
                  onChanged={() => loadDetail(task.id)}
                />
                <Separator />
                <AttachmentsSection
                  taskId={task.id}
                  userId={userId}
                  attachments={detail.attachments}
                  onChanged={() => loadDetail(task.id)}
                />
              </>
            )}
          </TabsContent>

          {/* ─────────── Histórico ─────────── */}
          <TabsContent value="historico" className="space-y-2 p-4">
            {loadingDetail ? (
              <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Carregando…
              </p>
            ) : detail.activity.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma alteração registrada ainda.
              </p>
            ) : (
              <ul className="space-y-2">
                {detail.activity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-2 text-xs">
                    <History className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0">
                      <p className="font-medium">{activityLabel(entry.eventType)}</p>
                      <p className="text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

/* ───────────────────────────── Subtarefas ───────────────────────────── */

function SubtasksSection({
  parentTask,
  subtasks,
  onChanged,
}: {
  parentTask: TodoTask;
  subtasks: TodoTask[];
  onChanged: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [pending, start] = React.useTransition();

  function add(e: React.FormEvent) {
    e.preventDefault();
    const title = value.trim();
    if (!title) return;
    start(async () => {
      const res = await createTodoTask({
        title,
        parent_task_id: parentTask.id,
        project_id: parentTask.projectId,
        section_id: parentTask.sectionId,
      });
      if (res.ok) {
        setValue("");
        onChanged();
      } else {
        toast.error(res.error ?? "Não foi possível criar a subtarefa.");
      }
    });
  }

  function toggle(sub: TodoTask) {
    start(async () => {
      const res = await completeTodoTask(sub.id);
      if (res.ok) onChanged();
      else toast.error(res.error ?? "Não foi possível concluir.");
    });
  }

  return (
    <div className="space-y-3">
      {subtasks.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Nenhuma subtarefa. Quebre a tarefa em passos menores para acompanhar o progresso.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {subtasks.map((sub) => (
            <li
              key={sub.id}
              className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5"
            >
              <Checkbox
                checked={sub.status === "concluida"}
                onCheckedChange={() => toggle(sub)}
                aria-label={`Concluir ${sub.title}`}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm",
                  sub.status === "concluida" && "text-muted-foreground line-through",
                )}
              >
                {sub.title}
              </span>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={add} className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Nova subtarefa"
          aria-label="Título da nova subtarefa"
        />
        <Button type="submit" size="icon" disabled={pending} aria-label="Adicionar subtarefa">
          <Plus />
        </Button>
      </form>
    </div>
  );
}

/* ───────────────────────────── Comentários ───────────────────────────── */

function CommentsSection({
  taskId,
  comments,
  onChanged,
}: {
  taskId: string;
  comments: TodoComment[];
  onChanged: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [pending, start] = React.useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const content = value.trim();
    if (!content) return;
    start(async () => {
      const res = await createTodoComment(taskId, { content });
      if (res.ok) {
        setValue("");
        onChanged();
      } else {
        toast.error(res.error ?? "Não foi possível comentar.");
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteTodoComment(id);
      if (res.ok) onChanged();
      else toast.error(res.error ?? "Não foi possível excluir.");
    });
  }

  return (
    <div className="space-y-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <MessageSquare className="size-3.5" aria-hidden /> Comentários
      </p>

      {comments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          Sem comentários. Use este espaço como diário da tarefa: decisões, contexto e
          andamento.
        </p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <li key={comment.id} className="rounded-lg border border-border p-2.5">
              <div className="mb-1 flex items-center justify-between gap-2">
                <p className="text-[0.7rem] text-muted-foreground">
                  {new Date(comment.createdAt).toLocaleString("pt-BR")}
                  {comment.editedAt && " · editado"}
                </p>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label="Excluir comentário"
                  onClick={() => remove(comment.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>
              <p className="text-sm whitespace-pre-wrap break-words">{comment.content}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="space-y-2">
        <Textarea
          rows={3}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Escreva um comentário…"
          aria-label="Novo comentário"
        />
        <Button type="submit" size="sm" disabled={pending || !value.trim()}>
          {pending ? "Enviando…" : "Comentar"}
        </Button>
      </form>
    </div>
  );
}

/* ───────────────────────────── Anexos ───────────────────────────── */

function AttachmentsSection({
  taskId,
  userId,
  attachments,
  onChanged,
}: {
  taskId: string;
  userId: string;
  attachments: TodoAttachment[];
  onChanged: () => void;
}) {
  const [uploading, setUploading] = React.useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    // Validação no cliente (a do servidor é a que vale — ver `todoAttachmentSchema`).
    if (file.size > TODO_ATTACHMENT_MAX_BYTES) {
      toast.error("O arquivo passa de 10 MB.");
      return;
    }
    if (file.type && !TODO_ATTACHMENT_MIME_TYPES.includes(file.type)) {
      toast.error("Tipo de arquivo não permitido.");
      return;
    }

    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      // O caminho começa por {userId} — é o que a policy do bucket privado exige.
      const path = `${userId}/${TODO_ATTACHMENT_ENTITY}/${taskId}/${crypto.randomUUID()}-${safeName}`;
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("attachments")
        .upload(path, file, { upsert: false });
      if (error) {
        toast.error("Falha no envio do anexo.");
        return;
      }
      const res = await recordTodoAttachment(taskId, {
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || "application/octet-stream",
        size_bytes: file.size,
      });
      if (res.ok) {
        toast.success("Anexo adicionado.");
        onChanged();
      } else {
        toast.error(res.error ?? "Não foi possível registrar o anexo.");
      }
    } finally {
      setUploading(false);
    }
  }

  async function download(id: string) {
    const res = await getTodoAttachmentUrl(id);
    if (res.ok) window.open(res.data.url, "_blank", "noopener");
    else toast.error(res.error ?? "Não foi possível abrir o anexo.");
  }

  async function remove(id: string) {
    const res = await deleteTodoAttachment(id);
    if (res.ok) onChanged();
    else toast.error(res.error ?? "Não foi possível remover o anexo.");
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Paperclip className="size-3.5" aria-hidden /> Anexos
      </p>

      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5"
            >
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <button
                type="button"
                onClick={() => download(a.id)}
                className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
              >
                {a.fileName}
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Baixar ${a.fileName}`}
                onClick={() => download(a.id)}
              >
                <Download />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Remover ${a.fileName}`}
                onClick={() => remove(a.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-muted">
        <Plus className="size-4" aria-hidden />
        {uploading ? "Enviando…" : "Adicionar anexo"}
        <input
          type="file"
          className="sr-only"
          accept={TODO_ATTACHMENT_ACCEPT}
          onChange={handleFile}
          disabled={uploading}
        />
      </label>
      <p className="text-[0.7rem] text-muted-foreground">
        Até 10 MB. Os arquivos ficam num armazenamento privado, acessível só por você.
      </p>
    </div>
  );
}

/* ───────────────────────────── Lembretes ───────────────────────────── */

function RemindersSection({
  taskId,
  reminders,
  scheduledDate,
  scheduledTime,
  onChanged,
}: {
  taskId: string;
  reminders: TodoReminder[];
  scheduledDate: string;
  scheduledTime: string;
  onChanged: () => void;
}) {
  const [pending, start] = React.useTransition();

  function add(offsetMinutes: number) {
    if (!scheduledDate) {
      toast.error("Defina a data da tarefa antes de criar um lembrete.");
      return;
    }
    const base = new Date(`${scheduledDate}T${scheduledTime || "09:00"}`);
    if (Number.isNaN(base.getTime())) {
      toast.error("Data ou horário inválidos.");
      return;
    }
    const remindAt = new Date(base.getTime() - offsetMinutes * 60_000);

    start(async () => {
      const res = await createTodoReminder(taskId, {
        remind_at: remindAt.toISOString(),
        offset_minutes: offsetMinutes,
        channel: "interno",
      });
      if (res.ok) {
        toast.success("Lembrete criado.");
        onChanged();
      } else {
        toast.error(res.error ?? "Não foi possível criar o lembrete.");
      }
    });
  }

  function remove(id: string) {
    start(async () => {
      const res = await deleteTodoReminder(id);
      if (res.ok) onChanged();
      else toast.error(res.error ?? "Não foi possível remover o lembrete.");
    });
  }

  return (
    <div className="space-y-2">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Bell className="size-3.5" aria-hidden /> Lembretes
      </p>

      {reminders.length > 0 && (
        <ul className="space-y-1">
          {reminders.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm"
            >
              <Bell className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                {new Date(r.remindAt).toLocaleString("pt-BR")}
                {r.status === "enviado" && " · enviado"}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remover lembrete"
                onClick={() => remove(r.id)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {TODO_REMINDER_OFFSETS.map((offset) => (
          <Button
            key={offset}
            type="button"
            variant="outline"
            size="xs"
            disabled={pending}
            onClick={() => add(offset)}
          >
            {TODO_REMINDER_OFFSET_LABELS[offset]}
          </Button>
        ))}
      </div>
      <p className="text-[0.7rem] text-muted-foreground">
        Os lembretes chegam pelo sino de notificações do sistema.
      </p>
    </div>
  );
}
