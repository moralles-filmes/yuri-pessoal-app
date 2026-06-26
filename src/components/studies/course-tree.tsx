"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  Pencil,
  Plus,
  Trash2,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/empty-state";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { cn } from "@/lib/utils";
import { applyFieldErrors } from "@/components/financeiro/form-utils";
import {
  createLesson,
  createModule,
  deleteLesson,
  deleteModule,
  moveLesson,
  moveModule,
  toggleLessonDone,
  updateLesson,
  updateModule,
} from "@/lib/actions/studies";
import { formatMinutes } from "@/lib/studies/constants";
import type { StudyLessonRow, StudyModuleWithLessons } from "@/types/database";

/** Árvore de módulos e aulas do curso, com CRUD, reordenação e marcar concluída. */
export function CourseTree({
  courseId,
  modules,
}: {
  courseId: string;
  modules: StudyModuleWithLessons[];
}) {
  const [moduleForm, setModuleForm] = React.useState(false);
  const [editingModule, setEditingModule] = React.useState<StudyModuleWithLessons>();

  function openCreateModule() {
    setEditingModule(undefined);
    setModuleForm(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Conteúdo ({modules.length} módulo{modules.length === 1 ? "" : "s"})
        </h2>
        <Button size="sm" variant="outline" onClick={openCreateModule}>
          <Plus /> Módulo
        </Button>
      </div>

      {modules.length === 0 ? (
        <EmptyState
          icon={Layers}
          title="Sem módulos ainda"
          description="Organize o curso em módulos e adicione as aulas de cada um."
        >
          <Button size="sm" onClick={openCreateModule}>
            <Plus /> Adicionar módulo
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-3">
          {modules.map((m, i) => (
            <ModuleBlock
              key={m.id}
              module={m}
              isFirst={i === 0}
              isLast={i === modules.length - 1}
              onEdit={() => {
                setEditingModule(m);
                setModuleForm(true);
              }}
            />
          ))}
        </div>
      )}

      <ModuleFormDialog
        courseId={courseId}
        module={editingModule}
        open={moduleForm}
        onOpenChange={setModuleForm}
      />
    </div>
  );
}

function ModuleBlock({
  module,
  isFirst,
  isLast,
  onEdit,
}: {
  module: StudyModuleWithLessons;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [lessonForm, setLessonForm] = React.useState(false);
  const [editingLesson, setEditingLesson] = React.useState<StudyLessonRow>();
  const done = module.lessons.filter((l) => l.is_done).length;

  async function move(direction: "up" | "down") {
    const res = await moveModule(module.id, direction);
    if (res.ok) router.refresh();
    else toast.error(res.error ?? "Não foi possível reordenar.");
  }

  return (
    <div className="rounded-xl border">
      <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{module.title}</p>
          <p className="text-xs text-muted-foreground">
            {done}/{module.lessons.length} aulas concluídas
          </p>
        </div>
        <div className="flex shrink-0 items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Subir módulo"
            disabled={isFirst}
            onClick={() => move("up")}
          >
            <ChevronUp />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Descer módulo"
            disabled={isLast}
            onClick={() => move("down")}
          >
            <ChevronDown />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Editar módulo"
            onClick={onEdit}
          >
            <Pencil />
          </Button>
          <DeleteConfirmDialog
            title="Excluir módulo"
            description={`Excluir "${module.title}" e todas as suas aulas?`}
            successMessage="Módulo excluído."
            onConfirm={() => deleteModule(module.id)}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Excluir módulo"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            }
          />
        </div>
      </div>

      <div className="divide-y">
        {module.lessons.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs text-muted-foreground">
            Nenhuma aula neste módulo.
          </p>
        ) : (
          module.lessons.map((l, i) => (
            <LessonRow
              key={l.id}
              lesson={l}
              isFirst={i === 0}
              isLast={i === module.lessons.length - 1}
              onEdit={() => {
                setEditingLesson(l);
                setLessonForm(true);
              }}
            />
          ))
        )}
      </div>

      <div className="px-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => {
            setEditingLesson(undefined);
            setLessonForm(true);
          }}
        >
          <Plus /> Adicionar aula
        </Button>
      </div>

      <LessonFormDialog
        moduleId={module.id}
        lesson={editingLesson}
        open={lessonForm}
        onOpenChange={setLessonForm}
      />
    </div>
  );
}

