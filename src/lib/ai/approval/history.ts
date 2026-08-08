/**
 * Fase 18-C · Bloco 5 — IA · O HISTÓRICO DE AÇÕES, montado das três fontes de verdade.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ PURO, COM `agora` INJETADO. Nenhum estado desta tela é lido de coluna.                ║
 * ║                                                                                       ║
 * ║   ai_action_proposals   → o que SERIA feito     (não tem coluna `status`, e não vai   ║
 * ║                                                  passar a ter)                         ║
 * ║   ai_action_approvals   → o que foi DECIDIDO                                           ║
 * ║   ai_action_executions  → o que FOI feito                                              ║
 * ║                                                                                       ║
 * ║ A precedência é EXECUÇÃO > DECISÃO > PRAZO, e quem a aplica é                          ║
 * ║ `derivarEstadoDaProposta` — a MESMA função que o Approval Engine usa. Uma segunda      ║
 * ║ derivação aqui faria a tela discordar da recusa que o dono recebe ao clicar.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ A TELA LÊ AS DUAS PONTAS, E ELAS NÃO SE CORRESPONDEM UMA A UMA — de propósito.
 *
 * `ai_action_executions` não tem FK para a proposta (invariante 38): apagar uma conversa apaga
 * proposta e aprovação, e a EXECUÇÃO sobrevive. Uma tela que listasse só propostas esconderia
 * exatamente o registro que aquela decisão existe para preservar. Por isso o histórico é a
 * UNIÃO das duas listas, e a execução sem proposta aparece marcada como `semTrilha`.
 */

import {
  derivarEstadoDaProposta,
  type DecisaoDoDono,
  type EstadoDaProposta,
  type StatusDaExecucao,
} from "./state";
import type { ValorDeCampo } from "./contracts";

// ══════════════════════════════════════════════════════════════════════════════════════
// 1. O que a leitura entrega — linhas cruas, já com coluna nomeada
// ══════════════════════════════════════════════════════════════════════════════════════

export type PropostaLida = {
  readonly id: string;
  /** `'ferramenta'` (nasceu no chat) ou `'desfazer'` (nasceu do botão desta tela). */
  readonly origem: string;
  readonly conversationId: string | null;
  readonly undoesExecutionId: string | null;
  readonly command: string;
  readonly module: string;
  readonly risk: number;
  readonly toolName: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  /**
   * Ele vai para a tela porque uma proposta AINDA PENDENTE pode ser confirmada daqui — e a
   * confirmação carrega o hash da previsão que o dono leu. É o mesmo dado que o cartão do
   * chat já recebe; não é segredo (quem o obtém já é o dono da linha pela RLS), e sem ele a
   * única forma de decidir uma proposta seria voltar à conversa que a criou.
   */
  readonly effectHash: string;
  /** `jsonb` — passa por `parsePrevisao` antes de virar tela. */
  readonly preview: unknown;
};

export type AprovacaoLida = {
  readonly proposalId: string;
  readonly decisao: string;
  readonly decididaEm: string;
};

export type ExecucaoLida = {
  readonly id: string;
  readonly proposalId: string;
  readonly command: string;
  readonly status: string;
  readonly errorCode: string | null;
  readonly targetId: string | null;
  readonly targetRoute: string | null;
  /** `jsonb` — §3.6, só os campos que a allowlist do command deixou passar. */
  readonly changedFields: unknown;
  readonly undetailed: boolean;
  readonly itens: unknown;
  readonly undoesExecutionId: string | null;
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
};

export type FontesDoHistorico = {
  readonly propostas: readonly PropostaLida[];
  readonly aprovacoes: readonly AprovacaoLida[];
  readonly execucoes: readonly ExecucaoLida[];
};

// ══════════════════════════════════════════════════════════════════════════════════════
// 2. O catálogo — o que o SERVIDOR sabe dos commands, achatado para uma função pura
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ POR QUE ISTO É UM PARÂMETRO, E NÃO UM IMPORT.
 *
 * Os `Command` moram em `approval/commands/index.ts`, que é `server-only` e carrega `executar`
 * — a função que grava. Importá-lo aqui prenderia a derivação do histórico ao servidor e a
 * tornaria intestável sem stub, e a tela (client) não pode alcançá-lo de jeito nenhum. Quem
 * monta o catálogo é a leitura, no servidor; esta função recebe fatos.
 */
