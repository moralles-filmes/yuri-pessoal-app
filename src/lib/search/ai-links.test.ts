import { describe, expect, it } from "vitest";
import { temPagina } from "@/test/rotas";
import { parametrosLidos, rotaEParametros } from "@/test/parametros-lidos";
import { AI_SECTIONS } from "@/lib/ai/constants";
import {
  AI_LINK_BASE,
  actionsLink,
  conversationLink,
  conversationsLink,
  insightsLink,
  memoryLink,
  receiptLink,
  receiptsLink,
  settingsLink,
  stuckActionsLink,
  usageLink,
} from "./ai-links";

/*
 * A resolução "esta rota tem página?" saiu daqui na REDESIGN-02-D. A daqui montava o
 * caminho do arquivo à mão, com `"(app)"` e `"ia"` escritos dentro e um `slice(1)` para
 * tirar o primeiro segmento: ela responderia "não existe" — e não "eu não sei procurar" —
 * no dia em que `/ia` mudasse de grupo ou ganhasse um nível. `@/test/rotas` varre as
 * pastas de uma vez só e é a mesma fonte que a sidebar usa desde a 02-C.
 */

describe("ai-links", () => {
  it("monta o link da conversa com o id", () => {
    expect(conversationLink("abc-123")).toBe("/ia/conversas/abc-123");
  });

  it("aponta o filtro de problemas que a tela de ações realmente aceita", () => {
    // `FILTROS_DO_HISTORICO` = todas | aplicadas | aguardando | problemas.
    expect(stuckActionsLink()).toBe("/ia/acoes?filtro=problemas");
  });

  // ⚠️ Este é o teste que importa: o requisito não é "a busca encontra",
  // é "o link ABRE a tela". Só o disco prova isso.
  it.each([
    ["conversas", conversationsLink()],
    ["insights", insightsLink()],
    ["ações", actionsLink()],
    ["ações · problemas", stuckActionsLink()],
    ["consumo", usageLink()],
    ["configurações", settingsLink()],
    ["comprovantes", receiptsLink()],
    // 18-F Bloco 3 — a rota e o link no mesmo commit. Esta linha é o que prova isso.
    ["memória", memoryLink()],
  ])("a rota de %s tem página no disco", (_nome, rota) => {
    expect(temPagina(rota)).toBe(true);
  });

  it("a rota dinâmica da conversa tem página no disco", () => {
    // Agora pelo LINK que o sistema monta, e não por um caminho `[id]` escrito à mão:
    // o caminho à mão continuaria verde se `conversationLink` passasse a apontar para
    // outro lugar.
    expect(temPagina(conversationLink("9f8e7d6c-1234"))).toBe(true);
  });
});

/**
 * REDESIGN-07-D · D7 — os construtores que as telas do lote passam a usar (spec §6.7).
 */
describe("ai-links — 07-D", () => {
  it("actionsLink aceita um filtro de FILTROS_DO_HISTORICO; 'todas' é a rota pura", async () => {
    const { FILTROS_DO_HISTORICO } = await import("@/lib/ai/approval/history");
    expect(actionsLink()).toBe("/ia/acoes");
    expect(actionsLink("todas")).toBe("/ia/acoes");
    for (const filtro of FILTROS_DO_HISTORICO.filter((f) => f !== "todas")) {
      expect(actionsLink(filtro)).toBe(`/ia/acoes?filtro=${filtro}`);
    }
    // O aviso do sino continua apontando para o mesmo lugar, agora pelo mesmo construtor.
    expect(stuckActionsLink()).toBe(actionsLink("problemas"));
  });

  it("a página de ações lê `filtro`, e a de comprovantes lê `doc` (o link não é ignorado em silêncio)", () => {
    expect(parametrosLidos("/ia/acoes").has("filtro")).toBe(true);
    const [rota, chaves] = rotaEParametros(receiptLink("doc-1"));
    expect(receiptLink("doc-1")).toBe("/ia/comprovantes?doc=doc-1");
    for (const chave of chaves) expect(parametrosLidos(rota).has(chave), chave).toBe(true);
  });

  it("os 8 itens da navegação de /ia são exatamente os construtores de base (M43)", () => {
    // AI_SECTIONS mora num módulo puro sem import; este teste é o que o amarra a ai-links.
    expect(AI_SECTIONS.map((s) => s.href).sort()).toEqual(
      [
        AI_LINK_BASE,
        conversationsLink(),
        actionsLink(),
        receiptsLink(),
        insightsLink(),
        memoryLink(),
        usageLink(),
        settingsLink(),
      ].sort(),
    );
  });
});
