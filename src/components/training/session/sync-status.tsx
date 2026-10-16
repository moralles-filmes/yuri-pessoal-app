"use client";

/**
 * Fase 17-C — Treinos · Estado da sincronização, sempre visível.
 *
 * O usuário precisa saber, o tempo todo, se o que ele acabou de registrar já chegou ao
 * servidor. Esconder isso e mostrar só um "salvo" otimista seria mentir justamente na hora em
 * que o Wi-Fi da academia cai.
 *
 * **Não dizemos "funciona offline"** — dizemos o que de fato acontece: ficou salvo no
 * dispositivo, está aguardando conexão, ou deu erro (com o motivo e um botão de tentar de novo).
 */
import { AlertTriangle, Check, CloudOff, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { pendentesTexto } from "./session-queue-view";
import { SYNC_LABELS, type SyncState } from "./use-session-queue";

const ICONS = {
  salvo: Check,
  salvando: Loader2,
  salvo_no_dispositivo: Smartphone,
  aguardando_conexao: CloudOff,
  erro: AlertTriangle,
} as const;

const TONE: Record<SyncState, string> = {
  salvo: "text-muted-foreground",
  salvando: "text-muted-foreground",
  salvo_no_dispositivo: "text-primary",
  aguardando_conexao: "text-amber-600 dark:text-amber-400",
  erro: "text-destructive",
};

export function SyncStatus({
  state,
  pending,
  lastError,
  onRetry,
  className,
}: {
  state: SyncState;
  pending: number;
  lastError: string | null;
  onRetry: () => void;
  className?: string;
}) {
  const Icon = ICONS[state];

  return (
    <div className={cn("flex items-center gap-1.5 text-xs", TONE[state], className)}>
      <Icon className={cn("size-3.5 shrink-0", state === "salvando" && "animate-spin")} />
      {/* Região viva (REDESIGN-07-C): o leitor de tela ouve "Salvo no dispositivo · 2 a enviar"
          quando muda — antes o estado só existia na cor e no ícone. O erro vai junto. */}
      <span className="truncate" role="status" aria-live="polite">
        {SYNC_LABELS[state]}
        {pending > 0 && state !== "salvo" ? ` · ${pendentesTexto(pending)}` : ""}
        {state === "erro" && lastError ? <span className="sr-only"> · {lastError}</span> : null}
      </span>
      {(state === "erro" || state === "aguardando_conexao") && (
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={onRetry}>
          Tentar de novo
        </Button>
      )}
    </div>
  );
}
