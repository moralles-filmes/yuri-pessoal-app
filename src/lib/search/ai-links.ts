/**
 * Fase 18-F · Bloco 1 — deep-links do módulo de IA (PURO).
 *
 * Fonte ÚNICA das rotas de `/ia`, consumida pela busca global E pelas notificações. Mora
 * separado de `queries.ts` (server-only) pelo mesmo motivo de `training-links.ts` e
 * `nutrition-links.ts`: o requisito não é "a busca encontra", é "o link ABRE a tela" — e com
 * os links num módulo puro isso vira teste de contrato em vez de fé.
 *
 * ⚠️ Armadilha registrada, no espírito do `?aba=despensa` da Dieta: a tela de ações filtra por
 * `?filtro=`, e o valor de "precisam de atenção" é **`problemas`** (`FILTROS_DO_HISTORICO` em
 * `lib/ai/approval/history.ts`). Um valor fora dessa lista não dá 404 — é pior: a página
 * ignora em silêncio e mostra TODAS as ações, e o aviso do sino leva a lugar nenhum.
 *
 * ⚠️ NÃO existe rota de memória ainda. `/ia/memoria` nasce no Bloco 3, e o link dela entra
 * JUNTO com a rota — nunca antes.
 */

export const AI_LINK_BASE = "/ia";

/** Uma conversa específica (rota dinâmica). */
export const conversationLink = (id: string) => `${AI_LINK_BASE}/conversas/${id}`;

/** Lista de conversas. */
export const conversationsLink = () => `${AI_LINK_BASE}/conversas`;

/** Análises geradas pelo Insight Engine (18-E). */
export const insightsLink = () => `${AI_LINK_BASE}/insights`;

/** O que a IA preparou, o que foi decidido e o que foi aplicado (18-C · Bloco 5). */
export const actionsLink = () => `${AI_LINK_BASE}/acoes`;

/**
 * As ações que precisam de atenção — inclui `executando` sem desfecho, que NÃO é sucesso nem
 * falha (invariante 52). É para cá que o aviso `ai_action_stuck` aponta.
 */
export const stuckActionsLink = () => `${AI_LINK_BASE}/acoes?filtro=problemas`;

/** Custo por período, modelo e tentativa (18-A). */
export const usageLink = () => `${AI_LINK_BASE}/consumo`;

/** Chaves, provedores, orçamento e as permissões por módulo. */
export const settingsLink = () => `${AI_LINK_BASE}/configuracoes`;

/** Envio e revisão de comprovante (18-D). */
export const receiptsLink = () => `${AI_LINK_BASE}/comprovantes`;
