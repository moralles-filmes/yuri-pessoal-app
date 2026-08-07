/**
 * Fase 18-B — `/api/ia/chat` · o CABEAMENTO do contexto da página.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE ESTE ARQUIVO EXISTE                                                           ║
 * ║                                                                                       ║
 * ║ O schema sozinho não prova nada: ele pode aceitar o contexto perfeitamente e o Route  ║
 * ║ Handler jogá-lo fora — o resultado seria uma tela que oferece contexto e um roteador  ║
 * ║ que nunca o vê. É a falha silenciosa clássica desta fase.                             ║
 * ║                                                                                       ║
 * ║ E prova a metade que o schema não pode provar: o MÓDULO é resolvido AQUI, no servidor, ║
 * ║ a partir da rota. Ele é quem escolhe o agente e, por tabela, a allowlist de           ║
 * ║ ferramentas — o cliente não tem como declará-lo.                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O runner é um duplo: aqui não se testa IA, se testa transporte.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const authContextMock = vi.fn();
const runChatMock = vi.fn();

vi.mock("@/lib/actions/helpers", () => ({
  authContext: () => authContextMock(),
}));

vi.mock("@/lib/ai/server/chat-runner", () => ({
  runChat: (input: unknown) => runChatMock(input),
}));

vi.mock("@/lib/ai/server/crypto-readiness", () => ({
  AI_CRYPTO_NOT_CONFIGURED: "AI_CRYPTO_NOT_CONFIGURED",
  getCryptoReadiness: () => ({ ready: true }),
}));

const { POST } = await import("./route");

const UUID = "11111111-2222-4333-8444-555555555555";

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
  authContextMock.mockResolvedValue({ supabase: {}, userId: "usuario-da-sessao" });
  runChatMock.mockImplementation(() => runnerQueFalha());
});

describe("POST /api/ia/chat — contexto da página", () => {
  it("repassa a rota ao runner E resolve o módulo no SERVIDOR", async () => {
    const resposta = await POST(pedir({ text: "como estou indo?", pageContext: { rota: "/treinos" } }));

    expect(resposta.status).toBe(429);
    expect(entradaDoRunner().pageContext).toEqual({
      rota: "/treinos",
      modulo: "training",
    });
  });

  it("cada rota da lista chega ao runner com o módulo dela", async () => {
    for (const rota of ["/treinos/historico", "/treinos/recordes"]) {
      runChatMock.mockClear();
      await POST(pedir({ text: "oi", pageContext: { rota } }));
      expect(entradaDoRunner().pageContext).toEqual({ rota, modulo: "training" });
    }
  });

  it("sem contexto, o runner recebe `null` — não `undefined` nem objeto vazio", async () => {
    await POST(pedir({ text: "oi" }));
    expect(entradaDoRunner().pageContext).toBeNull();
  });

  it("`user_id` continua vindo da SESSÃO, nunca do corpo", async () => {
    await POST(pedir({ text: "oi", pageContext: { rota: "/treinos" } }));
    expect(entradaDoRunner().userId).toBe("usuario-da-sessao");
  });

  /**
   * O par que importa: pedido inválido não vira 500 e NÃO CHEGA ao runner. Nenhuma consulta
   * acontece, então não há como devolver dado de terceiro nem erro cru de banco.
   */
  const RECUSADOS: ReadonlyArray<readonly [string, unknown]> = [
    ["rota fora da lista", { rota: "/financeiro" }],
    ["rota de um registro", { rota: `/treinos/historico/${UUID}` }],
    ["módulo declarado pelo cliente", { rota: "/treinos", modulo: "finance" }],
    ["registroId de outro usuário", { rota: "/treinos", registroId: UUID }],
    ["conteúdo da tela", { rota: "/treinos", titulo: "Treino A" }],
    ["user_id no contexto", { rota: "/treinos", user_id: UUID }],
  ];

  for (const [nome, pageContext] of RECUSADOS) {
    it(`400 e NENHUMA execução: ${nome}`, async () => {
      const resposta = await POST(pedir({ text: "oi", pageContext }));
      expect(resposta.status).toBe(400);
      expect(runChatMock).not.toHaveBeenCalled();

      const corpo = (await resposta.json()) as { code?: string; error?: string };
      expect(corpo.code).toBe("AI_BAD_REQUEST");
      // Erro em pt-BR e sem eco do valor recusado.
      expect(corpo.error ?? "").not.toContain(UUID);
    });
  }

  it("sem sessão, nada é executado — nem com contexto válido", async () => {
    authContextMock.mockResolvedValue(null);
    const resposta = await POST(pedir({ text: "oi", pageContext: { rota: "/treinos" } }));
    expect(resposta.status).toBe(401);
    expect(runChatMock).not.toHaveBeenCalled();
  });

  it("origem cruzada é recusada antes de qualquer execução", async () => {
    const pedido = new Request("http://localhost:3000/api/ia/chat", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "cross-site" },
      body: JSON.stringify({ text: "oi", pageContext: { rota: "/treinos" } }),
    });
    const resposta = await POST(pedido);
    expect(resposta.status).toBe(403);
    expect(runChatMock).not.toHaveBeenCalled();
  });
});
