"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AlarmClockOff,
  BookOpen,
  CheckCircle2,
  Dumbbell,
  Flame,
  Pencil,
  Plus,
  Power,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { StatCard } from "@/components/shared/stat-card";
import { DeleteConfirmDialog } from "@/components/financeiro/delete-confirm-dialog";
import { cn } from "@/lib/utils";
import {
  HabitCategoryBadge,
  StreakFlame,
  frequencySummary,
  habitIcon,
} from "@/components/habits/badges";
import { HabitCard } from "@/components/habits/habit-card";
import { WaterView } from "@/components/habits/water-view";
import { SessionView } from "@/components/habits/session-view";
import { ConsistencyView } from "@/components/habits/consistency-view";
import { HabitFormDialog } from "./habit-form";
import {
  deleteHabit,
  seedDefaultHabits,
  toggleHabitActive,
} from "@/lib/actions/habits";
import {
  HABIT_VIEWS,
  HABIT_VIEW_LABELS,
  formatHabitValue,
  type HabitView,
} from "@/lib/habits/constants";
import type { HabitRow, HabitsDashboard, HabitWithStats } from "@/types/database";

export function HabitsClient({
  dashboard,
  view,
  todayIso,
}: {
  dashboard: HabitsDashboard;
  view: HabitView;
  todayIso: string;
}) {
  const router = useRouter();
  const { habits, consistency } = dashboard;

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<HabitRow | undefined>();

  function openCreate() {
    setEditing(undefined);
    setFormOpen(true);
  }
  function openEdit(h: HabitRow) {
    setEditing(h);
    setFormOpen(true);
  }

  function navigate(v: HabitView) {
    router.push(`/habitos?view=${v}`);
  }

  async function run(
    action: Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) {
    const res = await action;
    if (res.ok) {
      toast.success(okMsg);
      router.refresh();
    } else {
      toast.error(res.error ?? "Não foi possível concluir.");
    }
  }

  const active = habits.filter((h) => h.is_active);
  const water = active.filter((h) => h.category === "agua");
  const reading = active.filter((h) => h.category === "leitura");
  const exercise = active.filter((h) => h.category === "exercicios");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Hábitos"
        description="Check-in rápido, sequências, água, leitura, exercícios e consistência."
      >
        <Button size="sm" onClick={openCreate}>
          <Plus /> Novo hábito
        </Button>
      </PageHeader>

      {habits.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Comece seus hábitos"
          description="Crie do zero ou adicione os sugeridos (Beber água, Ler, Exercícios, Dormir bem)."
        >
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              run(seedDefaultHabits(), "Hábitos sugeridos adicionados.")
            }
          >
            <Sparkles /> Adicionar sugeridos
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus /> Novo hábito
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* Navegação de visões */}
          <div className="flex gap-1 overflow-x-auto rounded-lg border bg-muted/40 p-1">
            {HABIT_VIEWS.map((v) => (
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
                {HABIT_VIEW_LABELS[v]}
              </button>
            ))}
          </div>

          {view === "hoje" && (
            <TodayView habits={habits} todayIso={todayIso} onEdit={openEdit} />
          )}

          {view === "agua" && (
            <WaterView habits={water} todayIso={todayIso} onCreate={openCreate} />
          )}

          {view === "leitura" && (
            <SessionView
              habits={reading}
              todayIso={todayIso}
              icon={BookOpen}
              descriptionLabel="Livro atual"
              descriptionPlaceholder="Ex.: O Poder do Hábito"
              emptyTitle="Sem hábito de leitura"
              emptyHint="Crie um hábito na categoria Leitura (ex.: 10 páginas por dia) para acompanhar suas leituras aqui."
              onCreate={openCreate}
            />
          )}

          {view === "exercicios" && (
            <SessionView
              habits={exercise}
              todayIso={todayIso}
              icon={Dumbbell}
              descriptionLabel="Tipo de exercício"
              descriptionPlaceholder="Ex.: Musculação, corrida…"
              emptyTitle="Sem hábito de exercícios"
              emptyHint="Crie um hábito na categoria Exercícios (ex.: 30 minutos) para acompanhar sua rotina aqui."
              onCreate={openCreate}
            />
          )}

          {view === "consistencia" && (
            <ConsistencyView
              consistency={consistency}
              activeCount={active.length}
            />
          )}

          {view === "gerenciar" && (
            <ManageView habits={habits} onEdit={openEdit} run={run} />
          )}
        </>
      )}

      <HabitFormDialog
        habit={editing}
        open={formOpen}
        onOpenChange={setFormOpen}
      />
    </div>
  );
}

