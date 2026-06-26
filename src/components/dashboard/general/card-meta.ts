/**
 * Fase 12 — Ícone e link de "ver módulo" de cada card do Dashboard Geral.
 * Mantido à parte de cards.ts (lógica pura/type-only) por carregar ícones de UI.
 */
import {
  Bell,
  CalendarClock,
  GraduationCap,
  ListChecks,
  ReceiptText,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { DashCardId } from "@/lib/dashboard/cards";

export const DASH_CARD_ICONS: Record<DashCardId, LucideIcon> = {
  financeiro: Wallet,
  faturas: ReceiptText,
  agenda: CalendarClock,
  tarefas: ListChecks,
  habitos: Target,
  estudos: GraduationCap,
  notificacoes: Bell,
};

/** Para onde o link "Ver" de cada card aponta. */
export const DASH_CARD_HREF: Record<DashCardId, string> = {
  financeiro: "/dashboard/financeiro",
  faturas: "/faturas",
  agenda: "/agenda",
  tarefas: "/tarefas",
  habitos: "/habitos",
  estudos: "/estudos",
  notificacoes: "/configuracoes",
};
