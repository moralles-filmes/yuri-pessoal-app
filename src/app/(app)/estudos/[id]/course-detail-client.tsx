"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Clock,
  ExternalLink,
  GraduationCap,
  Link2,
  ListChecks,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { cn } from "@/lib/utils";
import {
  StudyCategoryBadge,
  StudyDifficultyBadge,
  StudyPriorityBadge,
  StudyProgressBar,
  courseIcon,
} from "@/components/studies/badges";
import { CourseTree } from "@/components/studies/course-tree";
import { VocabularyView } from "@/components/studies/vocabulary-view";
import { PracticeView } from "@/components/studies/practice-view";
import { SessionFormDialog } from "@/components/studies/session-dialog";
import { CourseFormDialog } from "../course-form";
import { deleteCourse, deleteSession, setCourseStatus } from "@/lib/actions/studies";
import {
  STUDY_STATUSES,
  STUDY_STATUS_LABELS,
  formatMinutes,
  formatPercent,
  type StudyStatus,
} from "@/lib/studies/constants";
import { formatDate } from "@/lib/format";
import type {
  StudyCourseDetail,
  StudyCourseOption,
  StudySessionWithRelations,
} from "@/types/database";

type Tab = "conteudo" | "sessoes" | "idioma";

export function CourseDetailClient({
  detail,
  todayIso,
}: {
  detail: StudyCourseDetail;
  todayIso: string;
}) {
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("conteudo");
  const [courseForm, setCourseForm] = React.useState(false);
  const [sessionForm, setSessionForm] = React.useState(false);
  const [editingSession, setEditingSession] =
    React.useState<StudySessionWithRelations>();

  const tabs: { key: Tab; label: string }[] = [
    { key: "conteudo", label: "Conteúdo" },
    { key: "sessoes", label: "Sessões" },
    ...(detail.is_language
      ? [{ key: "idioma" as const, label: "Idioma" }]
      : []),
  ];

  const courseOption: StudyCourseOption = {
    id: detail.id,
    title: detail.title,
    is_language: detail.is_language,
    lessons: detail.modules.flatMap((m) =>
      m.lessons.map((l) => ({ id: l.id, title: l.title })),
    ),
  };

  async function changeStatus(value: StudyStatus) {
    const res = await setCourseStatus(detail.id, value);
    if (res.ok) router.refresh();
    else toast.error(res.error ?? "Não foi possível atualizar.");
  }

  function openCreateSession() {
    setEditingSession(undefined);
    setSessionForm(true);
  }

  return (
    <div className="space-y-5">
      <Link
        href="/estudos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Voltar para Estudos
      </Link>

      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none" aria-hidden>
            {courseIcon(detail.icon, detail.category)}
          </span>
          <div className="min-w-0 space-y-1.5">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
              {detail.title}
            </h1>
            <div className="flex flex-wrap items-center gap-1.5">
              <StudyCategoryBadge category={detail.category} />
              <StudyPriorityBadge priority={detail.priority} />
              {detail.platform && (
                <span className="text-xs text-muted-foreground">
                  {detail.platform}
                </span>
              )}
              {detail.url && (
                <a
                  href={withProtocol(detail.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <ExternalLink className="size-3" /> Abrir curso
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Select value={detail.status} onValueChange={changeStatus}>
            <SelectTrigger size="sm" className="w-40">
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
          <Button
            variant="outline"
            size="icon-sm"
            aria-label="Editar curso"
            onClick={() => setCourseForm(true)}
          >
            <Pencil />
          </Button>
          <DeleteConfirmDialog
            title="Excluir curso"
            description={`Excluir "${detail.title}"? Módulos, aulas, sessões e vocabulário também serão removidos.`}
            successMessage="Curso excluído."
            onConfirm={async () => {
              const res = await deleteCourse(detail.id);
              if (res.ok) router.push("/estudos");
              return res;
            }}
            trigger={
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Excluir curso"
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 />
              </Button>
            }
          />
        </div>
      </div>

      {/* Estatísticas */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Progresso"
          value={formatPercent(detail.progressPct)}
          icon={GraduationCap}
          hint={`${detail.doneLessons}/${detail.totalLessons} aulas`}
        />
        <StatCard
          label="Tempo estudado"
          value={formatMinutes(detail.studiedMinutes)}
          icon={Clock}
          hint={
            detail.workload_minutes > 0
              ? `de ${formatMinutes(detail.workload_minutes)}`
              : undefined
          }
        />
        <StatCard
          label="Sessões"
          value={String(detail.sessions.length)}
          icon={NotebookPen}
          hint={
            detail.lastSessionDate
              ? `Última: ${formatDate(detail.lastSessionDate)}`
              : "Nenhuma ainda"
          }
        />
        <StatCard
          label="Meta de conclusão"
          value={detail.target_date ? formatDate(detail.target_date) : "—"}
          icon={CalendarClock}
          hint={detail.overdue === "target" ? "Atrasada" : undefined}
        />
      </div>

      <StudyProgressBar value={detail.progressPct} color={detail.cover_color} />

      {detail.nextLessonTitle && (
        <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <BookOpen className="size-4 shrink-0 text-primary" />
          <span className="text-muted-foreground">Próxima aula:</span>
          <span className="truncate font-medium">{detail.nextLessonTitle}</span>
        </div>
      )}

      {detail.materials.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {detail.materials.map((m, i) => (
            <a
              key={`${m.url}-${i}`}
              href={withProtocol(m.url)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent"
            >
              <Link2 className="size-3.5" /> {m.label}
            </a>
          ))}
        </div>
      )}

      {detail.notes && (
        <p className="rounded-lg border bg-card/40 p-3 text-sm whitespace-pre-wrap text-muted-foreground">
          {detail.notes}
        </p>
      )}

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "conteudo" && (
        <CourseTree courseId={detail.id} modules={detail.modules} />
      )}

      {tab === "sessoes" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Sessões deste curso ({detail.sessions.length})
            </h2>
            <Button size="sm" onClick={openCreateSession}>
              <Plus /> Registrar sessão
            </Button>
          </div>
          {detail.sessions.length === 0 ? (
            <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
              Nenhuma sessão registrada para este curso.
            </p>
          ) : (
            <div className="space-y-2">
              {detail.sessions.map((s) => (
                <CourseSessionRow
                  key={s.id}
                  session={s}
                  onEdit={() => {
                    setEditingSession(s);
                    setSessionForm(true);
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "idioma" && detail.is_language && (
        <div className="space-y-6">
          <VocabularyView courseId={detail.id} vocabulary={detail.vocabulary} />
          <PracticeView
            courseId={detail.id}
            practice={detail.practice}
            languageWeek={detail.languageWeek}
            todayIso={todayIso}
          />
        </div>
      )}

      <CourseFormDialog
        course={detail}
        open={courseForm}
        onOpenChange={setCourseForm}
      />
      <SessionFormDialog
        open={sessionForm}
        onOpenChange={setSessionForm}
        todayIso={todayIso}
        courseOptions={[courseOption]}
        taskOptions={detail.taskOptions}
        fixedCourseId={detail.id}
        session={editingSession}
      />
    </div>
  );
}

function CourseSessionRow({
  session,
  onEdit,
}: {
  session: StudySessionWithRelations;
  onEdit: () => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium tabular-nums">
                {formatMinutes(session.duration_minutes)}
              </span>
              <StudyDifficultyBadge difficulty={session.difficulty} />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(session.session_date)}
              {session.lesson ? ` · ${session.lesson.title}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Editar sessão"
              onClick={onEdit}
            >
              <Pencil />
            </Button>
            <DeleteConfirmDialog
              title="Excluir sessão"
              description="Excluir esta sessão? O tempo estudado do curso será recalculado."
              successMessage="Sessão excluída."
              onConfirm={() => deleteSession(session.id)}
              trigger={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Excluir sessão"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              }
            />
          </div>
        </div>
        {session.what_i_learned && (
          <p className="text-sm">
            <span className="text-muted-foreground">Aprendi: </span>
            {session.what_i_learned}
          </p>
        )}
        {session.next_action && (
          <p className="text-sm">
            <span className="text-muted-foreground">Próxima ação: </span>
            {session.next_action}
          </p>
        )}
        {session.task && (
          <p className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <ListChecks className="size-3.5" /> {session.task.title}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Garante esquema no link (para abrir em nova aba sem virar rota relativa). */
function withProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
