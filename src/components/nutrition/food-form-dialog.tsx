"use client";

/**
 * Fase 16-A — Dieta e Alimentação · Cadastro e edição de alimento.
 *
 * DECISÃO DE UX QUE VEM DA REGRA DE DADO: o campo de valor pode ficar **vazio**, e vazio
 * significa "não informei" — vira `nao_disponivel`, não zero. Ao lado de cada nutriente há
 * um seletor com as outras possibilidades honestas (traço, não aplicável). Assim é
 * impossível registrar um zero que o usuário nunca mediu.
 *
 * O "natureza do dado" é escolhido uma vez para o alimento inteiro e vale como método de
 * todos os nutrientes — pedir isso nutriente a nutriente seria fricção sem ganho real num
 * cadastro manual.
 */
import * as React from "react";
import { useFieldArray, useForm, useWatch, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  BASE_UNITS,
  BASE_UNIT_LABELS,
  CORE_NUTRIENTS,
  DATA_QUALITY_LABELS,
  FOOD_TYPES,
  FOOD_TYPE_LABELS,
  NUTRIENT_GROUP_LABELS,
  NUTRIENT_METHODS,
  PREPARATION_STATES,
  PREPARATION_STATE_LABELS,
} from "@/lib/nutrition/constants";
import { nutritionFoodWithNutrientsSchema } from "@/lib/validators/nutrition";
import { saveNutritionFood } from "@/lib/actions/nutrition-foods";
import type {
  FoodCategory,
  FoodDetail,
  FoodSource,
  NutrientDefinition,
} from "@/lib/nutrition/types";

type FormValues = {
  food: {
    name: string;
    alternative_name: string;
    brand: string;
    barcode: string;
    category_id: string;
    food_type: string;
    preparation_state: string;
    base_quantity: string;
    base_unit: string;
    edible_portion_percent: string;
    source_id: string;
    source_food_code: string;
    source_version: string;
    data_quality: string;
    last_verified_at: string;
    notes: string;
  };
  nutrients: { nutrient_code: string; amount: string; value_state: string }[];
};

const NONE = "__none__";

/** Nutrientes que já vêm no formulário de um alimento novo. */
const DEFAULT_CODES = [
  CORE_NUTRIENTS.energia,
  CORE_NUTRIENTS.proteina,
  CORE_NUTRIENTS.carboidrato,
  CORE_NUTRIENTS.lipidios,
  CORE_NUTRIENTS.fibra,
  CORE_NUTRIENTS.acucares,
  CORE_NUTRIENTS.saturadas,
  CORE_NUTRIENTS.sodio,
];

const STATE_OPTIONS = [
  { value: "disponivel", label: "Valor" },
  { value: "traco", label: "Traço" },
  { value: "nao_aplicavel", label: "Não aplicável" },
  { value: "nao_disponivel", label: "Não informado" },
];

function emptyValues(): FormValues {
  return {
    food: {
      name: "",
      alternative_name: "",
      brand: "",
      barcode: "",
      category_id: NONE,
      food_type: "alimento",
      preparation_state: "nao_informado",
      base_quantity: "100",
      base_unit: "g",
      edible_portion_percent: "",
      source_id: NONE,
      source_food_code: "",
      source_version: "",
      data_quality: "rotulo",
      last_verified_at: "",
      notes: "",
    },
    nutrients: DEFAULT_CODES.map((code) => ({
      nutrient_code: code,
      amount: "",
      value_state: "disponivel",
    })),
  };
}

function valuesFromFood(food: FoodDetail): FormValues {
  return {
    food: {
      name: food.name,
      alternative_name: food.alternativeName ?? "",
      brand: food.brand ?? "",
      barcode: food.barcode ?? "",
      category_id: food.categoryId ?? NONE,
      food_type: food.foodType,
      preparation_state: food.preparationState,
      base_quantity: String(food.baseQuantity),
      base_unit: food.baseUnit,
      edible_portion_percent:
        food.ediblePortionPercent === null ? "" : String(food.ediblePortionPercent),
      source_id: food.source?.id ?? NONE,
      source_food_code: food.sourceFoodCode ?? "",
      source_version: food.sourceVersion ?? "",
      data_quality: food.dataQuality,
      last_verified_at: food.lastVerifiedAt ?? "",
      notes: food.notes ?? "",
    },
    nutrients: food.nutrients.map((nutrient) => ({
      nutrient_code: nutrient.code,
      amount: nutrient.amount === null ? "" : String(nutrient.amount),
      value_state: nutrient.state === "em_revisao" ? "nao_disponivel" : nutrient.state,
    })),
  };
}

