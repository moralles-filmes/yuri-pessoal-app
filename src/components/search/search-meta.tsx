/**
 * Fase 13 — Ícone por tipo de resultado da busca global (client-safe).
 */
import {
  Apple,
  ArrowLeftRight,
  Bell,
  Brain,
  CalendarDays,
  CalendarRange,
  ChefHat,
  ClipboardList,
  CreditCard,
  Dumbbell,
  GraduationCap,
  FolderOpen,
  History,
  Layers,
  ListChecks,
  ListTodo,
  MessagesSquare,
  ReceiptText,
  Repeat,
  Search,
  ShoppingCart,
  Sparkles,
  Tag,
  Target,
  Trophy,
  Users,
  UtensilsCrossed,
  Wallet,
  Wand2,
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
  // Fase 17-F — Treinos.
  treino_exercicio: Dumbbell,
  treino_treino: ClipboardList,
  treino_programa: Layers,
  treino_sessao: History,
  treino_meta: Target,
  treino_recorde: Trophy,
  // Fase 18-F — Inteligência Artificial.
  ia_conversa: MessagesSquare,
  ia_insight: Sparkles,
  ia_acao: Wand2,
  ia_memoria: Brain,
  notificacao: Bell,
};

export function searchIcon(type: SearchType): LucideIcon {
  return ICONS[type] ?? Search;
}
