"use client";

/**
 * Fase 16-A — Dieta e Alimentação · Navegação interna do módulo.
 *
 * Mesmo padrão do TO-DO (Fase 15): coluna fixa no desktop, gaveta no celular. O módulo tem
 * 12 submódulos, então a navegação é agrupada por finalidade em vez de virar uma lista longa.
 *
 * Seções ainda não implementadas aparecem com a subfase em que chegam — o link funciona e
 * abre uma tela honesta que diz o que vem, em vez de sumir do menu ou fingir que funciona.
 */
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { NUTRITION_SECTIONS, type NutritionSection } from "@/lib/nutrition/constants";

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
const GROUPS: { title: string; slugs: string[] }[] = [
  { title: "Acompanhar", slugs: ["visao-geral", "diario", "planejamento", "metas"] },
  { title: "Catálogo", slugs: ["alimentos", "receitas", "refeicoes", "substituicoes"] },
  { title: "Apoio", slugs: ["compras", "medidas", "relatorios", "configuracoes"] },
];

const sectionBySlug = new Map(NUTRITION_SECTIONS.map((section) => [section.slug, section]));

function isActive(pathname: string, section: NutritionSection): boolean {
  if (section.href === "/nutricao") return pathname === "/nutricao";
  return pathname === section.href || pathname.startsWith(`${section.href}/`);
}

function NavLink({
  section,
  pathname,
  onNavigate,
}: {
  section: NutritionSection;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[section.icon] ?? Apple;
  const active = isActive(pathname, section);

  return (
    <Link
      href={section.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary/10 font-medium text-foreground ring-1 ring-primary/20"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active && "text-primary")} />
      <span className="min-w-0 flex-1 truncate">{section.title}</span>
      {section.status !== "pronto" && (
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            section.status === "proxima"
              ? "bg-primary/15 text-primary"
              : "bg-muted text-muted-foreground",
          )}
          // O texto visível é curto; o leitor de tela recebe a frase inteira.
          aria-label={
            section.status === "proxima"
              ? "Chega na próxima subfase"
              : "Planejado para uma subfase futura"
          }
        >
          {section.status === "proxima" ? "Em breve" : "Planejado"}
        </span>
      )}
    </Link>
  );
}

function NavContent({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Seções de Dieta e Alimentação" className="space-y-5">
      {GROUPS.map((group) => (
        <div key={group.title} className="space-y-1">
          <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {group.title}
          </p>
          {group.slugs.map((slug) => {
            const section = sectionBySlug.get(slug);
            if (!section) return null;
            return (
              <NavLink
                key={slug}
                section={section}
                pathname={pathname}
                onNavigate={onNavigate}
              />
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Coluna fixa (desktop). */
export function NutritionNav() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <NavContent pathname={pathname} />
    </aside>
  );
}

/** Mesma navegação em gaveta — celular e tablet. */
export function NutritionNavDrawer({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const pathname = usePathname();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[17rem] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">Dieta e Alimentação</SheetTitle>
        </SheetHeader>
        <div className="px-2 pb-6">
          <NavContent pathname={pathname} onNavigate={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Tela de seção ainda não implementada. Diz exatamente o que vem e em qual subfase —
 * o usuário nunca fica adivinhando se está quebrado ou se ainda não existe.
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
