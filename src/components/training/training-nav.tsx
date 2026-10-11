/**
 * Fase 17-A — Treinos · Navegação interna do módulo.
 *
 * REDESIGN-02-E: o desenho da coluna, da gaveta e do item ativo saiu daqui e foi para
 * `@/components/shared/module-shell`, que é o mesmo dos outros dois módulos. O que fica
 * neste arquivo é o que é DE TREINOS: quais seções, em que ordem, sob que agrupamento e
 * com que ícone. Nada aqui decide como a navegação se parece.
 */
import {
  BarChart3,
  CalendarCheck,
  CalendarRange,
  ClipboardList,
  Dumbbell,
  History,
  Layers,
  LayoutDashboard,
  Settings,
  Target,
  Timer,
  TrendingUp,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import type { NavegacaoDeModulo } from "@/components/shared/module-shell";
import { TRAINING_SECTIONS } from "@/lib/training/constants";

const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  dumbbell: Dumbbell,
  settings: Settings,
  "calendar-check": CalendarCheck,
  "clipboard-list": ClipboardList,
  layers: Layers,
  "calendar-range": CalendarRange,
  timer: Timer,
  history: History,
  trophy: Trophy,
  "trending-up": TrendingUp,
  target: Target,
  "bar-chart-3": BarChart3,
};

/** Agrupamento por finalidade — 13 itens numa lista corrida seria difícil de varrer. */
const GRUPOS: { titulo: string; slugs: string[] }[] = [
  { titulo: "Treinar", slugs: ["visao-geral", "hoje", "sessao", "calendario"] },
  { titulo: "Montar", slugs: ["exercicios", "treinos", "programas"] },
  { titulo: "Acompanhar", slugs: ["historico", "recordes", "evolucao", "metas", "relatorios"] },
  { titulo: "Ajustes", slugs: ["configuracoes"] },
];

const sectionBySlug = new Map(TRAINING_SECTIONS.map((section) => [section.slug, section]));

/**
 * A navegação de Treinos, no formato que a casca compartilhada consome.
 *
 * ⚠️ Todo slug de `TRAINING_SECTIONS` precisa aparecer em algum grupo: o que ficar de fora
 * some da coluna E deixa de participar da decisão de item ativo. `module-shell.test.ts`
 * fica vermelho se isso acontecer.
 */
export const NAV_DE_TREINOS: NavegacaoDeModulo = {
  nome: "Treinos",
  grupos: GRUPOS.map((grupo) => ({
    titulo: grupo.titulo,
    itens: grupo.slugs.flatMap((slug) => {
      const section = sectionBySlug.get(slug);
      if (!section) return [];
      return [
        { href: section.href, title: section.title, icon: ICONS[section.icon] ?? Dumbbell },
      ];
    }),
  })),
};
