"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  DASH_PERIOD_LABELS,
  DASH_PERIODS,
  DASH_VIEW_LABELS,
  DASH_VIEWS,
  VIEW_TO_PERIOD,
  windowLabel,
  type DashPeriod,
  type DashView,
  type DashWindow,
} from "@/lib/dashboard/period";

/**
 * Filtro de período (hoje/semana/mês/anterior/personalizado) + alternância de visão
 * (dia/semana/mês). O estado vive na URL (?periodo=&visao=&de=&ate=) — propaga para
 * todos os cards via re-render do servidor.
 */
export function PeriodToolbar({
  window,
  period,
  view,
  customFrom,
  customTo,
}: {
  window: DashWindow;
  period: DashPeriod;
  view: DashView;
  customFrom: string;
  customTo: string;
}) {
  const router = useRouter();
  const [de, setDe] = React.useState(customFrom);
  const [ate, setAte] = React.useState(customTo);

  function push(next: {
    period?: DashPeriod;
    view?: DashView;
    de?: string;
    ate?: string;
  }) {
    const p = next.period ?? period;
    const v = next.view ?? view;
    const params = new URLSearchParams();
    params.set("periodo", p);
    params.set("visao", v);
    if (p === "custom") {
      const d = next.de ?? de;
      const a = next.ate ?? ate;
      if (d) params.set("de", d);
      if (a) params.set("ate", a);
    }
    router.push(`/dashboard?${params.toString()}`);
  }

  function selectPeriod(p: DashPeriod) {
    if (p === "custom") {
      push({ period: "custom" });
      return;
    }
    const v: DashView = p === "semana" ? "semana" : p === "hoje" ? "dia" : "mes";
    push({ period: p, view: v });
  }

  function selectView(v: DashView) {
    push({ period: VIEW_TO_PERIOD[v], view: v });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={period} onValueChange={(v) => selectPeriod(v as DashPeriod)}>
        <SelectTrigger size="sm" className="w-[9.5rem]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DASH_PERIODS.map((p) => (
            <SelectItem key={p} value={p}>
              {DASH_PERIOD_LABELS[p]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {period === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={de}
            onChange={(e) => setDe(e.target.value)}
            aria-label="Data inicial"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="date"
            value={ate}
            onChange={(e) => setAte(e.target.value)}
            aria-label="Data final"
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!de || !ate}
            onClick={() => push({ period: "custom", de, ate })}
          >
            Aplicar
          </Button>
        </div>
      )}

      {/* Alternância de visão dia/semana/mês */}
      <div className="inline-flex items-center rounded-lg border border-input p-0.5">
        {DASH_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => selectView(v)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              window.view === v
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {DASH_VIEW_LABELS[v]}
          </button>
        ))}
      </div>

      <span className="ml-auto text-sm font-medium text-muted-foreground">
        {windowLabel(window)}
      </span>
    </div>
  );
}
