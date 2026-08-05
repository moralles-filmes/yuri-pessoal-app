/**
 * Fase 18-B — IA · A auditoria não pode falhar EM SILÊNCIO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `supabase-js` NÃO LANÇA em erro de banco: devolve `{ data: null, error }`.            ║
 * ║                                                                                       ║
 * ║ Por isso um `try/catch` (ou um `.catch()`) em volta da chamada NÃO é rede nenhuma —   ║
 * ║ é código morto que passa a impressão de que o caso está tratado. RLS negando a linha, ║
 * ║ CHECK recusando o status, FK apontando para run de outro usuário: sem ler `error`,    ║
 * ║ nada disso aparece, e a tela de "Ver dados usados" continua parecendo completa.       ║
 * ║                                                                                       ║
 * ║ Estes testes exercitam o caminho REAL (retorno com `error`), não um lançamento que a  ║
 * ║ biblioteca nunca produz.                                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Resposta = { data: unknown; error: { code: string; message: string } | null };

let resposta: Resposta = { data: { id: "step-1" }, error: null };

/** Encadeamento mínimo do PostgREST: `.insert().select().single()` e `.update().eq().eq()`. */
function encadeavel(): unknown {
  const alvo = {
    insert: () => encadeavel(),
    update: () => encadeavel(),
    select: () => encadeavel(),
    eq: () => encadeavel(),
    single: async () => resposta,
    then: (aceita: (r: Resposta) => unknown) => Promise.resolve(resposta).then(aceita),
  };
  return alvo;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: () => encadeavel() }),
}));

const { startStep, closeStep, recordToolCall } = await import("./audit");

const ERRO_DO_BANCO = {
  code: "42501",
  message: 'new row violates row-level security policy for table "ai_tool_calls"',
};

let logs: unknown[][] = [];

beforeEach(() => {
  logs = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logs.push(args);
  });
  resposta = { data: { id: "step-1" }, error: null };
});

afterEach(() => {
  vi.restoreAllMocks();
});

const chamadaDeFerramenta = () =>
  recordToolCall({
    runId: "run-1",
    userId: "user-1",
    stepId: "step-1",
    toolName: "training.get_volume",
    toolVersion: "1",
    providerCallId: "call-1",
    argumentos: { dias: 7 },
    status: "executada",
    rejectionReason: null,
    recordsRead: 3,
    durationMs: 12,
    refs: [],
  });

describe("auditoria — erro de banco é lido e registrado", () => {
  it("insert de ai_tool_calls que falha não lança, mas DEIXA RASTRO", async () => {
    resposta = { data: null, error: ERRO_DO_BANCO };

    await expect(chamadaDeFerramenta()).resolves.toBeUndefined();

    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0])).toContain("AUDIT_TOOL_CALL_INSERT_FAILED");
  });

  it("abrir o passo que falha registra a falha e devolve null, em vez de um id inventado", async () => {
    resposta = { data: null, error: ERRO_DO_BANCO };

    const id = await startStep({
      runId: "run-1",
      userId: "user-1",
      stepIndex: 1,
      kind: "ferramentas",
    });

    expect(id).toBeNull();
    expect(JSON.stringify(logs[0])).toContain("AUDIT_STEP_INSERT_FAILED");
  });

  it("fechar o passo que falha também registra", async () => {
    resposta = { data: null, error: ERRO_DO_BANCO };

    await closeStep({
      stepId: "step-1",
      userId: "user-1",
      status: "completed",
      durationMs: 30,
    });

    expect(JSON.stringify(logs[0])).toContain("AUDIT_STEP_CLOSE_FAILED");
  });

  // A mensagem do Postgres traz nome de tabela, de coluna e às vezes valor de linha. O que
  // vai para o log é classe, código, correlação e o SQLSTATE — o suficiente para investigar.
  it("o log NÃO carrega a mensagem do banco", async () => {
    resposta = { data: null, error: ERRO_DO_BANCO };

    await chamadaDeFerramenta();

    const cru = JSON.stringify(logs[0]);
    expect(cru).not.toContain("row-level security policy");
    expect(cru).not.toContain("ai_tool_calls");
    expect(cru).toContain("42501");
    expect(cru).toContain("run-1");
  });

  it("gravação bem-sucedida não polui o log", async () => {
    resposta = { data: { id: "x" }, error: null };

    await chamadaDeFerramenta();

    expect(logs).toEqual([]);
  });
});
