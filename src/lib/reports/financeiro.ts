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
  SEM_RECORTE,
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
import {
  type Detalhe,
  type LinhaDoCaixa,
  type ParametrosDoDetalhe,
  type ParteDoDetalhe,
  type PedidoDeDetalhe,
  detalheDoNumero,
} from "@/lib/finance/detalhe";
import { saldoDasContas } from "@/lib/finance/saldo-das-contas";
import { formatCurrency } from "@/lib/format";
import { urlComDetalhe, urlSemDetalhe } from "@/lib/painel/detalhe-url";
import { type VistaDaGaveta, vistaDaGaveta } from "@/lib/painel/gaveta";
import { urlDoRelatorio } from "@/lib/reports/url-do-relatorio";

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
  rosca: {
    categorias: (CategoriaSlice & { valor: number })[];
    estornos: number;
    /** Aviso de que a soma está antes dos estornos do cartão (competência, fora de "meu"); `null` sem aviso. */
    nota: string | null;
  } | null;
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
const ANTES_DOS_ESTORNOS_NA_CATEGORIA = "antes dos estornos do cartão";
const ROSCA_ANTES_DOS_ESTORNOS =
  "Valores antes dos estornos do cartão: o total pode ficar acima das saídas do mês.";
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

/* ───────────────────────────── O recorte das entradas ───────────────────────────── */

/**
 * As entradas do motor e os recebíveis crus RECORTADOS, do jeito que o relatório os recorta: cartão
 * e conta nas entradas (`recortarEntradas`), pessoa e cartão nos crus (`recortarRecebiveisCrus`,
 * D-A2-9/D-A2-23). É a ÚNICA porta: o modelo de vista e o detalhamento (04-B) a chamam, e por isso
 * a lista de registros e o número leem a mesma coisa.
 */
