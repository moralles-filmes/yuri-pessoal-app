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
import { Badge } from "@/components/ui/badge";
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

/**
 * Tela de seção ainda não implementada. Diz exatamente o que vem e em qual subfase — o
 * usuário nunca fica adivinhando se está quebrado ou se ainda não existe.
 *
 * ⚠️ REDESIGN-02-E: hoje as 13 seções estão `pronto` e este componente não tem chamador.
 * Ele ficou de pé porque removê-lo é limpeza de módulo (REDESIGN-07), não unificação de
 * navegação — mas saiba que ele não é exercitado por tela nenhuma.
 */
export function TrainingSectionPlaceholder({ slug }: { slug: string }) {
  const section = sectionBySlug.get(slug);
  if (!section) return null;
  const Icon = ICONS[section.icon] ?? Dumbbell;

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
        Esta seção ainda não foi construída. O catálogo de exercícios, os treinos-modelo, os
        programas e o planejamento semanal já estão prontos e são a base dela.
      </p>
    </div>
  );
}
