"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, type Path } from "react-hook-form";
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
import { mapServerFieldErrors, serverErrorMessage } from "@/lib/forms/server-errors";
import { createLesson, updateLesson } from "@/lib/actions/studies";
import type { StudyLessonRow } from "@/types/database";

type LessonValues = {
  title: string;
  url: string;
  duration_minutes: string;
  notes: string;
};

// Campos que a tela tem: erro de campo fora desta lista sobe para o toast com o nome (mapServerFieldErrors).
const FORM_FIELDS = ["title", "url", "duration_minutes", "notes"] as const;

export function LessonFormDialog({
  moduleId,
  lesson,
  open,
  onOpenChange,
}: {
  moduleId: string;
  lesson?: StudyLessonRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(lesson);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LessonValues>({
    defaultValues: {
      title: lesson?.title ?? "",
      url: lesson?.url ?? "",
      duration_minutes: lesson ? String(lesson.duration_minutes) : "",
      notes: lesson?.notes ?? "",
    },
  });

  React.useEffect(() => {
    if (open)
      reset({
        title: lesson?.title ?? "",
        url: lesson?.url ?? "",
        duration_minutes: lesson ? String(lesson.duration_minutes) : "",
        notes: lesson?.notes ?? "",
      });
  }, [open, lesson, reset]);

  async function onSubmit(values: LessonValues) {
    const payload = {
      title: values.title,
      url: values.url,
      duration_minutes: values.duration_minutes || "0",
      notes: values.notes,
    };
    const res = isEdit
      ? await updateLesson(lesson!.id, payload)
      : await createLesson(moduleId, payload);
    if (res.ok) {
      toast.success(isEdit ? "Aula atualizada." : "Aula criada.");
      onOpenChange(false);
      router.refresh();
    } else {
      const mapped = mapServerFieldErrors(res.fieldErrors, FORM_FIELDS);
      for (const { name, message } of mapped.toSet)
        setError(name as Path<LessonValues>, { message });
      toast.error(serverErrorMessage(res.error, mapped));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar aula" : "Nova aula"}</DialogTitle>
          <DialogDescription>Título, link e duração da aula.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lesson-title">Título</Label>
            <Input
              id="lesson-title"
              aria-invalid={Boolean(errors.title)}
              {...register("title", { required: "Informe um título" })}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto]">
            <div className="space-y-1.5">
              <Label htmlFor="lesson-url">Link</Label>
              <Input
                id="lesson-url"
                placeholder="https://…"
                aria-invalid={Boolean(errors.url)}
                {...register("url")}
              />
              {errors.url && (
                <p className="text-xs text-destructive">{errors.url.message}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lesson-duration">Duração (min)</Label>
              <Input
                id="lesson-duration"
                type="number"
                inputMode="numeric"
                min={0}
                step="1"
                className="sm:w-28"
                {...register("duration_minutes")}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lesson-notes">Notas</Label>
            <Textarea id="lesson-notes" rows={2} {...register("notes")} />
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
