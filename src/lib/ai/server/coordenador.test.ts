/**
 * Chat livre com coordenador · Task 12 — `conduzirCoordenador`: decisão, resposta direta e
 * modo direto.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE SÓ SE PROVA AQUI                                                                ║
 * ║                                                                                       ║
 * ║  • o texto do passo de decisão fica RETIDO: sem acionamento ele é a resposta; com     ║
 * ║    acionamento ("Vou consultar…") ele some (spec §4.4);                               ║
 * ║  • o especialista recebe SÓ a tarefa, e o coordenador recebe o histórico (§4.3.2);    ║
 * ║  • cada pedido de acionamento é validado e AUDITADO antes de virar trilha — e sem a   ║
 * ║    linha de auditoria nada roda ("sem trilha, sem leitura");                          ║
 * ║  • "Cruzar módulos" desligada: o 2º acionamento é recusado e a frase do SERVIDOR      ║
 * ║    fecha a resposta, nunca um erro (Review Focus 3);                                  ║
 * ║  • `proposta` e `switch` do especialista saem com a trilha dele (Review Focus 2).     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Borda dupla (provedor, banco, credencial, executor), como em `chat-runner.test.ts`; o
 * registry de agentes, a oferta, a decisão, a trilha e a montagem do system rodam de verdade.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiStreamEvent } from "@/lib/ai/core/contracts";
import { findModel, type AiModelEntry } from "@/lib/ai/core/models";
import { wrapUntrusted } from "@/lib/ai/security/untrusted";
import type { AiPreferencesView } from "@/lib/ai/types";
import type { MemoriaParaPrompt } from "@/lib/ai/memory/contracts";

// ─────────────────────────── Duplos de borda ───────────────────────────

vi.mock("./credential-store", () => ({
  resolveApiKey: async () => ({ ok: true, value: "sk-de-mentira" }),
}));

type LinhaDeMedicao =
  | {
      tipo: "start";
      id: string;
      attemptIndex: number;
      attemptType: string;
      trilha: number | undefined;
      agentId: string;
    }
  | { tipo: "close"; id: string; status: string };

const medicao: LinhaDeMedicao[] = [];

type Acionamento = {
  especialistaId: string;
  tarefa: string;
  status: string;
  rejectionReason: string | null;
  stepId: string;
};
const acionamentos: Acionamento[] = [];
/** Rodada 1 — quando ligado, a linha do acionamento ACEITO não é gravada (`null`, como num `23505`). */
let auditoriaDoAceitoFalha = false;

vi.mock("./run-store", () => ({
  startAttempt: async (input: {
    attemptIndex: number;
    attemptType: string;
    trilha?: number;
    agentId: string;
  }) => {
    const id = `att-${input.attemptIndex}`;
    medicao.push({
      tipo: "start",
      id,
      attemptIndex: input.attemptIndex,
      attemptType: input.attemptType,
      trilha: input.trilha,
      agentId: input.agentId,
    });
    return { id, jaExistia: false };
  },
  closeAttempt: async (input: { attemptId: string; status: string }) => {
    medicao.push({ tipo: "close", id: input.attemptId, status: input.status });
  },
  registrarAcionamento: async (input: Acionamento) => {
    acionamentos.push({
      especialistaId: input.especialistaId,
      tarefa: input.tarefa,
      status: input.status,
      rejectionReason: input.rejectionReason,
      stepId: input.stepId,
    });
    if (auditoriaDoAceitoFalha && input.status === "executada") return null;
    return `tc-${acionamentos.length}`;
  },
}));

/** O "provedor": a chamada 0 é o coordenador; as seguintes, o especialista. */
let respostasPorChamada: (readonly AiStreamEvent[])[] = [];
const systemsRecebidos: string[] = [];
const ferramentasRecebidas: string[][] = [];
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

/**
 * O executor é DUPLO aqui: o que se prova é o coordenador, e a escrita real exigiria o
 * Approval Engine inteiro. O que importa é o que o laço faz com o resultado — e a proposta
 * sobe pelo mesmo `tool-loop` de sempre.
 */
