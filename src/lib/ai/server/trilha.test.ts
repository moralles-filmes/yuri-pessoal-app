/**
 * Coordenador · Task 10 — `runTrilha`, o laço de tentativas de UMA trilha.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE SÓ SE PROVA AQUI (o resto continua provado em `chat-runner.test.ts`)            ║
 * ║                                                                                       ║
 * ║  • `modo: "uma-chamada"` devolve as tool calls SEM executar — é o passo de decisão    ║
 * ║    do coordenador, e quem decide o que fazer com elas é ele, não o registry.          ║
 * ║  • `repetir: false` não abre segunda tentativa: especialista em paralelo que falha    ║
 * ║    está falho (spec §5.3).                                                            ║
 * ║  • a trilha e o tipo da primeira tentativa chegam a `startAttempt`, porque a trava    ║
 * ║    do banco passou a ser uma tentativa aberta POR TRILHA.                             ║
 * ║  • o `switch` (e o texto zerado) só sai em tentativa NOVA, nunca no TOOL_STEP.        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Borda dupla (provedor, banco, credencial), como em `chat-runner.test.ts`; o executor roda
 * de verdade, só espionado.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AiStreamEvent } from "@/lib/ai/core/contracts";
import { findModel, type AiModelEntry } from "@/lib/ai/core/models";
import type { ToolOutput } from "@/lib/ai/tools/contracts";

// ─────────────────────────── Duplos de borda ───────────────────────────

/** Quando ligado, decifrar a credencial LANÇA — a exceção inesperada de dentro da trilha. */
let credencialLanca = false;

vi.mock("./credential-store", () => ({
  resolveApiKey: async () => {
    if (credencialLanca) throw new Error("cofre fora do ar");
    return { ok: true, value: "sk-de-mentira" };
  },
}));

type LinhaDeMedicao =
  | {
      tipo: "start";
      id: string;
      attemptIndex: number;
      attemptType: string;
      trilha: number | undefined;
      promptVersion: string | null | undefined;
      agentId: string;
    }
  | { tipo: "close"; id: string; status: string };

const medicao: LinhaDeMedicao[] = [];

vi.mock("./run-store", () => ({
  startAttempt: async (input: {
    attemptIndex: number;
    attemptType: string;
    trilha?: number;
    promptVersion?: string | null;
    agentId: string;
  }) => {
    const id = `att-${input.attemptIndex}`;
    medicao.push({
      tipo: "start",
      id,
      attemptIndex: input.attemptIndex,
      attemptType: input.attemptType,
      trilha: input.trilha,
      promptVersion: input.promptVersion,
      agentId: input.agentId,
    });
    return { id, jaExistia: false };
  },
  closeAttempt: async (input: { attemptId: string; status: string }) => {
    medicao.push({ tipo: "close", id: input.attemptId, status: input.status });
  },
}));

let respostasPorChamada: (readonly AiStreamEvent[])[] = [];
let chamadasAoProvedor = 0;
/** O `abortSignal` que cada chamada recebeu — o da chamada abandonada tem de abortar. */
const sinaisRecebidos: (AbortSignal | undefined)[] = [];
/** O `maxOutputTokens` que cada chamada recebeu — é por aqui que o teto da trilha se prova. */
const tetosRecebidos: number[] = [];

vi.mock("@/lib/ai/providers/provider-factory", () => ({
  createProviderClient: () => ({
    provider: "openai",
    streamText: (request: { abortSignal?: AbortSignal; maxOutputTokens: number }) => {
      const indice = chamadasAoProvedor;
      chamadasAoProvedor += 1;
      sinaisRecebidos.push(request.abortSignal);
      tetosRecebidos.push(request.maxOutputTokens);
      const eventos = respostasPorChamada[indice] ?? [FINISH];
      return (async function* () {
        for (const e of eventos) yield e;
      })();
    },
    listModels: async () => ({ ok: true, value: [] }),
  }),
}));

const SAIDA: ToolOutput = {
  periodo: { de: "2026-07-31", ate: "2026-08-06" },
  contagem: 3,
  completude: "exato",
  agregados: { volume_kg: 12480 },
  itens: [{ data: "2026-08-05" }],
  refs: [{ tipo: "sessao_de_treino", id: "s1", rota: "/treinos/historico/s1" }],
};

