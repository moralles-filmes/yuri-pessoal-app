"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CalendarClock,
  Clock,
  Flame,
  GraduationCap,
  Languages,
  Layers,
  NotebookPen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { cn } from "@/lib/utils";
import { CourseCard } from "@/components/studies/course-card";
import {
  StudyDifficultyBadge,
  StudyProgressBar,
  courseIcon,
} from "@/components/studies/badges";
import { EvolutionChart } from "@/components/studies/evolution-chart";
import { SessionFormDialog } from "@/components/studies/session-dialog";
import { CourseFormDialog } from "./course-form";
import { deleteSession } from "@/lib/actions/studies";
import {
  STUDY_VIEWS,
  STUDY_VIEW_LABELS,
  formatMinutes,
  formatPercent,
  type StudyView,
} from "@/lib/studies/constants";
import { formatDate } from "@/lib/format";
import type {
  StudyCourseRow,
  StudyCourseStats,
  StudyDashboard,
  StudySessionWithRelations,
} from "@/types/database";

export function StudiesClient({
  dashboard,
  view,
  todayIso,
}: {
  dashboard: StudyDashboard;
  view: StudyView;
  todayIso: string;
}) {
  const router = useRouter();

  const [courseForm, setCourseForm] = React.useState(false);
  const [editingCourse, setEditingCourse] = React.useState<StudyCourseRow>();
  const [sessionForm, setSessionForm] = React.useState(false);
  const [editingSession, setEditingSession] =
    React.useState<StudySessionWithRelations>();

  function openCreateCourse() {
    setEditingCourse(undefined);
    setCourseForm(true);
  }
  function openEditCourse(c: StudyCourseStats) {
    setEditingCourse(c);
    setCourseForm(true);
  }
  function openCreateSession() {
    setEditingSession(undefined);
    setSessionForm(true);
  }
  function openEditSession(s: StudySessionWithRelations) {
    setEditingSession(s);
    setSessionForm(true);
  }

  function navigate(v: StudyView) {
    router.push(`/estudos?view=${v}`);
  }

  const hasCourses = dashboard.totalCourses > 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Estudos"
        description="Cursos, sessões de estudo, idiomas e evolução."
      >
        {hasCourses && (
          <>
            <Button size="sm" variant="outline" onClick={openCreateSession}>
              <NotebookPen /> Registrar sessão
            </Button>
            <Button size="sm" onClick={openCreateCourse}>
              <Plus /> Novo curso
            </Button>
          </>
        )}
      </PageHeader>

      {!hasCourses ? (
        <EmptyState
          icon={GraduationCap}
          title="Comece a estudar"
          description="Cadastre seu primeiro curso online (marketing, idiomas, tecnologia…) com módulos, aulas e sessões de estudo."
        >
          <Button size="sm" onClick={openCreateCourse}>
            <Plus /> Novo curso
          </Button>
        </EmptyState>
      ) : (
        <>
          <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1">
            {STUDY_VIEWS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => navigate(v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
                  view === v
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {STUDY_VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          {view === "painel" && <PanelView dashboard={dashboard} />}
          {view === "cursos" && (
            <CoursesView dashboard={dashboard} onEdit={openEditCourse} />
          )}
          {view === "sessoes" && (
            <SessionsView
              dashboard={dashboard}
              onCreate={openCreateSession}
              onEdit={openEditSession}
            />
          )}
          {view === "idiomas" && <LanguagesView dashboard={dashboard} />}
        </>
      )}

      <CourseFormDialog
        course={editingCourse}
        open={courseForm}
        onOpenChange={setCourseForm}
      />
      <SessionFormDialog
        open={sessionForm}
        onOpenChange={setSessionForm}
        todayIso={todayIso}
        courseOptions={dashboard.courseOptions}
        taskOptions={dashboard.taskOptions}
        session={editingSession}
      />
    </div>
  );
}

/* ───────────────────────────── Painel ───────────────────────────── */

function PanelView({ dashboard }: { dashboard: StudyDashboard }) {
  const inProgress = dashboard.courses.filter((c) => c.status === "em_andamento");

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Esta semana"
          value={formatMinutes(dashboard.minutesWeek)}
          icon={Clock}
          hint="Tempo estudado"
        />
        <StatCard
          label="Este mês"
          value={formatMinutes(dashboard.minutesMonth)}
          icon={CalendarClock}
        />
        <StatCard
          label="Sequência"
          value={`${dashboard.streak} dia(s)`}
          icon={Flame}
          hint={dashboard.bestStreak > 0 ? `Recorde: ${dashboard.bestStreak}` : undefined}
        />
        <StatCard
          label="Em andamento"
          value={String(dashboard.inProgress)}
          icon={Layers}
          hint={`${dashboard.completed} concluído(s)`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Evolução do tempo estudado</CardTitle>
        </CardHeader>
        <CardContent>
          <EvolutionChart weekly={dashboard.weekly} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Próximas aulas</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.nextLessons.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Nenhuma aula pendente em cursos em andamento.
              </p>
            ) : (
              <ul className="space-y-2">
                {dashboard.nextLessons.map((n) => (
                  <li key={n.lessonId}>
                    <Link
                      href={`/estudos/${n.courseId}`}
                      className="flex items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-accent"
                    >
                      <span className="text-lg" aria-hidden>
                        {courseIcon(n.icon, n.category)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{n.lessonTitle}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {n.courseTitle}
                          {n.moduleTitle ? ` · ${n.moduleTitle}` : ""}
                        </p>
                      </div>
                      <BookOpen className="size-4 shrink-0 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Estudos atrasados</CardTitle>
          </CardHeader>
          <CardContent>
            {dashboard.overdue.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Tudo em dia. 🎯
              </p>
            ) : (
              <ul className="space-y-2">
                {dashboard.overdue.map((c) => (
                  <li key={c.id}>
                    <Link
                      href={`/estudos/${c.id}`}
                      className="flex items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-2.5 transition-colors hover:bg-amber-500/10"
                    >
                      <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {c.overdue === "target"
                            ? "Passou da meta de conclusão"
                            : "Sem sessão de estudo recente"}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progresso por curso</CardTitle>
        </CardHeader>
        <CardContent>
          {inProgress.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum curso em andamento. Mude o status de um curso para começar.
            </p>
          ) : (
            <div className="space-y-3">
              {inProgress.map((c) => (
                <div key={c.id} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <Link
                      href={`/estudos/${c.id}`}
                      className="min-w-0 truncate font-medium hover:underline"
                    >
                      {courseIcon(c.icon, c.category)} {c.title}
                    </Link>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {c.doneLessons}/{c.totalLessons} ·{" "}
                      {formatPercent(c.progressPct)}
                    </span>
                  </div>
                  <StudyProgressBar value={c.progressPct} color={c.cover_color} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ───────────────────────────── Cursos ───────────────────────────── */

function CoursesView({
  dashboard,
  onEdit,
}: {
  dashboard: StudyDashboard;
  onEdit: (c: StudyCourseStats) => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {dashboard.courses.map((c) => (
        <CourseCard key={c.id} course={c} onEdit={onEdit} />
      ))}
    </div>
  );
}

/* ───────────────────────────── Sessões ───────────────────────────── */

function SessionsView({
  dashboard,
  onCreate,
  onEdit,
}: {
  dashboard: StudyDashboard;
  onCreate: () => void;
  onEdit: (s: StudySessionWithRelations) => void;
}) {
  const sessions = dashboard.recentSessions;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Sessões recentes ({sessions.length})
        </h2>
        <Button size="sm" onClick={onCreate}>
          <Plus /> Registrar sessão
        </Button>
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          icon={NotebookPen}
          title="Nenhuma sessão registrada"
          description="Registre quanto tempo estudou, o que aprendeu e a próxima ação."
        >
          <Button size="sm" onClick={onCreate}>
            <Plus /> Registrar sessão
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <SessionRow key={s.id} session={s} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionRow({
  session,
  onEdit,
}: {
  session: StudySessionWithRelations;
  onEdit: (s: StudySessionWithRelations) => void;
}) {
  return (
    <Card>
      <CardContent className="space-y-2 p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {session.courseTitle ?? "Curso"}
              </span>
              <StudyDifficultyBadge difficulty={session.difficulty} />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDate(session.session_date)} ·{" "}
              {formatMinutes(session.duration_minutes)}
              {session.lesson ? ` · ${session.lesson.title}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Editar sessão"
              onClick={() => onEdit(session)}
            >
              <Pencil />
            </Button>
            <DeleteConfirmDialog
              title="Excluir sessão"
              description="Excluir esta sessão de estudo? O tempo estudado do curso será recalculado."
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
          <p className="text-xs text-muted-foreground">
            Tarefa vinculada: {session.task.title}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ───────────────────────────── Idiomas ───────────────────────────── */

function LanguagesView({ dashboard }: { dashboard: StudyDashboard }) {
  const languages = dashboard.courses.filter((c) => c.is_language);

  if (languages.length === 0) {
    return (
      <EmptyState
        icon={Languages}
        title="Nenhum curso de idioma"
        description="Marque um curso como “idioma” para acompanhar vocabulário, prática por habilidade e meta semanal."
      />
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {languages.map((c) => {
        const done = dashboard.practiceWeekByCourse[c.id] ?? 0;
        const goal = c.weekly_goal_minutes ?? 0;
        const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;
        return (
          <Card key={c.id}>
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
              <CardTitle className="flex items-center gap-2 text-base">
                <span aria-hidden>{courseIcon(c.icon, c.category)}</span>
                <Link href={`/estudos/${c.id}`} className="hover:underline">
                  {c.title}
                </Link>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Prática na semana</span>
                  <span className="font-medium tabular-nums">
                    {formatMinutes(done)}
                    {goal > 0 ? ` / ${formatMinutes(goal)}` : ""}
                  </span>
                </div>
                {goal > 0 ? (
                  <StudyProgressBar value={pct} color={c.cover_color} />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Defina uma meta semanal no curso para acompanhar o progresso.
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" asChild className="w-full">
                <Link href={`/estudos/${c.id}`}>
                  <Languages /> Vocabulário e prática
                </Link>
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
