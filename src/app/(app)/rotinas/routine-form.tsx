"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Check, Plus, X } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import {
  addRoutineItem,
  createRoutine,
  deleteRoutineItem,
  updateRoutine,
} from "@/lib/actions/routines";
import {
  ENTITY_COLOR_PALETTE,
  ROUTINE_FREQUENCIES,
  ROUTINE_FREQUENCY_LABELS,
  ROUTINE_TYPES,
  ROUTINE_TYPE_LABELS,
  type RoutineFrequency,
  type RoutineType,
} from "@/lib/tasks/constants";
import type { RoutineWithItems } from "@/types/database";

const WEEKDAYS = [
  { value: 0, label: "D" },
  { value: 1, label: "S" },
  { value: 2, label: "T" },
  { value: 3, label: "Q" },
  { value: 4, label: "Q" },
  { value: 5, label: "S" },
  { value: 6, label: "S" },
];

type FormValues = {
  name: string;
  type: RoutineType;
  frequency: RoutineFrequency;
  weekdays: number[];
  time_of_day: string;
  color: string;
  icon: string;
  description: string;
  is_active: boolean;
};

function defaults(routine?: RoutineWithItems): FormValues {
  return {
    name: routine?.name ?? "",
    type: routine?.type ?? "outro",
    frequency: routine?.frequency ?? "diaria",
    weekdays: routine?.weekdays ?? [],
    time_of_day: routine?.time_of_day ? routine.time_of_day.slice(0, 5) : "",
    color: routine?.color ?? "",
    icon: routine?.icon ?? "",
    description: routine?.description ?? "",
    is_active: routine?.is_active ?? true,
  };
}

export function RoutineFormDialog({
  routine,
  open,
  onOpenChange,
}: {
  routine?: RoutineWithItems;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(routine);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(routine) });

  React.useEffect(() => {
    if (open) reset(defaults(routine));
  }, [open, routine, reset]);

  const frequency = useWatch({ control, name: "frequency" });

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      type: values.type,
      description: values.description,
      color: values.color,
      icon: values.icon,
      frequency: values.frequency,
      weekdays: values.frequency === "diaria" ? [] : values.weekdays,
      time_of_day: values.time_of_day,
      is_active: values.is_active,
    };

    const res = isEdit
      ? await updateRoutine(routine!.id, payload)
      : await createRoutine(payload);

    if (res.ok) {
      toast.success(isEdit ? "Rotina atualizada." : "Rotina criada.");
      onOpenChange(false);
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
          <DialogTitle>{isEdit ? "Editar rotina" : "Nova rotina"}</DialogTitle>
          <DialogDescription>
            Rotinas recorrentes com passos e check-in diário.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rot-icon">Ícone</Label>
              <Input
                id="rot-icon"
                maxLength={2}
                placeholder="🌅"
                className="w-14 text-center text-lg"
                {...register("icon")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rot-name">Nome</Label>
              <Input
                id="rot-name"
                aria-invalid={Boolean(errors.name)}
                {...register("name", { required: "Informe um nome" })}
              />
              {errors.name && (
                <p className="text-xs text-destructive">{errors.name.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Controller
                control={control}
                name="type"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROUTINE_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {ROUTINE_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rot-time">Horário ideal</Label>
              <Input id="rot-time" type="time" {...register("time_of_day")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Frequência</Label>
            <Controller
              control={control}
              name="frequency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTINE_FREQUENCIES.map((f) => (
                      <SelectItem key={f} value={f}>
                        {ROUTINE_FREQUENCY_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          {frequency !== "diaria" && (
            <Controller
              control={control}
              name="weekdays"
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
                  {errors.weekdays && (
                    <p className="text-xs text-destructive">
                      {errors.weekdays.message as string}
                    </p>
                  )}
                </div>
              )}
            />
          )}

          <div className="space-y-1.5">
            <Label>Cor</Label>
            <Controller
              control={control}
              name="color"
              render={({ field }) => (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => field.onChange("")}
                    className={cn(
                      "grid size-7 place-items-center rounded-full border text-xs text-muted-foreground",
                      !field.value && "ring-2 ring-primary ring-offset-1 ring-offset-background",
                    )}
                    aria-label="Sem cor"
                  >
                    —
                  </button>
                  {ENTITY_COLOR_PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => field.onChange(c)}
                      className={cn(
                        "grid size-7 place-items-center rounded-full ring-offset-background transition",
                        field.value === c && "ring-2 ring-primary ring-offset-1",
                      )}
                      style={{ backgroundColor: c }}
                      aria-label={`Cor ${c}`}
                    >
                      {field.value === c && (
                        <Check className="size-3.5 text-white" strokeWidth={3} />
                      )}
                    </button>
                  ))}
                </div>
              )}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rot-desc">Descrição</Label>
            <Textarea id="rot-desc" rows={2} {...register("description")} />
          </div>

          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Rotina ativa</span>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />

          {isEdit && routine && <RoutineItemsEditor routine={routine} />}

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

function RoutineItemsEditor({ routine }: { routine: RoutineWithItems }) {
  const router = useRouter();
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const items = routine.items ?? [];

  async function add() {
    if (!label.trim()) return;
    setBusy(true);
    try {
      const res = await addRoutineItem(routine.id, { label });
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
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Passos da rotina {items.length > 0 && `· ${items.length}`}
      </p>
      {items.length > 0 && (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-2 text-sm">
              <span className="flex-1">{item.label}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Remover passo"
                className="text-muted-foreground hover:text-destructive"
                onClick={async () => {
                  const res = await deleteRoutineItem(item.id);
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
          placeholder="Adicionar passo…"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Adicionar passo"
          disabled={busy}
          onClick={add}
        >
          <Plus />
        </Button>
      </div>
    </div>
  );
}
