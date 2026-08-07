/**
 * Fase 18-B — IA · O chat-runner COM o laço de ferramentas.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE SÓ SE PROVA AQUI (e não no `tool-loop.test.ts`)                                 ║
 * ║                                                                                       ║
 * ║  • `ai_usage_events_one_active_uidx` é `UNIQUE (run_id) WHERE status = 'started'`:    ║
 * ║    abrir a tentativa do passo N+1 com a do passo N aberta é `23505` EM RUNTIME. É      ║
 * ║    constraint de banco — nenhum teste de unidade da medição pega. O que dá para        ║
 * ║    provar sem banco é a ORDEM das chamadas, e é o que este arquivo faz.                ║
 * ║  • cada chamada ao modelo vira UMA linha de medição: `PRIMARY` e depois `TOOL_STEP`.   ║
 * ║  • o agente sai do ROTEADOR, com as flags do usuário — não do que o cliente pediu.     ║
 * ║  • o corte pelo teto de passos entra no TEXTO da resposta gravada.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Tudo que é borda (provedor, banco, credencial) é duplo; roteador, registry, guard,
 * executor, reserva e prompt rodam de verdade.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AiStreamEvent } from "@/lib/ai/core/contracts";
import type { ToolOutput } from "@/lib/ai/tools/contracts";
import { MAX_TOOL_STEPS } from "@/lib/ai/tools/limits";
import { AVISO_TETO_DE_PASSOS } from "@/lib/ai/tools/limits";

// ─────────────────────────── Duplos de borda ───────────────────────────

vi.mock("./crypto-readiness", () => ({
  AI_CRYPTO_NOT_CONFIGURED: "AI_CRYPTO_NOT_CONFIGURED",
  getCryptoReadiness: () => ({ ready: true, message: "" }),
}));

vi.mock("./credential-store", () => ({
  resolveApiKey: async () => ({ ok: true, value: "sk-de-mentira" }),
}));

/** Preferências do usuário, trocáveis por teste. */
let permissoes: Record<string, boolean> = { allow_training: true };

vi.mock("@/lib/ai/queries", () => ({
  getRouterConfigs: async () => [
    {
      provider: "openai",
      enabled: true,
      defaultModel: "gpt-5.6-terra",
      economyModel: null,
      advancedModel: null,
      visionModel: null,
      fallbackAllowed: false,
      fallbackOrder: [],
      maxRetries: 1,
      timeoutMs: 30_000,
      hasUsableCredential: true,
    },
  ],
  getAiPreferences: async () => ({
    defaultProvider: "openai",
    defaultModel: "gpt-5.6-terra",
    confirmationMode: "seguro",
    allowFallback: false,
    dailyBudget: null,
    monthlyBudget: null,
    budgetBlockOnLimit: true,
    budgetAlertLevelReached: 0,
    reservationMargin: 1.15,
    rateLimitPerMinute: 10,
    rateLimitPerHour: 120,
    permissions: permissoes,
  }),
  getHistoryForPrompt: async () => [],
}));

type Evento =
  | { tipo: "start"; id: string; attemptIndex: number; attemptType: string }
  | { tipo: "close"; id: string; status: string };

/** A linha do tempo da MEDIÇÃO. É sobre ela que a ordem é verificada. */
const medicao: Evento[] = [];
let reservaGravada = 0;
let textoGravado = "";
let statusDoRun = "";

