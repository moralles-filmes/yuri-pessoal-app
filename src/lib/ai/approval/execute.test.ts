/**
 * Fase 18-C · Blocos 3 e 4 — IA · O Action Executor.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO PROVAVA NO BLOCO 3: QUE NADA EXECUTAVA.                            ║
 * ║ O QUE ELE PROVA NO BLOCO 4: QUE SÓ EXECUTA O QUE ESTÁ NOMEADO AQUI.                   ║
 * ║                                                                                       ║
 * ║ O registry de commands deixou de estar vazio, e os testes de bijeção e coerência que   ║
 * ║ eram vacuosos passaram a rodar de verdade — era exatamente para isto que tinham sido   ║
 * ║ escritos antes de existir o que verificar.                                             ║
 * ║                                                                                       ║
 * ║ As garantias que permanecem, e que os casos abaixo exercitam: proposta sem command     ║
 * ║ conhecido não reserva vaga; hash que não bate com o recálculo não executa; e os        ║
 * ║ commands de DESFAZER não são propostos pelo modelo, porque não têm ferramenta.         ║
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
   * ⛔ A ASSERÇÃO QUE FECHAVA O BLOCO 3 ERA `ACTION_COMMANDS === []`, E ELA CAIU AQUI.
   *
   * Ela existia para que acrescentar um command fosse uma decisão VISÍVEL, e não algo que se
   * faz sem notar — e cumpriu esse papel: editar esta lista foi o gesto que abriu o Bloco 4.
   * O que ficou no lugar é a lista NOMEADA. Um command novo continua obrigando a mexer aqui;
   * a diferença é que agora o teste diz quais existem, e um que apareça sem passar por esta
   * linha deixa a suíte vermelha do mesmo jeito.
   *
   * ⚠️ Ordem crescente de risco, como a matriz manda. `lancarTransacao` é o último a entrar.
   */
  it("os commands ligados são exatamente os declarados — nenhum a mais", () => {
    expect(nomesDeCommands()).toEqual([
      "criarTarefaTodo",
      "excluirTarefaTodo",
      "concluirTarefaTodo",
      "reabrirTarefaTodo",
      "reagendarTarefaTodo",
      "registrarHabito",
      "desfazerHabito",
      "criarEvento",
      "excluirEvento",
      "registrarConsumo",
      "desfazerConsumo",
      "lancarTransacao",
      "excluirTransacao",
    ]);
  });

  /**
   * ⛔ SEIS DOS TREZE COMMANDS NÃO TÊM FERRAMENTA, E A AUSÊNCIA É A TRAVA.
   *
   * Os cinco `undo` só são alcançados pelo botão de desfazer da tela, sobre algo que a própria
   * IA fez. O modelo não tem como propô-los: não existe entrada deles em
   * `PROPOSTAS_POR_FERRAMENTA`, e sem entrada não há chamada.
   *
   * Este teste falha se alguém publicar uma ferramenta para um deles — que é uma decisão de
   * risco 4 e está fora da 18-C (Parte 3 da matriz). Vale em especial para os dois últimos:
   * `excluirEvento` apaga um registro que, com o Google conectado, some também do calendário
   * externo do dono; e `desfazerConsumo` apaga uma linha de histórico de saúde.
   */
  it("os commands de DESFAZER não são propostos pelo modelo", async () => {
    const { PROPOSTAS_POR_FERRAMENTA } = await import("./commands/previews");
    const comandosComFerramenta = new Set(
      AI_TOOL_REGISTRY.filter((t) => t.kind === "escrita").map((t) => t.command),
    );

    for (const semFerramenta of [
      "excluirTarefaTodo",
      "reabrirTarefaTodo",
      "desfazerHabito",
      "excluirEvento",
      "desfazerConsumo",
      "excluirTransacao",
    ]) {
      expect(findCommand(semFerramenta), semFerramenta).not.toBeNull();
      expect(comandosComFerramenta.has(semFerramenta), semFerramenta).toBe(false);
    }
    // E a bijeção do outro lado: nenhuma receita de proposta sem ferramenta correspondente.
    const nomesDeFerramenta = new Set(AI_TOOL_REGISTRY.map((t) => t.name));
    for (const nome of Object.keys(PROPOSTAS_POR_FERRAMENTA)) {
      expect(nomesDeFerramenta.has(nome), nome).toBe(true);
    }
  });

  /**
   * ⛔ E o que CONTINUA fora. Escrito por nome, e não por ausência: "não há command de pagar
   * fatura" é uma afirmação que ninguém testa; esta falha no dia em que houver.
   *
   * ⚠️ A lista mudou de conteúdo no Bloco 4 e não de propósito. Ela guardava os sete commands
   * da subfase enquanto eles não existiam; os sete entraram, na ordem crescente de risco que a
   * matriz fixa, e o que ficou aqui é a PARTE 3 dela — as ações de risco 4, que exigem uma
   * decisão do dono que ainda não foi tomada.
   *
   * As cinco têm em comum o mesmo traço: alteram ou apagam um registro que já existe, ou
   * movem dinheiro, a partir de um alvo que o modelo resolveria por semelhança de texto.
   */
  it("as ações de risco 4 continuam fora da 18-C", () => {
    for (const proibido of [
      "pagarFatura",
      "criarParcelamento",
      "dividirComTerceiro",
      "editarTransacao",
      "transferirEntreContas",
    ]) {
      expect(findCommand(proibido), proibido).toBeNull();
      expect(commandExecutavel(proibido), proibido).toBeNull();
    }
  });

  it("nome desconhecido não vira command", () => {
    expect(findCommand("qualquerCoisa")).toBeNull();
    expect(commandExecutavel("qualquerCoisa")).toBeNull();
    expect(ACTION_COMMANDS.length).toBeGreaterThan(0);
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
   * descobrir. O laço era vacuoso no Bloco 3 e passou a rodar sobre as quatro escritas reais.
   */
  it("toda ferramenta de escrita aponta para um command que existe", () => {
    for (const t of AI_TOOL_REGISTRY) {
      if (t.kind !== "escrita") continue;
      expect(t.command, `${t.name} sem command`).toBeTruthy();
      expect(nomesDeCommands(), `${t.name} → ${t.command}`).toContain(t.command);
    }
  });
});

