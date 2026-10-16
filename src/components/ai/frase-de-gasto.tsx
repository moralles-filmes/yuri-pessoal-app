import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";
import { AVISO_DE_GASTO } from "@/lib/ai/gasto";

/**
 * REDESIGN-07-D · D2 — a frase de gasto ao lado do gatilho.
 *
 * Quem a usa liga o botão a ela por `aria-describedby={id}`: o leitor de tela ouve o nome do
 * botão e, em seguida, que ele gasta. A frase é a mesma em toda tela (`@/lib/ai/gasto`).
 */
export function FraseDeGasto({ id, className }: { id: string; className?: string }) {
  return (
    <p id={id} className={cn("flex items-start gap-1.5 text-xs text-muted-foreground", className)}>
      <Wallet className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{AVISO_DE_GASTO}</span>
    </p>
  );
}
