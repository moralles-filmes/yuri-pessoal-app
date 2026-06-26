"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CreditCard,
  HandCoins,
  ReceiptText,
  Scale,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { StatementStatusBadge } from "@/components/financeiro/badges";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { CategoriaChart } from "@/components/dashboard/categoria-chart";
import { FormaPagamentoChart } from "@/components/dashboard/forma-pagamento-chart";
import { MesAMesChart } from "@/components/dashboard/mes-a-mes-chart";
import { EvolucaoChart } from "@/components/dashboard/evolucao-chart";
import { ProjecaoChart } from "@/components/dashboard/projecao-chart";
import type {
  Alerta,
  CategoriaSlice,
  Comparativo,
  EvolucaoPonto,
  FaturaProvisao,
  FormaSlice,
  ProjecaoPonto,
  ProximasContas,
  ResumoMes,
} from "@/lib/finance/dashboard";

function monthYearLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1),
  );
}

function pctText(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

export function DashboardClient({
  mesSel,
  saldo,
  resumo,
  comparativo,
  evolucao,
  categorias,
  formas,
  faturas,
  projecao,
  alertas,
  contas,
  aReceber,
  faturasAbertas,
  faturasFechadas,
}: {
  mesSel: string;
  saldo: number;
  resumo: ResumoMes;
  comparativo: Comparativo;
  evolucao: EvolucaoPonto[];
  categorias: CategoriaSlice[];
  formas: FormaSlice[];
  faturas: FaturaProvisao[];
  projecao: ProjecaoPonto[];
  alertas: Alerta[];
  contas: ProximasContas;
  aReceber: number;
  faturasAbertas: number;
  faturasFechadas: number;
}) {
  const router = useRouter();

  function setMes(mes: string) {
    const params = new URLSearchParams();
    if (mes) params.set("mes", mes);
    router.push(
      params.toString()
        ? `/dashboard/financeiro?${params.toString()}`
        : "/dashboard/financeiro",
    );
  }

  // Próximas 6 faturas agrupadas por cartão (mantém a ordem por vencimento).
  const faturasPorCartao = React.useMemo(() => {
    const map = new Map<string, { nome: string; cor: string | null; itens: FaturaProvisao[] }>();
    for (const f of faturas) {
      const cur = map.get(f.cardId) ?? { nome: f.cardNome, cor: f.cardCor, itens: [] };
      cur.itens.push(f);
      map.set(f.cardId, cur);
    }
    return [...map.values()];
  }, [faturas]);

  return (
    <div className="space-y-6">
      {/* Filtro de período */}
      <div className="flex flex-col gap-1.5 sm:max-w-xs">
        <Label htmlFor="dash-mes">Período (mês)</Label>
        <input
          id="dash-mes"
          type="month"
          value={mesSel}
          onChange={(e) => setMes(e.target.value || mesSel)}
          className="h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm"
        />
      </div>

      {/* Alertas */}
      {alertas.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {alertas.map((a, i) => (
            <div
              key={`${a.kind}-${i}`}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3.5",
                a.severity === "danger"
                  ? "border-destructive/30 bg-destructive/5"
                  : "border-amber-500/30 bg-amber-500/5",
              )}
            >
              <div
                className={cn(
                  "mt-0.5 shrink-0",
                  a.severity === "danger" ? "text-destructive" : "text-amber-600 dark:text-amber-400",
                )}
              >
                {a.severity === "danger" ? (
                  <TriangleAlert className="size-5" />
                ) : (
                  <AlertTriangle className="size-5" />
                )}
              </div>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-xs text-muted-foreground">{a.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cards de resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Saldo atual" value={formatCurrency(saldo)} icon={Wallet} hint="Soma das contas" />
        <StatCard
          label="Entradas do mês"
          value={formatCurrency(resumo.entradas)}
          icon={ArrowDownLeft}
          hint="vs. mês anterior"
          trend={{
            value: pctText(comparativo.deltaEntradasPct),
            direction:
              comparativo.deltaEntradas > 0 ? "up" : comparativo.deltaEntradas < 0 ? "down" : "neutral",
          }}
        />
        <StatCard
          label="Saídas do mês"
          value={formatCurrency(resumo.saidas)}
          icon={ArrowUpRight}
          hint={`meu ${formatCurrency(resumo.meu)}`}
          trend={{ value: pctText(comparativo.deltaSaidasPct), direction: "neutral" }}
        />
        <StatCard
          label="A receber de terceiros"
          value={formatCurrency(aReceber)}
          icon={HandCoins}
          hint="Pendente de outras pessoas"
        />
      </div>

      {/* Card-âncora: valor pessoal × terceiros + cartão × à vista + faturas + contas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden ring-1 ring-primary/25">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-muted-foreground">
                  Valor realmente meu · {monthYearLabel(mesSel)}
                </p>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatCurrency(resumo.meu)}
                </p>
              </div>
              <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                <Scale className="size-5" />
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Total movimentado</p>
                <p className="font-semibold tabular-nums">{formatCurrency(resumo.saidas)}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">De terceiros</p>
                <p className="font-semibold tabular-nums">{formatCurrency(resumo.terceiros)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2">
          <StatCard
            label="Gasto no cartão"
            value={formatCurrency(resumo.cartao)}
            icon={CreditCard}
            hint={`à vista ${formatCurrency(resumo.aVista)}`}
          />
          <StatCard
            label="Faturas (aberta/fechada)"
            value={`${faturasAbertas}/${faturasFechadas}`}
            icon={ReceiptText}
            hint="No período em diante"
          />
          <StatCard
            label="Próximas contas a pagar"
            value={formatCurrency(contas.total)}
            icon={CalendarClock}
            hint={
              contas.proxima
                ? `${contas.count} conta(s) · 1ª em ${formatDate(contas.proxima.data)}`
                : "Nenhuma nos próximos 31 dias"
            }
          />
          <StatCard
            label="Cartão realmente meu"
            value={formatCurrency(resumo.cartaoMeu)}
            icon={Scale}
            hint={`terceiros ${formatCurrency(resumo.cartao - resumo.cartaoMeu)}`}
          />
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoria</CardTitle>
            <CardDescription>Distribuição de {monthYearLabel(mesSel)}.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoriaChart data={categorias} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por forma de pagamento</CardTitle>
            <CardDescription>Cartão, débito, pix, dinheiro e mais.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormaPagamentoChart data={formas} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolução mensal</CardTitle>
          <CardDescription>Entradas, saídas e saldo dos últimos 6 meses.</CardDescription>
        </CardHeader>
        <CardContent>
          <EvolucaoChart data={evolucao} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Mês a mês</CardTitle>
            <CardDescription>Comparativo com o mês anterior.</CardDescription>
          </CardHeader>
          <CardContent>
            <MesAMesChart comparativo={comparativo} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Projeção dos próximos meses</CardTitle>
            <CardDescription>Faturas, recorrências e contas fixas.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProjecaoChart data={projecao} />
          </CardContent>
        </Card>
      </div>

      {/* Próximas 6 faturas por cartão */}
      {faturasPorCartao.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Próximas 6 faturas</CardTitle>
            <CardDescription>
              Provisão por cartão — total, valor realmente seu e o que terceiros precisam pagar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {faturasPorCartao.map((cartao, idx) => (
              <div key={idx} className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="size-3 rounded-full ring-1 ring-foreground/10"
                    style={{ backgroundColor: cartao.cor ?? "var(--primary)" }}
                  />
                  <span className="text-sm font-medium">{cartao.nome}</span>
                </div>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                  {cartao.itens.map((f) => (
                    <div
                      key={f.competencia}
                      className="rounded-xl border bg-card/40 p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium capitalize">
                          {monthYearLabel(f.competencia)}
                        </span>
                        {f.virtual ? (
                          <Badge variant="outline" className="text-muted-foreground">
                            Prevista
                          </Badge>
                        ) : (
                          <StatementStatusBadge status={f.status} />
                        )}
                      </div>
                      <p className="mt-1.5 text-lg font-semibold tabular-nums">
                        {formatCurrency(f.total)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        vence {formatDate(f.dataVencimento)}
                      </p>
                      {f.terceiros > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          meu{" "}
                          <span className="font-medium text-foreground">
                            {formatCurrency(f.meu)}
                          </span>{" "}
                          · terceiros{" "}
                          <span className="font-medium text-foreground">
                            {formatCurrency(f.terceiros)}
                          </span>
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
