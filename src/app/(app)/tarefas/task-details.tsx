"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarClock,
  Download,
  Paperclip,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { TaskPriorityBadge, TaskStatusBadge, ProjectPill } from "@/components/tasks/badges";
import { createClient } from "@/lib/supabase/client";
import {
  addChecklistItem,
  deleteAttachment,
  deleteChecklistItem,
  deleteTask,
  getAttachmentUrl,
  recordAttachment,
  toggleChecklistItem,
} from "@/lib/actions/tasks";
import { effectiveTaskStatus } from "@/lib/tasks/status";
import {
  TASK_RECURRENCE_FREQUENCY_LABELS,
  type TaskRecurrenceFrequency,
} from "@/lib/tasks/constants";
import { formatDate } from "@/lib/format";
import type { TaskWithRelations } from "@/types/database";
import type { TaskRecurrence } from "@/lib/tasks/recurrence";

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function recurrenceSummary(rec: TaskRecurrence): string {
  const freqLabel = TASK_RECURRENCE_FREQUENCY_LABELS[rec.freq as TaskRecurrenceFrequency];
  let s = rec.interval > 1 ? `A cada ${rec.interval} ` : freqLabel;
  if (rec.interval > 1) {
    const unit = { diaria: "dias", semanal: "semanas", mensal: "meses", anual: "anos" }[rec.freq];
    s += unit;
  }
  if (rec.freq === "semanal" && rec.weekdays?.length) {
    s += ` (${rec.weekdays.map((d) => WEEKDAY_SHORT[d]).join(", ")})`;
  }
  if (rec.until) s += ` até ${formatDate(rec.until)}`;
  return s;
}

export function TaskDetailsDialog({
  task,
  todayIso,
  userId,
  open,
  onOpenChange,
  onEdit,
}: {
  task: TaskWithRelations | null;
  todayIso: string;
  userId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (task: TaskWithRelations) => void;
}) {
  if (!task) return null;
  const status = effectiveTaskStatus(task, todayIso);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-6">{task.title}</DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-2">
            <TaskStatusBadge status={status} />
            <TaskPriorityBadge priority={task.priority} />
            {task.project && (
              <ProjectPill name={task.project.name} color={task.project.color} />
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {/* Datas / recorrência / lembrete */}
          <div className="grid grid-cols-2 gap-3">
            {task.start_date && (
              <Meta label="Início" value={formatDate(task.start_date)} />
            )}
            {task.due_date && (
              <Meta label="Vencimento" value={formatDate(task.due_date)} />
            )}
            {task.reminder_at && (
              <Meta
                label="Lembrete"
                value={new Date(task.reminder_at).toLocaleString("pt-BR", {
                  dateStyle: "short",
                  timeStyle: "short",
                })}
              />
            )}
          </div>

          {task.recurrence && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <Repeat className="size-3.5" /> {recurrenceSummary(task.recurrence)}
            </p>
          )}

          {task.calendar_event && (
            <p className="flex items-center gap-1.5 text-muted-foreground">
              <CalendarClock className="size-3.5" /> Vinculada a “{task.calendar_event.title}”
              {` · ${formatDate(task.calendar_event.start_at)}`}
            </p>
          )}

          {task.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {task.tags.map((t) => (
                <Badge key={t} variant="outline" className="font-normal">
                  #{t}
                </Badge>
              ))}
            </div>
          )}

          {task.notes && (
            <p className="whitespace-pre-wrap rounded-lg bg-muted/50 p-3 text-muted-foreground">
              {task.notes}
            </p>
          )}

          <ChecklistEditor task={task} />
          <AttachmentsEditor task={task} userId={userId} />
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <DeleteConfirmDialog
            title="Excluir tarefa"
            description={`Excluir "${task.title}"? Esta ação não pode ser desfeita.`}
            successMessage="Tarefa excluída."
            onConfirm={async () => {
              const res = await deleteTask(task.id);
              if (res.ok) onOpenChange(false);
              return res;
            }}
            trigger={
              <Button variant="ghost" className="text-muted-foreground hover:text-destructive">
                <Trash2 /> Excluir
              </Button>
            }
          />
          <Button onClick={() => onEdit(task)}>
            <Pencil /> Editar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function ChecklistEditor({ task }: { task: TaskWithRelations }) {
  const router = useRouter();
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const items = task.checklist ?? [];
  const done = items.filter((i) => i.is_done).length;

  async function add() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const res = await addChecklistItem(task.id, { label });
      if (res.ok) {
        setLabel("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Não foi possível adicionar.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          Checklist {items.length > 0 && `· ${done}/${items.length}`}
        </p>
      </div>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2">
              <Checkbox
                checked={item.is_done}
                aria-label={item.label}
                onCheckedChange={async (v) => {
                  const res = await toggleChecklistItem(item.id, Boolean(v));
                  if (res.ok) router.refresh();
                  else toast.error(res.error);
                }}
              />
              <span
                className={cnLine(item.is_done)}
              >
                {item.label}
              </span>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remover item"
                className="ml-auto text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  const res = await deleteChecklistItem(item.id);
                  if (res.ok) router.refresh();
                  else toast.error(res.error);
                }}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <Input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Adicionar item…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="outline" size="icon" aria-label="Adicionar item" disabled={busy} onClick={add}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}

function cnLine(done: boolean) {
  return done
    ? "flex-1 text-sm text-muted-foreground line-through decoration-1"
    : "flex-1 text-sm";
}

function AttachmentsEditor({
  task,
  userId,
}: {
  task: TaskWithRelations;
  userId: string;
}) {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const attachments = task.attachments ?? [];

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx. 10 MB).");
      return;
    }
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${userId}/${task.id}/${crypto.randomUUID()}-${safeName}`;
      const supabase = createClient();
      const { error } = await supabase.storage
        .from("task-attachments")
        .upload(path, file, { upsert: false });
      if (error) {
        toast.error("Falha no upload do anexo.");
        return;
      }
      const res = await recordAttachment(task.id, {
        path,
        file_name: file.name,
        mime_type: file.type || null,
        size_bytes: file.size,
      });
      if (res.ok) {
        toast.success("Anexo adicionado.");
        router.refresh();
      } else {
        toast.error(res.error ?? "Não foi possível salvar o anexo.");
      }
    } finally {
      setUploading(false);
    }
  }

  async function download(id: string) {
    const res = await getAttachmentUrl(id);
    if (res.ok) window.open(res.data.url, "_blank", "noopener");
    else toast.error(res.error ?? "Não foi possível abrir o anexo.");
  }

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground">Anexos</p>
      {attachments.length > 0 && (
        <ul className="space-y-1">
          {attachments.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
            >
              <Paperclip className="size-3.5 shrink-0 text-muted-foreground" />
              <button
                type="button"
                onClick={() => download(a.id)}
                className="min-w-0 flex-1 truncate text-left text-sm hover:underline"
              >
                {a.file_name}
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Baixar anexo"
                onClick={() => download(a.id)}
              >
                <Download />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remover anexo"
                className="text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  const res = await deleteAttachment(a.id);
                  if (res.ok) router.refresh();
                  else toast.error(res.error);
                }}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        variant="outline"
        size="sm"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        <Upload /> {uploading ? "Enviando…" : "Adicionar anexo"}
      </Button>
    </div>
  );
}
