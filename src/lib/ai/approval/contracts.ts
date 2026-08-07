/**
 * Fase 18-C · Bloco 3 — IA · Contratos do Approval Engine.
 *
 * Puro. Os TIPOS existem antes do primeiro command, pelo mesmo motivo que os contratos do
 * Tool Registry existiram antes da primeira ferramenta (18-A): ter a fronteira escrita,
 * testada e difícil de furar ANTES de haver o que ela protege.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AS TRÊS FONTES DE VERDADE, DECLARADAS PARA NÃO VIRAREM TRÊS CÓPIAS DA MESMA COISA:    ║
 * ║                                                                                       ║
 * ║   ai_tool_calls        → o que o MODELO pediu            (18-B)                        ║
 * ║   ai_action_proposals  → o que SERIA feito                                             ║
 * ║   ai_action_executions → o que FOI feito                                               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import type { NivelDeRisco, ToolRef } from "@/lib/ai/tools/contracts";
import type { ValorCanonico } from "./canonical";

// ══════════════════════════════════════════════════════════════════════════════════════
// 1. A previsão do efeito
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * O que a tela mostra ao dono ANTES de ele confirmar — e o que entra no hash.
 *
 * `resumo` é a frase em pt-BR; `linhas` são os pares "campo: valor" que a tela lista. Ambos
 * saem do adapter da ferramenta, nunca do modelo: um texto escrito pelo modelo poderia
 * descrever um efeito diferente do que o command vai executar, e o dono confirmaria o texto.
 */
export type PrevisaoDoEfeito = {
  readonly resumo: string;
  readonly linhas: readonly { readonly rotulo: string; readonly valor: string }[];
  /**
   * O que o dono precisa saber e não cabe em "campo: valor" — "esta compra cai na fatura que
   * fecha dia 28", "a tarefa é recorrente e só esta ocorrência é afetada". Sem isso, a
   * previsão fica correta e ainda assim incompleta.
   */
  readonly ressalvas: readonly string[];
};

// ══════════════════════════════════════════════════════════════════════════════════════
// 2. A proposta
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * O que uma ferramenta de escrita DEVOLVE — em vez de um `ToolOutput`.
 *
 * A diferença de tipo é a trava: uma ferramenta de escrita não tem como devolver "consultei
 * e aqui está o resultado", porque ela não consultou para responder — ela preparou uma
 * alteração. Compartilhar o tipo com a leitura permitiria escrever um adapter de escrita que
 * parece uma leitura e cujo resultado o modelo relataria como fato consumado.
 */
export type EfeitoProposto = {
  readonly command: string;
  /** A entrada já validada pelo Zod `.strict()` da ferramenta. */
  readonly payload: ValorCanonico;
  /** Os registros que a ferramenta RESOLVEU. `rota` é para a tela; ela não entra no hash. */
  readonly entidades: readonly ToolRef[];
  readonly previsao: PrevisaoDoEfeito;
};

export type PropostaGravada = {
  readonly id: string;
  readonly effectHash: string;
  readonly expiresAt: string;
};

// ══════════════════════════════════════════════════════════════════════════════════════
// 3. Os campos tocados — a exceção declarada à invariante 20 da 18-B (§3.6 do design)
// ══════════════════════════════════════════════════════════════════════════════════════

/**
 * ⚠️ O LIMITE É DE FORMA, NÃO DE NOME — e é assim de propósito.
 *
 * A tentação é uma lista de campos proibidos ("nunca `photo_path`, nunca `notes`, nunca
 * `token`"). Toda trava escrita como lista de proibidos acaba furada: basta um campo novo
 * com nome que ninguém previu. O que vale aqui é o inverso — só passa o que TEM a forma
 * permitida: escalar, curto, sem estrutura.
 *
 * Um caminho de anexo, uma URL assinada, um texto livre longo, um blob e uma chave falham
 * todos por forma, sem que ninguém precise ter pensado neles antes.
 */
export const TAMANHO_MAX_DO_CAMPO = 200;

export type ValorDeCampo = string | number | boolean | null;

