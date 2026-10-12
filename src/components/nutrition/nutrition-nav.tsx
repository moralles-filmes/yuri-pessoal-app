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
import { Badge } from "@/components/ui/badge";
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

/**
 * Tela de seção ainda não implementada. Diz exatamente o que vem e em qual subfase —
 * o usuário nunca fica adivinhando se está quebrado ou se ainda não existe.
 *
 * ⚠️ REDESIGN-02-E: hoje as 12 seções estão `pronto` e este componente não tem chamador.
 * Ele ficou de pé porque removê-lo é limpeza de módulo (REDESIGN-07), não unificação de
 * navegação — mas saiba que ele não é exercitado por tela nenhuma.
 */
export function NutritionSectionPlaceholder({ slug }: { slug: string }) {
  const section = sectionBySlug.get(slug);
  if (!section) return null;
  const Icon = ICONS[section.icon] ?? Apple;

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center rounded-xl border border-dashed p-8 text-center">
      <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
        <Icon className="size-6" />
      </div>
      <h2 className="mt-4 text-lg font-semibold tracking-tight">{section.title}</h2>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{section.description}</p>
      <Badge variant="secondary" className="mt-4 gap-1.5">
        <span className="size-1.5 rounded-full bg-primary" />
        {section.phase}
      </Badge>
      <p className="mt-4 max-w-md text-xs text-muted-foreground">
        Esta seção ainda não foi construída. O catálogo de alimentos e o núcleo de cálculo já
        estão prontos e são a base dela.
      </p>
    </div>
  );
}
