/**
 * Fase 16-F — o card novo de Dieta NÃO pode quebrar o layout já salvo do usuário.
 *
 * `normalizeLayout` (Fase 12) foi escrita para absorver cards de fases futuras, mas isso só
 * é verdade enquanto ninguém recriar o layout. Estes testes travam o comportamento no ponto
 * exato em que a 16-F mexeu: acrescentar um id novo em `DASH_CARD_IDS`.
 */
import { describe, expect, it } from "vitest";
import {
  DASH_CARD_IDS,
  DASH_CARD_TITLES,
  DEFAULT_DASHBOARD_LAYOUT,
  normalizeLayout,
  visibleCards,
} from "./cards";

describe("normalizeLayout com o card novo da 16-F", () => {
  /** Layout como estava salvo ANTES da 16-F (sem "dieta"), com ordem personalizada. */
  const layoutAntigo = {
    order: ["habitos", "financeiro", "todo", "faturas", "agenda", "tarefas", "estudos", "notificacoes"],
    hidden: ["faturas"],
    period: "semana",
    view: "semana",
  };

  it("anexa 'dieta' sem descartar a ordem que o usuário escolheu", () => {
    const layout = normalizeLayout(layoutAntigo);
    expect(layout.order.slice(0, 3)).toEqual(["habitos", "financeiro", "todo"]);
    expect(layout.order).toContain("dieta");
    // O card novo entra no FIM — não empurra nada que o usuário já tinha posicionado.
    expect(layout.order[layout.order.length - 1]).toBe("dieta");
  });

  it("preserva o que estava oculto e o período escolhido", () => {
    const layout = normalizeLayout(layoutAntigo);
    expect(layout.hidden).toEqual(["faturas"]);
    expect(layout.period).toBe("semana");
    expect(layout.view).toBe("semana");
  });

  it("o card novo nasce VISÍVEL (o usuário pode ocultar depois)", () => {
    expect(visibleCards(normalizeLayout(layoutAntigo))).toContain("dieta");
  });

  it("ocultar 'dieta' funciona como em qualquer outro card", () => {
    const layout = normalizeLayout({ ...layoutAntigo, hidden: ["dieta"] });
    expect(visibleCards(layout)).not.toContain("dieta");
    expect(layout.order).toContain("dieta");
  });

  it("todo id conhecido tem título — um card sem rótulo quebraria o menu Personalizar", () => {
    for (const id of DASH_CARD_IDS) {
      expect(DASH_CARD_TITLES[id], id).toBeTruthy();
    }
  });

  it("o layout padrão contém todos os cards, inclusive o novo", () => {
    expect(DEFAULT_DASHBOARD_LAYOUT.order).toEqual([...DASH_CARD_IDS]);
    expect(DEFAULT_DASHBOARD_LAYOUT.hidden).toEqual([]);
  });

  it("jsonb inválido continua degradando para o padrão, sem lançar", () => {
    for (const raw of [null, undefined, 42, "texto", { order: "nao-e-array" }]) {
      const layout = normalizeLayout(raw);
      expect(layout.order).toEqual([...DASH_CARD_IDS]);
    }
  });

  it("id desconhecido de uma fase futura é descartado, não quebra a leitura", () => {
    const layout = normalizeLayout({ order: ["dieta", "modulo_inexistente", "todo"] });
    expect(layout.order).not.toContain("modulo_inexistente");
    expect(layout.order[0]).toBe("dieta");
  });
});
