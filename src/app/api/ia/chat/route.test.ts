import { beforeEach, describe, expect, it, vi } from "vitest";

const authContextMock = vi.fn();
const runChatMock = vi.fn();
const runExperienceMock = vi.fn();

vi.mock("@/lib/actions/helpers", () => ({
  authContext: () => authContextMock(),
}));

vi.mock("@/lib/ai/server/chat-runner", () => ({
  runChat: (input: unknown) => runChatMock(input),
}));

vi.mock("@/lib/ai/server/experience-runner", () => ({
  AI_EXPERIENCE_WITHOUT_DATA: "AI_EXPERIENCE_WITHOUT_DATA",
  runExperience: (input: unknown) => runExperienceMock(input),
}));

vi.mock("@/lib/ai/server/crypto-readiness", () => ({
  AI_CRYPTO_NOT_CONFIGURED: "AI_CRYPTO_NOT_CONFIGURED",
  getCryptoReadiness: () => ({ ready: true }),
}));

const { POST } = await import("./route");

/**
 * O duplo do runner. Devolve UM evento de erro e encerra: basta para o Route Handler
 * responder JSON, e o que interessa é o `input` que ele recebeu.
 */
function runnerQueFalha() {
  return (async function* () {
    yield { type: "error" as const, code: "AI_RATE_LIMITED", message: "devagar" };
  })();
}

function pedir(corpo: unknown): Request {
  return new Request("http://localhost:3000/api/ia/chat", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "sec-fetch-site": "same-origin",
    },
    body: JSON.stringify(corpo),
  });
}

/** O que o runner recebeu na última chamada. */
function entradaDoRunner(): Record<string, unknown> {
  expect(runChatMock).toHaveBeenCalledTimes(1);
  return runChatMock.mock.calls[0][0] as Record<string, unknown>;
}

beforeEach(() => {
  authContextMock.mockReset();
  runChatMock.mockReset();
  runExperienceMock.mockReset();
  authContextMock.mockResolvedValue({ supabase: {}, userId: "usuario-da-sessao" });
  runChatMock.mockImplementation(() => runnerQueFalha());
  runExperienceMock.mockImplementation(() => runnerQueFalha());
});

