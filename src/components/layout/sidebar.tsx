"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Logo } from "@/components/shared/logo";
import { NavLinks } from "./nav-links";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * Sidebar do desktop — recolhível (ícones) e expansível. Oculta no mobile
 * (a navegação mobile é o drawer em `MobileNav`).
 */
export function Sidebar({
  collapsed,
  onToggleCollapse,
  hidden = false,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Escondida por completo (toggle no Header). Diferente de `collapsed`, que vira faixa. */
  hidden?: boolean;
}) {
  return (
    <aside
      // Escondida: `w-0` + `overflow-hidden` + `p-0` em vez de desmontar, para a largura animar
      // junto com o conteúdo (o padding conta na largura mesmo com `w-0`, por isso ele zera).
      // `aria-hidden` + `inert` tiram do foco e do leitor de tela, senão os links continuariam
      // tabuláveis dentro de uma coluna de largura zero.
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col transition-[width,padding] duration-300 ease-in-out motion-reduce:transition-none lg:flex",
        hidden
          ? "w-0 overflow-hidden p-0"
          : collapsed
            ? "w-[4.75rem] py-3 pl-3"
            : "w-64 py-3 pl-3",
      )}
    >
      {/* A coluna é transparente; quem tem material é este painel, flutuando à esquerda.
          `data-casca` é o marcador que a Task 3 usa para alinhar o resto da casca. */}
      <div
        data-casca
        className="vidro-casca flex h-full min-h-0 flex-col overflow-hidden rounded-[28px]"
      >
        <div
          className={cn(
            "flex h-14 shrink-0 items-center",
            collapsed ? "justify-center px-2" : "px-3",
          )}
        >
          <Logo collapsed={collapsed} />
        </div>

        {/* `min-h-0` é obrigatório: sem ele o item flex não encolhe abaixo do
            conteúdo (min-height:auto), a ScrollArea cresce até a altura da lista
            e o scroll nunca ativa — o menu fica "travado". */}
        <ScrollArea className="min-h-0 flex-1">
          <div className={cn("py-3", collapsed ? "px-2" : "px-3")}>
            <NavLinks collapsed={collapsed} />
          </div>
        </ScrollArea>

        <div className="shrink-0 p-2">
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            onClick={onToggleCollapse}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={cn(
              "text-muted-foreground hover:text-foreground",
              collapsed ? "w-full" : "w-full justify-start gap-3",
            )}
          >
            {collapsed ? (
              <PanelLeftOpen className="size-[18px]" />
            ) : (
              <>
                <PanelLeftClose className="size-[18px]" />
                <span className="text-sm">Recolher</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}
