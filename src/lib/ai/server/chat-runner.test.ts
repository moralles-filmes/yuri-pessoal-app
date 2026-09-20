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
    // 18-F Bloco 4 — o executor dirigido recebe as duas listas, como qualquer chamada.
    writePermissions: {},
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
let versaoGravada = "";
let admissaoDeExperiencia: { experiencia: string; title: string } | null = null;

vi.mock("./run-store", () => ({
  HEARTBEAT_INTERVAL_MS: 10_000,
  /**
   * 18-D — o mapa de mensagens saiu do `chat-runner.ts` para o `run-store.ts`, ao lado de
   * `BeginRunErrorCode`, porque agora ele serve aos DOIS runners. O duplo precisa da chave
   * que o runner de fato lê; um `Proxy` genérico esconderia um código sem frase.
   */
  MENSAGEM_ADMISSAO: { AI_AGENT_NOT_ALLOWED: "Este assistente não está disponível." },
  beginChatRun: async (input: { reservedCost: number; promptVersion: string }) => {
    reservaGravada = input.reservedCost;
    versaoGravada = input.promptVersion;
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
  /**
   * 18-F Bloco 4 — a admissão do PANORAMA. Duplo separado de propósito: se o runner passasse
   * a chamar `beginChatRun` para um panorama, `admissaoDeExperiencia` ficaria nula e os casos
   * abaixo cairiam — o que é exatamente o que deve acontecer, porque aquela RPC não confere
   * `allow_cross_module` e nem grava `kind = 'experience'`.
   */
  beginExperienceRun: async (input: {
    reservedCost: number;
    promptVersion: string;
    experiencia: string;
    title: string;
  }) => {
    reservaGravada = input.reservedCost;
    versaoGravada = input.promptVersion;
    admissaoDeExperiencia = { experiencia: input.experiencia, title: input.title };
    return {
      ok: true,
      value: {
        conversationId: "conv-exp",
        userMessageId: "msg-u",
        runId: "run-exp",
        assistantMessageId: "msg-a",
        correlationId: "corr-exp",
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
/** 18-F Bloco 4 — as mensagens que chegaram ao provedor, para provar PAPEL e ORDEM. */
const mensagensRecebidas: { role: string; content: unknown }[][] = [];

vi.mock("@/lib/ai/providers/provider-factory", () => ({
  createProviderClient: () => ({
    provider: "openai",
    streamText: (request: {
      system: string;
      tools: readonly { name: string }[];
      messages: readonly { role: string; content: unknown }[];
    }) => {
      const indice = systemsRecebidos.length;
      systemsRecebidos.push(request.system);
      ferramentasRecebidas.push(request.tools.map((t) => t.name));
      mensagensRecebidas.push(request.messages.map((m) => ({ ...m })));
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
    // 18-F Bloco 4 — as duas do panorama "Planejar meu dia" que este arquivo exercita.
    "todo.get_agenda": {
      schema: z.object({ dias: z.number().int().optional() }).strict(),
      run: async (input: unknown) => {
        ferramentaRodou.push(input);
        return SAIDA;
      },
    },
    "habits.get_today": {
      schema: z.object({}).strict(),
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
  mensagensRecebidas.length = 0;
  ferramentaRodou.length = 0;
  passosDoRun.length = 0;
  passosFechados.length = 0;
  chavesDePasso.clear();
  respostasPorChamada = [];
  permissoes = { allow_training: true };
  reservaGravada = 0;
  textoGravado = "";
  statusDoRun = "";
  versaoGravada = "";
  admissaoDeExperiencia = null;
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
    /**
     * ⚠️ SÓ AS TRÊS DE TREINO, e é isso que o caso prova desde a 18-C.
     *
     * O agente de Treinos também tem `body.get_latest` e `body.get_series` na allowlist (as
     * medidas corporais são módulo central e ele já as consome desde a 17-E). Mas este
     * cenário liga apenas `allow_training`, e `toolDefinitionsFor` filtra por permissão: o
     * que a flag do usuário recusaria não é oferecido ao provedor. Sem esse filtro, o modelo
     * pediria a ferramenta de medidas e queimaria um dos 3 passos por tentativa para receber
     * uma negativa — a cada pergunta.
     */
    expect(ferramentasRecebidas[0]).toEqual([
      "training.get_last_workout",
      "training.get_volume",
      "training.get_records",
    ]);
  });

  it("com allow_body ligada, as medidas corporais entram na mesma allowlist", async () => {
    permissoes = { allow_training: true, allow_body: true };
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar();

    expect(ferramentasRecebidas[0]).toEqual([
      "training.get_last_workout",
      "training.get_volume",
      "training.get_records",
      "body.get_latest",
      "body.get_series",
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

  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ A NARRAÇÃO DA TENTATIVA QUE FALHOU NÃO ENTRA NA RESPOSTA DA SEGUINTE.                ║
   * ║                                                                                     ║
   * ║ O acumulador de texto atravessava retry e fallback, e era ele que ia para            ║
   * ║ `heartbeatAndPersist` e `completeRun`: a mensagem gravada virava a colagem de duas   ║
   * ║ respostas, sem nada que as separasse depois. A tela faz o mesmo corte no evento      ║
   * ║ `switch` — corrigir só aqui faria o `router.refresh()` apagar da tela um texto que o ║
   * ║ usuário já tinha lido.                                                               ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("RETRY começa com o texto zerado — a resposta gravada é só a que venceu", async () => {
    respostasPorChamada = [
      [{ type: "delta", text: "Vou olhar seus tre" }, ERRO_TEMPORARIO],
      [{ type: "delta", text: "Foram 12480 kg." }, FINISH],
    ];

    const eventos = await rodar();

    expect(statusDoRun).toBe("completed");
    expect(textoGravado).toBe("Foram 12480 kg.");
    expect(textoGravado).not.toContain("Vou olhar seus tre");

    // O usuário VIU os dois trechos — o corte é anunciado pelo evento `switch`, que é onde
    // a tela limpa a bolha. Nenhum delta é escondido dele.
    expect(eventos.filter((e) => e.type === "delta").map((e) => e.text)).toEqual([
      "Vou olhar seus tre",
      "Foram 12480 kg.",
    ]);
    expect(eventos.some((e) => e.type === "switch")).toBe(true);
  });

  /**
   * ⚠️ O contraponto que impede a correção acima de virar defeito: `TOOL_STEP` também
   * incrementa `attemptIndex`, mas é a MESMA resposta continuando depois de uma ferramenta.
   * Zerar ali apagaria o que o assistente escreveu ANTES de consultar.
   */
  it("passo de ferramenta NÃO zera o texto — é a mesma resposta continuando", async () => {
    respostasPorChamada = [
      [{ type: "delta", text: "Deixa eu consultar. " }, pedeVolume(), FINISH],
      [{ type: "delta", text: "Foram 12480 kg." }, FINISH],
    ];

    await rodar();

    expect(statusDoRun).toBe("completed");
    expect(textoGravado).toBe("Deixa eu consultar. Foram 12480 kg.");
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

// ────────────────────────────────────────────────────────────────
// 18-F Bloco 4 — O LAÇO DIRIGIDO PELO SERVIDOR
// ────────────────────────────────────────────────────────────────

/**
 * Um plano como `experience-runner.ts` o entrega: leituras resolvidas, prompt pronto, aviso
 * já escrito e o teto de contexto vindo do CATÁLOGO.
 *
 * ⚠️ Escrito à mão, e não importado do catálogo real: este arquivo testa o RUNNER, e amarrá-lo
 * ao catálogo faria uma ferramenta nova numa experiência quebrar testes que não falam dela.
 * Quem prova que o catálogo é coerente é `experiences/catalog.test.ts`.
 */
const PLANO = {
  id: "planejar-dia" as const,
  agentId: "experiencias.planejar-dia",
  promptVersion: "experiencia-planejar-dia-v1",
  system: "SEGURANCA\n\n---\n\nEscreva o panorama do dia.",
  userText: "Planejar meu dia",
  leituras: [
    { toolName: "todo.get_agenda", input: { dias: 1 } },
    { toolName: "habits.get_today", input: {} },
  ],
  modulos: ["todo", "habits"],
  aviso: "",
  tokensDeContextoReservados: 5000,
};

describe("runChat — o laço DIRIGIDO da experiência", () => {
  it("executa a lista do plano ANTES de chamar o modelo, e na ordem do catálogo", async () => {
    permissoes = { allow_todo: true, allow_habits: true };
    respostasPorChamada = [[{ type: "delta", text: "Hoje você tem..." }, FINISH]];

    const eventos = await rodar({ plano: PLANO });

    // As duas rodaram, na ordem do plano, e ANTES da única chamada ao modelo.
    expect(ferramentaRodou).toEqual([{ dias: 1 }, {}]);
    expect(systemsRecebidos).toHaveLength(1);
    expect(eventos.filter((e) => e.type === "tool").map((e) => e.toolName)).toEqual([
      "todo.get_agenda",
      "habits.get_today",
    ]);
    // O run é de EXPERIÊNCIA: passou pela RPC própria, com o título do catálogo.
    expect(admissaoDeExperiencia).toEqual({
      experiencia: "planejar-dia",
      title: "Planejar meu dia",
    });
    expect(versaoGravada).toBe("experiencia-planejar-dia-v1");
    expect(statusDoRun).toBe("completed");
  });

  /**
   * ⛔ O modelo REDIGE, não pede. Se ele pedisse uma ferramenta, `oferecidas` está vazio →
   * `tool-call-inesperada` → o run fecha como falha, que é o certo.
   */
  it("nenhuma ferramenta é OFERECIDA ao modelo num panorama", async () => {
    permissoes = { allow_todo: true, allow_habits: true };
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar({ plano: PLANO });

    expect(ferramentasRecebidas[0]).toEqual([]);
    // ⚠️ Sem esta linha o caso seria VACUAMENTE verde: com `allow_training` desligada, a
    // pergunta do `ENTRADA` cairia no orquestrador, que também oferece lista vazia. A
    // asserção abaixo prova que o caminho exercitado foi mesmo o do plano.
    expect(admissaoDeExperiencia).not.toBeNull();
  });

  /**
   * ⛔ PAPEL `user`, NUNCA `system` E NUNCA `tool`. `renderUntrusted` põe o aviso ANTES do
   * conteúdo, e `tool-result` sem `tool-call` correspondente é 400 na Anthropic.
   */
  it("o resultado entra como mensagem de papel `user`, com o aviso de não confiável", async () => {
    permissoes = { allow_todo: true, allow_habits: true };
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar({ plano: PLANO });

    const enviadas = mensagensRecebidas[0];
    expect(enviadas.map((m) => m.role)).toEqual(["user", "user"]);
    expect(enviadas[0].content).toBe("Planejar meu dia");

    const bloco = String(enviadas[1].content);
    expect(bloco.toLowerCase()).toContain("não confiá");
    expect(bloco).toContain("todo.get_agenda");
    expect(bloco).toContain("habits.get_today");
  });

  /**
   * ⛔ A FRASE DO QUE FICOU DE FORA É NOSSA, e vai para o texto GRAVADO. Pedi-la ao modelo
   * seria obediência "quase sempre" — e num panorama diário isso é uma omissão por mês.
   */
  it("o aviso do que ficou de fora entra no TEXTO GRAVADO, no fim", async () => {
    permissoes = { allow_todo: true, allow_habits: true };
    respostasPorChamada = [[{ type: "delta", text: "Hoje: nada marcado." }, FINISH]];

    await rodar({ plano: { ...PLANO, aviso: "Fora deste panorama: Agenda." } });

    expect(textoGravado).toBe("Hoje: nada marcado.\n\nFora deste panorama: Agenda.");
  });

  it("sem nada pulado, nenhuma frase é acrescentada", async () => {
    permissoes = { allow_todo: true, allow_habits: true };
    respostasPorChamada = [[{ type: "delta", text: "Hoje: nada marcado." }, FINISH]];

    await rodar({ plano: PLANO });

    expect(textoGravado).toBe("Hoje: nada marcado.");
  });

  /**
   * ⛔ A RESERVA USA O TETO DO CATÁLOGO, NUNCA O TAMANHO DA LISTA EM RUNTIME. É a invariante
   * 56 aplicada aqui: sem o contexto na conta, o orçamento reservaria um prompt de texto para
   * uma chamada de dezenas de milhares de tokens.
   */
  it("a reserva do panorama usa o TETO do catálogo, não o tamanho da lista", async () => {
    permissoes = { allow_todo: true, allow_habits: true };
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar({ plano: PLANO });
    const comDuas = reservaGravada;

    await rodar({ plano: { ...PLANO, leituras: [PLANO.leituras[0]], modulos: ["todo"] } });
    const comUma = reservaGravada;

    expect(comDuas).toBeGreaterThan(0);
    expect(comUma).toBe(comDuas);
  });

  /** E o contexto reservado de fato PESA: um plano sem ele reservaria menos. */
  it("o teto de contexto entra na reserva", async () => {
    permissoes = { allow_todo: true, allow_habits: true };
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar({ plano: PLANO });
    const comContexto = reservaGravada;

    await rodar({ plano: { ...PLANO, tokensDeContextoReservados: 0 } });
    const semContexto = reservaGravada;

    expect(comContexto).toBeGreaterThan(semContexto);
  });

  /**
   * ⛔ SEM TRILHA, SEM LEITURA (18-B) — e aqui ela ENCERRA o run, em vez de virar um aviso.
   * Um panorama é escrito inteiramente sobre o que as leituras trouxeram; sem elas, a
   * resposta seria redigida sobre nada.
   */
  it("falha ao abrir o passo de ferramentas ENCERRA o run", async () => {
    permissoes = { allow_todo: true, allow_habits: true };
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    // Ocupa a chave `(run_id, step_index, kind)` que o passo dirigido vai pedir: o duplo
    // modela o `UNIQUE` do banco e devolve `null`, como `audit.ts` faz num `23505`.
    chavesDePasso.add("run-exp|1|ferramentas");

    const eventos = await rodar({ plano: PLANO });

    expect(ferramentaRodou).toHaveLength(0);
    expect(systemsRecebidos).toHaveLength(0);
    expect(statusDoRun).toBe("failed");
    expect(eventos.at(-1)).toMatchObject({
      type: "error",
      code: "ATTEMPT_NOT_RECORDED",
    });
  });
});

describe("runChat — o modo CAIXA DE ENTRADA", () => {
  it("acrescenta o bloco ao prompt e marca a versão do run", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar({ caixaDeEntrada: true });

    expect(systemsRecebidos[0]).toContain("MODO CAIXA DE ENTRADA");
    expect(versaoGravada).toMatch(/\+caixa-v\d+$/);
  });

  it("sem o modo, nada disso aparece", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar();

    expect(systemsRecebidos[0]).not.toContain("MODO CAIXA DE ENTRADA");
    expect(versaoGravada).not.toContain("+caixa-v");
  });

  /**
   * ⛔ O modo NÃO desliga o roteamento nem as ferramentas: é o laço normal, com um bloco a
   * mais. Passá-lo pelo runner dirigido exigiria um "agente de tudo", que é o que a allowlist
   * por agente existe para impedir.
   */
  it("o roteador e as ferramentas continuam os de sempre", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar({ caixaDeEntrada: true });

    expect(ferramentasRecebidas[0]).toEqual([
      "training.get_last_workout",
      "training.get_volume",
      "training.get_records",
    ]);
  });
});
