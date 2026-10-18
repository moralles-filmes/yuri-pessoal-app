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
import { SeletorDeVisao } from "@/components/shared/seletor-de-visao";
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
import { BlocoDoCaixa } from "@/components/financeiro/bloco-do-caixa";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { apresentarEntradas } from "@/lib/finance/entradas-do-card";
import { fraseDoPerdoado, rotuloPendenteDoMes } from "@/lib/finance/recebimentos";
import { ROTULO_DA_BASE, type BaseFinanceira } from "@/lib/finance/base";
import type { EstadoDoCaixa } from "@/lib/finance/caixa-leitura";
import type { ComparativoAteODia } from "@/lib/finance/caixa";
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

/** Mês anterior em texto 'yyyy-MM' (vira o ano em janeiro), sem depender do relógio. */
function mesAnteriorTexto(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const ano = m === 1 ? y - 1 : y;
  const mesNum = m === 1 ? 12 : m - 1;
  return `${ano}-${String(mesNum).padStart(2, "0")}`;
}

/** Nome do mês anterior por extenso em pt-BR (mesmo Intl de monthYearLabel). */
function nomeDoMesAnterior(mes: string): string {
  return monthYearLabel(mesAnteriorTexto(mes));
}

function pctText(pct: number | null): string {
  if (pct === null) return "—";
  return `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`;
}

/** Direção da seta a partir do sinal da porcentagem (null = neutral). */
function direcaoDoPct(pct: number | null): "up" | "down" | "neutral" {
  if (pct === null || pct === 0) return "neutral";
  return pct > 0 ? "up" : "down";
}

/** Monta a URL do dashboard preservando o mês e a base caixa quando ativa. */
function urlDoDashboard(mes: string, base: BaseFinanceira): string {
  const params = new URLSearchParams();
  if (mes) params.set("mes", mes);
  if (base === "caixa") params.set("base", "caixa");
  return params.toString()
    ? `/dashboard/financeiro?${params.toString()}`
    : "/dashboard/financeiro";
}

