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
 * ⚠️ 18-F Bloco 3 — a rota de memória NASCEU, e o link dela entrou NO MESMO COMMIT, que era
 * exatamente o que o aviso do Bloco 1 pedia. Link para rota inexistente é 404, e o projeto já
 * levou esse bug uma vez (a despensa tratada como rota própria sem ser uma, invariante 26).
 */

export const AI_LINK_BASE = "/ia";

/** Uma conversa específica (rota dinâmica). */
export const conversationLink = (id: string) => `${AI_LINK_BASE}/conversas/${id}`;

/** Lista de conversas. */
export const conversationsLink = () => `${AI_LINK_BASE}/conversas`;

/** Análises geradas pelo Insight Engine (18-E). */
export const insightsLink = () => `${AI_LINK_BASE}/insights`;

/**
 * O que a IA preparou, o que foi decidido e o que foi aplicado (18-C · Bloco 5).
 *
 * REDESIGN-07-D · D7 — aceita um filtro, que TEM de ser um valor de `FILTROS_DO_HISTORICO`
 * (`lib/ai/approval/history.ts`): fora da lista, a página ignora em silêncio e mostra todas.
 * O tipo é `string` para este módulo continuar sem import; quem trava a lista é
 * `ai-links.test.ts`. "todas" é a rota pura.
 */
export const actionsLink = (filtro?: string) =>
  filtro && filtro !== "todas" ? `${AI_LINK_BASE}/acoes?filtro=${filtro}` : `${AI_LINK_BASE}/acoes`;

/**
 * As ações que precisam de atenção — inclui `executando` sem desfecho, que NÃO é sucesso nem
 * falha (invariante 52). É para cá que o aviso `ai_action_stuck` aponta.
 */
export const stuckActionsLink = () => actionsLink("problemas");

/** Custo por período, modelo e tentativa (18-A). */
export const usageLink = () => `${AI_LINK_BASE}/consumo`;

/** Chaves, provedores, orçamento e as permissões por módulo. */
export const settingsLink = () => `${AI_LINK_BASE}/configuracoes`;

/** Envio e revisão de comprovante (18-D). */
export const receiptsLink = () => `${AI_LINK_BASE}/comprovantes`;

/** Um comprovante aberto para revisão (`?doc=`, que a página lê) — REDESIGN-07-D · D7. */
export const receiptLink = (docId: string) => `${AI_LINK_BASE}/comprovantes?doc=${docId}`;

/** As preferências que o assistente leva para toda conversa (18-F Bloco 3). */
export const memoryLink = () => `${AI_LINK_BASE}/memoria`;
