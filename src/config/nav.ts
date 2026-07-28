import {
  LayoutDashboard,
  LineChart,
  Wallet,
  CreditCard,
  ReceiptText,
  Layers,
  HandCoins,
  FileUp,
  CalendarDays,
  ListChecks,
  ListTodo,
  Repeat,
  Target,
  GraduationCap,
  Bell,
  BarChart3,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Fase do roadmap em que o módulo é implementado (usado nos placeholders). */
  phase?: string;
};

export type NavSection = {
  title: string;
  items: NavItem[];
};

/** Navegação principal da Sidebar, agrupada por área. */
export const navSections: NavSection[] = [
  {
    title: "Geral",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard, phase: "Fase 12" },
      { title: "Relatórios", href: "/relatorios", icon: BarChart3, phase: "Fase 14" },
      { title: "Notificações", href: "/notificacoes", icon: Bell, phase: "Fase 13" },
    ],
  },
  {
    title: "Financeiro",
    items: [
      { title: "Painel financeiro", href: "/dashboard/financeiro", icon: LineChart, phase: "Fase 07" },
      { title: "Financeiro", href: "/financeiro", icon: Wallet, phase: "Fase 02" },
      { title: "Cartões", href: "/cartoes", icon: CreditCard, phase: "Fase 03" },
      { title: "Faturas", href: "/faturas", icon: ReceiptText, phase: "Fase 03" },
      { title: "Parcelamentos", href: "/parcelamentos", icon: Layers, phase: "Fase 04" },
      { title: "A Receber", href: "/terceiros", icon: HandCoins, phase: "Fase 05" },
      { title: "Importar", href: "/importar", icon: FileUp, phase: "Fase 06" },
    ],
  },
  {
    title: "Organização",
    items: [
      // TO-DO é o gerenciador principal de execução (Fase 15). "Tarefas" (Fase 09)
      // continua disponível como módulo legado, ligado às rotinas e à agenda.
      { title: "TO-DO", href: "/todo", icon: ListTodo, phase: "Fase 15" },
      { title: "Agenda", href: "/agenda", icon: CalendarDays, phase: "Fase 08" },
      { title: "Tarefas", href: "/tarefas", icon: ListChecks, phase: "Fase 09" },
      { title: "Rotinas", href: "/rotinas", icon: Repeat, phase: "Fase 09" },
      { title: "Hábitos", href: "/habitos", icon: Target, phase: "Fase 10" },
      { title: "Estudos", href: "/estudos", icon: GraduationCap, phase: "Fase 11" },
    ],
  },
  {
    title: "Sistema",
    items: [{ title: "Configurações", href: "/configuracoes", icon: Settings, phase: "Fase 14" }],
  },
];

/** Lista plana de todos os itens de navegação. */
export const allNavItems: NavItem[] = navSections.flatMap((section) => section.items);

/** Encontra o item de navegação cujo href casa com o pathname atual. */
export function findNavItem(pathname: string): NavItem | undefined {
  return allNavItems
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
}
