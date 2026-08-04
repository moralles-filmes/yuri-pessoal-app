/**
 * Fase 16-D — Testes da lista de compras e da despensa.
 *
 * O teste que mais importa está em "unidades incompatíveis": ele é a prova de que a lista
 * NUNCA soma 300 g com 2 unidades. Todo o resto do módulo depende dessa disciplina, e um
 * arredondamento "prático" aqui contaminaria a compra inteira.
 *
 * Nenhum teste toca o banco e nenhum depende do fuso: as datas são texto puro.
 */
import { describe, expect, it } from "vitest";
import {
  canonicalUnit,
  consolidateShoppingItems,
  convertPantryAmount,
  duplicateShoppingItems,
  duplicateShoppingListDraft,
  filterShoppingItems,
  findRecurringList,
  formatShoppingQuantity,
  groupItemsByCategory,
  pantryPatches,
  planRegeneration,
  previewPantryDiscount,
  selectionInScope,
  shoppingBucket,
  shoppingListToText,
  shoppingRecurrenceKey,
  shoppingSubjectKey,
  sortShoppingItems,
  summarizeShoppingList,
  unitFamily,
  type ConsolidatedItem,
  type PantryStock,
  type ShoppingSourceItem,
} from "./shopping";
import { EMPTY_SHOPPING_FILTERS } from "./shopping";
import type { MarketCategory, ShoppingListItem, ShoppingOrigin } from "./types";

/* ───────────────────────────── Fábricas ───────────────────────────── */

const ARROZ = "11111111-1111-1111-1111-111111111111";
const LEITE = "22222222-2222-2222-2222-222222222222";
const TOMATE = "33333333-3333-3333-3333-333333333333";

function origem(label: string, extra: Partial<ShoppingOrigin> = {}): ShoppingOrigin {
  return {
    kind: "planejamento",
    label,
    date: null,
    recipeId: null,
    plannedMealId: null,
    quantity: null,
    unit: "g",
    ...extra,
  };
}

function fonte(partial: Partial<ShoppingSourceItem> & { label: string }): ShoppingSourceItem {
  return {
    subjectKey: shoppingSubjectKey(partial.foodId ?? null, partial.label),
    foodId: null,
    recipeId: null,
    brand: null,
    categoryId: null,
    quantity: null,
    unit: "g",
    baseAmount: null,
    baseUnit: null,
    origin: origem(partial.label),
    ...partial,
  };
}

function item(partial: Partial<ShoppingListItem> & { id: string; label: string }): ShoppingListItem {
  return {
    listId: "lista",
    categoryId: null,
    categoryName: null,
    foodId: null,
    recipeId: null,
    brand: null,
    quantity: 100,
    unit: "g",
    consolidationKey: null,
    quantityOverridden: false,
    origins: [],
    separateReason: null,
    isManual: true,
    status: "pendente",
    priority: "normal",
    estimatedPriceCents: null,
    actualPriceCents: null,
    store: null,
    note: null,
    position: 0,
    purchasedAt: null,
    ...partial,
  };
}

/* ═══════════════════════════ Unidades ═══════════════════════════ */

describe("unidades", () => {
  it("reconhece sinônimos digitados pelo usuário", () => {
    expect(canonicalUnit("Kg")).toBe("kg");
    expect(canonicalUnit("Quilos")).toBe("kg");
    expect(canonicalUnit("UNIDADES")).toBe("un");
    expect(canonicalUnit("Litro")).toBe("l");
  });

  it("classifica a família — contagem não é massa", () => {
    expect(unitFamily("kg")).toBe("massa");
    expect(unitFamily("L")).toBe("volume");
    expect(unitFamily("un")).toBe("unidade");
    expect(unitFamily("colher de sopa")).toBe("medida");
  });

  it("formata para leitura sem alterar o valor guardado", () => {
    expect(formatShoppingQuantity(1400, "g")).toBe("1,4 kg");
    expect(formatShoppingQuantity(900, "g")).toBe("900 g");
    expect(formatShoppingQuantity(2000, "ml")).toBe("2 L");
    expect(formatShoppingQuantity(3, "un")).toBe("3 un");
  });

  it("quantidade nula é “a gosto”, nunca zero", () => {
    expect(formatShoppingQuantity(null, "g")).toBe("a gosto");
  });

  it("o balde usa a conversão já resolvida quando ela existe", () => {
    expect(shoppingBucket({ quantity: 1, unit: "xícara", baseAmount: 160, baseUnit: "g" })).toEqual({
      key: "base:g",
      amount: 160,
      unit: "g",
      family: "massa",
    });
  });

  it("o balde separa a medida caseira sem conversão", () => {
    expect(
      shoppingBucket({ quantity: 1, unit: "xícara", baseAmount: null, baseUnit: null }).key,
    ).toBe("medida:xicara");
  });
});

