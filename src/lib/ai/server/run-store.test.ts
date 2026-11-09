import { beforeEach, describe, expect, it, vi } from "vitest";

// `run-store` importa o client Supabase com cookies; aqui só a tabela de frases importa.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

/** O que `registrarAcionamento` entrega à auditoria. A gravação em si é assunto de `audit.test.ts`. */
const auditadas: Record<string, unknown>[] = [];
vi.mock("@/lib/ai/tools/audit", () => ({
  recordToolCall: async (input: Record<string, unknown>) => {
    auditadas.push(input);
    return "tool-call-1";
  },
}));

import { ROTULO_CRUZAR_MODULOS } from "@/lib/ai/constants";
import { MAX_TAREFA_CHARS, TOOL_NAME_ACIONAMENTO } from "@/lib/ai/agents/especialistas";
import { AI_RATE_TABLE } from "@/lib/ai/core/pricing";
import type { ClienteDaIa } from "./client";
import { MENSAGEM_ADMISSAO, registrarAcionamento, startAttempt } from "./run-store";

describe("mensagens de admissão que nomeiam chave da tela", () => {
  it("AI_CROSS_MODULE_NOT_ALLOWED cita o rótulo real do interruptor, nunca o texto escrito de novo", () => {
    const m = MENSAGEM_ADMISSAO.AI_CROSS_MODULE_NOT_ALLOWED;
    expect(m).toContain(`“${ROTULO_CRUZAR_MODULOS}”`);
    expect(m).toContain("/ia/configuracoes");
    expect(m).not.toMatch(/Panoramas de vários módulos/);
  });
});

// ─────────────────────────── startAttempt ───────────────────────────

type Linha = Record<string, unknown>;

/**
 * Cliente de mentira com o encadeamento que `startAttempt` usa:
 * `.insert().select().single()` e `.select().eq().eq()….maybeSingle()`.
 *
 * O `maybeSingle` aplica DE VERDADE os filtros pedidos sobre `existentes` — é isso que permite
 * provar que a busca da linha "já aplicada" é pelo `attempt_index`, e não por qualquer linha do
 * run (que seria reaproveitar a tentativa aberta de outra chamada).
 */
function clienteFalso(opcoes: {
  readonly respostaDoInsert: { data: Linha | null; error: { code: string } | null };
  readonly existentes?: readonly Linha[];
}) {
  const inserts: Linha[] = [];
  const cliente = {
    from: () => ({
      insert: (payload: Linha) => {
        inserts.push(payload);
        return {
          select: () => ({ single: async () => opcoes.respostaDoInsert }),
        };
      },
      select: () => {
        const filtros: [string, unknown][] = [];
        const encadeado = {
          eq: (coluna: string, valor: unknown) => {
            filtros.push([coluna, valor]);
            return encadeado;
          },
          maybeSingle: async () => ({
            data:
              (opcoes.existentes ?? []).find((l) => filtros.every(([c, v]) => l[c] === v)) ?? null,
            error: null,
          }),
        };
        return encadeado;
      },
    }),
  };
  return { cliente: cliente as unknown as ClienteDaIa, inserts };
}

const TARIFA = AI_RATE_TABLE[0];

const tentativa = (extra: Record<string, unknown> = {}) => ({
  runId: "run-1",
  userId: "user-1",
  conversationId: "conv-1",
  agentId: "financeiro",
  attemptIndex: 4,
  attemptType: "ESPECIALISTA" as const,
  provider: TARIFA.provider,
  modelId: TARIFA.modelId,
  rate: TARIFA,
  ...extra,
});

describe("startAttempt — trilha e versão de prompt", () => {
  it("grava a trilha e a versão de prompt recebidas", async () => {
    const { cliente, inserts } = clienteFalso({
      respostaDoInsert: { data: { id: "ev-1" }, error: null },
    });

    const r = await startAttempt(
      tentativa({ client: cliente, trilha: 3, promptVersion: "seguranca-v3+financeiro-v3" }),
    );

    expect(r).toEqual({ id: "ev-1", jaExistia: false });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      trilha: 3,
      prompt_version: "seguranca-v3+financeiro-v3",
      attempt_type: "ESPECIALISTA",
    });
  });

  it("sem os campos, a trilha é 0 (o coordenador) e a versão é NULA — nunca um chute", async () => {
    const { cliente, inserts } = clienteFalso({
      respostaDoInsert: { data: { id: "ev-1" }, error: null },
    });

    await startAttempt(tentativa({ client: cliente, attemptType: "PRIMARY", attemptIndex: 1 }));

    expect(inserts[0].trilha).toBe(0);
    expect(inserts[0].prompt_version).toBeNull();
  });
});

