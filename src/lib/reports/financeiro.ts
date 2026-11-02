/**
 * REDESIGN-04-A2 — o MODELO DE VISTA do relatório financeiro (aba Financeiro de `/relatorios`).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ PURO: `hoje` e os dados chegam de fora — sem Supabase, sem `server-only`, sem relógio. ║
 * ║ O I/O mora em `reports/queries.ts`; a tela só desenha o que este modelo entrega.       ║
 * ║                                                                                      ║
 * ║ O MOTOR É A ÚNICA CONTA. Cada número é um campo de `resumoMes`, `gastosPorCategoria`,  ║
 * ║ `gastosPorForma`, `evolucaoMensal`, `faturasPorMes`… (ou de `caixa.graficos` na base   ║
 * ║ caixa). Nada aqui soma dinheiro: no máximo ESCOLHE o campo, e o desenho só manda       ║
 * ║ subtrair `movimentado − meu`, que sai de `fatiasDaResponsabilidade` (centavos).        ║
 * ║                                                                                      ║
 * ║ ⛔ O BLOCO ✗ (`naoSegue`) NUNCA LEVA NÚMERO: o dado dele sai `null` ou vazio, e o      ║
 * ║    indicador governado por ele vira `{ naoSegue }`. Ausência nunca vira R$ 0,00 —      ║
 * ║    falha de leitura é `{ erro }`; categoria sem item é zero MEDIDO (a leitura veio     ║
 * ║    completa e não há o que somar).                                                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A matriz do que cada recorte alcança é `SEGUE_O_RECORTE` (§5 do desenho); `naoSegue` a consulta.
 * Com o recorte de categoria só chegam RESULTADOS PRONTOS (`recortarPorCategoria`): sem lista
 * recortada na mão, ninguém consegue passá-la ao total da fatura.
 */
import type { BaseFinanceira } from "@/lib/finance/base";
import { comparativoDoGraficoAteODia } from "@/lib/finance/caixa";
import type { EstadoDoCaixa } from "@/lib/finance/caixa-leitura";
import type { Frequency } from "@/lib/finance/constants";
import {
  type CategoriaSlice,
  type EvolucaoPonto,
  type FaturaDoMes,
  type FormaSlice,
  type MesAMesDados,
  type ProjecaoPonto,
  comparativoMesAMes,
  faturasPorMes,
  gastosPorCategoria,
  gastosPorForma,
  mesDe,
  paresDoMesAMes,
  perdoadoDoMes,
  projecaoProximosMeses,
  resumoMes,
  totalAReceber,
} from "@/lib/finance/dashboard";
import {
  type IndicadorPronto,
  comparacaoDosIndicadores,
  dadosDasBarras,
  estornosDoCartaoNoMes,
  indicadoresDoResumo,
  saldoComData,
} from "@/lib/finance/painel";
import {
  type CompletudeFinanceira,
  type LinhaRecebivel,
  montarEntradas,
} from "@/lib/finance/pipeline";
import { rotuloTotalPendenteAte, totalPendenteAte } from "@/lib/finance/recebimentos";
import {
  type BlocoDoRelatorio,
  type EntradasDoMotorDoRelatorio,
  type Recorte,
  type TipoDeRecorte,
  naoSegue,
  recortarEntradas,
  recortarPorCategoria,
  recortarRecebiveisCrus,
  recortesAtivos,
} from "@/lib/finance/recorte";
import {
  type Responsabilidade,
  evolucaoDaResponsabilidade,
  fatiasDaResponsabilidade,
} from "@/lib/finance/responsabilidade";
import { saldoDasContas } from "@/lib/finance/saldo-das-contas";
import { formatCurrency } from "@/lib/format";

/* ───────────────────────────── Tipos ───────────────────────────── */

export type OpcoesDoFiltro = { id: string; nome: string }[];

/** O recebível CRU da leitura (`ESCOPO_PAINEL`): a linha do pipeline + pessoa e cartão. */
export type RecebivelCruDoRelatorio = LinhaRecebivel & {
  person_id: string | null;
  card_id: string | null;
  person: { id: string; nome: string } | null;
};

