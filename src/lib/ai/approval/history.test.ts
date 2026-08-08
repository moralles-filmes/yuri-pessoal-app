/**
 * Fase 18-C · Bloco 5 — IA · O histórico de ações.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO DEFENDE, EM UMA FRASE CADA:                                        ║
 * ║                                                                                       ║
 * ║  • Nenhum estado é lido de coluna — os oito saem de prazo + decisão + execução.        ║
 * ║  • Uma execução cuja conversa foi apagada CONTINUA aparecendo (invariante 38). Se a    ║
 * ║    tela a escondesse, a decisão de não pôr FK em `ai_action_executions` viraria letra  ║
 * ║    morta, e a omissão seria invisível.                                                 ║
 * ║  • `executando` não é sucesso nem falha, e o desfazer é RECUSADO com o motivo escrito. ║
 * ║  • Quando não há inverso, a tela recebe a explicação — nunca um botão ausente e mudo.  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Os fixtures são escritos à mão, com os instantes absolutos (`Z`) e as contagens conferidas
 * no comentário: um fixture derivado das próprias funções não provaria nada.
 */

import { describe, expect, it } from "vitest";
import {
  filtrarHistorico,
  montarHistorico,
  parseCamposTocados,
  parseItens,
  parsePrevisao,
  resumirHistorico,
  MAX_LINHAS_DA_PREVISAO,
  MOTIVO_SEM_DESFAZER,
  type AprovacaoLida,
  type CatalogoDeCommands,
  type ExecucaoLida,
  type PropostaLida,
} from "./history";

const AGORA = new Date("2026-08-12T15:00:00.000Z");
const HASH = "a".repeat(64);

const CATALOGO: CatalogoDeCommands = {
  criarTarefaTodo: {
    rotulo: "TO-DO · criar tarefa",
    modulo: "todo",
    desfazer: { tipo: "command", rotuloDoInverso: "TO-DO · excluir tarefa" },
  },
  reagendarTarefaTodo: {
    rotulo: "TO-DO · mudar a data da tarefa",
    modulo: "todo",
    desfazer: { tipo: "nao-ha", porque: "Voltar a data exigiria usar a auditoria como fonte." },
  },
  excluirTarefaTodo: {
    rotulo: "TO-DO · excluir tarefa",
    modulo: "todo",
    desfazer: { tipo: "nao-ha", porque: "A tarefa apagada não volta com o mesmo id." },
  },
};

const PREVISAO = {
  resumo: "Criar a tarefa “Comprar pão”",
  linhas: [{ rotulo: "Título", valor: "Comprar pão" }],
  ressalvas: ["A tarefa entra sem projeto."],
};

function proposta(over: Partial<PropostaLida> = {}): PropostaLida {
  return {
    id: "p-1",
    origem: "ferramenta",
    conversationId: "c-1",
    undoesExecutionId: null,
    command: "criarTarefaTodo",
    module: "todo",
    risk: 2,
    toolName: "todo.criar_tarefa",
    createdAt: "2026-08-12T14:50:00.000Z",
    // Vence às 15:00Z em ponto — `venceu` é `>=`, então o padrão está EXPIRADO em AGORA.
    expiresAt: "2026-08-12T15:00:00.000Z",
    effectHash: HASH,
    preview: PREVISAO,
    ...over,
  };
}

function execucao(over: Partial<ExecucaoLida> = {}): ExecucaoLida {
  return {
    id: "e-1",
    proposalId: "p-1",
    command: "criarTarefaTodo",
    status: "sucesso",
    errorCode: null,
    targetId: "t-1",
    targetRoute: "/todo",
    changedFields: { title: "Comprar pão" },
    undetailed: false,
    itens: [],
    undoesExecutionId: null,
    startedAt: "2026-08-12T14:55:00.000Z",
    finishedAt: "2026-08-12T14:55:01.000Z",
    durationMs: 900,
    ...over,
  };
}

const aprovacao = (decisao: string): AprovacaoLida => ({
  proposalId: "p-1",
  decisao,
  decididaEm: "2026-08-12T14:54:00.000Z",
});

const so = (
  propostas: PropostaLida[],
  aprovacoes: AprovacaoLida[] = [],
  execucoes: ExecucaoLida[] = [],
) => montarHistorico({ propostas, aprovacoes, execucoes }, CATALOGO, AGORA);

// ══════════════════════════════════════════════════════════════════════════════════════

