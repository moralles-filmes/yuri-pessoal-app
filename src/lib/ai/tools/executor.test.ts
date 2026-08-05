/**
 * Fase 18-B — IA · O Tool Executor.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Este é o ponto do sistema onde uma decisão do MODELO vira uma leitura de dado REAL.   ║
 * ║ O que se testa aqui não é o feliz caminho: é que a ferramenta NÃO roda quando o guard ║
 * ║ nega, que `user_id` no argumento é recusado antes de qualquer execução, e que tudo    ║
 * ║ que volta ao modelo — inclusive erro — vai empacotado como NÃO CONFIÁVEL.             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O registry é injetado por mock de propósito: a integridade do registry REAL é assunto de
 * `registry.test.ts`, e aqui interessam timeout curto e teto de registros pequeno, para o
 * teste ser determinístico e legível.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { MAX_UNTRUSTED_CHARS } from "@/lib/ai/security/untrusted";
import type { ToolDescriptor, ToolOutput, ToolPermission } from "./contracts";

const LEITURA: ToolDescriptor = {
  name: "training.get_volume",
  version: "3",
  module: "training",
  kind: "leitura",
  risk: 1,
  description: "Totais do período.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  outputSchema: { type: "object" },
  allowedAgents: ["treinos"],
  requiredPermission: "allow_training",
  timeoutMs: 30,
  maxRecords: 2,
  itemLabel: "sessões de treino",
  requiresConfirmation: false,
  idempotent: true,
};

const SEM_EXECUTOR: ToolDescriptor = { ...LEITURA, name: "training.get_orfa", version: "9" };

vi.mock("./registry", () => ({
  AI_TOOL_REGISTRY: [LEITURA, SEM_EXECUTOR],
}));

/** O que o executor de mentira devolve. Cada teste troca isto. */
let respostaDaFerramenta: () => Promise<ToolOutput> = async () => saidaCom(1);
const chamadas: unknown[] = [];

vi.mock("./executors", () => ({
  TOOL_EXECUTORS: {
    "training.get_volume": {
      schema: z.object({ dias: z.number().int().optional() }).strict(),
      run: async (input: unknown) => {
        chamadas.push(input);
        return respostaDaFerramenta();
      },
    },
  },
}));

const auditadas: Record<string, unknown>[] = [];
let auditoriaFalha = false;

vi.mock("./audit", () => ({
  recordToolCall: async (input: Record<string, unknown>) => {
    if (auditoriaFalha) throw new Error("banco indisponível");
    auditadas.push(input);
  },
}));

const { executeTool } = await import("./executor");

function saidaCom(itens: number): ToolOutput {
  return {
    periodo: { de: "2026-08-01", ate: "2026-08-07" },
    contagem: itens,
    completude: "exato",
    agregados: { volume_kg: 1080 },
    itens: Array.from({ length: itens }, (_, i) => ({ n: i + 1 })),
    refs: Array.from({ length: itens }, (_, i) => ({
      tipo: "sessao_de_treino",
      id: `s${i + 1}`,
      rota: `/treinos/historico/s${i + 1}`,
    })),
  };
}

const ctx = {
  runId: "run-1",
  userId: "user-1",
  stepId: "step-1",
  agent: { id: "treinos", allowedTools: ["training.get_volume"] },
  permissions: { allow_training: true } as Partial<Record<ToolPermission, boolean>>,
};

const chamada = (input: unknown = {}) => ({
  callId: "call-1",
  toolName: "training.get_volume",
  input,
});

beforeEach(() => {
  chamadas.length = 0;
  auditadas.length = 0;
  auditoriaFalha = false;
  respostaDaFerramenta = async () => saidaCom(1);
});

