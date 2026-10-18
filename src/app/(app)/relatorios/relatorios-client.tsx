"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  FolderKanban,
  GraduationCap,
  HandCoins,
  Layers,
  ListChecks,
  Repeat,
  Scale,
  Target,
  TimerReset,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CategoriaChart } from "@/components/dashboard/categoria-chart";
import { FormaPagamentoChart } from "@/components/dashboard/forma-pagamento-chart";
import { EvolucaoChart } from "@/components/dashboard/evolucao-chart";
import { MesAMesChart } from "@/components/dashboard/mes-a-mes-chart";
import { ProjecaoChart } from "@/components/dashboard/projecao-chart";
import { FaturasChart } from "@/components/dashboard/faturas-chart";
import { CaixaNaoLido, RodapeDasFaturasSemTotal } from "@/components/financeiro/caixa-nos-graficos";
import { rotulosDosGraficos } from "@/lib/finance/rotulos-dos-graficos";
import { ReportBarChart, type BarPoint } from "@/components/reports/report-bar-chart";
import { SeletorDeVisao } from "@/components/shared/seletor-de-visao";
import { BlocoDoCaixa } from "@/components/financeiro/bloco-do-caixa";
import { monthLabel } from "@/components/dashboard/chart-theme";
import { formatCurrency, formatDate } from "@/lib/format";
import { apresentarEntradas } from "@/lib/finance/entradas-do-card";
import { fraseDoPerdoado, rotuloPendenteDoMes } from "@/lib/finance/recebimentos";
import { formatMinutes, STUDY_STATUS_LABELS } from "@/lib/studies/constants";
import { toCsv } from "@/lib/reports/csv";
import { downloadCsv, downloadJson } from "@/lib/reports/download";
import { cn } from "@/lib/utils";
import { ROTULO_DA_BASE, type BaseFinanceira } from "@/lib/finance/base";
import type { EstadoDoCaixa } from "@/lib/finance/caixa-leitura";
import type { ReportsData } from "@/lib/reports/queries";

