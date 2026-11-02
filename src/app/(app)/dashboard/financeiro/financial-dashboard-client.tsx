"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarClock,
  CreditCard,
  Plus,
  ReceiptText,
  Scale,
  TrendingDown,
  TrendingUp,
  TriangleAlert,
  Users,
  Wallet,
} from "lucide-react";
import { StatCard } from "@/components/shared/stat-card";
import { SeletorDeVisao } from "@/components/shared/seletor-de-visao";
import { Bloco } from "@/components/shared/painel/bloco";
import { GavetaDeRegistros } from "@/components/shared/painel/gaveta-de-registros";
import { Indicador } from "@/components/shared/painel/indicador";
import { BotaoDoOlho, OlhoDosValores } from "@/components/shared/painel/olho-dos-valores";
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
import { AvisoParcial } from "@/components/financeiro/aviso-parcial";
import { BlocoDoCaixa } from "@/components/financeiro/bloco-do-caixa";
import { cn } from "@/lib/utils";
import { formatCurrency, formatDate } from "@/lib/format";
import { fraseDoPerdoado, rotuloPendenteDoMes } from "@/lib/finance/recebimentos";
import { ROTULO_DA_BASE, type BaseFinanceira } from "@/lib/finance/base";
import type { EstadoDoCaixa } from "@/lib/finance/caixa-leitura";
import { PAYMENT_METHOD_LABELS, TRANSACTION_TYPE_LABELS } from "@/lib/finance/constants";
import type { CompletudeFinanceira } from "@/lib/finance/pipeline";
import {
  comparacaoDosIndicadores,
  dadosDasBarras,
  faturaAtualDoCartao,
  indicadoresDoResumo,
  valorDaFatura,
  type CartaoDoPainel,
  type UltimasDoPainel,
} from "@/lib/finance/painel";
import { estadoDoBloco } from "@/lib/painel/bloco";
import type { VistaDaGaveta } from "@/lib/painel/gaveta";
import type { HrefsDoPainel } from "@/lib/painel/hrefs-do-painel";
import { RoscaCategoriasChart } from "@/components/dashboard/rosca-categorias-chart";
import { FormaPagamentoChart } from "@/components/dashboard/forma-pagamento-chart";
import { MesAMesChart } from "@/components/dashboard/mes-a-mes-chart";
import { BarrasEntradasSaidasChart } from "@/components/dashboard/barras-entradas-saidas-chart";
import { ProjecaoChart } from "@/components/dashboard/projecao-chart";
import { FaturasChart } from "@/components/dashboard/faturas-chart";
import { CaixaNaoLido, RodapeDasFaturasSemTotal } from "@/components/financeiro/caixa-nos-graficos";
import { rotulosDosGraficos } from "@/lib/finance/rotulos-dos-graficos";
import type {
  Alerta,
  CategoriaSlice,
  EvolucaoPonto,
  FaturaDoMes,
  MesAMesDados,
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

/** "DD/MM" de uma data 'yyyy-MM-dd', tirado do próprio texto (sem converter para Date). */
function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
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

/**
 * 04-B — D-B-17: o gráfico não abre registros (cada barra é o indicador do seu mês); abrir aquele
 * mês é trocar o mês no topo. A frase fica ao lado dos gráficos de mês a mês.
 */
const FRASE_DO_MES = "Para ver os registros de um mês, escolha o mês no topo.";

const ROTULO_DA_FORMA: Record<string, string> = { ...PAYMENT_METHOD_LABELS, outro: "Outro" };

/**
 * 04-B — "Ver registros ›". A URL chega PRONTA do servidor (`hrefsDoPainel`): o cliente não monta
 * URL. `scroll={false}` porque abrir a gaveta não muda de lugar na página.
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
 * recharts) e legível por teclado e leitor de tela. `min-w-0` no texto: o irmão do link é `shrink-0`.
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

/** O `StatCard` não tem link: o "Ver registros" fica logo abaixo dele. */
function ComRegistros({ href, children }: { href: string | undefined; children: React.ReactNode }) {
  if (!href) return <>{children}</>;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {children}
      <VerRegistros href={href} />
    </div>
  );
}