/** Roda DENTRO da ferramenta: é por aqui que um caso cancela ou gasta o prazo durante a leitura. */
let aoExecutarFerramenta: (() => void) | null = null;

vi.mock("@/lib/ai/tools/executors", () => ({
  TOOL_EXECUTORS: {
    "training.get_volume": {
      schema: z.object({ dias: z.number().int().optional() }).strict(),
      run: async () => {
        aoExecutarFerramenta?.();
        return SAIDA;
      },
    },
  },
}));

/** O executor REAL, só espionado — é a prova de que `uma-chamada` não o alcança. */
vi.mock("@/lib/ai/tools/executor", async (original) => {
  const real = await original<typeof import("@/lib/ai/tools/executor")>();
  return { ...real, executeTool: vi.fn(real.executeTool) };
});

const passosAbertos: { stepIndex: number; kind: string }[] = [];
const passosFechados: { stepId: string; status: string }[] = [];

vi.mock("@/lib/ai/tools/audit", () => ({
  startStep: async (input: { stepIndex: number; kind: string }) => {
    passosAbertos.push({ stepIndex: input.stepIndex, kind: input.kind });
    return `step-${passosAbertos.length}`;
  },
  closeStep: async (input: { stepId: string; status: string }) => {
    passosFechados.push({ stepId: input.stepId, status: input.status });
  },
  recordToolCall: async () => {},
}));

const { runTrilha } = await import("./trilha");
const { executeTool } = await import("@/lib/ai/tools/executor");
const { criarPrazo } = await import("./prazo");
const { rateFor } = await import("@/lib/ai/core/pricing");
const { estimarTokensDeEntrada, projetarCustoDoDestino } = await import(
  "@/lib/ai/usage/reservation"
);
const { MAX_ESPECIALISTAS } = await import("@/lib/ai/agents/especialistas");
type EntradaDaTrilha = Parameters<typeof runTrilha>[0];

// ─────────────────────────── Fixtures ───────────────────────────

const FINISH: AiStreamEvent = {
  type: "finish",
  finishReason: "stop",
  usage: {
    inputTokens: 100,
    outputTokens: 20,
    cachedInputTokens: null,
    availability: {
      inputTokens: "available",
      outputTokens: "available",
      cachedInputTokens: "unavailable",
    },
  },
  providerRequestId: "req",
};

const ERRO_TEMPORARIO: AiStreamEvent = {
  type: "error",
  error: {
    class: "ERRO_TEMPORARIO",
    code: "PROVIDER_5XX",
    message: "O provedor teve uma falha temporária.",
    retryable: true,
  },
};

/** O modelo REAL do catálogo, com tarifa: `rateFor` roda de verdade dentro da trilha. */
const MODELO: AiModelEntry = findModel("openai", "gpt-5.6-terra")!;

const DEFINICAO_VOLUME = {
  name: "training.get_volume",
  description: "volume",
  inputSchema: {},
};

const DEFINICAO_ACIONAR = {
  name: "acionar_financeiro",
  description: "aciona o especialista de Finanças",
  inputSchema: {},
};

let indiceDeTentativa = 0;
let indiceDePasso = 0;

function entrada(parcial: Partial<EntradaDaTrilha> = {}): EntradaDaTrilha {
  return {
    run: { runId: "run-1", conversationId: "conv-1", userId: "user-1" },
    trilha: 0,
    agente: { id: "treinos", allowedTools: ["training.get_volume"] },
    promptVersion: "treinos-v9",
    system: "SISTEMA",
    mensagens: [{ role: "user", content: "qual meu volume?" }],
    definicoes: [DEFINICAO_VOLUME],
    modo: "laco",
    alvos: [{ provider: "openai", model: MODELO }],
    config: { timeoutMs: 30_000, maxRetries: 1 },
    fallbackLigado: false,
    repetir: true,
    tetoDeSaida: Number.POSITIVE_INFINITY,
    primeiroTipo: "PRIMARY",
    permissions: { allow_training: true },
    writePermissions: {},
    contadores: {
      proximoAttemptIndex: () => (indiceDeTentativa += 1),
      proximoStepIndex: () => (indiceDePasso += 1),
      contarFallback: () => {},
    },
    prazo: criarPrazo(0),
    agoraMs: () => 0,
    abortSignal: new AbortController().signal,
    hoje: "2026-08-06",
    reservaRestante: () => 10,
    aoGastar: () => {},
    promptMontado: "SISTEMA qual meu volume?",
    ...parcial,
  };
}

