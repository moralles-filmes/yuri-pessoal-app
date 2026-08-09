import "server-only";

/**
 * Fase 18-D · Bloco 5 — IA · A PONTE COM A 18-C. O comprovante vira uma proposta, e nada mais.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ NENHUM ATALHO. É O MESMO MOTOR, INTEIRO.                                            ║
 * ║                                                                                       ║
 * ║ Mesmo `prever` (o do command `lancarTransacao`, que a IA e o formulário já usam),      ║
 * ║ mesmo `hashDe`, mesmo prazo de 10 minutos vindo do BANCO, mesmo uso único por          ║
 * ║ `unique (proposal_id)`, mesma revalidação por recálculo na hora de executar. O que      ║
 * ║ muda em relação à proposta que nasce de uma tool call é só a PROCEDÊNCIA:               ║
 * ║ `origem = 'documento'` + `document_extraction_id`, e o CHECK                            ║
 * ║ `ai_action_proposals_origem_coerente` exige essa forma por inteiro.                     ║
 * ║                                                                                       ║
 * ║ ⛔ **NENHUM LANÇAMENTO DEFINITIVO É CRIADO SÓ POR TER RECEBIDO IMAGEM.** Este arquivo  ║
 * ║ não importa `execute.ts`, não chama `executar` e não toca tabela de módulo nenhum.     ║
 * ║ Quem executa continua sendo `confirmarAcaoDaIa`, depois de o dono ler a previsão.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ `approval/` só toca `ai_*` (teste de fronteira). A leitura do Financeiro que a previsão
 * precisa — conta, cartão, categoria, fatura — acontece DENTRO de `commands/finance-preview.ts`,
 * que é a porta declarada. Nada aqui monta consulta a `transactions`.
 */

import { createClient } from "@/lib/supabase/server";
import { rotuloDoCommand } from "@/lib/ai/constants";
import { lerExtracaoGravada } from "@/lib/ai/vision/schema";
import { descricaoDoLancamento, revisar, type CorrecoesDoDono } from "@/lib/ai/vision/review";
import type { ExtracaoDeComprovante } from "@/lib/ai/vision/contracts";
import { findCommand, nomesDeCommands } from "./commands";
import { EfeitoImpossivel, isCommandCoherent, type CommandContext } from "./contracts";
import { parsePrevisao, type PrevisaoNaTela } from "./history";
import { criarPropostaDeDocumento } from "./proposals";

/** O command que um comprovante pode virar. UM só, e nomeado — nunca escolhido pelo cliente. */
const COMMAND_DO_COMPROVANTE = "lancarTransacao";

/** O que a tela precisa para desenhar o cartão de confirmação. Mesma forma do desfazer. */
export type PropostaDoComprovante = {
  readonly id: string;
  readonly effectHash: string;
  readonly expiresAt: string;
  readonly rotulo: string;
  readonly previsao: PrevisaoNaTela;
};

export type ResultadoDoPreparo =
  | { readonly ok: true; readonly proposta: PropostaDoComprovante }
  | { readonly ok: false; readonly mensagem: string };

const NAO_ENCONTRADA =
  "Esta leitura não está mais registrada. Nada foi lançado — extraia o comprovante de novo.";
const ILEGIVEL =
  "Não foi possível ler os campos desta extração. Nada foi lançado — extraia o comprovante de novo.";
const PREVISAO_ILEGIVEL =
  "Não foi possível montar a previsão do lançamento. Nada foi lançado.";

function recusa(mensagem: string): ResultadoDoPreparo {
  return { ok: false, mensagem };
}

/** A escolha do dono na revisão. Nenhum destes campos vem do modelo. */
export type EscolhaDoLancamento = {
  readonly conta?: string | null;
  readonly cartao?: string | null;
  readonly categoria?: string | null;
};