/** O que "assinaturas" lê da recorrência crua: descrição, valor, frequência e categoria. */
export type RecorrenciaDoRelatorio = {
  is_active: boolean;
  type: string;
  description: string | null;
  amount: number;
  frequency: Frequency;
  category: { id: string; name: string } | null;
};

/** O que o saldo lê da conta crua (a view `accounts_with_balance`). */
export type ContaDoRelatorio = { id: string; current_balance: number | null };

/** Um bloco do relatório: segue o recorte (`null`) ou não segue (tipo e motivo), e a responsabilidade. */
export type EstadoDoBloco = {
  naoSegue: { tipo: TipoDeRecorte; motivo: string } | null;
  /** Só na base caixa, em Terceiros e Consolidado (D-A2-21): o caixa não traz esse corte. */
  naoSegueResp: string | null;
};

export type RelatorioFinanceiro = {
  /** Chega INTACTA: o recorte não esconde a leitura parcial (Review Focus 4). */
  completude: CompletudeFinanceira;
  filtros: {
    mes: string;
    base: BaseFinanceira;
    resp: Responsabilidade;
    recorte: Recorte;
    opcoes: {
      contas: OpcoesDoFiltro;
      cartoes: OpcoesDoFiltro;
      pessoas: OpcoesDoFiltro;
      categorias: OpcoesDoFiltro;
    };
  };
  saldo: IndicadorPronto & { href: string };
  indicadores: { entradas: IndicadorPronto; saidas: IndicadorPronto; quarto: IndicadorPronto };
  blocos: Record<
    Exclude<BlocoDoRelatorio, "saldo" | "entradas" | "saidas" | "terceiros" | "pendente" | "setas">,
    EstadoDoBloco
  >;
  /** `[]` quando o bloco não segue. */
  barras: (EvolucaoPonto & { parcial: boolean })[];
  seriesDasBarras: "ambas" | "saidas";
  /** "Meu mês a mês", sempre a MINHA parte; `null` quando não segue (ou o caixa não foi lido). */
  mesAMes: MesAMesDados | null;
  /** O dia do corte do mês a mês no mês em andamento; `null` no mês fechado (ou sem mês a mês). */
  ateODia: number | null;
  /** Já na responsabilidade (`valor`); `null` quando não segue (ou o caixa não foi lido). */
  rosca: { categorias: (CategoriaSlice & { valor: number })[]; estornos: number } | null;
  formas: (FormaSlice & { valor: number })[];
  /** O quadro meu × bruto × terceiros; `null` quando não segue (ou o caixa não foi lido). */
  ancora: {
    meu: number;
    bruto: number;
    terceiros: number;
    /** `null` na base caixa: o perdoado é da competência. */
    perdoado: number | null;
    /** `null` quando o recebível não alcança o recorte (conta). */
    pendenteDoMes: number | null;
  } | null;
  maiores: CategoriaSlice[];
  assinaturas: { nome: string; valor: number; frequency: Frequency }[];
  projecao: ProjecaoPonto[];
  faturasFuturas: FaturaDoMes[];
  /** O estado do caixa na base caixa (nunca `null` nela: sem leitura é `{ estado: "erro" }`). */
  caixa: EstadoDoCaixa | null;
};

export type ParametrosDoRelatorio = {
  mes: string;
  hoje: string;
  base: BaseFinanceira;
  resp: Responsabilidade;
  recorte: Recorte;
  entradas: EntradasDoMotorDoRelatorio;
  recebiveisCrus: readonly RecebivelCruDoRelatorio[];
  contas: readonly ContaDoRelatorio[];
  recorrenciasCruas: readonly RecorrenciaDoRelatorio[];
  /** O saldo cortado em hoje (da conta, com o recorte de conta); `null` = não leu, nunca zero. */
  saldoAte: number | null;
  caixa: EstadoDoCaixa | null;
  completude: CompletudeFinanceira;
  janela: { evoMeses: string[]; projMeses: string[] };
  opcoes: RelatorioFinanceiro["filtros"]["opcoes"];
};

