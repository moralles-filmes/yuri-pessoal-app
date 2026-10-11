"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { SkillBadge, StudyProgressBar } from "@/components/studies/badges";
import { deletePractice, setWeeklyGoal } from "@/lib/actions/studies";
import {
  LANGUAGE_SKILLS,
  LANGUAGE_SKILL_LABELS,
  formatMinutes,
} from "@/lib/studies/constants";
import { formatDate } from "@/lib/format";
import type {
  LanguageWeekProgress,
  StudyLanguagePracticeRow,
} from "@/types/database";

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const PracticeFormDialog = dynamic(
  () => import("./practice-form-dialog").then((m) => m.PracticeFormDialog),
  { ssr: false },
);

export function PracticeView({
  courseId,
  practice,
  languageWeek,
  todayIso,
}: {
  courseId: string;
  practice: StudyLanguagePracticeRow[];
  languageWeek: LanguageWeekProgress;
  todayIso: string;
}) {
  const [formOpen, setFormOpen] = React.useState(false);
  const formMontado = useLazyDialog(formOpen);
  const goal = languageWeek.goalMinutes ?? 0;
  const done = languageWeek.doneMinutes;
  const pct = goal > 0 ? Math.min(100, Math.round((done / goal) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Prática por habilidade
        </h2>
        <Button size="sm" variant="outline" onClick={() => setFormOpen(true)}>
          <Plus /> Registrar prática
        </Button>
      </div>

      <div className="rounded-xl border p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-sm font-medium">Meta da semana</span>
          <WeeklyGoalEditor courseId={courseId} goalMinutes={languageWeek.goalMinutes} />
        </div>
        {goal > 0 ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Praticado</span>
              <span className="font-medium tabular-nums">
                {formatMinutes(done)} / {formatMinutes(goal)} ({pct}%)
              </span>
            </div>
            <StudyProgressBar value={pct} />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Defina uma meta semanal (em minutos) para acompanhar o progresso.
          </p>
        )}

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LANGUAGE_SKILLS.map((s) => (
            <div key={s} className="rounded-lg bg-muted/40 p-2.5 text-center">
              <p className="text-xs text-muted-foreground">
                {LANGUAGE_SKILL_LABELS[s]}
              </p>
              <p className="text-sm font-semibold tabular-nums">
                {formatMinutes(languageWeek.bySkill[s])}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-medium text-muted-foreground">
          Histórico ({practice.length})
        </h3>
        {practice.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhuma prática registrada ainda.
          </p>
        ) : (
          <div className="space-y-2">
            {practice.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <SkillBadge skill={p.skill} />
                    <span className="text-sm font-medium tabular-nums">
                      {formatMinutes(p.duration_minutes)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(p.practice_date)}
                    {p.notes ? ` · ${p.notes}` : ""}
                  </p>
                </div>
                <DeleteConfirmDialog
                  title="Excluir prática"
                  description="Excluir este registro de prática?"
                  successMessage="Prática excluída."
                  onConfirm={() => deletePractice(p.id)}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Excluir prática"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {formMontado && (
        <PracticeFormDialog
          courseId={courseId}
          todayIso={todayIso}
          open={formOpen}
          onOpenChange={setFormOpen}
        />
      )}
    </div>
  );
}

/** Editor inline da meta semanal (minutos) — salva ao sair do campo. */
function WeeklyGoalEditor({
  courseId,
  goalMinutes,
}: {
  courseId: string;
  goalMinutes: number | null;
}) {
  const router = useRouter();
  const initial = goalMinutes ? String(goalMinutes) : "";
  const [value, setValue] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  const [last, setLast] = React.useState(initial);
  if (initial !== last) {
    setLast(initial);
    setValue(initial);
  }

  async function save() {
    if (value.trim() === initial.trim()) return;
    setSaving(true);
    try {
      const minutes = value.trim() ? Number(value) : null;
      const res = await setWeeklyGoal(courseId, minutes);
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Não foi possível salvar.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center gap-1.5">
      <Input
        type="number"
        inputMode="numeric"
        min={0}
        step="1"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        placeholder="min/sem"
        className="h-8 w-24 text-right"
        aria-label="Meta semanal em minutos"
      />
      <span className="text-xs text-muted-foreground">
        {saving ? "salvando…" : "min"}
      </span>
    </div>
  );
}
