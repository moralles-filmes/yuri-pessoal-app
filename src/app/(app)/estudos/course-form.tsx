"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Check, Plus, Trash2 } from "lucide-react";
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
import { createCourse, updateCourse } from "@/lib/actions/studies";
import {
  STUDY_CATEGORIES,
  STUDY_CATEGORY_LABELS,
  STUDY_COVER_PALETTE,
  STUDY_PRIORITIES,
  STUDY_PRIORITY_LABELS,
  STUDY_STATUSES,
  STUDY_STATUS_LABELS,
  type StudyCategory,
  type StudyPriority,
  type StudyStatus,
} from "@/lib/studies/constants";
import type { StudyCourseRow } from "@/types/database";

type FormValues = {
  title: string;
  platform: string;
  url: string;
  category: StudyCategory;
  status: StudyStatus;
  priority: StudyPriority;
  workload_hours: string;
  weekly_goal_minutes: string;
  start_date: string;
  target_date: string;
  notes: string;
  is_language: boolean;
  cover_color: string;
  icon: string;
  materials: { label: string; url: string }[];
};

function defaults(course?: StudyCourseRow): FormValues {
  return {
    title: course?.title ?? "",
    platform: course?.platform ?? "",
    url: course?.url ?? "",
    category: course?.category ?? "outro",
    status: course?.status ?? "nao_iniciado",
    priority: course?.priority ?? "media",
    workload_hours: course?.workload_minutes
      ? String(Math.round((course.workload_minutes / 60) * 10) / 10)
      : "",
    weekly_goal_minutes: course?.weekly_goal_minutes
      ? String(course.weekly_goal_minutes)
      : "",
    start_date: course?.start_date ?? "",
    target_date: course?.target_date ?? "",
    notes: course?.notes ?? "",
    is_language: course?.is_language ?? false,
    cover_color: course?.cover_color ?? "",
    icon: course?.icon ?? "",
    materials: course?.materials ?? [],
  };
}

export function CourseFormDialog({
  course,
  open,
  onOpenChange,
}: {
  course?: StudyCourseRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(course);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ defaultValues: defaults(course) });

  const { fields, append, remove } = useFieldArray({ control, name: "materials" });

  React.useEffect(() => {
    if (open) reset(defaults(course));
  }, [open, course, reset]);

  const isLanguage = useWatch({ control, name: "is_language" });

  async function onSubmit(values: FormValues) {
    const payload = {
      title: values.title,
      platform: values.platform,
      url: values.url,
      category: values.category,
      status: values.status,
      priority: values.priority,
      workload_minutes: values.workload_hours
        ? Math.round(Number(values.workload_hours) * 60)
        : 0,
      weekly_goal_minutes: values.is_language ? values.weekly_goal_minutes : "",
      start_date: values.start_date,
      target_date: values.target_date,
      notes: values.notes,
      is_language: values.is_language,
      cover_color: values.cover_color,
      icon: values.icon,
      materials: values.materials.filter((m) => m.label.trim() && m.url.trim()),
    };

    const res = isEdit
      ? await updateCourse(course!.id, payload)
      : await createCourse(payload);

    if (res.ok) {
      toast.success(isEdit ? "Curso atualizado." : "Curso criado.");
      onOpenChange(false);
      router.refresh();
    } else {
      applyFieldErrors(setError, res.fieldErrors);
      toast.error(res.error);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar curso" : "Novo curso"}</DialogTitle>
          <DialogDescription>
            Plataforma, categoria, metas, materiais e carga horária.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="grid grid-cols-[auto_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="course-icon">Ícone</Label>
              <Input
                id="course-icon"
                maxLength={2}
                placeholder="🎓"
                className="w-14 text-center text-lg"
                {...register("icon")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-title">Título</Label>
              <Input
                id="course-title"
                aria-invalid={Boolean(errors.title)}
                {...register("title", { required: "Informe um título" })}
              />
              {errors.title && (
                <p className="text-xs text-destructive">{errors.title.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="course-platform">Plataforma</Label>
              <Input
                id="course-platform"
                placeholder="Udemy, Hotmart, YouTube…"
                {...register("platform")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-url">Link do curso</Label>
              <Input
                id="course-url"
                placeholder="https://…"
                aria-invalid={Boolean(errors.url)}
                {...register("url")}
              />
              {errors.url && (
                <p className="text-xs text-destructive">{errors.url.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
                      {STUDY_CATEGORIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {STUDY_CATEGORY_LABELS[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
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
                      {STUDY_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STUDY_STATUS_LABELS[s]}
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
                      {STUDY_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {STUDY_PRIORITY_LABELS[p]}
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
              <Label htmlFor="course-workload">Carga horária (h)</Label>
              <Input
                id="course-workload"
                type="number"
                inputMode="decimal"
                min={0}
                step="any"
                placeholder="Ex.: 20"
                {...register("workload_hours")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-start">Início</Label>
              <Input id="course-start" type="date" {...register("start_date")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="course-target">Meta de conclusão</Label>
              <Input id="course-target" type="date" {...register("target_date")} />
            </div>
          </div>

          <Controller
            control={control}
            name="is_language"
            render={({ field }) => (
              <label className="flex items-center justify-between rounded-lg border p-3">
                <span className="text-sm font-medium">
                  É um curso de idioma?
                  <span className="block text-xs font-normal text-muted-foreground">
                    Habilita vocabulário, prática por habilidade e meta semanal.
                  </span>
                </span>
                <Switch
                  checked={field.value}
                  onCheckedChange={(v) => field.onChange(v)}
                />
              </label>
            )}
          />

          {isLanguage && (
            <div className="space-y-1.5">
              <Label htmlFor="course-goal">Meta semanal de prática (minutos)</Label>
              <Input
                id="course-goal"
                type="number"
                inputMode="numeric"
                min={0}
                step="1"
                placeholder="Ex.: 150"
                {...register("weekly_goal_minutes")}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Cor da capa</Label>
            <Controller
              control={control}
              name="cover_color"
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
                    aria-label="Cor padrão da categoria"
                  >
                    —
                  </button>
                  {STUDY_COVER_PALETTE.map((c) => (
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Materiais / links</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => append({ label: "", url: "" })}
              >
                <Plus /> Adicionar
              </Button>
            </div>
            {fields.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Apostilas, planilhas, repositórios… (opcional).
              </p>
            ) : (
              <div className="space-y-2">
                {fields.map((f, i) => (
                  <div key={f.id} className="flex items-start gap-2">
                    <Input
                      placeholder="Rótulo"
                      className="w-2/5"
                      {...register(`materials.${i}.label` as const)}
                    />
                    <Input
                      placeholder="https://…"
                      className="flex-1"
                      {...register(`materials.${i}.url` as const)}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover material"
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => remove(i)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="course-notes">Notas</Label>
            <Textarea id="course-notes" rows={2} {...register("notes")} />
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