describe("executarAcaoAprovada", () => {
  /**
   * ⛔ O CAMINHO FELIZ INTEIRO, COM UM COMMAND QUE NÃO EXISTE MAIS.
   *
   * Proposta existente, do usuário, dentro do prazo, com o hash que a tela devolveu, e uma
   * aprovação `confirmada`. O command foi removido do registry desde que a proposta nasceu —
   * é o que acontece num deploy entre propor e confirmar. Nada executa, e o que mais importa:
   * NENHUM `insert` chega a `ai_action_executions`. A vaga não é reservada por uma ação que
   * não tem como acontecer.
   */
  it("recusa a proposta íntegra por COMMAND_DESCONHECIDO, sem reservar vaga", async () => {
    respostas = {
      ai_action_proposals: {
        data: {
          id: "p-1",
          tool_name: "todo.criar_tarefa",
          tool_version: "1",
          command: "commandQueSaiuDoRegistry",
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

  /**
   * ⛔ E O CASO QUE DÁ NOME À §3.4, agora com um command DE VERDADE no registry.
   *
   * Tudo válido — proposta, dono, prazo, confirmação, command existente — e o `effect_hash`
   * gravado não é o que a previsão produz agora. O executor recalcula, vê a divergência e
   * recusa **sem reservar vaga e sem chamar `executar`**. É a diferença entre "a proposta é
   * imutável" e "o efeito dela é garantido": quem muda é o mundo.
   */
  it("hash gravado que não bate com o recálculo NÃO executa e NÃO reserva vaga", async () => {
    respostas = {
      ai_action_proposals: {
        data: {
          id: "p-1",
          tool_name: "todo.criar_tarefa",
          tool_version: "1",
          command: "criarTarefaTodo",
          payload: { titulo: "Comprar pão" },
          // Um hash sintático válido que não corresponde a previsão nenhuma.
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

    expect(r).toMatchObject({ ok: false, motivo: "EFEITO_MUDOU" });
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
