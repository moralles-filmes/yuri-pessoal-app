"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { AlertTriangle, CircleCheck, CircleSlash, Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useOlhoDosValores } from "@/components/shared/painel/olho-dos-valores";
import { ValorComOlho } from "@/components/shared/painel/valor-com-olho";
import type { GrupoDaGaveta, LinhaDaGaveta, TomDaMarca, VistaDaGaveta } from "@/lib/painel/gaveta";
import { cn } from "@/lib/utils";

/**
 * REDESIGN-04-B — o corpo da gaveta de registros (carregado sob demanda pela fachada). Recebe a
 * vista PRONTA (`vistaDaGaveta`): nenhum número é montado aqui.
 *
 * ⛔ Todo dinheiro passa por `ValorComOlho`: a gaveta vive num PORTAL, fora do `group/olho` da
 *    página, então ela repõe `data-ocultar` + `group/olho` no próprio invólucro com o estado do
 *    contexto (D-B-13). Texto de moeda solto aqui apareceria com o olho fechado.
 * ⛔ O total do topo é o número do MOTOR; a soma da lista só aparece no rodapé, para conferir, e a
 *    diferença é escrita, nunca escondida (D-B-4).
 * ⛔ Vazio não escreve "R$"; falha é alerta, com o desenho de falha do `Bloco` (D-B-10).
 */

const DESKTOP = "(min-width: 640px)";

function assinarLargura(aviso: () => void): () => void {
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener("change", aviso);
  return () => mq.removeEventListener("change", aviso);
}

/** Lateral do tablet para cima; de baixo para cima no celular. O servidor assume a lateral. */
function useLado(): "right" | "bottom" {
  const largo = useSyncExternalStore(
    assinarLargura,
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
  return largo ? "right" : "bottom";
}

const HACHURA =
  "bg-[repeating-linear-gradient(135deg,color-mix(in_oklch,var(--primary)_18%,transparent)_0_4px,transparent_4px_8px)]";

const CLASSE_DO_TOM: Record<TomDaMarca, string> = {
  aviso: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  estorno: "bg-primary/10 text-primary",
  projetado: cn("border border-dashed border-primary text-primary", HACHURA),
  neutro: "bg-muted text-muted-foreground",
};

function Linha({ l }: { l: LinhaDaGaveta }) {
  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 border-t py-2 sm:grid-cols-[3.25rem_minmax(0,1fr)_auto]",
        l.projetado && cn("rounded-md px-1.5", HACHURA),
      )}
    >
      <span className="hidden pt-0.5 text-xs text-muted-foreground tabular-nums sm:block">{l.data ?? ""}</span>
      <div className="min-w-0">
        <p className="text-sm font-medium break-words">{l.descricao}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          {l.data ? <span className="tabular-nums sm:hidden">{l.data}</span> : null}
          {l.meta.map((m, i) => (
            <span key={i} className="break-words">
              {i > 0 ? "· " : ""}
              {m}
            </span>
          ))}
          {l.marcas.map((m, i) => (
            <Badge key={i} variant="secondary" className={cn("font-normal", CLASSE_DO_TOM[m.tom])}>
              {m.texto}
            </Badge>
          ))}
        </div>
      </div>
      <div className="text-right tabular-nums whitespace-nowrap">
        <p className={cn("text-sm font-semibold", l.negativo && "text-primary")}>
          <ValorComOlho texto={l.valor} />
        </p>
        {l.outras.map((o) => (
          <p key={o.rotulo} className="text-xs text-muted-foreground">
            {o.rotulo} <ValorComOlho texto={o.valor} />
          </p>
        ))}
      </div>
    </li>
  );
}

function Grupo({ g }: { g: GrupoDaGaveta }) {
  return (
    <section className="space-y-1">
      <h3 className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        <span className="min-w-0 break-words">{g.rotulo}</span>
        {g.cabecalho ? (
          <span className="font-normal tracking-normal normal-case tabular-nums">
            fatura <ValorComOlho texto={g.cabecalho.fatura} /> · minha parte{" "}
            <ValorComOlho texto={g.cabecalho.minhaParte} />
          </span>
        ) : null}
      </h3>
      {g.diferenca ? (
        <p className="text-xs text-destructive">
          A fatura soma <ValorComOlho texto={g.diferenca.fatura} /> e os itens lidos somam{" "}
          <ValorComOlho texto={g.diferenca.itens} />: pode haver compra fora da janela de leitura. O
          total não é ajustado.
        </p>
      ) : null}
      <ul>
        {g.linhas.map((l) => (
          <Linha key={l.id} l={l} />
        ))}
      </ul>
    </section>
  );
}

