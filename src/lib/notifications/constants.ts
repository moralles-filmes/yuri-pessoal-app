/**
 * Fase 13 — Fonte única dos enums de Notificações.
 * Módulo PURO (sem React): alimenta os tipos TS, os schemas Zod, o gerador de alertas
 * (Cron) e os rótulos pt-BR da UI. Os valores de `priority` casam com o CHECK da migration.
 */

/** Prioridade de uma notificação (casa com o CHECK de notifications.priority). */
export const NOTIFICATION_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type NotificationPriority = (typeof NOTIFICATION_PRIORITIES)[number];

export const NOTIFICATION_PRIORITY_LABELS: Record<NotificationPriority, string> = {
  low: "Baixa",
  medium: "Média",
  high: "Alta",
  urgent: "Urgente",
};

/** Ordem de severidade (para ordenar/destacar). Maior = mais urgente. */
export const NOTIFICATION_PRIORITY_RANK: Record<NotificationPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  urgent: 3,
};

/** Classes Tailwind do badge de prioridade (legíveis em dark/light). */
export const NOTIFICATION_PRIORITY_BADGE: Record<NotificationPriority, string> = {
  low: "border-transparent bg-muted text-muted-foreground",
  medium: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300",
  high: "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-300",
  urgent: "border-transparent bg-destructive/15 text-destructive",
};

/**
 * Tipos de notificação. Strings livres no banco (type text), mas centralizadas aqui
 * para rótulos/ícones. O gerador (Cron) só emite estes; a UI degrada para um rótulo
 * genérico se vier um tipo desconhecido (fases futuras).
 */
export const NOTIFICATION_TYPES = [
  "invoice_due",
  "invoice_overdue",
  "bill_due",
  "bill_overdue",
  "receivable_pending",
  "task_overdue",
  "task_today",
  "event_upcoming",
  "habit_pending",
  "water_goal",
  "study_overdue",
  "card_limit",
  "high_spending",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {
  invoice_due: "Fatura a vencer",
  invoice_overdue: "Fatura atrasada",
  bill_due: "Conta a vencer",
  bill_overdue: "Conta vencida",
  receivable_pending: "A receber",
  task_overdue: "Tarefa atrasada",
  task_today: "Tarefa de hoje",
  event_upcoming: "Compromisso próximo",
  habit_pending: "Hábito pendente",
  water_goal: "Meta de água",
  study_overdue: "Estudo atrasado",
  card_limit: "Limite do cartão",
  high_spending: "Gasto alto",
};

/** Rótulo amigável de um tipo (com fallback para tipos desconhecidos). */
export function notificationTypeLabel(type: string): string {
  return (NOTIFICATION_TYPE_LABELS as Record<string, string>)[type] ?? "Notificação";
}

/** Filtro "todas" usado na página /notificacoes. */
export const NOTIFICATION_STATUS_FILTERS = [
  "todas",
  "nao_lidas",
  "lidas",
  "resolvidas",
] as const;
export type NotificationStatusFilter = (typeof NOTIFICATION_STATUS_FILTERS)[number];

export const NOTIFICATION_STATUS_FILTER_LABELS: Record<
  NotificationStatusFilter,
  string
> = {
  todas: "Todas",
  nao_lidas: "Não lidas",
  lidas: "Lidas",
  resolvidas: "Resolvidas",
};
