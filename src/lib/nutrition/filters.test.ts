import { describe, expect, it } from "vitest";
import {
  applyFoodFilters,
  countActiveFilters,
  distinctBrands,
  filterFoods,
  filtersFromParams,
  matchesSearch,
  normalizeText,
  paramsFromFilters,
  sortFoods,
} from "./filters";
import { EMPTY_FOOD_FILTERS, type FoodListItem } from "./types";

let seq = 0;
function food(overrides: Partial<FoodListItem> = {}): FoodListItem {
  seq += 1;
  return {
    id: `f${seq}`,
    name: `Alimento ${seq}`,
    alternativeName: null,
    brand: null,
    barcode: null,
    foodType: "alimento",
    preparationState: "nao_informado",
    baseQuantity: 100,
    baseUnit: "g",
    ediblePortionPercent: null,
    dataQuality: "analitico",
    isSystemFood: true,
    isVerified: true,
    lastVerifiedAt: "2026-08-03",
    notes: null,
    originFoodId: null,
    categoryId: "cat-cereais",
    categoryName: "Cereais e derivados",
    sourceCategoryName: null,
    source: {
      id: "src-taco",
      code: "taco-4",
      name: "TACO",
      publisher: null,
      edition: "4ª",
      version: "2011",
      referenceUrl: null,
      licenseNote: null,
      citation: null,
      isOfficial: true,
      isOwn: false,
    },
    sourceFoodCode: "1",
    sourceVersion: "2011",
    macros: {
      energiaKcal: 100,
      proteina: 5,
      carboidrato: 20,
      lipidios: 1,
      fibra: 2,
      sodio: 3,
      acucares: null,
      saturadas: null,
      nutrientsAvailable: 30,
    },
    isFavorite: false,
    isArchived: false,
    useCount: 0,
    lastUsedAt: null,
    tagIds: [],
    isEditable: false,
    createdAt: "2026-08-03T00:00:00Z",
    updatedAt: "2026-08-03T00:00:00Z",
    ...overrides,
  };
}

describe("normalizeText", () => {
  it("tira acento e caixa", () => {
    expect(normalizeText("Açúcar Mascavo")).toBe("acucar mascavo");
    expect(normalizeText("  PÃO  ")).toBe("pao");
  });
});

describe("matchesSearch", () => {
  const arroz = food({ name: "Arroz, integral, cozido", brand: "Tio João", barcode: "789123" });

  it("acha por parte do nome, sem acento", () => {
    expect(matchesSearch(arroz, "arroz")).toBe(true);
    expect(matchesSearch(arroz, "INTEGRAL")).toBe(true);
  });

  it("exige todos os termos, em qualquer ordem", () => {
    expect(matchesSearch(arroz, "arroz cozido")).toBe(true);
    expect(matchesSearch(arroz, "cozido arroz")).toBe(true);
    expect(matchesSearch(arroz, "arroz cru")).toBe(false);
  });

  it("busca por marca, código de barras e código da fonte", () => {
    expect(matchesSearch(arroz, "tio joao")).toBe(true);
    expect(matchesSearch(arroz, "789123")).toBe(true);
  });

  it("busca vazia casa com tudo", () => {
    expect(matchesSearch(arroz, "   ")).toBe(true);
  });
});

