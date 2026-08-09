import "server-only";

/**
 * Fase 18-C · Bloco 3 — IA · A GRAVAÇÃO DA PROPOSTA. I/O fino; a decisão mora em `state.ts`.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTE É O ÚNICO EFEITO QUE UMA FERRAMENTA DE ESCRITA TEM DENTRO DO RUN.                ║
 * ║                                                                                       ║
 * ║ Uma linha em `ai_action_proposals` — que é uma tabela do módulo de IA, não do módulo   ║
 * ║ do usuário. Nenhuma transação é lançada, nenhuma tarefa é criada, nenhum diário é      ║
 * ║ tocado. O que o modelo recebe de volta é o id da proposta e a frase "aguardando        ║
 * ║ confirmação"; quem executa é `execute.ts`, chamado por uma Server Action, FORA do run. ║
 * ║                                                                                       ║
 * ║ É por isso que "cancelar o streaming não desfaz ação confirmada" é verdadeiro por      ║
 * ║ construção nesta subfase, e não uma checagem que alguém pode esquecer de escrever.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `user_id` vem de quem chama (que o pegou de `authContext()`), e o cliente é o de SESSÃO:
 * a RLS continua valendo. Nada aqui usa service role.
 */

import { createClient } from "@/lib/supabase/server";
import { safeLogFields } from "@/lib/ai/security/redact";
import { aiError } from "@/lib/ai/core/errors";
import type { NivelDeRisco } from "@/lib/ai/tools/contracts";
import { rotaInternaAceita } from "@/lib/ai/tools/sources";
import type { Json } from "@/types/supabase";
import { hashDoEfeito, type ValorCanonico } from "./canonical";
import type { EfeitoProposto, PropostaGravada } from "./contracts";

/**
 * `ValorCanonico` e `Json` descrevem o mesmo conjunto de valores; a diferença é que o
 * primeiro é `readonly` e o gerado pelo Supabase não. O cast é de VARIÂNCIA, não de tipo —
 * e é preferível a afrouxar `ValorCanonico`, que é justamente o tipo que impede um `Date`
 * ou um `Buffer` de entrar no hash sem ninguém decidir isso.
 */
const comoJson = (valor: ValorCanonico): Json => valor as Json;

function registrarFalha(code: string, correlationId: string, error: { code?: string } | null): void {
  console.error("[ia][proposta] falha ao gravar", {
    ...safeLogFields(aiError("ERRO_TEMPORARIO", code), correlationId),
    sqlstate: error?.code ?? "desconhecido",
  });
}

/**
 * 18-C · Bloco 5 — a ferramenta ficcional das propostas que NÃO vêm do chat.
 *
 * `tool_name`/`tool_version` são NOT NULL e entram no hash. Uma proposta de desfazer não nasce
 * de ferramenta nenhuma — nasce do botão da tela —, então ela declara isso por escrito em vez
 * de reaproveitar o nome da ferramenta que originou a ação desfeita (que descreveria a ação
 * ERRADA) ou de deixar o campo vazio (que faria a trilha mentir por omissão).
 *
 * A versão é parte do hash: mudá-la invalida propostas de desfazer pendentes, e é o
 * comportamento certo — pior caso "proponha de novo".
 */
export const FERRAMENTA_DO_DESFAZER = "tela.desfazer";
export const VERSAO_DO_DESFAZER = "1";

export type NovaProposta = {
  readonly userId: string;
  readonly conversationId: string;
  readonly runId: string;
  /** O id devolvido por `recordToolCall`. Sem trilha, sem proposta. */
  readonly toolCallId: string;
  readonly toolName: string;
  readonly toolVersion: string;
  readonly module: string;
  readonly risk: NivelDeRisco;
  readonly efeito: EfeitoProposto;
};