describe("executeTool — o caminho feliz", () => {
  it("devolve o resultado empacotado como NÃO CONFIÁVEL, nunca o objeto cru", async () => {
    const r = await executeTool(ctx, chamada({ dias: 7 }));

    expect(r.isError).toBe(false);
    expect(r.callId).toBe("call-1");
    expect(r.block.untrusted).toBe(true);
    expect(r.block.source).toBe("resultado_de_ferramenta");
    expect(r.block.origin).toBe("training.get_volume");
    expect((r.block.content as ToolOutput).agregados).toEqual({ volume_kg: 1080 });
    expect(r.recordsRead).toBe(1);
    expect(chamadas).toEqual([{ dias: 7 }]);
  });

  it("audita a execução com a versão do descriptor e as referências lidas", async () => {
    await executeTool(ctx, chamada({ dias: 7 }));

    expect(auditadas).toHaveLength(1);
    expect(auditadas[0]).toMatchObject({
      runId: "run-1",
      userId: "user-1",
      stepId: "step-1",
      toolName: "training.get_volume",
      toolVersion: "3",
      providerCallId: "call-1",
      status: "executada",
      rejectionReason: null,
      recordsRead: 1,
    });
    expect(auditadas[0].refs).toEqual([
      { tipo: "sessao_de_treino", id: "s1", rota: "/treinos/historico/s1" },
    ]);
  });

  it("entrada ausente vale como objeto vazio — a ferramenta sem argumento roda", async () => {
    const r = await executeTool(ctx, { callId: "c", toolName: "training.get_volume", input: null });

    expect(r.isError).toBe(false);
    expect(chamadas).toEqual([{}]);
  });
});

describe("executeTool — nada roda sem passar pelo guard", () => {
  it("ferramenta fora da allowlist do agente NÃO é executada", async () => {
    const r = await executeTool(
      { ...ctx, agent: { id: "treinos", allowedTools: [] } },
      chamada(),
    );

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
    expect(auditadas[0]).toMatchObject({
      status: "rejeitada",
      rejectionReason: "TOOL_NOT_ALLOWED_FOR_AGENT",
    });
  });

  it("flag do módulo desligada NÃO é executada", async () => {
    const r = await executeTool({ ...ctx, permissions: {} }, chamada());

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
    expect(auditadas[0]).toMatchObject({
      status: "rejeitada",
      rejectionReason: "TOOL_PERMISSION_DENIED",
    });
  });

  it("nome fora do registry NÃO é executado", async () => {
    const r = await executeTool(ctx, { callId: "c", toolName: "finance.drop", input: {} });

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
    expect(auditadas[0]).toMatchObject({ status: "rejeitada", rejectionReason: "TOOL_UNKNOWN" });
  });

  it("descriptor sem executor é REJEITADO, nunca executado às cegas", async () => {
    const r = await executeTool(
      { ...ctx, agent: { id: "treinos", allowedTools: ["training.get_orfa"] } },
      { callId: "c", toolName: "training.get_orfa", input: {} },
    );

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
    expect(auditadas[0]).toMatchObject({ status: "rejeitada", rejectionReason: "TOOL_UNKNOWN" });
  });

  // ⚠️ A regra central da fase: `user_id` não existe no schema de entrada, e `.strict()`
  // transforma "campo a mais" em erro. Se isto passar a executar, o modelo passa a escolher
  // de quem é o dado que ele lê.
  it("argumento com user_id é RECUSADO antes de qualquer leitura", async () => {
    const r = await executeTool(ctx, chamada({ dias: 7, user_id: "outro-usuario" }));

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
    expect(auditadas[0]).toMatchObject({
      status: "rejeitada",
      rejectionReason: "TOOL_INVALID_INPUT",
    });
  });

  it("argumento de tipo errado é recusado", async () => {
    const r = await executeTool(ctx, chamada({ dias: "sete" }));

    expect(r.isError).toBe(true);
    expect(chamadas).toEqual([]);
  });

  it("toda rejeição volta ao modelo como bloco não confiável, com o motivo", async () => {
    const r = await executeTool({ ...ctx, permissions: {} }, chamada());

    expect(r.block.untrusted).toBe(true);
    expect(r.block.source).toBe("resultado_de_ferramenta");
    expect(r.recordsRead).toBe(0);
    expect((r.block.content as { erro: string }).erro).toBe("TOOL_PERMISSION_DENIED");
    expect((r.block.content as { mensagem: string }).mensagem).toContain("autoriz");
  });
});

