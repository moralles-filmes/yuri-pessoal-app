import "server-only";

/**
 * Fase 18-E · Bloco 3 — IA · TRANSFORMAR UM INSIGHT EM TAREFA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ O BOTÃO NÃO CRIA A TAREFA — ELE PROPÕE. É a lição do desfazer da 18-C, inteira.    ║
 * ║                                                                                       ║
 * ║ A proposta passa pelo MESMO `prever`, o MESMO `hashDe`, o MESMO prazo de 10 min do    ║
 * ║ banco, o MESMO uso único e a MESMA revalidação. Quem executa é `confirmarAcaoDaIa`, a ║
 * ║ mesma porta de qualquer outra escrita. Um caminho de um clique só seria a única        ║
 * ║ escrita do sistema sem o dono ler o que vai acontecer.                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ **RESTRITO A `criarTarefaTodo`.** Evento, meta, refeição, treino e lançamento a partir de
 * insight ficam declarados FORA da 18-E (§9 do desenho). Tarefa é risco 2 e tem inverso; as
 * outras são três payloads vindos de decisões diferentes, e o lançamento é risco 3 com
 * sensibilidade `dinheiro`.
 *
 * ⚠️ **O TÍTULO É DO DONO, NÃO DO MODELO.** Ele digita na tela. O insight dá o contexto; se o
 * texto do insight virasse título automaticamente, uma frase escrita por um modelo entraria
 * no TO-DO do dono sem ele ter escrito nada — e ela pode conter token `{{ind:…}}`, que no
 * TO-DO não tem quem resolva.
 *
 * ⚠️ **Este arquivo NÃO monta consulta a tabela de módulo** — invariante 45 da 18-C. Ele toca
 * `ai_insights` (que é `ai_*`) para conferir a procedência, e nada mais; quem fala com o TO-DO
 * é o command.
 */

import { createClient } from "@/lib/supabase/server";

import { findCommand, nomesDeCommands } from "./commands";
import { EfeitoImpossivel, isCommandCoherent, type CommandContext } from "./contracts";
import { parsePrevisao, type PrevisaoNaTela } from "./history";
import { criarPropostaDeInsight } from "./proposals";
import { rotuloDoCommand } from "@/lib/ai/constants";

/** ⛔ UM SÓ. Acrescentar outro exige editar esta linha, e é isso que se quer. */
const COMMAND_DO_INSIGHT = "criarTarefaTodo";

export type PropostaDeInsight = {
  readonly id: string;
  readonly effectHash: string;
  readonly expiresAt: string;
  readonly rotulo: string;
  readonly previsao: PrevisaoNaTela;
};

export type ResultadoDoPreparoDeInsight =
  | { readonly ok: true; readonly proposta: PropostaDeInsight }
  | { readonly ok: false; readonly mensagem: string };

const NAO_ENCONTRADO =
  "Esta análise não está mais registrada. Nada foi criado.";
const PREVISAO_ILEGIVEL =
  "Não foi possível montar a previsão da tarefa. Nada foi criado.";

const recusa = (mensagem: string): ResultadoDoPreparoDeInsight => ({ ok: false, mensagem });

export type PreparoDeTarefaDeInsight = {
  readonly userId: string;
  readonly insightId: string;
  /** Digitado pelo dono na tela. Nunca vem do texto do insight. */
  readonly titulo: string;
  readonly data?: string | null;
  readonly projeto?: string | null;
};

/**
 * A ordem das checagens — as baratas primeiro, e as que consultam o mundo por último:
 *
 *  1. o insight existe e é do dono?
 *  2. o command existe e é coerente?
 *  3. o payload passa no Zod `.strict()` DELE?
 *  4. só então: prever (consulta o TO-DO) e gravar a proposta
 */
export async function prepararTarefaDeInsight(
  input: PreparoDeTarefaDeInsight,
): Promise<ResultadoDoPreparoDeInsight> {
  const supabase = await createClient();

  // ANTI-ENUMERAÇÃO: "não existe" e "não é seu" caem no mesmo ramo, com a mesma frase.
  const { data: linha } = await supabase
    .from("ai_insights")
    .select("id")
    .eq("id", input.insightId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (!linha) return recusa(NAO_ENCONTRADO);

  const command = findCommand(COMMAND_DO_INSIGHT);
  if (!command || !isCommandCoherent(command, nomesDeCommands())) {
    return recusa(PREVISAO_ILEGIVEL);
  }

  const parsed = command.parse({
    titulo: input.titulo,
    ...(input.data ? { data: input.data } : {}),
    ...(input.projeto ? { projeto: input.projeto } : {}),
  });
  if (!parsed.ok) return recusa(PREVISAO_ILEGIVEL);

  const ctx: CommandContext = { supabase, userId: input.userId };

  let efeito;
  try {
    efeito = await command.prever(ctx, parsed.valor);
  } catch (e) {
    // `EfeitoImpossivel` já traz frase em pt-BR escrita para o dono (projeto ambíguo, por
    // exemplo, com os candidatos na mensagem). Qualquer outra falha vira a genérica.
    return recusa(e instanceof EfeitoImpossivel ? e.motivo : PREVISAO_ILEGIVEL);
  }

  const gravada = await criarPropostaDeInsight({
    userId: input.userId,
    insightId: linha.id,
    module: command.module,
    risk: command.risk,
    efeito,
  });
  if (!gravada) return recusa(PREVISAO_ILEGIVEL);

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
      rotulo: rotuloDoCommand(command.name),
      previsao,
    },
  };
}