/**
 * ⚠️ A PREVISÃO É SERIALIZADA UMA VEZ SÓ, E O MESMO OBJETO VAI PARA O HASH E PARA A COLUNA.
 *
 * Montar dois objetos ("um para hashear, outro para gravar") é o defeito clássico deste tipo
 * de trava: eles divergem no primeiro campo acrescentado a um dos dois, e a partir daí o
 * recálculo da execução recusa propostas legítimas — ou, na direção pior, aceita uma previsão
 * que não é a que foi exibida.
 */
function previsaoCanonica(efeito: EfeitoProposto): ValorCanonico {
  return {
    resumo: efeito.previsao.resumo,
    linhas: efeito.previsao.linhas.map((l) => ({ rotulo: l.rotulo, valor: l.valor })),
    ressalvas: [...efeito.previsao.ressalvas],
  };
}

/**
 * O hash de um efeito. Exportado porque `execute.ts` PRECISA usar exatamente esta função no
 * recálculo — duas montagens diferentes do mesmo efeito é o único jeito de a revalidação
 * dar falso negativo.
 */
export function hashDe(efeito: EfeitoProposto, toolName: string, toolVersion: string): string {
  return hashDoEfeito({
    tool: toolName,
    toolVersion,
    command: efeito.command,
    payload: efeito.payload,
    entidades: efeito.entidades.map((e) => ({ tipo: e.tipo, id: e.id })),
    previsao: previsaoCanonica(efeito),
  });
}

/**
 * Grava a proposta. Devolve `null` se a gravação falhou — e quem chama TEM de tratar isso
 * como "a alteração não foi preparada", nunca como sucesso silencioso: uma proposta que não
 * existe é uma confirmação que nunca vai chegar, e o modelo não pode relatar o efeito.
 */
/**
 * As rotas das entidades vão para a tela como `href`. Mesma allowlist de `refs` desde a 18-B
 * (invariante 22): `rotaInternaAceita` é allowlist, não lista de proibidos — recusar só `//`
 * deixava passar `/\`, que o parser de URL resolve idêntico.
 *
 * Rota reprovada NÃO derruba a proposta: ela perde o link e mantém tipo e id, porque o que
 * importa para a confirmação é O QUE será alterado, não o atalho para vê-lo.
 */
function entidadesGravaveis(efeito: EfeitoProposto) {
  return efeito.entidades.map((e) => ({
    tipo: e.tipo,
    id: e.id,
    ...(rotaInternaAceita(e.rota) ? { rota: e.rota } : {}),
  }));
}