export type FichaDoCommand = {
  readonly rotulo: string;
  readonly modulo: string;
  readonly desfazer:
    | { readonly tipo: "command"; readonly rotuloDoInverso: string }
    | { readonly tipo: "nao-ha"; readonly porque: string };
};

export type CatalogoDeCommands = Readonly<Record<string, FichaDoCommand>>;

// ══════════════════════════════════════════════════════════════════════════════════════
// 3. Os parsers do `jsonb` — defensivos, porque a coluna é livre
// ══════════════════════════════════════════════════════════════════════════════════════

export type LinhaDaPrevisao = { readonly rotulo: string; readonly valor: string };

export type PrevisaoNaTela = {
  readonly resumo: string;
  readonly linhas: readonly LinhaDaPrevisao[];
  readonly ressalvas: readonly string[];
};

/** Teto do que a tela desenha de uma previsão. A coluna é `jsonb` e não tem CHECK de tamanho. */
export const MAX_LINHAS_DA_PREVISAO = 40;

export function parsePrevisao(valor: unknown): PrevisaoNaTela | null {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return null;
  const bruto = valor as Record<string, unknown>;
  if (typeof bruto.resumo !== "string" || bruto.resumo.trim() === "") return null;

  const linhas: LinhaDaPrevisao[] = [];
  if (Array.isArray(bruto.linhas)) {
    for (const item of bruto.linhas) {
      if (linhas.length >= MAX_LINHAS_DA_PREVISAO) break;
      if (typeof item !== "object" || item === null) continue;
      const l = item as Record<string, unknown>;
      if (typeof l.rotulo !== "string" || typeof l.valor !== "string") continue;
      linhas.push({ rotulo: l.rotulo, valor: l.valor });
    }
  }

  const ressalvas = Array.isArray(bruto.ressalvas)
    ? bruto.ressalvas
        .filter((r): r is string => typeof r === "string" && r.trim() !== "")
        .slice(0, MAX_LINHAS_DA_PREVISAO)
    : [];

  return { resumo: bruto.resumo, linhas, ressalvas };
}

/**
 * Os campos tocados, para a tela.
 *
 * A mesma forma que `filtrarCamposTocados` deixou passar na gravação: escalar curto. Objeto e
 * vetor caem fora aqui também — não porque a linha os tenha (a allowlist já os barrou), mas
 * porque a coluna é `jsonb` livre e a tela não desenha o que não sabe desenhar.
 */
export function parseCamposTocados(valor: unknown): Readonly<Record<string, ValorDeCampo>> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return {};
  const saida: Record<string, ValorDeCampo> = {};
  for (const [chave, bruto] of Object.entries(valor as Record<string, unknown>)) {
    if (bruto === null || ["string", "number", "boolean"].includes(typeof bruto)) {
      saida[chave] = bruto as ValorDeCampo;
    }
  }
  return saida;
}

export type ItemDaExecucao = {
  readonly ref: string;
  readonly ok: boolean;
  readonly erro: string | null;
};

export function parseItens(valor: unknown): readonly ItemDaExecucao[] {
  if (!Array.isArray(valor)) return [];
  const saida: ItemDaExecucao[] = [];
  for (const item of valor) {
    if (typeof item !== "object" || item === null) continue;
    const i = item as Record<string, unknown>;
    if (typeof i.ref !== "string" || typeof i.ok !== "boolean") continue;
    saida.push({ ref: i.ref, ok: i.ok, erro: typeof i.erro === "string" ? i.erro : null });
  }
  return saida;
}

const STATUS_CONHECIDOS: readonly StatusDaExecucao[] = [
  "executando",
  "sucesso",
  "falhou",
  "parcial",
];

function statusDaExecucao(bruto: string): StatusDaExecucao | null {
  return (STATUS_CONHECIDOS as readonly string[]).includes(bruto)
    ? (bruto as StatusDaExecucao)
    : null;
}

function decisaoDoDono(bruto: string): DecisaoDoDono | null {
  return bruto === "confirmada" || bruto === "recusada" ? bruto : null;
}

// ══════════════════════════════════════════════════════════════════════════════════════
// 4. O desfazer — a decisão, escrita como allowlist de casos
// ══════════════════════════════════════════════════════════════════════════════════════

export type DisponibilidadeDoDesfazer =
  | {
      readonly tipo: "disponivel";
      readonly execucaoId: string;
      readonly rotuloDoInverso: string;
    }
  | { readonly tipo: "ja-desfeita"; readonly em: string }
  /** ⚠️ SEMPRE com o motivo. A §3.7 proíbe esconder o botão sem dizer por quê. */
  | { readonly tipo: "indisponivel"; readonly porque: string };

