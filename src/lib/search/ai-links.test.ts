import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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

/** Converte a rota em caminho de página no disco, ignorando a query string. */
function paginaDe(rota: string): string {
  const semQuery = rota.split("?")[0];
  const partes = semQuery.split("/").filter(Boolean).slice(1); // tira "ia"
  return join(process.cwd(), "src", "app", "(app)", "ia", ...partes, "page.tsx");
}

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
    expect(existsSync(paginaDe(rota))).toBe(true);
  });

  it("a rota dinâmica da conversa tem página no disco", () => {
    const pagina = join(
      process.cwd(),
      "src",
      "app",
      "(app)",
      "ia",
      "conversas",
      "[id]",
      "page.tsx",
    );
    expect(existsSync(pagina)).toBe(true);
  });
});
