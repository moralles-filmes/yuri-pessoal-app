import { describe, expect, it } from "vitest";
import { parametrosLidos, rotaEParametros } from "@/test/parametros-lidos";
import { notificacoesLink } from "./notificacoes-links";

/**
 * REDESIGN-07-D · D5 — a URL de `/notificacoes` sai de um construtor só (spec §6.5).
 *
 * Antes ela era montada à mão dentro do `setFilter` da tela. O construtor é o que o "Limpar
 * filtros" chama sem argumento, e o teste confere que a página LÊ cada chave que ele escreve.
 */
describe("notificacoesLink", () => {
  it("sem filtro é a rota pura", () => {
    expect(notificacoesLink()).toBe("/notificacoes");
    expect(notificacoesLink({ status: "todas", tipo: "todas", prioridade: "todas" })).toBe(
      "/notificacoes",
    );
  });

  it("escreve só os filtros ativos, na ordem status · tipo · prioridade", () => {
    expect(notificacoesLink({ status: "nao_lidas" })).toBe("/notificacoes?status=nao_lidas");
    expect(
      notificacoesLink({ status: "nao_lidas", tipo: "ai_budget_threshold", prioridade: "high" }),
    ).toBe("/notificacoes?status=nao_lidas&tipo=ai_budget_threshold&prioridade=high");
  });

  it("a página lê cada chave que o construtor escreve", () => {
    const [rota, chaves] = rotaEParametros(
      notificacoesLink({ status: "nao_lidas", tipo: "ai_budget_threshold", prioridade: "high" }),
    );
    const lidos = parametrosLidos(rota);
    for (const chave of chaves) expect(lidos, chave).toContain(chave);
  });
});