const FREQ_LABELS: Record<string, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  quinzenal: "Quinzenal",
  mensal: "Mensal",
  bimestral: "Bimestral",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
};

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function RelatoriosClient({
  data,
  base,
  caixa,
}: {
  data: ReportsData;
  base: BaseFinanceira;
  caixa: EstadoDoCaixa | null;
}) {
  const router = useRouter();
  const { finance, card, habits, studies, tasks, mes } = data;
  const entradasNoCard = apresentarEntradas(finance.resumo);

  function setMes(value: string) {
    const params = new URLSearchParams();
    if (value) params.set("mes", value);
    if (base === "caixa") params.set("base", "caixa");
    router.push(params.toString() ? `/relatorios?${params}` : "/relatorios");
  }

  function setBase(value: BaseFinanceira) {
    const params = new URLSearchParams();
    if (mes) params.set("mes", mes);
    if (value === "caixa") params.set("base", "caixa");
    router.replace(params.toString() ? `/relatorios?${params}` : "/relatorios");
  }

  const habitsWeekly: BarPoint[] = habits.weekly.map((w) => ({
    label: w.label,
    value: Math.round(w.rate * 100),
  }));
  const studiesWeekly: BarPoint[] = studies.weekly.map((w) => ({
    label: w.label,
    value: w.minutes,
  }));
  const tasksWeekly: BarPoint[] = tasks.weekly.map((w) => ({
    label: w.label,
    value: w.completed,
  }));
  const faturasMesData: BarPoint[] = card.faturasPorMes.map((f) => ({
    label: monthLabel(f.mes),
    value: f.total,
  }));

  // Aba Financeiro — os quatro cards do topo, por base.
  // Com competência, NENHUM número muda: só os hints passam a declarar a base.
  const cardsDaBase = (() => {
    const saldo = (
      <StatCard
        key="saldo"
        label="Saldo atual"
        value={formatCurrency(finance.saldo)}
        icon={Wallet}
        hint="Hoje, todas as contas"
      />
    );
    const pendente = (
      <StatCard
        key="pendente"
        label={rotuloPendenteDoMes(finance.mes)}
        value={formatCurrency(finance.aReceber)}
        icon={HandCoins}
        hint="Recebíveis em aberto"
      />
    );

    if (base === "caixa") {
      const ok = caixa?.estado === "ok";
      return (
        <>
          {saldo}
          <StatCard
            label="Entradas de caixa"
            value={caixa?.estado === "ok" ? formatCurrency(caixa.entradasDeCaixa) : "—"}
            icon={ArrowDownLeft}
            hint={ok ? "Caixa realizado" : "Não foi possível ler o caixa"}
          />
          <StatCard
            label="Saídas de caixa"
            value={caixa?.estado === "ok" ? formatCurrency(caixa.atual.saidasDeCaixa) : "—"}
            icon={ArrowUpRight}
            hint={ok ? "Caixa realizado" : "Não foi possível ler o caixa"}
          />
          {pendente}
        </>
      );
    }

    return (
      <>
        {saldo}
        <StatCard
          label="Entradas do mês"
          value={formatCurrency(entradasNoCard.valor)}
          icon={ArrowDownLeft}
          hint={["Competência", entradasNoCard.detalhe].filter(Boolean).join(" · ")}
        />
        <StatCard
          label="Saídas do mês"
          value={formatCurrency(finance.resumo.saidas)}
          icon={ArrowUpRight}
          hint={[
            "Competência",
            `meu ${formatCurrency(finance.resumo.meu)}`,
            fraseDoPerdoado(finance.perdoado),
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        {pendente}
      </>
    );
  })();

  // Desenho 2026-10-18: os gráficos seguem a base e mostram só a parte do dono — os mesmos
  // textos do dashboard (`rotulosDosGraficos`). Caixa com erro: o gráfico diz que não leu.
  const graficosCaixa = base === "caixa" && caixa?.estado === "ok" ? caixa.graficos : null;
  const caixaErro = base === "caixa" && caixa?.estado === "erro";
  const rotulos = rotulosDosGraficos({
    base,
    ateODia:
      base === "caixa"
        ? (graficosCaixa?.mesAMes.ateODia ?? null)
        : (finance.graficoAteODia?.ateODia ?? null),
  });
  const categoriasDaBase = graficosCaixa ? graficosCaixa.categorias : finance.categorias;

  return (
    <div className="space-y-6">
      {/* Período + base + exportar tudo */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="rel-mes">Período (mês de referência)</Label>
            <input
              id="rel-mes"
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value || mes)}
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
        <Button
          variant="outline"
          onClick={() =>
            downloadJson(`relatorio-${mes}.json`, data)
          }
        >
          <Download /> Baixar relatório (JSON)
        </Button>
      </div>

      <Tabs defaultValue="financeiro" className="w-full">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 sm:h-8 sm:w-fit sm:flex-nowrap">
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="cartoes">Cartões</TabsTrigger>
          <TabsTrigger value="habitos">Hábitos</TabsTrigger>
          <TabsTrigger value="estudos">Estudos</TabsTrigger>
          <TabsTrigger value="tarefas">Tarefas</TabsTrigger>
        </TabsList>

        {/* ───────────── Financeiro ───────────── */}
        <TabsContent value="financeiro" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {cardsDaBase}
          </div>

          {base === "caixa" && caixa && <BlocoDoCaixa mesRotulo={monthLabel(mes)} caixa={caixa} />}

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={rotulos.categorias.titulo} description={rotulos.categorias.descricao}>
              {caixaErro ? <CaixaNaoLido /> : <CategoriaChart data={categoriasDaBase} />}
            </ChartCard>
            <ChartCard title={rotulos.formas.titulo} description={rotulos.formas.descricao}>
              {caixaErro ? (
                <CaixaNaoLido />
              ) : (
                <FormaPagamentoChart data={graficosCaixa ? graficosCaixa.formas : finance.formas} />
              )}
            </ChartCard>
          </div>

          <ChartCard title={rotulos.evolucao.titulo} description={rotulos.evolucao.descricao}>
            {caixaErro ? (
              <CaixaNaoLido />
            ) : (
              <EvolucaoChart data={graficosCaixa ? graficosCaixa.evolucao : finance.evolucao} />
            )}
            {graficosCaixa && (
              <RodapeDasFaturasSemTotal quantidade={graficosCaixa.minha.faturasSemTotal} />
            )}
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={rotulos.mesAMes.titulo} description={rotulos.mesAMes.descricao}>
              {caixaErro ? (
                <CaixaNaoLido />
              ) : (
                <MesAMesChart dados={graficosCaixa ? graficosCaixa.mesAMes.dados : finance.mesAMes} />
              )}
            </ChartCard>
            <ChartCard title={rotulos.projecao.titulo} description={rotulos.projecao.descricao}>
              <ProjecaoChart data={finance.projecao} />
            </ChartCard>
          </div>

          <ChartCard title={rotulos.faturas.titulo} description={rotulos.faturas.descricao}>
            <FaturasChart data={finance.faturasFuturas} />
          </ChartCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Maiores gastos por categoria</CardTitle>
                <CardDescription>
                  Movimentado (com terceiros) × valor realmente seu (mês). {ROTULO_DA_BASE[base]}.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {caixaErro ? (
                  <CaixaNaoLido />
                ) : categoriasDaBase.length === 0 ? (
                  <EmptyState icon={Scale} title="Sem gastos no período" className="py-8" />
                ) : (
                  <ul className="space-y-2">
                    {categoriasDaBase.slice(0, 8).map((c) => (
                      <li
                        key={c.categoryId ?? c.name}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-card/40 px-3 py-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden
                            className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10"
                            style={{ backgroundColor: c.color ?? "var(--primary)" }}
                          />
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="shrink-0 text-right tabular-nums">
                          <span className="font-semibold">{formatCurrency(c.movimentado)}</span>
                          {c.meu !== c.movimentado && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              (meu {formatCurrency(c.meu)})
                            </span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Assinaturas & recorrências</CardTitle>
                <CardDescription>Despesas recorrentes ativas.</CardDescription>
              </CardHeader>
              <CardContent>
                {finance.assinaturas.length === 0 ? (
                  <EmptyState icon={Repeat} title="Nenhuma recorrência ativa" className="py-8" />
                ) : (
                  <ul className="space-y-2">
                    {finance.assinaturas.slice(0, 8).map((a, i) => (
                      <li
                        key={`${a.nome}-${i}`}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-card/40 px-3 py-2 text-sm"
                      >
                        <span className="min-w-0 truncate">{a.nome}</span>
                        <span className="shrink-0 tabular-nums">
                          <span className="font-semibold">{formatCurrency(a.valor)}</span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            {FREQ_LABELS[a.frequency] ?? a.frequency}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>

          <ExportBar
            onCsv={() =>
              downloadCsv(
                `gastos-por-categoria-${mes}${base === "caixa" ? "-caixa" : ""}.csv`,
                toCsv(
                  categoriasDaBase.map((c) => ({
                    categoria: c.name,
                    movimentado: c.movimentado,
                    meu: c.meu,
                  })),
                  ["categoria", "movimentado", "meu"],
                ),
              )
            }
            label="Exportar gastos por categoria (CSV)"
          />
        </TabsContent>

        {/* ───────────── Cartões ───────────── */}
        <TabsContent value="cartoes" className="space-y-6">
          {!card.hasCards ? (
            <EmptyState
              icon={CreditCard}
              title="Nenhum cartão cadastrado"
              description="Cadastre um cartão para ver faturas, parcelamentos e valores de terceiros."
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Comprometido em parcelas" value={formatCurrency(card.parcelasComprometidas)} icon={Layers} hint={`${card.parcelasAtivas} parcela(s) em aberto`} />
                <StatCard label={rotuloPendenteDoMes(finance.mes)} value={formatCurrency(card.aReceber)} icon={HandCoins} />
                <StatCard label="Próximas faturas" value={String(card.faturas.filter((f) => f.status !== "paga").length)} icon={CreditCard} hint="Provisão de 6 ciclos" />
                <StatCard label="Total próximas faturas" value={formatCurrency(card.faturas.filter((f) => f.status !== "paga").reduce((s, f) => s + f.total, 0))} icon={CalendarClock} />
              </div>

              <ChartCard title="Faturas por mês" description="Total das faturas por competência.">
                {faturasMesData.length === 0 ? (
                  <EmptyState icon={CreditCard} title="Sem faturas ainda" className="py-8" />
                ) : (
                  <ReportBarChart data={faturasMesData} name="Total" formatValue={(v) => formatCurrency(v)} />
                )}
              </ChartCard>

              <Card>
                <CardHeader>
                  <CardTitle>Próximas 6 faturas</CardTitle>
                  <CardDescription>Total, valor realmente seu e o que terceiros precisam pagar.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {card.faturas.length === 0 ? (
                    <EmptyState icon={CreditCard} title="Sem faturas previstas" className="py-8" />
                  ) : (
                    card.faturas.map((f) => (
                      <div
                        key={`${f.cardId}-${f.competencia}`}
                        className="flex flex-col gap-1 rounded-lg border bg-card/40 px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            aria-hidden
                            className="size-2.5 rounded-full ring-1 ring-foreground/10"
                            style={{ backgroundColor: f.cardCor ?? "var(--primary)" }}
                          />
                          <span className="font-medium">{f.cardNome}</span>
                          <span className="capitalize text-muted-foreground">
                            {monthLabel(f.competencia)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            vence {formatDate(f.dataVencimento)}
                          </span>
                        </span>
                        <span className="tabular-nums">
                          <span className="font-semibold">{formatCurrency(f.total)}</span>
                          {f.terceiros > 0 && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              meu {formatCurrency(f.meu)} · terceiros {formatCurrency(f.terceiros)}
                            </span>
                          )}
                        </span>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <ExportBar
                onCsv={() =>
                  downloadCsv(
                    `faturas-por-mes.csv`,
                    toCsv(
                      card.faturasPorMes.map((f) => ({
                        mes: f.mes,
                        total: f.total,
                        meu: f.meu,
                        terceiros: f.terceiros,
                      })),
                      ["mes", "total", "meu", "terceiros"],
                    ),
                  )
                }
                label="Exportar faturas por mês (CSV)"
              />
            </>
          )}
        </TabsContent>

        {/* ───────────── Hábitos ───────────── */}
        <TabsContent value="habitos" className="space-y-6">
          {!habits.hasHabits ? (
            <EmptyState
              icon={Target}
              title="Nenhum hábito ativo"
              description="Crie hábitos para acompanhar consistência e sequências."
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <StatCard label="Taxa de conclusão (30 dias)" value={pct(habits.completionRate30)} icon={CheckCircle2} />
                <StatCard
                  label="Hábito mais consistente"
                  value={habits.ranking[0]?.name ?? "—"}
                  icon={Target}
                  hint={habits.ranking[0] ? `${pct(habits.ranking[0].rate)} · sequência ${habits.ranking[0].streak}d` : undefined}
                />
              </div>

              <ChartCard title="Consistência semanal" description="% de hábitos concluídos por semana (8 semanas).">
                <ReportBarChart data={habitsWeekly} name="Consistência" color="var(--chart-2)" formatValue={(v) => `${v}%`} />
              </ChartCard>

              <Card>
                <CardHeader>
                  <CardTitle>Ranking de consistência</CardTitle>
                  <CardDescription>Mais e menos realizados nos últimos 30 dias.</CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2">
                    {habits.ranking.map((h) => (
                      <li
                        key={h.id}
                        className="flex items-center justify-between gap-3 rounded-lg border bg-card/40 px-3 py-2 text-sm"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden
                            className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10"
                            style={{ backgroundColor: h.color ?? "var(--primary)" }}
                          />
                          <span className="truncate">{h.name}</span>
                        </span>
                        <span className="shrink-0 tabular-nums">
                          <span className="font-semibold">{pct(h.rate)}</span>
                          <span className="ml-1 text-xs text-muted-foreground">
                            {h.done}/{h.scheduled}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>

              <ExportBar
                onCsv={() =>
                  downloadCsv(
                    `habitos-consistencia.csv`,
                    toCsv(
                      habits.ranking.map((h) => ({
                        habito: h.name,
                        taxa_30d: `${Math.round(h.rate * 100)}%`,
                        concluidos: h.done,
                        agendados: h.scheduled,
                        sequencia: h.streak,
                      })),
                      ["habito", "taxa_30d", "concluidos", "agendados", "sequencia"],
                    ),
                  )
                }
                label="Exportar consistência (CSV)"
              />
            </>
          )}
        </TabsContent>

        {/* ───────────── Estudos ───────────── */}
        <TabsContent value="estudos" className="space-y-6">
          {!studies.hasCourses ? (
            <EmptyState
              icon={GraduationCap}
              title="Nenhum curso cadastrado"
              description="Cadastre cursos e registre sessões para acompanhar horas e progresso."
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Horas na semana" value={formatMinutes(studies.minutesWeek)} icon={TimerReset} />
                <StatCard label="Horas no mês" value={formatMinutes(studies.minutesMonth)} icon={TimerReset} />
                <StatCard label="Em andamento" value={String(studies.inProgress)} icon={GraduationCap} />
                <StatCard label="Atrasados" value={String(studies.overdue)} icon={TriangleAlert} />
              </div>

              <ChartCard title="Horas estudadas por semana" description="Minutos por semana (8 semanas).">
                <ReportBarChart data={studiesWeekly} name="Minutos" color="var(--chart-3)" formatValue={(v) => `${v}min`} />
              </ChartCard>

              <Card>
                <CardHeader>
                  <CardTitle>Progresso por curso</CardTitle>
                  <CardDescription>Percentual concluído e tempo estudado.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {studies.courses.map((c) => (
                    <div key={c.id} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            aria-hidden
                            className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10"
                            style={{ backgroundColor: c.coverColor ?? "var(--primary)" }}
                          />
                          <span className="truncate font-medium">{c.title}</span>
                        </span>
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {STUDY_STATUS_LABELS[c.status]} · {formatMinutes(c.studiedMinutes)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full rounded-full bg-primary"
                            style={{ width: `${Math.round(c.progressPct)}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums">
                          {Math.round(c.progressPct)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <ExportBar
                onCsv={() =>
                  downloadCsv(
                    `estudos-progresso.csv`,
                    toCsv(
                      studies.courses.map((c) => ({
                        curso: c.title,
                        status: STUDY_STATUS_LABELS[c.status],
                        progresso: `${Math.round(c.progressPct)}%`,
                        minutos_estudados: c.studiedMinutes,
                      })),
                      ["curso", "status", "progresso", "minutos_estudados"],
                    ),
                  )
                }
                label="Exportar progresso (CSV)"
              />
            </>
          )}
        </TabsContent>

        {/* ───────────── Tarefas ───────────── */}
        <TabsContent value="tarefas" className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Concluídas" value={String(tasks.completed)} icon={CheckCircle2} hint={`taxa ${pct(tasks.completionRate)}`} />
            <StatCard label="Atrasadas" value={String(tasks.overdue)} icon={TriangleAlert} />
            <StatCard label="Em andamento" value={String(tasks.inProgress)} icon={ListChecks} />
            <StatCard label="Projetos ativos" value={String(tasks.activeProjects)} icon={FolderKanban} />
          </div>

          <ChartCard title="Produtividade semanal" description="Tarefas concluídas por semana (8 semanas).">
            <ReportBarChart data={tasksWeekly} name="Concluídas" color="var(--chart-4)" formatValue={(v) => String(v)} />
          </ChartCard>

          <ExportBar
            onCsv={() =>
              downloadCsv(
                `tarefas-produtividade.csv`,
                toCsv(
                  tasks.weekly.map((w) => ({ semana: w.weekStart, concluidas: w.completed })),
                  ["semana", "concluidas"],
                ),
              )
            }
            label="Exportar produtividade (CSV)"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ───────────────────────────── Auxiliares ───────────────────────────── */

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function ExportBar({ onCsv, label }: { onCsv: () => void; label: string }) {
  return (
    <div className={cn("flex justify-end")}>
      <Button variant="outline" size="sm" onClick={onCsv}>
        <Download /> {label}
      </Button>
    </div>
  );
}
