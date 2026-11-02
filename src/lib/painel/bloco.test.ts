import { describe, expect, it } from "vitest";
import { estadoDoBloco, type EstadoDoBloco } from "./bloco";

describe("EstadoDoBloco — o quarto estado do relatório (04-A2 L1)", () => {
  it("aceita os quatro valores", () => {
    const todos: EstadoDoBloco[] = ["conteudo", "vazio", "falha", "nao-segue"];
    expect(new Set(todos).size).toBe(4);
  });

  it("estadoDoBloco continua devolvendo só os três derivados da leitura", () => {
    expect(estadoDoBloco({ ok: false })).toBe("falha");
    expect(estadoDoBloco({ ok: true, itens: [] })).toBe("vazio");
    expect(estadoDoBloco({ ok: true, itens: [1] })).toBe("conteudo");
  });
});
