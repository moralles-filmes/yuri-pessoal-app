import { getFinanceCardData } from "@/lib/dashboard/queries";
import { formatCurrency, formatDate } from "@/lib/format";
import { Metric, MetricRow } from "./primitives";
import type { DashWindow } from "@/lib/dashboard/period";

/** Corpo do card Financeiro — total movimentado × valor realmente meu (distinção sagrada). */
export async function FinanceCard({
  window,
  todayIso,
}: {
  window: DashWindow;
  todayIso: string;
}) {
  const d = await getFinanceCardData(window.mes, todayIso);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Saldo das contas" value={formatCurrency(d.saldo)} />
        <Metric
          label="Realmente meu"
          value={formatCurrency(d.meu)}
          accent
          hint={`de ${formatCurrency(d.saidas)} movimentados`}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Entradas" value={formatCurrency(d.entradas)} />
        <Metric label="Saídas" value={formatCurrency(d.saidas)} />
      </div>
      <div className="space-y-2 border-t pt-3">
        <MetricRow label="No cartão" value={formatCurrency(d.cartao)} />
        <MetricRow label="À vista" value={formatCurrency(d.aVista)} />
        <MetricRow label="De terceiros" value={formatCurrency(d.terceiros)} />
        <MetricRow label="A receber de terceiros" value={formatCurrency(d.aReceber)} />
      </div>
      <div className="border-t pt-3">
        <MetricRow label="Próximas contas a pagar" value={formatCurrency(d.contasTotal)} />
        <p className="mt-1 text-xs text-muted-foreground">
          {d.proximaConta
            ? `${d.contasCount} conta(s) · 1ª: ${d.proximaConta.nome} em ${formatDate(d.proximaConta.data)}`
            : "Nenhuma nos próximos 31 dias"}
        </p>
      </div>
    </div>
  );
}
