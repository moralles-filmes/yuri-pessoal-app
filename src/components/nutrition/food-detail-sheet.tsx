"use client";

/**
 * Fase 16-A — Dieta e Alimentação · Painel de detalhe do alimento.
 *
 * Três coisas acontecem aqui e as três são exigência da fase:
 *  1. **Calculadora de porção** — prova que o núcleo (`convertToBase` + `scaleNutrients`)
 *     funciona de ponta a ponta e já entrega utilidade real antes do diário existir.
 *  2. **Todos os nutrientes com estado do valor** — zero, traço e "não analisado" aparecem
 *     diferentes, agrupados por família.
 *  3. **Procedência visível** — fonte, edição, código original e data de verificação, com a
 *     citação exigida pela licença da TACO.
 */
import * as React from "react";
import { Pencil, Plus, Ruler, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate } from "@/lib/format";
import {
  BASE_UNIT_LABELS,
  FOOD_TYPE_LABELS,
  NUTRIENT_GROUP_LABELS,
  NUTRIENT_GROUP_ORDER,
  NUTRIENT_METHOD_LABELS,
  PREPARATION_STATE_LABELS,
} from "@/lib/nutrition/constants";
import { scaleNutrients } from "@/lib/nutrition/calc";
import { convertToBase, CONVERSION_FAILURE_MESSAGES, describeMeasure, defaultMeasure } from "@/lib/nutrition/units";
import type { FoodDetail, FoodMeasure, NutrientDefinition } from "@/lib/nutrition/types";
import { deleteNutritionMeasure } from "@/lib/actions/nutrition-foods";
import { NutrientValue } from "./nutrient-value";

const BASE_MEASURE = "__base__";

