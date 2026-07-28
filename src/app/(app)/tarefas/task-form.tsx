"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { createTask, updateTask } from "@/lib/actions/tasks";
import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_RECURRENCE_FREQUENCIES,
  TASK_RECURRENCE_FREQUENCY_LABELS,
  TASK_STORED_STATUSES,
  TASK_STATUS_LABELS,
  type TaskPriority,
  type TaskStoredStatus,
} from "@/lib/tasks/constants";
import {
  formatDate,
  saoPauloWallClockToInstant,
  toDateTimeLocalInSaoPaulo,
} from "@/lib/format";
import type { TaskWithRelations } from "@/types/database";

const NONE = "none";
const WEEKDAYS = [
  { value: 0, label: "D" },
  { value: 1, label: "S" },
  { value: 2, label: "T" },
  { value: 3, label: "Q" },
  { value: 4, label: "Q" },
  { value: 5, label: "S" },
  { value: 6, label: "S" },
];

type ProjectOption = { id: string; name: string };
type EventOption = { id: string; title: string; start_at: string };

type FormValues = {
  title: string;
  project_id: string;
  priority: TaskPriority;
  status: TaskStoredStatus;
  start_date: string;
  due_date: string;
  reminder_at: string;
  tags: string;
  rec_freq: string;
  rec_interval: string;
  rec_weekdays: number[];
  rec_until: string;
  calendar_event_id: string;
  notes: string;
};

