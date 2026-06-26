"use client";

import { Activity, BarChart3, Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { ConsistencyChart } from "@/components/habits/consistency-chart";
import { HabitHeatmap } from "@/components/habits/habit-heatmap";
import { StreakFlame, habitIcon } from "@/components/habits/badges";
import { HABIT_CATEGORY_COLORS } from "@/lib/habits/constants";
import type { HabitsConsistency } from "@/types/database";

const pct = (v: number) => `${Math.round(v * 100)}%`;

export function ConsistencyView({
  consistency,
  activeCount,
}: {
  consistency: HabitsConsistency;
  activeCount: number;
}) {
  const top = consistency.ranking[0];

  if (activeCount === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="Sem dados de consistência"
        description="Ative hábitos e faça check-ins para ver gráficos, heatmap e ranking aqui."
      />
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Conclusão (30 dias)"
          value={pct(consistency.completionRate30)}
          icon={Activity}
          hint={`${consistency.done30}/${consistency.scheduled30} dias-meta`}
        />
        <StatCard
          label="Mais consistente"
          value={top ? pct(top.rate) : "—"}
          icon={Trophy}
          hint={top?.name}
        />
        <StatCard
          label="Hábitos ativos"
          value={String(activeCount)}
          icon={BarChart3}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Consistência semanal</CardTitle>
        </CardHeader>
        <CardContent>
          <ConsistencyChart weekly={consistency.weekly} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Heatmap (15 semanas)</CardTitle>
        </CardHeader>
        <CardContent>
          <HabitHeatmap cells={consistency.heatmap} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ranking — mais consistentes</CardTitle>
        </CardHeader>
        <CardContent>
          {consistency.ranking.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum hábito agendado nos últimos 30 dias.
            </p>
          ) : (
            <ol className="space-y-1.5">
              {consistency.ranking.map((r, i) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 rounded-lg border px-3 py-2"
                >
                  <span className="w-5 text-center text-sm font-semibold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span aria-hidden>{habitIcon(r.icon, r.category)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {r.name}
                  </span>
                  <StreakFlame count={r.streak} />
                  <div className="flex w-28 items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.round(r.rate * 100)}%`,
                          backgroundColor:
                            r.color ?? HABIT_CATEGORY_COLORS[r.category],
                        }}
                      />
                    </div>
                    <span className="w-9 text-right text-xs font-medium tabular-nums">
                      {pct(r.rate)}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
