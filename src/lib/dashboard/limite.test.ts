import { describe, expect, it } from "vitest";
import { estadoDoLimite } from "./limite";

describe("estadoDoLimite", () => {
  it("sem erro, mostra o conteúdo", () => {
    expect(estadoDoLimite({ erro: null })).toBe("conteudo");
  });

  it("com erro, mostra a falha", () => {
    expect(estadoDoLimite({ erro: new Error("x") })).toBe("falha");
  });
});