/* ───────────────────────────── Hoje ───────────────────────────── */

function TodayView({
  habits,
  todayIso,
  onEdit,
}: {
  habits: HabitWithStats[];
  todayIso: string;
  onEdit: (h: HabitWithStats) => void;
}) {
  const todays = habits
    .filter((h) => h.is_active && h.scheduledToday)
    .sort((a, b) => Number(a.todayDone) - Number(b.todayDone));
  const doneCount = todays.filter((h) => h.todayDone).length;
  const pending = todays.filter((h) => !h.todayDone);
  const bestStreak = habits.reduce((m, h) => Math.max(m, h.streak), 0);

  // Base de "hábitos esquecidos" (Fase 13): pendentes de hoje com horário ideal já
  // definido recebem destaque. O disparo agendado fica para a Fase 13.
  const forgotten = pending.filter((h) => h.time_of_day);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Feitos hoje"
          value={`${doneCount}/${todays.length}`}
          icon={CheckCircle2}
          hint="Hábitos agendados para hoje"
        />
        <StatCard label="Pendentes" value={String(pending.length)} icon={Target} />
        <StatCard
          label="Melhor sequência"
          value={String(bestStreak)}
          icon={Flame}
          hint="Dias seguidos"
        />
      </div>

      {forgotten.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
          <AlarmClockOff className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="font-medium text-amber-700 dark:text-amber-300">
              {forgotten.length} hábito(s) pendente(s) com horário marcado
            </p>
            <p className="text-amber-700/80 dark:text-amber-300/80">
              {forgotten
                .map((h) => `${h.name} (${h.time_of_day!.slice(0, 5)})`)
                .join(", ")}
            </p>
          </div>
        </div>
      )}

      {todays.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          Nenhum hábito agendado para hoje. Aproveite ou ajuste a frequência em
          “Gerenciar”.
        </p>
      ) : (
        <div className="grid gap-3">
          {todays.map((h) => (
            <HabitCard
              key={h.id}
              habit={h}
              todayIso={todayIso}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────────── Gerenciar ───────────────────────────── */

function ManageView({
  habits,
  onEdit,
  run,
}: {
  habits: HabitWithStats[];
  onEdit: (h: HabitRow) => void;
  run: (
    action: Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
  ) => Promise<void>;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-muted-foreground">
          Todos os hábitos ({habits.length})
        </h2>
      </div>
      <div className="grid gap-2">
        {habits.map((h) => (
          <Card key={h.id} className={cn(!h.is_active && "opacity-60")}>
            <CardContent className="flex items-center gap-3 p-3.5">
              <span className="text-xl" aria-hidden>
                {habitIcon(h.icon, h.category)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{h.name}</span>
                  <HabitCategoryBadge category={h.category} />
                  {!h.is_active && (
                    <Badge variant="outline" className="text-muted-foreground">
                      Inativo
                    </Badge>
                  )}
                  <StreakFlame count={h.streak} />
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {formatHabitValue(h.target_value, h.unit)} ·{" "}
                  {frequencySummary(h.frequency, h.weekdays)}
                  {h.time_of_day ? ` · ${h.time_of_day.slice(0, 5)}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Editar hábito"
                  onClick={() => onEdit(h)}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={h.is_active ? "Desativar" : "Ativar"}
                  onClick={() =>
                    run(
                      toggleHabitActive(h.id, !h.is_active),
                      h.is_active ? "Hábito desativado." : "Hábito ativado.",
                    )
                  }
                >
                  <Power className={cn(h.is_active && "text-emerald-600")} />
                </Button>
                <DeleteConfirmDialog
                  title="Excluir hábito"
                  description={`Excluir "${h.name}"? O histórico de check-ins também será removido.`}
                  successMessage="Hábito excluído."
                  onConfirm={() => deleteHabit(h.id)}
                  trigger={
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Excluir hábito"
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  }
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
