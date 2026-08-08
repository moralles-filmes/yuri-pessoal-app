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
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { createEvent, updateEvent } from "@/lib/actions/calendar";
import {
  EVENT_FREQUENCIES,
  EVENT_FREQUENCY_LABELS,
  EVENT_TYPES,
  EVENT_TYPE_LABELS,
  REMINDER_OPTIONS,
  type EventType,
} from "@/lib/calendar/constants";
import { EVENT_TYPE_COLORS } from "@/lib/calendar/colors";
import { dateInSaoPaulo, timeInSaoPaulo } from "@/lib/format";
import { instanteDoEvento } from "@/lib/calendar/instants";
import type { CalendarEventRow } from "@/types/database";

const NONE = "none";

type FormValues = {
  title: string;
  tipo: EventType;
  all_day: boolean;
  start_date: string;
  start_time: string;
  end_date: string;
  end_time: string;
  location: string;
  description: string;
  recurrence_freq: string;
  recurrence_interval: string;
  recurrence_until: string;
  reminder: string;
  custom_color: boolean;
  color: string;
};

// Instante -> hora de parede de BRASÍLIA (não do aparelho): um celular configurado em
// outro fuso mostraria o evento com horas de diferença.
function localDate(d: Date): string {
  return dateInSaoPaulo(d);
}
function localTime(d: Date): string {
  return timeInSaoPaulo(d);
}

function defaults(
  event?: CalendarEventRow | null,
  defaultStart?: string | null,
): FormValues {
  if (event) {
    const start = new Date(event.start_at);
    const end = new Date(event.end_at);
    return {
      title: event.title,
      tipo: (EVENT_TYPES as readonly string[]).includes(event.tipo)
        ? (event.tipo as EventType)
        : "pessoal",
      all_day: event.all_day,
      start_date: localDate(start),
      start_time: localTime(start),
      end_date: localDate(end),
      end_time: localTime(end),
      location: event.location ?? "",
      description: event.description ?? "",
      recurrence_freq: event.recurrence_freq ?? NONE,
      recurrence_interval: String(event.recurrence_interval ?? 1),
      recurrence_until: event.recurrence_until ?? "",
      reminder: event.reminder_minutes == null ? NONE : String(event.reminder_minutes),
      custom_color: Boolean(event.color),
      color: event.color ?? EVENT_TYPE_COLORS[(event.tipo as EventType) ?? "pessoal"] ?? "#C99A2E",
    };
  }
  const base = defaultStart ? new Date(defaultStart) : new Date();
  if (Number.isNaN(base.getTime())) base.setTime(Date.now());
  const start = new Date(base);
  // Próxima hora cheia para um novo evento.
  start.setMinutes(0, 0, 0);
  if (!defaultStart) start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return {
    title: "",
    tipo: "pessoal",
    all_day: false,
    start_date: localDate(start),
    start_time: localTime(start),
    end_date: localDate(end),
    end_time: localTime(end),
    location: "",
    description: "",
    recurrence_freq: NONE,
    recurrence_interval: "1",
    recurrence_until: "",
    reminder: NONE,
    custom_color: false,
    color: EVENT_TYPE_COLORS.pessoal,
  };
}

/**
 * A conversão saiu daqui e virou `calendar/instants.ts` (18-C · Bloco 4): a IA passou a criar
 * evento também, e duas cópias dessas três linhas dariam dois eventos diferentes para a mesma
 * frase — divergindo só entre 21h e 00h BRT, que é quando ninguém está testando.
 */
const buildIso = instanteDoEvento;

