/**
 * Fase 13 — Tipos da Busca Global. Shape unificado dos resultados (qualquer módulo)
 * + rótulos por tipo. Módulo PURO (sem React).
 */

export const SEARCH_TYPES = [
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
  "notificacao",
] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

/** Rótulo pt-BR (plural) de cada grupo de resultado. */
export const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  transacao: "Transações",
  cartao: "Cartões",
  fatura: "Faturas",
  pessoa: "Pessoas",
  conta: "Contas",
  tarefa: "Tarefas",
  rotina: "Rotinas",
  habito: "Hábitos",
  estudo: "Estudos",
  evento: "Agenda",
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