async function rodar(e: EntradaDaTrilha) {
  const eventos: Record<string, unknown>[] = [];
  const gen = runTrilha(e);
  for (;;) {
    const r = await gen.next();
    if (r.done) return { eventos, desfecho: r.value };
    eventos.push(r.value as unknown as Record<string, unknown>);
  }
}

beforeEach(() => {
  medicao.length = 0;
  passosAbertos.length = 0;
  passosFechados.length = 0;
  respostasPorChamada = [];
  chamadasAoProvedor = 0;
  indiceDeTentativa = 0;
  indiceDePasso = 0;
  vi.mocked(executeTool).mockClear();
  credencialLanca = false;
  sinaisRecebidos.length = 0;
  tetosRecebidos.length = 0;
  aoExecutarFerramenta = null;
});

// ────────────────────────────────────────────────────────────────

describe("runTrilha — modo uma-chamada", () => {
  it("devolve as tool calls sem executar nada", async () => {
    respostasPorChamada = [
      [
        { type: "delta", text: "Vou consultar." },
        {
          type: "tool-call",
          toolName: "acionar_financeiro",
          callId: "call-9",
          input: { tarefa: "gasto de outubro" },
          metadadosDoProvedor: { assinatura: "abc" },
        },
        FINISH,
      ],
    ];

    const { eventos, desfecho } = await rodar(
      entrada({ modo: "uma-chamada", definicoes: [DEFINICAO_ACIONAR] }),
    );

    expect(executeTool).not.toHaveBeenCalled();
    expect(chamadasAoProvedor).toBe(1);
    expect(desfecho).toMatchObject({
      ok: true,
      texto: "Vou consultar.",
      finishReason: "stop",
      stepIndex: 1,
      chamadas: [
        {
          callId: "call-9",
          toolName: "acionar_financeiro",
          input: { tarefa: "gasto de outubro" },
          metadadosDoProvedor: { assinatura: "abc" },
        },
      ],
    });
    // Os deltas saem: quem decide retê-los é o coordenador.
    expect(eventos).toEqual([{ type: "delta", text: "Vou consultar." }]);
    // O passo `modelo` é registrado como o tool-loop registra — e só ele.
    expect(passosAbertos).toEqual([{ stepIndex: 1, kind: "modelo" }]);
    expect(passosFechados).toEqual([{ stepId: "step-1", status: "completed" }]);
    // A tentativa fecha antes de a trilha devolver o desfecho.
    expect(medicao.map((m) => `${m.tipo}:${m.id}`)).toEqual(["start:att-1", "close:att-1"]);
  });

  it("nome fora das definições termina com UNEXPECTED_TOOL_CALL", async () => {
    respostasPorChamada = [
      [
        { type: "tool-call", toolName: "apagar_tudo", callId: "x", input: {} },
        FINISH,
      ],
    ];

    const { desfecho } = await rodar(
      entrada({ modo: "uma-chamada", definicoes: [DEFINICAO_ACIONAR] }),
    );

    expect(desfecho).toMatchObject({
      ok: false,
      cancelado: false,
      erro: { code: "UNEXPECTED_TOOL_CALL" },
    });
    expect(executeTool).not.toHaveBeenCalled();
    expect(passosFechados).toEqual([{ stepId: "step-1", status: "failed" }]);
  });
});