describe("filterFoods — combinação de filtros", () => {
  const itens = [
    food({ name: "Arroz cru", preparationState: "cru", macros: { ...food().macros, energiaKcal: 358, proteina: 7 } }),
    food({ name: "Arroz cozido", preparationState: "cozido", macros: { ...food().macros, energiaKcal: 128, proteina: 2.5 } }),
    food({ name: "Whey", isSystemFood: false, isEditable: true, foodType: "suplemento", brand: "Marca X", barcode: "111", macros: { ...food().macros, energiaKcal: 400, proteina: 80 } }),
  ];

  it("filtra por origem", () => {
    expect(filterFoods(itens, { ...EMPTY_FOOD_FILTERS, origin: "proprios" })).toHaveLength(1);
    expect(filterFoods(itens, { ...EMPTY_FOOD_FILTERS, origin: "sistema" })).toHaveLength(2);
  });

  it("filtra por estado de preparo (cru ≠ cozido)", () => {
    const cru = filterFoods(itens, { ...EMPTY_FOOD_FILTERS, preparationState: "cru" });
    expect(cru.map((f) => f.name)).toEqual(["Arroz cru"]);
  });

  it("filtra por presença de código de barras", () => {
    expect(filterFoods(itens, { ...EMPTY_FOOD_FILTERS, barcode: "com" })).toHaveLength(1);
    expect(filterFoods(itens, { ...EMPTY_FOOD_FILTERS, barcode: "sem" })).toHaveLength(2);
  });

  it("filtra por faixa de calorias e de proteína", () => {
    expect(
      filterFoods(itens, { ...EMPTY_FOOD_FILTERS, minKcal: 100, maxKcal: 200 }).map((f) => f.name),
    ).toEqual(["Arroz cozido"]);
    expect(
      filterFoods(itens, { ...EMPTY_FOOD_FILTERS, minProtein: 50 }).map((f) => f.name),
    ).toEqual(["Whey"]);
  });

  it("combina filtros (E lógico)", () => {
    const result = filterFoods(itens, {
      ...EMPTY_FOOD_FILTERS,
      search: "arroz",
      minKcal: 300,
    });
    expect(result.map((f) => f.name)).toEqual(["Arroz cru"]);
  });

  it("alimento SEM calorias publicadas não entra numa faixa numérica", () => {
    const semKcal = food({ name: "Sem dado", macros: { ...food().macros, energiaKcal: null } });
    expect(filterFoods([semKcal], { ...EMPTY_FOOD_FILTERS, minKcal: 0, maxKcal: 1000 })).toHaveLength(0);
    // Sem filtro de faixa, aparece normalmente.
    expect(filterFoods([semKcal], EMPTY_FOOD_FILTERS)).toHaveLength(1);
  });
});

describe("filterFoods — arquivados e favoritos", () => {
  const itens = [
    food({ name: "Ativo" }),
    food({ name: "Arquivado", isArchived: true }),
    food({ name: "Favorito", isFavorite: true }),
  ];

  it("esconde arquivados por padrão", () => {
    expect(filterFoods(itens, EMPTY_FOOD_FILTERS).map((f) => f.name)).toEqual(["Ativo", "Favorito"]);
  });

  it("mostra SÓ arquivados quando pedido", () => {
    expect(
      filterFoods(itens, { ...EMPTY_FOOD_FILTERS, showArchived: true }).map((f) => f.name),
    ).toEqual(["Arquivado"]);
  });

  it("filtra favoritos", () => {
    expect(
      filterFoods(itens, { ...EMPTY_FOOD_FILTERS, onlyFavorites: true }).map((f) => f.name),
    ).toEqual(["Favorito"]);
  });
});

describe("sortFoods", () => {
  const itens = [
    food({ name: "Banana", macros: { ...food().macros, energiaKcal: 98, proteina: 1.3 }, useCount: 5, lastUsedAt: "2026-08-01T10:00:00Z" }),
    food({ name: "Azeite", macros: { ...food().macros, energiaKcal: 884, proteina: 0 }, useCount: 1, lastUsedAt: "2026-08-02T10:00:00Z" }),
    food({ name: "Carne", macros: { ...food().macros, energiaKcal: 219, proteina: 32 }, useCount: 9, lastUsedAt: null }),
  ];

  it("por nome (pt-BR)", () => {
    expect(sortFoods(itens, "nome").map((f) => f.name)).toEqual(["Azeite", "Banana", "Carne"]);
  });

  it("por calorias", () => {
    expect(sortFoods(itens, "calorias_desc")[0].name).toBe("Azeite");
    expect(sortFoods(itens, "calorias_asc")[0].name).toBe("Banana");
  });

  it("por proteína", () => {
    expect(sortFoods(itens, "proteina_desc")[0].name).toBe("Carne");
  });

  it("por mais usados e por uso recente", () => {
    expect(sortFoods(itens, "mais_usados")[0].name).toBe("Carne");
    expect(sortFoods(itens, "recentes")[0].name).toBe("Azeite");
  });

  it("joga valores ausentes para o fim, nas duas direções", () => {
    const comNulo = [...itens, food({ name: "Sem dado", macros: { ...food().macros, energiaKcal: null } })];
    expect(sortFoods(comNulo, "calorias_desc").at(-1)?.name).toBe("Sem dado");
    expect(sortFoods(comNulo, "calorias_asc").at(-1)?.name).toBe("Sem dado");
  });

  it("não muta a lista original", () => {
    const original = [...itens];
    sortFoods(itens, "calorias_desc");
    expect(itens).toEqual(original);
  });
});

