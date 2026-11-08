/**
 * MOD-ia-005 — o adapter respeita `timeoutMs` nos DOIS métodos.
 *
 * Até aqui `timeoutMs` atravessava o contrato e morria no adapter: `streamText` dependia do
 * timer do chat-runner, e `generateObject` (extração de comprovante e insight) não tinha
 * timeout nenhum. Um provedor pendurado prendia a função até a plataforma matá-la — e aí o
 * `finally` não roda, e run e tentativa ficam abertos até a lease.
 *
 * O modelo duplo nunca responde: só volta quando o sinal que recebeu aborta, como o `fetch`
 * de um provedor real. Sem timeout no adapter, os dois casos ficariam pendurados.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { AiStreamEvent } from "@/lib/ai/core/contracts";
import { createAdapter } from "./adapter";

/** Uma chamada que nunca resolve sozinha: só rejeita quando o sinal aborta. */
function pendurada(options: { abortSignal?: AbortSignal }): Promise<never> {
  return new Promise<never>((_, reject) => {
    const sinal = options.abortSignal;
    if (!sinal) return;
    if (sinal.aborted) reject(sinal.reason);
    else sinal.addEventListener("abort", () => reject(sinal.reason), { once: true });
  });
}

function adapterPendurado() {
  const modelo = new MockLanguageModelV4({
    doStream: pendurada,
    doGenerate: pendurada,
  });
  return createAdapter({
    provider: "openai",
    buildModel: () => modelo as never,
    apiKey: "sk-de-mentira",
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  /**
   * ⚠️ `AbortSignal.timeout` usa um timer interno do Node, que os timers falsos do Vitest NÃO
   * alcançam. Trocá-lo por um `setTimeout` (esse, sim, falso) é o que permite avançar o
   * relógio do teste — e a razão do aborto continua sendo um `TimeoutError`, como a real.
   */
  vi.spyOn(AbortSignal, "timeout").mockImplementation((ms: number) => {
    const controller = new AbortController();
    setTimeout(
      () => controller.abort(new DOMException("The operation timed out.", "TimeoutError")),
      ms,
    );
    return controller.signal;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("adapter — timeout por chamada", () => {
  it("streamText respeita `timeoutMs`: encerra com erro de TIMEOUT e não fica pendurado", async () => {
    const client = adapterPendurado();
    const eventos: AiStreamEvent[] = [];

    const consumo = (async () => {
      for await (const e of client.streamText({
        model: "gpt-teste",
        system: "s",
        messages: [{ role: "user", content: "oi" }],
        maxOutputTokens: 100,
        timeoutMs: 5_000,
        abortSignal: new AbortController().signal,
        tools: [],
      })) {
        eventos.push(e);
      }
    })();

    await vi.advanceTimersByTimeAsync(5_000);
    await consumo;

    expect(eventos.at(-1)).toMatchObject({
      type: "error",
      error: { class: "TIMEOUT", code: "PROVIDER_TIMEOUT" },
    });
  });

  it("generateObject respeita `timeoutMs`: devolve erro de TIMEOUT e não fica pendurado", async () => {
    const client = adapterPendurado();

    const promessa = client.generateObject({
      model: "gpt-teste",
      system: "s",
      messages: [{ role: "user", content: "oi" }],
      schema: { type: "object", properties: {} },
      schemaName: "teste",
      schemaDescription: "teste",
      maxOutputTokens: 100,
      timeoutMs: 5_000,
    });

    await vi.advanceTimersByTimeAsync(5_000);
    const resultado = await promessa;

    expect(resultado).toMatchObject({
      ok: false,
      error: { class: "TIMEOUT", code: "PROVIDER_TIMEOUT" },
    });
  });

  /**
   * O contraponto: cancelamento do dono continua sendo cancelamento. Se tudo que aborta
   * virasse TIMEOUT, `decideFallback` repetiria uma chamada que o dono mandou parar.
   */
  it("aborto do sinal externo continua sendo cancelamento, não timeout", async () => {
    const client = adapterPendurado();
    const externo = new AbortController();
    const eventos: AiStreamEvent[] = [];

    const consumo = (async () => {
      for await (const e of client.streamText({
        model: "gpt-teste",
        system: "s",
        messages: [{ role: "user", content: "oi" }],
        maxOutputTokens: 100,
        timeoutMs: 5_000,
        abortSignal: externo.signal,
        tools: [],
      })) {
        eventos.push(e);
      }
    })();

    await vi.advanceTimersByTimeAsync(1_000);
    externo.abort();
    await vi.advanceTimersByTimeAsync(0);
    await consumo;

    expect(eventos.at(-1)).toMatchObject({
      type: "error",
      error: { class: "CANCELADO_PELO_USUARIO" },
    });
  });
});
