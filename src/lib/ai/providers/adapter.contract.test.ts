/**
 * Fase 18-A — IA · Testes CONTRATUAIS dos adapters, com provedor MOCKADO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NENHUMA CHAMADA PAGA EM CI. O SDK e os quatro pacotes de provedor são mockados; nada  ║
 * ║ sai para a rede. O que se prova aqui é o CONTRATO:                                    ║
 * ║                                                                                       ║
 * ║  • `streamText` NUNCA lança — erro vira evento, senão o run ficaria sem fechamento;   ║
 * ║  • SEMPRE termina com `finish` ou `error` — nunca acaba em silêncio;                  ║
 * ║  • métrica ausente vira `null` + `unavailable`, NUNCA zero;                           ║
 * ║  • os quatro respondem pela MESMA interface interna.                                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiRequest, AiStreamEvent } from "@/lib/ai/core/contracts";

/** O que o `fullStream` do SDK vai devolver em cada cenário. */
let partesDoSdk: unknown[] = [];
let lancarNoStream: unknown = null;
/** Guarda as opções recebidas, para conferir o que foi ENVIADO ao provedor. */
let opcoesRecebidas: Record<string, unknown> | null = null;

vi.mock("ai", () => ({
  streamText: (opcoes: Record<string, unknown>) => {
    opcoesRecebidas = opcoes;
    return {
      get fullStream() {
        return (async function* () {
          if (lancarNoStream) throw lancarNoStream;
          for (const parte of partesDoSdk) yield parte;
        })();
      },
    };
  },
  /**
   * O `jsonSchema` real do SDK só EMBRULHA o JSON Schema num objeto validável — não valida
   * nada aqui. O mock mantém o formato para o teste poder inspecionar o que foi descrito ao
   * provedor sem carregar o pacote de verdade.
   */
  jsonSchema: (schema: unknown) => ({ jsonSchema: schema }),
}));

const fabricaFalsa = () => (modelId: string) => ({ modelId });
vi.mock("@ai-sdk/openai", () => ({ createOpenAI: () => fabricaFalsa() }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: () => fabricaFalsa() }));
vi.mock("@ai-sdk/anthropic", () => ({ createAnthropic: () => fabricaFalsa() }));
vi.mock("@ai-sdk/xai", () => ({ createXai: () => fabricaFalsa() }));

const { createProviderClient } = await import("./provider-factory");
const { AI_PROVIDERS } = await import("@/lib/ai/core/contracts");

const PEDIDO: AiRequest = {
  model: "modelo-de-teste",
  system: "prompt de sistema",
  messages: [{ role: "user", content: "olá" }],
  maxOutputTokens: 4000,
  timeoutMs: 30_000,
  tools: [],
};

async function coletar(eventos: AsyncIterable<AiStreamEvent>): Promise<AiStreamEvent[]> {
  const saida: AiStreamEvent[] = [];
  for await (const e of eventos) saida.push(e);
  return saida;
}

const USO_COMPLETO = {
  inputTokens: 4_100,
  outputTokens: 900,
  inputTokenDetails: { cacheReadTokens: 200 },
};

beforeEach(() => {
  partesDoSdk = [];
  lancarNoStream = null;
  opcoesRecebidas = null;
});

describe("7. os quatro provedores respondem pela MESMA interface interna", () => {
  for (const provider of AI_PROVIDERS) {
    it(`${provider}: streaming normalizado`, async () => {
      partesDoSdk = [
        { type: "text-delta", id: "1", text: "Olá" },
        { type: "text-delta", id: "1", text: ", tudo bem?" },
        { type: "finish-step", response: { id: "req-123" }, usage: USO_COMPLETO },
        { type: "finish", finishReason: "stop", totalUsage: USO_COMPLETO },
      ];

      const client = createProviderClient(provider, "chave-de-mentira");
      expect(client.provider).toBe(provider);

      const eventos = await coletar(client.streamText(PEDIDO));
      expect(eventos.map((e) => e.type)).toEqual(["delta", "delta", "finish"]);

      const fim = eventos.at(-1);
      if (fim?.type !== "finish") throw new Error("esperava finish");
      expect(fim.finishReason).toBe("stop");
      expect(fim.providerRequestId).toBe("req-123");
      expect(fim.usage.inputTokens).toBe(4_100);
      expect(fim.usage.outputTokens).toBe(900);
      expect(fim.usage.cachedInputTokens).toBe(200);
      expect(fim.usage.availability.inputTokens).toBe("available");
    });
  }
});