vi.mock("@/lib/ai/tools/executor", () => ({
  executeTool: async (_ctx: unknown, call: { callId: string; toolName: string }) => ({
    callId: call.callId,
    toolName: call.toolName,
    isError: false,
    status: "executada",
    block: wrapUntrusted("resultado_de_ferramenta", call.toolName, { id: "prop-1" }),
    recordsRead: 0,
    proposta: {
      id: "prop-1",
      effectHash: "h1",
      expiresAt: "2026-08-06T15:10:00Z",
      toolName: call.toolName,
      risco: 3,
      resumo: "Lançar R$ 10,00",
      linhas: [],
      ressalvas: [],
    },
  }),
}));

/** Passo cuja abertura deve FALHAR (`kind`), como `audit.ts` faz num `23505`. */
let passoQueFalha: string | null = null;
const passosAbertos: { stepIndex: number; kind: string }[] = [];
const passosFechados: { stepId: string; status: string }[] = [];

vi.mock("@/lib/ai/tools/audit", () => ({
  startStep: async (input: { stepIndex: number; kind: string }) => {
    passosAbertos.push({ stepIndex: input.stepIndex, kind: input.kind });
    if (input.kind === passoQueFalha) return null;
    return `step-${passosAbertos.length}`;
  },
  closeStep: async (input: { stepId: string; status: string }) => {
    passosFechados.push({ stepId: input.stepId, status: input.status });
  },
  recordToolCall: async () => "tc",
}));

const { conduzirCoordenador } = await import("./coordenador");
const { criarPrazo } = await import("./prazo");
const { AVISO_SEM_AUDITORIA } = await import("./tool-loop");
const { avisoCruzarModulos, avisoSemEspecialista, blocoDaData } = await import(
  "@/lib/ai/agents/blocos-do-servidor"
);
const { blocoDeMemorias } = await import("@/lib/ai/memory/prompt");
const { catalogoDeEspecialistas } = await import("@/lib/ai/agents/especialistas");
type EntradaDoCoordenador = Parameters<typeof conduzirCoordenador>[0];

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

const MODELO: AiModelEntry = findModel("openai", "gpt-5.6-terra")!;
const AGORA = new Date("2026-08-06T15:00:00Z");

const aciona = (agente: string, tarefa: unknown, callId = `a-${agente}`): AiStreamEvent => ({
  type: "tool-call",
  toolName: `acionar_${agente}`,
  callId,
  input: { tarefa },
});

const delta = (text: string): AiStreamEvent => ({ type: "delta", text });

let permissoes: Record<string, boolean> = {};
let escrita: Record<string, boolean> = {};
let cruzarModulos = false;

function prefs(): AiPreferencesView {
  return {
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
    writePermissions: escrita,
    allowCrossModule: cruzarModulos,
  } as unknown as AiPreferencesView;
}

let indiceDeTentativa = 0;
let indiceDePasso = 0;

function entrada(parcial: Partial<EntradaDoCoordenador> = {}): EntradaDoCoordenador {
  return {
    run: { runId: "run-1", conversationId: "conv-1", userId: "user-1", assistantMessageId: "msg-a" },
    texto: "quanto gastei em outubro?",
    historico: [],
    prefs: prefs(),
    memorias: [],
    alvos: [{ provider: "openai", model: MODELO }],
    config: { timeoutMs: 30_000, maxRetries: 1 },
    fallbackLigado: false,
    contadores: {
      proximoAttemptIndex: () => (indiceDeTentativa += 1),
      proximoStepIndex: () => (indiceDePasso += 1),
      contarFallback: () => {},
    },
    prazo: criarPrazo(0),
    agora: AGORA,
    agoraMs: () => 0,
    abortSignal: new AbortController().signal,
    hoje: "2026-08-06",
    reservaRestante: () => 10,
    aoGastar: () => {},
    ...parcial,
  };
}

type Evento = Record<string, unknown> & { type: string };

