import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Info,
  Minus,
  type LucideIcon,
} from "lucide-react";
import type * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Tipos declarados AQUI, de propósito: as peças do painel não conhecem finanças — recebem texto e
 * número prontos. (O tipo do módulo financeiro, se existir, é compatível por estrutura.)
 */
export type TomDoIndicador = "saldo" | "entrada" | "saida" | "terceiros";

export type ComparacaoDoIndicador = {
  /** Variação em porcentagem, já na escala 0–100 (4,2 = 4,2%); `null` = sem base de comparação. */
  pct: number | null;
  /** O que a variação significa para o dono — decidido por quem chama, não por esta peça. */
  sentido: "bom" | "ruim" | "neutro";
  texto: string;
};

/** Classes literais (o Tailwind só enxerga o que está escrito por inteiro no código). */
const CHIP_POR_TOM: Record<TomDoIndicador, string> = {
  saldo: "bg-primary/10 text-primary ring-primary/15",
  entrada: "bg-success/10 text-success-ink ring-success/20",
  saida: "bg-destructive/10 text-destructive ring-destructive/20",
  terceiros: "bg-chart-7/10 text-chart-7 ring-chart-7/20",
};

const COR_POR_SENTIDO: Record<ComparacaoDoIndicador["sentido"], string> = {
  bom: "text-success-ink",
  ruim: "text-destructive",
  neutro: "text-muted-foreground",
};

const FORMATO_PCT = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/**
 * Seta, palavra e número da variação. O sinal sai do valor ARREDONDADO que a tela mostra: "subiu
 * 0,0%" seria uma frase que se contradiz.
 */
function leituraDaVariacao(pct: number | null): {
  Seta: LucideIcon;
  palavra: string;
  numero: string | null;
} {
  if (pct === null || !Number.isFinite(pct)) {
    return { Seta: Minus, palavra: "", numero: null };
  }
  const arredondado = Math.round(Math.abs(pct) * 10) / 10;
  if (arredondado === 0) {
    return { Seta: Minus, palavra: "estável", numero: `${FORMATO_PCT.format(0)}%` };
  }
  return {
    Seta: pct > 0 ? ArrowUp : ArrowDown,
    palavra: pct > 0 ? "subiu" : "caiu",
    numero: `${FORMATO_PCT.format(arredondado)}%`,
  };
}

/**
 * Indicador do painel — variante nova; o `StatCard` padrão não muda. Server Component: o olho
 * dos valores age só por CSS (`group-data-[ocultar=true]/olho`), então o valor real e o "R$ ••••"
 * saem os dois do servidor e o cliente apenas escolhe qual aparece.
 *
 * ⛔ Erro de leitura nunca vira zero: o estado `{ erro }` mostra o texto, não um valor; o mesmo
 * vale para `{ naoSegue }` (o filtro ativo não alcança este número), que é outro fato. E a linha
 * de base (o que o número mede) fica sempre visível — número sem base não se interpreta.
 * `{ ausente }` é a falta de valor medido (ex.: fatura prevista): nem erro, nem zero.
 */