describe("runTrilha — tentativas", () => {
  it("repetir: false não abre segunda tentativa depois de 5xx", async () => {
    respostasPorChamada = [
      [{ type: "delta", text: "deixa eu ver" }, ERRO_TEMPORARIO],
      [{ type: "delta", text: "não deveria chegar aqui" }, FINISH],
    ];

    const { desfecho } = await rodar(entrada({ repetir: false }));

    expect(medicao.filter((m) => m.tipo === "start")).toHaveLength(1);
    expect(chamadasAoProvedor).toBe(1);
    expect(desfecho).toMatchObject({
      ok: false,
      cancelado: false,
      erro: { code: "PROVIDER_5XX" },
    });
  });

  it("primeiroTipo ESPECIALISTA e trilha 2 chegam ao startAttempt", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar(
      entrada({
        primeiroTipo: "ESPECIALISTA",
        trilha: 2,
        agente: { id: "financeiro", allowedTools: [] },
        promptVersion: "financeiro-v4",
      }),
    );

    expect(medicao[0]).toEqual({
      tipo: "start",
      id: "att-1",
      attemptIndex: 1,
      attemptType: "ESPECIALISTA",
      trilha: 2,
      promptVersion: "financeiro-v4",
      agentId: "financeiro",
    });
  });

  it("o switch só sai em tentativa nova — nunca no TOOL_STEP", async () => {
    respostasPorChamada = [
      // PRIMARY: escreve, pede ferramenta.
      [
        { type: "delta", text: "Deixa eu consultar. " },
        { type: "tool-call", toolName: "training.get_volume", callId: "c1", input: { dias: 7 } },
        FINISH,
      ],
      // TOOL_STEP: cai.
      [{ type: "delta", text: "Foram" }, ERRO_TEMPORARIO],
      // RETRY: responde.
      [{ type: "delta", text: "Foram 12480 kg." }, FINISH],
    ];

    const { eventos, desfecho } = await rodar(entrada());

    expect(eventos.map((e) => e.type)).toEqual([
      "delta", // PRIMARY
      "tool",
      "delta", // TOOL_STEP — sem switch antes dele
      "switch", // o RETRY é tentativa nova
      "delta",
    ]);
    expect(medicao.filter((m) => m.tipo === "start").map((m) => m.attemptType)).toEqual([
      "PRIMARY",
      "TOOL_STEP",
      "RETRY",
    ]);
    // O texto do desfecho é só o da tentativa que venceu: o switch zerou o que veio antes.
    expect(desfecho).toMatchObject({ ok: true, texto: "Foram 12480 kg.", stepIndex: null });
  });
});

// ────────────────────────────────────────────────────────────────
// Minors herdados da revisão da Task 4 (MOD-ia-005)
// ────────────────────────────────────────────────────────────────

const PEDE_VOLUME_E_TERMINA: readonly AiStreamEvent[] = [
  { type: "tool-call", toolName: "training.get_volume", callId: "c1", input: { dias: 7 } },
  FINISH,
];

describe("runTrilha — não abre o que não vai acontecer", () => {
  /**
   * O dono cancelou ENQUANTO a ferramenta rodava. Abrir a tentativa TOOL_STEP com o sinal já
   * abortado gravava uma linha em `ai_usage_events` para uma chamada condenada antes de sair.
   */
  it("TOOL_STEP não abre tentativa com o sinal já abortado", async () => {
    const dono = new AbortController();
    aoExecutarFerramenta = () => dono.abort();
    respostasPorChamada = [PEDE_VOLUME_E_TERMINA, [{ type: "delta", text: "x" }, FINISH]];

    const { desfecho } = await rodar(entrada({ abortSignal: dono.signal }));

    expect(chamadasAoProvedor).toBe(1);
    // A do passo 0 terminou de verdade (o provedor mandou `finish`): fecha `completed`.
    expect(medicao.map((m) => `${m.tipo}:${m.id}${m.tipo === "close" ? `:${m.status}` : ""}`)).toEqual([
      "start:att-1",
      "close:att-1:completed",
    ]);
    expect(passosAbertos.map((p) => `${p.stepIndex}:${p.kind}`)).toEqual([
      "1:modelo",
      "1:ferramentas",
    ]);
    expect(desfecho).toMatchObject({ ok: false, cancelado: true });
  });

  /**
   * O prazo acabou durante a ferramenta. A tentativa não abria (Task 4), mas o passo `modelo`
   * sim — e fechava `failed` com ~0 ms, registrando na trilha uma chamada que não houve.
   */
  it("passo recusado pelo prazo não abre o passo `modelo`", async () => {
    let relogio = 0;
    aoExecutarFerramenta = () => {
      relogio = 52_000;
    };
    respostasPorChamada = [PEDE_VOLUME_E_TERMINA, [{ type: "delta", text: "x" }, FINISH]];

    const { desfecho } = await rodar(entrada({ agoraMs: () => relogio }));

    expect(chamadasAoProvedor).toBe(1);
    // Nenhuma tentativa TOOL_STEP aberta; a do passo 0 terminou de verdade e fecha `completed`.
    expect(medicao.map((m) => `${m.tipo}:${m.id}${m.tipo === "close" ? `:${m.status}` : ""}`)).toEqual([
      "start:att-1",
      "close:att-1:completed",
    ]);
    expect(passosAbertos.map((p) => `${p.stepIndex}:${p.kind}`)).toEqual([
      "1:modelo",
      "1:ferramentas",
    ]);
    expect(desfecho).toMatchObject({ ok: false, erro: { code: "AI_DEADLINE" } });
  });
});