describe("executeTool — teto de registros", () => {
  it("poda pelo maxRecords do DESCRIPTOR e declara que a lista está parcial", async () => {
    respostaDaFerramenta = async () => saidaCom(5);

    const r = await executeTool(ctx, chamada());
    const saida = r.block.content as ToolOutput;

    expect(saida.itens).toHaveLength(2);
    expect(saida.refs).toHaveLength(2);
    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toContain("2 de 5");
  });

  // "Mostrando 50 de 51 registros" ao lado de `contagem: 1` faz o modelo relatar "50 de 51
  // treinos". O que foi podado tem NOME, e o nome mora no descriptor.
  it("a mensagem da poda NOMEIA o que foi podado, em vez de dizer 'registros'", async () => {
    respostaDaFerramenta = async () => saidaCom(5);

    const r = await executeTool(ctx, chamada());

    expect((r.block.content as ToolOutput).motivo_incompleto).toBe(
      "Mostrando 2 de 5 sessões de treino.",
    );
  });

  it("lista dentro do teto não vira parcial", async () => {
    respostaDaFerramenta = async () => saidaCom(2);

    const r = await executeTool(ctx, chamada());

    expect((r.block.content as ToolOutput).completude).toBe("exato");
    expect((r.block.content as ToolOutput).motivo_incompleto).toBeUndefined();
  });

  /**
   * ⚠️ Este teste passa pela poda DE VERDADE (5 itens com teto 2). A versão anterior usava
   * 1 item com teto 2 — nunca entrava no ramo que dizia estar testando, e passava com uma
   * implementação que apagava a ressalva do adapter.
   */
  it("a ressalva do adapter SOBREVIVE à poda — os dois motivos aparecem", async () => {
    respostaDaFerramenta = async () => ({
      ...saidaCom(5),
      completude: "parcial" as const,
      motivo_incompleto: "Séries sem peso corporal ficaram de fora.",
    });

    const r = await executeTool(ctx, chamada());
    const saida = r.block.content as ToolOutput;

    expect(saida.itens).toHaveLength(2);
    expect(saida.completude).toBe("parcial");
    // O do adapter…
    expect(saida.motivo_incompleto).toContain("peso corporal");
    // …e o da poda. Perder qualquer um dos dois é apresentar como completo o que não é.
    expect(saida.motivo_incompleto).toContain("2 de 5 sessões de treino");
  });
});

describe("executeTool — orçamento de caracteres do bloco não confiável", () => {
  /** Cada item ocupa ~5 kB: dois já estouram os 8 000 caracteres do envelope. */
  const saidaGorda = (itens: number): ToolOutput => ({
    ...saidaCom(itens),
    itens: Array.from({ length: itens }, (_, i) => ({
      n: i + 1,
      texto: "x".repeat(5000),
    })),
  });

  /**
   * Antes, `wrapUntrusted` cortava a string serializada no meio de um token JSON: o modelo
   * recebia `truncated: true` e `completude: "exato"` ao mesmo tempo, e relatava o total de
   * um período cujos últimos registros ele nunca viu.
   */
  it("corta ANTES do envelope, e o envelope não precisa truncar nada", async () => {
    respostaDaFerramenta = async () => saidaGorda(2);

    const r = await executeTool(ctx, chamada());
    const saida = r.block.content as ToolOutput;

    expect(r.block.truncated).toBe(false);
    expect(JSON.stringify(saida).length).toBeLessThanOrEqual(MAX_UNTRUSTED_CHARS);
    expect(saida.itens.length).toBeLessThan(2);
  });

  it("o corte por tamanho vira PARCIAL com o motivo, nunca um total mudo", async () => {
    respostaDaFerramenta = async () => saidaGorda(2);

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.completude).toBe("parcial");
    expect(saida.motivo_incompleto).toContain("não coube no limite de tamanho");
    expect(saida.motivo_incompleto).toContain("sessões de treino");
  });

  it("saída que cabe no envelope não é tocada pelo orçamento", async () => {
    respostaDaFerramenta = async () => saidaCom(2);

    const saida = (await executeTool(ctx, chamada())).block.content as ToolOutput;

    expect(saida.itens).toHaveLength(2);
    expect(saida.motivo_incompleto).toBeUndefined();
  });
});