describe("o estado de cada linha é DERIVADO, e a precedência é execução > decisão > prazo", () => {
  it("sem decisão e dentro do prazo: pendente", () => {
    const [linha] = so([proposta({ expiresAt: "2026-08-12T15:05:00.000Z" })]);
    expect(linha.estado).toBe("pendente");
  });

  it("sem decisão e prazo vencido: expirada — e nada foi executado", () => {
    const [linha] = so([proposta()]);
    expect(linha.estado).toBe("expirada");
    expect(linha.execucao).toBeNull();
  });

  it("recusada vence o prazo vencido", () => {
    const [linha] = so([proposta()], [aprovacao("recusada")]);
    expect(linha.estado).toBe("recusada");
  });

  /**
   * ⛔ O CASO QUE DÁ NOME À PRECEDÊNCIA: confirmada às 14h54, executada às 14h55, prazo vencido
   * às 15h. Dizer "expirada" sobre uma escrita que ACONTECEU é a pior leitura errada possível
   * nesta tabela — e é o que sai se alguém puser o prazo por cima.
   */
  it("executada às 14h55 com prazo vencido às 15h continua EXECUTADA", () => {
    const [linha] = so([proposta()], [aprovacao("confirmada")], [execucao()]);
    expect(linha.estado).toBe("executada");
  });

  it.each([
    ["executando", "executando"],
    ["falhou", "falhou"],
    ["parcial", "parcial"],
  ])("execução %s vira estado %s", (status, esperado) => {
    const [linha] = so([proposta()], [aprovacao("confirmada")], [execucao({ status })]);
    expect(linha.estado).toBe(esperado);
  });

  it("confirmada e ainda sem execução: confirmada", () => {
    const [linha] = so([proposta()], [aprovacao("confirmada")]);
    expect(linha.estado).toBe("confirmada");
  });
});

describe("a execução sobrevive à exclusão da conversa (invariante 38)", () => {
  /**
   * ⛔ A PROPOSTA SUMIU E A EXECUÇÃO FICOU. É exatamente o que acontece quando o dono apaga a
   * conversa: `ai_action_proposals` cai por cascade e `ai_action_executions` não, porque ela
   * não tem FK. A linha PRECISA aparecer.
   */
  it("execução órfã aparece, marcada como sem trilha", () => {
    const linhas = so([], [], [execucao({ proposalId: "p-que-sumiu" })]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].semTrilha).toBe(true);
    expect(linhas[0].propostaId).toBeNull();
    expect(linhas[0].previsao).toBeNull();
    expect(linhas[0].execucao?.targetRoute).toBe("/todo");
  });

  /**
   * ⚠️ MUTAÇÃO QUE ESTE TESTE PEGA: se a precedência de `derivarEstadoDaProposta` deixar o
   * prazo decidir antes da execução, esta linha sai "expirada" (a órfã passa o próprio
   * `startedAt` como prazo, que já venceu em relação a AGORA) — e a tela relataria como
   * "prazo encerrado" um lançamento que entrou na conta do dono.
   */
  it("o estado da órfã sai da EXECUÇÃO, nunca do prazo", () => {
    const linhas = so([], [], [execucao({ proposalId: "sumiu", status: "sucesso" })]);
    expect(linhas[0].estado).toBe("executada");
  });

  it("a órfã não é confundida com uma proposta que existe", () => {
    const linhas = so([proposta()], [aprovacao("confirmada")], [execucao()]);
    expect(linhas).toHaveLength(1);
    expect(linhas[0].semTrilha).toBe(false);
  });
});

