/**
 * Fase 17-A — Treinos · Filtro, busca e ordenação do catálogo de exercícios (PURO).
 *
 * Roda em memória, não no banco: o catálogo é lido inteiro uma vez (uma consulta ampla, o
 * padrão do projeto) e todos os filtros combinam sem ida e volta ao servidor. É o que deixa a
 * busca instantânea enquanto o usuário digita — e, na academia, digitar menos importa.
 *
 * Sem `Date.now()`, sem I/O — testável direto.
 */
import type { ExerciseFilterState, ExerciseListItem } from "./types";
import { EMPTY_EXERCISE_FILTERS } from "./types";

/** Normaliza para busca: minúsculas e sem acento. */
export function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

/** Texto pesquisável: nome exibido, nome real, nome alternativo, grupo e equipamento. */
function searchableText(exercise: ExerciseListItem): string {
  return normalizeText(
    [
      exercise.displayName,
      exercise.name,
      exercise.alternativeName ?? "",
      exercise.primaryMuscleGroupName,
      exercise.equipmentName ?? "",
      ...exercise.secondaryMuscles.map((m) => m.muscleGroupName),
    ].join(" "),
  );
}

/**
 * Busca por termos: todos os pedaços precisam aparecer, em qualquer ordem.
 * "supino incl" acha "Supino inclinado com barra"; "incl supino" também.
 */
export function matchesSearch(exercise: ExerciseListItem, search: string): boolean {
  const terms = normalizeText(search).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = searchableText(exercise);
  return terms.every((term) => haystack.includes(term));
}

export function matchesFilters(
  exercise: ExerciseListItem,
  filters: ExerciseFilterState,
): boolean {
  // Arquivado é uma visão à parte: ou se vê o ativo, ou se vê o arquivado. Misturar os dois
  // faz o usuário "perder" um exercício que ele mesmo arquivou.
  if (filters.showArchived !== exercise.isArchived) return false;

  if (filters.origin === "sistema" && !exercise.isSystemExercise) return false;
  if (filters.origin === "proprios" && exercise.isSystemExercise) return false;

  if (filters.onlyFavorites && !exercise.isFavorite) return false;

  if (filters.muscleGroupId) {
    const matched = filters.includeSecondary
      ? exercise.muscleGroupIds.includes(filters.muscleGroupId)
      : exercise.primaryMuscleGroupId === filters.muscleGroupId;
    if (!matched) return false;
  }

  if (filters.equipmentId && exercise.equipmentId !== filters.equipmentId) return false;
  if (filters.equipmentCategory && exercise.equipmentCategory !== filters.equipmentCategory) {
    return false;
  }
  if (filters.movementPattern && exercise.movementPattern !== filters.movementPattern) return false;
  if (filters.trackingType && exercise.trackingType !== filters.trackingType) return false;
  if (filters.exerciseType && exercise.exerciseType !== filters.exerciseType) return false;
  if (filters.laterality && exercise.laterality !== filters.laterality) return false;

  return matchesSearch(exercise, filters.search);
}

export function filterExercises(
  exercises: ExerciseListItem[],
  filters: ExerciseFilterState,
): ExerciseListItem[] {
  return exercises.filter((exercise) => matchesFilters(exercise, filters));
}

/** Comparação de nome estável, do jeito pt-BR (acento não muda a ordem). */
const byName = (a: ExerciseListItem, b: ExerciseListItem) =>
  a.displayName.localeCompare(b.displayName, "pt-BR", { sensitivity: "base" });

export function sortExercises(
  exercises: ExerciseListItem[],
  sort: ExerciseFilterState["sort"],
): ExerciseListItem[] {
  const list = [...exercises];
  switch (sort) {
    case "grupo":
      return list.sort(
        (a, b) =>
          a.primaryMuscleGroupName.localeCompare(b.primaryMuscleGroupName, "pt-BR", {
            sensitivity: "base",
          }) || byName(a, b),
      );
    case "equipamento":
      return list.sort(
        (a, b) =>
          (a.equipmentName ?? "zzz").localeCompare(b.equipmentName ?? "zzz", "pt-BR", {
            sensitivity: "base",
          }) || byName(a, b),
      );
    case "recentes":
      return list.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt) || byName(a, b));
    case "antigos":
      return list.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt) || byName(a, b));
    default:
      return list.sort(byName);
  }
}