describe("POST /api/ia/chat — mensagem e sessão", () => {
  it("o dono vem da sessão e o runner não recebe os campos aposentados", async () => {
    await POST(pedir({ text: "oi" }));
    const entrada = entradaDoRunner();
    expect(entrada.userId).toBe("usuario-da-sessao");
    for (const campo of ["pageContext", "agentId", "caixaDeEntrada"]) expect(entrada).not.toHaveProperty(campo);
  });
  it("sem sessão, nada é executado", async () => {
    authContextMock.mockResolvedValue(null);
    expect((await POST(pedir({ text: "oi" }))).status).toBe(401);
    expect(runChatMock).not.toHaveBeenCalled();
  });
  it("origem cruzada é recusada antes da execução", async () => {
    const pedido = new Request("http://localhost:3000/api/ia/chat", {
      method: "POST", headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" }, body: JSON.stringify({ text: "oi" }),
    });
    expect((await POST(pedido)).status).toBe(403);
    expect(runChatMock).not.toHaveBeenCalled();
  });
});

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ 18-F Bloco 4 — O PANORAMA ENTRA PELO MESMO ENDPOINT. NENHUM ENDPOINT NOVO.            ║
 * ║                                                                                       ║
 * ║ A escolha do gerador é de TRANSPORTE: quem sabe o que é uma experiência é              ║
 * ║ `experience-runner.ts`; quem sabe o que é uma mensagem é `chat-runner.ts`. O que este  ║
 * ║ arquivo prova é o cabeamento — e que os dois caminhos NÃO se misturam.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("POST /api/ia/chat — o panorama (18-F Bloco 4)", () => {
  it("um panorama vai para `runExperience`, e o chat NÃO é chamado", async () => {
    const resposta = await POST(pedir({ experiencia: "planejar-dia" }));

    expect(resposta.status).toBe(429); // o duplo do runner devolve AI_RATE_LIMITED
    expect(runChatMock).not.toHaveBeenCalled();
    expect(runExperienceMock).toHaveBeenCalledTimes(1);

    const entrada = runExperienceMock.mock.calls[0][0] as Record<string, unknown>;
    expect(entrada.experiencia).toBe("planejar-dia");
    // `user_id` continua vindo da SESSÃO, aqui como em tudo mais.
    expect(entrada.userId).toBe("usuario-da-sessao");
  });

  it("uma mensagem continua indo para `runChat`, e o panorama NÃO é chamado", async () => {
    await POST(pedir({ text: "oi" }));

    expect(runExperienceMock).not.toHaveBeenCalled();
    expect(runChatMock).toHaveBeenCalledTimes(1);
  });

  /**
   * ⛔ NENHUM DOS DOIS RODA. O corpo não casa com forma nenhuma — e a recusa é do SCHEMA,
   * não de um `if` do handler: não existe schema neste repositório que aceite os dois campos
   * juntos.
   */
  it("panorama COM texto do cliente é 400, e nada é executado", async () => {
    const resposta = await POST(pedir({ experiencia: "planejar-dia", text: "oi" }));

    expect(resposta.status).toBe(400);
    expect(runChatMock).not.toHaveBeenCalled();
    expect(runExperienceMock).not.toHaveBeenCalled();
  });

  it("panorama fora da allowlist é 400, e nada é executado", async () => {
    const resposta = await POST(pedir({ experiencia: "planejar-o-mes" }));

    expect(resposta.status).toBe(400);
    expect(runExperienceMock).not.toHaveBeenCalled();

    const corpo = (await resposta.json()) as { error?: string };
    // pt-BR, e sem ecoar o valor recusado.
    expect(corpo.error).toBe("Panorama não reconhecido.");
    expect(corpo.error ?? "").not.toContain("planejar-o-mes");
  });

  /**
   * ⚠️ A mensagem aqui é a do RAMO (a mensagem, por ausência de `experiencia`), não a do topo
   * da união — e é melhor assim: ela diz o que está errado com o corpo que o cliente mandou.
   * A frase "não corresponde a uma mensagem nem a um panorama" fica em `route.ts` como
   * fallback para o caso em que nenhum ramo consegue ser escolhido, e o que ela garante é que
   * o inglês do Zod nunca chega à tela.
   */
  it("corpo vazio é 400, com mensagem em pt-BR e sem eco do que veio", async () => {
    const resposta = await POST(pedir({}));

    expect(resposta.status).toBe(400);
    expect(runChatMock).not.toHaveBeenCalled();
    expect(runExperienceMock).not.toHaveBeenCalled();

    const corpo = (await resposta.json()) as { code?: string; error?: string };
    expect(corpo.code).toBe("AI_BAD_REQUEST");
    expect(corpo.error).toBe("Pedido em formato inválido.");
    // ⛔ Nada de inglês do Zod: a frase é nossa, e é a que o `toast` mostra.
    expect(corpo.error ?? "").not.toMatch(/invalid|expected|required/i);
  });

  it("texto longo demais continua 413, e não vira 400 por causa da união", async () => {
    const resposta = await POST(pedir({ text: "a".repeat(40_000) }));

    expect(resposta.status).toBe(413);
    expect(runChatMock).not.toHaveBeenCalled();
  });

  /** Os quatro códigos novos viram status próprios — tradução, não decisão. */
  const STATUS: ReadonlyArray<readonly [string, number]> = [
    ["AI_EXPERIENCE_NOT_AVAILABLE", 400],
    ["AI_CROSS_MODULE_NOT_ALLOWED", 409],
    ["AI_EXPERIENCE_WITHOUT_DATA", 409],
    // ⚠️ 409 e não 429: não é excesso de pedidos, é ESTE pedido chegando duas vezes. O
    // dono não precisa esperar "menos", precisa saber que o primeiro já está a caminho.
    ["AI_EXPERIENCE_JUST_STARTED", 409],
  ];

  for (const [code, status] of STATUS) {
    it(`${code} vira ${status}`, async () => {
      runExperienceMock.mockImplementation(() =>
        (async function* () {
          yield { type: "error" as const, code, message: "motivo em pt-BR" };
        })(),
      );

      const resposta = await POST(pedir({ experiencia: "encerrar-dia" }));
      expect(resposta.status).toBe(status);

      const corpo = (await resposta.json()) as { code?: string; error?: string };
      expect(corpo.code).toBe(code);
      expect(corpo.error).toBe("motivo em pt-BR");
    });
  }


});


describe("campos aposentados do chat livre", () => {
  it.each([
    ["pageContext", { rota: "/treinos" }], ["caixaDeEntrada", true], ["agentId", "treinos"],
  ])("%s dá 400 com mensagem em pt-BR e não chega ao runner", async (campo, valor) => {
    const resposta = await POST(pedir({ text: "oi", [String(campo)]: valor }));
    expect(resposta.status).toBe(400);
    expect(runChatMock).not.toHaveBeenCalled();
    expect(runExperienceMock).not.toHaveBeenCalled();
    expect(await resposta.json()).toMatchObject({ code: "AI_BAD_REQUEST", error: "O pedido trouxe um campo que o servidor não aceita." });
  });
});
