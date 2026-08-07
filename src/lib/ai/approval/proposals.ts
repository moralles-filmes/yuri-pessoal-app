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
export async function criarProposta(entrada: NovaProposta): Promise<PropostaGravada | null> {
  /**
   * As rotas das entidades vão para a tela como `href`. Mesma allowlist de `refs` desde a
   * 18-B (invariante 22): `rotaInternaAceita` é allowlist, não lista de proibidos — recusar
   * só `//` deixava passar `/\`, que o parser de URL resolve idêntico.
   *
   * Rota reprovada NÃO derruba a proposta: ela perde o link e mantém tipo e id, porque o que
   * importa para a confirmação é O QUE será alterado, não o atalho para vê-lo.
   */
  const entidades = entrada.efeito.entidades.map((e) => ({
    tipo: e.tipo,
    id: e.id,
    ...(rotaInternaAceita(e.rota) ? { rota: e.rota } : {}),
  }));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ai_action_proposals")
    .insert({
      user_id: entrada.userId,
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