export type PreparoDoComprovante = {
  readonly userId: string;
  readonly extractionId: string;
  readonly correcoes: CorrecoesDoDono;
  readonly escolha: EscolhaDoLancamento;
};

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A ORDEM DAS CHECAGENS — as baratas primeiro, e as que consultam o mundo por último.   ║
 * ║                                                                                       ║
 * ║  1. a extração existe, é do dono e deu certo?                                         ║
 * ║  2. os campos gravados são legíveis por ESTA versão do código?                        ║
 * ║  3. correções aplicadas → `podePropor` — ⛔ **o bloqueio, no SERVIDOR**                ║
 * ║  4. o command existe e é coerente?                                                     ║
 * ║  5. o payload passa no Zod `.strict()` DELE?                                           ║
 * ║  6. só então: prever (consulta o Financeiro) e gravar a proposta                       ║
 * ║  7. registrar o que o dono corrigiu, separado da leitura original                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export async function prepararLancamentoDoComprovante(
  input: PreparoDoComprovante,
): Promise<ResultadoDoPreparo> {
  const supabase = await createClient();

  const { data: linha } = await supabase
    .from("ai_document_extractions")
    .select("id, status, campos")
    .eq("id", input.extractionId)
    .eq("user_id", input.userId)
    .maybeSingle();

  if (!linha || linha.status !== "extraida") return recusa(NAO_ENCONTRADA);

  const gravada = lerExtracaoGravada(linha.campos);
  if (!gravada) return recusa(ILEGIVEL);

  // ── 3. ⛔ O BLOQUEIO. Roda AQUI, não só na tela. ──
  //
  // A tela esconde o botão quando o veredito é negativo — isso é UX, e é contornável. A
  // garantia é esta chamada: valor total, data ou conta incertos e nada é preparado, com o
  // motivo escrito. `revisar` é puro e testado; ele roda idêntico nos dois lados.
  const { efetiva, veredito } = revisar(gravada, input.correcoes);
  if (!veredito.pode) return recusa(veredito.motivo);

  const command = findCommand(COMMAND_DO_COMPROVANTE);
  if (!command || !isCommandCoherent(command, nomesDeCommands())) {
    return recusa(PREVISAO_ILEGIVEL);
  }

  const payload = payloadDoLancamento(efetiva, input.escolha);
  const parsed = command.parse(payload);
  if (!parsed.ok) return recusa(PREVISAO_ILEGIVEL);

  const ctx: CommandContext = { supabase, userId: input.userId };

  let efeito;
  try {
    efeito = await command.prever(ctx, parsed.valor);
  } catch (e) {
    // `EfeitoImpossivel` já traz frase em pt-BR escrita para o dono ("não encontrei a conta
    // X", "essa compra cairia numa fatura já PAGA"). Qualquer outra falha vira a genérica.
    return recusa(e instanceof EfeitoImpossivel ? e.motivo : PREVISAO_ILEGIVEL);
  }

  const gravadaProposta = await criarPropostaDeDocumento({
    userId: input.userId,
    documentExtractionId: linha.id,
    module: command.module,
    risk: command.risk,
    efeito,
  });
  if (!gravadaProposta) return recusa(PREVISAO_ILEGIVEL);

  /**
   * ⚠️ AS CORREÇÕES VÃO PARA UMA COLUNA SEPARADA, e `revisada_em` junto — o CHECK
   * `ai_document_extractions_revisao_coerente` exige os dois ou nenhum.
   *
   * Sobrescrever `campos` seria mais simples e apagaria a leitura original, que é justamente
   * o que se quer poder conferir depois: "o modelo leu 12,90 e eu troquei para 129,00" é um
   * fato de auditoria, e some se as duas colunas virarem uma.
   *
   * Falha aqui NÃO derruba a proposta: ela já está gravada e é o que importa para o dono.
   * Perder o registro da revisão é ruim; perder a proposta que ele acabou de preparar, pior.
   */
  await supabase
    .from("ai_document_extractions")
    .update({
      correcoes: { ...input.correcoes },
      revisada_em: new Date().toISOString(),
    })
    .eq("id", linha.id)
    .eq("user_id", input.userId);

  const previsao = parsePrevisao({
    resumo: efeito.previsao.resumo,
    linhas: efeito.previsao.linhas.map((l) => ({ rotulo: l.rotulo, valor: l.valor })),
    ressalvas: [...efeito.previsao.ressalvas],
  });
  if (!previsao) return recusa(PREVISAO_ILEGIVEL);

  return {
    ok: true,
    proposta: {
      id: gravadaProposta.id,
      effectHash: gravadaProposta.effectHash,
      expiresAt: gravadaProposta.expiresAt,
      rotulo: rotuloDoCommand(command.name),
      previsao,
    },
  };
}

/**
 * A extração revisada → a entrada de `lancarTransacao`.
 *
 * ⚠️ **CENTAVOS → REAIS, UMA VEZ SÓ, AQUI.** `lancarTransacaoEntrada` recebe `valor` em REAIS
 * (é o que o formulário recebe, e `transactionSchema` converte para centavos na gravação).
 * Mandar centavos faria um café de R$ 4,79 virar R$ 479,00 — e a previsão mostraria o número
 * errado, então o dono veria. Mas é o tipo de erro que passa despercebido numa nota de
 * R$ 100,00, e por isso a conversão mora num ponto só, comentada.
 *
 * ⛔ Sempre `despesa`. Um comprovante de compra é uma saída; oferecer "receita" aqui daria ao
 * dono um botão para inverter o sinal do próprio extrato com um clique distraído.
 */
export function payloadDoLancamento(
  extracao: ExtracaoDeComprovante,
  escolha: EscolhaDoLancamento,
): Record<string, unknown> {
  const centavos = extracao.totalCentavos.valor;

  return {
    tipo: "despesa",
    // `podePropor` já garantiu que o total é um número seguro; o `?? 0` nunca é alcançado, e
    // fica como o valor que faria o Zod recusar em vez de lançar um `NaN`.
    valor: centavos === null ? 0 : centavos / 100,
    descricao: descricaoDoLancamento(extracao),
    data: extracao.data.valor,
    conta: escolha.conta ?? null,
    cartao: escolha.cartao ?? null,
    categoria: escolha.categoria ?? null,
  };
}