/**
 * No celular, os três indicadores secundários ficam menores e sem a base e a comparação (a dica (i)
 * continua). As classes são literais e vão no CARD: o `Indicador` é uma peça comum e não conhece o
 * painel.
 */
const INDICADOR_PEQUENO_NO_CELULAR =
  "max-sm:[&>div]:p-2.5 max-sm:[&_.text-2xl]:text-[0.9375rem] max-sm:[&_p.text-xs]:hidden";

export function DashboardClient({
  banner,
  ocultos,
  completude,
  mesSel,
  base,
  caixa,
  saldoCom,
  resumo,
  perdoado,
  graficoAteODia,
  mesAMesCompetencia,
  evolucao,
  categorias,
  estornos,
  mesAtual,
  formas,
  faturas,
  cartoes,
  pendenteBanco,
  ultimas,
  porPessoa,
  totalPendente,
  rotuloTotalPendente,
  projecao,
  faturasFuturas,
  alertas,
  contas,
  aReceber,
  faturasAbertas,
  faturasFechadas,
  vista,
  hrefs,
  faturaIds,
  urlAoFechar,
  linkLancamentos,
}: {
  /** O banner de boas-vindas, JÁ montado pelo servidor — o cliente não o importa. */
  banner: React.ReactNode;
  ocultos: boolean;
  completude: CompletudeFinanceira;
  mesSel: string;
  base: BaseFinanceira;
  caixa: EstadoDoCaixa | null;
  saldoCom: { rotulo: string; valor: number | null; diferenca: string | null };
  resumo: ResumoMes;
  perdoado: number;
  graficoAteODia: { ateODia: number } | null;
  /** As minhas entradas/saídas do "Meu mês a mês" em competência, prontas do servidor. */
  mesAMesCompetencia: MesAMesDados;
  evolucao: EvolucaoPonto[];
  categorias: CategoriaSlice[];
  /** Estornos do cartão no mês (competência) — entram na nota da rosca. */
  estornos: number;
  /** O mês em andamento ('yyyy-MM') ou `null` quando o mês selecionado não é o de hoje. */
  mesAtual: string;
  formas: FormaSlice[];
  faturas: FaturaProvisao[];
  cartoes: CartaoDoPainel[];
  pendenteBanco: number;
  ultimas: UltimasDoPainel;
  porPessoa: { pessoaId: string | null; nome: string; pendente: number }[];
  totalPendente: number;
  rotuloTotalPendente: string;
  projecao: ProjecaoPonto[];
  faturasFuturas: FaturaDoMes[];
  alertas: Alerta[];
  contas: ProximasContas;
  aReceber: number;
  faturasAbertas: number;
  faturasFechadas: number;
  /** 04-B: a vista da gaveta de registros (`?detalhe=`), pronta do servidor; `null` = fechada. */
  vista: VistaDaGaveta | null;
  /** 04-B: a URL de cada número que abre registros, pronta do servidor. */
  hrefs: HrefsDoPainel;
  /** 04-B: `cardId|competência` → id da fatura REAL (virtual não tem registros). */
  faturaIds: Record<string, string>;
  urlAoFechar: string;
  linkLancamentos: string;
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

  const frase = fraseDoPerdoado(perdoado);

  const caixaOk = base === "caixa" && caixa?.estado === "ok" ? caixa : null;
  const caixaErro = base === "caixa" && caixa?.estado === "erro";

  // Desenho 2026-10-18: os gráficos seguem a base e mostram só a parte do dono. Em caixa com
  // erro de leitura, os gráficos que dependem da base dizem que não leram — nunca desenham zero.
  const graficosCaixa = caixaOk ? caixaOk.graficos : null;
  const rotulos = rotulosDosGraficos({
    base,
    ateODia:
      base === "caixa" ? (graficosCaixa?.mesAMes.ateODia ?? null) : (graficoAteODia?.ateODia ?? null),
  });
  const minhasSaidasCard =
    base === "caixa"
      ? graficosCaixa
        ? {
            valor: formatCurrency(graficosCaixa.minha.saidas),
            bruto: formatCurrency(graficosCaixa.minha.saidasBrutas),
            terceiros: formatCurrency(graficosCaixa.minha.terceirosNasSaidas),
          }
        : { valor: "—", bruto: "—", terceiros: "—" }
      : {
          valor: formatCurrency(resumo.meu),
          bruto: formatCurrency(resumo.saidas),
          terceiros: formatCurrency(resumo.terceiros),
        };

  /* ───────────── Os quatro indicadores (K1, K2, K6, K7) ───────────── */

  // Setas (K7): a mesma fonte do "Meu mês a mês". Caixa com erro de leitura: sem seta.
  const comparacao = caixaErro
    ? null
    : comparacaoDosIndicadores({
        dados: caixaOk ? caixaOk.graficos.mesAMes.dados : mesAMesCompetencia,
        ateODia: caixaOk ? caixaOk.graficos.mesAMes.ateODia : (graficoAteODia?.ateODia ?? null),
        base,
        // Mês futuro: só o que já está lançado, sem cor (revisão final 04-A).
        futuro: mesSel > mesAtual,
      });

  // 04-A2 (D-A2-15): a montagem dos três indicadores é a função que o relatório também usa. Aqui o
  // painel pede sempre "meu"; o pendente só é lido nas outras responsabilidades.
  const indicadores = indicadoresDoResumo({
    resp: "meu",
    base,
    resumo,
    caixa,
    comparacao,
    pendente: { ate: totalPendente, rotuloAte: rotuloTotalPendente, referenteAoMes: aReceber },
    rotuloDoRecorte: null,
  });

  /* ───────────── Cartões e próximas faturas ───────────── */

  // "N ciclos de cada cartão": o maior número de linhas de um mesmo cartão na lista.
  const ciclosPorCartao = new Map<string, number>();
  for (const f of faturas) ciclosPorCartao.set(f.cardId, (ciclosPorCartao.get(f.cardId) ?? 0) + 1);
  const ciclos = Math.max(0, ...ciclosPorCartao.values());

  const aReceberVazio = totalPendente === 0 && aReceber === 0;

  /** O link da fatura de uma linha do painel, se for uma fatura real (a virtual não tem registros). */
  const hrefDaFatura = (cardId: string, competencia: string): string | undefined => {
    const id = faturaIds[`${cardId}|${competencia}`];
    return id === undefined ? undefined : hrefs.faturas[id];
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

      {/* Banner de boas-vindas (montado no servidor) */}
      {banner}

      {/* Aviso "parcial": a leitura pode estar incompleta, e o painel diz por quê (peça única) */}
      <AvisoParcial completude={completude} />

      {/* Alertas — faixa compacta */}
      {alertas.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {alertas.map((a, i) => (
            <div
              key={`${a.kind}-${i}`}
              className={cn(
                "flex items-start gap-2.5 rounded-lg border px-3 py-2",
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
                  <TriangleAlert className="size-4" />
                ) : (
                  <AlertTriangle className="size-4" />
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

      {/* Os quatro indicadores. O olho esconde os quatro; só o Saldo leva o botão. */}
      <OlhoDosValores ocultoInicial={ocultos}>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <Indicador
            className="col-span-3 sm:col-span-1"
            tom="saldo"
            icone={Wallet}
            rotulo={saldoCom.rotulo}
            dica="A soma do saldo de todas as contas, contando só o que já aconteceu até o fim de hoje."
            valor={
              saldoCom.valor === null
                ? { erro: "Não foi possível ler o saldo" }
                : formatCurrency(saldoCom.valor)
            }
            linhaDeBase="todas as contas, até o fim de hoje"
            detalheComValor={saldoCom.diferenca}
            href={hrefs.saldo}
            hrefRotulo="Ver registros"
            acessorio={
              <span className="flex items-center gap-2">
                <Link href="/financeiro/contas" className="text-xs text-primary hover:underline">
                  Contas
                </Link>
                <BotaoDoOlho />
              </span>
            }
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
            href={hrefs.terceiros}
            hrefRotulo="Ver registros"
          />
        </div>

        {/* 04-B: a gaveta fica DENTRO do olho — ela é desenhada num portal, fora do invólucro, e só
            o contexto do olho a alcança. A vista vem pronta da página (`?detalhe=`). */}
        <GavetaDeRegistros vista={vista} urlAoFechar={urlAoFechar} linkLancamentos={linkLancamentos} />
      </OlhoDosValores>

      {/* Bloco do caixa (só na base caixa) */}
      {base === "caixa" && caixa && (
        <BlocoDoCaixa mesRotulo={monthYearLabel(mesSel)} caixa={caixa} hrefs={hrefs.caixa} />
      )}

      {/* Entradas × saídas (barras) e gastos por categoria (rosca) */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Bloco
          className="lg:col-span-2"
          titulo="Minhas entradas × saídas"
          subtitulo={rotulos.evolucao.descricao}
          verTodos={{ href: "/relatorios", rotulo: "Ver relatório" }}
          estado="conteudo"
        >
          {caixaErro ? (
            <CaixaNaoLido />
          ) : (
            <BarrasEntradasSaidasChart
              dados={dadosDasBarras(graficosCaixa ? graficosCaixa.evolucao : evolucao, mesAtual)}
            />
          )}
          {graficosCaixa && <RodapeDasFaturasSemTotal meses={graficosCaixa.semTotal.evolucao} />}
          <p className="text-xs text-muted-foreground">{FRASE_DO_MES}</p>
        </Bloco>
        <Bloco
          titulo="Meus gastos por categoria"
          subtitulo={`${monthYearLabel(mesSel)}. ${rotulos.categorias.descricao}`}
          estado="conteudo"
        >
          {caixaErro ? (
            <CaixaNaoLido />
          ) : (
            <RoscaCategoriasChart
              categorias={graficosCaixa ? graficosCaixa.categorias : categorias}
              estornos={estornos}
            />
          )}
          {/* 04-B: um link por fatia, abaixo do gráfico (fora do SVG). Só na competência: na base
              caixa o detalhe da categoria "não é calculado", então `hrefs.categorias` vem vazio. */}
          {!caixaErro && !graficosCaixa && (
            <LinksPorFatia
              itens={categorias.map((c) => ({
                chave: c.categoryId ?? "sem-categoria",
                nome: c.name,
                href: hrefs.categorias[c.categoryId ?? "sem-categoria"],
              }))}
            />
          )}
        </Bloco>
      </div>

      {/* Cartões de crédito e próximas faturas */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Bloco
          className="lg:col-span-3"
          titulo="Cartões de crédito"
          subtitulo="Fatura atual de cada cartão, pelo valor cheio"
          verTodos={{ href: "/cartoes" }}
          estado={estadoDoBloco({ ok: true, itens: cartoes })}
          vazio={{
            frase: "Nenhum cartão cadastrado ainda.",
            acao: (
              <Link href="/cartoes" className="text-sm text-primary hover:underline">
                Adicionar cartão
              </Link>
            ),
          }}
        >
          <div className="@container">
            <div className="grid grid-cols-1 gap-3 @md:grid-cols-2 @2xl:grid-cols-3">
              {cartoes.map((c) => {
                // A fatura "atual" é a mesma que o bloco mostra; só a real tem registros.
                const atual = faturaAtualDoCartao(faturas, c.id);
                const hrefDaAtual = atual ? hrefDaFatura(atual.cardId, atual.competencia) : undefined;
                return (
                  // O cartão inteiro já é um `<Link>`: o "Ver registros" fica ao lado, não dentro
                  // (link dentro de link não é HTML válido).
                  <div key={c.id} className="flex min-w-0 flex-col gap-1.5">
                    <Link
                      href="/cartoes"
                      style={c.texto !== null && c.cor ? { background: c.cor } : undefined}
                      className={cn(
                        "block min-w-0 rounded-xl p-4 transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        c.texto === null
                          ? "bg-muted text-foreground"
                          : c.texto === "branco"
                            ? "text-white"
                            : "text-zinc-900",
                      )}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <CreditCard aria-hidden="true" className="size-4 shrink-0" />
                        <span className="min-w-0 truncate text-sm font-medium">{c.nome}</span>
                      </div>
                      <p className="mt-3 text-xs opacity-80">Fatura atual</p>
                      {c.faturaAtual === null ? (
                        <p className="text-sm font-medium">sem lançamentos conhecidos</p>
                      ) : (
                        <p className="truncate text-xl font-semibold tabular-nums">
                          {formatCurrency(c.faturaAtual)}
                        </p>
                      )}
                      {c.minhaParte !== null && (
                        <p className="truncate text-xs tabular-nums opacity-80">
                          minha parte {formatCurrency(c.minhaParte)}
                        </p>
                      )}
                      {c.fechaEm !== null && (
                        <p className="mt-1 text-xs opacity-80">fecha em {diaMes(c.fechaEm)}</p>
                      )}
                    </Link>
                    <VerRegistros href={hrefDaAtual} de={`fatura de ${c.nome}`} />
                  </div>
                );
              })}
              <Link
                href="/cartoes"
                className="flex min-h-[7rem] min-w-0 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed p-4 text-sm text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Plus aria-hidden="true" className="size-5" />
                Adicionar cartão
              </Link>
            </div>
          </div>
        </Bloco>

        <Bloco
          className="lg:col-span-2"
          titulo="Próximas faturas"
          subtitulo={`${ciclos} ciclos de cada cartão · pelo vencimento`}
          verTodos={{ href: "/faturas" }}
          estado={estadoDoBloco({ ok: true, itens: faturas })}
          vazio={{ frase: "Nenhuma fatura prevista: cadastre um cartão para acompanhá-las." }}
        >
          <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2">
              <span className="min-w-0 text-sm text-muted-foreground">Pendente ao banco</span>
              <span className="shrink-0 text-base font-semibold tabular-nums">
                {formatCurrency(pendenteBanco)}
              </span>
            </div>
            <ul className="divide-y">
              {faturas.map((f) => {
                const valor = valorDaFatura(f);
                return (
                  <li
                    key={`${f.cardId}-${f.competencia}`}
                    className="flex items-center gap-3 py-2"
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full bg-muted-foreground ring-1 ring-foreground/10"
                      style={f.cardCor ? { backgroundColor: f.cardCor } : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {f.cardNome} · {monthYearLabel(f.competencia)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        vence {diaMes(f.dataVencimento)}
                        {hrefDaFatura(f.cardId, f.competencia) ? (
                          <>
                            {" · "}
                            <VerRegistros
                              href={hrefDaFatura(f.cardId, f.competencia)}
                              de={`${f.cardNome} ${monthYearLabel(f.competencia)}`}
                            />
                          </>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={cn(
                          "text-sm tabular-nums",
                          valor === null ? "text-muted-foreground" : "font-semibold",
                        )}
                      >
                        {valor === null ? "sem lançamentos conhecidos" : formatCurrency(valor)}
                      </span>
                      {f.virtual ? (
                        <Badge variant="outline" className="text-muted-foreground">
                          Prevista
                        </Badge>
                      ) : (
                        <StatementStatusBadge status={f.status} />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </Bloco>
      </div>

      {/* Últimas transações e a receber de terceiros */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Bloco
          className="lg:col-span-3"
          titulo="Últimas transações"
          subtitulo="Os lançamentos mais recentes que já aconteceram"
          verTodos={{ href: "/financeiro/lancamentos" }}
          estado={estadoDoBloco(ultimas)}
          vazio={{ frase: "Nenhum lançamento por aqui ainda." }}
          falha={{ frase: "Não foi possível ler os últimos lançamentos agora." }}
        >
          {ultimas.ok && (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th scope="col" className="py-2 pr-3 font-medium">Data</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Descrição</th>
                      <th scope="col" className="py-2 pr-3 font-medium">Categoria</th>
                      <th scope="col" className="py-2 pr-3 text-right font-medium">Valor</th>
                      <th scope="col" className="py-2 font-medium">Tipo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {ultimas.itens.map((t) => (
                      <tr key={t.id}>
                        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground tabular-nums">
                          {formatDate(t.data)}
                        </td>
                        <td className="max-w-[14rem] truncate py-2 pr-3">{t.descricao}</td>
                        <td className="max-w-[10rem] truncate py-2 pr-3 text-muted-foreground">
                          {t.categoria ?? "Sem categoria"}
                        </td>
                        <td
                          className={cn(
                            "py-2 pr-3 text-right font-medium whitespace-nowrap tabular-nums",
                            t.tipo === "receita" ? "text-success-ink" : "text-foreground",
                          )}
                        >
                          {formatCurrency(t.valor)}
                        </td>
                        <td className="py-2 whitespace-nowrap text-muted-foreground">
                          {TRANSACTION_TYPE_LABELS[t.tipo]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="divide-y sm:hidden">
                {ultimas.itens.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.descricao}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatDate(t.data)} · {t.categoria ?? "Sem categoria"} ·{" "}
                        {TRANSACTION_TYPE_LABELS[t.tipo]}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium tabular-nums",
                        t.tipo === "receita" ? "text-success-ink" : "text-foreground",
                      )}
                    >
                      {formatCurrency(t.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Bloco>

        <Bloco
          className="lg:col-span-2"
          titulo="Pendente de terceiros"
          subtitulo="O que ainda não voltou para você"
          verTodos={{ href: "/terceiros" }}
          acao={aReceberVazio ? undefined : <VerRegistros href={hrefs.pendente} de="o pendente de terceiros" />}
          estado={aReceberVazio ? "vazio" : "conteudo"}
          vazio={{ frase: "Nada pendente de terceiros agora." }}
        >
          <div className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground">{rotuloTotalPendente}</p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums">
                {formatCurrency(totalPendente)}
              </p>
            </div>
            {porPessoa.length > 0 && (
              <ul className="space-y-1.5 text-sm">
                {porPessoa.map((p) => {
                  // Sem `pessoaId` (recebível sem pessoa) não há alvo: a linha não tem link.
                  const href = p.pessoaId === null ? undefined : hrefs.pendentePorPessoa[p.pessoaId];
                  return (
                    <li key={p.pessoaId ?? "sem-pessoa"} className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                        <span className="min-w-0 truncate">{p.nome}</span>
                        <VerRegistros href={href} de={p.nome} />
                      </div>
                      <span className="shrink-0 font-medium tabular-nums">
                        {formatCurrency(p.pendente)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
              <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <span className="min-w-0 text-muted-foreground">{rotuloPendenteDoMes(mesSel)}</span>
                <VerRegistros href={hrefs.pendenteDoMes} de={rotuloPendenteDoMes(mesSel)} />
              </div>
              <span className="shrink-0 font-medium tabular-nums">{formatCurrency(aReceber)}</span>
            </div>
          </div>
        </Bloco>
      </div>

      {/* Detalhamento */}
      <section aria-labelledby="painel-detalhamento" className="space-y-4">
        <h2 id="painel-detalhamento" className="text-lg font-semibold tracking-tight">
          Detalhamento
        </h2>

        {/* Card-âncora: valor pessoal × terceiros + cartão × à vista + faturas + contas */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="overflow-hidden ring-1 ring-primary/25">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-4">
                {/* `min-w-0`: mesma razão do StatCard — sem ele o texto empurra o ícone
                    para fora e o `overflow-hidden` do Card corta o ícone pela metade. */}
                <div className="min-w-0 space-y-1">
                  <p className="text-sm font-medium break-words text-muted-foreground">
                    {rotulos.cardMinhasSaidas.titulo(monthYearLabel(mesSel))}
                  </p>
                  <p className="text-3xl font-semibold tracking-tight tabular-nums">
                    {minhasSaidasCard.valor}
                  </p>
                  <VerRegistros href={hrefs.saidas} de={rotulos.cardMinhasSaidas.titulo(monthYearLabel(mesSel))} />
                  {base === "competencia" && frase !== null && (
                    <p className="text-xs break-words text-muted-foreground">{frase}</p>
                  )}
                  {caixaErro && (
                    <p className="text-xs break-words text-muted-foreground">
                      Não foi possível ler o caixa.
                    </p>
                  )}
                </div>
                <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/15">
                  <Scale className="size-5" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{rotulos.cardMinhasSaidas.bruto}</p>
                  <p className="font-semibold tabular-nums">{minhasSaidasCard.bruto}</p>
                  <VerRegistros href={hrefs.bruto} de={rotulos.cardMinhasSaidas.bruto} />
                </div>
                <div className="rounded-lg bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{rotulos.cardMinhasSaidas.terceiros}</p>
                  <p className="font-semibold tabular-nums">{minhasSaidasCard.terceiros}</p>
                  <VerRegistros href={hrefs.terceiros} de={rotulos.cardMinhasSaidas.terceiros} />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2">
            <ComRegistros href={hrefs.cartao?.bruto}>
              <StatCard
                label="Gasto no cartão"
                value={formatCurrency(resumo.cartao)}
                icon={CreditCard}
                hint={`Pela fatura · à vista ${formatCurrency(resumo.aVista)}`}
              />
            </ComRegistros>
            <StatCard
              label="Faturas (aberta/fechada)"
              value={`${faturasAbertas}/${faturasFechadas}`}
              icon={ReceiptText}
              hint="Pela fatura · no período em diante"
            />
            <ComRegistros href={hrefs.contas}>
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
            </ComRegistros>
            <ComRegistros href={hrefs.cartao?.meu}>
              <StatCard
                label="Cartão realmente meu"
                value={formatCurrency(resumo.cartaoMeu)}
                icon={Scale}
                hint={`Pela fatura · terceiros ${formatCurrency(resumo.cartao - resumo.cartaoMeu)}`}
              />
            </ComRegistros>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{rotulos.formas.titulo}</CardTitle>
              <CardDescription>{rotulos.formas.descricao}</CardDescription>
            </CardHeader>
            <CardContent>
              {caixaErro ? (
                <CaixaNaoLido />
              ) : (
                <FormaPagamentoChart data={graficosCaixa ? graficosCaixa.formas : formas} />
              )}
              {/* 04-B: um link por forma, abaixo do gráfico; só na competência (`hrefs.formas` vem
                  vazio na base caixa). */}
              {!caixaErro && !graficosCaixa && (
                <LinksPorFatia
                  itens={formas.map((f) => ({
                    chave: f.paymentMethod,
                    nome: ROTULO_DA_FORMA[f.paymentMethod] ?? f.paymentMethod,
                    href: hrefs.formas[f.paymentMethod],
                  }))}
                />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{rotulos.mesAMes.titulo}</CardTitle>
              <CardDescription>{rotulos.mesAMes.descricao}</CardDescription>
            </CardHeader>
            <CardContent>
              {caixaErro ? (
                <CaixaNaoLido />
              ) : (
                <MesAMesChart
                  dados={graficosCaixa ? graficosCaixa.mesAMes.dados : mesAMesCompetencia}
                />
              )}
              {graficosCaixa && <RodapeDasFaturasSemTotal meses={graficosCaixa.semTotal.mesAMes} />}
              <p className="mt-2 text-xs text-muted-foreground">{FRASE_DO_MES}</p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Projeções */}
      <section aria-labelledby="painel-projecoes" className="space-y-4">
        <h2 id="painel-projecoes" className="text-lg font-semibold tracking-tight">
          Projeções
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{rotulos.projecao.titulo}</CardTitle>
              <CardDescription>{rotulos.projecao.descricao}</CardDescription>
            </CardHeader>
            <CardContent>
              <ProjecaoChart data={projecao} />
              {/* 04-B: um link por mês da projeção, abaixo do gráfico (fora do SVG). */}
              <LinksPorFatia
                itens={projecao.map((p) => ({
                  chave: p.mes,
                  nome: monthYearLabel(p.mes),
                  href: hrefs.projecao[p.mes],
                }))}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{rotulos.faturas.titulo}</CardTitle>
              <CardDescription>{rotulos.faturas.descricao}</CardDescription>
            </CardHeader>
            <CardContent>
              <FaturasChart data={faturasFuturas} />
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}
