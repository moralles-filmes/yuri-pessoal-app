/**
 * Fase 13 — Ícone por tipo de resultado da busca global (client-safe).
 */
import {
  Apple,
  ArrowLeftRight,
  Bell,
  CalendarDays,
  CalendarRange,
  ChefHat,
  CreditCard,
  GraduationCap,
  FolderOpen,
  ListChecks,
  ListTodo,
  ReceiptText,
  Repeat,
  Search,
  ShoppingCart,
  Tag,
  Target,
  Users,
  UtensilsCrossed,
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
  // Fase 16-F — Dieta e Alimentação.
  nutricao_alimento: Apple,
  nutricao_receita: ChefHat,
  nutricao_modelo: UtensilsCrossed,
  nutricao_plano: CalendarRange,
  nutricao_lista: ShoppingCart,
  notificacao: Bell,
};

export function searchIcon(type: SearchType): LucideIcon {
  return ICONS[type] ?? Search;
}