describe("executeTool — falha e timeout", () => {
  it("ferramenta que estoura o tempo vira TOOL_TIMEOUT, não resposta vazia", async () => {
    respostaDaFerramenta = () => new Promise(() => {});

    const r = await executeTool(ctx, chamada());

    expect(r.isError).toBe(true);
    expect((r.block.content as { erro: string }).erro).toBe("TOOL_TIMEOUT");
    expect(auditadas[0]).toMatchObject({ status: "timeout", rejectionReason: "TOOL_TIMEOUT" });
  });

  it("erro da query não vaza detalhe interno para o modelo", async () => {
    respostaDaFerramenta = async () => {
      throw new Error('relation "training_sessions" does not exist — user_id 42');
    };

    const r = await executeTool(ctx, chamada());

    expect(r.isError).toBe(true);
    expect((r.block.content as { erro: string }).erro).toBe("TOOL_FAILED");
    expect(JSON.stringify(r.block)).not.toContain("training_sessions");
    expect(JSON.stringify(r.block)).not.toContain("user_id");
    expect(auditadas[0]).toMatchObject({ status: "falhou", rejectionReason: "TOOL_FAILED" });
  });

  /**
   * ⚠️ O QUE ESTE TESTE COBRE, E O QUE ELE NÃO COBRE.
   *
   * `supabase-js` NÃO LANÇA em erro de banco — devolve `{ error }`. Esse caminho é tratado
   * (e logado) dentro de `audit.ts`, e quem o exercita é `audit.test.ts`. O que ainda pode
   * LANÇAR antes da query é `createClient()`, que abre os cookies da requisição: é esse
   * cenário que o mock reproduz aqui.
   */
  it("exceção ANTES da query de auditoria não derruba a resposta do usuário", async () => {
    auditoriaFalha = true;

    const r = await executeTool(ctx, chamada());

    expect(r.isError).toBe(false);
    expect(r.recordsRead).toBe(1);
  });
});

describe("executeTool — a rejeição não é um oráculo do registry", () => {
  /**
   * "Não existe" e "existe, mas não é deste agente" com códigos ou textos distintos deixam o
   * modelo mapear o registry por sondagem: 20 chamadas, 20 respostas, e ele sabe quais
   * ferramentas os outros agentes têm. O motivo VERDADEIRO continua inteiro na auditoria.
   */
  it("nome inexistente e nome fora da allowlist devolvem a MESMA coisa ao modelo", async () => {
    const desconhecida = await executeTool(ctx, {
      callId: "c1",
      toolName: "finance.get_saldo",
      input: {},
    });
    const proibida = await executeTool(
      { ...ctx, agent: { id: "treinos", allowedTools: [] } },
      chamada(),
    );

    expect(desconhecida.block.content).toEqual(proibida.block.content);
    expect((desconhecida.block.content as { erro: string }).erro).toBe("TOOL_INDISPONIVEL");

    // …e a auditoria continua sabendo a diferença.
    expect(auditadas[0]).toMatchObject({ rejectionReason: "TOOL_UNKNOWN" });
    expect(auditadas[1]).toMatchObject({ rejectionReason: "TOOL_NOT_ALLOWED_FOR_AGENT" });
  });
});