vi.mock("./run-store", () => ({
  HEARTBEAT_INTERVAL_MS: 10_000,
  beginChatRun: async (input: { reservedCost: number }) => {
    reservaGravada = input.reservedCost;
    return {
      ok: true,
      value: {
        conversationId: "conv-1",
        userMessageId: "msg-u",
        runId: "run-1",
        assistantMessageId: "msg-a",
        correlationId: "corr-1",
      },
    };
  },
  startAttempt: async (input: { attemptIndex: number; attemptType: string }) => {
    const id = `att-${input.attemptIndex}`;
    medicao.push({
      tipo: "start",
      id,
      attemptIndex: input.attemptIndex,
      attemptType: input.attemptType,
    });
    return { id, jaExistia: false };
  },
  closeAttempt: async (input: { attemptId: string; status: string }) => {
    medicao.push({ tipo: "close", id: input.attemptId, status: input.status });
  },
  markStreaming: async () => {},
  heartbeatAndPersist: async () => {},
  completeRun: async (input: { textoFinal: string }) => {
    statusDoRun = "completed";
    textoGravado = input.textoFinal;
  },
  cancelRun: async (input: { textoFinal: string }) => {
    statusDoRun = "cancelled";
    textoGravado = input.textoFinal;
  },
  failRun: async (input: { textoFinal: string }) => {
    statusDoRun = "failed";
    textoGravado = input.textoFinal;
  },
}));

/** O "provedor": devolve os eventos programados para cada chamada, na ordem. */
let respostasPorChamada: (readonly AiStreamEvent[])[] = [];
const systemsRecebidos: string[] = [];
const ferramentasRecebidas: string[][] = [];

