import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader } from "@/components/shared/page-header";
import { BannerDeBoasVindas } from "@/components/shared/painel/banner-de-boas-vindas";
import { getUltimasTransacoes, lerFinanceiro, lerSaldoAte } from "@/lib/finance/queries";
import { getDisplayName } from "@/lib/settings/queries";
import {
  comparativoMesAMes,
  evolucaoMensal,
  faturasPorMes,
  gastosPorCategoria,
  gastosPorForma,
  gerarAlertas,
  mesDe,
  nextDayISO,
  paresDoMesAMes,
  perdoadoDoMes,
  proximas6Faturas,
  projecaoProximosMeses,
  proximasContasPagar,
  resumoMes,
  totalAReceber,
} from "@/lib/finance/dashboard";
import {
  ESCOPO_PAINEL,
  janelaDoRelatorio,
  saldoDasContas,
} from "@/lib/finance/pipeline";
import { baseDaUrl } from "@/lib/finance/base";
import { lerEstadoDoCaixa } from "@/lib/finance/caixa-leitura";
import { detalheDoNumero, type ParametrosDoDetalhe } from "@/lib/finance/detalhe";
import { reguaDoGastoAlto } from "@/lib/finance/regua-do-gasto-alto";
import { comparativoDoGraficoAteODia } from "@/lib/finance/caixa";
import {
  aReceberPorPessoa,
  estornosDoCartaoNoMes,
  faturaAtualDoCartao,
  pendenteAoBanco,
  saldoComData,
  valorDaFatura,
  type CartaoDoPainel,
  type UltimasDoPainel,
} from "@/lib/finance/painel";
import { rotuloTotalPendenteAte, totalPendenteAte } from "@/lib/finance/recebimentos";
import { horaDeBrasiliaAgora, hojeISO, reaisParaCentavos } from "@/lib/format";
import { textoSobreACor } from "@/lib/painel/cor";
import { mesDaUrl, pedidoDaUrl, urlSemDetalhe } from "@/lib/painel/detalhe-url";
import { vistaDaGaveta } from "@/lib/painel/gaveta";
import { hrefsDoPainel } from "@/lib/painel/hrefs-do-painel";
import { COOKIE_DO_OLHO, valoresOcultos } from "@/lib/painel/olho";
import { FRASES_DO_BANNER, fraseDoDia, saudacaoPara } from "@/lib/painel/saudacao";
import { DashboardClient } from "./financial-dashboard-client";

export const metadata: Metadata = { title: "Dashboard financeiro" };
export const dynamic = "force-dynamic";