/* ═══════════════════════════ Consolidação ═══════════════════════════ */

describe("consolidação", () => {
  it("soma itens iguais numa linha só, preservando as origens", () => {
    const { items, splits } = consolidateShoppingItems([
      fonte({
        label: "Arroz",
        foodId: ARROZ,
        quantity: 200,
        unit: "g",
        baseAmount: 200,
        baseUnit: "g",
        origin: origem("Almoço · 05/08"),
      }),
      fonte({
        label: "Arroz",
        foodId: ARROZ,
        quantity: 100,
        unit: "g",
        baseAmount: 100,
        baseUnit: "g",
        origin: origem("Jantar · 05/08"),
      }),
    ]);

    expect(splits).toHaveLength(0);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(300);
    expect(items[0].unit).toBe("g");
    expect(items[0].mergedFrom).toBe(2);
    expect(items[0].origins.map((o) => o.label)).toEqual(["Almoço · 05/08", "Jantar · 05/08"]);
    expect(items[0].separateReason).toBeNull();
  });

  it("converte g com kg (fator exato) e soma", () => {
    const { items } = consolidateShoppingItems([
      fonte({ label: "Arroz", foodId: ARROZ, quantity: 500, unit: "g" }),
      fonte({ label: "Arroz", foodId: ARROZ, quantity: 1, unit: "kg" }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(1500);
    expect(items[0].unit).toBe("g");
  });

  it("converte ml com L e soma", () => {
    const { items } = consolidateShoppingItems([
      fonte({ label: "Leite", foodId: LEITE, quantity: 300, unit: "ml" }),
      fonte({ label: "Leite", foodId: LEITE, quantity: 1, unit: "L" }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(1300);
    expect(items[0].unit).toBe("ml");
  });

  it("medida caseira COM gramas cadastradas soma com a linha em gramas", () => {
    const { items, splits } = consolidateShoppingItems([
      fonte({
        label: "Arroz",
        foodId: ARROZ,
        quantity: 200,
        unit: "g",
        baseAmount: 200,
        baseUnit: "g",
      }),
      // 1 xícara deste arroz pesa 160 g — a conversão existe e foi resolvida na leitura.
      fonte({
        label: "Arroz",
        foodId: ARROZ,
        quantity: 1,
        unit: "xícara",
        baseAmount: 160,
        baseUnit: "g",
      }),
    ]);

    expect(splits).toHaveLength(0);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(360);
  });

  /* ⛔ O TESTE MAIS IMPORTANTE DA SUBFASE */
  it("NÃO soma unidades incompatíveis: 200 g + 1 xícara sem conversão viram duas linhas", () => {
    const { items, splits } = consolidateShoppingItems([
      fonte({
        label: "Arroz",
        foodId: ARROZ,
        quantity: 200,
        unit: "g",
        baseAmount: 200,
        baseUnit: "g",
      }),
      fonte({ label: "Arroz", foodId: ARROZ, quantity: 1, unit: "xícara" }),
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.quantity).sort()).toEqual([1, 200]);
    expect(items.every((i) => i.separateReason !== null)).toBe(true);
    expect(items[0].separateReason).toContain("não se convertem entre si");
    expect(splits).toHaveLength(1);
    expect(splits[0].units).toEqual(["g", "xícara"]);
  });

  it("NÃO soma “2 unidades” com “300 g” — o risco nomeado na subfase", () => {
    const { items } = consolidateShoppingItems([
      fonte({
        label: "Tomate",
        foodId: TOMATE,
        quantity: 300,
        unit: "g",
        baseAmount: 300,
        baseUnit: "g",
      }),
      fonte({ label: "Tomate", foodId: TOMATE, quantity: 2, unit: "un" }),
    ]);

    expect(items).toHaveLength(2);
    const gramas = items.find((i) => i.unit === "g");
    const unidades = items.find((i) => i.unit === "un");
    expect(gramas?.quantity).toBe(300);
    expect(unidades?.quantity).toBe(2);
  });

  it("NÃO soma g com ml: faltaria a densidade", () => {
    const { items } = consolidateShoppingItems([
      fonte({ label: "Creme", quantity: 200, unit: "g" }),
      fonte({ label: "Creme", quantity: 200, unit: "ml" }),
    ]);

    expect(items).toHaveLength(2);
    expect(items.map((i) => i.unit).sort()).toEqual(["g", "ml"]);
  });

  it("duas medidas caseiras de rótulos diferentes ficam separadas", () => {
    const { items } = consolidateShoppingItems([
      fonte({ label: "Azeite", quantity: 2, unit: "colher de sopa" }),
      fonte({ label: "Azeite", quantity: 1, unit: "xícara" }),
    ]);
    expect(items).toHaveLength(2);
  });

  it("duas medidas caseiras do MESMO rótulo somam", () => {
    const { items } = consolidateShoppingItems([
      fonte({ label: "Azeite", quantity: 2, unit: "colher de sopa" }),
      fonte({ label: "Azeite", quantity: 1, unit: "Colher de Sopa" }),
    ]);
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it("item sem quantidade vira linha própria com quantidade NULA, jamais zero", () => {
    const { items } = consolidateShoppingItems([
      fonte({ label: "Sal", quantity: null, unit: "g" }),
      fonte({ label: "Sal", quantity: null, unit: "g" }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBeNull();
    expect(items[0].mergedFrom).toBe(2);
  });

  it("alimento do catálogo e item livre de mesmo nome NÃO se misturam", () => {
    const { items } = consolidateShoppingItems([
      fonte({ label: "Arroz", foodId: ARROZ, quantity: 200, unit: "g" }),
      fonte({ label: "Arroz", quantity: 300, unit: "g" }),
    ]);
    expect(items).toHaveLength(2);
  });
});

/* ═══════════════════════════ Geração por planejamento ═══════════════════════════ */

describe("geração a partir do planejamento", () => {
  /**
   * Dois dias de planejamento: o arroz aparece em três refeições (uma delas por dentro de uma
   * receita) e o tomate só em unidades. O resultado tem de consolidar o arroz, manter o tomate
   * separado do arroz em gramas e explicar de onde cada número veio.
   */
  const fontes: ShoppingSourceItem[] = [
    fonte({
      label: "Arroz",
      foodId: ARROZ,
      quantity: 150,
      unit: "g",
      baseAmount: 150,
      baseUnit: "g",
      categoryId: "graos",
      origin: origem("Almoço · 05/08", { date: "2026-08-05", quantity: 150, unit: "g" }),
    }),
    fonte({
      label: "Arroz",
      foodId: ARROZ,
      quantity: 150,
      unit: "g",
      baseAmount: 150,
      baseUnit: "g",
      categoryId: "graos",
      origin: origem("Jantar · 05/08", { date: "2026-08-05", quantity: 150, unit: "g" }),
    }),
    fonte({
      label: "Arroz",
      foodId: ARROZ,
      quantity: 0.5,
      unit: "kg",
      baseAmount: 500,
      baseUnit: "g",
      recipeId: "receita-1",
      origin: origem("Risoto", {
        kind: "receita",
        recipeId: "receita-1",
        date: "2026-08-06",
        quantity: 500,
        unit: "g",
      }),
    }),
    fonte({
      label: "Tomate",
      foodId: TOMATE,
      quantity: 4,
      unit: "un",
      origin: origem("Almoço · 06/08", { date: "2026-08-06", quantity: 4, unit: "un" }),
    }),
  ];

  it("consolida o alimento repetido e soma o que veio da receita", () => {
    const { items } = consolidateShoppingItems(fontes);
    const arroz = items.filter((i) => i.foodId === ARROZ);
    expect(arroz).toHaveLength(1);
    expect(arroz[0].quantity).toBe(800);
    expect(arroz[0].mergedFrom).toBe(3);
  });

  it("guarda a procedência de cada parcela (regra 2)", () => {
    const { items } = consolidateShoppingItems(fontes);
    const arroz = items.find((i) => i.foodId === ARROZ);
    expect(arroz?.origins.map((o) => o.label)).toEqual([
      "Almoço · 05/08",
      "Jantar · 05/08",
      "Risoto",
    ]);
    expect(arroz?.origins.filter((o) => o.kind === "receita")).toHaveLength(1);
  });

  it("herda a categoria de mercado da primeira parcela que a tiver", () => {
    const { items } = consolidateShoppingItems(fontes);
    expect(items.find((i) => i.foodId === ARROZ)?.categoryId).toBe("graos");
  });

  it("ingrediente de receita SEM conversão vira item separado, nunca zero", () => {
    const { items, splits } = consolidateShoppingItems([
      ...fontes,
      // `grams_equivalent` nulo na 16-C = "não deu para converter".
      fonte({
        label: "Arroz",
        foodId: ARROZ,
        quantity: 2,
        unit: "concha",
        baseAmount: null,
        baseUnit: null,
        origin: origem("Risoto", { kind: "receita", recipeId: "receita-1" }),
      }),
    ]);

    const arroz = items.filter((i) => i.foodId === ARROZ);
    expect(arroz).toHaveLength(2);
    expect(arroz.find((i) => i.unit === "concha")?.quantity).toBe(2);
    expect(arroz.every((i) => i.separateReason !== null)).toBe(true);
    expect(splits.map((s) => s.subjectKey)).toEqual([`food:${ARROZ}`]);
  });
});

/* ═══════════════════════════ Despensa ═══════════════════════════ */

describe("desconto da despensa", () => {
  const lista: ConsolidatedItem[] = [
    {
      consolidationKey: `food:${ARROZ}|base:g`,
      subjectKey: `food:${ARROZ}`,
      foodId: ARROZ,
      recipeId: null,
      label: "Arroz",
      brand: null,
      categoryId: null,
      quantity: 1000,
      unit: "g",
      origins: [],
      mergedFrom: 1,
      separateReason: null,
    },
  ];

  const estoque = (partial: Partial<PantryStock>): PantryStock => ({
    id: "p1",
    subjectKey: `food:${ARROZ}`,
    label: "Arroz",
    quantity: 400,
    unit: "g",
    ...partial,
  });

  it("desconto PARCIAL deixa só o que falta", () => {
    const preview = previewPantryDiscount(lista, [estoque({ quantity: 400 })]);
    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0].coverage).toBe("parcial");
    expect(preview.lines[0].available).toBe(400);
    expect(preview.lines[0].remaining).toBe(600);
    expect(preview.lines[0].surplus).toBe(0);
    expect(preview.parciais).toBe(1);
  });

  it("desconto TOTAL cobre o item inteiro", () => {
    const preview = previewPantryDiscount(lista, [estoque({ quantity: 1000 })]);
    expect(preview.lines[0].coverage).toBe("total");
    expect(preview.lines[0].remaining).toBe(0);
    expect(preview.cobertos).toBe(1);
  });

  it("estoque MAIOR que o necessário cobre tudo e reporta a sobra", () => {
    const preview = previewPantryDiscount(lista, [estoque({ quantity: 2, unit: "kg" })]);
    expect(preview.lines[0].coverage).toBe("total");
    expect(preview.lines[0].available).toBe(2000);
    expect(preview.lines[0].remaining).toBe(0);
    expect(preview.lines[0].surplus).toBe(1000);
  });

  it("soma vários potes do mesmo item", () => {
    const preview = previewPantryDiscount(lista, [
      estoque({ id: "p1", quantity: 300 }),
      estoque({ id: "p2", quantity: 0.5, unit: "kg" }),
    ]);
    expect(preview.lines[0].available).toBe(800);
    expect(preview.lines[0].remaining).toBe(200);
    expect(preview.lines[0].pantryItemIds).toEqual(["p1", "p2"]);
  });

  it("quantidade NULA na despensa não desconta — “não sei quanto” não é zero", () => {
    const preview = previewPantryDiscount(lista, [estoque({ quantity: null })]);
    expect(preview.lines[0].coverage).toBe("indisponivel");
    expect(preview.lines[0].reason).toContain("não sei quanto");
    expect(preview.lines[0].remaining).toBe(1000);
  });

  it("quantidade ZERO é fato medido: cobertura nenhuma, e compra-se tudo", () => {
    const preview = previewPantryDiscount(lista, [estoque({ quantity: 0 })]);
    expect(preview.lines[0].coverage).toBe("nenhuma");
    expect(preview.lines[0].available).toBe(0);
    expect(preview.lines[0].remaining).toBe(1000);
  });

  it("unidade incompatível não desconta e explica o motivo", () => {
    const preview = previewPantryDiscount(lista, [estoque({ quantity: 3, unit: "un" })]);
    expect(preview.lines[0].coverage).toBe("indisponivel");
    expect(preview.lines[0].reason).toContain("não converte");
  });

  it("item sem quantidade não tem o que descontar", () => {
    const preview = previewPantryDiscount(
      [{ ...lista[0], quantity: null }],
      [estoque({ quantity: 400 })],
    );
    expect(preview.lines[0].coverage).toBe("indisponivel");
  });

  it("item sem correspondência na despensa não gera linha", () => {
    const preview = previewPantryDiscount(lista, [
      estoque({ subjectKey: "food:outro", label: "Feijão" }),
    ]);
    expect(preview.lines).toHaveLength(0);
  });

  it("converte entre unidades da mesma família e recusa as de famílias diferentes", () => {
    expect(convertPantryAmount(2, "kg", "g")).toBe(2000);
    expect(convertPantryAmount(1500, "g", "kg")).toBe(1.5);
    expect(convertPantryAmount(1, "l", "ml")).toBe(1000);
    expect(convertPantryAmount(1, "kg", "ml")).toBeNull();
    expect(convertPantryAmount(3, "un", "g")).toBeNull();
  });

  it("aplicar cobertura total NÃO zera a quantidade — tira o item da compra", () => {
    const preview = previewPantryDiscount(lista, [estoque({ quantity: 1000 })]);
    const patches = pantryPatches(preview.lines);
    expect(patches).toHaveLength(1);
    expect(patches[0].covered).toBe(true);
    expect(patches[0].quantity).toBe(1000);
    expect(patches[0].note).toContain("Já tenho na despensa");
  });

  it("aplicar cobertura parcial grava só o que falta", () => {
    const preview = previewPantryDiscount(lista, [estoque({ quantity: 400 })]);
    const patches = pantryPatches(preview.lines);
    expect(patches[0].covered).toBe(false);
    expect(patches[0].quantity).toBe(600);
  });

  it("nada é aplicado quando não dá para descontar", () => {
    const preview = previewPantryDiscount(lista, [estoque({ quantity: null })]);
    expect(pantryPatches(preview.lines)).toHaveLength(0);
  });
});

/* ═══════════════════════════ Lista recorrente ═══════════════════════════ */

describe("lista recorrente", () => {
  it("a mesma semana produz sempre a mesma chave", () => {
    // 03/08/2026 é uma segunda; 09/08 é o domingo da mesma semana.
    expect(shoppingRecurrenceKey("semanal", "2026-08-03")).toBe("semanal:2026-08-03");
    expect(shoppingRecurrenceKey("semanal", "2026-08-06")).toBe("semanal:2026-08-03");
    expect(shoppingRecurrenceKey("semanal", "2026-08-09")).toBe("semanal:2026-08-03");
  });

  it("semanas diferentes produzem chaves diferentes", () => {
    expect(shoppingRecurrenceKey("semanal", "2026-08-10")).toBe("semanal:2026-08-10");
  });

  it("a chave mensal é o mês da data pura", () => {
    expect(shoppingRecurrenceKey("mensal", "2026-08-31")).toBe("mensal:2026-08");
    expect(shoppingRecurrenceKey("mensal", "2026-09-01")).toBe("mensal:2026-09");
  });

  it("a quinzena é ancorada no calendário, não em quando o app começou a ser usado", () => {
    const a = shoppingRecurrenceKey("quinzenal", "2026-08-03");
    const b = shoppingRecurrenceKey("quinzenal", "2026-08-12");
    const c = shoppingRecurrenceKey("quinzenal", "2026-08-17");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    // Determinismo absoluto: rodar de novo devolve o mesmo.
    expect(shoppingRecurrenceKey("quinzenal", "2026-08-03")).toBe(a);
  });

  it("sem recorrência não há chave", () => {
    expect(shoppingRecurrenceKey("nenhuma", "2026-08-03")).toBeNull();
  });

  it("NÃO cria segunda lista quando já existe a do período", () => {
    const key = shoppingRecurrenceKey("semanal", "2026-08-06");
    const existentes = [
      { id: "l1", recurrenceKey: "semanal:2026-07-27" },
      { id: "l2", recurrenceKey: "semanal:2026-08-03" },
      { id: "l3", recurrenceKey: null },
    ];
    expect(findRecurringList(existentes, key)?.id).toBe("l2");
    expect(findRecurringList(existentes, shoppingRecurrenceKey("semanal", "2026-08-20"))).toBeNull();
    expect(findRecurringList(existentes, null)).toBeNull();
  });
});

/* ═══════════════════════════ Ações em massa ═══════════════════════════ */

describe("ações em massa", () => {
  const visiveis = [item({ id: "a", label: "Arroz" }), item({ id: "b", label: "Feijão" })];

  it("MARCAÇÃO em massa só alcança o que está no filtro atual (regra 5)", () => {
    // O usuário selecionou 4 itens, depois filtrou e sobraram 2 na tela.
    expect(selectionInScope(["a", "b", "c", "d"], visiveis)).toEqual(["a", "b"]);
  });

  it("EXCLUSÃO em massa também respeita o filtro", () => {
    expect(selectionInScope(["c", "d"], visiveis)).toEqual([]);
  });

  it("mantém a ordem da tela, não a da seleção", () => {
    expect(selectionInScope(["b", "a"], visiveis)).toEqual(["a", "b"]);
  });

  it("ignora id repetido na seleção", () => {
    expect(selectionInScope(["a", "a", "a"], visiveis)).toEqual(["a"]);
  });
});

/* ═══════════════════════════ Filtros ═══════════════════════════ */

describe("filtros", () => {
  const itens = [
    item({ id: "a", label: "Arroz", status: "pendente", categoryId: "graos", store: "Extra" }),
    item({ id: "b", label: "Leite", status: "comprado", categoryId: "frios" }),
    item({
      id: "c",
      label: "Whey",
      status: "no_carrinho",
      priority: "alta",
      isManual: false,
      origins: [origem("Café · 05/08")],
    }),
  ];

  it("filtra por status", () => {
    expect(filterShoppingItems(itens, { ...EMPTY_SHOPPING_FILTERS, status: "comprado" })).toHaveLength(1);
  });

  it("“abertos” junta pendente e no carrinho", () => {
    expect(filterShoppingItems(itens, { ...EMPTY_SHOPPING_FILTERS, status: "abertos" })).toHaveLength(2);
  });

  it("filtra por corredor, loja, prioridade e origem", () => {
    expect(
      filterShoppingItems(itens, { ...EMPTY_SHOPPING_FILTERS, categoryId: "graos" }),
    ).toHaveLength(1);
    expect(filterShoppingItems(itens, { ...EMPTY_SHOPPING_FILTERS, store: "extra" })).toHaveLength(1);
    expect(filterShoppingItems(itens, { ...EMPTY_SHOPPING_FILTERS, priority: "alta" })).toHaveLength(1);
    expect(
      filterShoppingItems(itens, { ...EMPTY_SHOPPING_FILTERS, origin: "planejamento" }),
    ).toHaveLength(1);
    expect(filterShoppingItems(itens, { ...EMPTY_SHOPPING_FILTERS, origin: "manual" })).toHaveLength(2);
  });

  it("busca sem acento e por vários termos, inclusive na origem", () => {
    expect(filterShoppingItems(itens, { ...EMPTY_SHOPPING_FILTERS, search: "arroz" })).toHaveLength(1);
    expect(filterShoppingItems(itens, { ...EMPTY_SHOPPING_FILTERS, search: "cafe 05" })).toHaveLength(1);
  });
});

/* ═══════════════════════════ Agrupamento, ordenação e resumo ═══════════════════════════ */

describe("agrupamento e resumo", () => {
  const categorias: MarketCategory[] = [
    { id: "graos", slug: "graos_cereais", name: "Grãos e cereais", icon: null, color: null, position: 0 },
    { id: "frios", slug: "frios_laticinios", name: "Frios e laticínios", icon: null, color: null, position: 1 },
  ];

  it("agrupa por corredor e joga o que não tem corredor para o fim", () => {
    const grupos = groupItemsByCategory(
      [
        item({ id: "a", label: "Leite", categoryId: "frios" }),
        item({ id: "b", label: "Papel toalha" }),
        item({ id: "c", label: "Arroz", categoryId: "graos" }),
      ],
      categorias,
    );

    expect(grupos.map((g) => g.category?.name ?? "Sem corredor")).toEqual([
      "Grãos e cereais",
      "Frios e laticínios",
      "Sem corredor",
    ]);
  });

  it("ordena por corredor por padrão e por prioridade quando pedido", () => {
    const itens = [
      item({ id: "a", label: "Leite", categoryId: "frios", priority: "baixa" }),
      item({ id: "b", label: "Arroz", categoryId: "graos", priority: "alta" }),
    ];
    expect(sortShoppingItems(itens, "categoria", categorias).map((i) => i.id)).toEqual(["b", "a"]);
    expect(sortShoppingItems(itens, "prioridade", categorias).map((i) => i.id)).toEqual(["b", "a"]);
    expect(sortShoppingItems(itens, "nome", categorias).map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("resume contando o que NÃO tem preço — ausência de preço não é zero", () => {
    const resumo = summarizeShoppingList([
      item({ id: "a", label: "Arroz", status: "comprado", actualPriceCents: 890, estimatedPriceCents: 800 }),
      item({ id: "b", label: "Leite", status: "pendente" }),
      item({ id: "c", label: "Whey", status: "removido", estimatedPriceCents: 19900 }),
    ]);

    expect(resumo.total).toBe(3);
    expect(resumo.comprados).toBe(1);
    expect(resumo.pendentes).toBe(1);
    expect(resumo.removidos).toBe(1);
    // O item removido não entra na conta: ele não vai ser comprado.
    expect(resumo.estimadoCents).toBe(800);
    expect(resumo.realCents).toBe(890);
    expect(resumo.semPrecoEstimado).toBe(1);
    expect(resumo.tudoResolvido).toBe(false);
  });

  it("exporta em texto agrupado por corredor", () => {
    const texto = shoppingListToText(
      {
        name: "Semana 03/08",
        items: [
          item({ id: "a", label: "Arroz", categoryId: "graos", quantity: 1500, unit: "g" }),
          item({ id: "b", label: "Leite", categoryId: "frios", status: "comprado" }),
        ],
      },
      categorias,
    );

    expect(texto).toContain("Semana 03/08");
    expect(texto).toContain("Grãos e cereais");
    expect(texto).toContain("[ ] Arroz — 1,5 kg");
    expect(texto).toContain("[x] Leite");
  });
});

/* ═══════════════════════════ Duplicação ═══════════════════════════ */

describe("duplicação de lista", () => {
  it("nomeia a cópia e NÃO herda a recorrência", () => {
    const draft = duplicateShoppingListDraft({ name: "Compras da semana" });
    expect(draft.name).toBe("Compras da semana (cópia)");
    expect(draft.recurrence).toBe("nenhuma");
    expect(draft.recurrenceKey).toBeNull();
    expect(draft.pantryAppliedAt).toBeNull();
    expect(draft.status).toBe("ativa");
  });

  it("incrementa o sufixo quando o nome já é uma cópia", () => {
    expect(duplicateShoppingListDraft({ name: "Feira (cópia)" }).name).toBe("Feira (cópia 2)");
  });

  it("a cópia dos itens não herda a compra da vez passada", () => {
    const copiados = duplicateShoppingItems([
      {
        label: "Arroz",
        status: "comprado" as const,
        estimatedPriceCents: 800,
        actualPriceCents: 890,
        purchasedAt: "2026-08-05T12:00:00Z",
      },
    ]);

    expect(copiados[0].status).toBe("pendente");
    expect(copiados[0].actualPriceCents).toBeNull();
    expect(copiados[0].purchasedAt).toBeNull();
    // O preço ESTIMADO fica: é a memória útil de quanto costuma custar.
    expect(copiados[0].estimatedPriceCents).toBe(800);
  });
});

/* ═══════════════════════════ Regeração ═══════════════════════════ */

describe("regeração da lista", () => {
  const novo = (key: string, quantity: number): ConsolidatedItem => ({
    consolidationKey: key,
    subjectKey: key.split("|")[0],
    foodId: null,
    recipeId: null,
    label: key,
    brand: null,
    categoryId: null,
    quantity,
    unit: "g",
    origins: [],
    mergedFrom: 1,
    separateReason: null,
  });

  it("PRESERVA o ajuste manual da quantidade (regra 2)", () => {
    const plan = planRegeneration(
      [novo("food:a|base:g", 1400)],
      [
        {
          id: "i1",
          consolidationKey: "food:a|base:g",
          quantityOverridden: true,
          isManual: false,
          label: "Arroz",
        },
      ],
    );

    expect(plan.toInsert).toHaveLength(0);
    expect(plan.toUpdate).toHaveLength(1);
    expect(plan.toUpdate[0].keepQuantity).toBe(true);
    expect(plan.preservedOverrides).toBe(1);
  });

  it("atualiza a quantidade quando não houve ajuste manual", () => {
    const plan = planRegeneration(
      [novo("food:a|base:g", 1400)],
      [
        {
          id: "i1",
          consolidationKey: "food:a|base:g",
          quantityOverridden: false,
          isManual: false,
          label: "Arroz",
        },
      ],
    );
    expect(plan.toUpdate[0].keepQuantity).toBe(false);
    expect(plan.preservedOverrides).toBe(0);
  });

  it("NUNCA toca item digitado à mão", () => {
    const plan = planRegeneration(
      [novo("food:a|base:g", 500)],
      [
        { id: "manual", consolidationKey: null, quantityOverridden: false, isManual: true, label: "Sabão" },
      ],
    );
    expect(plan.toInsert).toHaveLength(1);
    expect(plan.obsolete).toHaveLength(0);
  });

  it("marca como obsoleto — não apaga — o que o planejamento não pede mais", () => {
    const plan = planRegeneration(
      [novo("food:a|base:g", 500)],
      [
        { id: "i1", consolidationKey: "food:a|base:g", quantityOverridden: false, isManual: false, label: "Arroz" },
        { id: "i2", consolidationKey: "food:b|base:g", quantityOverridden: false, isManual: false, label: "Feijão" },
      ],
    );

    expect(plan.obsolete).toEqual([{ id: "i2", label: "Feijão" }]);
    expect(plan.toUpdate).toHaveLength(1);
  });
});