vi.mock("@/lib/ai/providers/provider-factory", () => ({
  createProviderClient: () => ({
    provider: "openai",
    streamText: (request: {
      system: string;
      tools: readonly { name: string }[];
    }) => {
      const indice = systemsRecebidos.length;
      systemsRecebidos.push(request.system);
      ferramentasRecebidas.push(request.tools.map((t) => t.name));
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

const ferramentaRodou: unknown[] = [];

vi.mock("@/lib/ai/tools/executors", () => ({
  TOOL_EXECUTORS: {
    "training.get_volume": {
      schema: z.object({ dias: z.number().int().optional() }).strict(),
      run: async (input: unknown) => {
        ferramentaRodou.push(input);
        return SAIDA;
      },
    },
  },
}));

/**
 * ⚠️ ESTE DUPLO MODELA A CHAVE ÚNICA — é a mesma disciplina do bloco de medição acima.
 *
 * `ai_run_steps_run_index_uidx` é `UNIQUE (run_id, step_index, kind)`, e `run_id` é UM SÓ para
 * toda a cadeia de tentativas (`beginChatRun` roda antes do laço de retry/fallback). Chave
 * repetida é `23505`, e `audit.ts` LOGA E DEVOLVE `null` em vez de lançar — daí o laço
 * bloqueia a leitura ("sem trilha, sem leitura"). Um duplo que devolvesse id novo para
 * qualquer entrada tornaria esse defeito invisível, que foi exatamente o que aconteceu.
 */
const passosDoRun: { stepIndex: number; kind: string; stepId: string | null }[] = [];
const passosFechados: { stepId: string; status: string }[] = [];
const chavesDePasso = new Set<string>();

vi.mock("@/lib/ai/tools/audit", () => ({
  startStep: async (input: { runId: string; stepIndex: number; kind: string }) => {
    // `check (step_index >= 1)` da migration — o duplo recusa o que o banco recusaria.
    if (input.stepIndex < 1) {
      passosDoRun.push({ stepIndex: input.stepIndex, kind: input.kind, stepId: null });
      return null;
    }
    const chave = `${input.runId}|${input.stepIndex}|${input.kind}`;
    if (chavesDePasso.has(chave)) {
      passosDoRun.push({ stepIndex: input.stepIndex, kind: input.kind, stepId: null });
      return null;
    }
    chavesDePasso.add(chave);
    const stepId = `step-${chavesDePasso.size}`;
    passosDoRun.push({ stepIndex: input.stepIndex, kind: input.kind, stepId });
    return stepId;
  },
  closeStep: async (input: { stepId: string; status: string }) => {
    passosFechados.push({ stepId: input.stepId, status: input.status });
  },
  recordToolCall: async () => {},
}));

const { runChat } = await import("./chat-runner");
type ChatRunnerInput = Parameters<typeof runChat>[0];
const { AVISO_SEM_AUDITORIA } = await import("./tool-loop");

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

/** Um 5xx do provedor no meio do stream: transitório, logo `decideFallback` manda repetir. */
const ERRO_TEMPORARIO: AiStreamEvent = {
  type: "error",
  error: {
    class: "ERRO_TEMPORARIO",
    code: "PROVIDER_5XX",
    message: "O provedor teve uma falha temporária.",
    retryable: true,
  },
};

const pedeVolume = (callId = "call-1"): AiStreamEvent => ({
  type: "tool-call",
  toolName: "training.get_volume",
  callId,
  input: { dias: 7 },
});

/**
 * ⚠️ Tipada como `ChatRunnerInput`, não inferida do literal. Com a inferência, `rodar`
 * aceitava só os campos escritos AQUI — um campo opcional novo do runner (foi o caso de
 * `pageContext`) só aparecia como erro de `tsc`, e nunca em `vitest`, que não checa tipo.
 * Amarrar no contrato faz o compilador acompanhar o runner sozinho.
 */
const ENTRADA: ChatRunnerInput = {
  userId: "user-1",
  conversationId: null,
  text: "qual foi meu volume de treino essa semana?",
  agentId: null,
  providerPreference: null,
  modelPreference: null,
  abortSignal: new AbortController().signal,
  agora: new Date("2026-08-06T15:00:00Z"),
};

async function rodar(entrada: Partial<ChatRunnerInput> = {}) {
  const eventos: Record<string, unknown>[] = [];
  for await (const e of runChat({ ...ENTRADA, ...entrada })) {
    eventos.push(e as unknown as Record<string, unknown>);
  }
  return eventos;
}

beforeEach(() => {
  medicao.length = 0;
  systemsRecebidos.length = 0;
  ferramentasRecebidas.length = 0;
  ferramentaRodou.length = 0;
  passosDoRun.length = 0;
  passosFechados.length = 0;
  chavesDePasso.clear();
  respostasPorChamada = [];
  permissoes = { allow_training: true };
  reservaGravada = 0;
  textoGravado = "";
  statusDoRun = "";
});

// ────────────────────────────────────────────────────────────────

describe("runChat — o laço integrado", () => {
  it("uma pergunta de Treinos executa a ferramenta e responde com o número", async () => {
    respostasPorChamada = [
      [pedeVolume(), FINISH],
      [{ type: "delta", text: "Foram 12480 kg." }, FINISH],
    ];

    const eventos = await rodar();

    expect(ferramentaRodou).toEqual([{ dias: 7 }]);
    expect(eventos).toContainEqual({
      type: "tool",
      toolName: "training.get_volume",
      status: "executada",
      registros: 3,
    });
    expect(eventos.at(-1)).toMatchObject({ type: "done" });
    expect(statusDoRun).toBe("completed");
    expect(textoGravado).toBe("Foram 12480 kg.");
  });

  it("o agente sai do ROTEADOR: pergunta de treino recebe as ferramentas de Treinos", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar();

    // O cliente não pediu agente nenhum (`agentId: null`, o caso real de hoje): quem levou
    // a pergunta para o especialista foi o roteador, lendo o texto e a flag do usuário.
    expect(ferramentasRecebidas[0]).toEqual([
      "training.get_last_workout",
      "training.get_volume",
      "training.get_records",
    ]);
  });

  it("com allow_training desligada, nenhuma ferramenta é oferecida ao provedor", async () => {
    permissoes = { allow_training: false };
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar();

    expect(ferramentasRecebidas[0]).toEqual([]);
    // E o prompt carrega o motivo verdadeiro, em vez de deixar o modelo adivinhar.
    expect(systemsRecebidos[0]).toContain(
      "Leitura não autorizada para este módulo nas preferências de IA.",
    );
  });

  it("o motivo do roteamento entra no prompt de SISTEMA, e só ele", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar();

    expect(systemsRecebidos[0]).toContain("CONTEXTO DESTA EXECUÇÃO");
    expect(systemsRecebidos[0]).toContain("A pergunta menciona este módulo.");
  });

  /**
   * ⚠️ O ELO QUE FALTAVA. `routing.test.ts` prova que o bloco sabe descrever cada rota, e
   * `route.test.ts` prova que a rota chega ao runner — mas nenhum dos dois pega o runner
   * ESQUECENDO de repassá-la a `blocoDeContextoDeRoteamento`. Sem este teste o argumento
   * podia ser removido e a suíte inteira continuava verde (conferido por mutação).
   */
  it("a PÁGINA aberta chega ao prompt de sistema, descrita, não como caminho", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar({
      pageContext: { rota: "/treinos/recordes", modulo: "training" },
    });

    expect(systemsRecebidos[0]).toContain("os recordes de Treinos");
    expect(systemsRecebidos[0]).not.toContain("/treinos/recordes");
  });

  it("cada página produz um prompt DIFERENTE — três opções, três consequências", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];
    await rodar({ pageContext: { rota: "/treinos/historico", modulo: "training" } });
    const doHistorico = systemsRecebidos[0];

    systemsRecebidos.length = 0;
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];
    await rodar({ pageContext: { rota: "/treinos/recordes", modulo: "training" } });
    const dosRecordes = systemsRecebidos[0];

    expect(doHistorico).toContain("o histórico de sessões de Treinos");
    expect(dosRecordes).toContain("os recordes de Treinos");
    expect(doHistorico).not.toBe(dosRecordes);
  });

  it("sem página, o prompt não ganha linha nenhuma sobre tela aberta", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar();

    expect(systemsRecebidos[0]).not.toContain("tela que o usuário");
  });
});

