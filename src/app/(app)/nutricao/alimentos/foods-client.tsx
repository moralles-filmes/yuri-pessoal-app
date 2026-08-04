"use client";

/**
 * Fase 16-A — Dieta e Alimentação · Catálogo de alimentos (cliente).
 *
 * Orquestra filtro, seleção múltipla, ações em massa e os diálogos. Os 597 alimentos da base
 * vêm de uma consulta só e são filtrados em memória (`applyFoodFilters`), o que deixa a busca
 * instantânea enquanto o usuário digita; a lista renderiza em blocos para não montar
 * centenas de nós de uma vez.
 *
 * O estado dos filtros mora na URL — voltar, recarregar ou compartilhar o link devolve
 * exatamente a mesma visão.
 */
import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Copy,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";
import { PREPARATION_STATE_LABELS } from "@/lib/nutrition/constants";
import { applyFoodFilters, distinctBrands, filtersFromParams, paramsFromFilters } from "@/lib/nutrition/filters";
import type {
  FoodCategory,
  FoodDetail,
  FoodFilterState,
  FoodListItem,
  FoodMeasure,
  FoodSource,
  FoodTag,
  NutrientDefinition,
} from "@/lib/nutrition/types";
import {
  bulkNutritionFoodAction,
  deleteNutritionFood,
  duplicateNutritionFood,
  fetchNutritionFoodDetail,
  toggleNutritionFavorite,
} from "@/lib/actions/nutrition-foods";
import { FoodFilters } from "@/components/nutrition/food-filters";
import { FoodDetailSheet } from "@/components/nutrition/food-detail-sheet";
import { FoodFormDialog } from "@/components/nutrition/food-form-dialog";
import { MeasureDialog } from "@/components/nutrition/measure-dialog";
import { MacroChip } from "@/components/nutrition/nutrient-value";

const PAGE_SIZE = 60;

