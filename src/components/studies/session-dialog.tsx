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
import { createSession, updateSession } from "@/lib/actions/studies";
import {
  STUDY_DIFFICULTIES,
  STUDY_DIFFICULTY_LABELS,
  type StudyDifficulty,
} from "@/lib/studies/constants";
import type {
  StudyCourseOption,
  StudySessionWithRelations,
  StudyTaskOption,
} from "@/types/database";

const NONE = "__none__";

type FormValues = {
  course_id: string;
  lesson_id: string;
  session_date: string;
  duration_minutes: string;
  difficulty: StudyDifficulty;
  what_i_learned: string;
  next_action: string;
  task_id: string;
  mark_lesson_done: boolean;
};

function defaults(
  todayIso: string,
  courseOptions: StudyCourseOption[],
  fixedCourseId?: string,
  session?: StudySessionWithRelations,
): FormValues {
  const course_id =
    session?.course_id ?? fixedCourseId ?? courseOptions[0]?.id ?? "";
  return {
    course_id,
    lesson_id: session?.lesson_id ?? "",
    session_date: session?.session_date ?? todayIso,
    duration_minutes: session ? String(session.duration_minutes) : "30",
    difficulty: session?.difficulty ?? "media",
    what_i_learned: session?.what_i_learned ?? "",
    next_action: session?.next_action ?? "",
    task_id: session?.task_id ?? "",
    mark_lesson_done: false,
  };
}

export function SessionFormDialog({
  open,
  onOpenChange,
  todayIso,
  courseOptions,
  taskOptions,
  fixedCourseId,
  session,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  todayIso: string;
  courseOptions: StudyCourseOption[];
  taskOptions: StudyTaskOption[];
  fixedCourseId?: string;
  session?: StudySessionWithRelations;
}) {
  const router = useRouter();
  const isEdit = Boolean(session);

  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    defaultValues: defaults(todayIso, courseOptions, fixedCourseId, session),
  });

  React.useEffect(() => {
    if (open) reset(defaults(todayIso, courseOptions, fixedCourseId, session));
  }, [open, todayIso, courseOptions, fixedCourseId, session, reset]);

  const courseId = useWatch({ control, name: "course_id" });
  const lessonId = useWatch({ control, name: "lesson_id" });
  const lessons =
    courseOptions.find((c) => c.id === courseId)?.lessons ?? [];

  const courseLocked = Boolean(fixedCourseId) || isEdit;

  async function onSubmit(values: FormValues) {
    if (!values.course_id) {
      toast.error("Selecione um curso.");
      return;
    }
    const payload = {
      course_id: values.course_id,
      lesson_id: values.lesson_id || "",
      session_date: values.session_date,
      duration_minutes: values.duration_minutes,
      difficulty: values.difficulty,
      what_i_learned: values.what_i_learned,
      next_action: values.next_action,
      task_id: values.task_id || "",
      mark_lesson_done: values.mark_lesson_done,
    };

    const res = isEdit
      ? await updateSession(session!.id, payload)
      : await createSession(payload);

    if (res.ok) {
      toast.success(isEdit ? "Sessão atualizada." : "Sessão registrada.");
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
          <DialogTitle>
            {isEdit ? "Editar sessão" : "Registrar sessão de estudo"}
          </DialogTitle>
          <DialogDescription>
            Tempo, o que aprendi e a próxima ação.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {!courseLocked && (
            <div className="space-y-1.5">
              <Label>Curso</Label>
              <Controller
                control={control}
                name="course_id"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Selecione um curso" />
                    </SelectTrigger>
                    <SelectContent>
                      {courseOptions.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          {lessons.length > 0 && (
            <div className="space-y-1.5">
              <Label>Aula (opcional)</Label>
              <Controller
                control={control}
                name="lesson_id"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem aula específica" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem aula específica</SelectItem>
                      {lessons.map((l) => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="sess-date">Data</Label>
              <Input id="sess-date" type="date" {...register("session_date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sess-duration">Duração (min)</Label>
              <Input
                id="sess-duration"
                type="number"
                inputMode="numeric"
                min={0}
                step="1"
                aria-invalid={Boolean(errors.duration_minutes)}
                {...register("duration_minutes")}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Dificuldade</Label>
              <Controller
                control={control}
                name="difficulty"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STUDY_DIFFICULTIES.map((d) => (
                        <SelectItem key={d} value={d}>
                          {STUDY_DIFFICULTY_LABELS[d]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sess-learned">O que aprendi</Label>
            <Textarea
              id="sess-learned"
              rows={2}
              placeholder="Principais aprendizados desta sessão…"
              {...register("what_i_learned")}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sess-next">Próxima ação</Label>
            <Textarea
              id="sess-next"
              rows={2}
              placeholder="O que fazer na próxima vez…"
              {...register("next_action")}
            />
          </div>

          {taskOptions.length > 0 && (
            <div className="space-y-1.5">
              <Label>Tarefa relacionada (opcional)</Label>
              <Controller
                control={control}
                name="task_id"
                render={({ field }) => (
                  <Select
                    value={field.value || NONE}
                    onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Sem tarefa" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Sem tarefa</SelectItem>
                      {taskOptions.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          )}

          {!isEdit && lessonId && (
            <Controller
              control={control}
              name="mark_lesson_done"
              render={({ field }) => (
                <label className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">
                    Marcar a aula como concluída
                  </span>
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                </label>
              )}
            />
          )}

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
