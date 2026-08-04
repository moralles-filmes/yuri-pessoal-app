"use client";

/**
 * Fase 17-D — Evolução de desempenho (cliente).
 *
 * Três blocos: **volume e frequência** por período, **evolução por exercício** e **progressão**
 * (sugestões pendentes + as regras do usuário).
 *
 * ═══════════ A SUGESTÃO NUNCA É APLICADA SOZINHA ═══════════
 *
 * Cada sugestão mostra o motivo por extenso, o valor anterior e o proposto. Aceitar altera a
 * carga planejada do treino-modelo; ignorar registra a decisão e a proposta não volta igual.
 * Desligar a progressão nas configurações desliga o recurso inteiro.
 */
import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  TrendingUp,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { MetricsSummary, VolumeRuleNote } from "@/components/training/metrics-summary";
import {
  DistributionBars,
  EvolutionLineChart,
  PeriodAreaChart,
  PeriodBarChart,
  type ChartPoint,
} from "@/components/training/training-charts";
import { ProgressionRuleDialog } from "@/components/training/progression-rule-dialog";
import { BodyEvolution } from "@/components/training/body-evolution";
import type { MeasurementType, MeasurementWithType, SignedProgressPhoto } from "@/lib/body/types";
import { TRAINING_BASE_PATH, type OneRmFormula } from "@/lib/training/constants";
import { shortDateLabelIso } from "@/lib/training/history";
import type { HistoryItem } from "@/lib/training/history";
import {
  aggregateSessions,
  formatVolumeKg,
  frequencyMetrics,
  metricsByMonth,
  metricsByWeek,
  sessionMetrics,
  type MetricOptions,
} from "@/lib/training/metrics";
import {
  suggestionDeltaLabel,
  SUGGESTION_STATUS_LABELS,
  type ProgressionRule,
} from "@/lib/training/progression";
import type { HistoryFacets, ProgressionSuggestionRow } from "@/lib/training/history-queries";
import {
  decideProgressionSuggestion,
  deleteProgressionRule,
  generateProgressionSuggestions,
} from "@/lib/actions/training-history";

const ALL = "__todos__";

/**
 * Sem histórico, as abas de desempenho dizem isso — em vez de mostrar "0 kg" com cara de
 * resultado. A aba **Corpo** continua funcionando: medir o corpo não depende de ter treinado.
 */
function SemHistorico() {
  return (
    <EmptyState
      icon={TrendingUp}
      title="Sem treinos registrados no último ano"
      description="Estes números saem do histórico. Registre um treino e os gráficos aparecem aqui. A aba Corpo já funciona mesmo sem treino registrado."
    >
      <Button asChild>
        <Link href={`${TRAINING_BASE_PATH}/hoje`}>Ir para o treino de hoje</Link>
      </Button>
    </EmptyState>
  );
}

