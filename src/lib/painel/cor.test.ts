import { describe, expect, it } from "vitest";
import { textoSobreACor } from "./cor";

describe("textoSobreACor", () => {
  it("fundo branco leva texto escuro; fundo preto leva texto branco", () => {
    expect(textoSobreACor("#FFFFFF")).toBe("escuro");
    expect(textoSobreACor("#000")).toBe("branco");
    expect(textoSobreACor("#000000")).toBe("branco");
  });

  it("aceita #RGB e #RRGGBB, em maiúscula ou minúscula, com o mesmo resultado", () => {
    expect(textoSobreACor("#fff")).toBe(textoSobreACor("#FFFFFF"));
    expect(textoSobreACor("#0A0")).toBe(textoSobreACor("#00AA00"));
    expect(textoSobreACor("#a98438")).toBe(textoSobreACor("#A98438"));
  });

  it("escolhe o de maior razão de contraste WCAG 2.1", () => {
    // #A98438: L = 0,2126·0,3965 + 0,7152·0,2306 + 0,0722·0,0395 ≈ 0,2521.
    // Contra #FFFFFF: 1,05 / 0,3021 ≈ 3,48. Contra #111827 (L ≈ 0,0092): 0,3021 / 0,0592 ≈ 5,10.
    // 5,10 > 3,48 → texto escuro.
    expect(textoSobreACor("#A98438")).toBe("escuro");
    // Um azul escuro: L ≈ 0,051 → o branco (razão ≈ 10,4) vence o escuro (razão ≈ 1,7).
    expect(textoSobreACor("#1E3A8A")).toBe("branco");
    // Um amarelo claro: L alto → escuro.
    expect(textoSobreACor("#FACC15")).toBe("escuro");
  });

  it("cor inválida, vazia ou nula devolve null", () => {
    expect(textoSobreACor("azul")).toBeNull();
    expect(textoSobreACor("")).toBeNull();
    expect(textoSobreACor(null)).toBeNull();
    expect(textoSobreACor("#12")).toBeNull();
    expect(textoSobreACor("#GGGGGG")).toBeNull();
    expect(textoSobreACor("A98438")).toBeNull();
    expect(textoSobreACor("#1234567")).toBeNull();
  });
});
