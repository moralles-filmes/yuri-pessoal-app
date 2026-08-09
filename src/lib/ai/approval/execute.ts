import "server-only";

/**
 * Fase 18-C · Bloco 3 — IA · O ACTION EXECUTOR. É AQUI que uma escrita da IA acontece — e
 * em nenhum outro lugar.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTE ARQUIVO NÃO É ALCANÇÁVEL A PARTIR DO RUN. Há teste de fronteira provando isso.   ║
 * ║                                                                                       ║
 * ║   DENTRO do run   → `proposals.ts` grava a INTENÇÃO. Nada é escrito no módulo.        ║
 * ║   FORA do run     → Server Action → ESTE arquivo → command → serviço de domínio.      ║
 * ║                                                                                       ║
 * ║ A separação é o que torna "cancelar o streaming não desfaz ação confirmada" verdadeiro ║
 * ║ POR CONSTRUÇÃO. Se a execução morasse no laço, seria uma checagem — e checagem se      ║
 * ║ esquece.                                                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ O REGISTRY DE COMMANDS NASCEU VAZIO no Bloco 3 e DEIXOU DE ESTAR no Bloco 4 — ele mora
 *    em `commands/index.ts`, e é lá que a decisão de dar um poder novo à IA se toma. Este
 *    arquivo continua não conhecendo nenhum serviço de domínio: ele orquestra, não escreve.
 */

import { createClient } from "@/lib/supabase/server";
import { safeLogFields } from "@/lib/ai/security/redact";
import { aiError } from "@/lib/ai/core/errors";
import { rotaInternaAceita } from "@/lib/ai/tools/sources";
import { hashDe } from "./proposals";
import { ACTION_COMMANDS, findCommand, nomesDeCommands } from "./commands";
import {
  filtrarCamposTocados,
  isCommandCoherent,
  type Command,
  type CommandContext,
  type ResultadoDoCommand,
  type ResultadoDoItem,
  type ValorDeCampo,
} from "./contracts";
import {
  admitirExecucao,
  revalidarEfeito,
  MENSAGEM_DE_RECUSA,
  type DecisaoDoDono,
  type MotivoDeRecusa,
  type StatusDaExecucao,
} from "./state";

export type { Command, CommandContext };
export { ACTION_COMMANDS, findCommand, nomesDeCommands };

/** Um command incoerente é tratado como inexistente — nunca executado "mesmo assim". */
export function commandExecutavel(name: string): Command | null {
  const command = findCommand(name);
  if (!command) return null;
  return isCommandCoherent(command, nomesDeCommands()) ? command : null;
}

function registrarFalha(code: string, correlationId: string, error: { code?: string } | null): void {
  console.error("[ia][acao] falha", {
    ...safeLogFields(aiError("ERRO_TEMPORARIO", code), correlationId),
    sqlstate: error?.code ?? "desconhecido",
  });
}

// ══════════════════════════════════════════════════════════════════════════════════════
// A decisão do dono
// ══════════════════════════════════════════════════════════════════════════════════════

export type ResultadoDaDecisao =
  | { readonly ok: true; readonly approvalId: string }
  | { readonly ok: false; readonly motivo: MotivoDeRecusa; readonly mensagem: string };

/**
 * Grava a decisão. As três travas que importam NÃO estão neste código:
 *
 *  • uso único   → `unique (proposal_id)` em `ai_action_approvals`
 *  • hash certo  → a FK composta `(proposal_id, user_id, confirmed_hash)`, que só casa com
 *                  o `effect_hash` da própria proposta
 *  • dono certo  → a mesma FK composta + RLS
 *
 * O que fica aqui é traduzir `23505` e `23503` em frase de tela. Reordenar ou remover as
 * checagens abaixo não abre a porta; remover os índices, sim.
 */
export async function registrarDecisao(input: {
  userId: string;
  proposalId: string;
  hashDaTela: string;
  decisao: DecisaoDoDono;
}): Promise<ResultadoDaDecisao> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("ai_action_approvals")
    .insert({
      user_id: input.userId,
      proposal_id: input.proposalId,
      decision: input.decisao,
      confirmed_hash: input.hashDaTela,
      origem: "tela",
    })
    .select("id")
    .single();

  if (error) {
    registrarFalha("APPROVAL_INSERT_FAILED", input.proposalId, error);
    // `23505` = já havia decisão. `23503` = a FK composta recusou: ou a proposta não é do
    // usuário, ou não existe, ou o hash não é o dela. Os três casos saem com a mesma frase
    // de propósito — distinguir "não existe" de "existe e não é sua" é um oráculo.
    const motivo: MotivoDeRecusa =
      error.code === "23505" ? "PROPOSTA_JA_DECIDIDA" : "HASH_DIVERGENTE";
    return { ok: false, motivo, mensagem: MENSAGEM_DE_RECUSA[motivo] };
  }

  return { ok: true, approvalId: data.id };
}

// ══════════════════════════════════════════════════════════════════════════════════════
// A execução
// ══════════════════════════════════════════════════════════════════════════════════════

