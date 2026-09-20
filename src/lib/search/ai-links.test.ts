import { describe, expect, it } from "vitest";
import { temPagina } from "@/test/rotas";
import {
  actionsLink,
  conversationLink,
  conversationsLink,
  insightsLink,
  memoryLink,
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