export function FoodsClient({
  foods,
  categories,
  sources,
  tags,
  nutrientList,
  nutrients,
  initialDetail,
}: {
  foods: FoodListItem[];
  categories: FoodCategory[];
  sources: FoodSource[];
  tags: FoodTag[];
  nutrientList: NutrientDefinition[];
  nutrients: Record<string, NutrientDefinition>;
  /**
   * Fase 16-F — deep-link da busca global (`?alimento=<id>`). O detalhe vem RESOLVIDO DO
   * SERVIDOR (e não buscado num efeito): o React Compiler está ativo e `setState` em
   * `useEffect` é proibido no projeto. `null` = id inexistente ou de outro usuário — a tela
   * abre normal, sem erro.
   */
  initialDetail?: FoodDetail | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filters = React.useMemo(
    () => filtersFromParams(Object.fromEntries(searchParams.entries())),
    [searchParams],
  );

  const visible = React.useMemo(() => applyFoodFilters(foods, filters), [foods, filters]);
  const brands = React.useMemo(() => distinctBrands(foods), [foods]);

  const [limit, setLimit] = React.useState(PAGE_SIZE);
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [detail, setDetail] = React.useState<FoodDetail | null>(initialDetail ?? null);
  const [detailOpen, setDetailOpen] = React.useState(Boolean(initialDetail));
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FoodDetail | null>(null);
  const [measureOpen, setMeasureOpen] = React.useState(false);
  const [editingMeasure, setEditingMeasure] = React.useState<FoodMeasure | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Filtro novo → volta ao topo da lista (ajuste durante o render, sem useEffect).
  const filterKey = searchParams.toString();
  const [lastFilterKey, setLastFilterKey] = React.useState(filterKey);
  if (filterKey !== lastFilterKey) {
    setLastFilterKey(filterKey);
    setLimit(PAGE_SIZE);
    setSelected(new Set());
  }

  function updateFilters(patch: Partial<FoodFilterState>) {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams(paramsFromFilters(next));
    router.replace(params.toString() ? `?${params}` : "?", { scroll: false });
  }

  function clearFilters() {
    router.replace("?", { scroll: false });
  }

  async function openDetail(foodId: string) {
    setDetailOpen(true);
    const result = await fetchNutritionFoodDetail(foodId);
    if (result.ok) setDetail(result.data);
    else toast.error(result.error);
  }

  /** Recarrega o detalhe aberto e a lista do servidor após qualquer mutação. */
  async function refresh(foodId?: string) {
    router.refresh();
    const id = foodId ?? detail?.id;
    if (!id) return;
    const result = await fetchNutritionFoodDetail(id);
    if (result.ok) setDetail(result.data);
  }

  async function handleFavorite(food: FoodListItem) {
    const result = await toggleNutritionFavorite(food.id, !food.isFavorite);
    if (!result.ok) return toast.error(result.error);
    toast.success(food.isFavorite ? "Removido dos favoritos." : "Adicionado aos favoritos.");
    void refresh(food.id);
  }

  async function handleDuplicate(foodId: string) {
    const result = await duplicateNutritionFood({ food_id: foodId });
    if (!result.ok) return toast.error(result.error);
    toast.success("Cópia criada.", {
      description: "A cópia é sua e pode ser editada à vontade.",
    });
    router.refresh();
    void openDetail(result.data.id);
  }

  async function handleDelete(food: FoodListItem) {
    if (!confirm(`Excluir “${food.name}”? Esta ação não pode ser desfeita.`)) return;
    const result = await deleteNutritionFood(food.id);
    if (!result.ok) return toast.error(result.error);
    toast.success("Alimento excluído.");
    setDetailOpen(false);
    router.refresh();
  }

  async function runBulk(action: string) {
    const ids = [...selected];
    if (ids.length === 0) return;

    if (action === "excluir") {
      const own = foods.filter((f) => ids.includes(f.id) && !f.isSystemFood).length;
      const message =
        own === ids.length
          ? `Excluir ${ids.length} alimento(s)? Esta ação não pode ser desfeita.`
          : `Dos ${ids.length} selecionados, ${own} são seus e serão excluídos. Os da base do sistema são somente leitura e serão ignorados. Continuar?`;
      if (!confirm(message)) return;
    }

    setBusy(true);
    const result = await bulkNutritionFoodAction({ action, ids });
    setBusy(false);

    if (!result.ok) return toast.error(result.error);
    toast.success(`${result.data.affected} alimento(s) atualizado(s).`, {
      description:
        result.data.skipped > 0
          ? `${result.data.skipped} ignorado(s) por serem da base do sistema.`
          : undefined,
    });
    setSelected(new Set());
    router.refresh();
  }

  const allVisibleSelected = visible.length > 0 && visible.every((f) => selected.has(f.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Alimentos"
        description="Catálogo com a base brasileira da TACO e os seus alimentos."
      >
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="size-4" />
          Novo alimento
        </Button>
      </PageHeader>

      <FoodFilters
        filters={filters}
        onChange={updateFilters}
        onClear={clearFilters}
        categories={categories}
        sources={sources}
        tags={tags}
        brands={brands}
        resultCount={visible.length}
        totalCount={foods.length}
      />

      {/* Barra de seleção — só aparece quando há algo selecionado. */}
      {selected.size > 0 && (
        <div className="sticky top-16 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card/95 p-2.5 shadow-sm backdrop-blur">
          <span className="text-sm font-medium">
            {selected.size} selecionado{selected.size > 1 ? "s" : ""}
          </span>
          <Separator />
          <Button variant="outline" size="sm" disabled={busy} onClick={() => runBulk("favoritar")}>
            Favoritar
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => runBulk("arquivar")}>
            Arquivar
          </Button>
          {filters.showArchived && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => runBulk("restaurar")}>
              Restaurar
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            className="text-destructive"
            onClick={() => runBulk("excluir")}
          >
            Excluir
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      {visible.length === 0 ? (
        <EmptyState
          icon={Package}
          title="Nenhum alimento encontrado"
          description="Ajuste os filtros ou cadastre um alimento novo."
        />
      ) : (
        <div className="space-y-2">
          <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Checkbox
              checked={allVisibleSelected}
              onCheckedChange={(checked) => {
                setSelected(checked ? new Set(visible.map((f) => f.id)) : new Set());
              }}
              aria-label="Selecionar todos os resultados visíveis"
            />
            Selecionar os {visible.length.toLocaleString("pt-BR")} resultados do filtro
          </label>

          <ul className="divide-y rounded-xl border">
            {visible.slice(0, limit).map((food) => (
              <li key={food.id}>
                <FoodRow
                  food={food}
                  selected={selected.has(food.id)}
                  onSelect={(checked) => {
                    setSelected((current) => {
                      const next = new Set(current);
                      if (checked) next.add(food.id);
                      else next.delete(food.id);
                      return next;
                    });
                  }}
                  onOpen={() => void openDetail(food.id)}
                  onFavorite={() => void handleFavorite(food)}
                  onDuplicate={() => void handleDuplicate(food.id)}
                  onEdit={async () => {
                    const result = await fetchNutritionFoodDetail(food.id);
                    if (!result.ok) return toast.error(result.error);
                    setEditing(result.data);
                    setFormOpen(true);
                  }}
                  onDelete={() => void handleDelete(food)}
                />
              </li>
            ))}
          </ul>

          {visible.length > limit && (
            <div className="flex justify-center pt-1">
              <Button variant="outline" onClick={() => setLimit((current) => current + PAGE_SIZE)}>
                Carregar mais ({(visible.length - limit).toLocaleString("pt-BR")} restantes)
              </Button>
            </div>
          )}
        </div>
      )}

      <FoodDetailSheet
        food={detail}
        nutrients={nutrients}
        open={detailOpen}
        onOpenChange={(open) => {
          setDetailOpen(open);
          if (!open) setDetail(null);
        }}
        onEdit={() => {
          setEditing(detail);
          setFormOpen(true);
        }}
        onDuplicate={() => detail && void handleDuplicate(detail.id)}
        onToggleFavorite={() => {
          if (!detail) return;
          void toggleNutritionFavorite(detail.id, !detail.isFavorite).then((result) => {
            if (!result.ok) return toast.error(result.error);
            void refresh(detail.id);
          });
        }}
        onAddMeasure={() => {
          setEditingMeasure(null);
          setMeasureOpen(true);
        }}
        onEditMeasure={(measure) => {
          setEditingMeasure(measure);
          setMeasureOpen(true);
        }}
        onChanged={() => void refresh()}
      />

      <FoodFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        food={editing}
        categories={categories}
        sources={sources}
        nutrientList={nutrientList}
        nutrients={nutrients}
        onSaved={() => void refresh(editing?.id)}
      />

      <MeasureDialog
        open={measureOpen}
        onOpenChange={setMeasureOpen}
        food={detail}
        measure={editingMeasure}
        onSaved={() => void refresh()}
      />
    </div>
  );
}

function Separator() {
  return <span className="hidden h-4 w-px bg-border sm:block" />;
}

function FoodRow({
  food,
  selected,
  onSelect,
  onOpen,
  onFavorite,
  onDuplicate,
  onEdit,
  onDelete,
}: {
  food: FoodListItem;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onOpen: () => void;
  onFavorite: () => void;
  onDuplicate: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 transition-colors",
        selected ? "bg-primary/5" : "hover:bg-accent/50",
      )}
    >
      <Checkbox
        checked={selected}
        onCheckedChange={(checked) => onSelect(Boolean(checked))}
        aria-label={`Selecionar ${food.name}`}
        className="shrink-0"
      />

      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <p className="truncate text-sm font-medium">
          {food.name}
          {food.brand && <span className="ml-1.5 text-muted-foreground">· {food.brand}</span>}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
          <MacroChip label="kcal" value={food.macros.energiaKcal} unit="" precision={0} />
          <MacroChip label="P" value={food.macros.proteina} unit="g" />
          <MacroChip label="C" value={food.macros.carboidrato} unit="g" />
          <MacroChip label="G" value={food.macros.lipidios} unit="g" />
          <span className="text-[11px] text-muted-foreground">
            por {food.baseQuantity} {food.baseUnit}
          </span>
        </div>
      </button>

      <div className="hidden shrink-0 items-center gap-1.5 md:flex">
        {food.preparationState !== "nao_informado" && (
          <Badge variant="outline" className="text-[10px]">
            {PREPARATION_STATE_LABELS[food.preparationState]}
          </Badge>
        )}
        {!food.isSystemFood && (
          <Badge variant="secondary" className="text-[10px]">
            Meu
          </Badge>
        )}
        {food.isArchived && (
          <Badge variant="outline" className="text-[10px]">
            Arquivado
          </Badge>
        )}
      </div>

      <Button
        variant="ghost"
        size="icon"
        className="shrink-0"
        onClick={onFavorite}
        aria-label={food.isFavorite ? `Remover ${food.name} dos favoritos` : `Favoritar ${food.name}`}
        aria-pressed={food.isFavorite}
      >
        <Star className={food.isFavorite ? "size-4 fill-primary text-primary" : "size-4"} />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="shrink-0" aria-label={`Ações de ${food.name}`}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={onOpen}>Ver detalhes</DropdownMenuItem>
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy className="size-3.5" />
            Duplicar
          </DropdownMenuItem>
          {food.isEditable && (
            <>
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil className="size-3.5" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 className="size-3.5" />
                Excluir
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
