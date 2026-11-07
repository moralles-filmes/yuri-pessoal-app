/**
 * REDESIGN-09-A — o contrato dos quatro materiais (`vidro-casca`, `vidro-cartao`,
 * `vidro-sobreposicao`, `ladrilho`).
 *
 * O Tailwind v4 só emite o CSS de uma utilitária quando alguma classe a usa, então o build
 * não prova que elas existem. Este teste lê a FONTE (`globals.css`, sem comentários) e fixa
 * o que cada material promete: onde há `backdrop-filter`, que os dois modos de acessibilidade
 * (transparência reduzida, cores forçadas) estão em cada um, e que o raio é do componente.
 */
import { describe, expect, it } from "vitest";
import { bloco, css } from "./ler-tokens";

const MATERIAIS = ["vidro-casca", "vidro-cartao", "vidro-sobreposicao", "ladrilho"] as const;
const COM_DESFOQUE = new Set<string>(["vidro-casca", "vidro-sobreposicao"]);

const corpo = (nome: string) => bloco(`@utility ${nome} `);

describe("os quatro materiais", () => {
  it.each(MATERIAIS)("%s existe como @utility", (nome) => {
    expect(css).toContain(`@utility ${nome} {`);
    expect(corpo(nome).trim().length).toBeGreaterThan(0);
  });

  it.each(MATERIAIS)("%s só tem backdrop-filter se for casca ou sobreposição", (nome) => {
    const tem = /backdrop-filter\s*:\s*blur\(/.test(corpo(nome));
    expect(tem).toBe(COM_DESFOQUE.has(nome));
    if (COM_DESFOQUE.has(nome)) {
      expect(corpo(nome)).toMatch(/-webkit-backdrop-filter\s*:\s*blur\(/);
    }
  });

  it("vidro-cartao e ladrilho não mencionam backdrop-filter fora do modo reduzido", () => {
    for (const nome of ["vidro-cartao", "ladrilho"]) {
      const fora = corpo(nome).replace(/@media[^{]*\{[^{}]*\}/g, "");
      expect(fora).not.toMatch(/backdrop-filter/);
    }
  });

  it.each(MATERIAIS)("%s trata transparência reduzida e cores forçadas", (nome) => {
    const c = corpo(nome);
    expect(c).toContain("prefers-reduced-transparency");
    expect(c).toContain("forced-colors");
    expect(c).toMatch(/background\s*:\s*var\(--glass-solid\)/);
    expect(c).toMatch(/backdrop-filter\s*:\s*none/);
    expect(c).toMatch(/-webkit-backdrop-filter\s*:\s*none/);
    expect(c).toMatch(/border-color\s*:\s*CanvasText/);
  });

  it.each(MATERIAIS)("%s não define border-radius (o raio é do componente)", (nome) => {
    expect(corpo(nome)).not.toContain("border-radius");
  });

  it("usa os tokens certos em cada material", () => {
    expect(corpo("vidro-casca")).toContain("var(--glass)");
    expect(corpo("vidro-cartao")).toContain("var(--glass)");
    expect(corpo("vidro-sobreposicao")).toContain("var(--glass-strong)");
    expect(corpo("ladrilho")).toContain("var(--tile)");
    expect(corpo("ladrilho")).toContain("var(--tile-border)");
    expect(corpo("ladrilho")).not.toContain("box-shadow");
  });

  it("nenhum lugar usa background-attachment: fixed (quebra no iOS)", () => {
    expect(css).not.toMatch(/background-attachment\s*:\s*fixed/);
  });
});
