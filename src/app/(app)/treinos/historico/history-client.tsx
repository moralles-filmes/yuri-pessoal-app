"use client";

/**
 * Fase 17-D — Treinos · Histórico (cliente).
 *
 * Cinco visões da MESMA lista filtrada: lista, por semana, por mês, calendário e linha do
 * tempo. O estado dos filtros vive na URL (padrão do projeto), então voltar, recarregar ou
 * salvar o link preserva exatamente o que estava na tela.
 *
 * ═══════════ DUAS REGRAS DA TELA ═══════════
 *
 * • **Ação em massa não alcança nada fora do filtro atual.** A seleção é limpa sempre que os
 *   filtros mudam — o mesmo princípio do `selectionInScope` da lista de compras (16-D).
 * • **Excluir pede confirmação e avisa do recálculo dos recordes.** Um recorde que dependia da
 *   sessão excluída deixa de existir, e o usuário sabe disso antes de confirmar.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  History,
  Loader2,
  Trash2,
  Trophy,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { useUrlText } from "@/lib/forms/use-url-text";
import { MetricsSummary } from "@/components/training/metrics-summary";
import { PeriodBarChart, type ChartPoint } from "@/components/training/training-charts";
import {
  applyHistoryFilters,
  countActiveHistoryFilters,
  durationLabel,
  groupHistory,
  historyFiltersFromParams,
  HISTORY_GROUPING_LABELS,
  HISTORY_SORT_LABELS,
  HISTORY_VIEW_LABELS,
  HISTORY_VIEWS,
  longDateLabelIso,
  shortDateLabelIso,
  type HistoryGrouping,
  type HistoryItem,
  type HistorySort,
  type HistoryView,
} from "@/lib/training/history";
import {
  aggregateSessions,
  formatVolumeKg,
  metricsByMonth,
  metricsByWeek,
  sessionMetrics,
  type MetricOptions,
} from "@/lib/training/metrics";
import { SESSION_STATUS_LABELS, TRAINING_BASE_PATH } from "@/lib/training/constants";
import { addDaysIso, monthGridIso, startOfMonthIso } from "@/lib/training/schedule";
import type { HistoryFacets } from "@/lib/training/history-queries";
import { deleteTrainingSession } from "@/lib/actions/training-history";

const ALL = "__todos__";

export function HistoryClient({
  items,
  facets,
  params,
  hoje,
  preferences,
}: {
  items: HistoryItem[];
  facets: HistoryFacets;
  params: Record<string, string | undefined>;
  hoje: string;
  preferences: MetricOptions & { weekStartsOn: number };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlFilters = React.useMemo(() => historyFiltersFromParams(params), [params]);

  // O texto responde na hora e alcança a URL depois da pausa. Controlado pelo parâmetro, cada
  // tecla esperava um render inteiro do servidor — esta página é `force-dynamic`.
  const [search, setSearch] = useUrlText(urlFilters.search, (value) =>
    setParam("q", value || null),
  );
  const filters = React.useMemo(() => ({ ...urlFilters, search }), [urlFilters, search]);

  const metricOptions: MetricOptions = {
    includeWarmup: preferences.includeWarmup,
    unilateralRule: preferences.unilateralRule,
  };

  const visible = React.useMemo(
    () => applyHistoryFilters(items, filters, metricOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, filters],
  );

  const period = React.useMemo(
    () => aggregateSessions(visible, metricOptions),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visible],
  );

  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [deleting, setDeleting] = React.useState<HistoryItem | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  // A seleção nunca sobrevive a uma mudança de filtro: uma ação em massa não pode alcançar o
  // que saiu da tela. Ajuste durante o render (padrão do projeto, sem setState em efeito).
  const visibleIds = React.useMemo(() => new Set(visible.map((item) => item.id)), [visible]);
  const cleanedSelection = React.useMemo(
    () => new Set([...selected].filter((id) => visibleIds.has(id))),
    [selected, visibleIds],
  );
  if (cleanedSelection.size !== selected.size) setSelected(cleanedSelection);

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(next.toString() ? `?${next}` : "?", { scroll: false });
  }

  function clearFilters() {
    router.replace("?", { scroll: false });
  }

  async function confirmDelete(target: HistoryItem[]) {
    setBusy(true);
    let removed = 0;
    let failed = 0;

    for (const item of target) {
      const result = await deleteTrainingSession({ id: item.id, confirm: true });
      if (result.ok) removed += 1;
      else failed += 1;
    }

    setBusy(false);
    setDeleting(null);
    setBulkOpen(false);
    setSelected(new Set());

    if (failed > 0) toast.error(`${failed} treino(s) não puderam ser excluídos.`);
    if (removed > 0) {
      toast.success(
        `${removed} treino(s) excluídos. Os recordes foram recalculados a partir do histórico restante.`,
      );
    }
    router.refresh();
  }

  const activeFilters = countActiveHistoryFilters(filters);
  const selectedItems = visible.filter((item) => selected.has(item.id));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Histórico"
        description="Tudo o que já foi treinado, com o que foi realmente registrado em cada sessão."
      >
        <Button variant="outline" asChild>
          <Link href={`${TRAINING_BASE_PATH}/recordes`}>
            <Trophy className="size-4" />
            Recordes
          </Link>
        </Button>
      </PageHeader>

      {items.length === 0 ? (
        <EmptyState
          icon={History}
          title="Nenhum treino registrado ainda"
          description="Quando você finalizar uma sessão, ela aparece aqui com todas as séries, tempos e observações."
        >
          <Button asChild>
            <Link href={`${TRAINING_BASE_PATH}/hoje`}>Ir para o treino de hoje</Link>
          </Button>
        </EmptyState>
      ) : (
        <>
          {/* ── Filtros ── */}
          <Card>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar por treino, exercício, grupo ou local…"
                  className="h-9 min-w-[200px] flex-1"
                  aria-label="Buscar no histórico"
                />

                <Select
                  value={filters.view}
                  onValueChange={(value) => setParam("visao", value === "lista" ? null : value)}
                >
                  <SelectTrigger className="h-9 w-[150px]" aria-label="Visão">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HISTORY_VIEWS.map((view) => (
                      <SelectItem key={view} value={view}>
                        {HISTORY_VIEW_LABELS[view]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  variant={activeFilters > 0 ? "default" : "outline"}
                  size="sm"
                  className="h-9"
                  onClick={() => setFiltersOpen((value) => !value)}
                  aria-expanded={filtersOpen}
                >
                  <Filter className="size-4" />
                  Filtros
                  {activeFilters > 0 && (
                    <Badge variant="secondary" className="ml-1">
                      {activeFilters}
                    </Badge>
                  )}
                </Button>

                {activeFilters > 0 && (
                  <Button variant="ghost" size="sm" className="h-9" onClick={clearFilters}>
                    <X className="size-4" />
                    Limpar
                  </Button>
                )}
              </div>

              {filtersOpen && (
                <div className="grid gap-3 border-t border-border pt-3 sm:grid-cols-2 lg:grid-cols-3">
                  <FilterField label="De">
                    <Input
                      type="date"
                      value={filters.from ?? ""}
                      onChange={(event) => setParam("de", event.target.value || null)}
                      className="h-9"
                    />
                  </FilterField>
                  <FilterField label="Até">
                    <Input
                      type="date"
                      value={filters.to ?? ""}
                      onChange={(event) => setParam("ate", event.target.value || null)}
                      className="h-9"
                    />
                  </FilterField>

                  <FilterSelect
                    label="Programa"
                    value={filters.programId}
                    onChange={(value) => setParam("programa", value)}
                    options={facets.programs.map((program) => ({
                      value: program.id,
                      label: program.name,
                    }))}
                  />
                  <FilterSelect
                    label="Treino"
                    value={filters.workoutId}
                    onChange={(value) => setParam("treino", value)}
                    options={facets.workouts.map((workout) => ({
                      value: workout.id,
                      label: workout.name,
                    }))}
                  />
                  <FilterSelect
                    label="Exercício"
                    value={filters.exerciseId}
                    onChange={(value) => setParam("exercicio", value)}
                    options={facets.exercises.map((exercise) => ({
                      value: exercise.id,
                      label: exercise.name,
                    }))}
                  />
                  <FilterSelect
                    label="Grupo muscular"
                    value={filters.muscleGroup}
                    onChange={(value) => setParam("grupo", value)}
                    options={facets.muscleGroups.map((group) => ({ value: group, label: group }))}
                  />
                  <FilterSelect
                    label="Situação"
                    value={filters.status}
                    onChange={(value) => setParam("status", value)}
                    options={[
                      { value: "concluida", label: SESSION_STATUS_LABELS.concluida },
                      { value: "abandonada", label: SESSION_STATUS_LABELS.abandonada },
                    ]}
                  />

                  <FilterField label="Duração mínima (min)">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={filters.minMinutes ?? ""}
                      onChange={(event) => setParam("min_min", event.target.value || null)}
                      className="h-9"
                    />
                  </FilterField>
                  <FilterField label="Volume mínimo (kg)">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={filters.minVolumeKg ?? ""}
                      onChange={(event) => setParam("min_volume", event.target.value || null)}
                      className="h-9"
                    />
                  </FilterField>

                  <div className="flex flex-wrap items-center gap-4 sm:col-span-2 lg:col-span-3">
                    <ToggleFilter
                      label="Só com recorde"
                      checked={filters.onlyWithRecord}
                      onChange={(checked) => setParam("recorde", checked ? "1" : null)}
                    />
                    <ToggleFilter
                      label="Só com observação"
                      checked={filters.onlyWithNotes}
                      onChange={(checked) => setParam("observacao", checked ? "1" : null)}
                    />
                    <ToggleFilter
                      label="Só com dor registrada"
                      checked={filters.onlyWithPain}
                      onChange={(checked) => setParam("dor", checked ? "1" : null)}
                    />
                  </div>

                  <FilterField label="Agrupar por">
                    <Select
                      value={filters.grouping}
                      onValueChange={(value) =>
                        setParam("agrupar", value === "nenhum" ? null : value)
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(HISTORY_GROUPING_LABELS) as HistoryGrouping[]).map((key) => (
                          <SelectItem key={key} value={key}>
                            {HISTORY_GROUPING_LABELS[key]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>

                  <FilterField label="Ordenar por">
                    <Select
                      value={filters.sort}
                      onValueChange={(value) =>
                        setParam("ordem", value === "recentes" ? null : value)
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(HISTORY_SORT_LABELS) as HistorySort[]).map((key) => (
                          <SelectItem key={key} value={key}>
                            {HISTORY_SORT_LABELS[key]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Resumo do que está filtrado ── */}
          <MetricsSummary
            totals={period.totals}
            options={metricOptions}
            sessionCount={period.sessionCount}
            totalSeconds={period.totalSeconds}
          />

          {/* ── Ações em massa ── */}
          {selectedItems.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <p className="text-sm">
                <strong>{selectedItems.length}</strong> treino(s) selecionados
                <span className="text-muted-foreground"> · a ação alcança só o que está filtrado</span>
              </p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                  Limpar seleção
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setBulkOpen(true)}>
                  <Trash2 className="size-4" />
                  Excluir
                </Button>
              </div>
            </div>
          )}

          {/* ── Conteúdo ── */}
          {visible.length === 0 ? (
            <EmptyState
              icon={Filter}
              title="Nenhum treino com esses filtros"
              description="Ajuste o período ou limpe os filtros para ver o histórico completo."
            >
              <Button variant="outline" onClick={clearFilters}>
                Limpar filtros
              </Button>
            </EmptyState>
          ) : (
            <HistoryContent
              view={filters.view}
              grouping={filters.grouping}
              items={visible}
              hoje={hoje}
              options={metricOptions}
              weekStartsOn={preferences.weekStartsOn}
              selected={selected}
              onToggle={(id) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(id)) next.delete(id);
                  else next.add(id);
                  return next;
                })
              }
              onDelete={setDeleting}
            />
          )}
        </>
      )}

      {/* ── Exclusão de um treino ── */}
      <Dialog open={Boolean(deleting)} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir este treino?</DialogTitle>
            <DialogDescription>
              {deleting && (
                <>
                  <strong>{deleting.workoutName}</strong> de {longDateLabelIso(deleting.sessionDate)}.
                  Todas as séries, tempos e observações somem junto — e os recordes são
                  recalculados a partir do histórico restante, o que pode fazer uma marca
                  pessoal voltar ao valor anterior.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleting && confirmDelete([deleting])}
              disabled={busy}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Excluir treino
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Exclusão em massa ── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {selectedItems.length} treino(s)?</DialogTitle>
            <DialogDescription>
              Só os treinos selecionados na lista filtrada são excluídos. Os recordes são
              recalculados depois, a partir do que sobrar no histórico.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
            {selectedItems.map((item) => (
              <li key={item.id}>
                {shortDateLabelIso(item.sessionDate)} · {item.workoutName}
              </li>
            ))}
          </ul>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkOpen(false)} disabled={busy}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDelete(selectedItems)}
              disabled={busy}
            >
              {busy && <Loader2 className="size-4 animate-spin" />}
              Excluir selecionados
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ═══════════════════════════ Conteúdo por visão ═══════════════════════════ */

function HistoryContent({
  view,
  grouping,
  items,
  hoje,
  options,
  weekStartsOn,
  selected,
  onToggle,
  onDelete,
}: {
  view: HistoryView;
  grouping: HistoryGrouping;
  items: HistoryItem[];
  hoje: string;
  options: MetricOptions;
  weekStartsOn: number;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onDelete: (item: HistoryItem) => void;
}) {
  if (view === "calendario") {
    return <CalendarView items={items} hoje={hoje} weekStartsOn={weekStartsOn} />;
  }

  if (view === "semana" || view === "mes") {
    const buckets =
      view === "semana"
        ? metricsByWeek(items, { ...options, weekStartsOn })
        : metricsByMonth(items, options);

    const points: ChartPoint[] = buckets.map((bucket) => ({
      label: bucket.label,
      value: bucket.metrics.totals.volumeKg,
      display: formatVolumeKg(bucket.metrics.totals.volumeKg),
      isPartial: bucket.metrics.totals.quality === "parcial",
    }));

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">
              Volume por {view === "semana" ? "semana" : "mês"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PeriodBarChart points={points} valueLabel="Volume" />
          </CardContent>
        </Card>

        <div className="space-y-3">
          {buckets
            .slice()
            .reverse()
            .map((bucket) => (
              <Card key={bucket.key}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
                    <span>{bucket.label}</span>
                    <span className="text-sm font-normal text-muted-foreground">
                      {bucket.metrics.sessionCount} treino(s) ·{" "}
                      {formatVolumeKg(bucket.metrics.totals.volumeKg)} ·{" "}
                      {bucket.metrics.totals.sets} séries
                      {bucket.metrics.totals.quality === "parcial" && " (parcial)"}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {items
                    .filter((item) =>
                      view === "semana"
                        ? bucket.metrics.trainedDays.includes(item.sessionDate)
                        : item.sessionDate.startsWith(bucket.key),
                    )
                    .map((item) => (
                      <SessionRow
                        key={item.id}
                        item={item}
                        options={options}
                        selected={selected.has(item.id)}
                        onToggle={onToggle}
                        onDelete={onDelete}
                      />
                    ))}
                </CardContent>
              </Card>
            ))}
        </div>
      </div>
    );
  }

  if (view === "linha") {
    return <TimelineView items={items} options={options} />;
  }

  const groups = groupHistory(items, grouping, { ...options, weekStartsOn });

  if (grouping === "nenhum") {
    return (
      <div className="space-y-2">
        {items.map((item) => (
          <SessionRow
            key={item.id}
            item={item}
            options={options}
            selected={selected.has(item.id)}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Card key={group.key}>
          <CardHeader className="pb-2">
            <CardTitle className="flex flex-wrap items-baseline justify-between gap-2 text-base">
              <span>{group.label}</span>
              <span className="text-sm font-normal text-muted-foreground">
                {group.metrics.sessionCount} treino(s) ·{" "}
                {formatVolumeKg(group.metrics.totals.volumeKg)}
                {group.metrics.totals.quality === "parcial" && " (parcial)"}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.items.map((item) => (
              <SessionRow
                key={item.id}
                item={item}
                options={options}
                selected={selected.has(item.id)}
                onToggle={onToggle}
                onDelete={onDelete}
              />
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ═══════════════════════════ Linha do treino ═══════════════════════════ */

function SessionRow({
  item,
  options,
  selected,
  onToggle,
  onDelete,
}: {
  item: HistoryItem;
  options: MetricOptions;
  selected: boolean;
  onToggle: (id: string) => void;
  onDelete: (item: HistoryItem) => void;
}) {
  const metrics = sessionMetrics(item, options);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors",
        selected && "border-primary/60 bg-primary/5",
      )}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(item.id)}
        className="size-4 shrink-0 accent-[var(--primary)]"
        aria-label={`Selecionar o treino ${item.workoutName} de ${shortDateLabelIso(item.sessionDate)}`}
      />

      <Link
        href={`${TRAINING_BASE_PATH}/historico/${item.id}`}
        className="min-w-[180px] flex-1 space-y-1 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{item.workoutName}</span>
          {item.status === "abandonada" && (
            <Badge variant="outline" className="text-xs">
              {SESSION_STATUS_LABELS.abandonada}
            </Badge>
          )}
          {item.hasRecord && (
            <Badge variant="secondary" className="gap-1 text-xs">
              <Trophy className="size-3" />
              Recorde
            </Badge>
          )}
          {item.feltPain && (
            <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400">
              Dor registrada
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {shortDateLabelIso(item.sessionDate)}
          {item.programName && ` · ${item.programName}`}
          {item.locationName && ` · ${item.locationName}`}
        </p>
      </Link>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
        <span className="tabular-nums">
          {formatVolumeKg(metrics.totals.volumeKg)}
          {metrics.totals.quality === "parcial" && (
            <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">parcial</span>
          )}
        </span>
        <span className="tabular-nums">{metrics.totals.sets} séries</span>
        {item.totalSeconds !== null && (
          <span className="tabular-nums">{durationLabel(item.totalSeconds)}</span>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(item)}
        aria-label={`Excluir o treino de ${shortDateLabelIso(item.sessionDate)}`}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}

/* ═══════════════════════════ Calendário ═══════════════════════════ */

function CalendarView({
  items,
  hoje,
  weekStartsOn,
}: {
  items: HistoryItem[];
  hoje: string;
  weekStartsOn: number;
}) {
  const [anchor, setAnchor] = React.useState(() => startOfMonthIso(items[0]?.sessionDate ?? hoje));

  const byDate = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const list = byDate.get(item.sessionDate) ?? [];
    list.push(item);
    byDate.set(item.sessionDate, list);
  }

  const weeks = monthGridIso(anchor, weekStartsOn);
  const monthKey = anchor.slice(0, 7);
  const monthNames = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  const [year, month] = monthKey.split("-");

  const weekdayLabels = Array.from({ length: 7 }, (_, index) => {
    const names = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
    return names[(weekStartsOn + index) % 7];
  });

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2 pb-2">
        <CardTitle className="text-base capitalize">
          {monthNames[Number(month) - 1]} de {year}
        </CardTitle>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setAnchor(startOfMonthIso(addDaysIso(anchor, -1)))}
            aria-label="Mês anterior"
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => setAnchor(startOfMonthIso(addDaysIso(anchor, 32)))}
            aria-label="Próximo mês"
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-muted-foreground">
          {weekdayLabels.map((label) => (
            <div key={label} className="py-1 font-medium">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weeks.flat().map((date) => {
            const sessions = byDate.get(date) ?? [];
            const inMonth = date.startsWith(monthKey);
            return (
              <div
                key={date}
                className={cn(
                  "min-h-[64px] rounded-lg border border-border/60 p-1 text-left",
                  !inMonth && "opacity-40",
                  date === hoje && "border-primary/60",
                )}
              >
                <span className="text-xs text-muted-foreground">{Number(date.slice(-2))}</span>
                <div className="mt-0.5 space-y-0.5">
                  {sessions.map((session) => (
                    <Link
                      key={session.id}
                      href={`${TRAINING_BASE_PATH}/historico/${session.id}`}
                      className="block truncate rounded bg-primary/15 px-1 py-0.5 text-[11px] text-primary hover:bg-primary/25"
                      title={session.workoutName}
                    >
                      {session.workoutName}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/* ═══════════════════════════ Linha do tempo ═══════════════════════════ */

function TimelineView({ items, options }: { items: HistoryItem[]; options: MetricOptions }) {
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((item) => {
        const metrics = sessionMetrics(item, options);
        return (
          <li key={item.id} className="relative">
            <span className="absolute -left-[26px] top-1.5 grid size-3 place-items-center rounded-full bg-primary ring-4 ring-background" />
            <Link
              href={`${TRAINING_BASE_PATH}/historico/${item.id}`}
              className="block rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/50"
            >
              <p className="text-xs text-muted-foreground">{longDateLabelIso(item.sessionDate)}</p>
              <p className="font-medium">{item.workoutName}</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {metrics.totals.sets} séries · {formatVolumeKg(metrics.totals.volumeKg)}
                {item.totalSeconds !== null && ` · ${durationLabel(item.totalSeconds)}`}
              </p>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {item.exercises.map((exercise) => exercise.exerciseName).join(" · ")}
              </p>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}

/* ═══════════════════════════ Campos ═══════════════════════════ */

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <FilterField label={label}>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(next === ALL ? null : next)}
        disabled={options.length === 0}
      >
        <SelectTrigger className="h-9">
          <SelectValue placeholder="Todos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FilterField>
  );
}

function ToggleFilter({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = React.useId();
  return (
    <div className="flex items-center gap-2">
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
      <Label htmlFor={id} className="text-sm font-normal">
        {label}
      </Label>
    </div>
  );
}