async function conduzir(parcial: Partial<EntradaDoCoordenador> = {}) {
  const gen = conduzirCoordenador(entrada(parcial));
  const eventos: Evento[] = [];
  for (;;) {
    const passo = await gen.next();
    if (passo.done) return { eventos, desfecho: passo.value };
    eventos.push(passo.value as unknown as Evento);
  }
}

const deltas = (eventos: readonly Evento[]) =>
  eventos.filter((e) => e.type === "delta").map((e) => String(e.text));

beforeEach(() => {
  medicao.length = 0;
  acionamentos.length = 0;
  systemsRecebidos.length = 0;
  ferramentasRecebidas.length = 0;
  mensagensRecebidas.length = 0;
  passosAbertos.length = 0;
  passosFechados.length = 0;
  respostasPorChamada = [];
  passoQueFalha = null;
  auditoriaDoAceitoFalha = false;
  permissoes = { allow_finance: true, allow_todo: true };
  escrita = {};
  cruzarModulos = false;
  indiceDeTentativa = 0;
  indiceDePasso = 0;
});

// ────────────────────────────────────────────────────────────────

describe("conduzirCoordenador — a decisão", () => {
  it("resposta direta: sem acionamento, o texto retido sai inteiro e nenhum especialista roda", async () => {
    respostasPorChamada = [[delta("Olá!"), FINISH]];

    const { eventos, desfecho } = await conduzir({ texto: "oi" });

    expect(deltas(eventos)).toEqual(["Olá!"]);
    expect(eventos.some((e) => e.type === "especialista")).toBe(false);
    expect(desfecho).toMatchObject({ ok: true, texto: "Olá!" });
    const inicios = medicao.filter((m) => m.tipo === "start");
    expect(inicios).toEqual([
      expect.objectContaining({ trilha: 0, attemptType: "PRIMARY", agentId: "assistente-pessoal" }),
    ]);
    expect(acionamentos).toEqual([]);
  });

  it("o coordenador recebe uma ferramenta de acionamento por especialista oferecido", async () => {
    respostasPorChamada = [[delta("Olá!"), FINISH]];

    await conduzir();

    expect(ferramentasRecebidas[0]).toEqual(["acionar_todo", "acionar_financeiro"]);
  });

  it("retido vazio e nenhuma chamada: falha NO_FINISH", async () => {
    respostasPorChamada = [[FINISH]];

    const { desfecho } = await conduzir();

    expect(desfecho).toMatchObject({ ok: false, erro: { code: "NO_FINISH" }, cancelado: false });
  });

  it("nome fora da oferta encerra com UNEXPECTED_TOOL_CALL", async () => {
    respostasPorChamada = [[aciona("inexistente", "qualquer coisa"), FINISH]];

    const { eventos, desfecho } = await conduzir();

    expect(desfecho).toMatchObject({ ok: false, erro: { code: "UNEXPECTED_TOOL_CALL" } });
    expect(systemsRecebidos).toHaveLength(1);
    expect(eventos.some((e) => e.type === "especialista")).toBe(false);
  });

  it("tarefa inválida e texto retido vazio: a frase do servidor responde, nada roda", async () => {
    respostasPorChamada = [[aciona("financeiro", ""), FINISH]];

    const { eventos, desfecho } = await conduzir();

    expect(systemsRecebidos).toHaveLength(1);
    expect(acionamentos).toEqual([
      expect.objectContaining({
        especialistaId: "financeiro",
        status: "rejeitada",
        rejectionReason: "TOOL_INVALID_INPUT",
      }),
    ]);
    // A frase cita os módulos SEM leitura liberada — os desligados da oferta desta mensagem.
    const { desligados } = catalogoDeEspecialistas(permissoes, escrita);
    expect(desfecho).toMatchObject({ ok: true, texto: avisoSemEspecialista(desligados) });
    expect(deltas(eventos)).toEqual([avisoSemEspecialista(desligados)]);
  });
});

