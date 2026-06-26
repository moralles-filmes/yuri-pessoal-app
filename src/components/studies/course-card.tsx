"use client";

import Link from "next/link";
import { AlertTriangle, BookOpen, Clock, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import {
  StudyCategoryBadge,
  StudyPriorityBadge,
  StudyProgressBar,
  StudyStatusBadge,
  courseIcon,
} from "@/components/studies/badges";
import { deleteCourse } from "@/lib/actions/studies";
import { formatMinutes, formatPercent } from "@/lib/studies/constants";
import { formatDate } from "@/lib/format";
import type { StudyCourseStats } from "@/types/database";

const OVERDUE_LABEL: Record<"target" | "inactive", string> = {
  target: "Passou da meta",
  inactive: "Sem estudo recente",
};

/** Card de curso com capa colorida, progresso e ações. */
export function CourseCard({
  course,
  onEdit,
}: {
  course: StudyCourseStats;
  onEdit: (course: StudyCourseStats) => void;
}) {
  const color = course.cover_color ?? "var(--primary)";

  return (
    <Card className="overflow-hidden p-0">
      <div className="h-1.5 w-full" style={{ backgroundColor: color }} />
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <span className="text-2xl leading-none" aria-hidden>
            {courseIcon(course.icon, course.category)}
          </span>
          <div className="min-w-0 flex-1">
            <Link
              href={`/estudos/${course.id}`}
              className="line-clamp-2 font-semibold leading-tight hover:underline"
            >
              {course.title}
            </Link>
            {course.platform && (
              <p className="truncate text-xs text-muted-foreground">
                {course.platform}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <StudyStatusBadge status={course.status} />
          <StudyCategoryBadge category={course.category} />
          <StudyPriorityBadge priority={course.priority} />
          {course.overdue && (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300">
              <AlertTriangle className="size-3" />
              {OVERDUE_LABEL[course.overdue]}
            </span>
          )}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="tabular-nums">
              {course.doneLessons}/{course.totalLessons} aulas
            </span>
            <span className="font-medium tabular-nums text-foreground">
              {formatPercent(course.progressPct)}
            </span>
          </div>
          <StudyProgressBar value={course.progressPct} color={course.cover_color} />
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" />
            {formatMinutes(course.studiedMinutes)}
          </span>
          {course.nextLessonTitle && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <BookOpen className="size-3.5 shrink-0" />
              <span className="truncate">{course.nextLessonTitle}</span>
            </span>
          )}
          {course.target_date && (
            <span className="ml-auto">Meta: {formatDate(course.target_date)}</span>
          )}
        </div>

        <div className="flex items-center justify-end gap-1 border-t pt-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/estudos/${course.id}`}>Abrir</Link>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Editar curso"
            onClick={() => onEdit(course)}
          >
            <Pencil />
          </Button>
          <DeleteConfirmDialog
            title="Excluir curso"
            description={`Excluir "${course.title}"? Módulos, aulas, sessões e vocabulário também serão removidos.`}
            successMessage="Curso excluído."
            onConfirm={() => deleteCourse(course.id)}
            trigger={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Excluir curso"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}
