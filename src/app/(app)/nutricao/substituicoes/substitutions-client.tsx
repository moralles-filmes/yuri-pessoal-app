"use client";

/**
 * Fase 16-C — Dieta e Alimentação · Substituições (cliente).
 *
 * Aqui o usuário CADASTRA os grupos e as alternativas; a troca em si acontece no diário, onde
 * existe um item e um dia para comparar. Esta tela mostra o que está cadastrado, a diferença
 * entre cada alternativa e o original, e o histórico do que já foi trocado.
 *
 * ══ O QUE ESTA TELA NUNCA FAZ ══
 * Recomendar uma alternativa. A ordem é a prioridade que o próprio usuário definiu, a
 * comparação é numérica, e o aviso de que nada aqui afirma equivalência aparece em toda tela.
 */
import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { Info, Plus, Repeat, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { useLazyDialog } from "@/components/shared/use-lazy-dialog";
import { cn } from "@/lib/utils";
import { roundForDisplay } from "@/lib/nutrition/calc";
import {
  CORE_NUTRIENTS,
  SUBSTITUTION_COMPARE_NUTRIENTS,
  SUBSTITUTION_DISCLAIMER,
  SUBSTITUTION_LEVEL_LABELS,
} from "@/lib/nutrition/constants";
import { longDateLabel } from "@/lib/nutrition/calendar";
import {
  availableOptions,
  compareNutrients,
  toleranceFor,
  toleranceStatus,
  TOLERANCE_STATUS_LABELS,
} from "@/lib/nutrition/substitution";
import type {
  FoodListItem,
  NutrientDefinition,
  SubstitutionLog,
} from "@/lib/nutrition/types";
import type { SubstitutionGroupWithTotals } from "@/lib/nutrition/recipe-queries";
import {
  deleteSubstitutionGroup,
  deleteSubstitutionLog,
  deleteSubstitutionOption,
  saveSubstitutionGroup,
  saveSubstitutionOption,
} from "@/lib/actions/nutrition-substitutions";
import { mensagemDaAction } from "@/lib/forms/mensagem-da-action";
import type { PickerMeasure } from "@/components/nutrition/food-picker-dialog";

// ⛔ objeto literal escrito ali mesmo — o compilador o lê estaticamente (regra 4 do carregamento sob demanda)
const GroupDialog = dynamic(
  () => import("./group-dialog").then((m) => m.GroupDialog),
  { ssr: false },
);
const OptionDialog = dynamic(
  () => import("./option-dialog").then((m) => m.OptionDialog),
  { ssr: false },
);

export type NamedItem = { id: string; name: string };

export type SubstitutionsClientProps = {
  hoje: string;
  groups: SubstitutionGroupWithTotals[];
  logs: SubstitutionLog[];
  foods: FoodListItem[];
  recipes: NamedItem[];
  templates: NamedItem[];
  measures: [string, PickerMeasure[]][];
  nutrients: Record<string, NutrientDefinition>;
};

export function SubstitutionsClient(props: SubstitutionsClientProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const [groupDialog, setGroupDialog] = React.useState<{ group: SubstitutionGroupWithTotals | null } | null>(
    null,
  );
  const [optionFor, setOptionFor] = React.useState<SubstitutionGroupWithTotals | null>(null);
  const groupDialogMontado = useLazyDialog(groupDialog !== null);
  const optionDialogMontado = useLazyDialog(optionFor !== null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível concluir." }));
      }
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Substituições"
        description="Alternativas que você cadastra, com a diferença nutricional na tela antes de trocar."
      >
        <Button onClick={() => setGroupDialog({ group: null })}>
          <Plus className="size-4" />
          Grupo
        </Button>
      </PageHeader>

      <p className="flex gap-2 rounded-lg border bg-muted/40 p-3 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-4 shrink-0" />
        <span>{SUBSTITUTION_DISCLAIMER}</span>
      </p>

      <Tabs defaultValue="grupos">
        <TabsList>
          <TabsTrigger value="grupos">Grupos</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        {/* ══ Grupos ══ */}
        <TabsContent value="grupos" className="space-y-3 pt-4">
          {props.groups.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="Nenhum grupo de substituição"
              description="Um grupo guarda as alternativas que VOCÊ aceita para um alimento ou uma refeição, com as tolerâncias que você escolher. Na hora da troca, a comparação aparece antes da confirmação."
            >
              <Button onClick={() => setGroupDialog({ group: null })}>
                <Plus className="size-4" />
                Criar grupo
              </Button>
            </EmptyState>
          ) : (
            props.groups.map((group) => {
              const options = availableOptions(group.options);
              const tolerances = toleranceFor(group.tolerances, {
                energia: CORE_NUTRIENTS.energia,
                proteina: CORE_NUTRIENTS.proteina,
                carboidrato: CORE_NUTRIENTS.carboidrato,
                lipidios: CORE_NUTRIENTS.lipidios,
                fibra: CORE_NUTRIENTS.fibra,
              });

              return (
                <Card key={group.id}>
                  <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
                    <div className="min-w-0">
                      <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                        <span className="truncate">{group.name}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {SUBSTITUTION_LEVEL_LABELS[group.groupKind]}
                        </Badge>
                        {!group.isActive && (
                          <Badge variant="outline" className="text-[10px]">
                            Inativo
                          </Badge>
                        )}
                      </CardTitle>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Original: <strong className="text-foreground">{group.originalLabel}</strong>
                        {group.baseQuantity !== null &&
                          ` · ${group.baseQuantity.toLocaleString("pt-BR")}${group.baseMeasureLabel ? ` × ${group.baseMeasureLabel}` : ""}`}
                      </p>
                      {group.original.reason && (
                        <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                          {group.original.reason}
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setGroupDialog({ group })}
                        disabled={pending}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Excluir grupo"
                        disabled={pending}
                        onClick={() => {
                          if (
                            !confirm(
                              `Excluir o grupo “${group.name}” e suas alternativas? O histórico das trocas já feitas é preservado.`,
                            )
                          ) {
                            return;
                          }
                          run(() => deleteSubstitutionGroup(group.id), "Grupo excluído.");
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {group.description && (
                      <p className="text-sm text-muted-foreground">{group.description}</p>
                    )}

                    {options.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhuma alternativa cadastrada ainda.
                      </p>
                    ) : (
                      <ul className="divide-y rounded-lg border">
                        {options.map((option) => {
                          const result = group.optionTotals[option.id];
                          const comparisons = compareNutrients(
                            group.original.totals,
                            result?.totals ?? {},
                            SUBSTITUTION_COMPARE_NUTRIENTS,
                          );
                          const energia = comparisons[CORE_NUTRIENTS.energia];
                          const status = toleranceStatus(
                            energia,
                            tolerances[CORE_NUTRIENTS.energia] ?? null,
                          );

                          return (
                            <li
                              key={option.id}
                              className="flex items-start justify-between gap-3 p-3"
                            >
                              <div className="min-w-0">
                                <p className="truncate text-sm">{option.label}</p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                  {option.quantity !== null && (
                                    <span>
                                      {option.quantity.toLocaleString("pt-BR")}
                                      {option.measureLabel ? ` × ${option.measureLabel}` : ""}
                                    </span>
                                  )}
                                  {energia.diff !== null ? (
                                    <span
                                      className={cn(
                                        "font-medium",
                                        energia.diff > 0
                                          ? "text-amber-700 dark:text-amber-400"
                                          : "text-foreground",
                                      )}
                                    >
                                      {energia.diff > 0 ? "+" : "−"}
                                      {roundForDisplay(Math.abs(energia.diff), 0).toLocaleString("pt-BR")}{" "}
                                      kcal
                                    </span>
                                  ) : (
                                    <span>diferença desconhecida</span>
                                  )}
                                  <span className="text-[11px]">
                                    {TOLERANCE_STATUS_LABELS[status]}
                                  </span>
                                </p>
                                {result?.reason && (
                                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
                                    {result.reason}
                                  </p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="size-7 shrink-0"
                                aria-label={`Excluir ${option.label}`}
                                disabled={pending}
                                onClick={() =>
                                  run(
                                    () => deleteSubstitutionOption(option.id),
                                    "Alternativa excluída.",
                                  )
                                }
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setOptionFor(group)}
                        disabled={pending}
                      >
                        <Plus className="size-4" />
                        Alternativa
                      </Button>
                      <span className="text-[11px] text-muted-foreground">
                        A troca é feita no diário, onde existe um dia e uma meta para comparar.
                      </span>
                    </div>

                    {group.restrictions.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {group.restrictions.map((restriction) => (
                          <Badge key={restriction} variant="outline" className="text-[10px]">
                            {restriction}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })
          )}
        </TabsContent>

        {/* ══ Histórico ══ */}
        <TabsContent value="historico" className="space-y-3 pt-4">
          {props.logs.length === 0 ? (
            <EmptyState
              icon={Repeat}
              title="Nenhuma substituição registrada"
              description="Toda troca confirmada no diário fica registrada aqui, com o que saiu, o que entrou, a diferença nutricional daquele momento e o motivo."
            />
          ) : (
            <ul className="divide-y rounded-lg border">
              {props.logs.map((log) => (
                <li key={log.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="text-sm">
                      <span className="text-muted-foreground line-through">{log.originalLabel}</span>{" "}
                      → <strong>{log.replacementLabel}</strong>
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span>{longDateLabel(log.appliedOn)}</span>
                      <Badge variant="outline" className="text-[10px]">
                        {SUBSTITUTION_LEVEL_LABELS[log.level]}
                      </Badge>
                      {log.deltaEnergyKcal !== null ? (
                        <span>
                          {log.deltaEnergyKcal > 0 ? "+" : "−"}
                          {roundForDisplay(Math.abs(log.deltaEnergyKcal), 0).toLocaleString("pt-BR")}{" "}
                          kcal
                        </span>
                      ) : (
                        <span>diferença de energia desconhecida</span>
                      )}
                    </p>
                    {log.reason && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{log.reason}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 shrink-0"
                    aria-label="Excluir registro"
                    disabled={pending}
                    onClick={() => run(() => deleteSubstitutionLog(log.id), "Registro excluído.")}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Diálogos ── */}
      {groupDialogMontado && (
        <GroupDialog
          state={groupDialog}
          foods={props.foods}
          recipes={props.recipes}
          templates={props.templates}
          onOpenChange={(open) => !open && setGroupDialog(null)}
          onSubmit={async (values) => {
            const result = await saveSubstitutionGroup(values, groupDialog?.group?.id);
            if (result.ok) {
              toast.success(groupDialog?.group ? "Grupo salvo." : "Grupo criado.");
              setGroupDialog(null);
              router.refresh();
            } else {
              toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível salvar." }));
            }
          }}
        />
      )}

      {optionDialogMontado && (
        <OptionDialog
          group={optionFor}
          foods={props.foods}
          recipes={props.recipes}
          templates={props.templates}
          onOpenChange={(open) => !open && setOptionFor(null)}
          onSubmit={async (values) => {
            const result = await saveSubstitutionOption(values);
            if (result.ok) {
              toast.success("Alternativa adicionada.");
              setOptionFor(null);
              router.refresh();
            } else {
              toast.error(mensagemDaAction({ ...result, error: result.error ?? "Não foi possível adicionar." }));
            }
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════ Diálogos ═══════════════════════════ */