/**
 * Aplica filtro + ordenação. Na ordenação por nome, favoritos sobem — é o que torna o uso
 * diário rápido sem esconder o resto do catálogo.
 */
export function applyExerciseFilters(
  exercises: ExerciseListItem[],
  filters: ExerciseFilterState,
): ExerciseListItem[] {
  const sorted = sortExercises(filterExercises(exercises, filters), filters.sort);
  if (filters.sort !== "nome") return sorted;
  return [...sorted].sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite));
}

/** Quantos filtros estão ativos (para o botão "Limpar" mostrar o número). */
export function countActiveFilters(filters: ExerciseFilterState): number {
  let count = 0;
  if (filters.search.trim()) count += 1;
  if (filters.muscleGroupId) count += 1;
  if (filters.equipmentId) count += 1;
  if (filters.equipmentCategory) count += 1;
  if (filters.movementPattern) count += 1;
  if (filters.trackingType) count += 1;
  if (filters.exerciseType) count += 1;
  if (filters.laterality) count += 1;
  if (filters.origin !== "todos") count += 1;
  if (filters.onlyFavorites) count += 1;
  if (filters.showArchived) count += 1;
  return count;
}

export const hasActiveFilters = (filters: ExerciseFilterState): boolean =>
  countActiveFilters(filters) > 0;

/* ───────────────────────────── URL ↔ filtros ─────────────────────────────
 * O estado de filtro vive na URL (padrão do projeto), então voltar, recarregar ou salvar o
 * link preserva a visão. As duas funções são inversas e são testadas como tal.
 */

export function filtersFromParams(
  params: Record<string, string | undefined>,
): ExerciseFilterState {
  const origin = params.origem;
  const sort = params.ordem;
  const validSorts: ExerciseFilterState["sort"][] = [
    "nome",
    "grupo",
    "equipamento",
    "recentes",
    "antigos",
  ];
  return {
    ...EMPTY_EXERCISE_FILTERS,
    search: params.q ?? "",
    muscleGroupId: params.grupo || null,
    // O padrão é incluir secundários; a URL só carrega a exceção.
    includeSecondary: params.so_principal !== "1",
    equipmentId: params.equipamento || null,
    equipmentCategory: (params.categoria as ExerciseFilterState["equipmentCategory"]) || null,
    movementPattern: (params.padrao as ExerciseFilterState["movementPattern"]) || null,
    trackingType: (params.medicao as ExerciseFilterState["trackingType"]) || null,
    exerciseType: (params.tipo as ExerciseFilterState["exerciseType"]) || null,
    laterality: (params.lado as ExerciseFilterState["laterality"]) || null,
    origin: origin === "sistema" || origin === "proprios" ? origin : "todos",
    onlyFavorites: params.favoritos === "1",
    showArchived: params.arquivados === "1",
    sort: validSorts.includes(sort as ExerciseFilterState["sort"])
      ? (sort as ExerciseFilterState["sort"])
      : "nome",
  };
}

/** Só emite o que difere do padrão — a URL fica curta e legível. */
export function paramsFromFilters(filters: ExerciseFilterState): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.search.trim()) params.q = filters.search.trim();
  if (filters.muscleGroupId) params.grupo = filters.muscleGroupId;
  if (!filters.includeSecondary) params.so_principal = "1";
  if (filters.equipmentId) params.equipamento = filters.equipmentId;
  if (filters.equipmentCategory) params.categoria = filters.equipmentCategory;
  if (filters.movementPattern) params.padrao = filters.movementPattern;
  if (filters.trackingType) params.medicao = filters.trackingType;
  if (filters.exerciseType) params.tipo = filters.exerciseType;
  if (filters.laterality) params.lado = filters.laterality;
  if (filters.origin !== "todos") params.origem = filters.origin;
  if (filters.onlyFavorites) params.favoritos = "1";
  if (filters.showArchived) params.arquivados = "1";
  if (filters.sort !== "nome") params.ordem = filters.sort;
  return params;
}

/**
 * Contagem por grupo muscular **principal** dentro da lista já filtrada — alimenta o número
 * ao lado de cada opção do filtro.
 */
export function countByMuscleGroup(exercises: ExerciseListItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const exercise of exercises) {
    counts[exercise.primaryMuscleGroupId] = (counts[exercise.primaryMuscleGroupId] ?? 0) + 1;
  }
  return counts;
}