/**
 * ⛔ AS FRASES QUE A TELA MOSTRA NO LUGAR DO BOTÃO. Duas delas são a parte mais delicada da
 * subfase inteira:
 *
 *  • `EXECUTANDO` — a linha reservou a vaga e não voltou (queda no meio, claim-first do Bloco
 *    3). A tela NÃO pode chamar isso de sucesso nem de falha: ela não sabe. O texto diz
 *    exatamente isso e manda conferir no módulo, que é a única fonte que sabe.
 *  • `PARCIAL` — parte dos itens entrou. Um desfazer automático reverteria também o que nunca
 *    chegou a acontecer.
 */
export const MOTIVO_SEM_DESFAZER = {
  NAO_APLICADA: "Nada foi aplicado, então não há o que desfazer.",
  EXECUTANDO:
    "Esta execução começou e não registrou o desfecho — pode ter sido aplicada ou não. Confira o registro no módulo antes de qualquer coisa; desfazer daqui poderia reverter algo que não aconteceu.",
  FALHOU: "A execução falhou e nada foi alterado, então não há o que desfazer.",
  PARCIAL:
    "Parte dos itens não foi aplicada. Confira o registro no módulo — desfazer daqui reverteria também o que nunca chegou a acontecer.",
  STATUS_DESCONHECIDO:
    "O desfecho desta execução foi gravado num formato que esta versão do sistema não reconhece. Confira o registro no módulo.",
  COMMAND_DESCONHECIDO:
    "Esta ação foi feita por uma versão anterior do sistema, e a operação inversa dela não está mais registrada.",
  SEM_ALVO:
    "Esta execução não registrou qual registro foi tocado, e desfazer sem alvo seria adivinhar.",
} as const;

