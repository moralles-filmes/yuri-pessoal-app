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
        accent && "bg-primary/10",
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

const TONS_DO_QUADRO = {
  neutro: { caixa: "bg-muted/60", rotulo: "text-muted-foreground", valor: "" },
  vermelho: { caixa: "bg-destructive/10", rotulo: "text-destructive", valor: "text-destructive" },
  verde: { caixa: "bg-success/10", rotulo: "text-success-ink", valor: "text-success-ink" },
  ambar: { caixa: "bg-warning/15", rotulo: "text-warning-ink", valor: "text-warning-ink" },
} as const;

/**
 * Quadro de número da moldura nova (valor grande + rótulo). O valor quebra linha em vez de ser
 * truncado: dinheiro cortado pela metade é pior que um quadro mais alto.
 */
export function Quadro({
  valor,
  rotulo,
  tom = "neutro",
}: {
  valor: string;
  rotulo: string;
  tom?: "neutro" | "vermelho" | "verde" | "ambar";
}) {
  const t = TONS_DO_QUADRO[tom];
  return (
    <div className={cn("min-w-0 rounded-[10px] p-3", t.caixa)}>
      <p className={cn("text-lg font-semibold tabular-nums break-words", t.valor)}>{valor}</p>
      <p className={cn("text-xs", t.rotulo)}>{rotulo}</p>
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
