"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Download,
  FolderKanban,
  GraduationCap,
  HandCoins,
  Layers,
  ListChecks,
  Target,
  TimerReset,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bloco } from "@/components/shared/painel/bloco";
import { Indicador, INDICADOR_PEQUENO_NO_CELULAR } from "@/components/shared/painel/indicador";
import { BotaoDoOlho, OlhoDosValores } from "@/components/shared/painel/olho-dos-valores";
import { ValorComOlho } from "@/components/shared/painel/valor-com-olho";
import { GavetaDeRegistros } from "@/components/shared/painel/gaveta-de-registros";
import { BarraDeFiltros, SeletorDoMes } from "@/components/reports/barra-de-filtros";
import { RoscaCategoriasChart } from "@/components/dashboard/rosca-categorias-chart";
import { FormaPagamentoChart } from "@/components/dashboard/forma-pagamento-chart";
import { MesAMesChart } from "@/components/dashboard/mes-a-mes-chart";
import { BarrasEntradasSaidasChart } from "@/components/dashboard/barras-entradas-saidas-chart";
import { ProjecaoChart } from "@/components/dashboard/projecao-chart";
import { FaturasChart } from "@/components/dashboard/faturas-chart";
import { AvisoParcial } from "@/components/financeiro/aviso-parcial";
import { RodapeDasFaturasSemTotal } from "@/components/financeiro/caixa-nos-graficos";
import { rotulosDaComposicao, rotulosDosGraficos } from "@/lib/finance/rotulos-dos-graficos";
import { ReportBarChart, type BarPoint } from "@/components/reports/report-bar-chart";
import { BlocoDoCaixa } from "@/components/financeiro/bloco-do-caixa";
import { monthLabel } from "@/components/dashboard/chart-theme";
import { formatCurrency, formatDate } from "@/lib/format";
import { fraseDoPerdoado, rotuloPendenteDoMes } from "@/lib/finance/recebimentos";
import { SEM_RECORTE, type TipoDeRecorte } from "@/lib/finance/recorte";
import { urlDoRelatorio } from "@/lib/reports/url-do-relatorio";
import type { EstadoDoBloco as EstadoDoBlocoNaTela } from "@/lib/painel/bloco";
import type { GavetaDoRelatorio, RelatorioFinanceiro } from "@/lib/reports/financeiro";
import { formatMinutes, STUDY_STATUS_LABELS } from "@/lib/studies/constants";
import { toCsv } from "@/lib/reports/csv";
import { downloadCsv, downloadJson } from "@/lib/reports/download";
import { cn } from "@/lib/utils";
import { ROTULO_DA_BASE } from "@/lib/finance/base";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import { valorDaFatura } from "@/lib/finance/painel";
import type { ReportsData } from "@/lib/reports/queries";
import { MATERIAL_LADRILHO } from "@/components/ui/materiais";

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
  gaveta,
  valoresOcultos,
}: {
  data: ReportsData;
  /** 04-B: a vista da gaveta e as URLs dos registros. Fora de `data`: o JSON exportado não as leva. */
  gaveta: GavetaDoRelatorio;
  /** O olho dos valores, lido do cookie no servidor (D-A2-8). */
  valoresOcultos: boolean;
}) {
  const { financeiro, card, habits, studies, tasks, mes } = data;

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

  const cartoesNaProvisao = new Set(card.faturas.map((f) => f.cardId)).size;
  const rotuloCartoes = `${cartoesNaProvisao} ${cartoesNaProvisao === 1 ? "cartão" : "cartões"}`;

  return (
    <div className="space-y-6">
      {/* Exportar tudo. O período, a base e os recortes moram na barra de filtros da aba Financeiro. */}
      <div className="flex justify-end">
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
          <AbaFinanceiro financeiro={financeiro} gaveta={gaveta} valoresOcultos={valoresOcultos} />
        </TabsContent>

        {/* ───────────── Cartões ───────────── */}
        <TabsContent value="cartoes" className="space-y-6">
          {/* O mês vale para esta aba também: o seletor mora na barra da aba Financeiro, e aqui volta. */}
          <SeletorDoMes filtros={financeiro.filtros} id="rel-mes-cartoes" />
          {!card.hasCards ? (
            <EmptyState
              icon={CreditCard}
              title="Nenhum cartão cadastrado"
              description="Cadastre um cartão para ver faturas, parcelamentos e valores de terceiros."
            />
          ) : (
            <>
              <Link href="/cartoes/relatorios" className="text-sm text-foreground underline">
                Ver o relatório de cartões ›
              </Link>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard label="Comprometido em parcelas" value={formatCurrency(card.parcelasComprometidas)} icon={Layers} hint={`${card.parcelasAtivas} parcela(s) em aberto`} />
                <StatCard label={rotuloPendenteDoMes(mes)} value={formatCurrency(card.aReceber)} icon={HandCoins} />
                <StatCard label="Próximas faturas" value={String(card.faturas.filter((f) => f.status !== "paga").length)} icon={CreditCard} hint={`Próximos 6 ciclos de cada cartão · ${rotuloCartoes}`} />
                <StatCard label="Total próximas faturas" value={formatCurrency(card.faturas.filter((f) => f.status !== "paga").reduce((s, f) => s + f.total, 0))} icon={CalendarClock} />
              </div>

              <ChartCard title="Faturas por mês" description="Total das faturas por competência.">
                {faturasMesData.length === 0 ? (
                  <EmptyState icon={CreditCard} title="Sem faturas ainda" className="py-8" />
                ) : (
                  <ReportBarChart data={faturasMesData} name="Total" formatValue={(v) => formatCurrency(v)} dinheiro />
                )}
              </ChartCard>

              <Card>
                <CardHeader>
                  <CardTitle>Próximos 6 ciclos de cada cartão</CardTitle>
                  <CardDescription>{`${rotuloCartoes} · `}Total, valor realmente seu e o que terceiros precisam pagar.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                  {card.faturas.length === 0 ? (
                    <EmptyState icon={CreditCard} title="Sem faturas previstas" className="py-8" />
                  ) : (
                    card.faturas.map((f) => {
                      const valor = valorDaFatura(f);
                      return (
                      <div
                        key={`${f.cardId}-${f.competencia}`}
                        className={`${MATERIAL_LADRILHO} flex flex-col gap-1 rounded-[14px] px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between`}
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
                          {/* 08 K7: prevista sem lançamentos é ausência, não R$ 0,00 (a regra do painel). */}
                          {valor === null ? (
                            <span className="text-xs italic text-muted-foreground">sem lançamentos conhecidos</span>
                          ) : (
                            <span className="font-semibold">{formatCurrency(valor)}</span>
                          )}
                          {f.terceiros > 0 && (
                            <span className="ml-1 text-xs text-muted-foreground">
                              meu {formatCurrency(f.meu)} · terceiros {formatCurrency(f.terceiros)}
                            </span>
                          )}
                        </span>
                      </div>
                      );
                    })
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
                        className={`${MATERIAL_LADRILHO} flex items-center justify-between gap-3 rounded-[14px] px-3 py-2 text-sm`}
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

/* ───────────────────────────── Aba Financeiro (04-A2) ───────────────────────────── */

type BlocoDaAba = keyof RelatorioFinanceiro["blocos"];

/** O que a leitura do bloco trouxe, quando o bloco SEGUE o filtro: conteúdo, nada a mostrar, ou falha. */
type SituacaoDoBloco = "conteudo" | "vazio" | "falha";

const ROTULO_DO_TIPO: Record<TipoDeRecorte, string> = {
  conta: "conta",
  cartao: "cartão",
  pessoa: "pessoa",
  categoria: "categoria",
};

const LISTA_DO_TIPO: Record<TipoDeRecorte, keyof RelatorioFinanceiro["filtros"]["opcoes"]> = {
  conta: "contas",
  cartao: "cartoes",
  pessoa: "pessoas",
  categoria: "categorias",
};

const RECORTES: readonly TipoDeRecorte[] = ["conta", "cartao", "pessoa", "categoria"];

/** Os recortes ligados, na ordem fixa da URL (nunca sobra filtro fantasma: o modelo já os validou). */
function nomesDosRecortes(f: RelatorioFinanceiro): string[] {
  const { recorte, opcoes } = f.filtros;
  return RECORTES.flatMap((tipo) => {
    const id = recorte[tipo];
    if (id === null) return [];
    return [opcoes[LISTA_DO_TIPO[tipo]].find((o) => o.id === id)?.nome ?? ROTULO_DO_TIPO[tipo]];
  });
}

/**
 * O estado de um bloco (L1). O "não segue" vem ACIMA de tudo — é do modelo (`financeiro.blocos`), não
 * da leitura —, e falha de leitura nunca desenha o vazio: "não há nada" e "não consegui ler" são
 * fatos diferentes.
 */
function estadoDoRelatorio(
  f: RelatorioFinanceiro,
  bloco: BlocoDaAba,
  situacao: SituacaoDoBloco,
): EstadoDoBlocoNaTela {
  const estado = f.blocos[bloco];
  if (estado.naoSegue !== null || estado.naoSegueResp !== null) return "nao-segue";
  if (situacao === "falha") return "falha";
  if (situacao === "vazio") return "vazio";
  return "conteudo";
}

function capitalizada(texto: string): string {
  return `${texto.charAt(0).toUpperCase()}${texto.slice(1)}`;
}

/**
 * A frase do motivo e o caminho de volta do bloco que NÃO segue o filtro (L1). O recorte sai da URL
 * (`SEM_RECORTE`), com período, base e responsabilidade mantidos; na base caixa, em Terceiros e
 * Consolidado, o que não segue é a responsabilidade, e a volta é para "Meu".
 */
function naoSegueDoRelatorio(
  f: RelatorioFinanceiro,
  bloco: BlocoDaAba,
): { frase: string; hrefSemFiltro: string } | undefined {
  const estado = f.blocos[bloco];
  const { mes, base, resp, recorte } = f.filtros;
  if (estado.naoSegue !== null) {
    return {
      frase: `Não segue o filtro de ${ROTULO_DO_TIPO[estado.naoSegue.tipo]}: ${estado.naoSegue.motivo}.`,
      hrefSemFiltro: urlDoRelatorio({ mes, base, resp, recorte: SEM_RECORTE }),
    };
  }
  if (estado.naoSegueResp !== null) {
    return {
      frase: `${capitalizada(estado.naoSegueResp)}.`,
      hrefSemFiltro: urlDoRelatorio({ mes, base, resp: "meu", recorte }),
    };
  }
  return undefined;
}

/** O selo "filtrado: <nome>" do bloco que SEGUE o recorte ligado; sem recorte (ou sem seguir), nada. */
function acaoDoBloco(f: RelatorioFinanceiro, bloco: BlocoDaAba): React.ReactNode {
  if (naoSegueDoRelatorio(f, bloco) !== undefined) return null;
  const nomes = nomesDosRecortes(f);
  if (nomes.length === 0) return null;
  return (
    <Badge variant="outline" className="max-w-[10rem] min-w-0">
      <span className="truncate">filtrado: {nomes.join(" · ")}</span>
    </Badge>
  );
}

/**
 * 04-B — D-B-17: o gráfico não abre registros (cada barra é o indicador do seu mês); abrir aquele
 * mês é trocar o mês no topo. A frase fica junto dos gráficos de mês a mês.
 */
const ROTULO_DA_FORMA: Record<string, string> = { ...PAYMENT_METHOD_LABELS, outro: "Outro" };

const FRASE_DO_MES = "Para ver os registros de um mês, escolha o mês no topo.";

/**
 * 04-B — "Ver registros ›". A URL chega PRONTA do servidor (`gavetaDoRelatorio`): o cliente não
 * monta URL, e número que não abre não tem URL (o link some). `scroll={false}`: abrir a gaveta não
 * muda de lugar na página.
 */
function VerRegistros({ href, de, className }: { href: string | undefined; de?: string; className?: string }) {
  if (!href) return null;
  return (
    <Link
      href={href}
      scroll={false}
      aria-label={de ? `Ver registros de ${de}` : undefined}
      className={cn("inline-block text-xs whitespace-nowrap text-primary hover:underline", className)}
    >
      Ver registros ›
    </Link>
  );
}

/**
 * Uma lista de links, UM POR FATIA, ABAIXO do gráfico: fora do SVG (clique em fatia exigiria JS no
 * gráfico) e legível por teclado e leitor de tela. `min-w-0` no texto: o irmão do link é `shrink-0`.
 */
function LinksPorFatia({ itens }: { itens: { chave: string; nome: string; href: string | undefined }[] }) {
  const comLink = itens.filter((i) => i.href !== undefined);
  if (comLink.length === 0) return null;
  return (
    <ul className="mt-3 grid gap-x-4 gap-y-1.5 border-t pt-3 sm:grid-cols-2">
      {comLink.map((i) => (
        <li key={i.chave} className="flex min-w-0 items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-muted-foreground">{i.nome}</span>
          <VerRegistros href={i.href} de={i.nome} className="shrink-0" />
        </li>
      ))}
    </ul>
  );
}

const FALHA_DO_CAIXA = {
  frase: "Não foi possível ler o caixa agora. Nada aqui é zero — tente recarregar a página.",
};

/** Títulos e subtítulos que dependem da responsabilidade: o bruto nunca é rotulado como "meu". */
function textosDaResponsabilidade(f: RelatorioFinanceiro) {
  const { base, resp } = f.filtros;
  const nome = ROTULO_DA_BASE[base];
  const r = rotulosDosGraficos({ base, ateODia: f.ateODia });
  if (resp === "terceiros") {
    return {
      rotulos: r,
      barras: {
        titulo: "Entradas e saídas de terceiros mês a mês",
        descricao: `Só a parte de terceiros. Últimos 6 meses. ${nome}. Resultado = entradas − saídas de terceiros.`,
        nomes: { entradas: "Entradas de terceiros", saidas: "Saídas de terceiros" },
      },
      categorias: {
        titulo: "Gastos de terceiros por categoria",
        descricao: `Só a parte de terceiros. ${nome}.`,
      },
      formas: {
        titulo: "Gastos de terceiros por forma de pagamento",
        descricao: `Só a parte de terceiros. ${nome}.`,
      },
    };
  }
  if (resp === "consolidado") {
    return {
      rotulos: r,
      barras: {
        titulo: "Entradas e saídas (bruto) mês a mês",
        descricao: `O valor cheio: a sua parte e a de terceiros somadas. Últimos 6 meses. ${nome}.`,
        nomes: { entradas: "Entradas (bruto)", saidas: "Saídas (bruto)" },
      },
      categorias: {
        titulo: "Gastos por categoria (valor cheio)",
        descricao: `O valor cheio, com a sua parte e a de terceiros. ${nome}.`,
      },
      formas: {
        titulo: "Gastos por forma de pagamento (valor cheio)",
        descricao: `O valor cheio, com a sua parte e a de terceiros. ${nome}.`,
      },
    };
  }
  return {
    rotulos: r,
    barras: {
      titulo: r.evolucao.titulo,
      descricao: r.evolucao.descricao,
      nomes: { entradas: "Minhas entradas", saidas: "Minhas saídas" },
    },
    categorias: r.categorias,
    formas: r.formas,
  };
}

/**
 * A aba Financeiro (04-A2): só DESENHA o `RelatorioFinanceiro` que o servidor montou — nenhuma conta
 * de dinheiro mora aqui. Sequência: filtros → aviso "parcial" → Resumo → Evolução → Composição →
 * Detalhamento → Projeções. Cada bloco obedece ao modelo (`financeiro.blocos`): o que não segue o
 * filtro diz por quê, em vez de mostrar número; falha de leitura é falha, nunca R$ 0,00.
 */
function AbaFinanceiro({
  financeiro,
  gaveta,
  valoresOcultos,
}: {
  financeiro: RelatorioFinanceiro;
  gaveta: GavetaDoRelatorio;
  valoresOcultos: boolean;
}) {
  const { filtros, saldo, indicadores, caixa } = financeiro;
  const { hrefs } = gaveta;
  const { mes, base, resp } = filtros;
  const caixaOk = caixa?.estado === "ok" ? caixa : null;
  const caixaErro = caixa?.estado === "erro";
  const texto = textosDaResponsabilidade(financeiro);
  const { rotulos } = texto;
  const comRecorte = nomesDosRecortes(financeiro).length > 0;

  const rosca = financeiro.rosca;
  // As peças da 04-A desenham `meu`: aqui o campo `meu` carrega o valor da responsabilidade escolhida.
  const categoriasDaRosca = rosca === null ? [] : rosca.categorias.map((c) => ({ ...c, meu: c.valor }));
  const formasDaResp = financeiro.formas.map((f) => ({ ...f, meu: f.valor }));
  const ancora = financeiro.ancora;
  const composicao = rotulosDaComposicao(resp);
  // O quarto indicador é "De terceiros" (minha responsabilidade, sem pessoa) ou o pendente.
  const quartoHref = resp === "meu" && filtros.recorte.pessoa === null ? hrefs.terceiros : hrefs.pendente;

  return (
    <div className="space-y-6">
      <BarraDeFiltros filtros={filtros} />

      <AvisoParcial completude={financeiro.completude} />

      {/* O olho esconde os valores da aba; só o Saldo leva o botão. */}
      <OlhoDosValores ocultoInicial={valoresOcultos}>
        <div className="space-y-6">
          <section aria-labelledby="rel-resumo" className="space-y-4">
            <h2 id="rel-resumo" className="text-lg font-semibold tracking-tight">
              Resumo
            </h2>
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
              <Indicador
                className="col-span-3 sm:col-span-1"
                tom="saldo"
                icone={Wallet}
                rotulo={financeiro.saldo.rotulo}
                dica={saldo.dica}
                valor={saldo.valor}
                linhaDeBase={saldo.linhaDeBase}
                detalheComValor={saldo.detalheComValor}
                href={hrefs.saldo}
                hrefRotulo="Ver registros"
                acessorio={<BotaoDoOlho />}
              />
              <Indicador
                className={INDICADOR_PEQUENO_NO_CELULAR}
                tom="entrada"
                icone={TrendingUp}
                rotulo={indicadores.entradas.rotulo}
                dica={indicadores.entradas.dica}
                valor={indicadores.entradas.valor}
                linhaDeBase={indicadores.entradas.linhaDeBase}
                detalheComValor={indicadores.entradas.detalheComValor}
                comparacao={indicadores.entradas.comparacao ?? undefined}
                href={hrefs.entradas}
                hrefRotulo="Ver registros"
              />
              <Indicador
                className={INDICADOR_PEQUENO_NO_CELULAR}
                tom="saida"
                icone={TrendingDown}
                rotulo={indicadores.saidas.rotulo}
                dica={indicadores.saidas.dica}
                valor={indicadores.saidas.valor}
                linhaDeBase={indicadores.saidas.linhaDeBase}
                detalheComValor={indicadores.saidas.detalheComValor}
                comparacao={indicadores.saidas.comparacao ?? undefined}
                href={hrefs.saidas}
                hrefRotulo="Ver registros"
              />
              <Indicador
                className={INDICADOR_PEQUENO_NO_CELULAR}
                tom="terceiros"
                icone={Users}
                rotulo={indicadores.quarto.rotulo}
                dica={indicadores.quarto.dica}
                valor={indicadores.quarto.valor}
                linhaDeBase={indicadores.quarto.linhaDeBase}
                detalheComValor={indicadores.quarto.detalheComValor}
                comparacao={indicadores.quarto.comparacao ?? undefined}
                href={quartoHref}
                hrefRotulo="Ver registros"
              />
            </div>

            {/* 04-B: a gaveta fica DENTRO do olho — ela é desenhada num portal, fora do invólucro, e só
                o contexto do olho a alcança. A vista vem pronta da página (`?detalhe=`). */}
            <GavetaDeRegistros
              vista={gaveta.vista}
              urlAoFechar={gaveta.urlAoFechar}
              linkLancamentos={gaveta.linkLancamentos}
              linkContas={gaveta.linkContas}
            />

            {/* Bloco do caixa (só na base caixa; sem leitura ele mesmo diz que não leu) */}
            {base === "caixa" && caixa ? (
              <BlocoDoCaixa
                mesRotulo={monthLabel(mes)}
                caixa={caixa}
                hrefs={{
                  renda: hrefs["caixa:renda"],
                  reembolsos: hrefs["caixa:reembolsos"],
                  outras: hrefs["caixa:outras"],
                  saidas: hrefs["caixa:saidas"],
                  pagamentos: hrefs["caixa:pagamentos"],
                  "sem-destino": hrefs["caixa:sem-destino"],
                  "entre-contas": hrefs["caixa:entre-contas"],
                }}
              />
            ) : null}
          </section>

          <section aria-labelledby="rel-evolucao" className="space-y-4">
            <h2 id="rel-evolucao" className="text-lg font-semibold tracking-tight">
              Evolução
            </h2>
            <div className="grid gap-4 lg:grid-cols-3">
              <Bloco
                className="min-w-0 lg:col-span-2"
                titulo={texto.barras.titulo}
                subtitulo={
                  financeiro.seriesDasBarras === "saidas"
                    ? `${texto.barras.descricao} As entradas não seguem o filtro de cartão: estorno não é entrada.`
                    : texto.barras.descricao
                }
                acao={acaoDoBloco(financeiro, "barras")}
                estado={estadoDoRelatorio(financeiro, "barras", caixaErro ? "falha" : "conteudo")}
                falha={FALHA_DO_CAIXA}
                naoSegue={naoSegueDoRelatorio(financeiro, "barras")}
              >
                <BarrasEntradasSaidasChart
                  dados={financeiro.barras}
                  series={financeiro.seriesDasBarras}
                  nomes={texto.barras.nomes}
                  ultimoMesLido={financeiro.ultimoMesLidoDasBarras ?? undefined}
                />
                {caixaOk ? <RodapeDasFaturasSemTotal meses={caixaOk.graficos.semTotal.evolucao} /> : null}
                <p className="mt-2 text-xs text-muted-foreground">{FRASE_DO_MES}</p>
              </Bloco>
              <Bloco
                className="min-w-0"
                titulo={rotulos.mesAMes.titulo}
                subtitulo={rotulos.mesAMes.descricao}
                acao={acaoDoBloco(financeiro, "mesAMes")}
                estado={estadoDoRelatorio(
                  financeiro,
                  "mesAMes",
                  caixaErro ? "falha" : financeiro.mesAMes === null ? "vazio" : "conteudo",
                )}
                falha={FALHA_DO_CAIXA}
                vazio={{ frase: "Sem dados do mês a mês neste período." }}
                naoSegue={naoSegueDoRelatorio(financeiro, "mesAMes")}
              >
                {financeiro.mesAMes !== null ? <MesAMesChart dados={financeiro.mesAMes} /> : null}
                {caixaOk ? <RodapeDasFaturasSemTotal meses={caixaOk.graficos.semTotal.mesAMes} /> : null}
                <p className="mt-2 text-xs text-muted-foreground">{FRASE_DO_MES}</p>
              </Bloco>
            </div>
          </section>

          <section aria-labelledby="rel-composicao" className="space-y-4">
            <h2 id="rel-composicao" className="text-lg font-semibold tracking-tight">
              Composição
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <Bloco
                className="min-w-0"
                titulo={texto.categorias.titulo}
                subtitulo={texto.categorias.descricao}
                acao={acaoDoBloco(financeiro, "rosca")}
                estado={estadoDoRelatorio(
                  financeiro,
                  "rosca",
                  caixaErro ? "falha" : rosca === null ? "vazio" : "conteudo",
                )}
                falha={FALHA_DO_CAIXA}
                vazio={{ frase: "Sem gastos por categoria neste período." }}
                naoSegue={naoSegueDoRelatorio(financeiro, "rosca")}
              >
                {rosca !== null ? (
                  <RoscaCategoriasChart
                    categorias={categoriasDaRosca}
                    estornos={rosca.estornos}
                    ariaDaLista={composicao.ariaDaLista}
                    rotuloDoTotal={composicao.totalDaRosca}
                  />
                ) : null}
                {rosca?.nota ? <p className="mt-3 text-xs text-muted-foreground">{rosca.nota}</p> : null}
                {/* 04-B: um link por fatia, abaixo do gráfico (fora do SVG). Sem link na base caixa. */}
                {rosca !== null ? (
                  <LinksPorFatia
                    itens={rosca.categorias.map((c) => ({
                      chave: c.categoryId ?? "sem-categoria",
                      nome: c.name,
                      href: hrefs["categoria:" + (c.categoryId ?? "sem-categoria")],
                    }))}
                  />
                ) : null}
              </Bloco>
              <Bloco
                className="min-w-0"
                titulo={texto.formas.titulo}
                subtitulo={texto.formas.descricao}
                acao={acaoDoBloco(financeiro, "formas")}
                estado={estadoDoRelatorio(financeiro, "formas", caixaErro ? "falha" : "conteudo")}
                falha={FALHA_DO_CAIXA}
                naoSegue={naoSegueDoRelatorio(financeiro, "formas")}
              >
                <FormaPagamentoChart data={formasDaResp} rotuloDaSerie={composicao.serieDaForma} />
                <LinksPorFatia
                  itens={financeiro.formas.map((f) => ({
                    chave: f.paymentMethod,
                    nome: ROTULO_DA_FORMA[f.paymentMethod] ?? f.paymentMethod,
                    href: hrefs["forma:" + f.paymentMethod],
                  }))}
                />
              </Bloco>
            </div>
          </section>

          <section aria-labelledby="rel-detalhamento" className="space-y-4">
            <h2 id="rel-detalhamento" className="text-lg font-semibold tracking-tight">
              Detalhamento
            </h2>

            <Bloco
              className="min-w-0"
              titulo="Meu × bruto × terceiros"
              subtitulo={`${monthLabel(mes)} · ${ROTULO_DA_BASE[base]}`}
              acao={acaoDoBloco(financeiro, "ancora")}
              estado={estadoDoRelatorio(
                financeiro,
                "ancora",
                caixaErro ? "falha" : ancora === null ? "vazio" : "conteudo",
              )}
              falha={FALHA_DO_CAIXA}
              vazio={{ frase: "Sem dados deste quadro neste período." }}
              naoSegue={naoSegueDoRelatorio(financeiro, "ancora")}
            >
              {ancora !== null ? (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="min-w-0 rounded-lg bg-muted/50 p-3">
                      <p className="text-xs break-words text-muted-foreground">Minhas saídas</p>
                      <p className="text-lg font-semibold break-words tabular-nums">
                        <ValorComOlho texto={formatCurrency(ancora.meu)} />
                      </p>
                      <VerRegistros href={hrefs.meu} de={rotulos.cardMinhasSaidas.titulo(monthLabel(mes))} />
                    </div>
                    <div className="min-w-0 rounded-lg bg-muted/50 p-3">
                      <p className="text-xs break-words text-muted-foreground">
                        {rotulos.cardMinhasSaidas.bruto}
                      </p>
                      <p className="text-lg font-semibold break-words tabular-nums">
                        <ValorComOlho texto={formatCurrency(ancora.bruto)} />
                      </p>
                      <VerRegistros href={hrefs.bruto} de={rotulos.cardMinhasSaidas.bruto} />
                    </div>
                    <div className="min-w-0 rounded-lg bg-muted/50 p-3">
                      <p className="text-xs break-words text-muted-foreground">
                        {rotulos.cardMinhasSaidas.terceiros}
                      </p>
                      <p className="text-lg font-semibold break-words tabular-nums">
                        <ValorComOlho texto={formatCurrency(ancora.terceiros)} />
                      </p>
                      <VerRegistros href={hrefs.terceiros} de={rotulos.cardMinhasSaidas.terceiros} />
                    </div>
                  </div>
                  {ancora.perdoado !== null && fraseDoPerdoado(ancora.perdoado) !== null ? (
                    <p className="text-xs break-words text-muted-foreground">
                      <ValorComOlho texto={fraseDoPerdoado(ancora.perdoado) ?? ""} />
                    </p>
                  ) : null}
                  <div className="flex items-baseline justify-between gap-3 border-t pt-3 text-sm">
                    <span className="min-w-0 text-muted-foreground">{rotuloPendenteDoMes(mes)}</span>
                    {ancora.pendenteDoMes !== null ? (
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <span className="font-medium tabular-nums">
                          <ValorComOlho texto={formatCurrency(ancora.pendenteDoMes)} />
                        </span>
                        <VerRegistros href={hrefs["pendente-do-mes"]} de={rotuloPendenteDoMes(mes)} />
                      </span>
                    ) : (
                      <span className="min-w-0 text-right text-xs text-muted-foreground">
                        Não segue o filtro de conta: o recebível não sabe a conta.
                      </span>
                    )}
                  </div>
                </div>
              ) : null}
            </Bloco>

            <div className="grid gap-4 lg:grid-cols-2">
              <Bloco
                className="min-w-0"
                titulo="Maiores gastos por categoria"
                subtitulo={`Movimentado (com terceiros) × valor realmente seu (mês). ${ROTULO_DA_BASE[base]}.`}
                acao={acaoDoBloco(financeiro, "maiores")}
                estado={estadoDoRelatorio(
                  financeiro,
                  "maiores",
                  caixaErro ? "falha" : financeiro.maiores.length === 0 ? "vazio" : "conteudo",
                )}
                falha={FALHA_DO_CAIXA}
                vazio={{ frase: "Sem gastos no período" }}
                naoSegue={naoSegueDoRelatorio(financeiro, "maiores")}
              >
                <ul className="space-y-2">
                  {financeiro.maiores.slice(0, 8).map((c) => (
                    <li
                      key={c.categoryId ?? c.name}
                      className={`${MATERIAL_LADRILHO} flex items-center justify-between gap-3 rounded-[14px] px-3 py-2 text-sm`}
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
                        <span className="font-semibold">
                          <ValorComOlho texto={formatCurrency(c.movimentado)} />
                        </span>
                        {c.meu !== c.movimentado && (
                          <span className="ml-1 text-xs text-muted-foreground">
                            <ValorComOlho texto={`(meu ${formatCurrency(c.meu)})`} />
                          </span>
                        )}
                        <VerRegistros
                          href={hrefs["categoria:" + (c.categoryId ?? "sem-categoria")]}
                          de={c.name}
                          className="block"
                        />
                      </span>
                    </li>
                  ))}
                </ul>
                <ExportBar
                  onCsv={() =>
                    downloadCsv(
                      `gastos-por-categoria-${mes}${base === "caixa" ? "-caixa" : ""}${comRecorte ? "-filtrado" : ""}.csv`,
                      toCsv(
                        financeiro.maiores.map((c) => ({
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
              </Bloco>

              <Bloco
                className="min-w-0"
                titulo="Assinaturas & recorrências"
                subtitulo="Despesas recorrentes ativas."
                acao={acaoDoBloco(financeiro, "assinaturas")}
                estado={estadoDoRelatorio(
                  financeiro,
                  "assinaturas",
                  financeiro.assinaturas.length === 0 ? "vazio" : "conteudo",
                )}
                vazio={{ frase: "Nenhuma recorrência ativa" }}
                naoSegue={naoSegueDoRelatorio(financeiro, "assinaturas")}
              >
                <ul className="space-y-2">
                  {financeiro.assinaturas.slice(0, 8).map((a, i) => (
                    <li
                      key={`${a.nome}-${i}`}
                      className={`${MATERIAL_LADRILHO} flex items-center justify-between gap-3 rounded-[14px] px-3 py-2 text-sm`}
                    >
                      <span className="min-w-0 truncate">{a.nome}</span>
                      <span className="shrink-0 tabular-nums">
                        <span className="font-semibold">
                          <ValorComOlho texto={formatCurrency(a.valor)} />
                        </span>
                        <span className="ml-1 text-xs text-muted-foreground">
                          {FREQ_LABELS[a.frequency] ?? a.frequency}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </Bloco>
            </div>
          </section>

          <section aria-labelledby="rel-projecoes" className="space-y-4">
            <h2 id="rel-projecoes" className="text-lg font-semibold tracking-tight">
              Projeções
            </h2>
            <div className="grid gap-4 lg:grid-cols-2">
              <Bloco
                className="min-w-0"
                titulo={rotulos.projecao.titulo}
                subtitulo={
                  resp === "meu"
                    ? rotulos.projecao.descricao
                    : `${rotulos.projecao.descricao} A projeção é sempre da sua parte.`
                }
                acao={acaoDoBloco(financeiro, "projecao")}
                estado={estadoDoRelatorio(financeiro, "projecao", "conteudo")}
                naoSegue={naoSegueDoRelatorio(financeiro, "projecao")}
              >
                <ProjecaoChart data={financeiro.projecao} />
                {/* 04-B: um link por mês da projeção, abaixo do gráfico (fora do SVG). */}
                <LinksPorFatia
                  itens={financeiro.projecao.map((ponto) => ({
                    chave: ponto.mes,
                    nome: monthLabel(ponto.mes),
                    href: hrefs["projecao:" + ponto.mes],
                  }))}
                />
              </Bloco>
              <Bloco
                className="min-w-0"
                titulo={rotulos.faturas.titulo}
                subtitulo={rotulos.faturas.descricao}
                acao={acaoDoBloco(financeiro, "faturasFuturas")}
                estado={estadoDoRelatorio(financeiro, "faturasFuturas", "conteudo")}
                naoSegue={naoSegueDoRelatorio(financeiro, "faturasFuturas")}
              >
                <FaturasChart data={financeiro.faturasFuturas} />
              </Bloco>
            </div>
          </section>
        </div>
      </OlhoDosValores>
    </div>
  );
}
