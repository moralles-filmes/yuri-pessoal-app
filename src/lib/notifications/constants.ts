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
  // Fase 15 — módulo TO-DO.
  "todo_overdue",
  "todo_today",
  "todo_deadline",
  "todo_reminder",
  // Fase 16-F — módulo Dieta e Alimentação.
  "nutrition_meal_upcoming",
  "nutrition_meal_missing",
  "nutrition_plan_week",
  "nutrition_shopping_pending",
  "nutrition_pantry_expiring",
  "nutrition_measurement_due",
  "nutrition_goal_close",
  "nutrition_food_review",
  // Fase 17-F — módulo Treinos.
  "training_planned_today",
  "training_session_soon",
  "training_planned_missed",
  "training_session_open",
  "training_record",
  "training_goal_reached",
  "training_goal_progress",
  "training_goal_deadline",
  "training_program_ending",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Fase 16-F — tipos que nascem DESLIGADOS (opt-in explícito).
 *
 * A regra geral do sistema é "ausente = ligado" (`notificationEnabled`), porque um alerta de
 * fatura atrasada tem de existir sem configuração prévia. Mas acompanhar o quanto falta para a
 * meta do dia é outra coisa: no módulo que trata de comida e corpo, um aviso não pedido sobre
 * o quanto a pessoa ainda "pode" comer pode ser lido como cobrança. Quem quiser, liga.
 */
export const NOTIFICATION_OPT_IN_TYPES: NotificationType[] = [
  "nutrition_goal_close",
  // Fase 17-F — acompanhar o quanto falta para a meta da semana é útil para quem PEDE, e vira
  // cobrança para quem não pediu. Mesma decisão da meta do dia na Dieta, mesmo motivo.
  "training_goal_progress",
];

/** True se o tipo só existe quando o usuário liga explicitamente. */
export function isOptInNotification(type: string): boolean {
  return (NOTIFICATION_OPT_IN_TYPES as string[]).includes(type);
}

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
  todo_overdue: "TO-DO atrasado",
  todo_today: "TO-DO de hoje",
  todo_deadline: "Prazo próximo",
  todo_reminder: "Lembrete de tarefa",
  nutrition_meal_upcoming: "Próxima refeição",
  nutrition_meal_missing: "Refeição sem registro",
  nutrition_plan_week: "Planejamento da semana",
  nutrition_shopping_pending: "Lista de compras pendente",
  nutrition_pantry_expiring: "Validade na despensa",
  nutrition_measurement_due: "Medida pendente",
  nutrition_goal_close: "Meta do dia por perto",
  nutrition_food_review: "Alimento a revisar",
  training_planned_today: "Treino de hoje",
  training_session_soon: "Horário do treino",
  training_planned_missed: "Treino em aberto",
  training_session_open: "Sessão em execução",
  training_record: "Nova marca pessoal",
  training_goal_reached: "Meta de treino atingida",
  training_goal_progress: "Meta de treino em andamento",
  training_goal_deadline: "Prazo da meta de treino",
  training_program_ending: "Programa perto do fim",
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