describe("startAttempt — 23505 nem sempre é a MESMA tentativa", () => {
  it("23505 com linha do mesmo attempt_index devolve a existente (idempotência de sempre)", async () => {
    const { cliente } = clienteFalso({
      respostaDoInsert: { data: null, error: { code: "23505" } },
      existentes: [{ id: "ev-antiga", run_id: "run-1", attempt_index: 4, trilha: 3 }],
    });

    const r = await startAttempt(tentativa({ client: cliente, trilha: 3 }));

    expect(r).toEqual({ id: "ev-antiga", jaExistia: true });
  });

  /**
   * ⛔ O índice `ai_usage_events_one_active_per_trilha_uidx` também dá `23505`: outra tentativa
   * AINDA ABERTA na mesma trilha, com OUTRO `attempt_index`. Aquela linha é de outra chamada —
   * devolvê-la como "já aplicada" faria duas chamadas pagas fecharem a mesma tentativa, e uma
   * delas ficaria sem medição.
   */
  it("23505 sem linha com o mesmo attempt_index (trava de trilha) devolve null", async () => {
    const { cliente } = clienteFalso({
      respostaDoInsert: { data: null, error: { code: "23505" } },
      existentes: [{ id: "ev-aberta", run_id: "run-1", attempt_index: 3, trilha: 3 }],
    });

    const r = await startAttempt(tentativa({ client: cliente, trilha: 3 }));

    expect(r).toBeNull();
  });

  it("linha com o mesmo attempt_index mas em OUTRA trilha não é a mesma tentativa", async () => {
    const { cliente } = clienteFalso({
      respostaDoInsert: { data: null, error: { code: "23505" } },
      existentes: [{ id: "ev-outra-trilha", run_id: "run-1", attempt_index: 4, trilha: 2 }],
    });

    const r = await startAttempt(tentativa({ client: cliente, trilha: 3 }));

    expect(r).toBeNull();
  });
});

// ─────────────────────────── registrarAcionamento ───────────────────────────

describe("registrarAcionamento — grava o PEDIDO, nunca a resposta", () => {
  beforeEach(() => {
    auditadas.length = 0;
  });

  const acionar = (tarefa: string) =>
    registrarAcionamento({
      runId: "run-1",
      userId: "user-1",
      stepId: "step-1",
      especialistaId: "financeiro",
      tarefa,
      providerCallId: "call-7",
      status: "executada",
      rejectionReason: null,
    });

  it("grava como coordenador.acionar, pelo coordenador, sem leitura nem referência", async () => {
    const id = await acionar("Quanto gastei com mercado em setembro?");

    expect(id).toBe("tool-call-1");
    expect(auditadas).toHaveLength(1);
    expect(auditadas[0]).toEqual({
      runId: "run-1",
      userId: "user-1",
      stepId: "step-1",
      toolName: TOOL_NAME_ACIONAMENTO,
      toolVersion: "v1",
      providerCallId: "call-7",
      argumentos: {
        especialista: "financeiro",
        tarefa: "Quanto gastei com mercado em setembro?",
      },
      status: "executada",
      rejectionReason: null,
      recordsRead: null,
      durationMs: 0,
      refs: [],
      agentId: "assistente-pessoal",
    });
  });

  it(`corta a tarefa em ${MAX_TAREFA_CHARS} caracteres antes de gravar`, async () => {
    await acionar("a".repeat(MAX_TAREFA_CHARS + 200));

    const argumentos = auditadas[0].argumentos as { tarefa: string };
    expect(argumentos.tarefa).toHaveLength(MAX_TAREFA_CHARS);
  });

  it("a recusa também é registrada, com o motivo", async () => {
    await registrarAcionamento({
      runId: "run-1",
      userId: "user-1",
      stepId: "step-1",
      especialistaId: "dieta",
      tarefa: "x",
      providerCallId: null,
      status: "rejeitada",
      rejectionReason: "TOOL_PERMISSION_DENIED",
    });

    expect(auditadas[0]).toMatchObject({
      status: "rejeitada",
      rejectionReason: "TOOL_PERMISSION_DENIED",
      providerCallId: null,
    });
  });
});
