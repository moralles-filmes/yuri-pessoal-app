"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
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
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/shared/empty-state";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { cn } from "@/lib/utils";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import {
  deleteLesson,
  deleteModule,
  moveLesson,
  moveModule,
  toggleLessonDone,
} from "@/lib/actions/studies";
import { formatMinutes } from "@/lib/studies/constants";
import type { StudyLessonRow, StudyModuleWithLessons } from "@/types/database";

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const ModuleFormDialog = dynamic(
  () => import("./module-form-dialog").then((m) => m.ModuleFormDialog),
  { ssr: false },
);

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const LessonFormDialog = dynamic(
  () => import("./lesson-form-dialog").then((m) => m.LessonFormDialog),
  { ssr: false },
);

/** Árvore de módulos e aulas do curso, com CRUD, reordenação e marcar concluída. */
export function CourseTree({
  courseId,
  modules,
}: {
  courseId: string;
  modules: StudyModuleWithLessons[];
}) {
  const [moduleForm, setModuleForm] = React.useState(false);
  const moduleFormMontado = useLazyDialog(moduleForm);
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

      {moduleFormMontado && (
        <ModuleFormDialog
          courseId={courseId}
          module={editingModule}
          open={moduleForm}
          onOpenChange={setModuleForm}
        />
      )}
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
  const lessonFormMontado = useLazyDialog(lessonForm);
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

      {lessonFormMontado && (
        <LessonFormDialog
          moduleId={module.id}
          lesson={editingLesson}
          open={lessonForm}
          onOpenChange={setLessonForm}
        />
      )}
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
        aria-label={`Concluir ${lesson.title}`}
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

/** Garante esquema no link (para abrir em nova aba sem virar rota relativa). */
function withProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