function LessonRow({
  lesson,
  isFirst,
  isLast,
  onEdit,
}: {
  lesson: StudyLessonRow;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function toggle(done: boolean) {
    setBusy(true);
    try {
      const res = await toggleLessonDone(lesson.id, done);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Não foi possível atualizar.");
    } finally {
      setBusy(false);
    }
  }

  async function move(direction: "up" | "down") {
    const res = await moveLesson(lesson.id, direction);
    if (res.ok) router.refresh();
    else toast.error(res.error ?? "Não foi possível reordenar.");
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <Checkbox
        checked={lesson.is_done}
        disabled={busy}
        onCheckedChange={(v) => toggle(Boolean(v))}
        aria-label={lesson.is_done ? "Marcar como não concluída" : "Marcar como concluída"}
      />
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm",
            lesson.is_done && "text-muted-foreground line-through",
          )}
        >
          {lesson.title}
        </p>
        {lesson.duration_minutes > 0 && (
          <p className="text-xs text-muted-foreground">
            {formatMinutes(lesson.duration_minutes)}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center">
        {lesson.url && (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Abrir link da aula"
            asChild
          >
            <a
              href={withProtocol(lesson.url)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink />
            </a>
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Subir aula"
          disabled={isFirst}
          onClick={() => move("up")}
        >
          <ChevronUp />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Descer aula"
          disabled={isLast}
          onClick={() => move("down")}
        >
          <ChevronDown />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Editar aula"
          onClick={onEdit}
        >
          <Pencil />
        </Button>
        <DeleteConfirmDialog
          title="Excluir aula"
          description={`Excluir "${lesson.title}"?`}
          successMessage="Aula excluída."
          onConfirm={() => deleteLesson(lesson.id)}
          trigger={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Excluir aula"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          }
        />
      </div>
    </div>
  );
}

/* ───────────────────────────── Formulários ───────────────────────────── */

type ModuleValues = { title: string; notes: string };

function ModuleFormDialog({
  courseId,
  module,
  open,
  onOpenChange,
}: {
  courseId: string;
  module?: StudyModuleWithLessons;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const isEdit = Boolean(module);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ModuleValues>({
    defaultValues: { title: module?.title ?? "", notes: module?.notes ?? "" },
  });

  React.useEffect(() => {
    if (open) reset({ title: module?.title ?? "", notes: module?.notes ?? "" });
  }, [open, module, reset]);

  async function onSubmit(values: ModuleValues) {
    const res = isEdit
      ? await updateModule(module!.id, values)
      : await createModule(courseId, values);
    if (res.ok) {
      toast.success(isEdit ? "Módulo atualizado." : "Módulo criado.");
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
          <DialogTitle>{isEdit ? "Editar módulo" : "Novo módulo"}</DialogTitle>
          <DialogDescription>Um agrupamento de aulas do curso.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="mod-title">Título</Label>
            <Input
              id="mod-title"
              aria-invalid={Boolean(errors.title)}
              {...register("title", { required: "Informe um título" })}
            />
            {errors.title && (
              <p className="text-xs text-destructive">{errors.title.message}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mod-notes">Notas</Label>
            <Textarea id="mod-notes" rows={2} {...register("notes")} />
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

type LessonValues = {
  title: string;
  url: string;
  duration_minutes: string;
  notes: string;
};

function LessonFormDialog({
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
      applyFieldErrors(setError, res.fieldErrors);
      toast.error(res.error);
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

/** Garante esquema no link (para abrir em nova aba sem virar rota relativa). */
function withProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
