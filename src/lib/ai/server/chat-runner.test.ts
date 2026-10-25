/**
 * Fase 18-B — IA · O chat-runner COM o laço de ferramentas.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE SÓ SE PROVA AQUI (e não no `tool-loop.test.ts`)                                 ║
 * ║                                                                                       ║
 * ║  • `ai_usage_events_one_active_per_trilha_uidx` é `UNIQUE (run_id, trilha) WHERE      ║
 * ║    status = 'started'`: abrir a tentativa do passo N+1 com a do passo N aberta, na     ║
 * ║    mesma trilha, é `23505` EM RUNTIME. É constraint de banco — nenhum teste de unidade ║
 * ║    da medição pega. O que dá para provar sem banco é a ORDEM das chamadas, e é o que   ║
 * ║    este arquivo faz.                                                                   ║
 * ║  • cada chamada ao modelo vira UMA linha de medição: `PRIMARY` e depois `TOOL_STEP`.   ║
 * ║  • quem responde é o COORDENADOR; o especialista sai do ACIONAMENTO dele, validado    ║
 * ║    pelas flags do usuário — não do texto nem do que o cliente pediu (Task 12).        ║
 * ║  • o corte pelo teto de passos entra no TEXTO da resposta gravada.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Tudo que é borda (provedor, banco, credencial) é duplo; coordenador, registry, guard,
 * executor, reserva e prompt rodam de verdade.
 *
 * ⚠️ Coordenador · Task 12 — no chat, a chamada 0 ao provedor é a DECISÃO do coordenador, e o
 * especialista só começa na chamada 1. Os casos que exercitam o laço de Treinos começam por
 * `decideTreinos` (o coordenador aciona o especialista), e os índices de `systemsRecebidos`,
 * `ferramentasRecebidas` e da medição contam com essa chamada a mais.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { AiMessage, AiStreamEvent } from "@/lib/ai/core/contracts";
import type { AiPreferencesView } from "@/lib/ai/types";
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
/** Coordenador · Task 13 — "Cruzar módulos" (dois ou mais especialistas por mensagem). */
let cruzarModulos = false;
/** O histórico que `getHistoryForPrompt` devolve (Rodada 1 da Task 12: pesa na reserva). */
let historicoDoBanco: { role: "user" | "assistant"; content: string }[] = [];

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
    allowCrossModule: cruzarModulos,
    // 18-F Bloco 4 — o executor dirigido recebe as duas listas, como qualquer chamada.
    writePermissions: {},
  }),
  getHistoryForPrompt: async () => historicoDoBanco,
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
let agenteAdmitido = "";
/** Coordenador · Task 12 — os acionamentos auditados (o PEDIDO, nunca a resposta). */
const acionamentos: { especialistaId: string; status: string }[] = [];
let admissaoDeExperiencia: { experiencia: string; title: string } | null = null;
/**
 * MOD-ia-005 — roda no instante da ADMISSÃO. É por aqui que um caso diz "a preparação levou
 * 40 s" sem depender de QUANTAS vezes o runner lê o relógio até ali.
 */
let aoAdmitir: (() => void) | null = null;

