"use client";

/**
 * REDESIGN-02-E — a navegação interna de um módulo, escrita UMA vez.
 *
 * Até aqui existiam três cópias quase iguais (`nutrition-nav`, `training-nav`, `ai-nav`) e
 * três cascas idênticas até o comentário (`*-shell`). "Quase" é o problema: as cópias já
 * tinham divergido, e ninguém tinha como ver isso lendo um arquivo só.
 *
 * O que estava diferente entre elas, e que esta unificação resolve:
 *
 *  1. ⛔ **O nav da IA não marcava `aria-current="page"`.** Dieta, Treinos e as abas do
 *     Financeiro marcavam. Em `/ia`, quem usa leitor de tela não recebia informação nenhuma
 *     de onde está — a única pista era a cor. Este é o defeito VIVO que a 02-E conserta.
 *  2. ⛔ **O `<nav>` da IA não tinha `aria-label`.** A página tem dois landmarks de
 *     navegação (a sidebar do app e o nav do módulo); um sem nome é um "navigation" solto
 *     na lista de landmarks.
 *  3. **Dois desenhos de item ativo no mesmo produto**: Dieta e Treinos usavam fundo +
 *     anel com o texto em `foreground`; a IA usava fundo com o texto em `primary`. Ficou o
 *     primeiro — texto em cor de texto, e a cor da marca marcando a POSIÇÃO (o ícone e o
 *     anel). Texto colorido sobre fundo colorido é o que tem menos contraste dos dois.
 *  4. **Só a IA era `sticky`.** Agora as três são — e com teto de altura, que a IA não
 *     tinha e que passa a importar com os 13 itens de Treinos.
 *
 * ⚠️ O Financeiro NÃO entra aqui. A navegação dele é uma fita de abas horizontal
 * (`finance-tabs-nav.tsx`), não uma coluna: não é uma quarta cópia disto, é outra forma.
 * O que ele compartilha é a DECISÃO de item ativo (`hrefAtivo`, unificada na 02-C) e a
 * linguagem de token. Transformá-lo em coluna seria mudar a navegação do módulo, não
 * deduplicar — e isso é assunto da REDESIGN-04, que redesenha o Financeiro inteiro.
 *
 * ⚠️ O badge "Em breve"/"Planejado" das cópias antigas NÃO foi trazido: as 25 seções dos
 * três módulos estão todas `pronto` desde que as fases 16, 17 e 18 fecharam. Um ramo que
 * nenhum dado alcança, copiado para dentro de um componente compartilhado, é peso que
 * ninguém consegue justificar depois. Quem avisa se isso deixar de ser verdade é
 * `module-shell.test.ts`, que fica vermelho no dia em que uma seção nascer sem estar pronta.
 */
import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { hrefAtivo } from "@/lib/nav/active";

export type ItemDeModulo = {
  /** Rota interna absoluta. Há teste conferindo que existe `page.tsx` para ela. */
  href: string;
  title: string;
  icon: LucideIcon;
};

export type GrupoDeModulo = {
  /**
   * Sem título, o grupo vira lista corrida — é o caso da IA. Com 12 ou 13 itens (Dieta e
   * Treinos), agrupar por finalidade é o que torna a coluna varrível.
   */
  titulo?: string;
  itens: readonly ItemDeModulo[];
};

export type NavegacaoDeModulo = {
  /** Nome do módulo: vira o rótulo do landmark, o título da coluna e o da gaveta. */
  nome: string;
  grupos: readonly GrupoDeModulo[];
};

function todosOsHrefs(nav: NavegacaoDeModulo): string[] {
  return nav.grupos.flatMap((grupo) => grupo.itens.map((item) => item.href));
}