export function EvolutionClient({
  history,
  facets,
  rules,
  suggestions,
  muscleGroups,
  hoje,
  body,
  preferences,
}: {
  history: HistoryItem[];
  facets: HistoryFacets;
  rules: ProgressionRule[];
  suggestions: ProgressionSuggestionRow[];
  muscleGroups: { id: string; name: string }[];
  hoje: string;
  /** 17-E — vem do MÓDULO CENTRAL `body_*` (16-E), compartilhado com a Dieta. */
  body: {
    types: MeasurementType[];
    measurements: MeasurementWithType[];
    photos: SignedProgressPhoto[];
  };
  preferences: MetricOptions & {
    weekStartsOn: number;
    progressionEnabled: boolean;
    oneRmFormula: OneRmFormula;
  };
}) {
  const router = useRouter();
  const options: MetricOptions = {
    includeWarmup: preferences.includeWarmup,
    unilateralRule: preferences.unilateralRule,
  };

  const [granularity, setGranularity] = React.useState<"semana" | "mes">("semana");
  const [exerciseId, setExerciseId] = React.useState<string | null>(
    facets.exercises[0]?.id ?? null,
  );
  const [ruleDialogOpen, setRuleDialogOpen] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<ProgressionRule | null>(null);
  const [deletingRule, setDeletingRule] = React.useState<ProgressionRule | null>(null);
  const [busy, setBusy] = React.useState(false);

  const period = aggregateSessions(history, options);
  const frequency = frequencyMetrics(history, hoje, { weekStartsOn: preferences.weekStartsOn });

  const buckets =
    granularity === "semana"
      ? metricsByWeek(history, { ...options, weekStartsOn: preferences.weekStartsOn })
      : metricsByMonth(history, options);

  const volumePoints: ChartPoint[] = buckets.map((bucket) => ({
    label: bucket.label,
    value: bucket.metrics.totals.volumeKg,
    display: formatVolumeKg(bucket.metrics.totals.volumeKg),
    isPartial: bucket.metrics.totals.quality === "parcial",
  }));

  const frequencyPoints: ChartPoint[] = buckets.map((bucket) => ({
    label: bucket.label,
    value: bucket.metrics.trainedDays.length,
    display: `${bucket.metrics.trainedDays.length} treino(s)`,
  }));

  const muscleItems = Object.entries(period.setsByMuscleGroup)
    .sort(([, a], [, b]) => b - a)
    .map(([group, sets]) => ({
      label: group,
      value: sets,
      display: `${sets} série(s)`,
    }));

  // Evolução de um exercício: uma linha por sessão, da mais antiga para a mais recente.
  const exercisePoints: ChartPoint[] = React.useMemo(() => {
    if (!exerciseId) return [];
    return [...history]
      .reverse()
      .filter((item) => item.exercises.some((exercise) => exercise.exerciseId === exerciseId))
      .map((item) => {
        const filtered = {
          ...item,
          exercises: item.exercises.filter((exercise) => exercise.exerciseId === exerciseId),
        };
        const metrics = sessionMetrics(filtered, options);
        return {
          label: shortDateLabelIso(item.sessionDate),
          value: metrics.totals.volumeKg,
          display: formatVolumeKg(metrics.totals.volumeKg),
          isPartial: metrics.totals.quality === "parcial",
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exerciseId, history]);

  const pending = suggestions.filter((suggestion) => suggestion.status === "pendente");
  const decided = suggestions.filter((suggestion) => suggestion.status !== "pendente");

  async function generate() {
    setBusy(true);
    const result = await generateProgressionSuggestions({});
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.data.note) toast.info(result.data.note);
    else if (result.data.created === 0) {
      toast.info("Nenhuma condição foi atendida agora. Nada foi sugerido.");
    } else {
      toast.success(`${result.data.created} sugestão(ões) para você decidir.`);
    }
    router.refresh();
  }

  async function decide(suggestion: ProgressionSuggestionRow, decision: "aceitar" | "ignorar") {
    setBusy(true);
    const result = await decideProgressionSuggestion({ id: suggestion.id, decision });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(result.data.message);
    router.refresh();
  }

  async function confirmDeleteRule() {
    if (!deletingRule) return;
    setBusy(true);
    const result = await deleteProgressionRule({ id: deletingRule.id });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Regra excluída. As sugestões já geradas continuam registradas.");
    setDeletingRule(null);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Evolução"
        description="Desempenho a partir dos treinos registrados e evolução corporal, lado a lado."
      />

      <Tabs defaultValue={history.length === 0 ? "corpo" : "desempenho"}>
        <TabsList>
          <TabsTrigger value="desempenho">Desempenho</TabsTrigger>
          <TabsTrigger value="exercicio">Por exercício</TabsTrigger>
          <TabsTrigger value="corpo">Corpo</TabsTrigger>
          <TabsTrigger value="progressao">
            Progressão
            {pending.length > 0 && (
              <Badge variant="secondary" className="ml-1.5">
                {pending.length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Corpo (17-E) — módulo central `body_*`, compartilhado com a Dieta ── */}
        <TabsContent value="corpo" className="mt-4">
          <BodyEvolution
            types={body.types}
            measurements={body.measurements}
            photos={body.photos}
            hoje={hoje}
          />
        </TabsContent>

        {history.length === 0 ? (
          <>
            <TabsContent value="desempenho" className="mt-4">
              <SemHistorico />
            </TabsContent>
            <TabsContent value="exercicio" className="mt-4">
              <SemHistorico />
            </TabsContent>
            <TabsContent value="progressao" className="mt-4">
              <SemHistorico />
            </TabsContent>
          </>
        ) : (
          <>
          {/* ── Desempenho ── */}
          <TabsContent value="desempenho" className="mt-4 space-y-4">
            <MetricsSummary
              totals={period.totals}
              options={options}
              sessionCount={period.sessionCount}
              totalSeconds={period.totalSeconds}
            />

            <div className="flex items-center justify-end">
              <Select
                value={granularity}
                onValueChange={(value) => setGranularity(value as "semana" | "mes")}
              >
                <SelectTrigger className="h-8 w-[160px]" aria-label="Agrupar por">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="semana">Por semana</SelectItem>
                  <SelectItem value="mes">Por mês</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Volume</CardTitle>
              </CardHeader>
              <CardContent>
                <PeriodBarChart points={volumePoints} valueLabel="Volume" />
                <VolumeRuleNote options={options} className="mt-2" />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Frequência</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Conta <strong>dias</strong> treinados: dois treinos no mesmo dia são um dia.
                  Sequência atual: {frequency.currentWeekStreak} semana(s) · maior sequência:{" "}
                  {frequency.longestWeekStreak}.
                </p>
              </CardHeader>
              <CardContent>
                <PeriodAreaChart points={frequencyPoints} valueLabel="Treinos" />
              </CardContent>
            </Card>

            {muscleItems.length > 0 && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Séries por grupo muscular</CardTitle>
                  <p className="text-xs text-muted-foreground">
                    Só o grupo <strong>principal</strong> de cada exercício. Somar o secundário
                    faria uma remada aparecer como se treinasse bíceps tanto quanto costas.
                  </p>
                </CardHeader>
                <CardContent>
                  <DistributionBars items={muscleItems} />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Por exercício ── */}
          <TabsContent value="exercicio" className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={exerciseId ?? ALL}
                onValueChange={(value) => setExerciseId(value === ALL ? null : value)}
              >
                <SelectTrigger className="h-9 w-[280px]" aria-label="Exercício">
                  <SelectValue placeholder="Escolha um exercício" />
                </SelectTrigger>
                <SelectContent>
                  {facets.exercises.map((exercise) => (
                    <SelectItem key={exercise.id} value={exercise.id}>
                      {exercise.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {exerciseId && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${TRAINING_BASE_PATH}/exercicios/${exerciseId}`}>
                    Ver histórico completo
                  </Link>
                </Button>
              )}
            </div>

            {exercisePoints.length === 0 ? (
              <EmptyState
                icon={TrendingUp}
                title="Nenhuma execução registrada"
                description="Escolha um exercício que já apareceu num treino registrado."
              />
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Volume por sessão</CardTitle>
                </CardHeader>
                <CardContent>
                  <EvolutionLineChart points={exercisePoints} valueLabel="Volume" />
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Progressão ── */}
          <TabsContent value="progressao" className="mt-4 space-y-4">
            {!preferences.progressionEnabled && (
              <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                As sugestões de progressão estão <strong>desligadas</strong> nas configurações do
                módulo. Nada é gerado enquanto o recurso estiver desativado.{" "}
                <Link
                  href={`${TRAINING_BASE_PATH}/configuracoes`}
                  className="underline underline-offset-2"
                >
                  Abrir configurações
                </Link>
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Sugestões pendentes</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={generate}
                disabled={busy || !preferences.progressionEnabled}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                Avaliar agora
              </Button>
            </div>

            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma sugestão aguardando decisão. Elas aparecem quando a condição da sua regra
                é atendida nas últimas sessões — e nunca quando há dor registrada.
              </p>
            ) : (
              <div className="space-y-3">
                {pending.map((suggestion) => (
                  <Card key={suggestion.id}>
                    <CardContent className="space-y-3 p-4">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <div>
                          <p className="font-medium">{suggestion.exerciseName}</p>
                          {suggestion.workoutName && (
                            <p className="text-xs text-muted-foreground">
                              no treino {suggestion.workoutName}
                            </p>
                          )}
                        </div>
                        <p className="text-lg font-semibold tabular-nums">
                          {suggestionDeltaLabel(
                            suggestion.previousValue,
                            suggestion.suggestedValue,
                            suggestion.unit,
                          )}
                        </p>
                      </div>

                      <p className="flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                        <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                        {suggestion.reason}
                      </p>

                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" onClick={() => decide(suggestion, "aceitar")} disabled={busy}>
                          <Check className="size-4" />
                          Aceitar e atualizar o treino
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => decide(suggestion, "ignorar")}
                          disabled={busy}
                        >
                          <X className="size-4" />
                          Ignorar
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* ── Regras ── */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
              <h2 className="text-sm font-medium">Minhas regras</h2>
              <Button
                size="sm"
                onClick={() => {
                  setEditingRule(null);
                  setRuleDialogOpen(true);
                }}
              >
                <Plus className="size-4" />
                Nova regra
              </Button>
            </div>

            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhuma regra cadastrada. Uma regra descreve quando VOCÊ quer ser lembrado de
                subir a carga — o sistema só confere a condição e explica o que viu.
              </p>
            ) : (
              <div className="space-y-2">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-3"
                  >
                    <div className="min-w-[180px] flex-1">
                      <p className="font-medium">
                        {rule.name}
                        {!rule.isActive && (
                          <Badge variant="outline" className="ml-2 text-xs">
                            Desativada
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {rule.scope === "global"
                          ? "Todos os exercícios"
                          : rule.scope === "grupo"
                            ? `Grupo: ${
                                muscleGroups.find((group) => group.id === rule.muscleGroupId)?.name ??
                                "—"
                              }`
                            : `Exercício: ${
                                facets.exercises.find((exercise) => exercise.id === rule.exerciseId)
                                  ?.name ?? "—"
                              }`}{" "}
                        · {rule.minSessions} sessões ·{" "}
                        {rule.incrementMode === "incremento_minimo"
                          ? "menor salto realizável"
                          : rule.incrementMode === "fixo"
                            ? `+${rule.incrementKg} kg`
                            : `+${rule.incrementPercent}%`}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8"
                      onClick={() => {
                        setEditingRule(rule);
                        setRuleDialogOpen(true);
                      }}
                      aria-label={`Editar a regra ${rule.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeletingRule(rule)}
                      aria-label={`Excluir a regra ${rule.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* ── Histórico de decisões ── */}
            {decided.length > 0 && (
              <div className="space-y-2 pt-2">
                <h2 className="text-sm font-medium">Decisões anteriores</h2>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {decided.slice(0, 12).map((suggestion) => (
                    <li key={suggestion.id}>
                      {shortDateLabelIso(suggestion.suggestedOn)} · {suggestion.exerciseName} ·{" "}
                      {suggestionDeltaLabel(
                        suggestion.previousValue,
                        suggestion.suggestedValue,
                        suggestion.unit,
                      )}{" "}
                      · {SUGGESTION_STATUS_LABELS[suggestion.status]}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>
          </>
        )}
      </Tabs>

      <ProgressionRuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        rule={editingRule}
        exercises={facets.exercises}
        muscleGroups={muscleGroups}
        onSaved={() => router.refresh()}
      />

      <Dialog open={Boolean(deletingRule)} onOpenChange={(open) => !open && setDeletingRule(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir esta regra?</DialogTitle>
            <DialogDescription>
              As sugestões já geradas continuam registradas — elas são o histórico das suas
              decisões. Só a regra deixa de existir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeletingRule(null)} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmDeleteRule} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              Excluir regra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
