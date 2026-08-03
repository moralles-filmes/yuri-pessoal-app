"use client";

/**
 * Fase 16-A — Dieta e Alimentação · Barra de filtros do catálogo.
 *
 * O que fica sempre visível é o que se usa todo dia (busca, ordenação, atalhos de origem e
 * favoritos). O resto vai para um painel — 13 filtros abertos de uma vez viram ruído.
 *
 * O estado mora na URL (`filtersFromParams`/`paramsFromFilters`), então voltar, recarregar
 * ou compartilhar o link preserva exatamente a mesma visão.
 */
import * as React from "react";
import { Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  FOOD_SORTS,
  FOOD_SORT_LABELS,
  FOOD_TYPES,
  FOOD_TYPE_LABELS,
  PREPARATION_STATES,
  PREPARATION_STATE_LABELS,
} from "@/lib/nutrition/constants";
import { countActiveFilters } from "@/lib/nutrition/filters";
import type { FoodCategory, FoodFilterState, FoodSource, FoodTag } from "@/lib/nutrition/types";

/** Radix Select não aceita valor vazio; "__all__" é o sentinela de "sem filtro". */
const ALL = "__all__";

const toValue = (value: string | null) => value ?? ALL;
const fromValue = (value: string) => (value === ALL ? null : value);

export function FoodFilters({
  filters,
  onChange,
  onClear,
  categories,
  sources,
  tags,
  brands,
  resultCount,
  totalCount,
}: {
  filters: FoodFilterState;
  onChange: (patch: Partial<FoodFilterState>) => void;
  onClear: () => void;
  categories: FoodCategory[];
  sources: FoodSource[];
  tags: FoodTag[];
  brands: string[];
  resultCount: number;
  totalCount: number;
}) {
  const activeCount = countActiveFilters(filters);

  const numberField = (
    key: keyof FoodFilterState,
    placeholder: string,
  ) => (
    <Input
      type="number"
      inputMode="decimal"
      min={0}
      placeholder={placeholder}
      value={(filters[key] as number | null) ?? ""}
      onChange={(event) => {
        const raw = event.target.value;
        onChange({ [key]: raw === "" ? null : Number(raw) } as Partial<FoodFilterState>);
      }}
      className="h-9"
    />
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Buscar por nome, marca ou código de barras…"
            aria-label="Buscar alimento"
            className="h-10 pl-9"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ search: "" })}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Select value={filters.sort} onValueChange={(value) => onChange({ sort: value })}>
            <SelectTrigger className="h-10 w-full sm:w-[190px]" aria-label="Ordenar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FOOD_SORTS.map((sort) => (
                <SelectItem key={sort} value={sort}>
                  {FOOD_SORT_LABELS[sort]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="h-10 shrink-0 gap-2">
                <SlidersHorizontal className="size-4" />
                Filtros
                {activeCount > 0 && (
                  <Badge variant="secondary" className="ml-0.5 h-5 min-w-5 justify-center px-1">
                    {activeCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(22rem,calc(100vw-2rem))] space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Categoria</Label>
                <Select
                  value={toValue(filters.categoryId)}
                  onValueChange={(value) => onChange({ categoryId: fromValue(value) })}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Todas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Todas</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Tipo</Label>
                  <Select
                    value={toValue(filters.foodType)}
                    onValueChange={(value) =>
                      onChange({ foodType: fromValue(value) as FoodFilterState["foodType"] })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos</SelectItem>
                      {FOOD_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {FOOD_TYPE_LABELS[type]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Preparo</Label>
                  <Select
                    value={toValue(filters.preparationState)}
                    onValueChange={(value) =>
                      onChange({
                        preparationState: fromValue(value) as FoodFilterState["preparationState"],
                      })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todos</SelectItem>
                      {PREPARATION_STATES.map((state) => (
                        <SelectItem key={state} value={state}>
                          {PREPARATION_STATE_LABELS[state]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Fonte</Label>
                  <Select
                    value={toValue(filters.sourceId)}
                    onValueChange={(value) => onChange({ sourceId: fromValue(value) })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas</SelectItem>
                      {sources.map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          {source.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Código de barras</Label>
                  <Select
                    value={filters.barcode}
                    onValueChange={(value) =>
                      onChange({ barcode: value as FoodFilterState["barcode"] })
                    }
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      <SelectItem value="com">Com código</SelectItem>
                      <SelectItem value="sem">Sem código</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {brands.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">Marca</Label>
                  <Select
                    value={toValue(filters.brand)}
                    onValueChange={(value) => onChange({ brand: fromValue(value) })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas</SelectItem>
                      {brands.map((brand) => (
                        <SelectItem key={brand} value={brand}>
                          {brand}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {tags.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-xs">Etiqueta</Label>
                  <Select
                    value={toValue(filters.tagId)}
                    onValueChange={(value) => onChange({ tagId: fromValue(value) })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL}>Todas</SelectItem>
                      {tags.map((tag) => (
                        <SelectItem key={tag.id} value={tag.id}>
                          {tag.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">Calorias por 100 g/ml (kcal)</Label>
                <div className="flex items-center gap-2">
                  {numberField("minKcal", "mín.")}
                  <span className="text-xs text-muted-foreground">até</span>
                  {numberField("maxKcal", "máx.")}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Proteína por 100 g/ml (g)</Label>
                <div className="flex items-center gap-2">
                  {numberField("minProtein", "mín.")}
                  <span className="text-xs text-muted-foreground">até</span>
                  {numberField("maxProtein", "máx.")}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="filtro-arquivados" className="text-xs">
                    Ver arquivados
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Mostra somente os arquivados.
                  </p>
                </div>
                <Switch
                  id="filtro-arquivados"
                  checked={filters.showArchived}
                  onCheckedChange={(checked) => onChange({ showArchived: checked })}
                />
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={onClear}
                disabled={activeCount === 0}
                className="w-full"
              >
                Limpar filtros
              </Button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Atalhos de uso diário — um toque, sem abrir painel. */}
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip
          active={filters.onlyFavorites}
          onClick={() => onChange({ onlyFavorites: !filters.onlyFavorites })}
        >
          Favoritos
        </FilterChip>
        <FilterChip
          active={filters.origin === "proprios"}
          onClick={() =>
            onChange({ origin: filters.origin === "proprios" ? "todos" : "proprios" })
          }
        >
          Meus alimentos
        </FilterChip>
        <FilterChip
          active={filters.origin === "sistema"}
          onClick={() => onChange({ origin: filters.origin === "sistema" ? "todos" : "sistema" })}
        >
          Base do sistema
        </FilterChip>

        <span className="ml-auto text-xs text-muted-foreground" aria-live="polite">
          {resultCount === totalCount
            ? `${totalCount.toLocaleString("pt-BR")} alimentos`
            : `${resultCount.toLocaleString("pt-BR")} de ${totalCount.toLocaleString("pt-BR")} alimentos`}
        </span>
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "border-primary/30 bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {active && <Filter className="size-3" />}
      {children}
    </button>
  );
}