describe("o que é ENVIADO ao provedor", () => {
  it("61. toda chamada leva teto de saída EXPLÍCITO", async () => {
    partesDoSdk = [{ type: "finish", finishReason: "stop", totalUsage: USO_COMPLETO }];
    await coletar(createProviderClient("openai", "k").streamText(PEDIDO));
    expect(opcoesRecebidas?.maxOutputTokens).toBe(4000);
  });

  it("74. com o registry vazio, o campo `tools` NÃO é enviado", async () => {
    partesDoSdk = [{ type: "finish", finishReason: "stop", totalUsage: USO_COMPLETO }];
    await coletar(createProviderClient("openai", "k").streamText(PEDIDO));
    // Mandar `tools: {}` faria alguns provedores incluírem o system prompt de tool use,
    // que custa tokens por nada.
    expect(opcoesRecebidas && "tools" in opcoesRecebidas).toBe(false);
  });

  it("o retry é NOSSO — o SDK não repete por conta própria", async () => {
    partesDoSdk = [{ type: "finish", finishReason: "stop", totalUsage: USO_COMPLETO }];
    await coletar(createProviderClient("openai", "k").streamText(PEDIDO));
    // Retry do SDK produziria chamadas pagas que o nosso medidor nunca veria.
    expect(opcoesRecebidas?.maxRetries).toBe(0);
  });
});

describe("54. métrica ausente é INDISPONÍVEL, nunca zero", () => {
  it("provedor que não informa tokens produz null + unavailable", async () => {
    partesDoSdk = [
      { type: "text-delta", id: "1", text: "oi" },
      { type: "finish", finishReason: "stop", totalUsage: {} },
    ];

    const eventos = await coletar(createProviderClient("gemini", "k").streamText(PEDIDO));
    const fim = eventos.at(-1);
    if (fim?.type !== "finish") throw new Error("esperava finish");

    expect(fim.usage.inputTokens).toBeNull();
    expect(fim.usage.outputTokens).toBeNull();
    expect(fim.usage.availability.outputTokens).toBe("unavailable");
    expect(fim.usage.availability.note).toContain("não informou");
  });

  it("uso PARCIAL grava o que veio e marca o resto", async () => {
    partesDoSdk = [
      {
        type: "finish",
        finishReason: "stop",
        totalUsage: { inputTokens: 100, inputTokenDetails: {} },
      },
    ];
    const eventos = await coletar(createProviderClient("xai", "k").streamText(PEDIDO));
    const fim = eventos.at(-1);
    if (fim?.type !== "finish") throw new Error("esperava finish");

    expect(fim.usage.inputTokens).toBe(100);
    expect(fim.usage.outputTokens).toBeNull();
    expect(fim.usage.availability.inputTokens).toBe("available");
    expect(fim.usage.availability.outputTokens).toBe("unavailable");
  });
});

