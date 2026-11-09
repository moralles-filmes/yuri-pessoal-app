import Link from "next/link";
import { AlertTriangle, CircleSlash, Inbox, type LucideIcon } from "lucide-react";
import type * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { EstadoDoBloco } from "@/lib/painel/bloco";

/**
 * Bloco do painel: cabeçalho + um de QUATRO estados com desenhos distintos.
 *
 * - `conteudo` → os `children`;
 * - `vazio` → ícone neutro (caixa de entrada), frase e, se houver, a ação ("registre o primeiro");
 * - `falha` → ícone de alerta em tom destrutivo e a frase do erro. Nunca o desenho do vazio:
 *   "não há nada" e "não consegui ler" são fatos diferentes, e o dono precisa distingui-los;
 * - `nao-segue` → borda tracejada e ícone próprio: o bloco não obedece ao filtro ativo (04-A2 L1).
 *   Não é vazio, nem zero medido, nem falha: a frase do motivo vem pronta, com o caminho de volta.
 *
 * Server Component. O estado vem de `estadoDoBloco` (puro).
 */
export function Bloco({
  icone: Icone,
  titulo,
  subtitulo,
  verTodos,
  acao,
  estado,
  vazio,
  falha,
  naoSegue,
  nivel = 3,
  children,
  className,
}: {
  /** Decorativo e opcional: o título já diz do que o bloco fala. */
  icone?: LucideIcon;
  titulo: string;
  subtitulo?: string;
  verTodos?: { href: string; rotulo?: string };
  acao?: React.ReactNode;
  estado: EstadoDoBloco;
  vazio?: { frase: string; acao?: React.ReactNode };
  falha?: { frase: string };
  /** A frase do motivo vem PRONTA de quem chama; o bloco só a mostra e oferece a saída. */
  naoSegue?: { frase: string; hrefSemFiltro: string };
  /**
   * Nível do título na página. `3` (padrão) quando já há um `<h2>` de seção acima do bloco; `2` quando
   * o bloco é a própria seção, numa página que só tem o `<h1>`. Só troca a tag: o tamanho vem das classes.
   */
  nivel?: 2 | 3;
  children?: React.ReactNode;
  className?: string;
}) {
  const Titulo = nivel === 2 ? "h2" : "h3";
  return (
    <Card className={cn("overflow-hidden rounded-[28px]", className)}>
      <CardContent className="space-y-4 px-4 sm:px-5">
        {/* `min-w-0` no lado do texto: o título longo não empurra o link para fora do card. O título
            QUEBRA em vez de cortar (a 390 px, "valor cheio" e "mês a mês" sumiam), e a ação desce
            para a linha de baixo quando sobram menos de 12rem para o título (conferência 04-A2). */}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-[1_1_12rem]">
            <div className="flex items-start gap-2.5">
              {Icone ? (
                <Icone
                  aria-hidden="true"
                  className="mt-0.5 size-[1.1875rem] shrink-0 text-muted-foreground"
                />
              ) : null}
              <div className="min-w-0">
                <Titulo className="text-[1.0625rem] leading-snug font-semibold tracking-[-0.018em] break-words">
                  {titulo}
                </Titulo>
                {subtitulo ? (
                  <p className="text-xs text-muted-foreground">{subtitulo}</p>
                ) : null}
              </div>
            </div>
          </div>
          {verTodos || acao ? (
            <div className="flex shrink-0 items-center gap-2">
              {acao}
              {verTodos ? (
                <Link
                  href={verTodos.href}
                  className="text-sm font-medium whitespace-nowrap text-primary hover:underline"
                >
                  {verTodos.rotulo ?? "Ver tudo"} ›
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        {estado === "conteudo" ? children : null}

        {estado === "vazio" ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div
              aria-hidden="true"
              className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground"
            >
              <Inbox className="size-5" />
            </div>
            <p className="text-sm text-muted-foreground">
              {vazio?.frase ?? "Nada por aqui ainda."}
            </p>
            {vazio?.acao}
          </div>
        ) : null}

        {estado === "falha" ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3 ring-1 ring-destructive/20"
          >
            <AlertTriangle
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-destructive"
            />
            <p className="min-w-0 text-sm">
              {falha?.frase ?? "Não foi possível ler estes dados agora."}
            </p>
          </div>
        ) : null}

        {estado === "nao-segue" ? (
          <div
            role="note"
            className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/50 p-3"
          >
            <CircleSlash
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            />
            <div className="min-w-0 space-y-1">
              <p className="text-sm text-muted-foreground">{naoSegue?.frase}</p>
              {naoSegue ? (
                <Link
                  href={naoSegue.hrefSemFiltro}
                  className="inline-block text-xs text-primary hover:underline"
                >
                  Ver sem o filtro ›
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