describe("applyFoodFilters", () => {
  it("sobe favoritos na ordenação por nome", () => {
    const itens = [food({ name: "Abacate" }), food({ name: "Zucchini", isFavorite: true })];
    expect(applyFoodFilters(itens, EMPTY_FOOD_FILTERS).map((f) => f.name)).toEqual([
      "Zucchini",
      "Abacate",
    ]);
  });

  it("NÃO reordena favoritos quando a ordenação é explícita", () => {
    const itens = [
      food({ name: "Abacate", macros: { ...food().macros, energiaKcal: 900 } }),
      food({ name: "Zucchini", isFavorite: true, macros: { ...food().macros, energiaKcal: 10 } }),
    ];
    expect(applyFoodFilters(itens, { ...EMPTY_FOOD_FILTERS, sort: "calorias_desc" })[0].name).toBe(
      "Abacate",
    );
  });
});

describe("countActiveFilters", () => {
  it("é zero no estado limpo", () => {
    expect(countActiveFilters(EMPTY_FOOD_FILTERS)).toBe(0);
  });

  it("conta cada filtro ativo, e a faixa como um só", () => {
    expect(countActiveFilters({ ...EMPTY_FOOD_FILTERS, search: "arroz" })).toBe(1);
    expect(countActiveFilters({ ...EMPTY_FOOD_FILTERS, minKcal: 10, maxKcal: 20 })).toBe(1);
    expect(
      countActiveFilters({ ...EMPTY_FOOD_FILTERS, search: "x", onlyFavorites: true, origin: "proprios" }),
    ).toBe(3);
  });

  it("busca só com espaços não conta", () => {
    expect(countActiveFilters({ ...EMPTY_FOOD_FILTERS, search: "   " })).toBe(0);
  });
});

describe("URL ↔ filtros", () => {
  it("ida e volta preserva o estado", () => {
    const filters = {
      ...EMPTY_FOOD_FILTERS,
      search: "arroz integral",
      categoryId: "cat-1",
      foodType: "suplemento" as const,
      preparationState: "cozido" as const,
      origin: "proprios" as const,
      onlyFavorites: true,
      barcode: "com" as const,
      minKcal: 50,
      maxProtein: 30,
      sort: "calorias_desc",
    };
    expect(filtersFromParams(paramsFromFilters(filters))).toEqual(filters);
  });

  it("estado limpo não polui a URL", () => {
    expect(paramsFromFilters(EMPTY_FOOD_FILTERS)).toEqual({});
  });

  it("parâmetro inválido cai no padrão em vez de quebrar", () => {
    const filters = filtersFromParams({ origem: "invalido", codigo: "talvez", kcal_min: "abc" });
    expect(filters.origin).toBe("todos");
    expect(filters.barcode).toBe("todos");
    expect(filters.minKcal).toBeNull();
  });

  it("aceita número com vírgula na faixa", () => {
    expect(filtersFromParams({ prot_min: "2,5" }).minProtein).toBe(2.5);
  });
});

describe("distinctBrands", () => {
  it("lista marcas únicas e ordenadas, ignorando vazias", () => {
    const itens = [
      food({ brand: "Zeta" }),
      food({ brand: "Alfa" }),
      food({ brand: "Alfa" }),
      food({ brand: "  " }),
      food({ brand: null }),
    ];
    expect(distinctBrands(itens)).toEqual(["Alfa", "Zeta"]);
  });
});