function Avisos({ avisos }: { avisos: string[] }) {
  if (avisos.length === 0) return null;
  return (
    <ul className="space-y-1.5">
      {avisos.map((a) => (
        <li key={a} className="rounded-lg bg-amber-500/15 px-3 py-2 text-sm text-foreground">
          {a}
        </li>
      ))}
    </ul>
  );
}

function LinkLancamentos({ href }: { href: string }) {
  return (
    <>
      <Link href={href} className="inline-block text-xs text-primary hover:underline">
        Abrir em Lançamentos ›
      </Link>
      <p className="text-xs text-muted-foreground">
        Em Lançamentos a lista é filtrada pela competência de cada lançamento, sem parcelas: a soma
        de lá não é esta.
      </p>
    </>
  );
}

function Corpo({ vista, linkLancamentos }: { vista: VistaDaGaveta; linkLancamentos: string }) {
  switch (vista.estado) {
    case "falha":
      return (
        <div role="alert" className="flex items-start gap-3 rounded-lg bg-destructive/10 p-3 ring-1 ring-destructive/20">
          <AlertTriangle aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-destructive" />
          <p className="min-w-0 text-sm">{vista.frase} Isto não é &quot;nenhum registro&quot;.</p>
        </div>
      );
    case "nao-segue":
      return (
        <div role="note" className="flex items-start gap-3 rounded-lg border border-dashed bg-muted/50 p-3">
          <CircleSlash aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 space-y-1">
            <p className="text-sm text-muted-foreground">
              {vista.frase} Este número não tem registros para abrir com este filtro.
            </p>
            {vista.hrefSemFiltro ? (
              <Link href={vista.hrefSemFiltro} className="inline-block text-xs text-primary hover:underline">
                Ver sem o filtro ›
              </Link>
            ) : null}
          </div>
        </div>
      );
    case "vazio":
      return (
        <>
          <Avisos avisos={vista.avisos} />
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <div aria-hidden="true" className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
              <Inbox className="size-5" />
            </div>
            <p className="text-sm text-muted-foreground">{vista.frase}</p>
          </div>
          <LinkLancamentos href={linkLancamentos} />
        </>
      );
    case "ok":
      return (
        <>
          <Avisos avisos={vista.avisos} />
          {vista.grupos.map((g, i) => (
            <Grupo key={`${g.rotulo}-${i}`} g={g} />
          ))}
        </>
      );
  }
}

function Rodape({ vista, linkLancamentos }: { vista: Extract<VistaDaGaveta, { estado: "ok" }>; linkLancamentos: string }) {
  return (
    <div className="space-y-1.5 border-t px-4 py-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0">
          Soma {vista.soma.rotulo} dos registros: <ValorComOlho texto={vista.soma.valor} />
        </span>
        {vista.diferenca === null ? (
          <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 dark:text-emerald-400">
            <CircleCheck aria-hidden="true" className="size-4" /> = total
          </span>
        ) : (
          <span className="font-semibold text-destructive">
            Diferença não explicada pelos registros: <ValorComOlho texto={vista.diferenca} />
          </span>
        )}
      </div>
      <LinkLancamentos href={linkLancamentos} />
    </div>
  );
}

export function GavetaDeRegistrosImpl({
  aberto,
  aoFechar,
  vista,
  linkLancamentos,
}: {
  aberto: boolean;
  aoFechar: () => void;
  vista: VistaDaGaveta;
  linkLancamentos: string;
}) {
  const lado = useLado();
  const oculto = useOlhoDosValores()?.oculto ?? false;
  const linhaDeBase = vista.estado === "ok" || vista.estado === "vazio" ? vista.linhaDeBase : null;

  return (
    <Sheet open={aberto} onOpenChange={(v) => (v ? undefined : aoFechar())}>
      <SheetContent
        side={lado}
        className="gap-0 p-0 data-[side=bottom]:max-h-[88dvh] data-[side=bottom]:rounded-t-2xl data-[side=right]:w-full data-[side=right]:sm:max-w-xl"
      >
        <div data-ocultar={oculto ? "true" : "false"} className="group/olho flex min-h-0 flex-1 flex-col">
          <SheetHeader className="gap-1 border-b px-4 pt-4 pr-12 pb-3">
            <SheetTitle className="break-words">{vista.titulo}</SheetTitle>
            {linhaDeBase ? <SheetDescription>{linhaDeBase}</SheetDescription> : null}
            {vista.estado === "ok" ? (
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                <ValorComOlho texto={vista.total} />
              </p>
            ) : null}
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">
            <Corpo vista={vista} linkLancamentos={linkLancamentos} />
          </div>
          {vista.estado === "ok" ? <Rodape vista={vista} linkLancamentos={linkLancamentos} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
