/**
 * Fase 16-F — contrato dos deep-links da Dieta.
 *
 * O requisito da subfase não é "a busca encontra", é "o link ABRE O ITEM CERTO". Estes
 * testes travam o formato; do outro lado, cada página lê exatamente esse parâmetro:
 *
 *   /nutricao/alimentos      → ?alimento=  → abre FoodDetailSheet
 *   /nutricao/receitas       → ?receita=   → abre RecipeDetailSheet
 *   /nutricao/refeicoes      → ?modelo=    → abre o detalhe do modelo
 *   /nutricao/planejamento   → ?plano=     → abre os dias do modelo de semana
 *   /nutricao/compras        → ?lista=     → abre a lista
 *   /nutricao/compras        → ?aba=despensa (a despensa NÃO é rota própria)
 *   /nutricao/diario         → ?data=      → abre o dia
 */
import { describe, expect, it } from "vitest";
import { temPagina } from "@/test/rotas";
import {
  diaryLink,
  foodLink,
  mealTemplateLink,
  measurementsLink,
  pantryLink,
  planLink,
  recipeLink,
  shoppingListLink,
} from "./nutrition-links";
import { SEARCH_TYPES, SEARCH_TYPE_LABELS } from "./types";

const ID = "11111111-2222-3333-4444-555555555555";

describe("deep-links da Dieta", () => {
  it("cada link aponta para a rota certa com o parâmetro certo", () => {
    expect(foodLink(ID)).toBe(`/nutricao/alimentos?alimento=${ID}`);
    expect(recipeLink(ID)).toBe(`/nutricao/receitas?receita=${ID}`);
    expect(mealTemplateLink(ID)).toBe(`/nutricao/refeicoes?modelo=${ID}`);
    expect(planLink(ID)).toBe(`/nutricao/planejamento?visao=modelos&plano=${ID}`);
    expect(shoppingListLink(ID)).toBe(`/nutricao/compras?lista=${ID}`);
    expect(diaryLink("2026-08-04")).toBe("/nutricao/diario?data=2026-08-04");
    expect(measurementsLink()).toBe("/nutricao/medidas");
  });

  it("a despensa é ABA de /nutricao/compras, não rota própria", () => {
    // Um "/nutricao/despensa" mandaria a notificação de validade para um 404.
    expect(pantryLink()).toBe("/nutricao/compras?aba=despensa");
    expect(pantryLink()).not.toContain("/nutricao/despensa");
  });

  it("todo link é interno e começa em /nutricao", () => {
    const links = [
      foodLink(ID),
      recipeLink(ID),
      mealTemplateLink(ID),
      planLink(ID),
      shoppingListLink(ID),
      diaryLink("2026-08-04"),
      measurementsLink(),
      pantryLink(),
    ];
    for (const link of links) {
      expect(link.startsWith("/nutricao")).toBe(true);
      expect(link).not.toContain("http");
    }
  });
});

/**
 * REDESIGN-02-D — até aqui este arquivo conferia o FORMATO da string contra ela mesma.
 * O cabeçalho acima sempre prometeu que "cada página lê exatamente esse parâmetro" e que
 * a rota existe do outro lado; nada nunca abriu o disco para ver. Trocar o nome de uma
 * pasta em `src/app/(app)/nutricao/` deixava a suíte inteira verde com os links mortos.
 *
 * O que ele NÃO afirma, e é bom dizer: que a página LEIA o parâmetro. Isso continua
 * sendo contrato escrito no cabeçalho — a rota existir é o que dá para provar daqui.
 */
describe("o link abre uma tela que existe", () => {
  it.each([
    ["alimento", foodLink(ID)],
    ["receita", recipeLink(ID)],
    ["refeição-modelo", mealTemplateLink(ID)],
    ["plano", planLink(ID)],
    ["lista de compras", shoppingListLink(ID)],
    ["diário", diaryLink("2026-08-04")],
    ["medidas", measurementsLink()],
    // A despensa é a que mais importa: ela é ABA, e um dia alguém vai achar que é rota.
    ["despensa (aba)", pantryLink()],
  ])("%s → %s", (_nome, link) => {
    expect(temPagina(link)).toBe(true);
  });

  it("e a rota que a despensa NÃO tem continua não existindo", () => {
    // Se um dia `/nutricao/despensa` passar a existir, esta linha fica vermelha e a
    // decisão da 16-D volta para a mesa em vez de se desfazer sozinha.
    expect(temPagina("/nutricao/despensa")).toBe(false);
  });
});

describe("tipos novos da busca global", () => {
  const NOVOS = [
    "nutricao_alimento",
    "nutricao_receita",
    "nutricao_modelo",
    "nutricao_plano",
    "nutricao_lista",
  ] as const;

  it("os 5 tipos da Dieta estão registrados", () => {
    for (const type of NOVOS) {
      expect(SEARCH_TYPES).toContain(type);
    }
  });

  it("todo tipo tem rótulo pt-BR — um grupo sem nome quebraria o painel de resultados", () => {
    for (const type of SEARCH_TYPES) {
      expect(SEARCH_TYPE_LABELS[type], type).toBeTruthy();
    }
  });

  it("os grupos da Dieta vêm antes de Notificações (ordem estável de SEARCH_TYPES)", () => {
    const indice = (t: string) => SEARCH_TYPES.indexOf(t as (typeof SEARCH_TYPES)[number]);
    for (const type of NOVOS) {
      expect(indice(type)).toBeLessThan(indice("notificacao"));
    }
  });
});
