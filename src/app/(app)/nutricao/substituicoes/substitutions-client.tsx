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
import { useRouter } from "next/navigation";
import { Info, Plus, Repeat, Trash2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { roundForDisplay } from "@/lib/nutrition/calc";
import {
  CORE_NUTRIENTS,
  SUBSTITUTION_COMPARE_NUTRIENTS,
  SUBSTITUTION_DISCLAIMER,
  SUBSTITUTION_LEVEL_HINTS,
  SUBSTITUTION_LEVEL_LABELS,
  SUBSTITUTION_LEVELS,
  type SubstitutionLevel,
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
import type { PickerMeasure } from "@/components/nutrition/food-picker-dialog";

type NamedItem = { id: string; name: string };

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

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? "Não foi possível concluir.");
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
            toast.error(result.error ?? "Não foi possível salvar.");
          }
        }}
      />

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
            toast.error(result.error ?? "Não foi possível adicionar.");
          }
        }}
      />
    </div>
  );
}

/* ═══════════════════════════ Diálogos ═══════════════════════════ */

type SubjectKind = "alimento" | "receita" | "modelo" | "livre";

function SubjectPicker({
  idPrefix,
  kind,
  onKindChange,
  value,
  onValueChange,
  customLabel,
  onCustomLabelChange,
  foods,
  recipes,
  templates,
  allowTemplate,
  allowFood = true,
}: {
  idPrefix: string;
  kind: SubjectKind;
  onKindChange: (kind: SubjectKind) => void;
  value: string;
  onValueChange: (value: string) => void;
  customLabel: string;
  onCustomLabelChange: (value: string) => void;
  foods: FoodListItem[];
  recipes: NamedItem[];
  templates: NamedItem[];
  allowTemplate: boolean;
  allowFood?: boolean;
}) {
  const list: NamedItem[] =
    kind === "alimento"
      ? foods.filter((food) => !food.isArchived).slice(0, 500).map((f) => ({ id: f.id, name: f.name }))
      : kind === "receita"
        ? recipes
        : kind === "modelo"
          ? templates
          : [];

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-kind`}>Tipo</Label>
        <select
          id={`${idPrefix}-kind`}
          value={kind}
          onChange={(event) => {
            onKindChange(event.target.value as SubjectKind);
            onValueChange("");
          }}
          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {allowFood && <option value="alimento">Alimento</option>}
          <option value="receita">Receita</option>
          {allowTemplate && <option value="modelo">Refeição-modelo</option>}
          <option value="livre">Descrever com texto</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-value`}>
          {kind === "livre" ? "Descrição" : "Item"}
        </Label>
        {kind === "livre" ? (
          <Input
            id={`${idPrefix}-value`}
            value={customLabel}
            onChange={(event) => onCustomLabelChange(event.target.value)}
            placeholder="Ex.: marmita do restaurante"
          />
        ) : (
          <select
            id={`${idPrefix}-value`}
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">Escolha…</option>
            {list.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}

function GroupDialog({
  state,
  foods,
  recipes,
  templates,
  onOpenChange,
  onSubmit,
}: {
  state: { group: SubstitutionGroupWithTotals | null } | null;
  foods: FoodListItem[];
  recipes: NamedItem[];
  templates: NamedItem[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const group = state?.group ?? null;

  const [name, setName] = React.useState("");
  const [level, setLevel] = React.useState<SubstitutionLevel>("alimento");
  const [kind, setKind] = React.useState<SubjectKind>("alimento");
  const [subjectId, setSubjectId] = React.useState("");
  const [customLabel, setCustomLabel] = React.useState("");
  const [quantity, setQuantity] = React.useState("");
  const [tolerances, setTolerances] = React.useState({
    energy: "",
    protein: "",
    carb: "",
    fat: "",
    fiber: "",
  });
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const seen = `${state !== null}:${group?.id ?? "novo"}`;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    if (state) {
      setName(group?.name ?? "");
      setLevel(group?.groupKind ?? "alimento");
      setKind(
        group?.foodId
          ? "alimento"
          : group?.recipeId
            ? "receita"
            : group?.mealTemplateId
              ? "modelo"
              : group
                ? "livre"
                : "alimento",
      );
      setSubjectId(group?.foodId ?? group?.recipeId ?? group?.mealTemplateId ?? "");
      setCustomLabel(group?.customLabel ?? "");
      setQuantity(group?.baseQuantity === null || group === null ? "" : String(group.baseQuantity));
      setTolerances({
        energy: group?.tolerances.energy === null || !group ? "" : String(group.tolerances.energy),
        protein: group?.tolerances.protein === null || !group ? "" : String(group.tolerances.protein),
        carb: group?.tolerances.carb === null || !group ? "" : String(group.tolerances.carb),
        fat: group?.tolerances.fat === null || !group ? "" : String(group.tolerances.fat),
        fiber: group?.tolerances.fiber === null || !group ? "" : String(group.tolerances.fiber),
      });
      setNotes(group?.notes ?? "");
      setSaving(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{group ? "Editar grupo" : "Novo grupo de substituição"}</DialogTitle>
          <DialogDescription>
            Um grupo guarda as alternativas que você aceita para um item, e as tolerâncias que
            você considera aceitáveis. O sistema não decide nada por você.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Nome do grupo</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: fontes de carboidrato do almoço"
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="group-level">Nível</Label>
            <select
              id="group-level"
              value={level}
              onChange={(event) => {
                const next = event.target.value as SubstitutionLevel;
                setLevel(next);
                // O CHECK do banco amarra: grupo de alimento não aponta para refeição-modelo.
                if (next === "refeicao" && kind === "alimento") {
                  setKind("receita");
                  setSubjectId("");
                }
                if (next === "alimento" && kind === "modelo") {
                  setKind("alimento");
                  setSubjectId("");
                }
              }}
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {SUBSTITUTION_LEVELS.map((value) => (
                <option key={value} value={value}>
                  {SUBSTITUTION_LEVEL_LABELS[value]}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">{SUBSTITUTION_LEVEL_HINTS[level]}</p>
          </div>

          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">O que é substituído</legend>
            <SubjectPicker
              idPrefix="group-subject"
              kind={kind}
              onKindChange={setKind}
              value={subjectId}
              onValueChange={setSubjectId}
              customLabel={customLabel}
              onCustomLabelChange={setCustomLabel}
              foods={foods}
              recipes={recipes}
              templates={templates}
              allowTemplate={level === "refeicao"}
              allowFood={level === "alimento"}
            />

            <div className="space-y-1.5">
              <Label htmlFor="group-quantity">Quantidade de referência</Label>
              <Input
                id="group-quantity"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                placeholder="Ex.: 150"
              />
              <p className="text-[11px] text-muted-foreground">
                É sobre esta quantidade que a comparação é feita. Sem ela, a diferença não pode
                ser calculada.
              </p>
            </div>
          </fieldset>

          <fieldset className="space-y-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Tolerâncias (%)</legend>
            <p className="text-[11px] text-muted-foreground">
              Quanto você aceita variar em cada macro. Deixar em branco significa &ldquo;não
              defini&rdquo; — e não &ldquo;tolerância zero&rdquo;. A diferença é sempre exibida;
              a tolerância só colore o resultado.
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              {(
                [
                  ["energy", "Energia"],
                  ["protein", "Proteína"],
                  ["carb", "Carbo."],
                  ["fat", "Gordura"],
                  ["fiber", "Fibra"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`tol-${key}`} className="text-xs">
                    {label}
                  </Label>
                  <Input
                    id={`tol-${key}`}
                    inputMode="decimal"
                    value={tolerances[key]}
                    onChange={(event) =>
                      setTolerances((current) => ({ ...current, [key]: event.target.value }))
                    }
                    placeholder="—"
                  />
                </div>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1.5">
            <Label htmlFor="group-notes">Observações</Label>
            <Textarea
              id="group-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={!name.trim() || saving}
            onClick={async () => {
              setSaving(true);
              await onSubmit({
                name: name.trim(),
                group_kind: level,
                food_id: kind === "alimento" ? subjectId || undefined : undefined,
                recipe_id: kind === "receita" ? subjectId || undefined : undefined,
                meal_template_id: kind === "modelo" ? subjectId || undefined : undefined,
                custom_label: kind === "livre" ? customLabel || undefined : undefined,
                base_quantity: quantity || undefined,
                base_portion_unit: kind === "receita" ? "porcao" : undefined,
                tolerance_energy_percent: tolerances.energy || undefined,
                tolerance_protein_percent: tolerances.protein || undefined,
                tolerance_carb_percent: tolerances.carb || undefined,
                tolerance_fat_percent: tolerances.fat || undefined,
                tolerance_fiber_percent: tolerances.fiber || undefined,
                notes: notes || undefined,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : group ? "Salvar" : "Criar grupo"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OptionDialog({
  group,
  foods,
  recipes,
  templates,
  onOpenChange,
  onSubmit,
}: {
  group: SubstitutionGroupWithTotals | null;
  foods: FoodListItem[];
  recipes: NamedItem[];
  templates: NamedItem[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
}) {
  const [kind, setKind] = React.useState<SubjectKind>("alimento");
  const [subjectId, setSubjectId] = React.useState("");
  const [customLabel, setCustomLabel] = React.useState("");
  const [quantity, setQuantity] = React.useState("100");
  const [priority, setPriority] = React.useState("0");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const seen = group?.id ?? null;
  const [lastSeen, setLastSeen] = React.useState(seen);
  if (seen !== lastSeen) {
    setLastSeen(seen);
    setKind(group?.groupKind === "refeicao" ? "receita" : "alimento");
    setSubjectId("");
    setCustomLabel("");
    setQuantity("100");
    setPriority("0");
    setNotes("");
    setSaving(false);
  }

  return (
    <Dialog open={group !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova alternativa</DialogTitle>
          <DialogDescription>
            Para o grupo “{group?.name}”. A prioridade é a SUA ordem de preferência — o sistema
            não classifica alternativas por qualidade nutricional.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <SubjectPicker
            idPrefix="option-subject"
            kind={kind}
            onKindChange={setKind}
            value={subjectId}
            onValueChange={setSubjectId}
            customLabel={customLabel}
            onCustomLabelChange={setCustomLabel}
            foods={foods}
            recipes={recipes}
            templates={templates}
            allowTemplate
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="option-quantity">Quantidade sugerida</Label>
              <Input
                id="option-quantity"
                inputMode="decimal"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="option-priority">Prioridade</Label>
              <Input
                id="option-priority"
                inputMode="numeric"
                value={priority}
                onChange={(event) => setPriority(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Menor = sua preferida.</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="option-notes">Observações</Label>
            <Textarea
              id="option-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            disabled={saving || (kind !== "livre" ? !subjectId : !customLabel.trim())}
            onClick={async () => {
              setSaving(true);
              await onSubmit({
                group_id: group?.id,
                option_kind: kind,
                food_id: kind === "alimento" ? subjectId || undefined : undefined,
                recipe_id: kind === "receita" ? subjectId || undefined : undefined,
                meal_template_id: kind === "modelo" ? subjectId || undefined : undefined,
                custom_label: kind === "livre" ? customLabel || undefined : undefined,
                quantity: kind === "livre" ? undefined : quantity,
                portion_unit: kind === "receita" ? "porcao" : undefined,
                priority: priority || 0,
                notes: notes || undefined,
              });
              setSaving(false);
            }}
          >
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