vi.mock("./run-store", () => ({
  HEARTBEAT_INTERVAL_MS: 10_000,
  /**
   * 18-D — o mapa de mensagens saiu do `chat-runner.ts` para o `run-store.ts`, ao lado de
   * `BeginRunErrorCode`, porque agora ele serve aos DOIS runners. O duplo precisa da chave
   * que o runner de fato lê; um `Proxy` genérico esconderia um código sem frase.
   */
  MENSAGEM_ADMISSAO: { AI_AGENT_NOT_ALLOWED: "Este assistente não está disponível." },
  beginChatRun: async (input: {
    reservedCost: number;
    promptVersion: string;
    agentId: string;
  }) => {
    aoAdmitir?.();
    reservaGravada = input.reservedCost;
    versaoGravada = input.promptVersion;
    agenteAdmitido = input.agentId;
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
  registrarAcionamento: async (input: { especialistaId: string; status: string }) => {
    acionamentos.push({ especialistaId: input.especialistaId, status: input.status });
    return "tc";
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
/** MOD-ia-005 — o `timeoutMs` que cada chamada recebeu do runner. */
const timeoutsRecebidos: number[] = [];
/**
 * MOD-ia-005 — roda quando o stream de uma chamada COMEÇA a ser consumido. É por aqui que um
 * caso adianta o relógio injetado ("o provedor respondeu aos 52 s") ou segura a chamada até o
 * sinal de aborto do runner disparar.
 */
let aoConsumirChamada:
  | ((indice: number, request: { abortSignal?: AbortSignal }) => Promise<void> | void)
  | null = null;

vi.mock("@/lib/ai/providers/provider-factory", () => ({
  createProviderClient: () => ({
    provider: "openai",
    streamText: (request: {
      system: string;
      tools: readonly { name: string }[];
      messages: readonly { role: string; content: unknown }[];
      timeoutMs: number;
      abortSignal?: AbortSignal;
    }) => {
      const indice = systemsRecebidos.length;
      systemsRecebidos.push(request.system);
      ferramentasRecebidas.push(request.tools.map((t) => t.name));
      mensagensRecebidas.push(request.messages.map((m) => ({ ...m })));
      timeoutsRecebidos.push(request.timeoutMs);
      const eventos = respostasPorChamada[indice] ?? [FINISH];
      return (async function* () {
        if (aoConsumirChamada) await aoConsumirChamada(indice, request);
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
/**
 * 18-F Bloco 4 — o nome da ferramenta que deve EXPLODIR nesta rodada. O adapter lançando é o
 * que `executor.ts` converte em `status: "falhou"`, então o caminho exercitado é o real: nada
 * aqui simula o executor, só o banco do outro lado dele.
 */
let falhaDaFerramenta: string | null = null;

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
        if (falhaDaFerramenta === "todo.get_agenda") throw new Error("banco fora do ar");
        ferramentaRodou.push(input);
        return SAIDA;
      },
    },
    "habits.get_today": {
      schema: z.object({}).strict(),
      run: async (input: unknown) => {
        if (falhaDaFerramenta === "habits.get_today") throw new Error("banco fora do ar");
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
const { blocoDaData } = await import("@/lib/ai/agents/blocos-do-servidor");
const { findAgent, promptVersionOf } = await import("@/lib/ai/agents/registry");
const { computeReservation, estimarTokensDeEntrada } = await import(
  "@/lib/ai/usage/reservation"
);
const { rateFor } = await import("@/lib/ai/core/pricing");
const { findModel } = await import("@/lib/ai/core/models");
const { computeReservationDoCoordenador } = await import("@/lib/ai/usage/reservation");
const { tokensDoMaiorEspecialista } = await import("./coordenador");
const { textoDasMensagens } = await import("@/lib/ai/core/text");

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

/**
 * Coordenador · Task 12 — a DECISÃO que aciona o especialista de Treinos. É a chamada 0 de
 * todo caso que exercita o laço de ferramentas: o especialista sai do acionamento, não do texto.
 */
const decideTreinos: readonly AiStreamEvent[] = [
  {
    type: "tool-call",
    toolName: "acionar_treinos",
    callId: "acionar-1",
    input: { tarefa: "Qual foi o volume de treino do dono nesta semana?" },
  },
  {
    type: "finish",
    finishReason: "tool-call",
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
    providerRequestId: "req-decisao",
  },
];

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
/**
 * MOD-ia-005 — o relógio do PRAZO, injetado. Começa em 0 (o instante em que `runChat` cria o
 * prazo) e só anda quando um caso o adianta.
 */
let relogioMs = 0;

const ENTRADA: ChatRunnerInput = {
  agoraMs: () => relogioMs,
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
  cruzarModulos = false;
  historicoDoBanco = [];
  reservaGravada = 0;
  textoGravado = "";
  statusDoRun = "";
  versaoGravada = "";
  agenteAdmitido = "";
  acionamentos.length = 0;
  admissaoDeExperiencia = null;
  falhaDaFerramenta = null;
  timeoutsRecebidos.length = 0;
  aoConsumirChamada = null;
  aoAdmitir = null;
  relogioMs = 0;
});

// ────────────────────────────────────────────────────────────────

describe("runChat — o laço integrado", () => {
  it("uma pergunta de Treinos executa a ferramenta e responde com o número", async () => {
    respostasPorChamada = [
      decideTreinos,
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

  /**
   * Coordenador · Task 12 — reescrito. Antes: "o agente sai do ROTEADOR" (a palavra "treino"
   * no texto levava a Treinos). Agora quem leva é o ACIONAMENTO do coordenador, e o servidor
   * só aceita o que ofereceu pelas flags. A garantia de fundo é a mesma — o cliente não escolhe
   * o especialista — e ela passou a viver em `decidirAcionamentos` (`especialistas.test.ts`) e
   * em `coordenador.test.ts`; aqui fica a ligação de ponta a ponta.
   */
  it("o especialista sai do ACIONAMENTO: Treinos recebe as ferramentas de Treinos", async () => {
    respostasPorChamada = [decideTreinos, [{ type: "delta", text: "ok" }, FINISH]];

    // O cliente pede OUTRO agente: o pedido é ignorado (Task 12; o campo some na Task 20).
    await rodar({ agentId: "financeiro" });

    // O coordenador vê uma ferramenta de acionamento por especialista oferecido…
    expect(ferramentasRecebidas[0]).toEqual(["acionar_treinos"]);
    expect(agenteAdmitido).toBe("assistente-pessoal");
    expect(acionamentos).toEqual([{ especialistaId: "treinos", status: "executada" }]);
    /**
     * …e o especialista, SÓ AS TRÊS DE TREINO, como desde a 18-C: o agente de Treinos também
     * tem `body.*` na allowlist, mas este cenário liga apenas `allow_training`, e
     * `toolDefinitionsFor` não oferece o que a flag recusaria.
     */
    expect(ferramentasRecebidas[1]).toEqual([
      "training.get_last_workout",
      "training.get_volume",
      "training.get_records",
    ]);
  });

  it("com allow_body ligada, as medidas corporais entram na mesma allowlist", async () => {
    permissoes = { allow_training: true, allow_body: true };
    respostasPorChamada = [decideTreinos, [{ type: "delta", text: "ok" }, FINISH]];

    await rodar();

    expect(ferramentasRecebidas[1]).toEqual([
      "training.get_last_workout",
      "training.get_volume",
      "training.get_records",
      "body.get_latest",
      "body.get_series",
    ]);
  });

  /**
   * Coordenador · Task 12 — reescrito. Antes: o orquestrador recebia o motivo do roteamento
   * ("Leitura não autorizada para este módulo…"). Agora o módulo desligado é declarado no bloco
   * do coordenador (spec §4.2.8) — o modelo continua sem precisar adivinhar por que não pode
   * consultar —, e Treinos simplesmente não é oferecido.
   */
  it("com allow_training desligada, Treinos não é oferecido e o system declara o módulo desligado", async () => {
    permissoes = { allow_training: false };
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar();

    expect(ferramentasRecebidas[0]).toEqual([]);
    expect(systemsRecebidos[0]).toContain("Sem acesso liberado pelo dono:");
    expect(systemsRecebidos[0]).toContain("Treinos");
    expect(systemsRecebidos).toHaveLength(1);
  });

  /**
   * Coordenador · Task 12 — reescrito. Antes: "o motivo do roteamento entra no prompt de
   * SISTEMA". O roteamento por palavra-chave deixou de decidir o chat; os fatos do servidor que
   * o coordenador recebe agora são a DATA de hoje e o bloco do coordenador (spec §4.2.6-A e
   * §4.2.8), ambos no system e antes da memória (a ordem é provada em `memory/prompt.test.ts`).
   */
  it("a data e o bloco do coordenador entram no prompt de SISTEMA da decisão", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar();

    expect(systemsRecebidos[0]).toContain(blocoDaData(ENTRADA.agora));
    expect(systemsRecebidos[0]).toContain("Você coordena a conversa.");
    expect(systemsRecebidos[0]).not.toContain("CONTEXTO DESTA EXECUÇÃO");
  });

  /**
   * Coordenador · Task 12 — reescrito (os dois casos de página viraram este). Antes: a página
   * aberta chegava ao prompt, descrita. A spec §4.6 retira o contexto de página; até a Task 20
   * removê-lo do corpo, ele é IGNORADO — e este caso prova que nada dele chega ao provedor.
   */
  it("a página aberta é ignorada: o system não muda com ela", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];
    await rodar({ pageContext: { rota: "/treinos/recordes", modulo: "training" } });
    const comPagina = systemsRecebidos[0];

    systemsRecebidos.length = 0;
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];
    await rodar();
    const semPagina = systemsRecebidos[0];

    expect(comPagina).toBe(semPagina);
    expect(comPagina).not.toContain("os recordes de Treinos");
  });

  it("sem página, o prompt não ganha linha nenhuma sobre tela aberta", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar();

    expect(systemsRecebidos[0]).not.toContain("tela que o usuário");
  });

  it("o run é admitido como o coordenador, com a versão de prompt dele", async () => {
    respostasPorChamada = [[{ type: "delta", text: "Olá!" }, FINISH]];

    await rodar({ text: "oi" });

    const coordenador = findAgent("assistente-pessoal")!;
    expect(agenteAdmitido).toBe("assistente-pessoal");
    expect(versaoGravada).toBe(promptVersionOf(coordenador));
    expect(textoGravado).toBe("Olá!");
    expect(statusDoRun).toBe("completed");
  });

  it("os eventos do especialista chegam à tela, e o texto gravado é o dele", async () => {
    respostasPorChamada = [
      [{ type: "delta", text: "Vou consultar…" }, ...decideTreinos],
      [{ type: "delta", text: "Foram 12480 kg." }, FINISH],
    ];

    const eventos = await rodar();

    expect(eventos.filter((e) => e.type === "especialista").map((e) => e.status)).toEqual([
      "consultando",
      "pronto",
    ]);
    expect(eventos.filter((e) => e.type === "delta").map((e) => e.text)).toEqual([
      "Foram 12480 kg.",
    ]);
    expect(textoGravado).toBe("Foram 12480 kg.");
    expect(statusDoRun).toBe("completed");
  });

  /** §4.4 — o único especialista esgotou as tentativas: o run fecha `failed`, com o erro. */
  it("especialista que falha no modo direto fecha o run como failed, com o evento de erro", async () => {
    respostasPorChamada = [decideTreinos, [ERRO_TEMPORARIO], [ERRO_TEMPORARIO]];

    const eventos = await rodar();

    expect(statusDoRun).toBe("failed");
    expect(eventos.at(-1)).toMatchObject({ type: "error", code: "PROVIDER_5XX" });
  });
});

describe("runChat — a medição por CHAMADA", () => {
  /**
   * ⚠️ ESTE É O TESTE DO `23505`. A trava é do banco (`UNIQUE (run_id, trilha) WHERE status =
   * 'started'`), então o que se verifica aqui é a única coisa verificável sem banco: entre
   * dois `start` da mesma trilha NUNCA falta um `close`. (No modo direto as trilhas 0 e 1
   * rodam uma depois da outra, então nunca há duas abertas ao mesmo tempo.)
   */
  it("fecha a tentativa N ANTES de abrir a N+1 — sempre", async () => {
    respostasPorChamada = [
      decideTreinos,
      [pedeVolume("c1"), FINISH],
      [pedeVolume("c2"), FINISH],
      [{ type: "delta", text: "fim" }, FINISH],
    ];

    await rodar();

    let abertas = 0;
    for (const e of medicao) {
      if (e.tipo === "start") {
        abertas += 1;
        expect(abertas, `duas tentativas abertas ao mesmo tempo na mesma trilha (a trava é uma aberta por trilha) em ${JSON.stringify(medicao)}`).toBe(1);
      } else {
        abertas -= 1;
      }
    }
    expect(abertas).toBe(0);
    expect(medicao.filter((e) => e.tipo === "start")).toHaveLength(4);
  });

  /**
   * Coordenador · Task 12 — reescrito: a decisão do coordenador é a PRIMARY (trilha 0), e a
   * primeira chamada do especialista é ESPECIALISTA (trilha 1); as continuações continuam
   * TOOL_STEP, e `attempt_index` continua contando pelo RUN.
   */
  it("a decisão é PRIMARY, o especialista é ESPECIALISTA e as continuações são TOOL_STEP", async () => {
    respostasPorChamada = [
      decideTreinos,
      [pedeVolume("c1"), FINISH],
      [pedeVolume("c2"), FINISH],
      [{ type: "delta", text: "fim" }, FINISH],
    ];

    await rodar();

    const tipos = medicao
      .filter((e): e is Extract<Evento, { tipo: "start" }> => e.tipo === "start")
      .map((e) => `${e.attemptIndex}:${e.attemptType}`);
    expect(tipos).toEqual(["1:PRIMARY", "2:ESPECIALISTA", "3:TOOL_STEP", "4:TOOL_STEP"]);
  });

  it("toda tentativa aberta é fechada, inclusive a última", async () => {
    respostasPorChamada = [
      decideTreinos,
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

  /**
   * Coordenador · Task 12 — reescrito. Antes: "a reserva cobre os passos do laço quando o
   * agente TEM ferramenta" (a reserva do agente roteado dependia de ele ter ferramenta). Agora
   * a reserva do chat é a do COORDENADOR, pelo pior caso por constantes (spec §5.6): ela não
   * depende do que a mensagem vai acionar, e cobre MAIS que um agente com o laço inteiro. A
   * conta do pior caso, com o número escrito à mão, está em `usage/reservation.test.ts` (T8).
   */
  it("a reserva do chat é o pior caso do coordenador, e não depende do que for acionado", async () => {
    respostasPorChamada = [[{ type: "delta", text: "Olá!" }, FINISH]];
    await rodar();
    const semAcionamento = reservaGravada;
    const systemDaDecisao = systemsRecebidos[0];

    systemsRecebidos.length = 0;
    respostasPorChamada = [decideTreinos, [{ type: "delta", text: "ok" }, FINISH]];
    await rodar();
    const comUmEspecialista = reservaGravada;

    expect(comUmEspecialista).toBe(semAcionamento);

    // Um agente só, com o laço inteiro e as tentativas — o que a reserva cobria antes.
    const modelo = findModel("openai", "gpt-5.6-terra")!;
    const umAgente = computeReservation({
      rates: [rateFor("openai", "gpt-5.6-terra", "2026-08-06")!],
      tokensEntradaEstimados: estimarTokensDeEntrada(systemDaDecisao + ENTRADA.text),
      tetoDeSaida: modelo.outputCapTokens,
      maxRetries: 1,
      maxFallbacks: 0,
      margem: 1.15,
      maxToolSteps: MAX_TOOL_STEPS,
    });
    expect(semAcionamento).toBeGreaterThan(umAgente.valorUsd);
  });

  /**
   * Rodada 1 da Task 12 — o que `runChat` ENTREGA à reserva, entrada por entrada. Sem este
   * caso, zerar a entrada do coordenador ou a do especialista não deixava nada vermelho: os
   * dois casos acima só comparam reservas entre si. A entrada do coordenador é derivada do que
   * de fato CHEGOU ao provedor (system + mensagens, com histórico); a do especialista, do
   * maior especialista do registry.
   */
  it("a reserva gravada é computeReservationDoCoordenador com as entradas do prompt enviado", async () => {
    historicoDoBanco = [
      { role: "user", content: "pergunta antiga ".repeat(200) },
      { role: "assistant", content: "resposta antiga ".repeat(200) },
    ];
    respostasPorChamada = [[{ type: "delta", text: "Olá!" }, FINISH]];

    await rodar({ conversationId: "conv-1" });

    // O histórico chegou ao provedor — é ele que pesa na entrada do coordenador.
    expect(mensagensRecebidas[0]).toHaveLength(3);
    const modelo = findModel("openai", "gpt-5.6-terra")!;
    const esperada = computeReservationDoCoordenador({
      rates: [rateFor("openai", "gpt-5.6-terra", "2026-08-06")!],
      maxRetries: 1,
      maxFallbacks: 0,
      margem: 1.15,
      tokensEntradaDoCoordenador: estimarTokensDeEntrada(
        systemsRecebidos[0] + textoDasMensagens(mensagensRecebidas[0] as AiMessage[]),
      ),
      tokensEntradaDoEspecialista: tokensDoMaiorEspecialista({
        prefs: { permissions: permissoes } as unknown as AiPreferencesView,
        memorias: [],
        agora: ENTRADA.agora,
      }),
      tetoSaidaDaSintese: modelo.outputCapTokens,
    });
    expect(reservaGravada).toBe(esperada.valorUsd);
  });
});

describe("runChat — o que a resposta DECLARA", () => {
  it("o corte pelo teto de passos entra no texto gravado, não só num log", async () => {
    respostasPorChamada = [
      decideTreinos,
      ...Array.from({ length: MAX_TOOL_STEPS + 2 }, (_, i) => [pedeVolume(`c${i}`), FINISH]),
    ];

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
      decideTreinos,
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
    // Coordenador · Task 12 — a decisão e o acionamento ocupam o passo 1; o especialista
    // continua a numeração do RUN a partir do 2.
    expect(passosDoRun.map((p) => `${p.stepIndex}:${p.kind}`)).toEqual([
      "1:modelo", // a decisão do coordenador
      "1:ferramentas", // o acionamento auditado
      "2:modelo", // tentativa 1 do especialista, que morreu
      "3:modelo", // o retry — e NÃO "2:modelo" de novo
      "3:ferramentas",
      "4:modelo",
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
      decideTreinos,
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
    // Coordenador · Task 12 — o `switch` diz QUAL trilha recomeçou: a do especialista.
    expect(eventos.filter((e) => e.type === "switch").map((e) => e.trilha)).toEqual([1]);
  });

  /**
   * ⚠️ O contraponto que impede a correção acima de virar defeito: `TOOL_STEP` também
   * incrementa `attemptIndex`, mas é a MESMA resposta continuando depois de uma ferramenta.
   * Zerar ali apagaria o que o assistente escreveu ANTES de consultar.
   */
  it("passo de ferramenta NÃO zera o texto — é a mesma resposta continuando", async () => {
    respostasPorChamada = [
      decideTreinos,
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
    // ⚠️ `rotulo` é o nome em pt-BR do MÓDULO, resolvido por `decidirLeituras` a partir do
    // registry. Viaja no plano porque `chat-runner` não conhece catálogo nem seleção
    // (invariante 104) — e é ele quem descobre, em runtime, qual leitura falhou.
    { toolName: "todo.get_agenda", input: { dias: 1 }, rotulo: "TO-DO" },
    { toolName: "habits.get_today", input: {}, rotulo: "Hábitos" },
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
   * ╔══════════════════════════════════════════════════════════════════════════════════════╗
   * ║ ⛔ LEITURA QUE FALHOU TAMBÉM É TEXTO NOSSO — PELO MESMO MOTIVO DA QUE FOI PULADA.      ║
   * ║                                                                                       ║
   * ║ O bloco de erro que chega ao modelo diz "diga que não conseguiu obter o dado": é uma  ║
   * ║ INSTRUÇÃO, e a garantia vira a obediência dele — exatamente o que o aviso do que      ║
   * ║ ficou de fora existe para não depender. Um modelo redigindo texto fluido simplesmente ║
   * ║ omite o módulo, e o panorama sai PARECENDO completo: a mentira que a 18-E combateu.   ║
   * ╚══════════════════════════════════════════════════════════════════════════════════════╝
   */
  it("leitura que FALHOU entra no texto gravado, mesmo se o modelo não disser nada", async () => {
    permissoes = { allow_todo: true, allow_habits: true };
    falhaDaFerramenta = "habits.get_today";
    // O modelo redige como se estivesse tudo bem — é justamente o caso que a frase cobre.
    respostasPorChamada = [[{ type: "delta", text: "Hoje: nada marcado." }, FINISH]];

    await rodar({ plano: PLANO });

    expect(textoGravado).toContain("Hoje: nada marcado.");
    expect(textoGravado).toContain("Hábitos");
    expect(textoGravado).toContain("a leitura falhou");
  });

  /** A falha não some com o pulo, nem o pulo com a falha: são dois fatos diferentes. */
  it("pulo por preferência e falha de execução convivem no mesmo texto", async () => {
    permissoes = { allow_todo: true, allow_habits: true };
    falhaDaFerramenta = "habits.get_today";
    respostasPorChamada = [[{ type: "delta", text: "Hoje: nada marcado." }, FINISH]];

    await rodar({ plano: { ...PLANO, aviso: "Fora deste panorama: Agenda." } });

    expect(textoGravado).toContain("Fora deste panorama: Agenda.");
    expect(textoGravado).toContain("Hábitos");
  });

  /** Ferramenta que rodou bem não vira aviso — senão todo panorama sairia se desculpando. */
  it("leitura bem-sucedida não gera frase de falha", async () => {
    permissoes = { allow_todo: true, allow_habits: true };
    respostasPorChamada = [[{ type: "delta", text: "Hoje: nada marcado." }, FINISH]];

    await rodar({ plano: PLANO });

    expect(textoGravado).not.toContain("a leitura falhou");
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

/**
 * Coordenador · Task 12 — reescrito (eram três casos). Antes: o modo caixa de entrada
 * acrescentava um bloco ao prompt e marcava `+caixa-v1` na versão, com o roteador de sempre.
 * A spec §4.6 torna esse comportamento do coordenador SEMPRE; até a Task 20 tirar o campo do
 * corpo, ele é IGNORADO — e a garantia de que o roteamento por palavra não decide mais o chat
 * mora nos casos de acionamento acima e em `coordenador.test.ts`.
 */
describe("runChat — o campo caixaDeEntrada (ignorado até a Task 20)", () => {
  it("com o campo ligado, nada muda: nem bloco, nem versão", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar({ caixaDeEntrada: true });

    expect(systemsRecebidos[0]).not.toContain("MODO CAIXA DE ENTRADA");
    expect(versaoGravada).not.toContain("+caixa-v");
    expect(versaoGravada).toBe(promptVersionOf(findAgent("assistente-pessoal")!));
  });
});

// ────────────────────────────────────────────────────────────────
// MOD-ia-005 — O PRAZO GLOBAL DA REQUISIÇÃO
// ────────────────────────────────────────────────────────────────

describe("runChat — o prazo global da requisição", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("a primeira chamada recebe o menor entre o timeout configurado e o que resta", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];
    // O prazo nasce no instante 0; a admissão termina aos 40 s (preparação lenta). Restam
    // 15 s, menos que os 30 s configurados no duplo — vale o que resta.
    //
    // ⚠️ O relógio anda num EVENTO (a admissão), e não na N-ésima leitura: a versão anterior
    // contava as chamadas a `agoraMs`, e uma leitura a mais (inofensiva) em qualquer ponto do
    // runner a deixava vermelha sem defeito nenhum.
    aoAdmitir = () => {
      relogioMs = 40_000;
    };

    await rodar();

    expect(timeoutsRecebidos).toEqual([15_000]);
  });

  it("com folga, a chamada recebe o timeout configurado", async () => {
    respostasPorChamada = [[{ type: "delta", text: "ok" }, FINISH]];

    await rodar();

    expect(timeoutsRecebidos).toEqual([30_000]);
  });

  /**
   * ⛔ O retry que passaria do limite NÃO é aberto. Abri-lo era entregar a função à
   * plataforma: ela morre aos 60 s, o `finally` não roda, e run e tentativa ficam presos até a
   * lease, com o consumo real fora da conta.
   */
  it("não abre retry quando o prazo restante está abaixo do piso", async () => {
    respostasPorChamada = [
      [{ type: "delta", text: "deixa eu ver" }, ERRO_TEMPORARIO],
      [{ type: "delta", text: "não deveria chegar aqui" }, FINISH],
    ];
    // O 5xx chega aos 52 s: sobram 3 s, abaixo do piso de 5 s.
    aoConsumirChamada = () => {
      relogioMs = 52_000;
    };

    const eventos = await rodar();

    expect(statusDoRun).toBe("failed");
    expect(eventos.at(-1)).toEqual({
      type: "error",
      code: "AI_DEADLINE",
      message: "A resposta passou do tempo máximo e foi encerrada.",
    });
    expect(medicao.filter((e) => e.tipo === "start")).toHaveLength(1);
    expect(systemsRecebidos).toHaveLength(1);
    // Nenhuma tentativa ficou aberta.
    expect(medicao.filter((e) => e.tipo === "close")).toHaveLength(1);
  });

  it("não abre o passo de ferramenta quando o prazo restante está abaixo do piso", async () => {
    respostasPorChamada = [
      decideTreinos,
      [pedeVolume(), FINISH],
      [{ type: "delta", text: "não deveria chegar aqui" }, FINISH],
    ];
    // O especialista (chamada 1) responde aos 52 s; a decisão (chamada 0) coube com folga.
    aoConsumirChamada = (indice) => {
      if (indice === 1) relogioMs = 52_000;
    };

    const eventos = await rodar();

    // A leitura aconteceu; a continuação, não.
    expect(ferramentaRodou).toEqual([{ dias: 7 }]);
    expect(systemsRecebidos).toHaveLength(2);
    expect(statusDoRun).toBe("failed");
    expect(eventos.at(-1)).toMatchObject({ type: "error", code: "AI_DEADLINE" });
    // A tentativa do passo 0 do especialista terminou de verdade (o provedor mandou
    // `finish`): fecha `completed`, e a do passo seguinte nunca é aberta.
    expect(medicao).toEqual([
      { tipo: "start", id: "att-1", attemptIndex: 1, attemptType: "PRIMARY" },
      { tipo: "close", id: "att-1", status: "completed" },
      { tipo: "start", id: "att-2", attemptIndex: 2, attemptType: "ESPECIALISTA" },
      { tipo: "close", id: "att-2", status: "completed" },
    ]);
  });

  /**
   * O timer do servidor aborta o sinal da chamada, e o adapter relata isso como aborto. Sem a
   * reclassificação, o prazo esgotado chegaria ao dono como "Resposta cancelada." e a
   * tentativa ficaria `cancelled` — ninguém cancelou nada.
   */
  it("o timeout do servidor não vira 'cancelado pelo usuário'", async () => {
    vi.useFakeTimers();
    respostasPorChamada = [
      [
        // O que o adapter emite quando o sinal da chamada aborta (parte `abort` do SDK).
        {
          type: "error",
          error: {
            class: "CANCELADO_PELO_USUARIO",
            code: "STREAM_ABORTED",
            message: "Resposta cancelada.",
            retryable: false,
          },
        },
      ],
    ];
    aoConsumirChamada = async (_i, request) => {
      // O provedor pendurado: só volta quando o runner aborta o sinal. Quando ele volta, o
      // relógio do prazo já passou do piso.
      await new Promise<void>((resolve) => {
        request.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
      });
      relogioMs = 53_000;
    };

    const promessa = rodar();
    await vi.advanceTimersByTimeAsync(30_000);
    const eventos = await promessa;

    expect(statusDoRun).toBe("failed");
    expect(eventos.at(-1)).toMatchObject({ type: "error", code: "AI_DEADLINE" });
    expect(medicao).toEqual([
      { tipo: "start", id: "att-1", attemptIndex: 1, attemptType: "PRIMARY" },
      { tipo: "close", id: "att-1", status: "failed" },
    ]);
  });

  /**
   * Coordenador · Task 13 — Review Focus 1: o dono fecha o painel enquanto DOIS especialistas
   * rodam. O sinal chega às duas trilhas, nenhuma tentativa fica `started`, e o run fecha
   * `cancelled` — nunca `failed`.
   */
  it("cancelar com dois especialistas no meio fecha as duas tentativas e o run como cancelled", async () => {
    cruzarModulos = true;
    permissoes = { allow_training: true, allow_finance: true };
    const dono = new AbortController();
    respostasPorChamada = [
      [
        { type: "tool-call", toolName: "acionar_treinos", callId: "a1", input: { tarefa: "volume da semana" } },
        { type: "tool-call", toolName: "acionar_financeiro", callId: "a2", input: { tarefa: "gasto do mês" } },
        FINISH,
      ],
    ];
    aoConsumirChamada = async (indice, request) => {
      if (indice === 0) return;
      await new Promise<void>((resolve) => {
        request.abortSignal?.addEventListener("abort", () => resolve(), { once: true });
      });
    };

    const promessa = rodar({ abortSignal: dono.signal });
    await vi.waitFor(() => expect(systemsRecebidos).toHaveLength(3));
    dono.abort();
    const eventos = await promessa;

    expect(statusDoRun).toBe("cancelled");
    expect(eventos.some((e) => e.type === "error")).toBe(false);
    expect(medicao).toEqual([
      { tipo: "start", id: "att-1", attemptIndex: 1, attemptType: "PRIMARY" },
      { tipo: "close", id: "att-1", status: "completed" },
      { tipo: "start", id: "att-2", attemptIndex: 2, attemptType: "ESPECIALISTA" },
      { tipo: "start", id: "att-3", attemptIndex: 3, attemptType: "ESPECIALISTA" },
      expect.objectContaining({ tipo: "close", status: "cancelled" }),
      expect.objectContaining({ tipo: "close", status: "cancelled" }),
    ]);
    const fechadas = medicao.filter((m) => m.tipo === "close").map((m) => m.id);
    expect(fechadas).toEqual(expect.arrayContaining(["att-2", "att-3"]));
  });

  /**
   * ⛔ `return()` do consumidor (o navegador fechou a aba no meio da resposta) não pode deixar
   * a tentativa `started`: `ai_usage_events_one_active_per_trilha_uidx` só aceita uma aberta
   * por trilha, e a medição daquela chamada nunca seria fechada.
   */
  it("`return()` do consumidor depois do primeiro delta fecha a tentativa como `cancelled`", async () => {
    respostasPorChamada = [
      decideTreinos,
      [
        { type: "delta", text: "primeiro" },
        { type: "delta", text: " segundo" },
        FINISH,
      ],
    ];

    const gen = runChat({ ...ENTRADA });
    let r = await gen.next();
    while (!r.done && (r.value as { type: string }).type !== "delta") r = await gen.next();
    expect(r.value).toEqual({ type: "delta", text: "primeiro" });

    await gen.return(undefined);

    // Coordenador · Task 12 — o primeiro delta é do especialista: a decisão já tinha fechado
    // `completed`, e o `return()` chega à trilha 1 pelo coordenador e fecha a dela.
    expect(medicao).toEqual([
      { tipo: "start", id: "att-1", attemptIndex: 1, attemptType: "PRIMARY" },
      { tipo: "close", id: "att-1", status: "completed" },
      { tipo: "start", id: "att-2", attemptIndex: 2, attemptType: "ESPECIALISTA" },
      { tipo: "close", id: "att-2", status: "cancelled" },
    ]);
    expect(statusDoRun).toBe("cancelled");
  });
});
