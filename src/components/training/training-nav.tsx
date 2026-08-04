"use client";

/**
 * Fase 17-A — Treinos · Navegação interna do módulo.
 *
 * Mesmo padrão do TO-DO (Fase 15) e da Dieta (Fase 16): coluna fixa no desktop, gaveta no
 * celular. São 13 submódulos, então a navegação é agrupada por finalidade em vez de virar
 * uma lista longa de rolar.
 *
 * Seções ainda não implementadas aparecem com a subfase em que chegam — o link funciona e
 * abre uma tela honesta que diz o que vem, em vez de sumir do menu ou fingir que funciona.
 */
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TRAINING_SECTIONS, type TrainingSection } from "@/lib/training/constants";

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
const GROUPS: { title: string; slugs: string[] }[] = [
  { title: "Treinar", slugs: ["visao-geral", "hoje", "sessao", "calendario"] },
  { title: "Montar", slugs: ["exercicios", "treinos", "programas"] },
  { title: "Acompanhar", slugs: ["historico", "recordes", "evolucao", "metas", "relatorios"] },
  { title: "Ajustes", slugs: ["configuracoes"] },
];

const sectionBySlug = new Map(TRAINING_SECTIONS.map((section) => [section.slug, section]));

function isActive(pathname: string, section: TrainingSection): boolean {
  if (section.href === "/treinos") return pathname === "/treinos";
  return pathname === section.href || pathname.startsWith(`${section.href}/`);
}

function NavLink({
  section,
  pathname,
  onNavigate,
}: {
  section: TrainingSection;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = ICONS[section.icon] ?? Dumbbell;
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
    <nav aria-label="Seções de Treinos" className="space-y-5">
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
export function TrainingNav() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      <NavContent pathname={pathname} />
    </aside>
  );
}

/** Mesma navegação em gaveta — celular e tablet. */
export function TrainingNavDrawer({
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
          <SheetTitle className="text-base">Treinos</SheetTitle>
        </SheetHeader>
        <div className="px-2 pb-6">
          <NavContent pathname={pathname} onNavigate={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Tela de seção ainda não implementada. Diz exatamente o que vem e em qual subfase — o
 * usuário nunca fica adivinhando se está quebrado ou se ainda não existe.
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
