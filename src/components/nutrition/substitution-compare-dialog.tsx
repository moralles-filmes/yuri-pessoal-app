"use client";

/**
 * Fase 16-C — Dieta e Alimentação · Comparar antes de substituir.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTA TELA É A REGRA 4 EM FORMA DE INTERFACE: nada troca sem que o usuário veja isto   ║
 * ║ e confirme. E é a regra 5 também: mostramos NÚMEROS, nunca a palavra "equivalente".  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O que a tela é obrigada a mostrar antes do botão de confirmar:
 *   • original × alternativa, lado a lado;
 *   • a diferença de kcal, proteína, carboidrato, gordura e fibra;
 *   • o impacto no TOTAL DO DIA;
 *   • o que resta da meta depois da troca.
 *
 * E o que ela nunca faz: dizer que uma coisa substitui a outra, recomendar a alternativa
 * "melhor" ou esconder que uma diferença é desconhecida. Diferença que não pôde ser calculada
 * aparece como "não dá para comparar" — porque desconhecido não é zero.
 */
import * as React from "react";
import { ArrowRight, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { formatNutrientAmount, roundForDisplay, type NutrientTotal } from "@/lib/nutrition/calc";
import {
  CORE_NUTRIENTS,
  SUBSTITUTION_COMPARE_NUTRIENTS,
  SUBSTITUTION_DISCLAIMER,
} from "@/lib/nutrition/constants";
import {
  assessSubstitution,
  availableOptions,
  compareNutrients,
  remainingAfterSubstitution,
  toleranceFor,
  toleranceStatus,
  TOLERANCE_STATUS_HINTS,
  TOLERANCE_STATUS_LABELS,
  type ToleranceStatus,
} from "@/lib/nutrition/substitution";
import type {
  GoalTarget,
  NutrientDefinition,
  SubstitutionOption,
  SubstitutionTolerances,
} from "@/lib/nutrition/types";
import { totalsAfterSubstitution } from "@/lib/nutrition/substitution";
import { TotalQualityBadge } from "./nutrient-value";

export type CompareTarget = {
  /** Rótulo do que sai. */
  originalLabel: string;
  originalTotals: Record<string, NutrientTotal>;
  originalQuantity: number | null;
  originalMeasureLabel: string | null;
  /** Alternativas disponíveis, com o total de cada uma já calculado no servidor. */
  options: SubstitutionOption[];
  optionTotals: Record<string, { totals: Record<string, NutrientTotal>; reason: string | null }>;
  tolerances: SubstitutionTolerances;
  groupId: string | null;
  /** Contexto do dia, para o impacto. */
  dayTotals: Record<string, NutrientTotal>;
  dayTargets: Record<string, GoalTarget>;
  level: "alimento" | "refeicao";
};

const STATUS_TONE: Record<ToleranceStatus, string> = {
  dentro: "bg-primary/10 text-primary",
  fora: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  sem_tolerancia: "bg-muted text-muted-foreground",
  incomparavel: "bg-muted text-muted-foreground",
};

export function SubstitutionCompareDialog({
  target,
  nutrients,
  onOpenChange,
  onConfirm,
}: {
  target: CompareTarget | null;
  nutrients: Record<string, NutrientDefinition>;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: {
    option: SubstitutionOption;
    reason: string | null;
  }) => Promise<void>;
}) {
  const [optionId, setOptionId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const options = React.useMemo(
    () => (target ? availableOptions(target.options) : []),
    [target],
  );

  const seen = target?.originalLabel ?? null;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    setOptionId(options[0]?.id ?? null);
    setReason("");
    setSaving(false);
  }

  if (!target) return null;

  const option = options.find((item) => item.id === optionId) ?? null;
  const optionResult = option ? target.optionTotals[option.id] : null;
  const replacementTotals = optionResult?.totals ?? {};

  const comparisons = compareNutrients(
    target.originalTotals,
    replacementTotals,
    SUBSTITUTION_COMPARE_NUTRIENTS,
  );
  const tolerances = toleranceFor(target.tolerances, {
    energia: CORE_NUTRIENTS.energia,
    proteina: CORE_NUTRIENTS.proteina,
    carboidrato: CORE_NUTRIENTS.carboidrato,
    lipidios: CORE_NUTRIENTS.lipidios,
    fibra: CORE_NUTRIENTS.fibra,
  });
  const assessment = assessSubstitution(comparisons, tolerances);

  const dayAfter = totalsAfterSubstitution(target.dayTotals, comparisons);
  const remaining = remainingAfterSubstitution(
    target.dayTotals,
    dayAfter,
    target.dayTargets,
    SUBSTITUTION_COMPARE_NUTRIENTS,
  );

  const format = (code: string, value: number | null): string => {
    if (value === null) return "—";
    const definition = nutrients[code];
    return definition
      ? `${formatNutrientAmount(value, definition)} ${definition.unit}`
      : roundForDisplay(value, 1).toLocaleString("pt-BR");
  };

  const signed = (code: string, value: number | null): string => {
    if (value === null) return "—";
    const prefix = value > 0 ? "+" : value < 0 ? "−" : "";
    return `${prefix}${format(code, Math.abs(value))}`;
  };

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Substituir</DialogTitle>
          <DialogDescription>
            Confira a diferença antes de confirmar. Nada é trocado sem a sua confirmação.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* ── Original × alternativa ── */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sai</p>
              <p className="truncate text-sm font-medium">{target.originalLabel}</p>
              {target.originalQuantity !== null && (
                <p className="text-xs text-muted-foreground">
                  {target.originalQuantity.toLocaleString("pt-BR")}
                  {target.originalMeasureLabel ? ` × ${target.originalMeasureLabel}` : ""}
                </p>
              )}
            </div>
            <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Entra</p>
              <p className="truncate text-sm font-medium">{option?.label ?? "Escolha uma alternativa"}</p>
              {option?.quantity !== null && option?.quantity !== undefined && (
                <p className="text-xs text-muted-foreground">
                  {option.quantity.toLocaleString("pt-BR")}
                  {option.measureLabel ? ` × ${option.measureLabel}` : ""}
                </p>
              )}
            </div>
          </div>

          {/* ── Alternativas ── */}
          {options.length === 0 ? (
            <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
              Este grupo ainda não tem alternativas ativas cadastradas.
            </p>
          ) : (
            <div className="space-y-2">
              <Label>Alternativa</Label>
              <div className="space-y-1.5">
                {options.map((item) => {
                  const result = target.optionTotals[item.id];
                  const energia = result?.totals[CORE_NUTRIENTS.energia];
                  return (
                    <label
                      key={item.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        optionId === item.id ? "border-primary/40 bg-primary/5" : "hover:bg-accent/50",
                      )}
                    >
                      <input
                        type="radio"
                        name="substitution-option"
                        value={item.id}
                        checked={optionId === item.id}
                        onChange={() => setOptionId(item.id)}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">
                          {item.quantity !== null
                            ? `${item.quantity.toLocaleString("pt-BR")}${item.measureLabel ? ` × ${item.measureLabel}` : ""}`
                            : "Sem quantidade"}
                          {energia
                            ? ` · ${roundForDisplay(energia.amount, 0).toLocaleString("pt-BR")} kcal`
                            : ""}
                          {/* Prioridade é a preferência do usuário, e a tela diz isso. */}
                          {item.priority > 0 && ` · prioridade ${item.priority}`}
                        </span>
                        {result?.reason && (
                          <span className="mt-1 block text-[11px] text-amber-700 dark:text-amber-400">
                            {result.reason}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Diferença nutricional ── */}
          {option && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Diferença nutricional</p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Nutriente</th>
                      <th className="px-3 py-2 text-right font-medium">Sai</th>
                      <th className="px-3 py-2 text-right font-medium">Entra</th>
                      <th className="px-3 py-2 text-right font-medium">Diferença</th>
                      <th className="px-3 py-2 font-medium">Tolerância</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {SUBSTITUTION_COMPARE_NUTRIENTS.map((code) => {
                      const comparison = comparisons[code];
                      const status = toleranceStatus(comparison, tolerances[code] ?? null);
                      const definition = nutrients[code];
                      return (
                        <tr key={code}>
                          <td className="px-3 py-2">
                            {definition?.shortName ?? definition?.name ?? code}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {format(code, comparison.original)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {format(code, comparison.replacement)}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right font-medium tabular-nums",
                              comparison.diff === null && "text-muted-foreground",
                            )}
                          >
                            {signed(code, comparison.diff)}
                            {comparison.percent !== null && (
                              <span className="ms-1 text-[11px] font-normal text-muted-foreground">
                                ({comparison.percent > 0 ? "+" : "−"}
                                {Math.abs(roundForDisplay(comparison.percent, 0))}%)
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "rounded px-1.5 py-0.5 text-[10px] font-medium",
                                STATUS_TONE[status],
                              )}
                              title={TOLERANCE_STATUS_HINTS[status]}
                            >
                              {TOLERANCE_STATUS_LABELS[status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {assessment.incomparable > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {assessment.incomparable} nutriente
                  {assessment.incomparable > 1 ? "s não puderam" : " não pôde"} ser comparado por
                  falta de dado analisado. Desconhecido não é zero — o impacto no dia fica
                  marcado como parcial.
                </p>
              )}
            </div>
          )}

          {/* ── Impacto no dia e na meta ── */}
          {option && (
            <div className="space-y-2">
              <p className="text-sm font-medium">Impacto no dia</p>
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[32rem] text-sm">
                  <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 font-medium">Nutriente</th>
                      <th className="px-3 py-2 text-right font-medium">Dia hoje</th>
                      <th className="px-3 py-2 text-right font-medium">Dia depois</th>
                      <th className="px-3 py-2 text-right font-medium">Falta para a meta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {SUBSTITUTION_COMPARE_NUTRIENTS.map((code) => {
                      const before = target.dayTotals[code];
                      const after = dayAfter[code];
                      const rest = remaining[code];
                      return (
                        <tr key={code}>
                          <td className="px-3 py-2">
                            {nutrients[code]?.shortName ?? nutrients[code]?.name ?? code}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {before ? format(code, before.amount) : "—"}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            <span className="inline-flex items-center gap-1.5">
                              {after ? format(code, after.amount) : "—"}
                              {after && <TotalQualityBadge quality={after.quality} />}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {rest?.remainingAfter === null || rest === undefined ? (
                              <span className="text-muted-foreground">sem meta</span>
                            ) : (
                              <>
                                {format(code, rest.remainingAfter)}
                                {rest.remainingDelta !== null && rest.remainingDelta !== 0 && (
                                  <span className="ms-1 text-[11px] font-normal text-muted-foreground">
                                    ({rest.remainingDelta > 0 ? "+" : "−"}
                                    {format(code, Math.abs(rest.remainingDelta))})
                                  </span>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Motivo ── */}
          <div className="space-y-1.5">
            <Label htmlFor="substitution-reason">Por quê? (opcional)</Label>
            <Textarea
              id="substitution-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={2}
              placeholder="Ex.: acabou o arroz, estava fora de casa…"
            />
          </div>

          {/* ── O aviso que a regra 5 exige ── */}
          <p className="flex gap-2 rounded-lg bg-muted/50 p-3 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>{SUBSTITUTION_DISCLAIMER}</span>
          </p>

          {assessment.outside > 0 && (
            <Badge variant="outline" className="text-[10px]">
              {assessment.outside} macro{assessment.outside > 1 ? "s" : ""} fora da sua tolerância —
              é um aviso, não um impedimento.
            </Badge>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!option || saving || Object.keys(replacementTotals).length === 0}
            onClick={async () => {
              if (!option) return;
              setSaving(true);
              await onConfirm({ option, reason: reason.trim() || null });
              setSaving(false);
            }}
          >
            {saving ? "Substituindo…" : "Confirmar substituição"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