describe("runChat — a medição por CHAMADA", () => {
  /**
   * ⚠️ ESTE É O TESTE DO `23505`. A trava é do banco (`UNIQUE (run_id) WHERE status =
   * 'started'`), então o que se verifica aqui é a única coisa verificável sem banco: entre
   * dois `start` NUNCA falta um `close`.
   */
  it("fecha a tentativa N ANTES de abrir a N+1 — sempre", async () => {
    respostasPorChamada = [
      [pedeVolume("c1"), FINISH],
      [pedeVolume("c2"), FINISH],
      [{ type: "delta", text: "fim" }, FINISH],
    ];

    await rodar();

    let abertas = 0;
    for (const e of medicao) {
      if (e.tipo === "start") {
        abertas += 1;
        expect(abertas, `duas tentativas abertas ao mesmo tempo em ${JSON.stringify(medicao)}`).toBe(1);
      } else {
        abertas -= 1;
      }
    }
    expect(abertas).toBe(0);
    expect(medicao.filter((e) => e.tipo === "start")).toHaveLength(3);
  });

  it("a primeira chamada é PRIMARY e as continuações são TOOL_STEP", async () => {
    respostasPorChamada = [
      [pedeVolume("c1"), FINISH],
      [pedeVolume("c2"), FINISH],
      [{ type: "delta", text: "fim" }, FINISH],
    ];

    await rodar();

    const tipos = medicao
      .filter((e): e is Extract<Evento, { tipo: "start" }> => e.tipo === "start")
      .map((e) => `${e.attemptIndex}:${e.attemptType}`);
    expect(tipos).toEqual(["1:PRIMARY", "2:TOOL_STEP", "3:TOOL_STEP"]);
  });

  it("toda tentativa aberta é fechada, inclusive a última", async () => {
    respostasPorChamada = [
      [pedeVolume("c1"), FINISH],
      [{ type: "delta", text: "fim" }, FINISH],
    ];

    await rodar();

    const abertas = medicao.filter((e) => e.tipo === "start").map((e) => e.id);
    const fechadas = medicao.filter((e) => e.tipo === "close").map((e) => e.id);
    expect(fechadas).toEqual(abertas);
    expect(
      medicao.filter((e) => e.tipo === "close").every((e) => e.status === "completed"),
    ).toBe(true);
  });

  it("a reserva cobre os passos do laço quando o agente TEM ferramenta", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];
    await rodar();
    const comFerramentas = reservaGravada;

    permissoes = { allow_training: false };
    medicao.length = 0;
    systemsRecebidos.length = 0;
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];
    await rodar();
    const semFerramentas = reservaGravada;

    // Sem laço, a fórmula é a da 18-A; com laço, ela cobre `MAX_TOOL_STEPS` chamadas a mais.
    expect(comFerramentas).toBeGreaterThan(semFerramentas * MAX_TOOL_STEPS);
  });
});

