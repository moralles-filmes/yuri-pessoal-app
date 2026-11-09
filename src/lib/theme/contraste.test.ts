/**
 * REDESIGN-09-A T1 — composição e contraste, puros.
 *
 * Medição de WCAG 2.x e de mistura alfa sobre as cores que os tokens declaram. Não lê CSS:
 * quem lê os tokens é o teste de contraste da T2.
 */
import { describe, expect, it } from "vitest";
import { compor, contraste, lerCor } from "./contraste";

describe("contraste WCAG 2.x", () => {
  it("branco sobre preto é 21:1", () => {
    expect(contraste("#ffffff", "#000000")).toBeCloseTo(21, 5);
  });
  it("bate com a medição do desenho", () => {
    expect(contraste("#596070", "#f3f5f9")).toBeCloseTo(5.77, 2);
    expect(contraste("#ffffff", "#1f6fe5")).toBeCloseTo(4.7, 2);
  });
  it("compõe vidro sobre a névoa", () => {
    expect(compor("rgba(255,255,255,.56)", "#e8ecf3")).toBe("#f5f7fa");
    expect(compor("rgba(28, 31, 40, 0.58)", "#0a0c11")).toBe("#14171e");
    expect(compor("#123456", "#ffffff")).toBe("#123456");
  });
  it("recusa o que não sabe medir", () => {
    expect(() => lerCor("oklch(0.5 0.1 250)")).toThrow(/oklch/);
    expect(() => contraste("rgba(0,0,0,.5)", "#ffffff")).toThrow();
    expect(() => compor("#000000", "rgba(255,255,255,.5)")).toThrow();
  });
});

describe("lerCor", () => {
  it("lê hex de seis dígitos e devolve alfa 1", () => {
    expect(lerCor("#1F6FE5")).toEqual({ rgb: [31, 111, 229], alfa: 1 });
  });
  it("lê rgba com espaços e alfa sem zero à esquerda", () => {
    expect(lerCor("rgba(10,20,30,.5)")).toEqual({ rgb: [10, 20, 30], alfa: 0.5 });
    expect(lerCor("rgba( 10 , 20 , 30 , 0.25 )")).toEqual({
      rgb: [10, 20, 30],
      alfa: 0.25,
    });
  });
  it("recusa forma que não é hex nem rgba, com a cor na mensagem", () => {
    expect(() => lerCor("hsl(0 0% 0%)")).toThrow(/hsl/);
    expect(() => lerCor("#abc")).toThrow(/#abc/);
  });
});
