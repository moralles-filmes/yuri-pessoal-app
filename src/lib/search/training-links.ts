/**
 * Fase 17-F — deep-links do módulo Treinos (PURO).
 *
 * Existe separado da busca (`queries.ts`, server-only) pelo mesmo motivo da 16-F: o requisito
 * não é "a busca encontra", é "o link ABRE O REGISTRO". Com os links num módulo puro isso
 * vira teste de contrato; embutidos numa consulta ao Supabase, viraria fé.
 *
 * Cada rota daqui tem do outro lado uma página que existe (ou um parâmetro que a página LÊ).
 * Se um dos dois mudar sem o outro, `training-links.test.ts` quebra.
 *
 * ⚠️ Duas armadilhas registradas, no espírito do `?aba=despensa` da Dieta:
 *  • o catálogo de exercícios **não** abre um exercício por query — o registro individual é a
 *    rota `/treinos/exercicios/{id}`;
 *  • medidas corporais dentro de Treinos vivem em `/treinos/evolucao` (aba Corpo), não numa
 *    rota `/treinos/medidas`, que não existe e daria 404.
 */

export const TRAINING_LINK_BASE = "/treinos";

/** Exercício do catálogo — a rota do registro é o detalhe/histórico dele. */
export const exerciseLink = (id: string) => `${TRAINING_LINK_BASE}/exercicios/${id}`;

/** Treino-modelo aberto no construtor. */
export const workoutLink = (id: string) => `${TRAINING_LINK_BASE}/treinos/${id}`;

/** Programa destacado na lista de programas. */
export const programLink = (id: string) => `${TRAINING_LINK_BASE}/programas?programa=${id}`;

/** Sessão registrada (histórico imutável). */
export const sessionLink = (id: string) => `${TRAINING_LINK_BASE}/historico/${id}`;

/** Meta destacada na lista de metas. */
export const goalLink = (id: string) => `${TRAINING_LINK_BASE}/metas?meta=${id}`;

/** Recorde destacado na lista de recordes. */
export const recordLink = (id: string) => `${TRAINING_LINK_BASE}/recordes?recorde=${id}`;

/** Treino de hoje (o que está planejado agora). */
export const todayLink = () => `${TRAINING_LINK_BASE}/hoje`;

/** A sessão em execução — a tela que recupera o treino interrompido. */
export const liveSessionLink = () => `${TRAINING_LINK_BASE}/sessao`;

/** Calendário do planejamento num dia específico (data pura 'yyyy-MM-dd'). */
export const scheduleLink = (date: string) =>
  `${TRAINING_LINK_BASE}/calendario?visao=semana&data=${date}`;

/**
 * Evolução — desempenho e corpo lado a lado.
 * As MEDIDAS CORPORAIS são o módulo central `body_*` (16-E): a mesma informação também aparece
 * em `/nutricao/medidas`. Não há duas telas de peso, há duas portas para a mesma tabela.
 */
export const evolutionLink = () => `${TRAINING_LINK_BASE}/evolucao`;

/** Relatórios do módulo. */
export const trainingReportsLink = () => `${TRAINING_LINK_BASE}/relatorios`;