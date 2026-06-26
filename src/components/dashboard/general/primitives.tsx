/**
 * Fase 12 — Primitivas presentacionais dos cards do Dashboard Geral (sem estado).
 * Server-safe: usadas dentro dos corpos de card (Server Components) e nos client.
 */
import { cn } from "@/lib/utils";

/** Bloco de KPI compacto (rótulo + valor). `accent` realça em dourado. */
export function Metric({
  label,
  value,
  accent,
  hint,
  className,
}: {
  label: string;
  value: string;
  accent?: boolean;
  hint?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-lg bg-muted/50 p-3",
        accent && "bg-primary/10 ring-1 ring-primary/15",
        className,
      )}
    >
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-0.5 text-lg font-semibold tabular-nums",
          accent && "text-primary",
        )}
      >
        {value}
      </p>
      {hint && <p className="text-[0.7rem] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Linha rótulo → valor (lista compacta). */
export function MetricRow({
  label,
  value,
  className,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-2 text-sm", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** Mensagem de vazio compacta dentro de um card. */
export function CardEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="py-6 text-center text-sm text-muted-foreground">{children}</p>
  );
}