export type CamposTocados = {
  readonly campos: Readonly<Record<string, ValorDeCampo>>;
  /**
   * Houve alteração que NÃO foi detalhada — por estar fora da allowlist do command, ou por
   * não caber na forma permitida. Registrar que houve é honesto; gravar o campo furaria a
   * allowlist por dentro.
   *
   * ⚠️ E o NOME do campo omitido também não é registrado. "Registra que houve alteração não
   * detalhada" é o que a decisão do dono diz, e nomear o campo já contaria parte do que se
   * decidiu não contar.
   */
  readonly undetailed: boolean;
};

function cabeNaForma(valor: unknown): valor is ValorDeCampo {
  if (valor === null) return true;
  const t = typeof valor;
  if (t === "boolean") return true;
  if (t === "number") return Number.isFinite(valor as number);
  if (t === "string") return (valor as string).length <= TAMANHO_MAX_DO_CAMPO;
  return false;
}

/**
 * Filtra o que o serviço de domínio alterou contra a allowlist ESTÁTICA do command.
 *
 * Puro, e é o único lugar do sistema autorizado a montar `ai_action_executions.changed_fields`.
 */
export function filtrarCamposTocados(
  alterados: Readonly<Record<string, unknown>>,
  allowlist: readonly string[],
): CamposTocados {
  const permitidos = new Set(allowlist);
  const campos: Record<string, ValorDeCampo> = {};
  let undetailed = false;

  for (const [chave, valor] of Object.entries(alterados)) {
    if (!permitidos.has(chave) || !cabeNaForma(valor)) {
      undetailed = true;
      continue;
    }
    campos[chave] = valor;
  }

  return { campos, undetailed };
}

// ══════════════════════════════════════════════════════════════════════════════════════
// 4. O command
// ══════════════════════════════════════════════════════════════════════════════════════

export type ResultadoDoItem = {
  readonly ref: string;
  readonly ok: boolean;
  /** Código curto e sanitizado. Nunca mensagem de banco, nunca stack. */
  readonly erro?: string;
};

export type ResultadoDoCommand = {
  /** O registro criado ou alterado, para o link da tela. */
  readonly targetId: string | null;
  /** Rota INTERNA. Passa por `rotaInternaAceita` antes de virar linha. */
  readonly targetRoute: string | null;
  /** O que o serviço de domínio alterou, ANTES da allowlist. */
  readonly alterados: Readonly<Record<string, unknown>>;
  /** Só em ação em massa. Vazio nas demais. */
  readonly itens: readonly ResultadoDoItem[];
};

export type CommandDescriptor = {
  readonly name: string;
  readonly module: string;
  readonly risk: NivelDeRisco;
  /**
   * As rotas que o `revalidatePath` da CASCA precisa invalidar. Declaradas aqui, executadas
   * na Server Action: `revalidatePath` dentro do command o prenderia ao Next, e o command
   * precisa ser chamável de um teste.
   */
  readonly revalidar: readonly string[];
  /** §3.6 — os campos que ESTE command pode detalhar. Estática, nunca calculada. */
  readonly camposAuditaveis: readonly string[];
  /**
   * §3.7 — o command INVERSO, quando o serviço de domínio já tem a operação que a tela usa.
   * `null` significa "não há desfazer", e a tela então não mostra o botão e explica por quê.
   * Reverter aplicando um snapshot escreveria no banco um estado que nenhum formulário
   * produziu — que é exatamente o que a arquitetura proíbe.
   */
  readonly undo: string | null;
};

/**
 * Um command mal declarado é recusado ANTES de executar — mesmo espírito de
 * `isToolDescriptorCoherent`.
 *
 * A allowlist vazia é PERMITIDA e significa "esta ação não detalha campo nenhum"; o que não
 * pode é `undo` apontando para um nome que não existe no mapa, porque aí o botão de desfazer
 * apareceria na tela e falharia no clique.
 */
export function isCommandCoherent(
  command: CommandDescriptor,
  nomesConhecidos: readonly string[],
): boolean {
  if (command.name.trim() === "") return false;
  if (command.risk < 2) return false;
  if (command.revalidar.length === 0) return false;
  if (new Set(command.camposAuditaveis).size !== command.camposAuditaveis.length) {
    return false;
  }
  if (command.undo !== null && !nomesConhecidos.includes(command.undo)) return false;
  return true;
}
