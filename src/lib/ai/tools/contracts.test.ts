import { describe, expect, it } from "vitest";
import {
  emptyToolOutput,
  isToolDescriptorCoherent,
  type ToolDescriptor,
} from "./contracts";

const LEITURA: ToolDescriptor = {
  name: "training.get_records",
  version: "1",
  module: "training",
  kind: "leitura",
  risk: 1,
  description: "Recordes pessoais consolidados.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: { type: "object" },
  allowedAgents: ["treinos"],
  requiredPermission: "allow_training",
  timeoutMs: 8000,
  maxRecords: 50,
  itemLabel: "registros",
  requiresConfirmation: false,
  idempotent: true,
};

describe("coerência do descriptor", () => {
  it("aceita uma leitura sem confirmação", () => {
    expect(isToolDescriptorCoherent(LEITURA)).toBe(true);
  });

  it("recusa ESCRITA sem confirmação", () => {
    expect(
      isToolDescriptorCoherent({ ...LEITURA, kind: "escrita", risk: 3 }),
    ).toBe(false);
  });

  it("recusa escrita com risco 1", () => {
    expect(
      isToolDescriptorCoherent({
        ...LEITURA,
        kind: "escrita",
        risk: 1,
        requiresConfirmation: true,
      }),
    ).toBe(false);
  });

  // Regra recíproca nova: uma LEITURA que exige confirmação criaria, na 18-C, um caminho
  // de confirmação que nunca foi exercitado por ninguém.
  it("recusa LEITURA que exige confirmação", () => {
    expect(
      isToolDescriptorCoherent({ ...LEITURA, requiresConfirmation: true }),
    ).toBe(false);
  });

  it("recusa ferramenta sem teto de registros", () => {
    expect(isToolDescriptorCoherent({ ...LEITURA, maxRecords: 0 })).toBe(false);
  });

  /**
   * O par negativo do teto. Sem ele, remover a checagem de `itemLabel` da coerência não
   * quebrava teste nenhum — e um descriptor com rótulo vazio faria a poda dizer "Mostrando
   * 50 de 51 ." ao modelo, que é pior que dizer "registros".
   *
   * String em branco conta como ausente: `"   "` no rótulo produz exatamente a mesma frase
   * mutilada que `""`.
   */
  it("recusa ferramenta sem RÓTULO para os itens", () => {
    expect(isToolDescriptorCoherent({ ...LEITURA, itemLabel: "" })).toBe(false);
    expect(isToolDescriptorCoherent({ ...LEITURA, itemLabel: "   " })).toBe(false);
    expect(isToolDescriptorCoherent({ ...LEITURA, itemLabel: "\n\t" })).toBe(false);
  });

  it("aceita rótulo com espaço em volta, desde que haja rótulo", () => {
    expect(isToolDescriptorCoherent({ ...LEITURA, itemLabel: " recordes " })).toBe(true);
  });
});

describe("saída vazia", () => {
  it("declara o motivo e não finge zero", () => {
    const saida = emptyToolOutput("Você ainda não registrou nenhum treino.");
    expect(saida.contagem).toBe(0);
    expect(saida.completude).toBe("exato");
    expect(saida.motivo_incompleto).toBeUndefined();
    expect(saida.itens).toEqual([]);
    expect(saida.refs).toEqual([]);
    expect(saida.agregados).toEqual({});
    expect(saida.observacao).toBe("Você ainda não registrou nenhum treino.");
  });
});