/* ───────────────────────────── Textos ───────────────────────────── */

const NAO_SEGUE_RESP_NO_CAIXA = "não segue a responsabilidade na base caixa";
const SALDO_NAO_LIDO = "Não foi possível ler o saldo";
const SEM_ESTORNO_NA_CATEGORIA = "estornos não têm categoria e ficam fora";
const CARTAO_NAO_SAI_DE_CONTA = "o cartão não sai de conta: a fatura paga aparece na base caixa";

const ROTULO_DO_TIPO: Record<TipoDeRecorte, string> = {
  conta: "conta",
  cartao: "cartão",
  pessoa: "pessoa",
  categoria: "categoria",
};

/** O texto que ocupa o lugar do número: o tipo do filtro e o porquê. */
function textoDoNaoSegue(n: { tipo: TipoDeRecorte; motivo: string }): string {
  return `Não segue o filtro de ${ROTULO_DO_TIPO[n.tipo]}: ${n.motivo}.`;
}

const LISTA_DO_TIPO: Record<TipoDeRecorte, keyof RelatorioFinanceiro["filtros"]["opcoes"]> = {
  conta: "contas",
  cartao: "cartoes",
  pessoa: "pessoas",
  categoria: "categorias",
};

/* ───────────────────────────── O modelo ───────────────────────────── */

