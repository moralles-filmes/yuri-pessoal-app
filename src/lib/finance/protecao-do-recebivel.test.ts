import { describe, expect, it } from "vitest";
import { motivoParaNaoApagar, recebivelProtegido } from "@/lib/finance/protecao-do-recebivel";

describe("A4 — a regra única", () => {
  it.each([
    ["pendente", false, "regra-cheia", false],
    ["pendente", true, "regra-cheia", true],
    ["cobrado", false, "regra-cheia", true],
    ["pago", false, "regra-cheia", true],
    ["ignorado", false, "regra-cheia", true],
    ["pago", false, "so-dinheiro-registrado", false],
    ["ignorado", false, "so-dinheiro-registrado", false],
    ["pendente", true, "so-dinheiro-registrado", true],
  ] as const)("%s, recebimento=%s, %s → %s", (status, temRecebimento, alcance, esperado) => {
    expect(recebivelProtegido({ status, temRecebimento }, alcance)).toBe(esperado);
  });

  it("a mensagem diz por quê e o que fazer", () => {
    const m = motivoParaNaoApagar([{ status: "pendente", temRecebimento: true }], "regra-cheia", "excluir o lançamento");
    expect(m).toMatch(/recebimento registrado/);
    expect(m).toMatch(/antes de excluir o lançamento/);
    expect(motivoParaNaoApagar([{ status: "ignorado", temRecebimento: false }], "regra-cheia", "alterar a divisão"))
      .toMatch(/decidiu não cobrar/);
    expect(motivoParaNaoApagar([{ status: "pendente", temRecebimento: false }], "regra-cheia", "alterar a divisão")).toBeNull();
  });
});
