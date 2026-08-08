import "server-only";

/**
 * Fase 18-C · Bloco 5 — IA · O DESFAZER. Ele prepara uma proposta; ele não desfaz nada.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O DESFAZER É UMA AÇÃO, NÃO UM ATALHO (§3.7) — e este arquivo é o que garante isso.     ║
 * ║                                                                                       ║
 * ║ Ele NÃO importa `execute.ts`, NÃO chama `executar` e NÃO toca módulo nenhum. O que ele ║
 * ║ faz é montar a entrada do command INVERSO a partir do que a execução registrou,        ║
 * ║ calcular a previsão e gravar uma proposta — exatamente o que a ferramenta de escrita   ║
 * ║ faz dentro do run. Daí em diante o caminho é o mesmo de qualquer outra alteração:      ║
 * ║ o dono lê a previsão, confirma, e `confirmarAcaoDaIa` executa.                          ║
 * ║                                                                                       ║
 * ║ Um "desfazer instantâneo" seria a única escrita do sistema sem o dono decidindo.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ O DESFAZER NÃO LÊ O PAYLOAD ORIGINAL, e não é economia: ele não pode. A proposta que
 * originou a execução some com a conversa (invariante 38), e a execução sobrevive. Tudo que o
 * inverso recebe vem de `target_id` + `changed_fields` — que é justamente por isso que a
 * allowlist §3.6 de `registrarHabito` inclui `log_date`.
 */

import { createClient } from "@/lib/supabase/server";
import { rotuloDoCommand } from "@/lib/ai/constants";
import { findCommand, nomesDeCommands } from "./commands";
import {
  EfeitoImpossivel,
  isCommandCoherent,
  type CommandContext,
} from "./contracts";
import { criarPropostaDeDesfazer } from "./proposals";
import { getExecucaoDaIa, jaFoiDesfeita } from "./queries";
import {
  parseCamposTocados,
  parsePrevisao,
  MOTIVO_SEM_DESFAZER,
  type PrevisaoNaTela,
} from "./history";

/** O que a tela precisa para desenhar o cartão de confirmação do desfazer. */
export type PropostaDeDesfazer = {
  readonly id: string;
  readonly effectHash: string;
  readonly expiresAt: string;
  readonly rotulo: string;
  readonly previsao: PrevisaoNaTela;
};

export type ResultadoDoPreparo =
  | { readonly ok: true; readonly proposta: PropostaDeDesfazer }
  | { readonly ok: false; readonly mensagem: string };

const NAO_ENCONTRADA =
  "Esta ação não está mais registrada. Nada foi alterado — recarregue a página.";
const PREVISAO_ILEGIVEL =
  "Não foi possível montar a previsão do desfazer. Nada foi alterado — desfaça pelo módulo, usando o link do registro.";

function recusa(mensagem: string): ResultadoDoPreparo {
  return { ok: false, mensagem };
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A ORDEM DAS CHECAGENS, como em `admitirExecucao` — e pelo mesmo motivo: as baratas    ║
 * ║ primeiro, e as que consultam o mundo por último.                                       ║
 * ║                                                                                       ║
 * ║  1. a execução existe e é do dono?     (a RLS já responde; a consulta é por user_id)   ║
 * ║  2. o command dela existe e é coerente?                                                ║
 * ║  3. ele declara um inverso?             — se não, a tela mostra o PORQUÊ do descriptor ║
 * ║  4. a execução deu certo?               — `executando` é recusado por não SABERMOS     ║
 * ║  5. já foi desfeita?                                                                    ║
 * ║  6. o inverso aceita o payload montado?                                                 ║
 * ║  7. só então: prever (consulta o módulo) e gravar a proposta                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export async function prepararDesfazer(input: {
  userId: string;
  executionId: string;
}): Promise<ResultadoDoPreparo> {
  const execucao = await getExecucaoDaIa(input.userId, input.executionId);
  if (!execucao) return recusa(NAO_ENCONTRADA);

  const original = findCommand(execucao.command);
  if (!original || !isCommandCoherent(original, nomesDeCommands())) {
    return recusa(MOTIVO_SEM_DESFAZER.COMMAND_DESCONHECIDO);
  }
  if (original.desfazer.kind !== "command") {
    return recusa(original.desfazer.porque);
  }

  switch (execucao.status) {
    case "sucesso":
      break;
    case "executando":
      return recusa(MOTIVO_SEM_DESFAZER.EXECUTANDO);
    case "falhou":
      return recusa(MOTIVO_SEM_DESFAZER.FALHOU);
    case "parcial":
      return recusa(MOTIVO_SEM_DESFAZER.PARCIAL);
    default:
      return recusa(MOTIVO_SEM_DESFAZER.STATUS_DESCONHECIDO);
  }

  /**
   * ⚠️ Esta checagem NÃO é a garantia — ela é a boa mensagem. Quem garante "uma execução é
   * desfeita uma vez só" é `ai_action_executions_undoes_user_uidx`, no banco, e ele continua
   * valendo na corrida entre duas abas (o executor traduz o `23505` em `JA_DESFEITA`).
   */
  if (await jaFoiDesfeita(input.userId, input.executionId)) {
    return recusa("Esta ação já foi desfeita. Nada foi feito de novo.");
  }

  const inverso = findCommand(original.desfazer.command);
  if (!inverso) return recusa(MOTIVO_SEM_DESFAZER.COMMAND_DESCONHECIDO);

  const payload = original.desfazer.payload({
    targetId: execucao.targetId,
    changedFields: parseCamposTocados(execucao.changedFields),
  });
  if (payload === null) return recusa(MOTIVO_SEM_DESFAZER.SEM_ALVO);

  const parsed = inverso.parse(payload);
  if (!parsed.ok) return recusa(MOTIVO_SEM_DESFAZER.SEM_ALVO);

  const supabase = await createClient();
  const ctx: CommandContext = { supabase, userId: input.userId };

  let efeito;
  try {
    efeito = await inverso.prever(ctx, parsed.valor);
  } catch (e) {
    // `EfeitoImpossivel` já traz uma frase em pt-BR escrita para o dono ("o registro não existe
    // mais", "o nome ficou ambíguo"). Qualquer outra falha vira a mensagem genérica — o texto
    // de um erro interno não vai para a tela.
    return recusa(e instanceof EfeitoImpossivel ? e.motivo : PREVISAO_ILEGIVEL);
  }

  const gravada = await criarPropostaDeDesfazer({
    userId: input.userId,
    undoesExecutionId: execucao.id,
    module: inverso.module,
    risk: inverso.risk,
    efeito,
  });
  if (!gravada) return recusa(PREVISAO_ILEGIVEL);

  /**
   * A previsão volta para a tela LIDA DA MESMA FORMA que o histórico a lê — `parsePrevisao`
   * sobre o objeto canônico. Montar aqui um segundo formato faria o cartão do desfazer e o
   * cartão da proposta divergirem no primeiro campo novo.
   */
  const previsao = parsePrevisao({
    resumo: efeito.previsao.resumo,
    linhas: efeito.previsao.linhas.map((l) => ({ rotulo: l.rotulo, valor: l.valor })),
    ressalvas: [...efeito.previsao.ressalvas],
  });
  if (!previsao) return recusa(PREVISAO_ILEGIVEL);

  return {
    ok: true,
    proposta: {
      id: gravada.id,
      effectHash: gravada.effectHash,
      expiresAt: gravada.expiresAt,
      rotulo: rotuloDoCommand(inverso.name),
      previsao,
    },
  };
}