describe("conduzirCoordenador — o modo direto", () => {
  it("modo direto: o 'Vou consultar' some e a resposta do especialista é a final", async () => {
    respostasPorChamada = [
      [delta("Vou consultar…"), aciona("financeiro", "gasto de outubro"), FINISH],
      [delta("Você gastou R$ 10,00."), FINISH],
    ];

    const { eventos, desfecho } = await conduzir();

    const doEspecialista = eventos.filter((e) => e.type === "especialista");
    expect(doEspecialista).toEqual([
      { type: "especialista", agentId: "financeiro", rotulo: "Financeiro", trilha: 1, status: "consultando" },
      { type: "especialista", agentId: "financeiro", rotulo: "Financeiro", trilha: 1, status: "pronto" },
    ]);
    expect(desfecho).toMatchObject({ ok: true });
    expect(desfecho.ok && desfecho.texto).toBe("Você gastou R$ 10,00.");
    expect(deltas(eventos).some((t) => t.includes("Vou consultar"))).toBe(false);
    // O coordenador foi chamado UMA vez (a decisão); a segunda chamada é o especialista.
    expect(systemsRecebidos).toHaveLength(2);
    expect(ferramentasRecebidas[1]).toEqual([
      "finance.get_balances",
      "finance.get_spending",
      "finance.get_invoice",
    ]);
  });

  it("a tentativa do especialista é ESPECIALISTA na trilha 1, com o agente dele", async () => {
    respostasPorChamada = [
      [aciona("financeiro", "gasto de outubro"), FINISH],
      [delta("ok"), FINISH],
    ];

    await conduzir();

    expect(medicao.filter((m) => m.tipo === "start")).toEqual([
      expect.objectContaining({ trilha: 0, attemptType: "PRIMARY", agentId: "assistente-pessoal" }),
      expect.objectContaining({ trilha: 1, attemptType: "ESPECIALISTA", agentId: "financeiro" }),
    ]);
  });

  it("o acionamento é auditado como executada, no passo de ferramentas da decisão", async () => {
    respostasPorChamada = [
      [aciona("financeiro", "gasto de outubro"), FINISH],
      [delta("ok"), FINISH],
    ];

    await conduzir();

    expect(passosAbertos.slice(0, 2)).toEqual([
      { stepIndex: 1, kind: "modelo" },
      { stepIndex: 1, kind: "ferramentas" },
    ]);
    expect(acionamentos).toEqual([
      {
        especialistaId: "financeiro",
        tarefa: "gasto de outubro",
        status: "executada",
        rejectionReason: null,
        stepId: "step-2",
      },
    ]);
    // O passo do acionamento fecha; o especialista abre os seus a partir do 2.
    expect(passosFechados).toContainEqual({ stepId: "step-2", status: "completed" });
    expect(passosAbertos[2]).toEqual({ stepIndex: 2, kind: "modelo" });
  });

  it("o especialista recebe só a tarefa e o coordenador recebe o histórico", async () => {
    respostasPorChamada = [
      [aciona("financeiro", "gasto de outubro"), FINISH],
      [delta("ok"), FINISH],
    ];

    await conduzir({
      historico: [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Olá!" },
      ],
      texto: "quanto gastei em outubro?",
    });

    expect(mensagensRecebidas[1]).toEqual([{ role: "user", content: "gasto de outubro" }]);
    expect(mensagensRecebidas[0]).toEqual([
      { role: "user", content: "oi" },
      { role: "assistant", content: "Olá!" },
      { role: "user", content: "quanto gastei em outubro?" },
    ]);
  });

  /**
   * MOD-ia-027 — a resposta anterior FALHOU, então o histórico termina em `user`. O texto novo
   * seria um segundo `user` seguido, que vários provedores recusam: a normalização roda DEPOIS
   * de anexá-lo.
   */
  it("histórico terminado em user: o texto novo é fundido, nunca dois user seguidos", async () => {
    respostasPorChamada = [[delta("Olá!"), FINISH]];

    await conduzir({
      historico: [
        { role: "user", content: "oi" },
        { role: "assistant", content: "Olá!" },
        { role: "user", content: "pergunta que falhou" },
      ],
      texto: "quanto gastei em outubro?",
    });

    const enviadas = mensagensRecebidas[0];
    expect(enviadas.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(enviadas.at(-1)).toEqual({
      role: "user",
      content: "pergunta que falhou\n\nquanto gastei em outubro?",
    });
  });

  it("o system do especialista tem a data e termina pela memória do módulo dele", async () => {
    permissoes = { allow_finance: true, allow_memory: true };
    const memorias: MemoriaParaPrompt[] = [
      { id: "m1", conteudo: "prefiro valores sem centavos", modulo: "finance" },
      { id: "m2", conteudo: "me chame pelo primeiro nome", modulo: null },
    ];
    respostasPorChamada = [
      [aciona("financeiro", "gasto de outubro"), FINISH],
      [delta("ok"), FINISH],
    ];

    await conduzir({ memorias, prefs: prefs() });

    const doEspecialista = systemsRecebidos[1];
    expect(doEspecialista).toContain(blocoDaData(AGORA));
    expect(doEspecialista.endsWith(blocoDeMemorias(memorias))).toBe(true);
    // O coordenador não tem módulo: só a memória global entra no system dele.
    const doCoordenador = systemsRecebidos[0];
    expect(doCoordenador).toContain(blocoDaData(AGORA));
    expect(doCoordenador).toContain("me chame pelo primeiro nome");
    expect(doCoordenador).not.toContain("prefiro valores sem centavos");
    // E ela TERMINA o system dele — a memória por último também no coordenador (inv. 98).
    expect(doCoordenador.endsWith(blocoDeMemorias([memorias[1]!]))).toBe(true);
  });

  it("a proposta do especialista sai com a trilha dele", async () => {
    escrita = { allow_write_finance: true };
    respostasPorChamada = [
      [aciona("financeiro", "lançar R$ 10 no mercado"), FINISH],
      [{ type: "tool-call", toolName: "finance.lancar_transacao", callId: "w1", input: {} }, FINISH],
      [delta("Preparei o lançamento."), FINISH],
    ];

    const { eventos } = await conduzir({ prefs: prefs() });

    const propostas = eventos.filter((e) => e.type === "proposta");
    expect(propostas).toHaveLength(1);
    expect(propostas[0]).toMatchObject({ trilha: 1, proposta: { id: "prop-1" } });
  });

  /** Review Focus 2 (lado do servidor): o recomeço do especialista diz que trilha recomeçou. */
  it("no modo direto, o retry do especialista emite switch com a trilha dele", async () => {
    escrita = { allow_write_finance: true };
    respostasPorChamada = [
      [aciona("financeiro", "lançar R$ 10 no mercado"), FINISH],
      [{ type: "tool-call", toolName: "finance.lancar_transacao", callId: "w1", input: {} }, FINISH],
      [delta("Preparei"), ERRO_TEMPORARIO],
      [delta("Preparei o lançamento."), FINISH],
    ];

    const { eventos, desfecho } = await conduzir({ prefs: prefs() });

    const ordem = eventos
      .filter((e) => e.type === "proposta" || e.type === "switch")
      .map((e) => `${e.type}:${e.trilha}`);
    expect(ordem[0]).toBe("proposta:1");
    expect(ordem).toContain("switch:1");
    expect(ordem.indexOf("switch:1")).toBeGreaterThan(0);
    expect(desfecho).toMatchObject({ ok: true });
  });

  it("especialista que esgota as tentativas: desfecho de falha e status falhou", async () => {
    respostasPorChamada = [
      [aciona("financeiro", "gasto de outubro"), FINISH],
      [ERRO_TEMPORARIO],
      [ERRO_TEMPORARIO],
    ];

    const { eventos, desfecho } = await conduzir();

    expect(desfecho).toMatchObject({ ok: false, cancelado: false });
    expect(eventos.filter((e) => e.type === "especialista").map((e) => e.status)).toEqual([
      "consultando",
      "falhou",
    ]);
  });
});

describe("conduzirCoordenador — as recusas", () => {
  /** Review Focus 3. */
  it("cruzar módulos desligado: o 2º acionamento é recusado e a frase do servidor fecha a resposta", async () => {
    cruzarModulos = false;
    respostasPorChamada = [
      [aciona("financeiro", "gasto de outubro"), aciona("todo", "tarefas de hoje"), FINISH],
      [delta("Você gastou R$ 10,00."), FINISH],
    ];

    const { eventos, desfecho } = await conduzir({ prefs: prefs() });

    // Só o Financeiro rodou.
    expect(systemsRecebidos).toHaveLength(2);
    expect(medicao.filter((m) => m.tipo === "start" && m.trilha === 1)).toHaveLength(1);
    expect(desfecho.ok && desfecho.texto.endsWith(avisoCruzarModulos())).toBe(true);
    expect(desfecho.ok && desfecho.texto.startsWith("Você gastou R$ 10,00.")).toBe(true);
    expect(deltas(eventos).join("").endsWith(avisoCruzarModulos())).toBe(true);
    expect(acionamentos).toContainEqual(
      expect.objectContaining({
        especialistaId: "todo",
        status: "rejeitada",
        rejectionReason: "TOOL_PERMISSION_DENIED",
      }),
    );
    expect(eventos.some((e) => e.type === "error")).toBe(false);
  });

  it("acionamento repetido é recusado, não roda duas vezes", async () => {
    cruzarModulos = true;
    respostasPorChamada = [
      [
        aciona("financeiro", "gasto de outubro", "c1"),
        aciona("financeiro", "gasto de setembro", "c2"),
        FINISH,
      ],
      [delta("ok"), FINISH],
    ];

    await conduzir({ prefs: prefs() });

    expect(systemsRecebidos).toHaveLength(2);
    expect(medicao.filter((m) => m.tipo === "start" && m.trilha === 1)).toHaveLength(1);
    expect(acionamentos).toEqual([
      expect.objectContaining({ especialistaId: "financeiro", status: "executada" }),
      expect.objectContaining({
        especialistaId: "financeiro",
        tarefa: "gasto de setembro",
        status: "rejeitada",
        rejectionReason: "TOOL_INCOHERENT",
      }),
    ]);
  });

  it("sem stepId, nada é acionado e a resposta declara a falta de trilha", async () => {
    passoQueFalha = "ferramentas";
    respostasPorChamada = [
      [delta("Vou consultar…"), aciona("financeiro", "gasto de outubro"), FINISH],
      [delta("não deveria chegar aqui"), FINISH],
    ];

    const { eventos, desfecho } = await conduzir();

    expect(systemsRecebidos).toHaveLength(1);
    expect(acionamentos).toEqual([]);
    expect(eventos.some((e) => e.type === "especialista")).toBe(false);
    expect(desfecho).toMatchObject({ ok: true, texto: AVISO_SEM_AUDITORIA });
    expect(deltas(eventos)).toEqual([AVISO_SEM_AUDITORIA]);
  });

  /**
   * Rodada 1 — sem trilha, sem especialista, POR ACIONAMENTO. O especialista pode preparar
   * proposta; um aceito cuja linha em `ai_tool_calls` não foi gravada não vira trilha.
   */
  it("aceito cuja auditoria falhou não roda, e a resposta declara a falta de trilha", async () => {
    auditoriaDoAceitoFalha = true;
    respostasPorChamada = [
      [delta("Vou consultar…"), aciona("financeiro", "gasto de outubro"), FINISH],
      [delta("não deveria chegar aqui"), FINISH],
    ];

    const { eventos, desfecho } = await conduzir();

    expect(systemsRecebidos).toHaveLength(1);
    expect(eventos.some((e) => e.type === "especialista")).toBe(false);
    expect(desfecho).toMatchObject({ ok: true, texto: AVISO_SEM_AUDITORIA });
    expect(deltas(eventos)).toEqual([AVISO_SEM_AUDITORIA]);
  });

  it.todo("dois ou mais aceitos: especialistas em paralelo e síntese (Task 13)");
});