describe("erros e encerramentos anômalos", () => {
  it("`streamText` NUNCA lança — erro vira evento", async () => {
    lancarNoStream = { statusCode: 401, name: "APICallError" };
    const eventos = await coletar(createProviderClient("anthropic", "k").streamText(PEDIDO));

    expect(eventos).toHaveLength(1);
    if (eventos[0].type !== "error") throw new Error("esperava error");
    expect(eventos[0].error.class).toBe("AUTENTICACAO_INVALIDA");
  });

  it("evento de erro do SDK é normalizado nas 10 classes", async () => {
    partesDoSdk = [
      { type: "text-delta", id: "1", text: "parcial" },
      { type: "error", error: { statusCode: 429 } },
    ];
    const eventos = await coletar(createProviderClient("openai", "k").streamText(PEDIDO));
    const ultimo = eventos.at(-1);
    if (ultimo?.type !== "error") throw new Error("esperava error");
    expect(ultimo.error.class).toBe("RATE_LIMIT");
  });

  it("abort vira CANCELADO_PELO_USUARIO", async () => {
    partesDoSdk = [{ type: "abort", reason: "user" }];
    const eventos = await coletar(createProviderClient("openai", "k").streamText(PEDIDO));
    const ultimo = eventos.at(-1);
    if (ultimo?.type !== "error") throw new Error("esperava error");
    expect(ultimo.error.class).toBe("CANCELADO_PELO_USUARIO");
  });

  it("stream que acaba SEM finish é fechado como erro explícito", async () => {
    // Um stream mudo deixaria o run aberto e a reserva presa até a reconciliação.
    partesDoSdk = [{ type: "text-delta", id: "1", text: "oi" }];
    const eventos = await coletar(createProviderClient("openai", "k").streamText(PEDIDO));
    const ultimo = eventos.at(-1);
    if (ultimo?.type !== "error") throw new Error("esperava error");
    expect(ultimo.error.code).toBe("STREAM_ENDED_WITHOUT_FINISH");
  });

  it("75. tool call inesperada é REPASSADA como evento — não executada", async () => {
    partesDoSdk = [
      { type: "tool-call", toolName: "finance.delete_all", toolCallId: "tc-1" },
      { type: "finish", finishReason: "tool-calls", totalUsage: USO_COMPLETO },
    ];
    const eventos = await coletar(createProviderClient("openai", "k").streamText(PEDIDO));

    const toolCall = eventos.find((e) => e.type === "tool-call");
    expect(toolCall).toBeDefined();
    // O adapter não executa nada: quem decide é o chat-runner, que encerra o run como
    // `failed` com UNEXPECTED_TOOL_CALL.
    if (toolCall?.type === "tool-call") {
      expect(toolCall.toolName).toBe("finance.delete_all");
    }
  });

  it("partes desconhecidas do SDK são ignoradas sem quebrar o contrato", async () => {
    partesDoSdk = [
      { type: "start" },
      { type: "reasoning-delta", id: "r", text: "pensando" },
      { type: "raw", rawValue: {} },
      { type: "text-delta", id: "1", text: "ok" },
      { type: "finish", finishReason: "stop", totalUsage: USO_COMPLETO },
    ];
    const eventos = await coletar(createProviderClient("openai", "k").streamText(PEDIDO));
    expect(eventos.map((e) => e.type)).toEqual(["delta", "finish"]);
  });
});

