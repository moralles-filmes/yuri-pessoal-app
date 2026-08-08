import "server-only";

/**
 * Fase 18-C · Bloco 5 — IA · A leitura da tela "Ações realizadas pela IA".
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ TRÊS CONSULTAS, E NENHUMA DELAS TOCA TABELA DE MÓDULO DO USUÁRIO.                     ║
 * ║                                                                                       ║
 * ║ `approval/` só fala com `ai_*` (teste de fronteira). O que a tela mostra de um         ║
 * ║ registro alterado é o que a EXECUÇÃO gravou: o id, a rota interna e os campos que a    ║
 * ║ allowlist do command deixou passar (§3.6). Ir buscar o registro atual no módulo daria  ║
 * ║ uma tela mais bonita e uma auditoria pior — ela passaria a mostrar o estado de AGORA   ║
 * ║ no lugar do que a ação fez.                                                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Colunas EXPLÍCITAS, como em todo `queries.ts` deste projeto. Nada de `select('*')`.
 */

import { createClient } from "@/lib/supabase/server";
import { rotuloDoCommand } from "@/lib/ai/constants";
import { ACTION_COMMANDS } from "./commands";
import {
  montarHistorico,
  type AcaoDaIa,
  type AprovacaoLida,
  type CatalogoDeCommands,
  type ExecucaoLida,
  type FichaDoCommand,
  type PropostaLida,
} from "./history";

/**
 * Teto de cada uma das duas listas.
 *
 * ⚠️ E ELE É VISÍVEL PARA QUEM CHAMA — a regra que a matriz da 18-C fixou para as leituras
 * (invariante 29): teto invisível é o que faz um total parcial ser apresentado como completo.
 * Aqui a tela declara a janela em texto.
 */
export const MAX_ACOES_POR_LEITURA = 100;

/**
 * O catálogo que a função pura recebe. Derivado de `ACTION_COMMANDS`, nunca de uma segunda
 * lista escrita à mão: um command novo entra aqui sozinho, e um removido some sozinho.
 *
 * ⚠️ É AQUI QUE A EXPLICAÇÃO DO "SEM DESFAZER" SAI DO DESCRIPTOR E CHEGA À TELA. Ela é do
 * command (§3.7) porque quem sabe por que não há inverso é quem escreveu o inverso — não a
 * tela, que só o exibe.
 */
export function catalogoDeCommands(): CatalogoDeCommands {
  const catalogo: Record<string, FichaDoCommand> = {};

  for (const command of ACTION_COMMANDS) {
    catalogo[command.name] = {
      rotulo: rotuloDoCommand(command.name),
      modulo: command.module,
      desfazer:
        command.desfazer.kind === "command"
          ? // O rótulo do INVERSO, para o botão dizer o que vai acontecer.
            { tipo: "command", rotuloDoInverso: rotuloDoCommand(command.desfazer.command) }
          : { tipo: "nao-ha", porque: command.desfazer.porque },
    };
  }

  return catalogo;
}

export type HistoricoDeAcoes = {
  readonly linhas: readonly AcaoDaIa[];
  /** A janela consultada, para a tela declarar o teto em vez de fingir que cobriu tudo. */
  readonly teto: number;
  readonly saturado: boolean;
};

/**
 * As três fontes, lidas em paralelo e cruzadas em memória.
 *
 * ⚠️ AS EXECUÇÕES NÃO SÃO BUSCADAS "PELAS PROPOSTAS", e é o ponto do desenho: elas sobrevivem
 * à exclusão da conversa (invariante 38). Ler execuções por `in (proposal_id)` faria a tela
 * perder exatamente as linhas que a ausência de FK existe para preservar.
 *
 * A recíproca também é necessária: uma execução recente pode apontar para uma proposta que
 * caiu fora da janela das 100 mais novas — a segunda consulta de propostas busca essas por id,
 * senão a linha apareceria como "sem trilha" sem que a trilha tivesse sumido.
 */