export function Indicador({
  tom,
  icone: Icone,
  rotulo,
  dica,
  valor,
  linhaDeBase,
  detalheComValor,
  comparacao,
  href,
  hrefRotulo,
  acessorio,
  className,
}: {
  tom: TomDoIndicador;
  icone: LucideIcon;
  rotulo: string;
  dica: string;
  valor: string | { erro: string } | { ausente: string } | { naoSegue: string };
  linhaDeBase: string;
  /** Detalhe que contém dinheiro (ex.: "+ R$ X de terceiros"): some junto com o olho. */
  detalheComValor?: string | null;
  comparacao?: ComparacaoDoIndicador;
  href?: string;
  hrefRotulo?: string;
  acessorio?: React.ReactNode;
  className?: string;
}) {
  const variacao = comparacao ? leituraDaVariacao(comparacao.pct) : null;

  return (
    // `@container`: a decisão de mostrar o ícone é do CARD, não da viewport (ver `StatCard`).
    <Card className={cn("@container overflow-hidden", className)}>
      <CardContent className="flex items-start gap-3 p-4 sm:gap-4">
        <div
          aria-hidden="true"
          className={cn(
            "hidden size-10 shrink-0 place-items-center rounded-xl ring-1 @[13rem]:grid",
            CHIP_POR_TOM[tom],
          )}
        >
          <Icone className="size-5" />
        </div>

        {/* `min-w-0`: item de flex não encolhe abaixo do conteúdo, e o chip é `shrink-0`. */}
        <div className="min-w-0 flex-1 space-y-1">
          {/* L3: a dica abre por toque e por teclado (`<details>` nativo, sem JS). O `title` só
              aparecia com o mouse — no celular e no teclado a dica não existia. Ela abre NO FLUXO,
              logo abaixo do rótulo: um painel por cima seria cortado pelo `overflow-hidden` do card
              (que segura o rótulo e o valor longos, conferência 04-A) e passaria da borda no celular. */}
          <div className="flex min-w-0 items-start gap-1.5">
            <details className="group/dica min-w-0 flex-1">
              <summary
                className="flex w-fit max-w-full cursor-pointer list-none items-center gap-1.5 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden"
              >
                <span className="min-w-0 break-words text-sm font-medium text-muted-foreground">
                  {rotulo}
                </span>
                <Info
                  aria-hidden="true"
                  className="size-3.5 shrink-0 text-muted-foreground group-open/dica:text-primary"
                />
                {/* Soma ao rótulo, não o substitui: o leitor ouve "Minhas saídas, o que é este número". */}
                <span className="sr-only">, o que é este número</span>
              </summary>
              <p className="mt-1 rounded-md bg-muted p-2 text-xs text-muted-foreground">{dica}</p>
            </details>
            {acessorio ? <div className="shrink-0">{acessorio}</div> : null}
          </div>

          {typeof valor === "string" ? (
            <p className="break-words text-2xl font-semibold tracking-tight tabular-nums">
              <span className="group-data-[ocultar=true]/olho:hidden">{valor}</span>
              <span
                aria-hidden="true"
                className="hidden group-data-[ocultar=true]/olho:inline"
              >
                R$ ••••
              </span>
              {/* O "R$ ••••" é aria-hidden; o leitor de tela ouve "valor oculto". `display:none`
                  tira o invólucro da árvore de acessibilidade com o olho aberto. */}
              <span className="hidden group-data-[ocultar=true]/olho:block">
                <span className="sr-only">valor oculto</span>
              </span>
            </p>
          ) : "naoSegue" in valor ? (
            // O quarto desenho (04-A2 L1): o bloco não segue o filtro. Texto, nunca número.
            <p className="rounded-md border border-dashed p-2 text-sm text-muted-foreground">
              {valor.naoSegue}
            </p>
          ) : "ausente" in valor ? (
            <p className="text-sm italic text-muted-foreground">{valor.ausente}</p>
          ) : (
            <p className="text-sm text-muted-foreground">{valor.erro}</p>
          )}

          <p className="text-xs text-muted-foreground">{linhaDeBase}</p>
          {detalheComValor ? (
            <p className="text-xs text-muted-foreground">
              <span className="group-data-[ocultar=true]/olho:hidden">{detalheComValor}</span>
              <span className="hidden group-data-[ocultar=true]/olho:inline">valor oculto</span>
            </p>
          ) : null}

          {comparacao && variacao ? (
            <p
              className={cn(
                "flex flex-wrap items-center gap-x-1 text-xs",
                COR_POR_SENTIDO[comparacao.sentido],
              )}
            >
              {variacao.numero !== null ? (
                <>
                  <variacao.Seta aria-hidden="true" className="size-3.5 shrink-0" />
                  <span className="font-medium">
                    {variacao.palavra} {variacao.numero}
                  </span>
                </>
              ) : null}
              <span className="min-w-0">{comparacao.texto}</span>
            </p>
          ) : null}

          {href ? (
            <Link
              href={href}
              className="inline-block text-xs text-primary hover:underline"
            >
              {hrefRotulo ?? "Ver registros"} ›
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