export function EventFormDialog({
  open,
  onOpenChange,
  event,
  defaultStart,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: CalendarEventRow | null;
  defaultStart?: string | null;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(event);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(event, defaultStart) });

  React.useEffect(() => {
    if (open) reset(defaults(event, defaultStart));
  }, [open, event, defaultStart, reset]);

  const allDay = useWatch({ control, name: "all_day" });
  const freq = useWatch({ control, name: "recurrence_freq" });
  const customColor = useWatch({ control, name: "custom_color" });

  async function onSubmit(values: FormValues) {
    const startIso = buildIso(values.start_date, values.start_time, values.all_day);
    const endIso = buildIso(
      values.end_date || values.start_date,
      values.end_time,
      values.all_day,
    );
    if (new Date(endIso).getTime() < new Date(startIso).getTime()) {
      setError("end_date", {
        message: "O fim deve ser igual ou posterior ao início",
      });
      return;
    }

    const payload = {
      title: values.title,
      tipo: values.tipo,
      all_day: values.all_day,
      start_at: startIso,
      end_at: endIso,
      location: values.location,
      description: values.description,
      recurrence_freq: values.recurrence_freq === NONE ? null : values.recurrence_freq,
      recurrence_interval: values.recurrence_interval,
      recurrence_until: values.recurrence_freq === NONE ? "" : values.recurrence_until,
      reminder_minutes: values.reminder === NONE ? null : values.reminder,
      color: values.custom_color ? values.color : "",
      task_id: event?.task_id ?? "",
    };

    const res = isEdit
      ? await updateEvent(event!.id, payload)
      : await createEvent(payload);

    if (res.ok) {
      toast.success(isEdit ? "Evento atualizado." : "Evento criado.");
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
          <DialogTitle>{isEdit ? "Editar evento" : "Novo evento"}</DialogTitle>
          <DialogDescription>
            Eventos da sua agenda. Conecte o Google para sincronizar.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ev-title">Título</Label>
            <Input
              id="ev-title"
              aria-invalid={Boolean(errors.title)}
              {...register("title", { required: "Informe um título" })}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Controller
                control={control}
                name="tipo"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EVENT_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden
                              className="size-2.5 rounded-full"
                              style={{ backgroundColor: EVENT_TYPE_COLORS[t] }}
                            />
                            {EVENT_TYPE_LABELS[t]}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <Controller
              control={control}
              name="all_day"
              render={({ field }) => (
                <label className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <span className="text-sm font-medium">Dia inteiro</span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </label>
              )}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ev-start-date">Início</Label>
              <div className="flex gap-2">
                <Input id="ev-start-date" type="date" {...register("start_date", { required: true })} />
                {!allDay && (
                  <Input type="time" className="w-28" {...register("start_time")} />
                )}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ev-end-date">Fim</Label>
              <div className="flex gap-2">
                <Input
                  id="ev-end-date"
                  type="date"
                  aria-invalid={Boolean(errors.end_date)}
                  {...register("end_date", { required: true })}
                />
                {!allDay && (
                  <Input type="time" className="w-28" {...register("end_time")} />
                )}
              </div>
              {errors.end_date && (
                <p className="text-xs text-destructive">{errors.end_date.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-location">Local</Label>
            <Input id="ev-location" {...register("location")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ev-desc">Descrição</Label>
            <Textarea id="ev-desc" rows={2} {...register("description")} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Repetir</Label>
              <Controller
                control={control}
                name="recurrence_freq"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Não repetir</SelectItem>
                      {EVENT_FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {EVENT_FREQUENCY_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Lembrete</Label>
              <Controller
                control={control}
                name="reminder"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REMINDER_OPTIONS.map((o) => (
                        <SelectItem
                          key={String(o.value)}
                          value={o.value == null ? NONE : String(o.value)}
                        >
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          {freq !== NONE && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="ev-interval">A cada</Label>
                <Input
                  id="ev-interval"
                  type="number"
                  min={1}
                  {...register("recurrence_interval")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ev-until">Repetir até</Label>
                <Input id="ev-until" type="date" {...register("recurrence_until")} />
              </div>
            </div>
          )}

          <div className="flex items-center gap-3 rounded-lg border p-3">
            <Controller
              control={control}
              name="custom_color"
              render={({ field }) => (
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              )}
            />
            <span className="flex-1 text-sm font-medium">Cor personalizada</span>
            {customColor && (
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <input
                    type="color"
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    className="size-9 cursor-pointer rounded-md border bg-transparent"
                    aria-label="Cor do evento"
                  />
                )}
              />
            )}
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
