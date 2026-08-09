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
    // O card novo entra DEPOIS de tudo que o usuário já tinha posicionado — não empurra nada.
    // (A 17-F acrescentou "treinos" atrás dele pelo mesmo motivo; o que este teste trava é a
    // regra, não a posição absoluta de um id.)
    const salvos = layoutAntigo.order.length;
    expect(layout.order.slice(0, salvos)).toEqual(layoutAntigo.order);
    expect(layout.order.indexOf("dieta")).toBeGreaterThanOrEqual(salvos);
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

/**
 * Fase 17-F — o card de Treinos entra pela mesma porta do de Dieta: um id novo no FIM de
 * `DASH_CARD_IDS`. Estes testes provam que quem já usava o dashboard (inclusive quem já tinha
 * o card da Dieta posicionado) não perde nada.
 */
describe("normalizeLayout com o card novo da 17-F", () => {
  /** Layout salvo DEPOIS da 16-F e ANTES da 17-F, com ordem personalizada e card oculto. */
  const layoutPos16F = {
    order: [
      "dieta",
      "habitos",
      "financeiro",
      "todo",
      "faturas",
      "agenda",
      "tarefas",
      "estudos",
      "notificacoes",
    ],
    hidden: ["estudos"],
    period: "mes",
    view: "mes",
  };

  /**
   * ⚠️ 18-E: a asserção deixou de ser "o último é `treinos`" e passou a ser "os cards novos
   * entram DEPOIS da ordem salva". A original quebrou no instante em que `insights` entrou no
   * fim de `DASH_CARD_IDS` — e ela quebrou por estar amarrada ao último card DA ÉPOCA, não à
   * regra. O que importa é que a ordem que o dono salvou continue intacta no começo, e que os
   * cards que ele nunca viu sejam anexados no fim.
   */
  it("anexa os cards novos no fim, preservando a ordem salva inteira", () => {
    const layout = normalizeLayout(layoutPos16F);
    expect(layout.order.slice(0, layoutPos16F.order.length)).toEqual(layoutPos16F.order);
    expect(layout.order.slice(layoutPos16F.order.length)).toEqual(
      expect.arrayContaining(["treinos", "insights"]),
    );
    expect(layout.order[layout.order.length - 1]).toBe("insights");
  });

  it("o card de Treinos nasce VISÍVEL e pode ser ocultado como qualquer outro", () => {
    expect(visibleCards(normalizeLayout(layoutPos16F))).toContain("treinos");

    const oculto = normalizeLayout({ ...layoutPos16F, hidden: ["treinos"] });
    expect(visibleCards(oculto)).not.toContain("treinos");
    expect(oculto.order).toContain("treinos");
  });

  it("o card da Dieta continua onde o usuário o deixou", () => {
    const layout = normalizeLayout(layoutPos16F);
    expect(layout.order[0]).toBe("dieta");
    expect(layout.hidden).toEqual(["estudos"]);
  });
});
