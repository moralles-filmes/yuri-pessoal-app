/**
 * Fase 13 — Ícone por tipo de resultado da busca global (client-safe).
 */
import {
  ArrowLeftRight,
  Bell,
  CalendarDays,
  CreditCard,
  GraduationCap,
  FolderOpen,
  ListChecks,
  ListTodo,
  ReceiptText,
  Repeat,
  Search,
  Tag,
  Target,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { SearchType } from "@/lib/search/types";

const ICONS: Record<SearchType, LucideIcon> = {
  todo_tarefa: ListTodo,
  todo_projeto: FolderOpen,
  todo_etiqueta: Tag,
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