describe("runTrilha — o fechamento da tentativa aberta", () => {
  /**
   * Exceção DE DENTRO da trilha (banco, cofre) não é cancelamento: ninguém cancelou nada. Ela
   * fecha `failed` e sobe; `cancelled` fica para o abandono pelo consumidor (`return()`).
   */
  it("exceção inesperada fecha a tentativa como `failed`, não `cancelled`", async () => {
    credencialLanca = true;
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await expect(rodar(entrada())).rejects.toThrow("cofre fora do ar");

    expect(medicao.map((m) => `${m.tipo}:${m.id}${m.tipo === "close" ? `:${m.status}` : ""}`)).toEqual([
      "start:att-1",
      "close:att-1:failed",
    ]);
  });

  /**
   * `return()` do consumidor (a aba fechada) no meio do stream. Sem abortar o sinal, o
   * provedor continuava gerando — e cobrando — uma resposta que ninguém ia ler.
   */
  it("`return()` no meio do stream aborta o sinal da chamada", async () => {
    respostasPorChamada = [
      [
        { type: "delta", text: "primeiro" },
        { type: "delta", text: " segundo" },
        FINISH,
      ],
    ];

    const gen = runTrilha(entrada());
    const primeiro = await gen.next();
    expect(primeiro.value).toEqual({ type: "delta", text: "primeiro" });

    await gen.return({
      ok: false,
      erro: { class: "CANCELADO_PELO_USUARIO", code: "CANCELLED", message: "", retryable: false },
      cancelado: true,
    });

    expect(sinaisRecebidos).toHaveLength(1);
    expect(sinaisRecebidos[0]?.aborted).toBe(true);
    expect(medicao.map((m) => `${m.tipo}:${m.id}${m.tipo === "close" ? `:${m.status}` : ""}`)).toEqual([
      "start:att-1",
      "close:att-1:cancelled",
    ]);
  });
});

// ────────────────────────────────────────────────────────────────
// Rodada pós-revisão da Task 10
// ────────────────────────────────────────────────────────────────

/** Um segundo alvo de OUTRO provedor e outro modelo, também do catálogo real (com tarifa). */
const MODELO_FALLBACK: AiModelEntry = findModel("gemini", "gemini-3.6-flash")!;

