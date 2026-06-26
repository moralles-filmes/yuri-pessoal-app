/**
 * Fase 13 — Ícone por tipo de resultado da busca global (client-safe).
 */
import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  CreditCard,
  GraduationCap,
  ListChecks,
  ReceiptText,
  Repeat,
  Search,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { SearchType } from "@/lib/search/types";

const ICONS: Record<SearchType, LucideIcon> = {
  transacao: ArrowLeftRight,
  cartao: CreditCard,
  fatura: ReceiptText,
  pessoa: Users,
  conta: Wallet,
  tarefa: ListChecks,
  rotina: Repeat,
  habito: Target,
  estudo: GraduationCap,
  evento: CalendarDays,
  notificacao: Bell,
};

export function searchIcon(type: SearchType): LucideIcon {
  return ICONS[type] ?? Search;
}