export function DashboardClient({
  mesSel,
  base,
  caixa,
  saldo,
  resumo,
  perdoado,
  comparativo,
  corteCompetencia,
  graficoAteODia,
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
  base: BaseFinanceira;
  caixa: EstadoDoCaixa | null;
  saldo: number;
  resumo: ResumoMes;
  perdoado: number;
  comparativo: Comparativo;
  corteCompetencia: ComparativoAteODia;
  graficoAteODia: { ateODia: number; comparativo: Comparativo } | null;
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
    // Preserva a base caixa (?base=caixa) quando ativa.
    router.push(urlDoDashboard(mes, base));
  }

  function setBase(b: BaseFinanceira) {
    // Competência = sem o parâmetro; caixa = ?base=caixa.
    router.replace(urlDoDashboard(mesSel, b));
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

  const entradasNoCard = apresentarEntradas(resumo);
  const frase = fraseDoPerdoado(perdoado);

  // Cards do topo: com competência nada muda nos números, só os hints declaram a base (K2).
  const caixaOk = base === "caixa" && caixa?.estado === "ok" ? caixa : null;
  const caixaErro = base === "caixa" && caixa?.estado === "erro";

  // Corte "até o dia D" do mês em andamento (K3). Mês fechado => null => tela de hoje.
  const corte: ComparativoAteODia | null = caixaOk ? caixaOk.corte : caixaErro ? null : corteCompetencia;
  const corteAtivo = corte !== null && corte.ateODia !== null;
  const diaDoCorte = corteAtivo ? corte.ateODia : null;
  const mesAnteriorRotulo = nomeDoMesAnterior(mesSel);

  function hintDoPeriodo(pct: number | null): string {
    return pct === null
      ? `sem base de comparação com ${mesAnteriorRotulo}`
      : `vs. o mesmo período de ${mesAnteriorRotulo}`;
  }

  const entradasCard = caixaOk
    ? corteAtivo && corte
      ? {
          label: "Entradas de caixa",
          value: formatCurrency(caixaOk.entradasDeCaixa),
          hint: `até o dia ${diaDoCorte}: ${hintDoPeriodo(corte.entradas.pct)} · Caixa realizado`,
          trend: {
            value: pctText(corte.entradas.pct),
            direction: direcaoDoPct(corte.entradas.pct),
          },
        }
      : {
          label: "Entradas de caixa",
          value: formatCurrency(caixaOk.entradasDeCaixa),
          hint: "Caixa realizado · vs. mês anterior",
          trend: {
            value: pctText(caixaOk.entradasPct),
            direction:
              caixaOk.entradasPct === null
                ? ("neutral" as const)
                : caixaOk.entradasPct > 0
                  ? ("up" as const)
                  : caixaOk.entradasPct < 0
                    ? ("down" as const)
                    : ("neutral" as const),
          },
        }
    : caixaErro
      ? {
          label: "Entradas de caixa",
          value: "—",
          hint: "Não foi possível ler o caixa",
          trend: undefined,
        }
      : corteAtivo && corte
        ? {
            label: "Entradas do mês",
            value: formatCurrency(entradasNoCard.valor),
            hint: [
              `até o dia ${diaDoCorte}: ${hintDoPeriodo(corte.entradas.pct)}`,
              entradasNoCard.detalhe ? `Competência · ${entradasNoCard.detalhe}` : "Competência",
            ].join(" · "),
            trend: {
              value: pctText(corte.entradas.pct),
              direction: direcaoDoPct(corte.entradas.pct),
            },
          }
        : {
            label: "Entradas do mês",
            value: formatCurrency(entradasNoCard.valor),
            hint: entradasNoCard.detalhe
              ? `Competência · vs. mês anterior · ${entradasNoCard.detalhe}`
              : "Competência · vs. mês anterior",
            trend: {
              value: pctText(comparativo.deltaEntradasPct),
              direction:
                comparativo.deltaEntradas > 0
                  ? ("up" as const)
                  : comparativo.deltaEntradas < 0
                    ? ("down" as const)
                    : ("neutral" as const),
            },
          };

  const saidasCard = caixaOk
    ? corteAtivo && corte
      ? {
          label: "Saídas de caixa",
          value: formatCurrency(caixaOk.atual.saidasDeCaixa),
          hint: `até o dia ${diaDoCorte}: ${hintDoPeriodo(corte.saidas.pct)} · Caixa realizado`,
          trend: { value: pctText(corte.saidas.pct), direction: "neutral" as const },
        }
      : {
          label: "Saídas de caixa",
          value: formatCurrency(caixaOk.atual.saidasDeCaixa),
          hint: "Caixa realizado · vs. mês anterior",
          trend: { value: pctText(caixaOk.saidasPct), direction: "neutral" as const },
        }
    : caixaErro
      ? {
          label: "Saídas de caixa",
          value: "—",
          hint: "Não foi possível ler o caixa",
          trend: undefined,
        }
      : corteAtivo && corte
        ? {
            label: "Saídas do mês",
            value: formatCurrency(resumo.saidas),
            // O VALOR é o mês inteiro, com cartão; só a SETA é do corte, e ela fala das saídas à
            // vista — por isso o hint diz de quem é cada número.
            hint: [
              `Competência · meu ${formatCurrency(resumo.meu)}`,
              `seta: saídas à vista até o dia ${diaDoCorte}, ${hintDoPeriodo(corte.saidas.pct)}`,
              "o cartão não entra (a fatura não se divide por dia)",
            ].join(" · "),
            trend: { value: pctText(corte.saidas.pct), direction: "neutral" as const },
          }
        : {
            label: "Saídas do mês",
            value: formatCurrency(resumo.saidas),
            hint: `Competência · meu ${formatCurrency(resumo.meu)}`,
            trend: { value: pctText(comparativo.deltaSaidasPct), direction: "neutral" as const },
          };

  return (
    <div className="space-y-6">
      {/* Filtro de período e base dos números */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
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
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-sm font-medium">Base:</span>
          <SeletorDeVisao
            rotulo="Base dos números"
            visoes={["competencia", "caixa"] as const}
            rotulos={ROTULO_DA_BASE}
            atual={base}
            aoEscolher={setBase}
          />
        </div>
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
        <StatCard
          label="Saldo atual"
          value={formatCurrency(saldo)}
          icon={Wallet}
          hint="Hoje, todas as contas"
        />
        <StatCard
          label={entradasCard.label}
          value={entradasCard.value}
          icon={ArrowDownLeft}
          hint={entradasCard.hint}
          trend={entradasCard.trend}
        />
        <StatCard
          label={saidasCard.label}
          value={saidasCard.value}
          icon={ArrowUpRight}
          hint={saidasCard.hint}
          trend={saidasCard.trend}
        />
        <StatCard
          label={rotuloPendenteDoMes(mesSel)}
          value={formatCurrency(aReceber)}
          icon={HandCoins}
          hint="Recebíveis em aberto"
        />
      </div>

      {/* Bloco do caixa (só na base caixa) */}
      {base === "caixa" && caixa && (
        <BlocoDoCaixa mesRotulo={monthYearLabel(mesSel)} caixa={caixa} />
      )}

      {/* Card-âncora: valor pessoal × terceiros + cartão × à vista + faturas + contas */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="overflow-hidden ring-1 ring-primary/25">
          <CardContent className="p-5">
            <div className="flex items-start justify-between gap-4">
              {/* `min-w-0`: mesma razão do StatCard — sem ele o texto empurra o ícone
                  para fora e o `overflow-hidden` do Card corta o ícone pela metade. */}
              <div className="min-w-0 space-y-1">
                <p className="text-sm font-medium break-words text-muted-foreground">
                  Valor realmente meu · {monthYearLabel(mesSel)} · Competência
                </p>
                <p className="text-3xl font-semibold tracking-tight tabular-nums">
                  {formatCurrency(resumo.meu)}
                </p>
                {frase !== null && (
                  <p className="text-xs break-words text-muted-foreground">{frase}</p>
                )}
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
            hint={`Pela fatura · à vista ${formatCurrency(resumo.aVista)}`}
          />
          <StatCard
            label="Faturas (aberta/fechada)"
            value={`${faturasAbertas}/${faturasFechadas}`}
            icon={ReceiptText}
            hint="Pela fatura · no período em diante"
          />
          <StatCard
            label="Próximas contas a pagar"
            value={formatCurrency(contas.total)}
            icon={CalendarClock}
            hint={
              contas.proxima
                ? `Pelo vencimento · ${contas.count} conta(s) · 1ª em ${formatDate(contas.proxima.data)}`
                : "Pelo vencimento · nenhuma nos próximos 31 dias"
            }
          />
          <StatCard
            label="Cartão realmente meu"
            value={formatCurrency(resumo.cartaoMeu)}
            icon={Scale}
            hint={`Pela fatura · terceiros ${formatCurrency(resumo.cartao - resumo.cartaoMeu)}`}
          />
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Gastos por categoria</CardTitle>
            <CardDescription>Distribuição de {monthYearLabel(mesSel)}. Competência.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoriaChart data={categorias} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Por forma de pagamento</CardTitle>
            <CardDescription>Cartão, débito, pix, dinheiro e mais. Competência.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormaPagamentoChart data={formas} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Evolução mensal</CardTitle>
          <CardDescription>Entradas, saídas e saldo dos últimos 6 meses. Competência.</CardDescription>
        </CardHeader>
        <CardContent>
          <EvolucaoChart data={evolucao} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            {graficoAteODia !== null ? (
              <>
                <CardTitle>Mês a mês · até o dia {graficoAteODia.ateODia}</CardTitle>
                <CardDescription>
                  Competência. Os dois meses até o mesmo dia; saídas só à vista — o cartão não entra
                  (a fatura não se divide por dia).
                </CardDescription>
              </>
            ) : (
              <>
                <CardTitle>Mês a mês</CardTitle>
                <CardDescription>Comparativo com o mês anterior. Competência.</CardDescription>
              </>
            )}
          </CardHeader>
          <CardContent>
            <MesAMesChart
              comparativo={graficoAteODia !== null ? graficoAteODia.comparativo : comparativo}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Projeção dos próximos meses</CardTitle>
            <CardDescription>Faturas, recorrências e contas fixas. Pelo vencimento.</CardDescription>
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
