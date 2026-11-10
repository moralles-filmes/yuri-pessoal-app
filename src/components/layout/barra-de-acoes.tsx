"use client";

import * as React from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PRESSAO } from "@/components/ui/materiais";
import { cn } from "@/lib/utils";
import {
  EVENTO_ABRIR_BUSCA,
  EVENTO_ABRIR_LANCAMENTO,
  pedirAcaoDaCasca,
} from "./acoes-da-casca";

/**
 * REDESIGN-09-G — a barra de ações do celular: Buscar, Novo lançamento e (como filho) o botão do
 * assistente, no pé da tela.
 *
 * ⛔ Mora na casca: não importe `@/lib/ai/constants`, `@/lib/validators/*`, `chat-client`,
 * `ui/sheet` nem `ui/dropdown-menu` (invariante 91).
 *
 * ⛔ O contêiner NÃO pode ter `transform`, `filter` nem `backdrop-filter` (nem `vidro-*`): em `lg`
 * ele vira `display: contents` e o `fixed` do botão do assistente passaria a ter o contêiner como
 * bloco de contenção. E `pointer-events: none` é HERDADO mesmo com `contents` — por isso cada
 * botão leva `pointer-events-auto`.
 *
 * A altura da barra (`calc(52px + 1.25rem)` em `--barra-acoes-altura`) é a soma de `pt-2` (0,5 rem)
 * + botão de 52 px + base de 0,75 rem: mexeu numa classe, mexa na variável.
 *
 * `print:hidden`: `fixed` se repetiria em todas as folhas e cobriria o conteúdo impresso (some
 * também o assistente no desktop, de propósito).
 */
export function BarraDeAcoes({ children }: { readonly children?: React.ReactNode }) {
  return (
    <div
      role="group"
      aria-label="Ações rápidas"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-center gap-2.5 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:contents print:hidden"
    >
      <button
        type="button"
        data-casca
        aria-keyshortcuts="Control+K Meta+K"
        onClick={() => pedirAcaoDaCasca(EVENTO_ABRIR_BUSCA)}
        className={cn(
          // Botão nativo: o `Button` traz fundo próprio, e o material disputaria com ele.
          "vidro-casca",
          PRESSAO,
          "pointer-events-auto flex h-[52px] min-w-0 flex-1 items-center gap-2 rounded-full px-[18px] text-left text-muted-foreground font-medium lg:hidden",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        )}
      >
        <Search className="size-[18px] shrink-0" aria-hidden />
        <span className="truncate">Buscar</span>
      </button>
      <Button
        size="icon"
        aria-label="Novo lançamento"
        onClick={() => pedirAcaoDaCasca(EVENTO_ABRIR_LANCAMENTO)}
        className="pointer-events-auto size-[52px] shrink-0 rounded-full lg:hidden"
      >
        <Plus className="size-[22px]" />
      </Button>
      {children}
    </div>
  );
}