function Conteudo({
  nav,
  onNavigate,
}: {
  nav: NavegacaoDeModulo;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  /**
   * UMA decisão de item ativo, sobre a lista inteira (02-C). É isso que dispensa a exceção
   * escrita à mão para a raiz do módulo: `/nutricao` só vence quando nenhuma seção mais
   * funda casou.
   */
  const ativoAqui = hrefAtivo(pathname, todosOsHrefs(nav));

  return (
    <nav aria-label={`Seções de ${nav.nome}`} className="space-y-5">
      {nav.grupos.map((grupo, indice) => (
        <div key={grupo.titulo ?? indice} className="space-y-1">
          {grupo.titulo && (
            <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
              {grupo.titulo}
            </p>
          )}
          {grupo.itens.map((item) => {
            const ativo = item.href === ativoAqui;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  ativo
                    ? "bg-primary/10 font-medium text-foreground ring-1 ring-primary/20"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className={cn("size-4 shrink-0", ativo && "text-primary")} />
                {/* `min-w-0` + `truncate`: sem eles o rótulo longo empurra o ícone para fora. */}
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** A coluna fixa do desktop. Some abaixo de `lg`, onde quem navega é a gaveta. */
export function ModuleNav({ nav }: { nav: NavegacaoDeModulo }) {
  return (
    <aside className="hidden w-56 shrink-0 lg:block">
      {/*
       * `top-18` e não `top-0`: o Header é `sticky top-0` com `h-16` — uma barra `sticky`
       * dentro do conteúdo com `top-0` escorrega para trás dele. O teto de altura existe
       * porque Treinos tem 13 itens em 4 grupos: numa janela baixa, sem ele, os últimos
       * ficariam inalcançáveis.
       */}
      <div className="sticky top-18 max-h-[calc(100vh-5.5rem)] overflow-y-auto">
        <p className="px-2.5 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {nav.nome}
        </p>
        <Conteudo nav={nav} />
      </div>
    </aside>
  );
}

/** A mesma navegação em gaveta — celular e tablet. */
export function ModuleNavDrawer({
  nav,
  open,
  onOpenChange,
  id,
}: {
  nav: NavegacaoDeModulo;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** O id que o gatilho "Seções" cita em `aria-controls` (REDESIGN-07-D · D9). */
  id?: string;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/*
        REDESIGN-07-D · D9 — a largura com o prefixo de lado: a primitiva traz
        `data-[side=left]:w-3/4`, e um `w-[17rem]` sem prefixo é OUTRO grupo do `twMerge` que o
        seletor de atributo vence (a 390 a gaveta media 292 px, ¾ da tela, e não 272).
      */}
      <SheetContent side="left" id={id} className="data-[side=left]:w-[17rem] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-base">{nav.nome}</SheetTitle>
        </SheetHeader>
        <div className="px-2 pb-6">
          <Conteudo nav={nav} onNavigate={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * A casca do módulo: coluna + gaveta + o botão que abre a gaveta.
 *
 * Ela existe para segurar o estado da gaveta, que é client, mantendo as páginas do módulo
 * como Server Components.
 */
export function ModuleShell({
  nav,
  children,
}: {
  nav: NavegacaoDeModulo;
  children: React.ReactNode;
}) {
  const [gavetaAberta, setGavetaAberta] = React.useState(false);
  const idDaGaveta = React.useId();

  return (
    <div className="flex gap-6">
      <ModuleNav nav={nav} />
      <ModuleNavDrawer
        nav={nav}
        open={gavetaAberta}
        onOpenChange={setGavetaAberta}
        id={idDaGaveta}
      />

      {/* `min-w-0` é o que impede um conteúdo largo de empurrar a página na horizontal. */}
      <div className="min-w-0 flex-1 space-y-4">
        <Button
          variant="outline"
          size="sm"
          className="lg:hidden"
          aria-expanded={gavetaAberta}
          aria-controls={idDaGaveta}
          onClick={() => setGavetaAberta(true)}
        >
          <Menu className="size-4" />
          Seções
        </Button>
        {children}
      </div>
    </div>
  );
}
