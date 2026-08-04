import { describe, expect, it } from "vitest";
import {
  applyExerciseFilters,
  countActiveFilters,
  countByMuscleGroup,
  exercisePickerFilters,
  filterExercises,
  filtersFromParams,
  hasActiveFilters,
  matchesSearch,
  normalizeText,
  paramsFromFilters,
  sortExercises,
} from "./filters";
import { EMPTY_EXERCISE_FILTERS, type ExerciseListItem } from "./types";

function makeExercise(overrides: Partial<ExerciseListItem> = {}): ExerciseListItem {
  const name = overrides.name ?? "Supino reto com barra";
  return {
    id: overrides.id ?? name,
    userId: null,
    displayName: overrides.displayName ?? name,
    name,
    alternativeName: null,
    description: null,
    primaryMuscleGroupId: "g-peitoral",
    primaryMuscleGroupName: "Peitoral",
    primaryMuscleRegion: "superior",
    secondaryMuscles: [],
    muscleGroupIds: ["g-peitoral"],
    equipmentId: "e-barra",
    equipmentName: "Barra",
    equipmentCategory: "livre",
    movementPattern: "empurrar_horizontal",
    exerciseType: "forca",
    trackingType: "peso_reps",
    laterality: "bilateral",
    instructions: null,
    tips: null,
    commonMistakes: null,
    notes: null,
    imageUrl: null,
    videoUrl: null,
    restSeconds: 90,
    incrementKg: 2.5,
    isSystemExercise: true,
    isVerified: true,
    source: "sistema",
    systemCode: "supino_reto_barra",
    originExerciseId: null,
    isFavorite: false,
    isArchived: false,
    isEditable: false,
    customName: null,
    prefNotes: null,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    ...overrides,
  };
}

const supino = makeExercise();
const inclinado = makeExercise({
  id: "inclinado",
  name: "Supino inclinado com halteres",
  equipmentId: "e-halteres",
  equipmentName: "Halteres",
});
const prancha = makeExercise({
  id: "prancha",
  name: "Prancha",
  primaryMuscleGroupId: "g-abdomen",
  primaryMuscleGroupName: "Abdômen",
  primaryMuscleRegion: "tronco",
  muscleGroupIds: ["g-abdomen", "g-lombar"],
  secondaryMuscles: [
    { muscleGroupId: "g-lombar", muscleGroupName: "Lombar", role: "secundario", position: 0 },
  ],
  equipmentId: "e-corporal",
  equipmentName: "Peso corporal",
  equipmentCategory: "corporal",
  movementPattern: "estabilizacao",
  exerciseType: "isometrico",
  trackingType: "duracao",
});
const meuExercicio = makeExercise({
  id: "meu",
  name: "Rosca 21 do meu jeito",
  userId: "user-1",
  isSystemExercise: false,
  isVerified: false,
  source: "usuario",
  systemCode: null,
  isEditable: true,
  isFavorite: true,
  primaryMuscleGroupId: "g-biceps",
  primaryMuscleGroupName: "Bíceps",
  muscleGroupIds: ["g-biceps"],
  movementPattern: "flexao_cotovelo",
  createdAt: "2026-08-03T10:00:00.000Z",
});
const arquivado = makeExercise({
  id: "arquivado",
  name: "Voador peitoral",
  isArchived: true,
});

const ALL = [supino, inclinado, prancha, meuExercicio, arquivado];

describe("normalizeText e busca", () => {
  it("remove acento e caixa", () => {
    expect(normalizeText("Abdômen")).toBe("abdomen");
    expect(normalizeText("  Tríceps  ")).toBe("triceps");
  });

  it("acha por prefixo parcial de vários termos", () => {
    expect(matchesSearch(inclinado, "supino incl")).toBe(true);
  });

  it("a ordem dos termos não importa", () => {
    expect(matchesSearch(inclinado, "incl supino")).toBe(true);
  });

  it("busca sem acento acha nome com acento", () => {
    expect(matchesSearch(meuExercicio, "biceps")).toBe(true);
  });

  it("busca alcança o grupo muscular secundário", () => {
    expect(matchesSearch(prancha, "lombar")).toBe(true);
  });

  it("termo que não existe não casa", () => {
    expect(matchesSearch(supino, "agachamento")).toBe(false);
  });

  it("busca vazia casa com tudo", () => {
    expect(matchesSearch(supino, "   ")).toBe(true);
  });
});

