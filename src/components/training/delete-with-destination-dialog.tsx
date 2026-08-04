"use client";

/**
 * Fase 17-B — Treinos · Excluir escolhendo o destino do que dependia.
 *
 * ⛔ A REGRA QUE ESTE COMPONENTE EXISTE PARA CUMPRIR: **nenhuma exclusão silenciosa**.
 *
 * Excluir um programa não pode decidir sozinho o que acontece com os treinos dele; excluir um
 * treino-modelo não pode decidir sozinho o que acontece com os dias já planejados. O diálogo
 * mostra o que depende, oferece os destinos possíveis e **não tem opção pré-selecionada** —
 * confirmar sem escolher é impossível.
 *
 * Genérico de propósito: programa e treino usam o mesmo desenho, e o usuário aprende o padrão
 * uma vez só.
 */
import * as React from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export type DestinationOption = {
  value: string;
  label: string;
  description: string;
  /** Quando presente, a escolha exige apontar um alvo (outro programa, outro treino). */
  requiresTarget?: boolean;
  tone?: "default" | "destructive";
};

export type DependencyLine = { label: string; count: number };

export function DeleteWithDestinationDialog({
  open,
  onOpenChange,
  title,
  itemName,
  dependencies,
  loadingDependencies,
  options,
  targetLabel,
  targets,
  confirmLabel = "Excluir",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  itemName: string;
  dependencies: DependencyLine[];
  loadingDependencies?: boolean;
  options: DestinationOption[];
  targetLabel: string;
  targets: { id: string; name: string }[];
  confirmLabel?: string;
  onConfirm: (destination: string, targetId: string | null) => Promise<void>;
}) {
  // Sem escolha pré-marcada: o usuário PRECISA decidir o destino.
  const [destination, setDestination] = React.useState<string | null>(null);
  const [targetId, setTargetId] = React.useState<string | null>(null);
  const [working, setWorking] = React.useState(false);

  // Reabrir com outro item zera a escolha (ajuste durante o render, sem useEffect).
  const openKey = `${itemName}:${open}`;
  const [lastKey, setLastKey] = React.useState(openKey);
  if (openKey !== lastKey) {
    setLastKey(openKey);
    setDestination(null);
    setTargetId(null);
  }

  const chosen = options.find((option) => option.value === destination);
  const needsTarget = Boolean(chosen?.requiresTarget);
  const canConfirm = Boolean(destination) && (!needsTarget || Boolean(targetId)) && !working;

  const relevant = dependencies.filter((line) => line.count > 0);

  async function confirm() {
    if (!destination) return;
    setWorking(true);
    await onConfirm(destination, needsTarget ? targetId : null);
    setWorking(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Você está excluindo <strong className="text-foreground">{itemName}</strong>. Escolha o
            que acontece com o que depende dele — nada é decidido por omissão.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
            {loadingDependencies ? (
              <p className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Conferindo o que depende…
              </p>
            ) : relevant.length === 0 ? (
              <p className="text-muted-foreground">Nada depende disto.</p>
            ) : (
              <ul className="space-y-1">
                {relevant.map((line) => (
                  <li key={line.label} className="flex items-center gap-2">
                    <AlertTriangle className="size-4 shrink-0 text-primary" />
                    <span>
                      <strong className="tabular-nums">{line.count}</strong> {line.label}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs text-muted-foreground">O que fazer</legend>
            {options.map((option) => (
              <label
                key={option.value}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                  destination === option.value
                    ? "border-primary/50 bg-primary/5 ring-1 ring-primary/20"
                    : "hover:bg-accent",
                )}
              >
                <input
                  type="radio"
                  name="destino"
                  value={option.value}
                  checked={destination === option.value}
                  onChange={() => {
                    setDestination(option.value);
                    setTargetId(null);
                  }}
                  className="mt-0.5 size-4 accent-primary"
                />
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-sm font-medium",
                      option.tone === "destructive" && "text-destructive",
                    )}
                  >
                    {option.label}
                  </span>
                  <span className="block text-xs text-muted-foreground">{option.description}</span>
                </span>
              </label>
            ))}
          </fieldset>

          {needsTarget && (
            <div>
              <label className="text-xs text-muted-foreground" htmlFor="destino-alvo">
                {targetLabel}
              </label>
              <div className="mt-1.5">
                <Select value={targetId ?? ""} onValueChange={setTargetId}>
                  <SelectTrigger id="destino-alvo" aria-label={targetLabel}>
                    <SelectValue placeholder="Escolha" />
                  </SelectTrigger>
                  <SelectContent>
                    {targets.map((target) => (
                      <SelectItem key={target.id} value={target.id}>
                        {target.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {targets.length === 0 && (
                <p className="mt-1 text-xs text-destructive">
                  Não há outra opção disponível. Escolha outro destino.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" disabled={!canConfirm} onClick={confirm}>
            {working && <Loader2 className="size-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
