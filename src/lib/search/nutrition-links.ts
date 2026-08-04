/**
 * Fase 16-F — deep-links do módulo Dieta (PURO).
 *
 * Existe separado da busca (`queries.ts`, server-only) por um motivo prático: o requisito da
 * subfase não é só "a busca encontra", é "o link ABRE O ITEM CERTO". Com os links num módulo
 * puro, isso vira teste; embutidos numa consulta ao Supabase, viraria fé.
 *
 * Cada rota aqui tem do outro lado uma página que LÊ o parâmetro e abre o item — se um deles
 * mudar sem o outro, o teste de contrato quebra.
 */

/** Catálogo de alimentos, com o alimento aberto. */
export const foodLink = (id: string) => `/nutricao/alimentos?alimento=${id}`;

/** Receitas, com o detalhe aberto. */
export const recipeLink = (id: string) => `/nutricao/receitas?receita=${id}`;

/** Refeições-modelo, com o detalhe aberto. */
export const mealTemplateLink = (id: string) => `/nutricao/refeicoes?modelo=${id}`;

/** Planejamento na aba de modelos, com os dias do modelo abertos. */
export const planLink = (id: string) =>
  `/nutricao/planejamento?visao=modelos&plano=${id}`;

/** Lista de compras aberta. */
export const shoppingListLink = (id: string) => `/nutricao/compras?lista=${id}`;

/** Diário num dia específico (data pura 'yyyy-MM-dd'). */
export const diaryLink = (date: string) => `/nutricao/diario?data=${date}`;

/** Medidas corporais. */
export const measurementsLink = () => "/nutricao/medidas";

/**
 * Despensa. NÃO é rota própria — é a aba `?aba=despensa` de `/nutricao/compras` (16-D).
 * Errar isso mandaria a notificação de validade para um 404.
 */
export const pantryLink = () => "/nutricao/compras?aba=despensa";
