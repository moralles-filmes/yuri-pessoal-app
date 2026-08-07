/**
 * Fase 18-C · Bloco 3 — IA · O Action Executor.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO PROVA NESTA SUBFASE: QUE NADA EXECUTA.                             ║
 * ║                                                                                       ║
 * ║ O motor inteiro existe — vínculo, prazo, uso único, revalidação por recálculo — e o    ║
 * ║ registry de commands está VAZIO, exatamente como o Tool Registry nasceu vazio na 18-A. ║
 * ║ Uma proposta íntegra, confirmada, dentro do prazo e com o hash certo ainda assim para  ║
 * ║ em `COMMAND_DESCONHECIDO`, e nenhum `insert` de execução acontece.                     ║
 * ║                                                                                       ║
 * ║ Os testes de bijeção e coerência abaixo estão escritos para o Bloco 4: eles são        ║
 * ║ vacuosos hoje e ficam vermelhos no dia em que o primeiro command entrar torto.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/registry";
import { isCommandCoherent } from "./contracts";

type Resposta = { data: unknown; error: { code: string } | null };

/** O que cada tabela devolve na consulta desta rodada. */
let respostas: Record<string, Resposta> = {};
/** Toda tabela em que houve tentativa de `insert`. É como se prova que nada foi gravado. */
const inserts: string[] = [];

function encadeavel(tabela: string): unknown {
  const resposta = () => respostas[tabela] ?? { data: null, error: null };
  const alvo = {
    select: () => encadeavel(tabela),
    eq: () => encadeavel(tabela),
    insert: () => {
      inserts.push(tabela);
      return encadeavel(tabela);
    },
    update: () => encadeavel(tabela),
    maybeSingle: async () => resposta(),
    single: async () => resposta(),
    then: (aceita: (r: Resposta) => unknown) => Promise.resolve(resposta()).then(aceita),
  };
  return alvo;
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ from: (t: string) => encadeavel(t) }),
}));

const { ACTION_COMMANDS, commandExecutavel, findCommand, nomesDeCommands, executarAcaoAprovada } =
  await import("./execute");

const HASH = "c".repeat(64);
const AGORA = new Date("2026-08-07T12:30:00.000Z");
const VENCE_DEPOIS = "2026-08-07T13:00:00.000Z";

beforeEach(() => {
  respostas = {};
  inserts.length = 0;
});

describe("registry de commands", () => {
  /**
   * ⛔ A ASSERÇÃO QUE FECHA O BLOCO 3. Ela vira vermelha no primeiro command do Bloco 4 —
   * e é assim que se pretende: acrescentar um command é uma decisão que passa por editar
   * este teste, de propósito, e não algo que se faz sem notar.
   */
  it("nasce VAZIO na 18-C · Bloco 3 — nenhuma escrita é possível", () => {
    expect(ACTION_COMMANDS).toEqual([]);
    expect(nomesDeCommands()).toEqual([]);
  });

  it("nome desconhecido não vira command", () => {
    expect(findCommand("lancarTransacao")).toBeNull();
    expect(commandExecutavel("lancarTransacao")).toBeNull();
  });

  it("todo command declarado é coerente — e um incoerente é tratado como inexistente", () => {
    for (const c of ACTION_COMMANDS) {
      expect(isCommandCoherent(c, nomesDeCommands()), c.name).toBe(true);
      expect(commandExecutavel(c.name), c.name).not.toBeNull();
    }
  });

  it("nomes de command não se repetem", () => {
    expect(new Set(nomesDeCommands()).size).toBe(ACTION_COMMANDS.length);
  });

  /**
   * A bijeção que o Bloco 4 precisa: uma ferramenta de escrita que aponte para um command
   * inexistente só falharia DEPOIS de o dono confirmar — o pior momento possível para
   * descobrir. Hoje não há ferramenta de escrita, e o laço abaixo não roda.
   */
  it("toda ferramenta de escrita aponta para um command que existe", () => {
    for (const t of AI_TOOL_REGISTRY) {
      if (t.kind !== "escrita") continue;
      expect(t.command, `${t.name} sem command`).toBeTruthy();
      expect(nomesDeCommands(), `${t.name} → ${t.command}`).toContain(t.command);
    }
  });
});