describe("ferramentas (18-B)", () => {
  const COM_FERRAMENTA: AiRequest = {
    ...PEDIDO,
    tools: [
      {
        name: "training.get_records",
        description: "Recordes pessoais.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
    ],
  };

  it("envia a definição ao provedor, com o schema", async () => {
    partesDoSdk = [{ type: "finish", finishReason: "stop", totalUsage: USO_COMPLETO }];
    const client = createProviderClient("openai", "chave");
    await coletar(client.streamText(COM_FERRAMENTA));

    const tools = opcoesRecebidas?.tools as Record<string, unknown>;
    expect(Object.keys(tools)).toEqual(["training.get_records"]);
  });

  // A trava desta subfase: quem executa somos NÓS, fora do SDK.
  it("NUNCA envia `execute` — a execução não acontece dentro do SDK", async () => {
    partesDoSdk = [{ type: "finish", finishReason: "stop", totalUsage: USO_COMPLETO }];
    const client = createProviderClient("openai", "chave");
    await coletar(client.streamText(COM_FERRAMENTA));

    const tools = opcoesRecebidas?.tools as Record<string, Record<string, unknown>>;
    expect(tools["training.get_records"].execute).toBeUndefined();
    expect(opcoesRecebidas?.stopWhen).toBeUndefined();
  });

  it("sem ferramentas, o campo nem é enviado", async () => {
    partesDoSdk = [{ type: "finish", finishReason: "stop", totalUsage: USO_COMPLETO }];
    const client = createProviderClient("openai", "chave");
    await coletar(client.streamText(PEDIDO));
    expect(opcoesRecebidas?.tools).toBeUndefined();
  });

  it("o evento tool-call carrega os argumentos do modelo", async () => {
    partesDoSdk = [
      {
        type: "tool-call",
        toolName: "training.get_records",
        toolCallId: "call-1",
        input: { escopo: "geral" },
      },
      { type: "finish", finishReason: "tool-calls", totalUsage: USO_COMPLETO },
    ];
    const client = createProviderClient("anthropic", "chave");
    const eventos = await coletar(client.streamText(COM_FERRAMENTA));

    expect(eventos[0]).toEqual({
      type: "tool-call",
      toolName: "training.get_records",
      callId: "call-1",
      input: { escopo: "geral" },
    });
  });

  it("traduz o histórico com partes: tool-call do assistente e tool-result do papel tool", async () => {
    partesDoSdk = [{ type: "finish", finishReason: "stop", totalUsage: USO_COMPLETO }];
    const client = createProviderClient("gemini", "chave");
    await coletar(
      client.streamText({
        ...COM_FERRAMENTA,
        messages: [
          { role: "user", content: "meus recordes?" },
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                callId: "call-1",
                toolName: "training.get_records",
                input: {},
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                callId: "call-1",
                toolName: "training.get_records",
                output: { contagem: 2 },
                isError: false,
              },
            ],
          },
        ],
      }),
    );

    const messages = opcoesRecebidas?.messages as Array<Record<string, unknown>>;
    expect(messages[1]).toEqual({
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "training.get_records",
          input: {},
        },
      ],
    });
    expect(messages[2]).toEqual({
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "training.get_records",
          output: { type: "json", value: { contagem: 2 } },
        },
      ],
    });
  });

  it("resultado de erro vai como error-json, não como texto solto", async () => {
    partesDoSdk = [{ type: "finish", finishReason: "stop", totalUsage: USO_COMPLETO }];
    const client = createProviderClient("xai", "chave");
    await coletar(
      client.streamText({
        ...COM_FERRAMENTA,
        messages: [
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                callId: "c",
                toolName: "t",
                output: { erro: "não autorizado" },
                isError: true,
              },
            ],
          },
        ],
      }),
    );

    const messages = opcoesRecebidas?.messages as Array<Record<string, unknown>>;
    const conteudo = (messages[0].content as Array<Record<string, unknown>>)[0];
    expect(conteudo.output).toEqual({
      type: "error-json",
      value: { erro: "não autorizado" },
    });
  });
});

describe("teste de conexão — listagem de modelos, ZERO tokens", () => {
  it("extrai os ids e não vaza a chave na URL", async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const fetchOriginal = globalThis.fetch;

    globalThis.fetch = (async (url: string, init: RequestInit) => {
      chamadas.push({ url, init });
      return new Response(JSON.stringify({ data: [{ id: "gpt-5.6-terra" }] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    try {
      const r = await createProviderClient("openai", "sk-minha-chave").listModels();
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual(["gpt-5.6-terra"]);

      // A chave vai em CABEÇALHO. URL com credencial vaza em log de proxy e em histórico.
      expect(chamadas[0].url).not.toContain("sk-minha-chave");
      expect(chamadas[0].url.startsWith("https://")).toBe(true);
      // Redirect é erro: um 3xx para outro host levaria a chave junto.
      expect(chamadas[0].init.redirect).toBe("error");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("o Gemini devolve 'models/x' e o adapter normaliza para 'x'", async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ models: [{ name: "models/gemini-3.6-flash" }] }), {
        status: 200,
      })) as unknown as typeof fetch;

    try {
      const r = await createProviderClient("gemini", "k").listModels();
      if (!r.ok) throw new Error("esperava sucesso");
      expect(r.value).toEqual(["gemini-3.6-flash"]);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("chave recusada vira AUTENTICACAO_INVALIDA sem ecoar o corpo", async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response('{"error":"invalid api key sk-proj-Segredo123456789"}', {
        status: 401,
      })) as unknown as typeof fetch;

    try {
      const r = await createProviderClient("anthropic", "k").listModels();
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error.class).toBe("AUTENTICACAO_INVALIDA");
        expect(r.error.message).not.toContain("sk-proj-");
        expect(r.error.message).not.toContain("invalid api key");
      }
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });

  it("resposta em formato inesperado devolve lista vazia, não quebra", async () => {
    const fetchOriginal = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ inesperado: true }), {
        status: 200,
      })) as unknown as typeof fetch;

    try {
      const r = await createProviderClient("xai", "k").listModels();
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toEqual([]);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  });
});
