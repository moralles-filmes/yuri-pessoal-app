import { describe, expect, it } from "vitest";
import { parametrosLidos, rotaEParametros } from "@/test/parametros-lidos";
import { buscaLink } from "./busca-links";

/**
 * REDESIGN-07-D · D6 — a URL de `/busca`, num construtor só (spec §6.6).
 *
 * A página de busca e a paleta ("Ver todos os resultados") escrevem a mesma URL. Abaixo de 2
 * caracteres a busca não roda, e a URL fica sem `q` — a mesma regra que a tela aplicava à mão.
 */
describe("buscaLink", () => {
  it("sem termo (ou com menos de 2 caracteres) é a rota pura", () => {
    expect(buscaLink()).toBe("/busca");
    expect(buscaLink("")).toBe("/busca");
    expect(buscaLink(" a ")).toBe("/busca");
  });

  it("o termo vai aparado e codificado", () => {
    expect(buscaLink("  seguro ")).toBe("/busca?q=seguro");
    expect(buscaLink("a&b")).toBe("/busca?q=a%26b");
    expect(buscaLink("ação")).toBe(`/busca?q=${encodeURIComponent("ação")}`);
  });

  it("a página lê cada chave que o construtor escreve", () => {
    const [rota, chaves] = rotaEParametros(buscaLink("seguro"));
    const lidos = parametrosLidos(rota);
    for (const chave of chaves) expect(lidos, chave).toContain(chave);
  });
});