describe("runChat — o que a resposta DECLARA", () => {
  it("o corte pelo teto de passos entra no texto gravado, não só num log", async () => {
    respostasPorChamada = Array.from({ length: MAX_TOOL_STEPS + 2 }, (_, i) => [
      pedeVolume(`c${i}`),
      FINISH,
    ]);

    const eventos = await rodar();

    expect(textoGravado).toContain(AVISO_TETO_DE_PASSOS);
    expect(
      eventos.some((e) => e.type === "delta" && String(e.text).includes("limite de passos")),
    ).toBe(true);
    expect(statusDoRun).toBe("completed");
  });

  it("depois de um RETRY a IA continua lendo — a numeração do passo é do RUN", async () => {
    // O provedor cai no meio da primeira tentativa; `decideFallback` manda repetir a mesma
    // chamada (`maxRetries: 1`). O `run_id` é O MESMO — e a numeração do passo tem de
    // continuar de onde parou, senão `UNIQUE (run_id, step_index, kind)` recusa a linha, a
    // trilha some e o laço se recusa a ler. Era o CRITICAL da review 1.
    respostasPorChamada = [
      [{ type: "delta", text: "deixa eu ver" }, ERRO_TEMPORARIO],
      [pedeVolume("c1"), FINISH],
      [{ type: "delta", text: "Foram 12480 kg." }, FINISH],
    ];

    const eventos = await rodar();

    // A leitura ACONTECEU na tentativa que sobreviveu.
    expect(ferramentaRodou).toEqual([{ dias: 7 }]);
    expect(eventos).toContainEqual({
      type: "tool",
      toolName: "training.get_volume",
      status: "executada",
      registros: 3,
    });
    // E o usuário NÃO ouviu que a consulta foi bloqueada por falta de trilha.
    expect(textoGravado).not.toContain(AVISO_SEM_AUDITORIA);
    expect(statusDoRun).toBe("completed");

    // Nenhum passo foi recusado pela chave única, e a numeração é contínua no run.
    expect(passosDoRun.every((p) => p.stepId !== null)).toBe(true);
    expect(passosDoRun.map((p) => `${p.stepIndex}:${p.kind}`)).toEqual([
      "1:modelo", // tentativa 1, que morreu
      "2:modelo", // o retry — e NÃO "1:modelo" de novo
      "2:ferramentas",
      "3:modelo",
    ]);
  });

  it("passo do modelo não fica `started` quando o provedor falha no meio", async () => {
    // `ai_reconcile_abandoned_runs` não menciona `ai_run_steps`, e não há policy de DELETE:
    // passo que o laço não fechar fica "em andamento" para sempre.
    respostasPorChamada = [
      [{ type: "delta", text: "deixa eu ver" }, ERRO_TEMPORARIO],
      [{ type: "delta", text: "consegui agora" }, FINISH],
    ];

    await rodar();

    const abertos = passosDoRun
      .map((p) => p.stepId)
      .filter((id): id is string => id !== null);
    expect(abertos).toHaveLength(2);
    expect(passosFechados.map((p) => p.stepId).sort()).toEqual([...abertos].sort());
    // O da tentativa que caiu fecha como `failed`; o da que respondeu, como `completed`.
    expect(passosFechados.map((p) => p.status)).toEqual(["failed", "completed"]);
  });

  it("ferramenta que não foi oferecida encerra o run como falha", async () => {
    permissoes = { allow_training: false };
    respostasPorChamada = [
      [
        { type: "tool-call", toolName: "training.get_volume", callId: "x", input: {} },
        FINISH,
      ],
    ];

    const eventos = await rodar();

    expect(ferramentaRodou).toHaveLength(0);
    expect(statusDoRun).toBe("failed");
    expect(eventos.at(-1)).toMatchObject({
      type: "error",
      code: "UNEXPECTED_TOOL_CALL",
    });
  });
});