export function FoodDetailSheet({
  food,
  nutrients,
  open,
  onOpenChange,
  onEdit,
  onDuplicate,
  onToggleFavorite,
  onAddMeasure,
  onEditMeasure,
  onChanged,
}: {
  food: FoodDetail | null;
  nutrients: Record<string, NutrientDefinition>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggleFavorite: () => void;
  onAddMeasure: () => void;
  onEditMeasure: (measure: FoodMeasure) => void;
  onChanged: () => void;
}) {
  const [quantity, setQuantity] = React.useState("100");
  const [measureId, setMeasureId] = React.useState<string>(BASE_MEASURE);

  // Ao trocar de alimento, a calculadora volta para a medida padrão dele. Ajuste de estado
  // durante o render (padrão do React 19 no projeto) — nada de setState em useEffect.
  const [lastFoodId, setLastFoodId] = React.useState<string | null>(null);
  if (food && food.id !== lastFoodId) {
    setLastFoodId(food.id);
    const preferred = defaultMeasure(food.measures);
    setMeasureId(preferred?.id ?? BASE_MEASURE);
    setQuantity(preferred ? "1" : String(food.baseQuantity));
  }

  if (!food) return null;

  const measure = food.measures.find((m) => m.id === measureId) ?? null;
  const conversion = convertToBase(Number(quantity.replace(",", ".")), measure, food);

  const computed = conversion.ok ? scaleNutrients(food.nutrients, conversion.factor) : null;

  // Agrupa os nutrientes por família, na ordem de exibição do catálogo de referência.
  const byGroup = NUTRIENT_GROUP_ORDER.map((group) => ({
    group,
    items: food.nutrients
      .map((value) => ({ value, definition: nutrients[value.code] }))
      .filter((item) => item.definition?.group === group)
      .sort((a, b) => (a.definition?.position ?? 0) - (b.definition?.position ?? 0)),
  })).filter((entry) => entry.items.length > 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <SheetTitle className="text-left text-base leading-snug">{food.name}</SheetTitle>
              <SheetDescription className="text-left">
                {food.brand ? `${food.brand} · ` : ""}
                {FOOD_TYPE_LABELS[food.foodType]}
                {food.preparationState !== "nao_informado" &&
                  ` · ${PREPARATION_STATE_LABELS[food.preparationState]}`}
              </SheetDescription>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onToggleFavorite}
              aria-label={food.isFavorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              aria-pressed={food.isFavorite}
            >
              <Star className={food.isFavorite ? "size-4 fill-primary text-primary" : "size-4"} />
            </Button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {food.isSystemFood && <Badge variant="secondary">Base do sistema</Badge>}
            {!food.isSystemFood && <Badge variant="outline">Meu alimento</Badge>}
            {!food.isVerified && (
              <Badge variant="outline" className="border-amber-500/40 text-amber-700 dark:text-amber-400">
                Em reavaliação pela fonte
              </Badge>
            )}
            {food.isArchived && <Badge variant="outline">Arquivado</Badge>}
          </div>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={onDuplicate}>
              Duplicar
            </Button>
            {food.isEditable ? (
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="size-3.5" />
                Editar
              </Button>
            ) : (
              <p className="text-xs text-muted-foreground">
                Alimento oficial: somente leitura. Duplique para criar uma versão sua.
              </p>
            )}
          </div>

          <Tabs defaultValue="calculadora">
            <TabsList className="w-full">
              <TabsTrigger value="calculadora" className="flex-1">
                Porção
              </TabsTrigger>
              <TabsTrigger value="nutrientes" className="flex-1">
                Nutrientes
              </TabsTrigger>
              <TabsTrigger value="medidas" className="flex-1">
                Medidas
              </TabsTrigger>
              <TabsTrigger value="fonte" className="flex-1">
                Fonte
              </TabsTrigger>
            </TabsList>

            {/* ─────────── Calculadora de porção ─────────── */}
            <TabsContent value="calculadora" className="space-y-4 pt-4">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-2">
                <div className="space-y-1.5">
                  <Label htmlFor="calc-qtd" className="text-xs">
                    Quantidade
                  </Label>
                  <Input
                    id="calc-qtd"
                    inputMode="decimal"
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    className="h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="calc-medida" className="text-xs">
                    Medida
                  </Label>
                  <Select value={measureId} onValueChange={setMeasureId}>
                    <SelectTrigger id="calc-medida" className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={BASE_MEASURE}>
                        {BASE_UNIT_LABELS[food.baseUnit]} ({food.baseUnit})
                      </SelectItem>
                      {food.measures.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {describeMeasure(item, food.baseUnit)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {!conversion.ok ? (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                  {CONVERSION_FAILURE_MESSAGES[conversion.reason]}
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Equivale a{" "}
                    <span className="font-medium text-foreground">
                      {conversion.amount.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}{" "}
                      {conversion.unit}
                    </span>{" "}
                    · valores por {food.baseQuantity} {food.baseUnit} na fonte.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {["energia_kcal", "proteina", "carboidrato", "lipidios", "fibra", "sodio"].map(
                      (code) => {
                        const definition = nutrients[code];
                        const value = computed?.[code];
                        if (!definition) return null;
                        return (
                          <div key={code} className="rounded-lg border p-3">
                            <p className="text-[11px] text-muted-foreground">
                              {definition.shortName ?? definition.name}
                            </p>
                            <p className="mt-0.5 text-base font-semibold">
                              {value ? (
                                <NutrientValue
                                  amount={value.amount}
                                  state={value.state}
                                  definition={definition}
                                />
                              ) : (
                                <NutrientValue
                                  amount={null}
                                  state="nao_disponivel"
                                  definition={definition}
                                />
                              )}
                            </p>
                          </div>
                        );
                      },
                    )}
                  </div>
                </>
              )}
            </TabsContent>

            {/* ─────────── Todos os nutrientes ─────────── */}
            <TabsContent value="nutrientes" className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground">
                Valores por {food.baseQuantity} {food.baseUnit}
                {food.ediblePortionPercent !== null &&
                  ` de parte comestível (${food.ediblePortionPercent}%)`}
                .
              </p>
              {byGroup.map(({ group, items }) => (
                <div key={group} className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {NUTRIENT_GROUP_LABELS[group]}
                  </p>
                  <div className="rounded-lg border">
                    {items.map(({ value, definition }, index) => (
                      <div
                        key={value.code}
                        className={`flex items-center justify-between gap-3 px-3 py-2 text-sm ${
                          index > 0 ? "border-t" : ""
                        }`}
                      >
                        <span className="min-w-0 truncate">{definition.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          {value.method !== "analitico" && value.state === "disponivel" && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              {NUTRIENT_METHOD_LABELS[value.method]}
                            </span>
                          )}
                          <NutrientValue
                            amount={value.amount}
                            state={value.state}
                            definition={definition}
                          />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <p className="text-[11px] text-muted-foreground">
                Nutrientes não listados não foram analisados pela fonte para este alimento —
                ausência de dado não significa zero.
              </p>
            </TabsContent>

            {/* ─────────── Medidas caseiras ─────────── */}
            <TabsContent value="medidas" className="space-y-3 pt-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Conversões reais deste alimento.
                </p>
                <Button variant="outline" size="sm" onClick={onAddMeasure}>
                  <Plus className="size-3.5" />
                  Nova medida
                </Button>
              </div>

              {food.measures.length === 0 ? (
                <div className="rounded-lg border border-dashed p-6 text-center">
                  <Ruler className="mx-auto size-6 text-muted-foreground" />
                  <p className="mt-2 text-sm font-medium">Nenhuma medida caseira</p>
                  <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
                    A TACO não publica medidas caseiras por alimento, então nenhuma foi
                    presumida. Cadastre as suas (ex.: “colher de sopa = 25 g”) para registrar
                    sem pesar.
                  </p>
                </div>
              ) : (
                <div className="rounded-lg border">
                  {food.measures.map((item, index) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between gap-2 px-3 py-2 ${
                        index > 0 ? "border-t" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {item.label}
                          {item.isDefault && (
                            <Badge variant="secondary" className="ml-2 text-[10px]">
                              Padrão
                            </Badge>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {item.grams !== null && `${item.grams} g`}
                          {item.grams !== null && item.milliliters !== null && " · "}
                          {item.milliliters !== null && `${item.milliliters} ml`}
                        </p>
                      </div>
                      {item.isOwn && (
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => onEditMeasure(item)}
                            aria-label={`Editar medida ${item.label}`}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Excluir medida ${item.label}`}
                            onClick={async () => {
                              if (!confirm(`Excluir a medida “${item.label}”?`)) return;
                              const result = await deleteNutritionMeasure(item.id);
                              if (result.ok) {
                                toast.success("Medida excluída.");
                                onChanged();
                              } else {
                                toast.error(result.error);
                              }
                            }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ─────────── Procedência ─────────── */}
            <TabsContent value="fonte" className="space-y-3 pt-4">
              <dl className="space-y-2 text-sm">
                <Row label="Fonte" value={food.source?.name ?? "Não informada"} />
                {food.source?.edition && <Row label="Edição" value={food.source.edition} />}
                {food.sourceVersion && <Row label="Versão" value={food.sourceVersion} />}
                {food.sourceFoodCode && (
                  <Row label="Código na fonte" value={food.sourceFoodCode} />
                )}
                <Row
                  label="Natureza do dado"
                  value={NUTRIENT_METHOD_LABELS[food.dataQuality]}
                />
                {food.lastVerifiedAt && (
                  <Row label="Verificado em" value={formatDate(food.lastVerifiedAt)} />
                )}
                {food.categoryName && (
                  <Row
                    label="Categoria"
                    value={
                      food.sourceCategoryName
                        ? `${food.categoryName} (a fonte publica em “${food.sourceCategoryName}”)`
                        : food.categoryName
                    }
                  />
                )}
              </dl>

              {food.source?.citation && (
                <>
                  <Separator />
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                      Como citar
                    </p>
                    <p className="text-xs text-muted-foreground">{food.source.citation}</p>
                    {food.source.licenseNote && (
                      <p className="text-[11px] text-muted-foreground/80">
                        {food.source.licenseNote}
                      </p>
                    )}
                  </div>
                </>
              )}

              {food.notes && (
                <>
                  <Separator />
                  <p className="text-xs text-muted-foreground">{food.notes}</p>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm">{value}</dd>
    </div>
  );
}