function entradasDoRecorte(p: Pick<ParametrosDoRelatorio, "entradas" | "recebiveisCrus" | "recorte">) {
  return {
    e: recortarEntradas(p.entradas, p.recorte),
    crus: recortarRecebiveisCrus(p.recebiveisCrus, { pessoa: p.recorte.pessoa, cartao: p.recorte.cartao }),
  };
}

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
  // (04-B: o detalhamento recorta pelo MESMO helper — `entradasDoRecorte` —, nunca por outro jeito.)
  const { e, crus } = entradasDoRecorte(p);
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
    // A saída da categoria vem da fatia, que não desconta o estorno do cartão (D-A2-10): vale em
    // QUALQUER responsabilidade. Sem dinheiro no texto, por isso vai na linha de base.
    if (recorte.categoria !== null) {
      saidasInd = {
        ...saidasInd,
        linhaDeBase: `${saidasInd.linhaDeBase} · ${ANTES_DOS_ESTORNOS_NA_CATEGORIA}`,
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
          // Fora de "meu" a rosca soma o movimentado, sem o estorno que o total desconta.
          nota: resp !== "meu" && !emCaixa ? ROSCA_ANTES_DOS_ESTORNOS : null,
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

/* ───────────────────────────── 04-B: a gaveta de registros ───────────────────────────── */

/**
 * Os registros que compõem cada número da aba, prontos para a tela. ⛔ NÃO entra em `ReportsData`
 * nem em `RelatorioFinanceiro`: o botão "Baixar relatório (JSON)" exporta o `data` inteiro, e a
 * vista da gaveta e as URLs não são dado do relatório. Vai numa prop separada do cliente.
 */
export type GavetaDoRelatorio = {
  /** `null` sem `?detalhe=` na URL. */
  vista: VistaDaGaveta | null;
  /**
   * A URL de cada número que abre. Chaves: `saldo`, `entradas`, `saidas` (os dois indicadores, na
   * parte da responsabilidade), `meu`/`terceiros`/`bruto` (o quadro âncora, em `saidas`),
   * `pendente`, `pendente-do-mes`, `categoria:<id|sem-categoria>`, `forma:<forma>`,
   * `projecao:<mês>` e `caixa:<linha>`. Número que NÃO abre não tem chave: sem link.
   */
  hrefs: Record<string, string>;
  urlAoFechar: string;
  linkLancamentos: string;
};

const CAMINHO_DO_RELATORIO = "/relatorios";
const FRASE_FORA_DO_RELATORIO = "Este número não faz parte do relatório.";

/**
 * O bloco da matriz (`SEGUE_O_RECORTE`) que governa o número que o pedido abre — a fonte ÚNICA do
 * "abre ou não". `null` = o número não existe na aba (o painel o tem; o relatório, não).
 */
function blocoDoPedido(pedido: PedidoDeDetalhe): BlocoDoRelatorio | null {
  switch (pedido.chave) {
    case "entradas":
      return "entradas";
    case "saidas":
      return pedido.parte === "terceiros" ? "terceiros" : "saidas";
    case "pendente":
    case "pendente-do-mes":
      return "pendente";
    case "categoria":
      return "maiores";
    case "forma":
      return "formas";
    case "fatura":
      return "faturasFuturas";
    case "projecao":
      return "projecao";
    case "saldo":
      return "saldo";
    // O caixa não se recorta (D-A2-6, D-B-7): qualquer recorte é ✗, como nas saídas.
    case "caixa":
      return "saidas";
    case "cartao":
    case "contas":
      return null;
  }
}

/** Por que o pedido NÃO abre registros neste relatório (`null` = abre). */
function bloqueioDoPedido(
  p: ParametrosDoRelatorio,
  pedido: PedidoDeDetalhe,
): { frase: string; hrefSemFiltro: string | null } | null {
  const bloco = blocoDoPedido(pedido);
  if (bloco === null) return { frase: FRASE_FORA_DO_RELATORIO, hrefSemFiltro: null };

  const n = naoSegue(bloco, p.recorte, p.base);
  if (n !== null) {
    return {
      frase: textoDoNaoSegue(n),
      hrefSemFiltro: urlDoRelatorio({ mes: p.mes, base: p.base, resp: p.resp, recorte: SEM_RECORTE }),
    };
  }

  // D-A2-21: o caixa não traz as entradas de terceiros nem as brutas — o indicador diz "não segue".
  if (p.base === "caixa" && p.resp !== "meu" && pedido.chave === "entradas") {
    return {
      frase: `${NAO_SEGUE_RESP_NO_CAIXA.charAt(0).toUpperCase()}${NAO_SEGUE_RESP_NO_CAIXA.slice(1)}.`,
      hrefSemFiltro: urlDoRelatorio({ mes: p.mes, base: p.base, resp: "meu", recorte: p.recorte }),
    };
  }
  return null;
}

const LINHAS_DO_CAIXA: readonly LinhaDoCaixa[] = [
  "renda",
  "reembolsos",
  "outras",
  "saidas",
  "pagamentos",
  "sem-destino",
  "entre-contas",
];

/** O que a gaveta precisa além dos parâmetros do modelo de vista. */
export type ParametrosDaGaveta = ParametrosDoRelatorio & {
  /** O modelo já montado: os links só existem onde há número desenhado. */
  relatorio: RelatorioFinanceiro;
  pedido: PedidoDeDetalhe | null;
  sp: Record<string, string | string[] | undefined>;
  caixaParaDetalhe: ParametrosDoDetalhe["caixa"];
  saldos: ParametrosDoDetalhe["saldos"];
};

/**
 * O detalhe do número pedido (`null` sem pedido), sobre as entradas RECORTADAS como o relatório as
 * recorta — o mesmo helper (`entradasDoRecorte`), o mesmo recorte, base e responsabilidade. Onde o
 * bloco não segue o recorte, o estado é `nao-segue`, sem lista.
 */
export function detalheDoRelatorio(p: ParametrosDaGaveta): Detalhe | null {
  if (p.pedido === null) return null;
  const { e, crus } = entradasDoRecorte(p);
  // O `ref_month` dos crus é derivado DENTRO de `detalheDoNumero`, pela regra do pipeline: a
  // leitura real não o traz, e um caminho só serve ao painel e ao relatório.
  return detalheDoNumero({
    pedido: p.pedido,
    mes: p.mes,
    hoje: p.hoje,
    base: p.base,
    entradas: e,
    recebiveisCrus: crus,
    caixa: p.caixaParaDetalhe,
    saldos: p.saldos,
    completude: p.completude,
    naoSegue: bloqueioDoPedido(p, p.pedido),
    categoriaDoRecorte: p.recorte.categoria,
    nomes: {
      contas: new Map(p.opcoes.contas.map((o) => [o.id, o.nome])),
      cartoes: new Map(p.opcoes.cartoes.map((o) => [o.id, o.nome])),
    },
  });
}

/**
 * 04-B — a gaveta do relatório: as URLs de cada número que abre e, com `?detalhe=`, o detalhe pronto.
 *
 * O detalhe roda sobre as entradas RECORTADAS exatamente como `montarRelatorioFinanceiro` as recorta
 * (`entradasDoRecorte`, o mesmo helper), com o mesmo recorte, base e responsabilidade. Onde o bloco
 * não segue o recorte (`naoSegue` ≠ null) não há link, e um `?detalhe=` digitado à mão devolve o
 * estado "não segue", sem lista. `relatorio` é o modelo já montado: os links só existem onde há
 * número desenhado (categorias, formas e meses de projeção saem dele).
 */
export function gavetaDoRelatorio(p: ParametrosDaGaveta): GavetaDoRelatorio {
  const { mes, base, resp, relatorio } = p;
  const parteDaResp: ParteDoDetalhe = resp === "meu" ? "meu" : resp === "terceiros" ? "terceiros" : "bruto";

  const hrefs: Record<string, string> = {};
  const oferece = (chave: string, pedido: PedidoDeDetalhe) => {
    if (bloqueioDoPedido(p, pedido) === null) {
      hrefs[chave] = urlComDetalhe(CAMINHO_DO_RELATORIO, p.sp, pedido);
    }
  };

  oferece("saldo", { chave: "saldo", parte: "meu", alvo: null });
  oferece("entradas", { chave: "entradas", parte: parteDaResp, alvo: null });
  oferece("saidas", { chave: "saidas", parte: parteDaResp, alvo: null });
  // O quadro âncora mostra as três partes das saídas, qualquer que seja a responsabilidade.
  oferece("meu", { chave: "saidas", parte: "meu", alvo: null });
  oferece("terceiros", { chave: "saidas", parte: "terceiros", alvo: null });
  oferece("bruto", { chave: "saidas", parte: "bruto", alvo: null });
  oferece("pendente", { chave: "pendente", parte: "meu", alvo: null });
  // O "referente ao mês" só tem número desenhado dentro do quadro âncora.
  if (relatorio.ancora !== null && relatorio.ancora.pendenteDoMes !== null) {
    oferece("pendente-do-mes", { chave: "pendente-do-mes", parte: "meu", alvo: null });
  }

  // Categoria e forma não são calculadas na base caixa (o detalhe diz "não é calculado"): sem link.
  if (base !== "caixa") {
    const categorias = new Set<string>();
    for (const c of relatorio.rosca?.categorias ?? []) categorias.add(c.categoryId ?? "sem-categoria");
    for (const c of relatorio.maiores) categorias.add(c.categoryId ?? "sem-categoria");
    for (const id of categorias) oferece(`categoria:${id}`, { chave: "categoria", parte: parteDaResp, alvo: id });
    for (const f of relatorio.formas) {
      oferece(`forma:${f.paymentMethod}`, { chave: "forma", parte: parteDaResp, alvo: f.paymentMethod });
    }
  }
  for (const ponto of relatorio.projecao) {
    oferece(`projecao:${ponto.mes}`, { chave: "projecao", parte: "meu", alvo: ponto.mes });
  }
  // "Faturas dos próximos meses" não tem link: `FaturaDoMes` agrupa por mês e não carrega o id de
  // fatura que o detalhe pede (`fatura`, alvo = statement.id).
  if (base === "caixa" && relatorio.caixa?.estado === "ok") {
    for (const linha of LINHAS_DO_CAIXA) oferece(`caixa:${linha}`, { chave: "caixa", parte: "meu", alvo: linha });
  }

  const detalhe = detalheDoRelatorio(p);

  return {
    vista: detalhe === null ? null : vistaDaGaveta(detalhe),
    hrefs,
    urlAoFechar: urlSemDetalhe(CAMINHO_DO_RELATORIO, p.sp),
    linkLancamentos: `/financeiro/lancamentos?month=${mes}`,
  };
}