describe("o desfazer: quando aparece, quando não, e por quê", () => {
  it("execução bem-sucedida de command com inverso: disponível, com o rótulo do inverso", () => {
    const [linha] = so([proposta()], [aprovacao("confirmada")], [execucao()]);
    expect(linha.desfazer).toEqual({
      tipo: "disponivel",
      execucaoId: "e-1",
      rotuloDoInverso: "TO-DO · excluir tarefa",
    });
  });

  /**
   * ⛔ O CASO MAIS DELICADO DA SUBFASE. A linha reservou a vaga e não voltou (claim-first).
   * Oferecer desfazer aqui reverteria algo que talvez não tenha acontecido — e o texto tem de
   * dizer isso, não "aguarde".
   */
  it("execução sem desfecho NÃO oferece desfazer, e explica que pode não ter acontecido", () => {
    const [linha] = so([proposta()], [aprovacao("confirmada")], [execucao({ status: "executando" })]);
    expect(linha.desfazer).toEqual({
      tipo: "indisponivel",
      porque: MOTIVO_SEM_DESFAZER.EXECUTANDO,
    });
    expect(MOTIVO_SEM_DESFAZER.EXECUTANDO.toLowerCase()).toContain("pode ter sido aplicada ou não");
  });

  it.each([
    ["falhou", MOTIVO_SEM_DESFAZER.FALHOU],
    ["parcial", MOTIVO_SEM_DESFAZER.PARCIAL],
    ["coisa-nova", MOTIVO_SEM_DESFAZER.STATUS_DESCONHECIDO],
  ])("execução %s não oferece desfazer", (status, porque) => {
    const [linha] = so([proposta()], [aprovacao("confirmada")], [execucao({ status })]);
    expect(linha.desfazer).toEqual({ tipo: "indisponivel", porque });
  });

  it("sem execução nenhuma não há o que desfazer", () => {
    const [linha] = so([proposta()]);
    expect(linha.desfazer).toEqual({
      tipo: "indisponivel",
      porque: MOTIVO_SEM_DESFAZER.NAO_APLICADA,
    });
  });

  /** §3.7 — a explicação vem do DESCRIPTOR do command, não de um texto genérico da tela. */
  it("command sem inverso devolve o PORQUÊ declarado no descriptor", () => {
    const [linha] = so(
      [proposta({ command: "reagendarTarefaTodo" })],
      [aprovacao("confirmada")],
      [execucao({ command: "reagendarTarefaTodo" })],
    );
    expect(linha.desfazer).toEqual({
      tipo: "indisponivel",
      porque: CATALOGO.reagendarTarefaTodo.desfazer.tipo === "nao-ha"
        ? CATALOGO.reagendarTarefaTodo.desfazer.porque
        : "",
    });
  });

  it("command que não existe mais no catálogo não oferece desfazer", () => {
    const [linha] = so(
      [proposta({ command: "commandDeOutraVersao" })],
      [aprovacao("confirmada")],
      [execucao({ command: "commandDeOutraVersao" })],
    );
    expect(linha.desfazer).toEqual({
      tipo: "indisponivel",
      porque: MOTIVO_SEM_DESFAZER.COMMAND_DESCONHECIDO,
    });
    // E o rótulo cai no identificador em vez de quebrar a tela.
    expect(linha.rotuloDoCommand).toBe("commandDeOutraVersao");
  });

  it("execução sem alvo registrado não oferece desfazer", () => {
    const [linha] = so([proposta()], [aprovacao("confirmada")], [execucao({ targetId: null })]);
    expect(linha.desfazer).toEqual({
      tipo: "indisponivel",
      porque: MOTIVO_SEM_DESFAZER.SEM_ALVO,
    });
  });

  /**
   * ⛔ UMA EXECUÇÃO É DESFEITA UMA VEZ SÓ. A tela vê isso pela EXISTÊNCIA de outra execução
   * apontando para ela — não por uma coluna "desfeita" que ninguém mantém.
   */
  it("execução já desfeita mostra quando, e não oferece desfazer de novo", () => {
    const oDesfazer = execucao({
      id: "e-2",
      proposalId: "p-2",
      command: "excluirTarefaTodo",
      undoesExecutionId: "e-1",
      startedAt: "2026-08-12T14:58:00.000Z",
    });
    const linhas = so(
      [proposta(), proposta({ id: "p-2", command: "excluirTarefaTodo", origem: "desfazer" })],
      [aprovacao("confirmada")],
      [execucao(), oDesfazer],
    );
    const original = linhas.find((l) => l.chave === "p-1");
    expect(original?.desfazer).toEqual({
      tipo: "ja-desfeita",
      em: "2026-08-12T14:58:00.000Z",
    });
  });

  it("a linha do desfazer se declara como desfazer", () => {
    const linhas = so([proposta({ id: "p-2", origem: "desfazer", conversationId: null })]);
    expect(linhas[0].ehDesfazer).toBe(true);
    expect(linhas[0].conversationId).toBeNull();
  });
});