export default async function DashboardFinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const hoje = hojeISO();
  const mesAtual = mesDe(hoje);
  const mesSel = mesDaUrl(sp.mes, mesAtual);

  // Base dos números (?base=caixa); sem o parâmetro, competência.
  const base = baseDaUrl(sp.base);

  // Janela de leitura: 6 meses para trás (evolução) até 6 meses à frente (projeção).
  const janela = janelaDoRelatorio({ mesSel, mesAtual });
  const { evoMeses, projMeses } = janela;

  // O olho dos valores é do aparelho (cookie): só o valor exato "1" oculta (`valoresOcultos`).
  const ocultos = valoresOcultos((await cookies()).get(COOKIE_DO_OLHO)?.value);

  // UMA rodada de leituras, sem N+1 (RLS escopa o dono). `lerFinanceiro` é a MESMA chamada do
  // relatório, com os recebíveis crus (com a pessoa) a mais (D-A-14). As outras três são do painel:
  // o saldo cortado em hoje (K2, `null` = não leu), as últimas transações (falha vira o estado de
  // falha do BLOCO, nunca a página inteira) e o nome do banner (que nunca lança).
  const [leitura, saldoAte, ultimasLeitura, nome] = await Promise.all([
    lerFinanceiro({ janela, escopo: ESCOPO_PAINEL }),
    lerSaldoAte(nextDayISO(hoje)),
    getUltimasTransacoes(hoje).then(
      (itens) => ({ ok: true as const, itens }),
      () => ({ ok: false as const }),
    ),
    getDisplayName(),
  ]);
  const { entradas, contas: accounts, recebiveis, completude } = leitura;
  const { txs, sts, recs, inst, cards: dashCards, recorrencias, bills: dashBills } = entradas;

  // Agregações (no servidor — módulo puro, determinístico).
  const resumo = resumoMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const perdoado = perdoadoDoMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const comparativo = comparativoMesAMes({ mes: mesSel, transactions: txs, statements: sts, receivables: recs });
  const evolucao = evolucaoMensal({ meses: evoMeses, transactions: txs, statements: sts, receivables: recs });
  const categorias = gastosPorCategoria({ mes: mesSel, transactions: txs, statements: sts, installmentItems: inst, receivables: recs });
  const formas = gastosPorForma({ mes: mesSel, transactions: txs, statements: sts, installmentItems: inst, receivables: recs });
  const faturas = proximas6Faturas({ hoje, cards: dashCards, statements: sts, receivables: recs });
  const projecao = projecaoProximosMeses({ hoje, meses: projMeses, statements: sts, receivables: recs, recorrencias, bills: dashBills });
  // Gráfico novo: as faturas dos meses da projeção com o valor CHEIO, pelo vencimento.
  const faturasFuturas = faturasPorMes({ statements: sts, receivables: recs, meses: projMeses, agrupar: "vencimento" });
  const contas = proximasContasPagar({ hoje, bills: dashBills });
  const aReceber = totalAReceber(recs, mesSel);
  const saldo = saldoDasContas(accounts);

  // A leitura da base caixa só acontece quando ela está selecionada. `lerEstadoDoCaixa` devolve,
  // além do estado que a tela já usava, a leitura crua e o motor que a gaveta de registros lista
  // (04-B): relê-los numa segunda consulta abriria uma janela em que lista e número discordam.
  const doCaixa =
    base === "caixa"
      ? await lerEstadoDoCaixa(
          mesSel,
          hoje,
          { statements: sts, receivables: recs, transactions: txs, installmentItems: inst },
          evoMeses,
        )
      : null;
  const caixa = doCaixa ? doCaixa.estado : null;

  // Corte "até o dia D" do mês em andamento (K3b) para as setas dos indicadores e o "Meu mês a mês"
  // — calculado no servidor, viaja por prop.
  const graficoAteODia = comparativoDoGraficoAteODia({
    mes: mesSel,
    hoje,
    transactions: txs,
    receivables: recs,
  });

  // A régua do alerta de gasto alto — a MESMA que o sino usa desde a 03-B2 (B2, decisão do dono):
  // até 5 meses anteriores ao selecionado, mês sem saída ignorado. K3 (04-A): no mês em andamento
  // é até o dia D, sem o cartão.
  const regua = reguaDoGastoAlto({
    mes: mesSel,
    hoje,
    transactions: txs,
    statements: sts,
    receivables: recs,
  });
  const alertas = gerarAlertas({
    hoje,
    resumoAtual: resumo,
    regua,
    cards: dashCards,
    statements: sts,
    receivables: recs,
  });

  // Faturas abertas/fechadas (efetivas) para o card de contagem.
  const faturasAbertas = faturas.filter((f) => !f.virtual && f.status === "aberta").length;
  const faturasFechadas = faturas.filter(
    (f) => !f.virtual && (f.status === "fechada" || f.status === "atrasada"),
  ).length;

  // ── O painel (04-A): tudo serializável, calculado aqui; o cliente só desenha. ──
  const saldoCom = saldoComData({ saldoAte, saldoDaView: saldo, hoje });
  // O estorno do cartão só pesa na rosca de COMPETÊNCIA (D-A-11); a de caixa tem a conta dela.
  const estornos =
    base === "competencia"
      ? estornosDoCartaoNoMes({
          mes: mesSel,
          transactions: txs,
          statements: sts,
          installmentItems: inst,
          receivables: recs,
        })
      : 0;
  const porPessoa = aReceberPorPessoa(recebiveis, hoje);
  const totalPendente = totalPendenteAte(recebiveis, hoje);
  const rotuloTotalPendente = rotuloTotalPendenteAte(hoje);
  const pendenteBanco = pendenteAoBanco(faturas);
  const cartoesDoPainel: CartaoDoPainel[] = dashCards.map((card) => {
    const f = faturaAtualDoCartao(faturas, card.id);
    const valor = f ? valorDaFatura(f) : null;
    return {
      id: card.id,
      nome: card.nome,
      cor: card.cor,
      texto: textoSobreACor(card.cor),
      faturaAtual: valor,
      minhaParte: f && valor !== null ? f.meu : null,
      fechaEm: f ? f.dataFechamento : null,
    };
  });
  const ultimas: UltimasDoPainel = ultimasLeitura.ok
    ? {
        ok: true,
        itens: ultimasLeitura.itens.map((t) => ({
          id: t.id,
          data: t.competence_date,
          descricao: t.description ?? "Sem descrição",
          categoria: t.category?.name ?? null,
          valor: Number(t.amount),
          tipo: t.type,
        })),
      }
    : { ok: false };

  // ── 04-B: a gaveta de registros. O pedido vem da URL (`?detalhe=`); o detalhe é montado AQUI, a
  // partir das MESMAS variáveis (`txs`/`sts`/`recs`/`inst`/…) que montaram os números acima — uma
  // lista paralela faria o número e os registros discordarem. O cliente recebe a vista pronta. ──
  const pedido = pedidoDaUrl(sp);

  // D-B-12: o saldo abre "saldo por conta" — uma chamada da MESMA RPC por conta, só com a gaveta
  // aberta nele. Falha de uma conta vira `saldoCent: null` (a gaveta diz qual); nunca zero.
  let saldos: ParametrosDoDetalhe["saldos"] = null;
  if (pedido?.chave === "saldo") {
    const corte = nextDayISO(hoje);
    const porConta = await Promise.all(
      accounts.map(async (conta) => {
        const valor = await lerSaldoAte(corte, conta.id).catch(() => null);
        return { id: conta.id, nome: conta.name, saldoCent: valor === null ? null : reaisParaCentavos(valor) };
      }),
    );
    saldos = { totalCent: saldoAte === null ? null : reaisParaCentavos(saldoAte), porConta };
  }

  const detalhe = pedido
    ? detalheDoNumero({
        pedido,
        mes: mesSel,
        hoje,
        base,
        entradas: { txs, sts, recs, inst, cards: dashCards, recorrencias, bills: dashBills },
        recebiveisCrus: recebiveis,
        caixa:
          base === "caixa"
            ? doCaixa?.leitura && doCaixa.motorDoCaixa
              ? { leitura: doCaixa.leitura, motor: doCaixa.motorDoCaixa }
              : "erro"
            : null,
        saldos,
        completude,
        naoSegue: null,
        categoriaDoRecorte: null,
        nomes: {
          contas: new Map(accounts.map((a) => [a.id, a.name])),
          cartoes: new Map(dashCards.map((c) => [c.id, c.nome])),
        },
      })
    : null;
  const vista = detalhe ? vistaDaGaveta(detalhe) : null;

  // Fatura real de cada linha do painel (a view `faturas` não carrega o id): casada por cartão +
  // competência, a mesma chave de `proximas6Faturas`. Fatura virtual não tem registros.
  const idDaFatura = new Map<string, string>();
  for (const s of sts) if (s.card_id) idDaFatura.set(`${s.card_id}|${mesDe(s.competencia)}`, s.id);
  const faturaIds: Record<string, string> = {};
  for (const f of faturas) {
    const chave = `${f.cardId}|${f.competencia}`;
    const id = idDaFatura.get(chave);
    if (!f.virtual && id !== undefined) faturaIds[chave] = id;
  }
  const hrefs = hrefsDoPainel({
    sp,
    base,
    pessoas: porPessoa.flatMap((p) => (p.pessoaId === null ? [] : [p.pessoaId])),
    categorias: categorias.map((c) => c.categoryId),
    formas: formas.map((f) => f.paymentMethod),
    faturas: Object.values(faturaIds),
    meses: projecao.map((p) => p.mes),
  });

  // O banner é Server Component, sem JS de cliente: chega pronto ao cliente como `ReactNode`.
  const [anoSel, mesNumSel] = mesSel.split("-").map(Number);
  const mesPorExtenso = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
    new Date(anoSel, mesNumSel - 1, 1),
  );
  const banner = (
    <BannerDeBoasVindas
      saudacao={saudacaoPara(horaDeBrasiliaAgora())}
      nome={nome}
      linha={`Aqui está o resumo de ${mesPorExtenso}.`}
      frase={fraseDoDia(hoje, FRASES_DO_BANNER)}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard financeiro"
        description="Quanto você realmente gastou e quanto vai receber de volta."
      />
      <DashboardClient
        banner={banner}
        ocultos={ocultos}
        completude={completude}
        mesSel={mesSel}
        base={base}
        caixa={caixa}
        saldoCom={saldoCom}
        resumo={resumo}
        perdoado={perdoado}
        graficoAteODia={graficoAteODia}
        mesAMesCompetencia={paresDoMesAMes(graficoAteODia !== null ? graficoAteODia.comparativo : comparativo)}
        evolucao={evolucao}
        categorias={categorias}
        estornos={estornos}
        mesAtual={mesAtual}
        formas={formas}
        faturas={faturas}
        cartoes={cartoesDoPainel}
        pendenteBanco={pendenteBanco}
        ultimas={ultimas}
        porPessoa={porPessoa}
        totalPendente={totalPendente}
        rotuloTotalPendente={rotuloTotalPendente}
        projecao={projecao}
        faturasFuturas={faturasFuturas}
        alertas={alertas}
        contas={contas}
        aReceber={aReceber}
        faturasAbertas={faturasAbertas}
        faturasFechadas={faturasFechadas}
        vista={vista}
        hrefs={hrefs}
        faturaIds={faturaIds}
        urlAoFechar={urlSemDetalhe("/dashboard/financeiro", sp)}
        linkLancamentos={`/financeiro/lancamentos?month=${mesSel}`}
        linkContas={pedido?.chave === "saldo" ? "/financeiro/contas" : null}
      />
    </div>
  );
}
