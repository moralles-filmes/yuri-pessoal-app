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

  // ══════════════════════════════════════════════════════════════════════════════════════
  // 18-C — A trava subiu (§3.1 do design)
  // ══════════════════════════════════════════════════════════════════════════════════════

  /**
   * Até a 18-B, "escrita exige confirmação e risco ≥ 2" só dizia, traduzido, que escrita não
   * é leitura — nada que o próprio `kind` já não dissesse. As exigências abaixo são as que
   * de fato recusam um descriptor mal declarado, ANTES de qualquer execução.
   */
  const ESCRITA: ToolDescriptor = {
    ...LEITURA,
    name: "todo.criar_tarefa",
    module: "todo",
    kind: "escrita",
    risk: 2,
    requiredPermission: "allow_todo",
    requiredWritePermission: "allow_write_todo",
    command: "criarTarefaTodo",
    sensibilidades: [],
    requiresConfirmation: true,
    idempotent: false,
  };

  it("aceita a escrita completamente declarada", () => {
    expect(isToolDescriptorCoherent(ESCRITA)).toBe(true);
  });

  /**
   * ⛔ Sem chave de escrita, a ferramenta seria autorizada só pela chave de LEITURA do
   * módulo — e o dono teria ligado a consulta, não a alteração.
   */
  it("recusa escrita sem requiredWritePermission", () => {
    const semChave = { ...ESCRITA };
    delete (semChave as { requiredWritePermission?: unknown }).requiredWritePermission;
    expect(isToolDescriptorCoherent(semChave)).toBe(false);
  });

  /**
   * ⛔ Sem command, a proposta não teria o que executar — e o defeito apareceria depois de o
   * dono confirmar, que é o pior momento possível para descobrir.
   */
  it("recusa escrita sem command", () => {
    const semCommand = { ...ESCRITA };
    delete (semCommand as { command?: unknown }).command;
    expect(isToolDescriptorCoherent(semCommand)).toBe(false);
    expect(isToolDescriptorCoherent({ ...ESCRITA, command: "  " })).toBe(false);
  });

  /**
   * ⛔ A DISTINÇÃO QUE DÁ NOME À REGRA: `[]` é uma DECLARAÇÃO ("não toca dinheiro, saúde nem
   * histórico consolidado"); `undefined` é OMISSÃO. Tratar omissão como declaração faria
   * "lançar transação" nascer sem sensibilidade só porque ninguém escreveu o campo.
   */
  it("sensibilidades vazia é declaração; ausente é omissão", () => {
    expect(isToolDescriptorCoherent({ ...ESCRITA, sensibilidades: [] })).toBe(true);
    const omissa = { ...ESCRITA };
    delete (omissa as { sensibilidades?: unknown }).sensibilidades;
    expect(isToolDescriptorCoherent(omissa)).toBe(false);
  });

  /**
   * ⛔ O CASO QUE A REGRA EXISTE PARA IMPEDIR: "lançar transação" nascendo com o mesmo peso
   * de "criar tarefa". Quem toca dinheiro, saúde ou histórico consolidado é risco ≥ 3.
   */
  it.each(["dinheiro", "saude", "historico_consolidado"] as const)(
    "quem toca %s não pode ter risco 2",
    (sensibilidade) => {
      expect(
        isToolDescriptorCoherent({ ...ESCRITA, sensibilidades: [sensibilidade], risk: 2 }),
      ).toBe(false);
      expect(
        isToolDescriptorCoherent({ ...ESCRITA, sensibilidades: [sensibilidade], risk: 3 }),
      ).toBe(true);
    },
  );

  /**
   * A recíproca: uma LEITURA que declara chave de escrita, command ou sensibilidade tem o
   * `kind` errado — e `kind` é justamente o que o guard consulta para decidir se admite.
   */
  it.each([
    ["requiredWritePermission", { requiredWritePermission: "allow_write_todo" as const }],
    ["command", { command: "criarTarefaTodo" }],
    ["sensibilidades", { sensibilidades: [] }],
  ])("recusa LEITURA que declara %s", (_nome, extra) => {
    expect(isToolDescriptorCoherent({ ...LEITURA, ...extra })).toBe(false);
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
