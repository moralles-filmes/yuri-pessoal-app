/**
 * REDESIGN-07-D · D1 — UM TOM E UM ÍCONE POR ESTADO, DE UMA FONTE SÓ.
 *
 * Lido pelo cartão de proposta (chat, comprovantes, insights, desfazer) e por `/ia/acoes`. Até
 * aqui cada tela tinha o seu: o cartão usava o verde da aplicada também para "em parte" e para
 * "falhou", e `/ia/acoes` dava a `expirada` e a `recusada` a mesma cor E o mesmo ícone.
 *
 * - O estado se lê pelo TEXTO (o rótulo de `ROTULO_DO_ESTADO_DA_ACAO`); cor e ícone reforçam.
 * - `executando` ("sem desfecho registrado") e `confirmada` são âmbar: nem verde (não sabemos
 *   se deu certo) nem vermelho (não sabemos se falhou).
 * - Cores pelos tokens semânticos (`--success-ink`, `--warning-ink`): `text-success` num rótulo
 *   fica ilegível sobre o card (medido em `globals.css`) — por isso o `-ink`.
 */
import {
  Ban,
  CircleAlert,
  CircleCheck,
  CircleHelp,
  CircleX,
  Clock,
  Hourglass,
  TriangleAlert,
} from "lucide-react";
import type { EstadoDaProposta } from "@/lib/ai/approval/state";
import { cn } from "@/lib/utils";

export type EstadoVisual = EstadoDaProposta | "nao_aplicada";

type Tom = { readonly fundo: string; readonly cor: string };

const AVISO: Tom = { fundo: "border-warning/50 bg-warning/5", cor: "text-warning-ink" };
const NEUTRO: Tom = { fundo: "border-border bg-muted/40", cor: "text-muted-foreground" };

export const TOM_DO_ESTADO: Record<EstadoVisual, Tom> = {
  pendente: { fundo: "border-primary/40 bg-primary/5", cor: "text-primary" },
  expirada: NEUTRO,
  recusada: NEUTRO,
  confirmada: AVISO,
  executando: AVISO,
  executada: { fundo: "border-success/40 bg-success/5", cor: "text-success-ink" },
  parcial: AVISO,
  falhou: { fundo: "border-destructive/40 bg-destructive/5", cor: "text-destructive" },
  nao_aplicada: AVISO,
};

/** Borda + fundo + cor do texto — para o selo de `/ia/acoes`. */
export function classeDoSelo(estado: EstadoVisual): string {
  return cn(TOM_DO_ESTADO[estado].fundo, TOM_DO_ESTADO[estado].cor);
}

export function IconeDoEstado({
  estado,
  className,
}: {
  readonly estado: EstadoVisual;
  readonly className?: string;
}) {
  const classe = cn("size-4 shrink-0", className);
  switch (estado) {
    case "pendente":
      return <Clock className={classe} aria-hidden />;
    case "expirada":
      return <Hourglass className={classe} aria-hidden />;
    case "recusada":
      return <Ban className={classe} aria-hidden />;
    case "confirmada":
    case "nao_aplicada":
      return <CircleAlert className={classe} aria-hidden />;
    case "executando":
      return <CircleHelp className={classe} aria-hidden />;
    case "executada":
      return <CircleCheck className={classe} aria-hidden />;
    case "parcial":
      return <TriangleAlert className={classe} aria-hidden />;
    case "falhou":
      return <CircleX className={classe} aria-hidden />;
  }
}
