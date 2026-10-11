"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
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
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import { createPractice } from "@/lib/actions/studies";
import {
  LANGUAGE_SKILLS,
  LANGUAGE_SKILL_LABELS,
  type LanguageSkill,
} from "@/lib/studies/constants";

type PracticeValues = {
  skill: LanguageSkill;
  duration_minutes: string;
  practice_date: string;
  notes: string;
};

export function PracticeFormDialog({
  courseId,
  todayIso,
  open,
  onOpenChange,
}: {
  courseId: string;
  todayIso: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PracticeValues>({
    defaultValues: {
      skill: "listening",
      duration_minutes: "20",
      practice_date: todayIso,
      notes: "",
    },
  });

  React.useEffect(() => {
    if (open)
      reset({
        skill: "listening",
        duration_minutes: "20",
        practice_date: todayIso,
        notes: "",
      });
  }, [open, todayIso, reset]);

  async function onSubmit(values: PracticeValues) {
    const res = await createPractice(courseId, values);
    if (res.ok) {
      toast.success("Prática registrada.");
      onOpenChange(false);
      router.refresh();
    } else {
      applyFieldErrors(setError, res.fieldErrors);
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar prática</DialogTitle>
          <DialogDescription>
            Habilidade, tempo e data da prática.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5 sm:col-span-1">
              <Label>Habilidade</Label>
              <Controller
                control={control}
                name="skill"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGE_SKILLS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {LANGUAGE_SKILL_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="practice-duration">Duração (min)</Label>
              <Input
                id="practice-duration"
                type="number"
                inputMode="numeric"
                min={0}
                step="1"
                aria-invalid={Boolean(errors.duration_minutes)}
                {...register("duration_minutes")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="practice-date">Data</Label>
              <Input
                id="practice-date"
                type="date"
                {...register("practice_date")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="practice-notes">Notas</Label>
            <Textarea id="practice-notes" rows={2} {...register("notes")} />
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