export type ResultadoDaExecucao =
  | {
      readonly ok: true;
      readonly executionId: string;
      readonly status: StatusDaExecucao;
      /**
       * 18-D — o id do registro criado ou alterado. Ele já era gravado em
       * `ai_action_executions.target_id`; passou a voltar porque a tela de comprovantes
       * precisa dele para anexar o arquivo ao lançamento **fora** do Approval Engine
       * (§3.6: anexo não entra em `changed_fields`).
       */
      readonly targetId: string | null;
      readonly targetRoute: string | null;
      /** As rotas para o `revalidatePath` da CASCA. Nunca chamado daqui. */
      readonly revalidar: readonly string[];
    }
  | { readonly ok: false; readonly motivo: MotivoDeRecusa; readonly mensagem: string };

function negar(motivo: MotivoDeRecusa): ResultadoDaExecucao {
  return { ok: false, motivo, mensagem: MENSAGEM_DE_RECUSA[motivo] };
}

/** O `23505` veio do índice de "uma execução é desfeita uma vez só"? */
function indiceDeDesfazer(erro: { message?: string; details?: string | null }): boolean {
  return `${erro.message ?? ""} ${erro.details ?? ""}`.includes("undoes");
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A ORDEM DAS ETAPAS É A GARANTIA. Ler de cima para baixo é ler o desenho da subfase.   ║
 * ║                                                                                       ║
 * ║  1. lê proposta, decisão e execução                                                    ║
 * ║  2. `admitirExecucao` — PURO: existe? já executou? já decidiu? prazo? hash? command?   ║
 * ║  3. exige decisão `confirmada` (recusada e ausente caem antes, com frases distintas)   ║
 * ║  4. RECALCULA a previsão com os dados de AGORA e compara com o hash gravado            ║
 * ║  5. RESERVA a vaga (`executando`) — antes de escrever, nunca depois                    ║
 * ║  6. executa o command                                                                  ║
 * ║  7. fecha a linha com o desfecho e os campos tocados, filtrados pela allowlist         ║
 * ║                                                                                       ║
 * ║ O passo 4 vem depois do 2 porque ele CUSTA CONSULTAS: recalcular a previsão de uma     ║
 * ║ proposta expirada seria trabalho para chegar à mesma recusa.                           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export async function executarAcaoAprovada(input: {
  userId: string;
  proposalId: string;
  hashDaTela: string;
  /** Injetado. Nenhum `Date.now()` decide prazo neste módulo. */
  agora: Date;
}): Promise<ResultadoDaExecucao> {
  const supabase = await createClient();

  const { data: proposta } = await supabase
    .from("ai_action_proposals")
    .select(
      "id, tool_name, tool_version, command, payload, effect_hash, expires_at, undoes_execution_id",
    )
    .eq("id", input.proposalId)
    .eq("user_id", input.userId)
    .maybeSingle();

  const { data: aprovacao } = await supabase
    .from("ai_action_approvals")
    .select("id, decision")
    .eq("proposal_id", input.proposalId)
    .eq("user_id", input.userId)
    .maybeSingle();

  const { data: execucaoExistente } = await supabase
    .from("ai_action_executions")
    .select("id")
    .eq("proposal_id", input.proposalId)
    .eq("user_id", input.userId)
    .maybeSingle();

  const admissao = admitirExecucao(
    {
      proposta: proposta
        ? {
            expiresAt: proposta.expires_at,
            effectHash: proposta.effect_hash,
            command: proposta.command,
          }
        : null,
      hashDaTela: input.hashDaTela,
      decisao: (aprovacao?.decision as DecisaoDoDono | undefined) ?? null,
      jaExecutou: Boolean(execucaoExistente),
      commandsConhecidos: nomesDeCommands(),
    },
    input.agora,
  );
  if (!admissao.ok) return negar(admissao.motivo);

  // `admitirExecucao` trata `recusada` e o prazo; o que sobra é "ninguém confirmou ainda".
  if (!aprovacao || aprovacao.decision !== "confirmada") return negar("SEM_CONFIRMACAO");
  // Estreitamento para o TypeScript: `admitirExecucao` já garantiu que a proposta existe.
  if (!proposta) return negar("PROPOSTA_NAO_ENCONTRADA");

  const command = commandExecutavel(proposta.command);
  if (!command) return negar("COMMAND_DESCONHECIDO");

  const parsed = command.parse(proposta.payload);
  // Payload que não passa mais no próprio schema é um efeito que não pode ser recalculado —
  // e recalcular "quase" seria pior que recusar.
  if (!parsed.ok) return negar("EFEITO_MUDOU");

  const ctx: CommandContext = { supabase, userId: input.userId };

  // ── 4. Revalidação: o mundo mudou entre propor e confirmar? ──
  let hashAgora: string;
  try {
    const efeitoAgora = await command.prever(ctx, parsed.valor);
    hashAgora = hashDe(efeitoAgora, proposta.tool_name, proposta.tool_version);
  } catch (e) {
    registrarFalha("PREVIEW_RECOMPUTE_FAILED", input.proposalId, e as { code?: string });
    // Não conseguir recalcular NÃO é "está tudo igual". Recusa.
    return negar("EFEITO_MUDOU");
  }
  const revalidacao = revalidarEfeito(proposta.effect_hash, hashAgora);
  if (!revalidacao.ok) return negar(revalidacao.motivo);

  // ── 5. Reserva da vaga, ANTES de escrever (claim-first — ver a migration) ──
  const idempotencyKey = `ai:${aprovacao.id}`;
  const { data: execucao, error: erroDaReserva } = await supabase
    .from("ai_action_executions")
    .insert({
      user_id: input.userId,
      approval_id: aprovacao.id,
      proposal_id: input.proposalId,
      command: command.name,
      idempotency_key: idempotencyKey,
      status: "executando",
      /**
       * 18-C · Bloco 5 — o vínculo vem da PROPOSTA, nunca do cliente. Se viesse do clique, o
       * navegador escolheria qual execução declarar como desfeita — e ocuparia, com isso, o
       * `ai_action_executions_undoes_user_uidx` de uma execução que ninguém reverteu.
       */
      undoes_execution_id: proposta.undoes_execution_id,
    })
    .select("id")
    .single();

  if (erroDaReserva || !execucao) {
    registrarFalha("EXECUTION_CLAIM_FAILED", input.proposalId, erroDaReserva);
    // `23505` = outra requisição reservou primeiro (clique duplo, duas abas, retry). A
    // resposta certa é "já executou", não "falhou": a ação está acontecendo ou aconteceu.
    //
    // ⚠️ Dois índices únicos diferentes produzem o mesmo `23505`, e as frases não são
    // intercambiáveis: uma diz "esta ação já rodou", a outra diz "aquela ação já foi
    // revertida". O nome da constraint é NOSSO (não é dado do usuário), então lê-lo aqui não
    // vaza nada — e é o único jeito de saber qual das duas corridas aconteceu.
    if (erroDaReserva?.code === "23505") {
      return negar(indiceDeDesfazer(erroDaReserva) ? "JA_DESFEITA" : "JA_EXECUTADA");
    }
    return negar("COMMAND_DESCONHECIDO");
  }

  const inicio = input.agora.getTime();
  const fechar = async (campos: {
    status: StatusDaExecucao;
    errorCode?: string | null;
    targetId?: string | null;
    targetRoute?: string | null;
    changedFields?: Readonly<Record<string, ValorDeCampo>>;
    undetailed?: boolean;
    itens?: readonly ResultadoDoItem[];
  }) => {
    const { error } = await supabase
      .from("ai_action_executions")
      .update({
        status: campos.status,
        error_code: campos.errorCode ?? null,
        target_id: campos.targetId ?? null,
        target_route: campos.targetRoute ?? null,
        changed_fields: { ...(campos.changedFields ?? {}) },
        undetailed_change: campos.undetailed ?? false,
        items: campos.itens ? campos.itens.map((i) => ({ ...i })) : [],
        finished_at: new Date().toISOString(),
        duration_ms: Math.max(0, Date.now() - inicio),
      })
      .eq("id", execucao.id)
      .eq("user_id", input.userId)
      // Redundante com a policy `ai_action_executions_close`, e fica assim de propósito: é a
      // defesa que sobrevive a alguém afrouxar a policy, e diz aqui que fechar é idempotente.
      .eq("status", "executando");
    if (error) registrarFalha("EXECUTION_CLOSE_FAILED", input.proposalId, error);
  };

  // ── 6. O command. Daqui em diante, algo pode ter sido escrito nos dados do usuário. ──
  let resultado: ResultadoDoCommand;
  try {
    resultado = await command.executar(ctx, parsed.valor, idempotencyKey);
  } catch (e) {
    registrarFalha("COMMAND_FAILED", input.proposalId, e as { code?: string });
    // ⚠️ O código é NOSSO e é curto. A mensagem do erro nunca vira coluna: ela traz nome de
    // tabela, de coluna e às vezes valor de linha.
    await fechar({ status: "falhou", errorCode: "COMMAND_FAILED" });
    return {
      ok: true,
      executionId: execucao.id,
      status: "falhou",
      targetId: null,
      targetRoute: null,
      revalidar: command.revalidar,
    };
  }

  // ── 7. Desfecho ──
  const tocados = filtrarCamposTocados(resultado.alterados, command.camposAuditaveis);
  const houveFalhaDeItem = resultado.itens.some((i) => !i.ok);
  const status: StatusDaExecucao = houveFalhaDeItem ? "parcial" : "sucesso";
  // A rota vira `href` na tela: mesma allowlist de `refs` (invariante 22 da 18-B).
  const rota =
    resultado.targetRoute && rotaInternaAceita(resultado.targetRoute)
      ? resultado.targetRoute
      : null;

  await fechar({
    status,
    errorCode: houveFalhaDeItem ? "ITENS_COM_FALHA" : null,
    targetId: resultado.targetId,
    targetRoute: rota,
    changedFields: tocados.campos,
    undetailed: tocados.undetailed,
    itens: resultado.itens,
  });

  return {
    ok: true,
    executionId: execucao.id,
    status,
    targetId: resultado.targetId,
    targetRoute: rota,
    revalidar: command.revalidar,
  };
}