export function montarRelatorioFinanceiro(p: ParametrosDoRelatorio): RelatorioFinanceiro {
  const { mes, hoje, base, resp, recorte, janela, opcoes } = p;
  const mesAtual = mesDe(hoje);
  const emCaixa = base === "caixa";
  const ns = (bloco: BlocoDoRelatorio) => naoSegue(bloco, recorte, base);

  // Na base caixa sem leitura nenhuma, o que chega ao dono é "não leu", nunca um zero.
  const caixa: EstadoDoCaixa | null = emCaixa ? (p.caixa ?? { estado: "erro" }) : null;
  const caixaOk = caixa?.estado === "ok" ? caixa : null;
  const caixaErro = emCaixa && caixaOk === null;
  const respNoCaixa = emCaixa && resp !== "meu";

  // Cartão e conta: o motor roda igual sobre as entradas recortadas. Sem recorte, as mesmas.
  const e = recortarEntradas(p.entradas, recorte);
  const resumoDoMotor = resumoMes({
    mes,
    transactions: e.txs,
    statements: e.sts,
    receivables: e.recs,
  });

  // Categoria: SÓ resultados prontos (nenhuma lista recortada chega até aqui).
  const porCategoria =
    recorte.categoria !== null
      ? recortarPorCategoria({ mes, categoriaId: recorte.categoria, entradas: e })
      : null;

  const nomeDoRecorte = (tipo: TipoDeRecorte): string => {
    const id = recorte[tipo];
    return opcoes[LISTA_DO_TIPO[tipo]].find((o) => o.id === id)?.nome ?? ROTULO_DO_TIPO[tipo];
  };
  const ativos = recortesAtivos(recorte);
  const rotuloDoRecorte = ativos.length === 0 ? null : ` · ${ativos.map(nomeDoRecorte).join(" · ")}`;

  /* ── O pendente: recebíveis crus, recortados SÓ por pessoa e cartão (D-A2-9, D-A2-23) ── */

  const crus = recortarRecebiveisCrus(p.recebiveisCrus, { pessoa: recorte.pessoa, cartao: recorte.cartao });
  const pendente = {
    ate: totalPendenteAte(crus, hoje),
    rotuloAte: rotuloTotalPendenteAte(hoje),
    // A mesma derivação de `ref_month` do pipeline, sobre os crus já recortados.
    referenteAoMes: totalAReceber(montarEntradas({ recebiveis: crus }).recs, mes),
  };

  /* ── O mês a mês e as setas (só "meu", sem recorte) ── */

  let mesAMes: MesAMesDados | null = null;
  let ateODia: number | null = null;
  if (ns("mesAMes") === null && !caixaErro) {
    if (caixaOk) {
      mesAMes = caixaOk.graficos.mesAMes.dados;
      ateODia = caixaOk.graficos.mesAMes.ateODia;
    } else {
      const comparativo = comparativoMesAMes({
        mes,
        transactions: e.txs,
        statements: e.sts,
        receivables: e.recs,
      });
      const corte = comparativoDoGraficoAteODia({
        mes,
        hoje,
        transactions: e.txs,
        receivables: e.recs,
      });
      mesAMes = paresDoMesAMes(corte !== null ? corte.comparativo : comparativo);
      ateODia = corte !== null ? corte.ateODia : null;
    }
  }
  const comSetas = resp === "meu" && rotuloDoRecorte === null;
  const comparacao =
    comSetas && mesAMes !== null
      ? comparacaoDosIndicadores({
          dados: mesAMes,
          ateODia,
          base,
          // Mês futuro: só o que já está lançado, sem cor (revisão final 04-A).
          futuro: mes > mesAtual,
        })
      : null;

  /* ── Os três indicadores (a MESMA função do painel, D-A2-15) ── */

  // Para a categoria o resumo é montado da fatia (a conta da rosca) e das receitas da categoria.
  // Fatia ausente é zero MEDIDO: a leitura veio completa e a categoria não tem item no mês.
  const resumo =
    porCategoria === null
      ? resumoDoMotor
      : {
          entradas: porCategoria.entradas.entradas,
          entradasMeu: porCategoria.entradas.entradasMeu,
          entradasTerceiros: porCategoria.entradas.entradasTerceiros,
          saidas: porCategoria.fatia?.movimentado ?? 0,
          meu: porCategoria.fatia?.meu ?? 0,
          terceiros:
            porCategoria.fatia === null
              ? 0
              : fatiasDaResponsabilidade([porCategoria.fatia], "terceiros")[0].valor,
        };

  const argumentosDosIndicadores = { base, resumo, caixa, comparacao, pendente, rotuloDoRecorte };
  const indicadoresBase = indicadoresDoResumo({ ...argumentosDosIndicadores, resp });
  // Com a pessoa, o quarto É o pendente dela, em qualquer responsabilidade (L5).
  const quartoBase =
    recorte.pessoa !== null
      ? indicadoresDoResumo({ ...argumentosDosIndicadores, resp: "terceiros" }).quarto
      : indicadoresBase.quarto;

  // Qual bloco da matriz governa cada indicador, por responsabilidade.
  const governador: Record<Responsabilidade, Record<"entradas" | "saidas" | "quarto", BlocoDoRelatorio>> = {
    meu: { entradas: "entradas", saidas: "saidas", quarto: "terceiros" },
    terceiros: { entradas: "entradas", saidas: "terceiros", quarto: "pendente" },
    consolidado: { entradas: "entradas", saidas: "saidas", quarto: "pendente" },
  };
  const quartoGovernadoPor: BlocoDoRelatorio = recorte.pessoa !== null ? "pendente" : governador[resp].quarto;

  /** ✗ não leva número: o texto ocupa o lugar, e nem seta nem detalhe com dinheiro sobram. */
  const semNumeroSeNaoSegue = (ind: IndicadorPronto, bloco: BlocoDoRelatorio): IndicadorPronto => {
    const n = ns(bloco);
    return n === null
      ? ind
      : { ...ind, valor: { naoSegue: textoDoNaoSegue(n) }, detalheComValor: null, comparacao: null };
  };

  let saidasInd = semNumeroSeNaoSegue(indicadoresBase.saidas, governador[resp].saidas);
  if (typeof saidasInd.valor === "string") {
    // O recorte de conta só enxerga o que saiu dela: a fatura paga é outra história (D-A2-12).
    if (recorte.conta !== null && !emCaixa) {
      saidasInd = { ...saidasInd, linhaDeBase: `${saidasInd.linhaDeBase} · ${CARTAO_NAO_SAI_DE_CONTA}` };
    }
    // O bruto da categoria não fecha com o bruto do mês, e a tela diz por quê (D-A2-10).
    if (recorte.categoria !== null && resp === "consolidado" && saidasInd.detalheComValor !== null) {
      saidasInd = {
        ...saidasInd,
        detalheComValor: `${saidasInd.detalheComValor} · ${SEM_ESTORNO_NA_CATEGORIA}`,
      };
    }
  }

  const indicadores = {
    entradas: semNumeroSeNaoSegue(indicadoresBase.entradas, governador[resp].entradas),
    saidas: saidasInd,
    quarto: semNumeroSeNaoSegue(quartoBase, quartoGovernadoPor),
  };

  /* ── O saldo (K2): com o recorte de conta, o DAQUELA conta ── */

  const contaDoRecorte =
    recorte.conta === null ? null : (p.contas.find((c) => c.id === recorte.conta) ?? null);
  const saldoDaView = saldoDasContas(contaDoRecorte !== null ? [contaDoRecorte] : p.contas);
  const saldoCom = saldoComData({ saldoAte: p.saldoAte, saldoDaView, hoje });
  const nsSaldo = ns("saldo");
  const doRecorteDeConta = recorte.conta !== null;
  const saldo: RelatorioFinanceiro["saldo"] = {
    rotulo: doRecorteDeConta ? saldoCom.rotulo.replace(/^Saldo das contas/, "Saldo da conta") : saldoCom.rotulo,
    dica: doRecorteDeConta
      ? "O saldo desta conta, contando só o que já aconteceu até o fim de hoje."
      : "A soma do saldo de todas as contas, contando só o que já aconteceu até o fim de hoje.",
    valor:
      nsSaldo !== null
        ? { naoSegue: textoDoNaoSegue(nsSaldo) }
        : saldoCom.valor === null || (doRecorteDeConta && contaDoRecorte === null)
          ? { erro: SALDO_NAO_LIDO }
          : formatCurrency(saldoCom.valor),
    linhaDeBase: doRecorteDeConta
      ? `${nomeDoRecorte("conta")}, até o fim de hoje`
      : "todas as contas, até o fim de hoje",
    detalheComValor:
      nsSaldo !== null || (doRecorteDeConta && contaDoRecorte === null) ? null : saldoCom.diferenca,
    comparacao: null,
    href: "/financeiro/contas",
  };

  /* ── Barras ── */

  let barras: RelatorioFinanceiro["barras"] = [];
  if (ns("barras") === null && !respNoCaixa && !caixaErro) {
    const evolucao = caixaOk
      ? caixaOk.graficos.evolucao
      : evolucaoDaResponsabilidade({
          meses: janela.evoMeses,
          resp,
          transactions: e.txs,
          statements: e.sts,
          receivables: e.recs,
        });
    barras = dadosDasBarras(evolucao, mesAtual);
  }

  /* ── Rosca, formas e maiores ── */

  const categoriasDaBase: CategoriaSlice[] | null = caixaErro
    ? null
    : caixaOk
      ? caixaOk.graficos.categorias
      : gastosPorCategoria({
          mes,
          transactions: e.txs,
          statements: e.sts,
          installmentItems: e.inst,
          receivables: e.recs,
        });

  const rosca: RelatorioFinanceiro["rosca"] =
    ns("rosca") === null && !respNoCaixa && categoriasDaBase !== null
      ? {
          categorias: fatiasDaResponsabilidade(categoriasDaBase, resp),
          // O estorno pesa só na rosca de COMPETÊNCIA e na minha parte (D-A-11).
          estornos:
            resp === "meu" && !emCaixa
              ? estornosDoCartaoNoMes({
                  mes,
                  transactions: e.txs,
                  statements: e.sts,
                  installmentItems: e.inst,
                  receivables: e.recs,
                })
              : 0,
        }
      : null;

  let formasBase: FormaSlice[] = [];
  if (ns("formas") === null && !respNoCaixa && !caixaErro) {
    formasBase = porCategoria
      ? porCategoria.formas
      : caixaOk
        ? caixaOk.graficos.formas
        : gastosPorForma({
            mes,
            transactions: e.txs,
            statements: e.sts,
            installmentItems: e.inst,
            receivables: e.recs,
          });
  }
  const formas = fatiasDaResponsabilidade(formasBase, resp);

  let maiores: CategoriaSlice[] = [];
  if (ns("maiores") === null && !caixaErro) {
    maiores = porCategoria ? (porCategoria.fatia === null ? [] : [porCategoria.fatia]) : (categoriasDaBase ?? []);
  }

  /* ── O quadro meu × bruto × terceiros ── */

  let ancora: RelatorioFinanceiro["ancora"] = null;
  if (ns("ancora") === null && !caixaErro) {
    const pendenteDoMes = ns("pendente") === null ? pendente.referenteAoMes : null;
    if (caixaOk) {
      const m = caixaOk.graficos.minha;
      ancora = {
        meu: m.saidas,
        bruto: m.saidasBrutas,
        terceiros: m.terceirosNasSaidas,
        perdoado: null,
        pendenteDoMes,
      };
    } else {
      ancora = {
        meu: resumoDoMotor.meu,
        bruto: resumoDoMotor.saidas,
        terceiros: resumoDoMotor.terceiros,
        perdoado: perdoadoDoMes({ mes, transactions: e.txs, statements: e.sts, receivables: e.recs }),
        pendenteDoMes,
      };
    }
  }

  /* ── Assinaturas ── */

  let assinaturas: RelatorioFinanceiro["assinaturas"] = [];
  if (ns("assinaturas") === null) {
    assinaturas = p.recorrenciasCruas
      .filter(
        (r) =>
          r.is_active &&
          r.type === "despesa" &&
          (recorte.categoria === null || r.category?.id === recorte.categoria),
      )
      .map((r) => ({
        nome: r.description ?? r.category?.name ?? "Recorrência",
        valor: r.amount,
        frequency: r.frequency,
      }))
      .sort((a, b) => b.valor - a.valor);
  }

  /* ── Projeções: sempre a minha parte (D-A2-7); nenhuma segue recorte ── */

  const projecao =
    ns("projecao") === null
      ? projecaoProximosMeses({
          hoje,
          meses: janela.projMeses,
          statements: e.sts,
          receivables: e.recs,
          recorrencias: e.recorrencias,
          bills: e.bills,
        })
      : [];

  // Fatura é de cartão: só o recorte de cartão a alcança (mesma função, sobre as faturas dele).
  const faturasFuturas =
    ns("faturasFuturas") === null
      ? faturasPorMes({
          statements: e.sts,
          receivables: e.recs,
          meses: janela.projMeses,
          agrupar: "vencimento",
        })
      : [];

  const estado = (bloco: BlocoDoRelatorio, seguraResp = false): EstadoDoBloco => ({
    naoSegue: ns(bloco),
    naoSegueResp: seguraResp && respNoCaixa ? NAO_SEGUE_RESP_NO_CAIXA : null,
  });

  return {
    completude: p.completude,
    filtros: { mes, base, resp, recorte, opcoes },
    saldo,
    indicadores,
    blocos: {
      barras: estado("barras", true),
      mesAMes: estado("mesAMes"),
      rosca: estado("rosca", true),
      formas: estado("formas", true),
      ancora: estado("ancora"),
      maiores: estado("maiores"),
      assinaturas: estado("assinaturas"),
      projecao: estado("projecao"),
      faturasFuturas: estado("faturasFuturas"),
    },
    barras,
    // No recorte de cartão as entradas não seguem (estorno não é entrada): só as saídas se desenham.
    seriesDasBarras: recorte.cartao !== null ? "saidas" : "ambas",
    mesAMes,
    ateODia,
    rosca,
    formas,
    ancora,
    maiores,
    assinaturas,
    projecao,
    faturasFuturas,
    caixa,
  };
}