/** timestamptz -> valor de <input type="datetime-local"> na hora de parede de Brasília. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return toDateTimeLocalInSaoPaulo(d);
}

function defaults(task?: TaskWithRelations | null, defaultDate?: string | null): FormValues {
  const rec = task?.recurrence ?? null;
  return {
    title: task?.title ?? "",
    project_id: task?.project_id ?? NONE,
    priority: task?.priority ?? "media",
    status: task?.status ?? "pendente",
    start_date: task?.start_date ?? "",
    due_date: task?.due_date ?? defaultDate ?? "",
    reminder_at: isoToLocalInput(task?.reminder_at ?? null),
    tags: (task?.tags ?? []).join(", "),
    rec_freq: rec?.freq ?? NONE,
    rec_interval: String(rec?.interval ?? 1),
    rec_weekdays: rec?.weekdays ?? [],
    rec_until: rec?.until ?? "",
    calendar_event_id: task?.calendar_event_id ?? NONE,
    notes: task?.notes ?? "",
  };
}

function parseTags(input: string): string[] {
  return Array.from(
    new Set(
      input
        .split(/[,\n]/)
        .map((t) => t.trim().replace(/^#/, ""))
        .filter(Boolean),
    ),
  );
}

export function TaskFormDialog({
  open,
  onOpenChange,
  task,
  projects,
  events,
  defaultDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskWithRelations | null;
  projects: ProjectOption[];
  events: EventOption[];
  defaultDate?: string | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(task);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(task, defaultDate) });

  React.useEffect(() => {
    if (open) reset(defaults(task, defaultDate));
  }, [open, task, defaultDate, reset]);

  const recFreq = useWatch({ control, name: "rec_freq" });

  async function onSubmit(values: FormValues) {
    const recurrence =
      values.rec_freq === NONE
        ? null
        : {
            freq: values.rec_freq,
            interval: Number(values.rec_interval) || 1,
            weekdays:
              values.rec_freq === "semanal" && values.rec_weekdays.length
                ? values.rec_weekdays
                : undefined,
            until: values.rec_until || null,
          };

    const payload = {
      title: values.title,
      project_id: values.project_id === NONE ? "" : values.project_id,
      priority: values.priority,
      status: values.status,
      start_date: values.start_date,
      due_date: values.due_date,
      // O lembrete digitado é hora de Brasília, não do fuso do aparelho.
      reminder_at: values.reminder_at
        ? saoPauloWallClockToInstant(
            values.reminder_at.slice(0, 10),
            values.reminder_at.slice(11, 16),
          ).toISOString()
        : null,
      tags: parseTags(values.tags),
      recurrence,
      calendar_event_id:
        values.calendar_event_id === NONE ? "" : values.calendar_event_id,
      notes: values.notes,
    };

    const res = isEdit
      ? await updateTask(task!.id, payload)
      : await createTask(payload);

    if (res.ok) {
      toast.success(isEdit ? "Tarefa atualizada." : "Tarefa criada.");
      onOpenChange(false);
      onSaved?.();
      router.refresh();
    } else {
      applyFieldErrors(setError, res.fieldErrors);
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar tarefa" : "Nova tarefa"}</DialogTitle>
          <DialogDescription>
            Defina prioridade, datas, recorrência, lembrete e vínculos.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="task-title">Título</Label>
            <Input
              id="task-title"
              aria-invalid={Boolean(errors.title)}
              {...register("title", { required: "Informe um título" })}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Projeto</Label>
              <Controller
                control={control}
                name="project_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem projeto</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Controller
                control={control}
                name="priority"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {TASK_PRIORITY_LABELS[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TASK_STORED_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {TASK_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-start">Início</Label>
              <Input id="task-start" type="date" {...register("start_date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due">Vencimento</Label>
              <Input
                id="task-due"
                type="date"
                aria-invalid={Boolean(errors.due_date)}
                {...register("due_date")}
              />
              {errors.due_date && (
                <p className="text-xs text-destructive">{errors.due_date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-tags">Tags</Label>
            <Input
              id="task-tags"
              placeholder="trabalho, urgente, casa"
              {...register("tags")}
            />
            <p className="text-xs text-muted-foreground">Separe por vírgula.</p>
          </div>

          {/* Recorrência */}
          <div className="space-y-3 rounded-lg border p-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Repetir</Label>
                <Controller
                  control={control}
                  name="rec_freq"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Não repetir</SelectItem>
                        {TASK_RECURRENCE_FREQUENCIES.map((f) => (
                          <SelectItem key={f} value={f}>
                            {TASK_RECURRENCE_FREQUENCY_LABELS[f]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              {recFreq !== NONE && (
                <div className="space-y-1.5">
                  <Label htmlFor="task-interval">A cada</Label>
                  <Input
                    id="task-interval"
                    type="number"
                    min={1}
                    {...register("rec_interval")}
                  />
                </div>
              )}
            </div>

            {recFreq === "semanal" && (
              <Controller
                control={control}
                name="rec_weekdays"
                render={({ field }) => (
                  <div className="space-y-1.5">
                    <Label>Nos dias</Label>
                    <div className="flex gap-1.5">
                      {WEEKDAYS.map((d) => {
                        const active = field.value.includes(d.value);
                        return (
                          <button
                            key={d.value}
                            type="button"
                            onClick={() =>
                              field.onChange(
                                active
                                  ? field.value.filter((v) => v !== d.value)
                                  : [...field.value, d.value].sort((a, b) => a - b),
                              )
                            }
                            className={cn(
                              "grid size-8 place-items-center rounded-full border text-xs font-medium transition-colors",
                              active
                                ? "border-primary bg-primary text-primary-foreground"
                                : "text-muted-foreground hover:bg-accent",
                            )}
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              />
            )}

            {recFreq !== NONE && (
              <div className="space-y-1.5">
                <Label htmlFor="task-until">Repetir até (opcional)</Label>
                <Input id="task-until" type="date" {...register("rec_until")} />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="task-reminder">Lembrete</Label>
              <Input
                id="task-reminder"
                type="datetime-local"
                {...register("reminder_at")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Vincular à agenda</Label>
              <Controller
                control={control}
                name="calendar_event_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem vínculo</SelectItem>
                      {events.map((ev) => (
                        <SelectItem key={ev.id} value={ev.id}>
                          {ev.title} · {formatDate(ev.start_at)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="task-notes">Observações</Label>
            <Textarea id="task-notes" rows={2} {...register("notes")} />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