function disponibilidadeDoDesfazer(
  execucao: ExecucaoNaTela | null,
  ficha: FichaDoCommand | undefined,
  desfeitaPor: ExecucaoLida | undefined,
): DisponibilidadeDoDesfazer {
  if (!execucao) return { tipo: "indisponivel", porque: MOTIVO_SEM_DESFAZER.NAO_APLICADA };

  switch (execucao.status) {
    case "executando":
      return { tipo: "indisponivel", porque: MOTIVO_SEM_DESFAZER.EXECUTANDO };
    case "falhou":
      return { tipo: "indisponivel", porque: MOTIVO_SEM_DESFAZER.FALHOU };
    case "parcial":
      return { tipo: "indisponivel", porque: MOTIVO_SEM_DESFAZER.PARCIAL };
    case "sucesso":
      break;
    default:
      return { tipo: "indisponivel", porque: MOTIVO_SEM_DESFAZER.STATUS_DESCONHECIDO };
  }

  if (desfeitaPor) return { tipo: "ja-desfeita", em: desfeitaPor.startedAt };
  if (!ficha) {
    return { tipo: "indisponivel", porque: MOTIVO_SEM_DESFAZER.COMMAND_DESCONHECIDO };
  }
  if (ficha.desfazer.tipo === "nao-ha") {
    return { tipo: "indisponivel", porque: ficha.desfazer.porque };
  }
  // Sem alvo o command inverso não tem o que receber — e é melhor dizer isso do que oferecer
  // um botão que falharia no clique.
  if (!execucao.targetId) {
    return { tipo: "indisponivel", porque: MOTIVO_SEM_DESFAZER.SEM_ALVO };
  }

  return {
    tipo: "disponivel",
    execucaoId: execucao.id,
    rotuloDoInverso: ficha.desfazer.rotuloDoInverso,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════
// 5. A linha do histórico
// ══════════════════════════════════════════════════════════════════════════════════════

export type ExecucaoNaTela = {
  readonly id: string;
  readonly status: StatusDaExecucao | "desconhecido";
  readonly errorCode: string | null;
  readonly targetId: string | null;
  readonly targetRoute: string | null;
  readonly campos: Readonly<Record<string, ValorDeCampo>>;
  readonly undetailed: boolean;
  readonly itens: readonly ItemDaExecucao[];
  readonly startedAt: string;
  readonly finishedAt: string | null;
  readonly durationMs: number | null;
};

export type AcaoDaIa = {
  /** Chave estável para o React e para o teste. Proposta quando há; execução quando não. */
  readonly chave: string;
  readonly propostaId: string | null;
  /** `null` na execução órfã: sem proposta não há hash — e não há o que confirmar. */
  readonly effectHash: string | null;
  readonly estado: EstadoDaProposta;
  /** O instante que ordena a lista: execução, ou decisão, ou criação da proposta. */
  readonly momento: string;
  readonly criadaEm: string | null;
  readonly expiraEm: string | null;
  readonly command: string;
  readonly rotuloDoCommand: string;
  readonly modulo: string;
  readonly risco: number | null;
  /** Esta linha é ela mesma um desfazer (nasceu do botão, não do chat). */
  readonly ehDesfazer: boolean;
  readonly conversationId: string | null;
  /**
   * A proposta que originou esta execução não existe mais — a conversa foi apagada. A
   * execução sobreviveu de propósito (invariante 38), e a tela diz que a trilha não está
   * mais disponível em vez de omitir a linha.
   */
  readonly semTrilha: boolean;
  readonly previsao: PrevisaoNaTela | null;
  readonly decisao: { readonly decisao: DecisaoDoDono; readonly em: string } | null;
  readonly execucao: ExecucaoNaTela | null;
  readonly desfazer: DisponibilidadeDoDesfazer;
};

function paraATela(execucao: ExecucaoLida): ExecucaoNaTela {
  return {
    id: execucao.id,
    status: statusDaExecucao(execucao.status) ?? "desconhecido",
    errorCode: execucao.errorCode,
    targetId: execucao.targetId,
    targetRoute: execucao.targetRoute,
    campos: parseCamposTocados(execucao.changedFields),
    undetailed: execucao.undetailed,
    itens: parseItens(execucao.itens),
    startedAt: execucao.startedAt,
    finishedAt: execucao.finishedAt,
    durationMs: execucao.durationMs,
  };
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A MONTAGEM. Duas passagens, e a segunda é a que a invariante 38 exige.                ║
 * ║                                                                                       ║
 * ║  1. uma linha por PROPOSTA, com a decisão e a execução dela quando existem;            ║
 * ║  2. uma linha por EXECUÇÃO ÓRFÃ — aquela cuja proposta sumiu junto com a conversa.     ║
 * ║                                                                                       ║
 * ║ Sem a segunda passagem, apagar a conversa apagaria da TELA o registro de que a IA      ║
 * ║ lançou uma transação — e a omissão seria invisível, que é exatamente o motivo de       ║
 * ║ `ai_action_executions` não ter FK para a proposta.                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export function montarHistorico(
  fontes: FontesDoHistorico,
  catalogo: CatalogoDeCommands,
  agora: Date,
): AcaoDaIa[] {
  const decisaoPorProposta = new Map(fontes.aprovacoes.map((a) => [a.proposalId, a]));
  const execucaoPorProposta = new Map(fontes.execucoes.map((e) => [e.proposalId, e]));
  const desfeitaPor = new Map(
    fontes.execucoes
      .filter((e) => e.undoesExecutionId !== null)
      .map((e) => [e.undoesExecutionId as string, e]),
  );

  const linhas: AcaoDaIa[] = [];

  for (const proposta of fontes.propostas) {
    const aprovacao = decisaoPorProposta.get(proposta.id);
    const bruta = execucaoPorProposta.get(proposta.id);
    const execucao = bruta ? paraATela(bruta) : null;
    const decisao = aprovacao ? decisaoDoDono(aprovacao.decisao) : null;
    const ficha = catalogo[proposta.command];

    linhas.push({
      chave: proposta.id,
      propostaId: proposta.id,
      effectHash: proposta.effectHash,
      estado: derivarEstadoDaProposta(
        {
          expiresAt: proposta.expiresAt,
          decisao,
          execucao: bruta ? statusDaExecucao(bruta.status) : null,
        },
        agora,
      ),
      momento: bruta?.startedAt ?? aprovacao?.decididaEm ?? proposta.createdAt,
      criadaEm: proposta.createdAt,
      expiraEm: proposta.expiresAt,
      command: proposta.command,
      rotuloDoCommand: ficha?.rotulo ?? proposta.command,
      modulo: ficha?.modulo ?? proposta.module,
      risco: proposta.risk,
      ehDesfazer: proposta.origem === "desfazer",
      conversationId: proposta.conversationId,
      semTrilha: false,
      previsao: parsePrevisao(proposta.preview),
      decisao: decisao && aprovacao ? { decisao, em: aprovacao.decididaEm } : null,
      execucao,
      desfazer: disponibilidadeDoDesfazer(
        execucao,
        ficha,
        bruta ? desfeitaPor.get(bruta.id) : undefined,
      ),
    });
  }

  const propostasConhecidas = new Set(fontes.propostas.map((p) => p.id));

  for (const bruta of fontes.execucoes) {
    if (propostasConhecidas.has(bruta.proposalId)) continue;
    const execucao = paraATela(bruta);
    const ficha = catalogo[bruta.command];

    linhas.push({
      chave: `execucao:${bruta.id}`,
      propostaId: null,
      effectHash: null,
      /**
       * ⚠️ `expiresAt` recebe o início da execução, e ele NUNCA é usado: a precedência de
       * `derivarEstadoDaProposta` é execução > decisão > prazo, e aqui há execução. Se alguém
       * inverter essa ordem, esta linha passa a sair "pendente" ou "expirada" sobre uma
       * escrita que aconteceu — e há teste exatamente sobre isso.
       */
      estado: derivarEstadoDaProposta(
        {
          expiresAt: bruta.startedAt,
          decisao: null,
          execucao: statusDaExecucao(bruta.status),
        },
        agora,
      ),
      momento: bruta.startedAt,
      criadaEm: null,
      expiraEm: null,
      command: bruta.command,
      rotuloDoCommand: ficha?.rotulo ?? bruta.command,
      modulo: ficha?.modulo ?? "—",
      risco: null,
      ehDesfazer: bruta.undoesExecutionId !== null,
      conversationId: null,
      semTrilha: true,
      previsao: null,
      decisao: null,
      execucao,
      desfazer: disponibilidadeDoDesfazer(execucao, ficha, desfeitaPor.get(bruta.id)),
    });
  }

  // Mais recente primeiro. O desempate por chave é só para a ordem ser determinística — dois
  // instantes iguais existem (uma proposta e o desfazer dela no mesmo milissegundo, num teste).
  return linhas.sort((a, b) => {
    const d = Date.parse(b.momento) - Date.parse(a.momento);
    if (d !== 0 && Number.isFinite(d)) return d;
    return a.chave < b.chave ? 1 : a.chave > b.chave ? -1 : 0;
  });
}

// ══════════════════════════════════════════════════════════════════════════════════════
// 6. O recorte da tela
// ══════════════════════════════════════════════════════════════════════════════════════

export const FILTROS_DO_HISTORICO = ["todas", "aplicadas", "aguardando", "problemas"] as const;
export type FiltroDoHistorico = (typeof FILTROS_DO_HISTORICO)[number];

export function ehFiltroDoHistorico(valor: unknown): valor is FiltroDoHistorico {
  return (
    typeof valor === "string" && (FILTROS_DO_HISTORICO as readonly string[]).includes(valor)
  );
}

/**
 * ⚠️ `executando` FICA EM "problemas", junto de `falhou` — e não em "aplicadas".
 *
 * É a mesma decisão do claim-first: erra para "pode não ter acontecido". Pô-lo entre as
 * aplicadas diria ao dono que está tudo certo sobre a única linha da tabela cujo desfecho o
 * sistema não conhece.
 */
export function filtrarHistorico(
  linhas: readonly AcaoDaIa[],
  filtro: FiltroDoHistorico,
): AcaoDaIa[] {
  switch (filtro) {
    case "todas":
      return [...linhas];
    case "aplicadas":
      return linhas.filter((l) => l.estado === "executada");
    case "aguardando":
      return linhas.filter((l) => l.estado === "pendente" || l.estado === "confirmada");
    case "problemas":
      return linhas.filter(
        (l) => l.estado === "falhou" || l.estado === "parcial" || l.estado === "executando",
      );
  }
}

/** Os números do cabeçalho. Contagem é fato medido — aqui zero é zero mesmo. */
export type ResumoDoHistorico = {
  readonly total: number;
  readonly aplicadas: number;
  readonly aguardando: number;
  readonly problemas: number;
  /** Quantas terminaram sem desfecho registrado. É o número que merece atenção. */
  readonly semDesfecho: number;
};

export function resumirHistorico(linhas: readonly AcaoDaIa[]): ResumoDoHistorico {
  return {
    total: linhas.length,
    aplicadas: filtrarHistorico(linhas, "aplicadas").length,
    aguardando: filtrarHistorico(linhas, "aguardando").length,
    problemas: filtrarHistorico(linhas, "problemas").length,
    semDesfecho: linhas.filter((l) => l.estado === "executando").length,
  };
}
