import { Badge } from "@/components/ui/badge";
import { StatementStatusBadge } from "@/components/financeiro/badges";
import { getInvoicesCardData } from "@/lib/dashboard/queries";
import { formatCurrency, formatDate } from "@/lib/format";
import { Metric, MetricRow, CardEmpty } from "./primitives";

/** Corpo do card Cartões & Faturas — abertas/fechadas, próximos vencimentos, a receber. */
export async function InvoicesCard({ todayIso }: { todayIso: string }) {
  const d = await getInvoicesCardData(todayIso);

  if (!d.hasCards) {
    return <CardEmpty>Nenhum cartão cadastrado ainda.</CardEmpty>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Metric label="Abertas" value={String(d.abertas)} />
        <Metric label="Fechadas" value={String(d.fechadas)} />
        <Metric label="Pagas" value={String(d.pagas)} />
      </div>
      <MetricRow
        label="A receber de terceiros"
        value={formatCurrency(d.aReceber)}
        className="border-t pt-3"
      />
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Próximos vencimentos</p>
        {d.proximas.length === 0 ? (
          <CardEmpty>Sem faturas próximas.</CardEmpty>
        ) : (
          d.proximas.map((f, i) => (
            <div
              key={`${f.competencia}-${i}`}
              className="flex items-center justify-between gap-2 rounded-lg border bg-card/40 p-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10"
                    style={{ backgroundColor: f.cardCor ?? "var(--primary)" }}
                  />
                  <span className="truncate text-sm font-medium">{f.cardNome}</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  vence {formatDate(f.dataVencimento)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold tabular-nums">
                  {formatCurrency(f.total)}
                </p>
                {f.virtual ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Prevista
                  </Badge>
                ) : (
                  <StatementStatusBadge status={f.status} />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
