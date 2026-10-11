/**
 * Fase 16-A — Dieta e Alimentação · Navegação interna do módulo.
 *
 * REDESIGN-02-E: o desenho da coluna, da gaveta e do item ativo saiu daqui e foi para
 * `@/components/shared/module-shell`, que é o mesmo dos outros dois módulos. O que fica
 * neste arquivo é o que é DA DIETA: quais seções, em que ordem, sob que agrupamento e com
 * que ícone. Nada aqui decide como a navegação se parece.
 */
import {
  Apple,
  BarChart3,
  CalendarRange,
  ChefHat,
  LayoutDashboard,
  NotebookPen,
  Repeat,
  Ruler,
  Settings,
  ShoppingCart,
  Target,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { NavegacaoDeModulo } from "@/components/shared/module-shell";
import { NUTRITION_SECTIONS } from "@/lib/nutrition/constants";

const ICONS: Record<string, LucideIcon> = {
  "layout-dashboard": LayoutDashboard,
  apple: Apple,
  "notebook-pen": NotebookPen,
  "calendar-range": CalendarRange,
  target: Target,
  utensils: Utensils,
  "chef-hat": ChefHat,
  repeat: Repeat,
  "shopping-cart": ShoppingCart,
  ruler: Ruler,
  "bar-chart-3": BarChart3,
  settings: Settings,
};

/** Agrupamento por finalidade — 12 itens numa lista corrida seria difícil de varrer. */
const GRUPOS: { titulo: string; slugs: string[] }[] = [
  { titulo: "Acompanhar", slugs: ["visao-geral", "diario", "planejamento", "metas"] },
  { titulo: "Catálogo", slugs: ["alimentos", "receitas", "refeicoes", "substituicoes"] },
  { titulo: "Apoio", slugs: ["compras", "medidas", "relatorios", "configuracoes"] },
];

const sectionBySlug = new Map(NUTRITION_SECTIONS.map((section) => [section.slug, section]));

/**
 * A navegação da Dieta, no formato que a casca compartilhada consome.
 *
 * ⚠️ Todo slug de `NUTRITION_SECTIONS` precisa aparecer em algum grupo: o que ficar de fora
 * some da coluna E deixa de participar da decisão de item ativo. `module-shell.test.ts`
 * fica vermelho se isso acontecer.
 */
export const NAV_DA_DIETA: NavegacaoDeModulo = {
  nome: "Dieta e Alimentação",
  grupos: GRUPOS.map((grupo) => ({
    titulo: grupo.titulo,
    itens: grupo.slugs.flatMap((slug) => {
      const section = sectionBySlug.get(slug);
      if (!section) return [];
      return [{ href: section.href, title: section.title, icon: ICONS[section.icon] ?? Apple }];
    }),
  })),
};