describe("executarAcaoAprovada — com o registry vazio", () => {
  /**
   * ⛔ O CAMINHO FELIZ INTEIRO, E ELE PARA MESMO ASSIM.
   *
   * Proposta existente, do usuário, dentro do prazo, com o hash que a tela devolveu, e uma
   * aprovação `confirmada`. Sem command, nada executa — e, o que mais importa, NENHUM
   * `insert` chega a `ai_action_executions`: a vaga não é reservada por uma ação que não
   * tem como acontecer.
   */
  it("recusa a proposta íntegra por COMMAND_DESCONHECIDO, sem reservar vaga", async () => {
    respostas = {
      ai_action_proposals: {
        data: {
          id: "p-1",
          tool_name: "todo.criar_tarefa",
          tool_version: "1",
          command: "criarTarefaTodo",
          payload: { titulo: "x" },
          effect_hash: HASH,
          expires_at: VENCE_DEPOIS,
        },
        error: null,
      },
      ai_action_approvals: { data: { id: "a-1", decision: "confirmada" }, error: null },
      ai_action_executions: { data: null, error: null },
    };

    const r = await executarAcaoAprovada({
      userId: "u-1",
      proposalId: "p-1",
      hashDaTela: HASH,
      agora: AGORA,
    });

    expect(r).toMatchObject({ ok: false, motivo: "COMMAND_DESCONHECIDO" });
    expect(inserts).toEqual([]);
  });

  it("proposta inexistente não reserva vaga nem vaza a existência dela", async () => {
    const r = await executarAcaoAprovada({
      userId: "u-1",
      proposalId: "p-1",
      hashDaTela: HASH,
      agora: AGORA,
    });
    expect(r).toMatchObject({ ok: false, motivo: "PROPOSTA_NAO_ENCONTRADA" });
    expect(inserts).toEqual([]);
  });

  /**
   * Sem confirmação, nada acontece — e a frase de recusa é a de "não confirmada", não a de
   * "não encontrada". O dono precisa saber que a proposta existe e está esperando ele.
   */
  it("proposta sem decisão nenhuma para em SEM_CONFIRMACAO", async () => {
    respostas = {
      ai_action_proposals: {
        data: {
          id: "p-1",
          tool_name: "todo.criar_tarefa",
          tool_version: "1",
          // Um command que EXISTIRIA, para a recusa não vir de `COMMAND_DESCONHECIDO`:
          // o que se testa aqui é a ausência de confirmação. Como o registry está vazio,
          // este caso só pode ser alcançado enquanto `admitirExecucao` cair antes — e é
          // por isso que a asserção aceita os dois motivos, dizendo por escrito qual é qual.
          command: "criarTarefaTodo",
          payload: {},
          effect_hash: HASH,
          expires_at: VENCE_DEPOIS,
        },
        error: null,
      },
      ai_action_approvals: { data: null, error: null },
      ai_action_executions: { data: null, error: null },
    };

    const r = await executarAcaoAprovada({
      userId: "u-1",
      proposalId: "p-1",
      hashDaTela: HASH,
      agora: AGORA,
    });

    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Hoje: COMMAND_DESCONHECIDO (registry vazio). A partir do Bloco 4: SEM_CONFIRMACAO.
    expect(["COMMAND_DESCONHECIDO", "SEM_CONFIRMACAO"]).toContain(r.motivo);
    expect(inserts).toEqual([]);
  });

  it("hash divergente para antes de qualquer escrita", async () => {
    respostas = {
      ai_action_proposals: {
        data: {
          id: "p-1",
          tool_name: "todo.criar_tarefa",
          tool_version: "1",
          command: "criarTarefaTodo",
          payload: {},
          effect_hash: HASH,
          expires_at: VENCE_DEPOIS,
        },
        error: null,
      },
      ai_action_approvals: { data: { id: "a-1", decision: "confirmada" }, error: null },
      ai_action_executions: { data: null, error: null },
    };

    const r = await executarAcaoAprovada({
      userId: "u-1",
      proposalId: "p-1",
      hashDaTela: "d".repeat(64),
      agora: AGORA,
    });

    expect(r).toMatchObject({ ok: false, motivo: "HASH_DIVERGENTE" });
    expect(inserts).toEqual([]);
  });

  it("prazo vencido para antes de qualquer escrita", async () => {
    respostas = {
      ai_action_proposals: {
        data: {
          id: "p-1",
          tool_name: "todo.criar_tarefa",
          tool_version: "1",
          command: "criarTarefaTodo",
          payload: {},
          effect_hash: HASH,
          expires_at: "2026-08-07T12:00:00.000Z",
        },
        error: null,
      },
      ai_action_approvals: { data: { id: "a-1", decision: "confirmada" }, error: null },
      ai_action_executions: { data: null, error: null },
    };

    const r = await executarAcaoAprovada({
      userId: "u-1",
      proposalId: "p-1",
      hashDaTela: HASH,
      agora: AGORA,
    });

    expect(r).toMatchObject({ ok: false, motivo: "PROPOSTA_EXPIRADA" });
    expect(inserts).toEqual([]);
  });

  /**
   * ⛔ EXECUÇÃO JÁ EXISTENTE = NÃO EXECUTA DE NOVO, e a resposta diz que já aconteceu.
   * É o clique duplo, as duas abas e o retry — os três convergindo para uma linha só.
   */
  it("execução já registrada devolve JA_EXECUTADA e não reserva vaga nova", async () => {
    respostas = {
      ai_action_proposals: {
        data: {
          id: "p-1",
          tool_name: "todo.criar_tarefa",
          tool_version: "1",
          command: "criarTarefaTodo",
          payload: {},
          effect_hash: HASH,
          expires_at: VENCE_DEPOIS,
        },
        error: null,
      },
      ai_action_approvals: { data: { id: "a-1", decision: "confirmada" }, error: null },
      ai_action_executions: { data: { id: "e-1" }, error: null },
    };

    const r = await executarAcaoAprovada({
      userId: "u-1",
      proposalId: "p-1",
      hashDaTela: HASH,
      agora: AGORA,
    });

    expect(r).toMatchObject({ ok: false, motivo: "JA_EXECUTADA" });
    expect(inserts).toEqual([]);
  });
});
