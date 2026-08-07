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
  /**
   * ⚠️ 18-C: `recordToolCall` passou a devolver o ID da linha, e o `null` daqui não é
   * detalhe de assinatura. `ai_action_proposals.tool_call_id` é NOT NULL com FK composta
   * para `ai_tool_calls`: sem id não há proposta. A regra "sem trilha, sem leitura" da 18-B
   * ganha a metade que faltava — **sem trilha, sem PROPOSTA** —, e ela só funciona porque a
   * falha devolve `null` em vez de um id inventado.
   */
  it("insert de ai_tool_calls que falha não lança, devolve null e DEIXA RASTRO", async () => {
    resposta = { data: null, error: ERRO_DO_BANCO };

    await expect(chamadaDeFerramenta()).resolves.toBeNull();

    expect(logs).toHaveLength(1);
    expect(JSON.stringify(logs[0])).toContain("AUDIT_TOOL_CALL_INSERT_FAILED");
  });

  it("insert que dá certo devolve o id da linha — é dele que a proposta pendura", async () => {
    resposta = { data: { id: "tool-call-1" }, error: null };

    await expect(chamadaDeFerramenta()).resolves.toBe("tool-call-1");
    expect(logs).toHaveLength(0);
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
      runId: "run-1",
      stepId: "step-1",
      userId: "user-1",
      status: "completed",
      durationMs: 30,
    });

    expect(JSON.stringify(logs[0])).toContain("AUDIT_STEP_CLOSE_FAILED");
  });

  /**
   * As três funções deste arquivo correlacionam pelo RUN. `closeStep` era a única que punha
   * o `stepId` em `correlation_id`: procurando o run no log operacional, a linha do
   * fechamento não aparecia junto das outras duas.
   */
  it("as três gravações correlacionam pelo MESMO campo — o run", async () => {
    resposta = { data: null, error: ERRO_DO_BANCO };

    await startStep({ runId: "run-9", userId: "u", stepIndex: 1, kind: "ferramentas" });
    await closeStep({
      runId: "run-9",
      stepId: "step-1",
      userId: "u",
      status: "failed",
      durationMs: 1,
    });
    await recordToolCall({
      runId: "run-9",
      userId: "u",
      stepId: "step-1",
      toolName: "training.get_volume",
      toolVersion: "1",
      providerCallId: null,
      argumentos: {},
      status: "falhou",
      rejectionReason: null,
      recordsRead: null,
      durationMs: 1,
      refs: [],
    });

    expect(logs).toHaveLength(3);
    for (const linha of logs) {
      expect(
        (linha[1] as { correlation_id: string }).correlation_id,
        JSON.stringify(linha),
      ).toBe("run-9");
    }
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