describe("runTrilha — fallback e teto de saída", () => {
  it("o caminho FALLBACK: tipo na 2ª tentativa, contarFallback uma vez e switch com texto zerado", async () => {
    const contarFallback = vi.fn();
    respostasPorChamada = [
      [{ type: "delta", text: "Vou olhar seus tre" }, ERRO_TEMPORARIO],
      [{ type: "delta", text: "Foram 12480 kg." }, FINISH],
    ];

    const { eventos, desfecho } = await rodar(
      entrada({
        alvos: [
          { provider: "openai", model: MODELO },
          { provider: "gemini", model: MODELO_FALLBACK },
        ],
        fallbackLigado: true,
        // Sem retry: o transitório vai direto para o próximo alvo.
        config: { timeoutMs: 30_000, maxRetries: 0 },
        contadores: {
          proximoAttemptIndex: () => (indiceDeTentativa += 1),
          proximoStepIndex: () => (indiceDePasso += 1),
          contarFallback,
        },
      }),
    );

    expect(medicao.filter((m) => m.tipo === "start").map((m) => m.attemptType)).toEqual([
      "PRIMARY",
      "FALLBACK",
    ]);
    expect(contarFallback).toHaveBeenCalledTimes(1);
    expect(eventos).toContainEqual({
      type: "switch",
      provider: "gemini",
      model: "gemini-3.6-flash",
      motivo: "Continuando em outro provedor.",
    });
    // O texto da tentativa que caiu não atravessa o switch.
    expect(desfecho).toMatchObject({
      ok: true,
      texto: "Foram 12480 kg.",
      alvo: { provider: "gemini" },
    });
  });

  /**
   * O teto FINITO da trilha (o passo de decisão do coordenador, o especialista em paralelo)
   * vale nas duas pontas: no que o adapter recebe e no custo projetado do fallback. Se a
   * projeção usasse o teto do modelo, o orçamento recusaria um fallback que cabe.
   */
  it("teto finito menor que o do modelo: o adapter o recebe, e a projeção do fallback também", async () => {
    const teto = 500;
    expect(teto).toBeLessThan(MODELO_FALLBACK.outputCapTokens);
    const promptMontado = "SISTEMA qual meu volume?";
    const tarifa = rateFor("gemini", MODELO_FALLBACK.id, "2026-08-06")!;
    const tokens = estimarTokensDeEntrada(promptMontado);
    const comTeto = projetarCustoDoDestino(tarifa, tokens, teto);
    const comCap = projetarCustoDoDestino(tarifa, tokens, MODELO_FALLBACK.outputCapTokens);
    expect(comTeto).toBeLessThan(comCap);

    respostasPorChamada = [
      [ERRO_TEMPORARIO],
      [{ type: "delta", text: "ok" }, FINISH],
    ];

    const { desfecho } = await rodar(
      entrada({
        alvos: [
          { provider: "openai", model: MODELO },
          { provider: "gemini", model: MODELO_FALLBACK },
        ],
        fallbackLigado: true,
        config: { timeoutMs: 30_000, maxRetries: 0 },
        tetoDeSaida: teto,
        promptMontado,
        // A sobra fica ENTRE as duas projeções: cabe com o teto da trilha, não cabe com o do
        // modelo. Só a projeção pelo teto deixa o fallback acontecer.
        reservaRestante: () => (comTeto + comCap) / 2,
      }),
    );

    expect(tetosRecebidos).toEqual([teto, teto]);
    expect(medicao.filter((m) => m.tipo === "start").map((m) => m.attemptType)).toEqual([
      "PRIMARY",
      "FALLBACK",
    ]);
    expect(desfecho).toMatchObject({ ok: true, texto: "ok" });
  });
});

describe("runTrilha — coerência entre primeiroTipo e trilha", () => {
  /**
   * O banco tem a mesma regra (`ai_usage_events_tipo_coerente_com_trilha`), mas lá ela viraria
   * `startAttempt → null → ATTEMPT_NOT_RECORDED`: uma "falha de registro" na tela do dono para
   * o que é erro de quem chamou. Aqui ela é recusada antes de qualquer I/O.
   */
  it.each([
    { primeiroTipo: "PRIMARY" as const, trilha: 1 },
    { primeiroTipo: "ESPECIALISTA" as const, trilha: 0 },
    { primeiroTipo: "ESPECIALISTA" as const, trilha: MAX_ESPECIALISTAS + 1 },
    { primeiroTipo: "ESPECIALISTA" as const, trilha: 1.5 },
  ])("$primeiroTipo na trilha $trilha é erro de programação, sem tocar o banco", async (caso) => {
    await expect(rodar(entrada(caso))).rejects.toThrow(/trilha/);
    expect(medicao).toEqual([]);
    expect(passosAbertos).toEqual([]);
    expect(chamadasAoProvedor).toBe(0);
  });

  it.each([
    { primeiroTipo: "PRIMARY" as const, trilha: 0 },
    { primeiroTipo: "ESPECIALISTA" as const, trilha: 1 },
    { primeiroTipo: "ESPECIALISTA" as const, trilha: MAX_ESPECIALISTAS },
  ])("$primeiroTipo na trilha $trilha é aceito", async (caso) => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];
    const { desfecho } = await rodar(entrada(caso));
    expect(desfecho).toMatchObject({ ok: true });
  });
});
