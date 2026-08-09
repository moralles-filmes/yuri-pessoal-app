/**
 * Fase 12 — Ícone e link de "ver módulo" de cada card do Dashboard Geral.
 * Mantido à parte de cards.ts (lógica pura/type-only) por carregar ícones de UI.
 */
import {
  Bell,
  CalendarClock,
  Dumbbell,
  GraduationCap,
  Lightbulb,
  ListChecks,
  ListTodo,
  ReceiptText,
  Target,
  UtensilsCrossed,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { DashCardId } from "@/lib/dashboard/cards";

export const DASH_CARD_ICONS: Record<DashCardId, LucideIcon> = {
  financeiro: Wallet,
  todo: ListTodo,
  faturas: ReceiptText,
  agenda: CalendarClock,
  dieta: UtensilsCrossed,
  tarefas: ListChecks,
  habitos: Target,
  estudos: GraduationCap,
  notificacoes: Bell,
  treinos: Dumbbell,
  insights: Lightbulb,
};

/** Para onde o link "Ver" de cada card aponta. */
export const DASH_CARD_HREF: Record<DashCardId, string> = {
  financeiro: "/dashboard/financeiro",
  todo: "/todo",
  faturas: "/faturas",
  agenda: "/agenda",
  dieta: "/nutricao",
  tarefas: "/tarefas",
  habitos: "/habitos",
  estudos: "/estudos",
  notificacoes: "/configuracoes",
  treinos: "/treinos",
  // ⛔ O link vai para a TELA de insights, que é onde se gera. O card em si não gera nada.
  insights: "/ia/insights",
};
