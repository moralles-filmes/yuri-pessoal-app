import Link from "next/link";
import { AlertTriangle, CircleSlash, Inbox } from "lucide-react";
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
  titulo,
  subtitulo,
  verTodos,
  acao,
  estado,
  vazio,
  falha,
  naoSegue,
  children,
  className,
}: {
  titulo: string;
  subtitulo?: string;
  verTodos?: { href: string; rotulo?: string };
  acao?: React.ReactNode;
  estado: EstadoDoBloco;
  vazio?: { frase: string; acao?: React.ReactNode };
  falha?: { frase: string };
  /** A frase do motivo vem PRONTA de quem chama; o bloco só a mostra e oferece a saída. */
  naoSegue?: { frase: string; hrefSemFiltro: string };
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardContent className="space-y-4 px-4 sm:px-5">
        {/* `min-w-0` no lado do texto: o título longo não empurra o link para fora do card. */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base leading-snug font-semibold">{titulo}</h3>
            {subtitulo ? (
              <p className="text-xs text-muted-foreground">{subtitulo}</p>
            ) : null}
          </div>
          {verTodos || acao ? (
            <div className="flex shrink-0 items-center gap-2">
              {acao}
              {verTodos ? (
                <Link
                  href={verTodos.href}
                  className="text-xs whitespace-nowrap text-primary hover:underline"
                >
                  {verTodos.rotulo ?? "Ver todas"} ›
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
