import Link from "next/link";
import { lerResumoDoDashboard } from "@/lib/dashboard/resumo-financeiro";
import type { ResumoDoDashboard } from "@/lib/dashboard/resumo-financeiro-puro";
import { formatCurrency, formatDate } from "@/lib/format";
import { fraseDoPerdoado, rotuloPendenteDoMes } from "@/lib/finance/recebimentos";
import { ehErroDeLeitura, registrarFalhaDeLeitura, type ErroDeLeitura } from "@/lib/supabase/leitura";
import { CardSemLeitura } from "@/components/shared/card-sem-leitura";
import { BarrasEntradasSaidasChart } from "@/components/dashboard/barras-entradas-saidas-chart";
import { MetricRow } from "./primitives";
import type { DashWindow } from "@/lib/dashboard/period";

/**
 * Corpo do card Financeiro — total movimentado × valor realmente meu (distinção sagrada), as
 * barras dos últimos 6 meses e três linhas. As entradas e o saldo vivem na faixa do Resumo
 * financeiro (D-06-2), que lê a mesma leitura única.
 */
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
  let d: ResumoDoDashboard | null = null;
  let falha: ErroDeLeitura | null = null;
  try {
    d = await lerResumoDoDashboard(window.mes, todayIso);
  } catch (e) {
    if (!ehErroDeLeitura(e)) throw e;
    falha = e;
    registrarFalhaDeLeitura(e);
  }
  if (falha || !d) {
    return <CardSemLeitura oQue={falha?.oQue ?? "os dados do card"} href="/dashboard" />;
  }

  const n = d.numeros;

  return (
    <div className="space-y-3">
      {/* A base em que este card lê os números. Sem seletor aqui: o card é vitrine, não painel. */}
      <p className="text-xs text-muted-foreground">Base: competência</p>

      <div className="rounded-lg bg-primary/10 p-3 ring-1 ring-primary/15">
        <p className="text-xs text-muted-foreground">Realmente meu</p>
        <p className="mt-0.5 text-2xl font-semibold tabular-nums text-primary">{formatCurrency(n.meu)}</p>
        <p className="text-[0.7rem] text-muted-foreground">
          {[`de ${formatCurrency(n.saidas)} movimentados`, fraseDoPerdoado(n.perdoado)].filter(Boolean).join(" · ")}
        </p>
      </div>

      {d.completudeDoMes.estado === "parcial" ? (
        <p role="status" className="text-xs font-medium text-warning-ink">
          parcial · a leitura atingiu o teto de lançamentos; pode faltar coisa
        </p>
      ) : null}

      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">Minhas entradas × minhas saídas · últimos 6 meses</span>
          <Link href="/relatorios" className="shrink-0 font-medium text-primary hover:underline">
            Ver relatório ›
          </Link>
        </div>
        <BarrasEntradasSaidasChart dados={d.barras} />
        {d.completudeDoHistorico.estado === "parcial" ? (
          <p role="status" className="text-xs font-medium text-warning-ink">
            o histórico das barras pode estar incompleto
          </p>
        ) : null}
      </div>

      <div className="space-y-2 border-t pt-3">
        <MetricRow label="De terceiros" value={formatCurrency(n.terceiros)} />
        <MetricRow label={rotuloPendenteDoMes(window.mes)} value={formatCurrency(n.aReceber)} />
        <MetricRow label="Próximas contas a pagar" value={formatCurrency(n.contasTotal)} />
        <p className="text-xs text-muted-foreground">
          {n.proximaConta
            ? `${n.contasCount} conta(s) · 1ª: ${n.proximaConta.nome} em ${formatDate(n.proximaConta.data)}`
            : "Nenhuma nos próximos 31 dias"}
        </p>
      </div>
    </div>
  );
}