export function FoodFormDialog({
  open,
  onOpenChange,
  food,
  categories,
  sources,
  nutrientList,
  nutrients,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` = criar. */
  food: FoodDetail | null;
  categories: FoodCategory[];
  sources: FoodSource[];
  nutrientList: NutrientDefinition[];
  nutrients: Record<string, NutrientDefinition>;
  onSaved: () => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [addCode, setAddCode] = React.useState<string>(NONE);

  const form = useForm<FormValues>({
    // O schema valida o payload FINAL (já convertido); aqui o resolver serve para o alimento.
    resolver: zodResolver(nutritionFoodWithNutrientsSchema) as unknown as Resolver<FormValues>,
    defaultValues: emptyValues(),
    mode: "onSubmit",
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "nutrients" });

  // Recarrega o formulário ao trocar o alimento editado (ajuste durante o render).
  const [loadedId, setLoadedId] = React.useState<string | null>(null);
  const currentId = food?.id ?? null;
  if (open && currentId !== loadedId) {
    setLoadedId(currentId);
    form.reset(food ? valuesFromFood(food) : emptyValues());
  }

  // `useWatch` em vez de `form.watch()`: o React Compiler está ligado e não consegue
  // memoizar a função devolvida por `watch()` (o lint do projeto reprova).
  const values = useWatch({ control: form.control });
  const usedCodes = new Set(values.nutrients?.map((n) => n?.nutrient_code) ?? []);
  const available = nutrientList.filter((definition) => !usedCodes.has(definition.code));

  // Fontes oficiais não são atribuíveis a cadastro manual — evita um número digitado
  // parecer publicado pela TACO. A action recusa de novo no servidor.
  const assignableSources = sources.filter((source) => !source.isOfficial);

  async function onSubmit() {
    const raw = form.getValues();
    setSaving(true);

    const payload = {
      food: {
        ...raw.food,
        category_id: raw.food.category_id === NONE ? "" : raw.food.category_id,
        source_id: raw.food.source_id === NONE ? "" : raw.food.source_id,
      },
      nutrients: raw.nutrients
        .map((nutrient) => {
          const hasAmount = nutrient.amount.trim() !== "";
          // Campo vazio = "não informei". NUNCA vira zero.
          const state =
            nutrient.value_state === "disponivel" && !hasAmount
              ? "nao_disponivel"
              : nutrient.value_state;
          return {
            nutrient_code: nutrient.nutrient_code,
            amount: state === "disponivel" ? nutrient.amount : null,
            value_state: state,
            method: raw.food.data_quality,
          };
        })
        // Nutriente sem informação nenhuma não gera linha: a ausência já é lida como
        // "não disponível" e poluir a tabela não acrescenta nada.
        .filter((nutrient) => nutrient.value_state !== "nao_disponivel"),
    };

    const result = await saveNutritionFood(payload, food?.id);
    setSaving(false);

    if (!result.ok) {
      toast.error(result.error);
      if (result.fieldErrors) {
        for (const [key, messages] of Object.entries(result.fieldErrors)) {
          form.setError(key as never, { message: messages?.[0] });
        }
      }
      return;
    }

    toast.success(food ? "Alimento atualizado." : "Alimento criado.");
    onOpenChange(false);
    onSaved();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] w-[min(48rem,calc(100vw-2rem))] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{food ? "Editar alimento" : "Novo alimento"}</DialogTitle>
          <DialogDescription>
            Os valores nutricionais se referem à quantidade-base informada abaixo.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            void onSubmit();
          }}
          className="space-y-5"
        >
          {/* ─────────── Identificação ─────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              Identificação
            </h3>
            <div className="space-y-1.5">
              <Label htmlFor="f-nome">Nome *</Label>
              <Input id="f-nome" {...form.register("food.name")} placeholder="Ex.: Frango, peito, grelhado" />
              {form.formState.errors.food?.name && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.food.name.message}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="f-alt">Nome alternativo</Label>
                <Input id="f-alt" {...form.register("food.alternative_name")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-marca">Marca</Label>
                <Input id="f-marca" {...form.register("food.brand")} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="f-barras">Código de barras</Label>
                <Input
                  id="f-barras"
                  inputMode="numeric"
                  placeholder="8 a 14 dígitos"
                  {...form.register("food.barcode")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-cat">Categoria</Label>
                <Select
                  value={values.food?.category_id ?? NONE}
                  onValueChange={(value) => form.setValue("food.category_id", value)}
                >
                  <SelectTrigger id="f-cat">
                    <SelectValue placeholder="Sem categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Sem categoria</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="f-tipo">Tipo</Label>
                <Select
                  value={values.food?.food_type ?? "alimento"}
                  onValueChange={(value) => form.setValue("food.food_type", value)}
                >
                  <SelectTrigger id="f-tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FOOD_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>
                        {FOOD_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-preparo">Estado / preparo</Label>
                <Select
                  value={values.food?.preparation_state ?? "nao_informado"}
                  onValueChange={(value) => form.setValue("food.preparation_state", value)}
                >
                  <SelectTrigger id="f-preparo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PREPARATION_STATES.map((state) => (
                      <SelectItem key={state} value={state}>
                        {PREPARATION_STATE_LABELS[state]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Cru e cozido têm composição diferente — são alimentos separados.
                </p>
              </div>
            </div>
          </section>

          <Separator />

          {/* ─────────── Base de cálculo ─────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              Base de cálculo
            </h3>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="f-base">Quantidade-base *</Label>
                <Input id="f-base" inputMode="decimal" {...form.register("food.base_quantity")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-unidade">Unidade</Label>
                <Select
                  value={values.food?.base_unit ?? "g"}
                  onValueChange={(value) => form.setValue("food.base_unit", value)}
                >
                  <SelectTrigger id="f-unidade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BASE_UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {BASE_UNIT_LABELS[unit]} ({unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-comestivel">Parte comestível (%)</Label>
                <Input
                  id="f-comestivel"
                  inputMode="decimal"
                  placeholder="opcional"
                  {...form.register("food.edible_portion_percent")}
                />
              </div>
            </div>
          </section>

          <Separator />

          {/* ─────────── Nutrientes ─────────── */}
          <section className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
                Nutrientes por {values.food?.base_quantity || "100"} {values.food?.base_unit ?? "g"}
              </h3>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Deixe em branco o que você não sabe — fica registrado como{" "}
              <strong>não informado</strong>, nunca como zero.
            </p>

            <div className="space-y-2">
              {fields.map((field, index) => {
                const definition = nutrients[values.nutrients?.[index]?.nutrient_code ?? ""];
                const state = values.nutrients?.[index]?.value_state ?? "disponivel";
                return (
                  <div key={field.id} className="flex items-end gap-2">
                    <div className="min-w-0 flex-1">
                      <Label className="text-xs text-muted-foreground">
                        {definition?.name ?? field.nutrient_code}
                        {definition && ` (${definition.unit})`}
                      </Label>
                      <Input
                        inputMode="decimal"
                        disabled={state !== "disponivel"}
                        placeholder={state === "disponivel" ? "—" : ""}
                        className="mt-1 h-9"
                        {...form.register(`nutrients.${index}.amount`)}
                      />
                    </div>
                    <Select
                      value={state}
                      onValueChange={(value) =>
                        form.setValue(`nutrients.${index}.value_state`, value)
                      }
                    >
                      <SelectTrigger
                        className="h-9 w-[9.5rem] shrink-0"
                        aria-label={`Estado de ${definition?.name ?? field.nutrient_code}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() => remove(index)}
                      aria-label={`Remover ${definition?.name ?? field.nutrient_code}`}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <Select value={addCode} onValueChange={setAddCode}>
                <SelectTrigger className="h-9 flex-1" aria-label="Adicionar nutriente">
                  <SelectValue placeholder="Adicionar nutriente…" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value={NONE}>Adicionar nutriente…</SelectItem>
                  {available.map((definition) => (
                    <SelectItem key={definition.code} value={definition.code}>
                      {NUTRIENT_GROUP_LABELS[definition.group]} · {definition.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={addCode === NONE}
                onClick={() => {
                  append({ nutrient_code: addCode, amount: "", value_state: "disponivel" });
                  setAddCode(NONE);
                }}
              >
                <Plus className="size-3.5" />
                Adicionar
              </Button>
            </div>
          </section>

          <Separator />

          {/* ─────────── Procedência ─────────── */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">
              Procedência
            </h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="f-fonte">Fonte</Label>
                <Select
                  value={values.food?.source_id ?? NONE}
                  onValueChange={(value) => form.setValue("food.source_id", value)}
                >
                  <SelectTrigger id="f-fonte">
                    <SelectValue placeholder="Não informada" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Não informada</SelectItem>
                    {assignableSources.map((source) => (
                      <SelectItem key={source.id} value={source.id}>
                        {source.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-qualidade">Natureza do dado</Label>
                <Select
                  value={values.food?.data_quality ?? "rotulo"}
                  onValueChange={(value) => form.setValue("food.data_quality", value)}
                >
                  <SelectTrigger id="f-qualidade">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NUTRIENT_METHODS.map((method) => (
                      <SelectItem key={method} value={method}>
                        {DATA_QUALITY_LABELS[method]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="f-verificado">Verificado em</Label>
                <Input id="f-verificado" type="date" {...form.register("food.last_verified_at")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="f-codigo">Código na fonte</Label>
                <Input id="f-codigo" {...form.register("food.source_food_code")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="f-obs">Observações</Label>
              <Textarea id="f-obs" rows={2} {...form.register("food.notes")} />
            </div>
          </section>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="size-4 animate-spin" />}
              {food ? "Salvar" : "Criar alimento"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
