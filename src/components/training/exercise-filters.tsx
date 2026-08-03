"use client";

/**
 * Fase 17-A — Treinos · Barra de filtros do catálogo de exercícios.
 *
 * A busca fica sempre visível (é o que mais se usa) e o resto vive num painel que abre — no
 * celular a tela não pode ser tomada por 10 seletores. O botão traz o número de filtros
 * ativos, então nunca acontece de a lista parecer vazia por causa de um filtro esquecido.
 */
import * as React from "react";
import { Filter, Search, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EQUIPMENT_CATEGORIES,
  EQUIPMENT_CATEGORY_LABELS,
  EXERCISE_TYPES,
  EXERCISE_TYPE_LABELS,
  LATERALITIES,
  LATERALITY_LABELS,
  MOVEMENT_PATTERNS,
  MOVEMENT_PATTERN_LABELS,
  TRACKING_TYPES,
  TRACKING_TYPE_LABELS,
} from "@/lib/training/constants";
import { countActiveFilters } from "@/lib/training/filters";
import type {
  Equipment,
  ExerciseFilterState,
  MuscleGroup,
} from "@/lib/training/types";

/** Valor sentinela: o Select do Radix não aceita item com valor "". */
const ALL = "__todos__";

export function ExerciseFilters({
  filters,
  groups,
  equipment,
  total,
  visible,
  onChange,
  onClear,
}: {
  filters: ExerciseFilterState;
  groups: MuscleGroup[];
  equipment: Equipment[];
  total: number;
  visible: number;
  onChange: (patch: Partial<ExerciseFilterState>) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const activeCount = countActiveFilters(filters);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(event) => onChange({ search: event.target.value })}
            placeholder="Buscar exercício, grupo ou equipamento…"
            aria-label="Buscar exercício"
            className="h-10 pl-9"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => onChange({ search: "" })}
              aria-label="Limpar busca"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={activeCount > 0 ? "default" : "outline"}
            size="sm"
            className="h-10"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            <Filter className="size-4" />
            Filtros
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-1 px-1.5 tabular-nums">
                {activeCount}
              </Badge>
            )}
          </Button>

          <Select
            value={filters.sort}
            onValueChange={(value) => onChange({ sort: value as ExerciseFilterState["sort"] })}
          >
            <SelectTrigger className="h-10 w-[150px]" aria-label="Ordenar">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="nome">Nome (A–Z)</SelectItem>
              <SelectItem value="grupo">Grupo muscular</SelectItem>
              <SelectItem value="equipamento">Equipamento</SelectItem>
              <SelectItem value="recentes">Mais recentes</SelectItem>
              <SelectItem value="antigos">Mais antigos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <p className="text-xs text-muted-foreground" aria-live="polite">
        {visible === total
          ? `${total} ${total === 1 ? "exercício" : "exercícios"}`
          : `${visible} de ${total} exercícios`}
        {filters.showArchived && " · mostrando arquivados"}
      </p>

      {open && (
        <div className="grid gap-3 rounded-xl border bg-card/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <FilterSelect
            label="Grupo muscular"
            value={filters.muscleGroupId}
            onChange={(value) => onChange({ muscleGroupId: value })}
            options={groups.map((group) => ({ value: group.id, label: group.name }))}
          />

          <FilterSelect
            label="Equipamento"
            value={filters.equipmentId}
            onChange={(value) => onChange({ equipmentId: value })}
            options={equipment.map((item) => ({ value: item.id, label: item.name }))}
          />

          <FilterSelect
            label="Categoria de equipamento"
            value={filters.equipmentCategory}
            onChange={(value) =>
              onChange({ equipmentCategory: value as ExerciseFilterState["equipmentCategory"] })
            }
            options={EQUIPMENT_CATEGORIES.map((value) => ({
              value,
              label: EQUIPMENT_CATEGORY_LABELS[value],
            }))}
          />

          <FilterSelect
            label="Padrão de movimento"
            value={filters.movementPattern}
            onChange={(value) =>
              onChange({ movementPattern: value as ExerciseFilterState["movementPattern"] })
            }
            options={MOVEMENT_PATTERNS.map((value) => ({
              value,
              label: MOVEMENT_PATTERN_LABELS[value],
            }))}
          />

          <FilterSelect
            label="Tipo de acompanhamento"
            value={filters.trackingType}
            onChange={(value) =>
              onChange({ trackingType: value as ExerciseFilterState["trackingType"] })
            }
            options={TRACKING_TYPES.map((value) => ({
              value,
              label: TRACKING_TYPE_LABELS[value],
            }))}
          />

          <FilterSelect
            label="Tipo de exercício"
            value={filters.exerciseType}
            onChange={(value) =>
              onChange({ exerciseType: value as ExerciseFilterState["exerciseType"] })
            }
            options={EXERCISE_TYPES.map((value) => ({
              value,
              label: EXERCISE_TYPE_LABELS[value],
            }))}
          />

          <FilterSelect
            label="Lateralidade"
            value={filters.laterality}
            onChange={(value) =>
              onChange({ laterality: value as ExerciseFilterState["laterality"] })
            }
            options={LATERALITIES.map((value) => ({ value, label: LATERALITY_LABELS[value] }))}
          />

          <FilterSelect
            label="Origem"
            value={filters.origin === "todos" ? null : filters.origin}
            onChange={(value) =>
              onChange({ origin: (value ?? "todos") as ExerciseFilterState["origin"] })
            }
            options={[
              { value: "sistema", label: "Base do sistema" },
              { value: "proprios", label: "Meus exercícios" },
            ]}
          />

          <div className="space-y-3 sm:col-span-2 lg:col-span-3">
            <ToggleRow
              id="filtro-favoritos"
              label="Somente favoritos"
              checked={filters.onlyFavorites}
              onChange={(checked) => onChange({ onlyFavorites: checked })}
            />
            <ToggleRow
              id="filtro-secundarios"
              label="Grupo muscular alcança os secundários"
              hint="Desligado, o filtro de grupo só considera o músculo principal."
              checked={filters.includeSecondary}
              onChange={(checked) => onChange({ includeSecondary: checked })}
            />
            <ToggleRow
              id="filtro-arquivados"
              label="Ver arquivados"
              hint="Mostra só os arquivados — é uma visão à parte, não um acréscimo à lista."
              checked={filters.showArchived}
              onChange={(checked) => onChange({ showArchived: checked })}
            />
          </div>

          {activeCount > 0 && (
            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="button" variant="ghost" size="sm" onClick={onClear}>
                <X className="size-4" />
                Limpar {activeCount} {activeCount === 1 ? "filtro" : "filtros"}
              </Button>
            </div>
          )}
        </div>
      )}
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
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select
        value={value ?? ALL}
        onValueChange={(next) => onChange(next === ALL ? null : next)}
      >
        <SelectTrigger className="h-9 w-full" aria-label={label}>
          <SelectValue />
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
    </div>
  );
}

function ToggleRow({
  id,
  label,
  hint,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-sm font-normal">
          {label}
        </Label>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
