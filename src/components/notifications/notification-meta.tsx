/**
 * Fase 13 — Metadados de apresentação das notificações (ícone por tipo + formatação
 * de data/hora pt-BR). Server-safe (sem estado, sem Date.now()).
 */
import {
  AlarmClock,
  Apple,
  Bell,
  CalendarClock,
  CalendarRange,
  CalendarCheck,
  CreditCard,
  Droplets,
  Dumbbell,
  GraduationCap,
  HandCoins,
  Layers,
  ListChecks,
  ListTodo,
  Ruler,
  ReceiptText,
  ShoppingCart,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import type { NotificationType } from "@/lib/notifications/constants";
import { TIMEZONE } from "@/lib/format";

/** Ícone lucide por tipo de notificação (com fallback genérico). */
const ICONS: Record<NotificationType, LucideIcon> = {
  invoice_due: ReceiptText,
  invoice_overdue: ReceiptText,
  bill_due: AlarmClock,
  bill_overdue: AlarmClock,
  receivable_pending: HandCoins,
  task_overdue: ListChecks,
  task_today: ListChecks,
  event_upcoming: CalendarClock,
  habit_pending: Target,
  water_goal: Droplets,
  study_overdue: GraduationCap,
  card_limit: CreditCard,
  high_spending: TrendingUp,
  // Fase 15 — TO-DO.
  todo_overdue: ListTodo,
  todo_today: ListTodo,
  todo_deadline: AlarmClock,
  todo_reminder: Bell,
  // Fase 16-F — Dieta e Alimentação.
  nutrition_meal_upcoming: UtensilsCrossed,
  nutrition_meal_missing: UtensilsCrossed,
  nutrition_plan_week: CalendarRange,
  nutrition_shopping_pending: ShoppingCart,
  nutrition_pantry_expiring: Apple,
  nutrition_measurement_due: Ruler,
  nutrition_goal_close: Target,
  nutrition_food_review: Apple,
  // Fase 17-F — Treinos.
  training_planned_today: CalendarCheck,
  training_session_soon: AlarmClock,
  training_planned_missed: CalendarRange,
  training_session_open: Timer,
  training_record: Trophy,
  training_goal_reached: Target,
  training_goal_progress: Dumbbell,
  training_goal_deadline: AlarmClock,
  training_program_ending: Layers,
};

export function notificationIcon(type: string): LucideIcon {
  return ICONS[type as NotificationType] ?? Bell;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: TIMEZONE,
});

/** "26/06 14:30" (hora de Brasília) a partir de um timestamptz ISO. */
export function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return dateTimeFormatter.format(d);
}
