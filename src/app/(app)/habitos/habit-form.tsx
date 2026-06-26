"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Check } from "lucide-react";
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
import { createHabit, updateHabit } from "@/lib/actions/habits";
import {
  HABIT_CATEGORIES,
  HABIT_CATEGORY_LABELS,
  HABIT_COLOR_PALETTE,
  HABIT_FREQUENCIES,
  HABIT_FREQUENCY_LABELS,
  HABIT_UNIT_LABELS,
  HABIT_UNITS,
  type HabitCategory,
  type HabitFrequency,
  type HabitUnit,
} from "@/lib/habits/constants";
import type { HabitRow } from "@/types/database";

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
  category: HabitCategory;
  description: string;
  frequency: HabitFrequency;
  weekdays: number[];
  target_value: number;
  unit: HabitUnit;
  time_of_day: string;
  reminder_at: string;
  color: string;
  icon: string;
  is_active: boolean;
};

function defaults(habit?: HabitRow): FormValues {
  return {
    name: habit?.name ?? "",
    category: habit?.category ?? "outro",
    description: habit?.description ?? "",
    frequency: habit?.frequency ?? "diaria",
    weekdays: habit?.weekdays ?? [],
    target_value: habit?.target_value ?? 1,
    unit: habit?.unit ?? "vezes",
    time_of_day: habit?.time_of_day ? habit.time_of_day.slice(0, 5) : "",
    reminder_at: habit?.reminder_at ? habit.reminder_at.slice(0, 5) : "",
    color: habit?.color ?? "",
    icon: habit?.icon ?? "",
    is_active: habit?.is_active ?? true,
  };
}

export function HabitFormDialog({
  habit,
  open,
  onOpenChange,
}: {
  habit?: HabitRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(habit);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(habit) });

  React.useEffect(() => {
    if (open) reset(defaults(habit));
  }, [open, habit, reset]);

  const frequency = useWatch({ control, name: "frequency" });
  const category = useWatch({ control, name: "category" });

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      category: values.category,
      description: values.description,
      frequency: values.frequency,
      weekdays: values.frequency === "diaria" ? [] : values.weekdays,
      target_value: values.target_value,
      unit: values.unit,
      time_of_day: values.time_of_day,
      reminder_at: values.reminder_at,
      color: values.color,
      icon: values.icon,
      is_active: values.is_active,
    };

    const res = isEdit
      ? await updateHabit(habit!.id, payload)
      : await createHabit(payload);

    if (res.ok) {
      toast.success(isEdit ? "Hábito atualizado." : "Hábito criado.");
      onOpenChange(false);
      router.refresh();
    } else {
      applyFieldErrors(setError, res.fieldErrors);
      toast.error(res.error);
    }
  }

  const descriptionLabel =
    category === "leitura"
      ? "Livro atual / observações"
      : category === "exercicios"
        ? "Tipo de exercício / observações"
        : "Observações";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar hábito" : "Novo hábito"}</DialogTitle>
          <DialogDescription>
            Frequência, meta, unidade e horário ideal — com check-in diário.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="hab-icon">Ícone</Label>
              <Input
                id="hab-icon"
                maxLength={2}
                placeholder="💧"
                className="w-14 text-center text-lg"
                {...register("icon")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hab-name">Nome</Label>
              <Input
                id="hab-name"
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
              <Label>Categoria</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HABIT_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {HABIT_CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
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
                      {HABIT_FREQUENCIES.map((f) => (
                        <SelectItem key={f} value={f}>
                          {HABIT_FREQUENCY_LABELS[f]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hab-target">Meta do dia</Label>
              <Input
                id="hab-target"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                aria-invalid={Boolean(errors.target_value)}
                {...register("target_value", {
                  valueAsNumber: true,
                  required: "Informe a meta",
                  min: { value: 0.0001, message: "A meta deve ser maior que zero" },
                })}
              />
              {errors.target_value && (
                <p className="text-xs text-destructive">
                  {errors.target_value.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Controller
                control={control}
                name="unit"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HABIT_UNITS.map((u) => (
                        <SelectItem key={u} value={u}>
                          {HABIT_UNIT_LABELS[u]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="hab-time">Horário ideal</Label>
              <Input id="hab-time" type="time" {...register("time_of_day")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hab-reminder">Lembrete</Label>
              <Input id="hab-reminder" type="time" {...register("reminder_at")} />
            </div>
          </div>

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
                      !field.value &&
                        "ring-2 ring-primary ring-offset-1 ring-offset-background",
                    )}
                    aria-label="Cor da categoria"
                  >
                    —
                  </button>
                  {HABIT_COLOR_PALETTE.map((c) => (
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
            <Label htmlFor="hab-desc">{descriptionLabel}</Label>
            <Textarea id="hab-desc" rows={2} {...register("description")} />
          </div>

          <Controller
            control={control}
            name="is_active"
            render={({ field }) => (
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">Hábito ativo</span>
                <Switch checked={field.value} onCheckedChange={field.onChange} />
              </label>
            )}
          />

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
