import { getFinanceCardData } from "@/lib/dashboard/queries";
import { formatCurrency, formatDate } from "@/lib/format";
import { apresentarEntradas } from "@/lib/finance/entradas-do-card";
import { fraseDoPerdoado, rotuloPendenteDoMes } from "@/lib/finance/recebimentos";
import { ehErroDeLeitura, registrarFalhaDeLeitura, type ErroDeLeitura } from "@/lib/supabase/leitura";
import { CardSemLeitura } from "@/components/shared/card-sem-leitura";
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
  // 03-G (L4, D-G17): captura SÓ ErroDeLeitura e SÓ a leitura. O JSX fica fora do try (regra
  // react-hooks/error-boundaries). Qualquer outra exceção sobe para o error.tsx. Em produção o
  // error.tsx não saberia dizer qual leitura falhou; aqui o `oQue` ainda existe (K1.3).
  let d: Awaited<ReturnType<typeof getFinanceCardData>> | null = null;
  let falha: ErroDeLeitura | null = null;
  try {
    d = await getFinanceCardData(window.mes, todayIso);
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    falha = e;
    registrarFalhaDeLeitura(e);
  }
  if (falha || !d) {
    return <CardSemLeitura oQue={falha?.oQue ?? "os dados do card"} href="/dashboard" />;
  }

  const entradasNoCard = apresentarEntradas(d);

  return (
    <div className="space-y-3">
      {/* A base em que este card lê os números. Sem seletor aqui: o card é vitrine, não painel. */}
      <p className="text-xs text-muted-foreground">Base: competência</p>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Saldo das contas" value={formatCurrency(d.saldo)} />
        <Metric
          label="Realmente meu"
          value={formatCurrency(d.meu)}
          accent
          hint={[`de ${formatCurrency(d.saidas)} movimentados`, fraseDoPerdoado(d.perdoado)].filter(Boolean).join(" · ")}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Metric label="Entradas" value={formatCurrency(entradasNoCard.valor)} hint={entradasNoCard.detalhe ?? undefined} />
        <Metric label="Saídas" value={formatCurrency(d.saidas)} />
      </div>
      <div className="space-y-2 border-t pt-3">
        <MetricRow label="No cartão" value={formatCurrency(d.cartao)} />
        <MetricRow label="À vista" value={formatCurrency(d.aVista)} />
        <MetricRow label="De terceiros" value={formatCurrency(d.terceiros)} />
        <MetricRow label={rotuloPendenteDoMes(window.mes)} value={formatCurrency(d.aReceber)} />
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
