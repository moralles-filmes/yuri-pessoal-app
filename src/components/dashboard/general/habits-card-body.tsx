"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CirculoDeConcluir } from "@/components/shared/circulo-de-concluir";
import { cn } from "@/lib/utils";
import { setHabitDone } from "@/lib/actions/habits";
import { formatAmount, formatHabitValue } from "@/lib/habits/constants";
import { Quadro, CardEmpty } from "./primitives";
import type { HabitsCardData } from "@/lib/dashboard/types";

/** Raio do anel de progresso (viewBox 0..64, traço 6). */
const RAIO = 26;
const CIRCUNFERENCIA = 2 * Math.PI * RAIO;

/** Anel SVG inline (sem biblioteca): trilho `track`, progresso `primary`, começa às 12h. */
function AnelDoDia({ feitos, agendados }: { feitos: number; agendados: number }) {
  const fracao = agendados > 0 ? Math.min(1, Math.max(0, feitos / agendados)) : 0;
  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="relative size-16">
        <svg viewBox="0 0 64 64" className="size-16" aria-hidden="true">
          <circle cx="32" cy="32" r={RAIO} fill="none" strokeWidth="6" stroke="var(--track)" />
          <circle
            cx="32"
            cy="32"
            r={RAIO}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            stroke="var(--primary)"
            strokeDasharray={`${CIRCUNFERENCIA * fracao} ${CIRCUNFERENCIA}`}
            style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
          />
        </svg>
        {agendados > 0 && (
          <span className="absolute inset-0 grid place-items-center text-sm font-semibold tabular-nums">
            {feitos}/{agendados}
          </span>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {agendados > 0 ? "concluídos hoje" : "sem hábitos para hoje"}
      </p>
    </div>
  );
}

/** Corpo interativo do card Hábitos — anel do dia, sequência e check-in da lista (a água só lê). */
export function HabitsCardBody({
  data,
  todayIso,
  periodLabel,
}: {
  data: HabitsCardData;
  todayIso: string;
  periodLabel: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function run(action: Promise<{ ok: boolean; error?: string }>) {
    setBusy(true);
    try {
      const res = await action;
      if (res.ok) router.refresh();
      else toast.error(res.error ?? "Não foi possível registrar.");
    } finally {
      setBusy(false);
    }
  }

  if (!data.hasHabits) {
    return <CardEmpty>Nenhum hábito ativo. Crie em Hábitos.</CardEmpty>;
  }

  const listItems = data.items.filter((h) => h.category !== "agua");

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <AnelDoDia feitos={data.doneToday} agendados={data.scheduledToday} />
        <div className="min-w-0 flex-1">
          <Quadro
            valor={`${data.topStreak} dias 🔥`}
            rotulo={`${Math.round(data.periodRate * 100)}% ${periodLabel}`}
          />
        </div>
      </div>

      {data.water && (
        <div className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-muted-foreground">💧 {data.water.name}</span>
          <span className="shrink-0 font-medium tabular-nums">
            {formatAmount(data.water.value)} /{" "}
            {formatHabitValue(data.water.target, data.water.unit)}
          </span>
        </div>
      )}

      <div className="space-y-1.5">
        {listItems.length === 0 && !data.water ? (
          <CardEmpty>Sem hábitos agendados para hoje.</CardEmpty>
        ) : (
          listItems.map((h) => (
            <label
              key={h.id}
              className="flex min-h-11 cursor-pointer items-center text-sm"
            >
              {/* O botão de 44 px é a própria altura da linha (min-h-11); o espaço transparente
                  dele já faz o papel do gap, por isso a linha não tem gap. */}
              <CirculoDeConcluir
                checked={h.done}
                disabled={busy}
                aria-label={`Concluir ${h.name}`}
                onCheckedChange={(v) =>
                  run(setHabitDone(h.id, todayIso, Boolean(v)))
                }
              />
              <span className={cn("truncate", h.done && "text-muted-foreground line-through")}>
                {h.icon ? `${h.icon} ` : ""}
                {h.name}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
}