export async function criarProposta(entrada: NovaProposta): Promise<PropostaGravada | null> {
  const entidades = entidadesGravaveis(entrada.efeito);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_action_proposals")
    .insert({
      user_id: entrada.userId,
      // Explícito, e não pelo default: quem lê este insert precisa ver QUAL das duas formas
      // do CHECK `ai_action_proposals_origem_coerente` ele está criando.
      origem: "ferramenta",
      conversation_id: entrada.conversationId,
      run_id: entrada.runId,
      tool_call_id: entrada.toolCallId,
      tool_name: entrada.toolName,
      tool_version: entrada.toolVersion,
      command: entrada.efeito.command,
      module: entrada.module,
      risk: entrada.risk,
      payload: comoJson(entrada.efeito.payload),
      resolved_entities: entidades,
      preview: comoJson(previsaoCanonica(entrada.efeito)),
      effect_hash: hashDe(entrada.efeito, entrada.toolName, entrada.toolVersion),
      // ⚠️ `expires_at` NÃO É ENVIADO. O prazo é o default do banco (now() + 10 min) — ver o
      // comentário na migration. Mandá-lo daqui poria a janela de replay na mão de uma conta
      // de data em JavaScript.
    })
    .select("id, effect_hash, expires_at")
    .single();

  if (error) {
    registrarFalha("PROPOSAL_INSERT_FAILED", entrada.runId, error);
    return null;
  }
  if (!data) return null;

  return {
    id: data.id,
    effectHash: data.effect_hash,
    expiresAt: data.expires_at,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════
// 18-C · Bloco 5 — a proposta que nasce do BOTÃO, não do chat
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * 18-D · Bloco 5 — a TERCEIRA forma. Uma proposta que nasce de um DOCUMENTO.
 *
 * Mesma razão de `FERRAMENTA_DO_DESFAZER`: `tool_name`/`tool_version` são NOT NULL e entram
 * no hash, e esta proposta não nasce de ferramenta nenhuma — nasce do dono revisando um
 * comprovante em `/ia/comprovantes`. Declarar isso por escrito é melhor que reaproveitar
 * `finance.lancar_transacao` (que descreveria uma tool call que nunca houve).
 */
export const FERRAMENTA_DO_COMPROVANTE = "tela.comprovante";
export const VERSAO_DO_COMPROVANTE = "1";

export type NovaPropostaDeDocumento = {
  readonly userId: string;
  /** A extração revisada que originou esta proposta. FK composta com `user_id`. */
  readonly documentExtractionId: string;
  readonly module: string;
  readonly risk: NivelDeRisco;
  readonly efeito: EfeitoProposto;
};

/**
 * ⚠️ MESMO MOTOR: hash do efeito, prazo de 10 min do BANCO, uso único e revalidação. O
 * comprovante não ganha atalho nenhum — ⛔ **nenhum lançamento definitivo é criado só por
 * ter recebido imagem**, e a única porta continua sendo `confirmarAcaoDaIa`.
 *
 * `document_extraction_id` NÃO entra no hash, pela mesma razão de `undoes_execution_id`: o
 * hash cobre o EFEITO, e o payload já carrega o que vai ser lançado. O vínculo é
 * escrituração, e quem o protege é a FK composta `(document_extraction_id, user_id)`.
 */
export async function criarPropostaDeDocumento(
  entrada: NovaPropostaDeDocumento,
): Promise<PropostaGravada | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_action_proposals")
    .insert({
      user_id: entrada.userId,
      origem: "documento",
      document_extraction_id: entrada.documentExtractionId,
      tool_name: FERRAMENTA_DO_COMPROVANTE,
      tool_version: VERSAO_DO_COMPROVANTE,
      command: entrada.efeito.command,
      module: entrada.module,
      risk: entrada.risk,
      payload: comoJson(entrada.efeito.payload),
      resolved_entities: entidadesGravaveis(entrada.efeito),
      preview: comoJson(previsaoCanonica(entrada.efeito)),
      effect_hash: hashDe(
        entrada.efeito,
        FERRAMENTA_DO_COMPROVANTE,
        VERSAO_DO_COMPROVANTE,
      ),
      // `expires_at` continua não sendo enviado — o prazo é o default do banco.
    })
    .select("id, effect_hash, expires_at")
    .single();

  if (error) {
    registrarFalha("DOCUMENT_PROPOSAL_INSERT_FAILED", entrada.documentExtractionId, error);
    return null;
  }
  if (!data) return null;

  return { id: data.id, effectHash: data.effect_hash, expiresAt: data.expires_at };
}

export type NovaPropostaDeDesfazer = {
  readonly userId: string;
  /** A execução que será revertida. É ela que ocupa o lugar da trilha de chat. */
  readonly undoesExecutionId: string;
  readonly module: string;
  readonly risk: NivelDeRisco;
  /** O efeito do command INVERSO — previsto pelo mesmo `prever` que a execução recalcula. */
  readonly efeito: EfeitoProposto;
};

/**
 * ⚠️ O DESFAZER PASSA PELO MESMO MOTOR — proposta, hash, prazo de 10 min, uso único,
 * confirmação e revalidação. Não é um atalho (§3.7).
 *
 * O que muda em relação a `criarProposta` é só a PROCEDÊNCIA: em vez de conversa, run e tool
 * call, ela grava `origem = 'desfazer'` e o id da execução revertida. O CHECK
 * `ai_action_proposals_origem_coerente` recusa qualquer mistura das duas formas, e a FK
 * composta `(undoes_execution_id, user_id)` impede propor o desfazer de execução alheia.
 */
export async function criarPropostaDeDesfazer(
  entrada: NovaPropostaDeDesfazer,
): Promise<PropostaGravada | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_action_proposals")
    .insert({
      user_id: entrada.userId,
      origem: "desfazer",
      undoes_execution_id: entrada.undoesExecutionId,
      tool_name: FERRAMENTA_DO_DESFAZER,
      tool_version: VERSAO_DO_DESFAZER,
      command: entrada.efeito.command,
      module: entrada.module,
      risk: entrada.risk,
      payload: comoJson(entrada.efeito.payload),
      resolved_entities: entidadesGravaveis(entrada.efeito),
      preview: comoJson(previsaoCanonica(entrada.efeito)),
      effect_hash: hashDe(entrada.efeito, FERRAMENTA_DO_DESFAZER, VERSAO_DO_DESFAZER),
      // `expires_at` continua não sendo enviado — o prazo é o default do banco.
    })
    .select("id, effect_hash, expires_at")
    .single();

  if (error) {
    registrarFalha("UNDO_PROPOSAL_INSERT_FAILED", entrada.undoesExecutionId, error);
    return null;
  }
  if (!data) return null;

  return { id: data.id, effectHash: data.effect_hash, expiresAt: data.expires_at };
}