describe("ordem e recorte", () => {
  /** Mais recente primeiro, e o instante que ordena é o mais tardio de cada linha. */
  it("ordena pelo momento, do mais recente para o mais antigo", () => {
    const linhas = montarHistorico(
      {
        propostas: [
          proposta({ id: "p-antiga", createdAt: "2026-08-10T10:00:00.000Z" }),
          proposta({ id: "p-nova", createdAt: "2026-08-12T14:50:00.000Z" }),
        ],
        aprovacoes: [],
        execucoes: [],
      },
      CATALOGO,
      AGORA,
    );
    expect(linhas.map((l) => l.chave)).toEqual(["p-nova", "p-antiga"]);
  });

  it("a execução manda no momento da linha, não a criação da proposta", () => {
    const [linha] = so(
      [proposta({ createdAt: "2026-08-10T10:00:00.000Z" })],
      [aprovacao("confirmada")],
      [execucao({ startedAt: "2026-08-12T14:59:00.000Z" })],
    );
    expect(linha.momento).toBe("2026-08-12T14:59:00.000Z");
  });

  /**
   * As contagens são escritas à mão: 1 aplicada (p-1), 1 aguardando (p-2, dentro do prazo),
   * 2 problemas (p-3 falhou, p-4 sem desfecho), 1 expirada que não entra em filtro nenhum
   * além de "todas". Total 5.
   */
  it("os filtros e o resumo contam o que se espera", () => {
    const linhas = montarHistorico(
      {
        propostas: [
          proposta({ id: "p-1" }),
          proposta({ id: "p-2", expiresAt: "2026-08-12T15:09:00.000Z" }),
          proposta({ id: "p-3" }),
          proposta({ id: "p-4" }),
          proposta({ id: "p-5" }),
        ],
        aprovacoes: [
          { proposalId: "p-1", decisao: "confirmada", decididaEm: "2026-08-12T14:54:00.000Z" },
          { proposalId: "p-3", decisao: "confirmada", decididaEm: "2026-08-12T14:54:00.000Z" },
          { proposalId: "p-4", decisao: "confirmada", decididaEm: "2026-08-12T14:54:00.000Z" },
        ],
        execucoes: [
          execucao({ id: "e-1", proposalId: "p-1" }),
          execucao({ id: "e-3", proposalId: "p-3", status: "falhou" }),
          execucao({ id: "e-4", proposalId: "p-4", status: "executando" }),
        ],
      },
      CATALOGO,
      AGORA,
    );

    expect(filtrarHistorico(linhas, "todas")).toHaveLength(5);
    expect(filtrarHistorico(linhas, "aplicadas").map((l) => l.chave)).toEqual(["p-1"]);
    expect(filtrarHistorico(linhas, "aguardando").map((l) => l.chave)).toEqual(["p-2"]);
    expect(filtrarHistorico(linhas, "problemas").map((l) => l.chave).sort()).toEqual([
      "p-3",
      "p-4",
    ]);

    expect(resumirHistorico(linhas)).toEqual({
      total: 5,
      aplicadas: 1,
      aguardando: 1,
      problemas: 2,
      semDesfecho: 1,
    });
  });

  /**
   * ⛔ `executando` FICA EM "PRECISAM DE ATENÇÃO", nunca em "aplicadas". É a mesma disciplina
   * do claim-first: errar para "pode não ter acontecido".
   */
  it("execução sem desfecho não entra nas aplicadas", () => {
    const linhas = so([proposta()], [aprovacao("confirmada")], [execucao({ status: "executando" })]);
    expect(filtrarHistorico(linhas, "aplicadas")).toHaveLength(0);
    expect(filtrarHistorico(linhas, "problemas")).toHaveLength(1);
  });
});

describe("os parsers do jsonb", () => {
  it("lê a previsão gravada", () => {
    expect(parsePrevisao(PREVISAO)).toEqual(PREVISAO);
  });

  it.each([
    ["nulo", null],
    ["vetor", []],
    ["sem resumo", { linhas: [] }],
    ["resumo vazio", { resumo: "   " }],
    ["texto solto", "resumo"],
  ])("recusa previsão %s", (_nome, valor) => {
    expect(parsePrevisao(valor)).toBeNull();
  });

  it("descarta linha malformada em vez de derrubar a previsão inteira", () => {
    const p = parsePrevisao({
      resumo: "x",
      linhas: [{ rotulo: "ok", valor: "1" }, { rotulo: 2, valor: "2" }, null],
      ressalvas: ["a", 3, "  "],
    });
    expect(p?.linhas).toEqual([{ rotulo: "ok", valor: "1" }]);
    expect(p?.ressalvas).toEqual(["a"]);
  });

  it("corta a previsão gigante no teto declarado", () => {
    const muitas = Array.from({ length: MAX_LINHAS_DA_PREVISAO + 10 }, (_, i) => ({
      rotulo: `r${i}`,
      valor: "v",
    }));
    expect(parsePrevisao({ resumo: "x", linhas: muitas })?.linhas).toHaveLength(
      MAX_LINHAS_DA_PREVISAO,
    );
  });

  /**
   * A allowlist §3.6 já barrou estrutura na GRAVAÇÃO. Aqui a defesa é da tela: a coluna é
   * `jsonb` livre, e desenhar um objeto aninhado convidaria a lê-lo como resultado da ação.
   */
  it("campos tocados só aceitam escalar", () => {
    expect(
      parseCamposTocados({ title: "x", n: 2, b: false, nulo: null, obj: { a: 1 }, arr: [1] }),
    ).toEqual({ title: "x", n: 2, b: false, nulo: null });
  });

  it("itens malformados não entram", () => {
    expect(parseItens([{ ref: "a", ok: true }, { ref: "b" }, 3])).toEqual([
      { ref: "a", ok: true, erro: null },
    ]);
  });
});
