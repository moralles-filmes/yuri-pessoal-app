/**
 * Fase 13 — Tipos da Busca Global. Shape unificado dos resultados (qualquer módulo)
 * + rótulos por tipo. Módulo PURO (sem React).
 */

export const SEARCH_TYPES = [
  // TO-DO (Fase 15) vem primeiro: é o módulo de execução do dia a dia.
  "todo_tarefa",
  "todo_projeto",
  "todo_etiqueta",
  "transacao",
  "cartao",
  "fatura",
  "pessoa",
  "conta",
  "tarefa",
  "rotina",
  "habito",
  "estudo",
  "evento",
  // Fase 16-F — módulo Dieta e Alimentação.
  "nutricao_alimento",
  "nutricao_receita",
  "nutricao_modelo",
  "nutricao_plano",
  "nutricao_lista",
  // Fase 17-F — módulo Treinos. As 6 entidades que o usuário procura pelo nome.
  "treino_exercicio",
  "treino_treino",
  "treino_programa",
  "treino_sessao",
  "treino_meta",
  "treino_recorde",
  "notificacao",
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** Rótulo pt-BR (plural) de cada grupo de resultado. */
export const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  todo_tarefa: "TO-DO · Tarefas",
  todo_projeto: "TO-DO · Projetos",
  todo_etiqueta: "TO-DO · Etiquetas",
  transacao: "Transações",
  cartao: "Cartões",
  fatura: "Faturas",
  pessoa: "Pessoas",
  conta: "Contas",
  tarefa: "Tarefas (Fase 09)",
  rotina: "Rotinas",
  habito: "Hábitos",
  estudo: "Estudos",
  evento: "Agenda",
  nutricao_alimento: "Dieta · Alimentos",
  nutricao_receita: "Dieta · Receitas",
  nutricao_modelo: "Dieta · Refeições-modelo",
  nutricao_plano: "Dieta · Modelos de semana",
  nutricao_lista: "Dieta · Listas de compras",
  treino_exercicio: "Treinos · Exercícios",
  treino_treino: "Treinos · Treinos",
  treino_programa: "Treinos · Programas",
  treino_sessao: "Treinos · Sessões",
  treino_meta: "Treinos · Metas",
  treino_recorde: "Treinos · Recordes",
  notificacao: "Notificações",
};

/** Um resultado unificado de busca. */
export type SearchResult = {
  type: SearchType;
  id: string;
  title: string;
  subtitle?: string | null;
  /** Rota interna para abrir o item. */
  link: string;
};

/** Resultados agrupados por tipo (ordem estável = ordem de SEARCH_TYPES). */
export type SearchGroup = {
  type: SearchType;
  label: string;
  results: SearchResult[];
};