// ══════════════════════════════════════════════════════════════════════════════════════
// 18-E · Bloco 3 — a proposta que nasce de um INSIGHT
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * A QUARTA forma. Mesma razão de `FERRAMENTA_DO_DESFAZER` e `FERRAMENTA_DO_COMPROVANTE`:
 * `tool_name`/`tool_version` são NOT NULL e entram no hash, e esta proposta não nasce de
 * ferramenta nenhuma — nasce do dono lendo uma análise em `/ia/insights` e decidindo virar
 * tarefa. Declarar por escrito é melhor que reaproveitar `todo.criar_tarefa`, que descreveria
 * uma tool call que nunca houve.
 */
export const FERRAMENTA_DO_INSIGHT = "tela.insight";
export const VERSAO_DO_INSIGHT = "1";

export type NovaPropostaDeInsight = {
  readonly userId: string;
  /** O insight que originou esta proposta. FK composta com `user_id`. */
  readonly insightId: string;
  readonly module: string;
  readonly risk: NivelDeRisco;
  readonly efeito: EfeitoProposto;
};

/**
 * ⚠️ MESMO MOTOR: hash do efeito, prazo de 10 min do BANCO, uso único e revalidação. Ler uma
 * análise não cria tarefa nenhuma — a única porta continua sendo `confirmarAcaoDaIa`, com o
 * dono lendo a previsão antes.
 *
 * `insight_id` NÃO entra no hash, pela mesma razão dos outros dois vínculos: o hash cobre o
 * EFEITO, e o payload já carrega o que vai ser criado. Quem o protege é a FK composta
 * `(insight_id, user_id)`.
 */
export async function criarPropostaDeInsight(
  entrada: NovaPropostaDeInsight,
): Promise<PropostaGravada | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_action_proposals")
    .insert({
      user_id: entrada.userId,
      origem: "insight",
      insight_id: entrada.insightId,
      tool_name: FERRAMENTA_DO_INSIGHT,
      tool_version: VERSAO_DO_INSIGHT,
      command: entrada.efeito.command,
      module: entrada.module,
      risk: entrada.risk,
      payload: comoJson(entrada.efeito.payload),
      resolved_entities: entidadesGravaveis(entrada.efeito),
      preview: comoJson(previsaoCanonica(entrada.efeito)),
      effect_hash: hashDe(entrada.efeito, FERRAMENTA_DO_INSIGHT, VERSAO_DO_INSIGHT),
      // `expires_at` continua não sendo enviado — o prazo é o default do banco.
    })
    .select("id, effect_hash, expires_at")
    .single();

  if (error) {
    registrarFalha("INSIGHT_PROPOSAL_INSERT_FAILED", entrada.insightId, error);
    return null;
  }
  if (!data) return null;

  return { id: data.id, effectHash: data.effect_hash, expiresAt: data.expires_at };
}
