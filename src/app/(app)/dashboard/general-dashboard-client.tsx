"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardShell } from "@/components/dashboard/general/card-shell";
import { PeriodToolbar } from "@/components/dashboard/general/period-toolbar";
import {
  resetDashboardLayout,
  saveDashboardLayout,
} from "@/lib/actions/settings";
import {
  DEFAULT_DASHBOARD_LAYOUT,
  type DashboardLayout,
  type DashCardId,
} from "@/lib/dashboard/cards";
import type { DashPeriod, DashView, DashWindow } from "@/lib/dashboard/period";

/** Move `id` para a posição de `overId`, preservando os demais. */
function reorder(order: DashCardId[], id: DashCardId, overId: DashCardId): DashCardId[] {
  if (id === overId) return order;
  const next = order.filter((x) => x !== id);
  const idx = next.indexOf(overId);
  if (idx < 0) return order;
  next.splice(idx, 0, id);
  return next;
}

export function GeneralDashboard({
  layout,
  contentById,
  window,
  period,
  view,
  customFrom,
  customTo,
}: {
  layout: DashboardLayout;
  contentById: Record<DashCardId, React.ReactNode>;
  window: DashWindow;
  period: DashPeriod;
  view: DashView;
  customFrom: string;
  customTo: string;
}) {
  const router = useRouter();
  const [order, setOrder] = React.useState<DashCardId[]>(layout.order);
  const [hidden, setHidden] = React.useState<DashCardId[]>(layout.hidden);
  const [personalizing, setPersonalizing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const dragId = React.useRef<DashCardId | null>(null);

  const hiddenSet = new Set(hidden);
  const shown = personalizing ? order : order.filter((id) => !hiddenSet.has(id));

  function move(id: DashCardId, dir: -1 | 1) {
    setOrder((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }

  function toggleHidden(id: DashCardId) {
    setHidden((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function save() {
    setSaving(true);
    const res = await saveDashboardLayout({ order, hidden, period, view });
    setSaving(false);
    if (res.ok) {
      toast.success("Layout salvo.");
      setPersonalizing(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Não foi possível salvar.");
    }
  }

  async function reset() {
    setSaving(true);
    const res = await resetDashboardLayout();
    setSaving(false);
    if (res.ok) {
      setOrder(DEFAULT_DASHBOARD_LAYOUT.order);
      setHidden([]);
      toast.success("Layout restaurado ao padrão.");
      setPersonalizing(false);
      router.refresh();
    } else {
      toast.error(res.error ?? "Não foi possível restaurar.");
    }
  }

  function cancel() {
    setOrder(layout.order);
    setHidden(layout.hidden);
    setPersonalizing(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <PeriodToolbar
          window={window}
          period={period}
          view={view}
          customFrom={customFrom}
          customTo={customTo}
        />
        {!personalizing ? (
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 self-start lg:self-auto"
            onClick={() => setPersonalizing(true)}
          >
            <SlidersHorizontal /> Personalizar
          </Button>
        ) : (
          <div className="flex shrink-0 flex-wrap items-center gap-2 self-start lg:self-auto">
            <Button size="sm" onClick={save} disabled={saving}>
              <Check /> Salvar
            </Button>
            <Button size="sm" variant="outline" onClick={reset} disabled={saving}>
              <RotateCcw /> Restaurar padrão
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
              <X /> Cancelar
            </Button>
          </div>
        )}
      </div>

      {personalizing && (
        <p className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          Arraste os cards para reordenar (ou use ↑/↓) e clique no olho para
          ocultar/mostrar. Lembre de <strong>Salvar</strong>.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((id) => {
          const idx = order.indexOf(id);
          return (
            <CardShell
              key={id}
              id={id}
              personalizing={personalizing}
              hidden={hiddenSet.has(id)}
              isFirst={idx === 0}
              isLast={idx === order.length - 1}
              onMoveUp={() => move(id, -1)}
              onMoveDown={() => move(id, 1)}
              onToggleHidden={() => toggleHidden(id)}
              onDragStart={() => {
                dragId.current = id;
              }}
              onDragOver={() => {
                const from = dragId.current;
                if (from && from !== id) setOrder((prev) => reorder(prev, from, id));
              }}
              onDrop={() => {
                dragId.current = null;
              }}
              onDragEnd={() => {
                dragId.current = null;
              }}
            >
              {contentById[id]}
            </CardShell>
          );
        })}
      </div>
    </div>
  );
}