describe("filtros", () => {
  it("por padrão esconde os arquivados", () => {
    const result = filterExercises(ALL, EMPTY_EXERCISE_FILTERS);
    expect(result.map((e) => e.id)).not.toContain("arquivado");
    expect(result).toHaveLength(4);
  });

  it("a visão de arquivados mostra SÓ os arquivados", () => {
    const result = filterExercises(ALL, { ...EMPTY_EXERCISE_FILTERS, showArchived: true });
    expect(result.map((e) => e.id)).toEqual(["arquivado"]);
  });

  it("filtra por origem: base do sistema", () => {
    const result = filterExercises(ALL, { ...EMPTY_EXERCISE_FILTERS, origin: "sistema" });
    expect(result.every((e) => e.isSystemExercise)).toBe(true);
    expect(result.map((e) => e.id)).not.toContain("meu");
  });

  it("filtra por origem: meus exercícios", () => {
    const result = filterExercises(ALL, { ...EMPTY_EXERCISE_FILTERS, origin: "proprios" });
    expect(result.map((e) => e.id)).toEqual(["meu"]);
  });

  it("filtra por favoritos", () => {
    const result = filterExercises(ALL, { ...EMPTY_EXERCISE_FILTERS, onlyFavorites: true });
    expect(result.map((e) => e.id)).toEqual(["meu"]);
  });

  it("grupo muscular alcança os secundários por padrão", () => {
    const result = filterExercises(ALL, { ...EMPTY_EXERCISE_FILTERS, muscleGroupId: "g-lombar" });
    expect(result.map((e) => e.id)).toEqual(["prancha"]);
  });

  it("com 'só principal', o grupo secundário deixa de casar", () => {
    const result = filterExercises(ALL, {
      ...EMPTY_EXERCISE_FILTERS,
      muscleGroupId: "g-lombar",
      includeSecondary: false,
    });
    expect(result).toHaveLength(0);
  });

  it("o picker do treino filtra pelo grupo PRINCIPAL, nunca pelos secundários", () => {
    // O diálogo de adicionar exercício ao treino não tem o toggle que o catálogo tem. Se ele
    // voltar a herdar o padrão (`includeSecondary: true`), escolher um grupo traz de novo todo
    // exercício que apenas recruta aquele músculo como secundário.
    const filters = exercisePickerFilters({
      search: "",
      muscleGroupId: "g-lombar",
      onlyFavorites: false,
    });
    expect(filters.includeSecondary).toBe(false);
    expect(filterExercises(ALL, filters)).toHaveLength(0);
  });

  it("o picker do treino não arrasta arquivados nem favoritos por engano", () => {
    const filters = exercisePickerFilters({
      search: "",
      muscleGroupId: null,
      onlyFavorites: false,
    });
    expect(filters.showArchived).toBe(false);
    expect(filters.onlyFavorites).toBe(false);
  });

  it("filtra por equipamento, categoria, padrão, medição, tipo e lateralidade", () => {
    const base = EMPTY_EXERCISE_FILTERS;
    expect(filterExercises(ALL, { ...base, equipmentId: "e-halteres" })).toHaveLength(1);
    expect(filterExercises(ALL, { ...base, equipmentCategory: "corporal" })).toHaveLength(1);
    expect(filterExercises(ALL, { ...base, movementPattern: "estabilizacao" })).toHaveLength(1);
    expect(filterExercises(ALL, { ...base, trackingType: "duracao" })).toHaveLength(1);
    expect(filterExercises(ALL, { ...base, exerciseType: "isometrico" })).toHaveLength(1);
    expect(filterExercises(ALL, { ...base, laterality: "bilateral" })).toHaveLength(4);
  });

  it("filtros combinam entre si", () => {
    const result = filterExercises(ALL, {
      ...EMPTY_EXERCISE_FILTERS,
      search: "supino",
      equipmentId: "e-barra",
      origin: "sistema",
    });
    expect(result.map((e) => e.id)).toEqual([supino.id]);
  });

  it("combinação sem interseção devolve lista vazia, não tudo", () => {
    const result = filterExercises(ALL, {
      ...EMPTY_EXERCISE_FILTERS,
      trackingType: "duracao",
      equipmentId: "e-barra",
    });
    expect(result).toHaveLength(0);
  });
});