export async function getAiActionHistory(
  userId: string,
  agora: Date,
): Promise<HistoricoDeAcoes> {
  const supabase = await createClient();

  const [{ data: propostasBrutas }, { data: execucoesBrutas }] = await Promise.all([
    supabase
      .from("ai_action_proposals")
      .select(
        "id, origem, conversation_id, undoes_execution_id, command, module, risk, tool_name, created_at, expires_at, effect_hash, preview",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_ACOES_POR_LEITURA),
    supabase
      .from("ai_action_executions")
      .select(
        "id, proposal_id, command, status, error_code, target_id, target_route, changed_fields, undetailed_change, items, undoes_execution_id, started_at, finished_at, duration_ms",
      )
      .eq("user_id", userId)
      .order("started_at", { ascending: false })
      .limit(MAX_ACOES_POR_LEITURA),
  ]);

  const propostas: PropostaLida[] = (propostasBrutas ?? []).map(paraPropostaLida);
  const execucoes: ExecucaoLida[] = (execucoesBrutas ?? []).map(paraExecucaoLida);

  const conhecidas = new Set(propostas.map((p) => p.id));
  const faltantes = [
    ...new Set(execucoes.map((e) => e.proposalId).filter((id) => !conhecidas.has(id))),
  ];

  if (faltantes.length > 0) {
    const { data } = await supabase
      .from("ai_action_proposals")
      .select(
        "id, origem, conversation_id, undoes_execution_id, command, module, risk, tool_name, created_at, expires_at, effect_hash, preview",
      )
      .eq("user_id", userId)
      .in("id", faltantes)
      .limit(MAX_ACOES_POR_LEITURA);
    propostas.push(...(data ?? []).map(paraPropostaLida));
  }

  const ids = propostas.map((p) => p.id);
  let aprovacoes: AprovacaoLida[] = [];
  if (ids.length > 0) {
    const { data } = await supabase
      .from("ai_action_approvals")
      .select("proposal_id, decision, decided_at")
      .eq("user_id", userId)
      .in("proposal_id", ids);
    aprovacoes = (data ?? []).map((a) => ({
      proposalId: a.proposal_id,
      decisao: a.decision,
      decididaEm: a.decided_at,
    }));
  }

  return {
    linhas: montarHistorico({ propostas, aprovacoes, execucoes }, catalogoDeCommands(), agora),
    teto: MAX_ACOES_POR_LEITURA,
    // Igual ao teto = pode haver mais. Errar para "pode faltar coisa" é o erro aceitável.
    saturado:
      (propostasBrutas ?? []).length >= MAX_ACOES_POR_LEITURA ||
      (execucoesBrutas ?? []).length >= MAX_ACOES_POR_LEITURA,
  };
}

/**
 * Uma execução, pelo id — o que o desfazer precisa saber antes de propor.
 *
 * Separada de `getAiActionHistory` porque o caminho é outro: aqui não se monta tela, se
 * verifica um alvo. Ler a lista inteira para achar uma linha seria N vezes mais caro no
 * momento em que o dono está esperando um diálogo abrir.
 */
export async function getExecucaoDaIa(
  userId: string,
  executionId: string,
): Promise<ExecucaoLida | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_action_executions")
    .select(
      "id, proposal_id, command, status, error_code, target_id, target_route, changed_fields, undetailed_change, items, undoes_execution_id, started_at, finished_at, duration_ms",
    )
    .eq("id", executionId)
    .eq("user_id", userId)
    .maybeSingle();

  return data ? paraExecucaoLida(data) : null;
}

/** Já existe um desfazer EXECUTADO (ou em execução) para esta linha? */
export async function jaFoiDesfeita(userId: string, executionId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ai_action_executions")
    .select("id")
    .eq("user_id", userId)
    .eq("undoes_execution_id", executionId)
    .maybeSingle();

  return Boolean(data);
}

// ─────────────────────────── Tradução coluna → campo ───────────────────────────

type LinhaDePropostaNoBanco = {
  id: string;
  origem: string;
  conversation_id: string | null;
  undoes_execution_id: string | null;
  command: string;
  module: string;
  risk: number;
  tool_name: string;
  created_at: string;
  expires_at: string;
  effect_hash: string;
  preview: unknown;
};

function paraPropostaLida(linha: LinhaDePropostaNoBanco): PropostaLida {
  return {
    id: linha.id,
    origem: linha.origem,
    conversationId: linha.conversation_id,
    undoesExecutionId: linha.undoes_execution_id,
    command: linha.command,
    module: linha.module,
    risk: linha.risk,
    toolName: linha.tool_name,
    createdAt: linha.created_at,
    expiresAt: linha.expires_at,
    effectHash: linha.effect_hash,
    preview: linha.preview,
  };
}

type LinhaDeExecucaoNoBanco = {
  id: string;
  proposal_id: string;
  command: string;
  status: string;
  error_code: string | null;
  target_id: string | null;
  target_route: string | null;
  changed_fields: unknown;
  undetailed_change: boolean;
  items: unknown;
  undoes_execution_id: string | null;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
};

function paraExecucaoLida(linha: LinhaDeExecucaoNoBanco): ExecucaoLida {
  return {
    id: linha.id,
    proposalId: linha.proposal_id,
    command: linha.command,
    status: linha.status,
    errorCode: linha.error_code,
    targetId: linha.target_id,
    targetRoute: linha.target_route,
    changedFields: linha.changed_fields,
    undetailed: linha.undetailed_change,
    itens: linha.items,
    undoesExecutionId: linha.undoes_execution_id,
    startedAt: linha.started_at,
    finishedAt: linha.finished_at,
    durationMs: linha.duration_ms,
  };
}