describe("contagem de filtros ativos", () => {
  it("estado vazio não tem filtro ativo", () => {
    expect(countActiveFilters(EMPTY_EXERCISE_FILTERS)).toBe(0);
    expect(hasActiveFilters(EMPTY_EXERCISE_FILTERS)).toBe(false);
  });

  it("conta cada filtro uma vez", () => {
    const filters = {
      ...EMPTY_EXERCISE_FILTERS,
      search: "supino",
      muscleGroupId: "g-peitoral",
      equipmentId: "e-barra",
      origin: "sistema" as const,
      onlyFavorites: true,
    };
    expect(countActiveFilters(filters)).toBe(5);
    expect(hasActiveFilters(filters)).toBe(true);
  });

  it("busca só de espaços não conta", () => {
    expect(countActiveFilters({ ...EMPTY_EXERCISE_FILTERS, search: "   " })).toBe(0);
  });
});

describe("ordenação", () => {
  it("por nome, ignorando acento", () => {
    const sorted = sortExercises([prancha, supino, meuExercicio], "nome");
    expect(sorted.map((e) => e.displayName)).toEqual([
      "Prancha",
      "Rosca 21 do meu jeito",
      "Supino reto com barra",
    ]);
  });

  it("por grupo muscular", () => {
    const sorted = sortExercises([supino, prancha, meuExercicio], "grupo");
    expect(sorted[0].primaryMuscleGroupName).toBe("Abdômen");
  });

  it("por mais recentes", () => {
    const sorted = sortExercises([supino, meuExercicio], "recentes");
    expect(sorted[0].id).toBe("meu");
  });

  it("por mais antigos inverte", () => {
    const sorted = sortExercises([meuExercicio, supino], "antigos");
    expect(sorted[0].id).toBe(supino.id);
  });

  it("favoritos sobem na ordenação por nome", () => {
    const result = applyExerciseFilters(ALL, EMPTY_EXERCISE_FILTERS);
    expect(result[0].id).toBe("meu");
  });

  it("favoritos NÃO sobem em outras ordenações (a ordem escolhida manda)", () => {
    const result = applyExerciseFilters(ALL, { ...EMPTY_EXERCISE_FILTERS, sort: "grupo" });
    expect(result[0].primaryMuscleGroupName).toBe("Abdômen");
  });
});

describe("URL ↔ filtros (ida e volta)", () => {
  it("estado vazio não gera nenhum parâmetro", () => {
    expect(paramsFromFilters(EMPTY_EXERCISE_FILTERS)).toEqual({});
  });

  it("parâmetros vazios voltam ao estado padrão", () => {
    expect(filtersFromParams({})).toEqual(EMPTY_EXERCISE_FILTERS);
  });

  it("ida e volta preserva todos os campos", () => {
    const filters = {
      ...EMPTY_EXERCISE_FILTERS,
      search: "supino",
      muscleGroupId: "g-peitoral",
      includeSecondary: false,
      equipmentId: "e-barra",
      equipmentCategory: "livre" as const,
      movementPattern: "empurrar_horizontal" as const,
      trackingType: "peso_reps" as const,
      exerciseType: "forca" as const,
      laterality: "bilateral" as const,
      origin: "proprios" as const,
      onlyFavorites: true,
      showArchived: true,
      sort: "grupo" as const,
    };
    expect(filtersFromParams(paramsFromFilters(filters))).toEqual(filters);
  });

  it("valor de ordenação inválido cai no padrão em vez de quebrar", () => {
    expect(filtersFromParams({ ordem: "sei-la" }).sort).toBe("nome");
  });

  it("origem inválida cai em 'todos'", () => {
    expect(filtersFromParams({ origem: "hacker" }).origin).toBe("todos");
  });

  it("a URL só carrega a exceção de 'incluir secundários'", () => {
    expect(paramsFromFilters(EMPTY_EXERCISE_FILTERS).so_principal).toBeUndefined();
    expect(
      paramsFromFilters({ ...EMPTY_EXERCISE_FILTERS, includeSecondary: false }).so_principal,
    ).toBe("1");
  });
});

describe("countByMuscleGroup", () => {
  it("conta pelo grupo principal", () => {
    expect(countByMuscleGroup([supino, inclinado, prancha])).toEqual({
      "g-peitoral": 2,
      "g-abdomen": 1,
    });
  });

  it("lista vazia devolve objeto vazio", () => {
    expect(countByMuscleGroup([])).toEqual({});
  });
});
