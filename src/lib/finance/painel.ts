/**
 * REDESIGN-04-A — regras PURAS do painel financeiro (`/dashboard/financeiro`).
 *
 * Nada aqui lê o relógio nem o banco: `hoje`, o corte e os dados chegam de fora. Todo dinheiro é
 * somado em CENTAVOS (`reaisParaCentavos`/`centavosParaReais`) e só vira texto por `formatCurrency`.
 * Nenhuma conta do motor é reimplementada: estorno sai de `itensDasFaturas`, "a receber" sai de
 * `totalPendenteAte`, variação sai de `variacaoPct`.
 */
import type { BaseFinanceira } from "@/lib/finance/base";
import type { EstadoDoCaixa } from "@/lib/finance/caixa-leitura";
import {
  type CategoriaSlice,
  type DashInstallmentItem,
  type DashReceivable,
  type DashStatement,
  type DashTx,
  type EvolucaoPonto,
  type FaturaProvisao,
  type MesAMesDados,
  type ResumoMes,
  itensDasFaturas,
  mesDe,
  variacaoPct,
} from "@/lib/finance/dashboard";
import { type RecebivelComRecebimentos, totalPendenteAte } from "@/lib/finance/recebimentos";
import type { TransactionType } from "@/lib/finance/constants";
import type { Responsabilidade } from "@/lib/finance/responsabilidade";
import { centavosParaReais, formatCurrency, reaisParaCentavos } from "@/lib/format";

export type Sentido = "bom" | "ruim" | "neutro";

/** A comparação de um indicador com o mês anterior: o número, a cor do sentido e a legenda. */
export type ComparacaoDoIndicador = { pct: number | null; sentido: Sentido; texto: string };

/** "DD/MM" de uma data 'yyyy-MM-dd', tirado do próprio texto (sem converter para Date). */
function diaMes(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/** "−R$ 20,00" para negativo, "R$ 20,00" para o resto. */
function moedaComSinal(reais: number): string {
  return reais < 0 ? `−${formatCurrency(Math.abs(reais))}` : formatCurrency(reais);
}

/* ───────────────────────────── Formas que a página entrega ao cliente ───────────────────────────── */

/** Uma linha de "Últimas transações": o lançamento como ele é (valor cheio), pronto para mostrar. */
export type UltimaTransacaoDoPainel = {
  id: string;
  /** 'yyyy-MM-dd' — a data de competência, texto puro. */
  data: string;
  descricao: string;
  categoria: string | null;
  valor: number;
  tipo: TransactionType;
};

/** A leitura de "Últimas transações": falha é falha, lista vazia é vazio (`estadoDoBloco`). */
export type UltimasDoPainel =
  | { ok: true; itens: UltimaTransacaoDoPainel[] }
  | { ok: false };

/** Um cartão do bloco "Cartões de crédito". `texto: null` = cor fora do formato → estilo neutro. */
export type CartaoDoPainel = {
  id: string;
  nome: string;
  cor: string | null;
  texto: "branco" | "escuro" | null;
  /** O valor CHEIO da fatura atual; `null` = "sem lançamentos conhecidos". */
  faturaAtual: number | null;
  minhaParte: number | null;
  /** 'yyyy-MM-dd' do fechamento da fatura atual; `null` sem fatura. */
  fechaEm: string | null;
};

/* ───────────────────────────── Indicadores ───────────────────────────── */

/**
 * K1 — "Minhas entradas": o valor é a MINHA parte (`entradasMeu`), nunca o bruto. A linha de
 * terceiros só existe quando `entradasTerceiros` é diferente de zero em centavos.
 */
export function indicadorMinhasEntradas(
  r: Pick<ResumoMes, "entradasMeu" | "entradasTerceiros">,
): { valor: number; linhaDeTerceiros: string | null } {
  const terceirosCent = reaisParaCentavos(r.entradasTerceiros);
  return {
    valor: r.entradasMeu,
    linhaDeTerceiros:
      terceirosCent === 0 ? null : `+ ${formatCurrency(centavosParaReais(terceirosCent))} de terceiros`,
  };
}

/**
 * K2 — "Saldo das contas · em DD/MM". `saldoAte` é o saldo cortado em hoje; `saldoDaView` o da view
 * (que inclui lançamento pago com data futura). A diferença só vira linha quando é diferente de zero
 * em centavos. `saldoAte: null` = a leitura falhou: sem número e sem linha de diferença.
 */
export function saldoComData(p: {
  saldoAte: number | null;
  saldoDaView: number;
  hoje: string;
}): { rotulo: string; valor: number | null; diferenca: string | null } {
  const rotulo = `Saldo das contas · em ${diaMes(p.hoje)}`;
  if (p.saldoAte === null) return { rotulo, valor: null, diferenca: null };
  const diferencaCent = reaisParaCentavos(p.saldoDaView) - reaisParaCentavos(p.saldoAte);
  return {
    rotulo,
    valor: p.saldoAte,
    diferenca:
      diferencaCent === 0
        ? null
        : `não inclui lançamentos pagos com data futura (diferença de ${formatCurrency(
            centavosParaReais(Math.abs(diferencaCent)),
          )})`,
  };
}

/** O valor de um indicador: o número ou o texto de erro (que NUNCA vira zero na tela). */
export type ValorDoIndicador = number | { erro: string };

/**
 * K6 — os três indicadores da base caixa: renda pessoal recebida, a minha parte do que saiu das
 * contas e a de terceiros dentro disso, todos de `caixa.graficos.minha` (nenhuma conta nova).
 * `null` = base competência (não há caixa). Leitura do caixa com erro: os TRÊS levam o texto de erro
 * de sempre — ⛔ nunca R$ 0,00, que diria ao dono que nada entrou nem saiu.
 */
export function indicadoresDoCaixa(caixa: EstadoDoCaixa | null): {
  entradas: ValorDoIndicador;
  saidas: ValorDoIndicador;
  terceiros: ValorDoIndicador;
} | null {
  if (caixa === null) return null;
  if (caixa.estado === "erro") {
    const erro = { erro: "Não foi possível ler o caixa" };
    return { entradas: { ...erro }, saidas: { ...erro }, terceiros: { ...erro } };
  }
  const { minha } = caixa.graficos;
  return {
    entradas: minha.entradas,
    saidas: minha.saidas,
    terceiros: minha.terceirosNasSaidas,
  };
}

/**
 * O valor de um indicador pronto para a tela: o número vira texto de moeda; o estado de erro passa
 * como está (nunca vira R$ 0,00).
 */
function valorDoIndicador(v: ValorDoIndicador): string | { erro: string } {
  return typeof v === "number" ? formatCurrency(v) : v;
}

/**
 * A cor da seta pelo SIGNIFICADO: entrada que sobe é boa; saída que sobe é ruim. Mês em andamento
 * não dá cor à saída (a comparação é parcial: o cartão ainda não fechou). Sem base ou sem variação
 * é neutro. Entrada tem cor também em andamento: o corte do dia vale para os dois meses.
 */
export function sentidoDaVariacao(
  tipo: "entrada" | "saida",
  pct: number | null,
  emAndamento: boolean,
): Sentido {
  if (pct === null || pct === 0) return "neutro";
  if (tipo === "saida" && emAndamento) return "neutro";
  const sobe = pct > 0;
  if (tipo === "entrada") return sobe ? "bom" : "ruim";
  return sobe ? "ruim" : "bom";
}

/**
 * A comparação dos dois indicadores (entradas e saídas) com o mês anterior. `ateODia` (não nulo) =
 * mês em andamento, comparado até o dia D; `null` = mês inteiro. Na competência, a saída em andamento
 * é só o à vista (o cartão fica fora). Sem base (mês anterior zerado) o texto diz isso e o sentido é
 * neutro.
 */
export function comparacaoDosIndicadores(p: {
  dados: MesAMesDados;
  ateODia: number | null;
  base: BaseFinanceira;
  /** Mês selecionado depois do mês em andamento: só o que já está lançado, sem cor (revisão 04-A). */
  futuro?: boolean;
}): { entradas: ComparacaoDoIndicador; saidas: ComparacaoDoIndicador } {
  const { dados, ateODia, base } = p;
  if (p.futuro) {
    const semCor = (pct: number | null): ComparacaoDoIndicador => ({
      pct,
      sentido: "neutro",
      texto: "mês futuro: só o que já está lançado",
    });
    return {
      entradas: semCor(variacaoPct(dados.atual.entradas, dados.anterior.entradas)),
      saidas: semCor(variacaoPct(dados.atual.saidas, dados.anterior.saidas)),
    };
  }
  const emAndamento = ateODia !== null;
  const pctEntradas = variacaoPct(dados.atual.entradas, dados.anterior.entradas);
  const pctSaidas = variacaoPct(dados.atual.saidas, dados.anterior.saidas);

  const textoDe = (pct: number | null, soAVista: boolean): string => {
    if (pct === null) return "sem base de comparação";
    if (!emAndamento) return "vs. mês anterior";
    return soAVista
      ? `só o à vista, até o dia ${ateODia}, vs. mês anterior`
      : `até o dia ${ateODia} vs. mês anterior`;
  };

  return {
    entradas: {
      pct: pctEntradas,
      sentido: sentidoDaVariacao("entrada", pctEntradas, emAndamento),
      texto: textoDe(pctEntradas, false),
    },
    saidas: {
      pct: pctSaidas,
      sentido: sentidoDaVariacao("saida", pctSaidas, emAndamento),
      texto: textoDe(pctSaidas, base === "competencia"),
    },
  };
}

/* ───────────────────────────── Os indicadores de uma responsabilidade (04-A2, D-A2-15) ───────────────────────────── */

/**
 * Um indicador pronto para a peça `Indicador`: rótulo, dica, número (ou o estado que NÃO é número),
 * a linha do que ele mede e a comparação. É a forma que o painel e o relatório compartilham — por
 * isso o número dos dois bate por construção, e não por coincidência de duas montagens.
 */
export type IndicadorPronto = {
  rotulo: string;
  dica: string;
  valor: string | { erro: string } | { naoSegue: string } | { ausente: string };
  linhaDeBase: string;
  /** Detalhe que contém dinheiro: some junto com o olho. */
  detalheComValor: string | null;
  comparacao: ComparacaoDoIndicador | null;
};

const NAO_SEGUE_NO_CAIXA = "não segue a responsabilidade na base caixa";

type MinhaDoCaixa = Extract<EstadoDoCaixa, { estado: "ok" }>["graficos"]["minha"];

/**
 * Os três primeiros indicadores do Resumo — entradas, saídas e o quarto (De terceiros em "meu";
 * o pendente em "terceiros" e "consolidado") — na responsabilidade e na base pedidas.
 *
 * ⛔ Nenhuma conta nova: cada número é um campo de `resumoMes`, ou de `caixa.graficos.minha` na base
 * caixa (D-A2-21). O que o caixa não traz vira `{ naoSegue }`, sem subtração. Falha de leitura do caixa
 * é TEXTO, nunca R$ 0,00. Os textos de "meu" são os que o painel já tinha.
 *
 * `comparacao` (as setas) só chega em "meu" e sem recorte (D-A2-22); nos outros casos, o texto diz
 * "sem comparação nesta responsabilidade" (sem recorte) ou "sem comparação neste recorte" (com recorte). `null` em `p.comparacao` = sem setas (caixa com erro).
 */
export function indicadoresDoResumo(p: {
  resp: Responsabilidade;
  base: BaseFinanceira;
  resumo: Pick<
    ResumoMes,
    "entradas" | "entradasMeu" | "entradasTerceiros" | "saidas" | "meu" | "terceiros"
  >;
  caixa: EstadoDoCaixa | null;
  comparacao: { entradas: ComparacaoDoIndicador; saidas: ComparacaoDoIndicador } | null;
  /** Só "terceiros" e "consolidado" leem o pendente; "meu" não o usa. */
  pendente: { ate: number; rotuloAte: string; referenteAoMes: number };
  /** O recorte ligado, no fim da linha de base (ex.: " · Cartão A"); `null` = sem recorte. */
  rotuloDoRecorte: string | null;
  /** Mês pedido além da janela lida: o último mês lido ('AAAA-MM'); `null` = dentro da janela. */
  foraDaJanela: string | null;
}): { entradas: IndicadorPronto; saidas: IndicadorPronto; quarto: IndicadorPronto } {
  const normal = montarIndicadoresDoResumo(p);
  // Na base competência, além da janela o número não existe: o motivo ocupa o lugar do valor (K1).
  // Caixa ignora: o caixa lê o que está no banco, independente da janela de lançamentos.
  if (p.base !== "competencia" || p.foraDaJanela === null) return normal;
  const [ano, mes] = p.foraDaJanela.split("-");
  const fora = (i: IndicadorPronto): IndicadorPronto => ({
    ...i,
    valor: { ausente: `fora do período lido (até ${mes}/${ano})` },
    detalheComValor: null,
    comparacao: null,
  });
  return { entradas: fora(normal.entradas), saidas: fora(normal.saidas), quarto: fora(normal.quarto) };
}

/** A montagem dos três indicadores para o mês lido, sem o aviso de janela (ver `indicadoresDoResumo`). */
function montarIndicadoresDoResumo(
  p: Parameters<typeof indicadoresDoResumo>[0],
): { entradas: IndicadorPronto; saidas: IndicadorPronto; quarto: IndicadorPronto } {
  const { resp, base, resumo, pendente } = p;
  const recorte = p.rotuloDoRecorte ?? "";
  const emCaixa = base === "caixa";

  // Na base caixa sem leitura nenhuma, o que chega ao dono é "não leu", nunca um zero.
  const caixa: EstadoDoCaixa | null = emCaixa ? (p.caixa ?? { estado: "erro" }) : null;
  const caixaInd = indicadoresDoCaixa(caixa);
  const minha: MinhaDoCaixa | null = caixa?.estado === "ok" ? caixa.graficos.minha : null;

  const comSetas = resp === "meu" && p.rotuloDoRecorte === null;
  // Quem bloqueia a seta: com recorte ligado, o recorte; sem ele (só pode ser Terceiros ou
  // Consolidado), a responsabilidade. Dizer "recorte" onde não há nenhum manda o dono procurar um filtro.
  const semComparacao = (): ComparacaoDoIndicador => ({
    pct: null,
    sentido: "neutro",
    texto: p.rotuloDoRecorte === null ? "sem comparação nesta responsabilidade" : "sem comparação neste recorte",
  });
  const comparacaoDe = (qual: "entradas" | "saidas"): ComparacaoDoIndicador | null =>
    comSetas ? (p.comparacao?.[qual] ?? null) : semComparacao();

  const minhaEDeTerceiros = (meu: number, terceiros: number): string =>
    `minha ${formatCurrency(meu)} · de terceiros ${formatCurrency(terceiros)}`;

  if (resp === "meu") {
    const entradasComp = indicadorMinhasEntradas(resumo);
    return {
      entradas: {
        rotulo: "Minhas entradas",
        dica: "A parte das entradas que é sua (renda pessoal). Dinheiro de terceiros fica de fora.",
        valor: caixaInd ? valorDoIndicador(caixaInd.entradas) : formatCurrency(entradasComp.valor),
        linhaDeBase: `${caixaInd ? "renda pessoal recebida · caixa realizado" : "renda pessoal · competência"}${recorte}`,
        // Tem dinheiro: some junto com o olho (revisão final 04-A).
        detalheComValor: caixaInd ? null : entradasComp.linhaDeTerceiros,
        comparacao: comparacaoDe("entradas"),
      },
      saidas: {
        rotulo: "Minhas saídas",
        dica: "A sua parte das saídas. O que é de terceiros fica de fora e aparece em De terceiros.",
        valor: caixaInd ? valorDoIndicador(caixaInd.saidas) : formatCurrency(resumo.meu),
        linhaDeBase: `${caixaInd ? "minha parte · caixa realizado" : "minha parte · competência · inclui o que ainda está pendente"}${recorte}`,
        detalheComValor: null,
        comparacao: comparacaoDe("saidas"),
      },
      quarto: {
        rotulo: "De terceiros",
        dica: "A parte de terceiros dentro das saídas: o que foi pago por você e volta para você.",
        valor: caixaInd ? valorDoIndicador(caixaInd.terceiros) : formatCurrency(resumo.terceiros),
        linhaDeBase: `${caixaInd ? "terceiros nas saídas · caixa realizado" : "parte de terceiros nas saídas · competência"}${recorte}`,
        detalheComValor: null,
        comparacao: null,
      },
    };
  }

  // "Pendente de terceiros até DD/MM": o sufixo vem do rótulo que a tela já calcula, sem reabrir a data.
  const ate = /até \d{2}\/\d{2}$/.exec(pendente.rotuloAte);
  const quarto: IndicadorPronto = {
    rotulo: ate ? `Pendente de terceiros ${ate[0]}` : pendente.rotuloAte,
    dica: "O que terceiros ainda não devolveram até esta data, já descontado o que voltou.",
    valor: formatCurrency(pendente.ate),
    linhaDeBase: `o que ainda não voltou para você${recorte}`,
    detalheComValor: `referente ao mês: ${formatCurrency(pendente.referenteAoMes)}`,
    comparacao: null,
  };

  if (resp === "terceiros") {
    return {
      entradas: {
        rotulo: "Entradas de terceiros",
        dica: "O dinheiro que entrou e é de terceiros. Não é renda sua.",
        valor: emCaixa ? { naoSegue: NAO_SEGUE_NO_CAIXA } : formatCurrency(resumo.entradasTerceiros),
        linhaDeBase: `${emCaixa ? "entradas de terceiros · caixa realizado" : "entradas de terceiros · competência"}${recorte}`,
        detalheComValor: null,
        comparacao: comparacaoDe("entradas"),
      },
      saidas: {
        rotulo: "Saídas de terceiros",
        dica: "A parte de terceiros dentro das saídas: o que foi pago por você e volta para você.",
        valor: caixaInd ? valorDoIndicador(caixaInd.terceiros) : formatCurrency(resumo.terceiros),
        linhaDeBase: `${caixaInd ? "terceiros nas saídas · caixa realizado" : "parte de terceiros nas saídas · competência"}${recorte}`,
        detalheComValor: null,
        comparacao: comparacaoDe("saidas"),
      },
      quarto,
    };
  }

  // consolidado: o bruto como número, com "minha" e "de terceiros" em linha separada (nunca "meu gasto").
  return {
    entradas: {
      rotulo: "Entradas (bruto)",
      dica: "Tudo o que entrou, somando a sua parte e a de terceiros.",
      valor: emCaixa ? { naoSegue: NAO_SEGUE_NO_CAIXA } : formatCurrency(resumo.entradas),
      linhaDeBase: `${emCaixa ? "bruto · caixa realizado" : "bruto · competência"}${recorte}`,
      detalheComValor: emCaixa ? null : minhaEDeTerceiros(resumo.entradasMeu, resumo.entradasTerceiros),
      comparacao: comparacaoDe("entradas"),
    },
    saidas: {
      rotulo: "Saídas (bruto)",
      dica: "Tudo o que saiu, somando a sua parte e a de terceiros.",
      valor: emCaixa
        ? minha
          ? formatCurrency(minha.saidasBrutas)
          : { erro: "Não foi possível ler o caixa" }
        : formatCurrency(resumo.saidas),
      linhaDeBase: `${emCaixa ? "bruto · caixa realizado" : "bruto · competência"}${recorte}`,
      detalheComValor: emCaixa
        ? minha
          ? minhaEDeTerceiros(minha.saidas, minha.terceirosNasSaidas)
          : null
        : minhaEDeTerceiros(resumo.meu, resumo.terceiros),
      comparacao: comparacaoDe("saidas"),
    },
    quarto,
  };
}

/* ───────────────────────────── A receber por pessoa (D-A-14) ───────────────────────────── */

/**
 * "A receber" por pessoa até o corte. Agrupa e chama `totalPendenteAte` em CADA grupo — não
 * reimplementa o saldo —, então a soma das pessoas é o total por construção. Quem não tem pendente
 * não aparece; a ordem é do maior pendente para o menor.
 */
export function aReceberPorPessoa(
  recs: readonly (RecebivelComRecebimentos & { person: { id: string; nome: string } | null })[],
  corte: string,
): { pessoaId: string | null; nome: string; pendente: number }[] {
  const grupos = new Map<string | null, { nome: string; itens: RecebivelComRecebimentos[] }>();
  for (const r of recs) {
    const chave = r.person?.id ?? null;
    const grupo = grupos.get(chave) ?? { nome: r.person?.nome ?? "Sem pessoa", itens: [] };
    grupo.itens.push(r);
    grupos.set(chave, grupo);
  }
  return [...grupos.entries()]
    .map(([pessoaId, g]) => ({ pessoaId, nome: g.nome, pendente: totalPendenteAte(g.itens, corte) }))
    .filter((x) => reaisParaCentavos(x.pendente) !== 0)
    .sort((a, b) => reaisParaCentavos(b.pendente) - reaisParaCentavos(a.pendente));
}

/* ───────────────────────────── Rosca (D-A-11) ───────────────────────────── */

/**
 * Os estornos do cartão cujas faturas são do mês: −Σ da MINHA parte dos itens negativos de
 * `itensDasFaturas`. Devolve positivo, em reais. Nenhuma conta de estorno nova: o motor já os
 * produz com sinal negativo.
 */
export function estornosDoCartaoNoMes(p: {
  mes: string;
  transactions: DashTx[];
  statements: DashStatement[];
  installmentItems: DashInstallmentItem[];
  receivables: DashReceivable[];
}): number {
  const { mes, ...resto } = p;
  const doMes = new Set(
    p.statements.filter((s) => s.card_id && mesDe(s.competencia) === mes).map((s) => s.id),
  );
  let totalCent = 0;
  for (const [statementId, itens] of itensDasFaturas(resto)) {
    if (!doMes.has(statementId)) continue;
    for (const item of itens) {
      if (item.meuCent < 0) totalCent -= item.meuCent;
    }
  }
  return centavosParaReais(totalCent);
}

/** A rosca só tem fatias com a MINHA parte positiva (em centavos). */
export function dadosDaRosca(fatias: readonly CategoriaSlice[]): CategoriaSlice[] {
  return fatias.filter((f) => reaisParaCentavos(f.meu) > 0);
}

/**
 * O que ficou fora da rosca: quantas categorias têm minha parte zero ou negativa, a soma delas e os
 * estornos do cartão (D-A-11), com a frase da nota. Sem nada fora e sem estorno, `frase` é `null`.
 * Fecha a conta: Σ fatias − estornos + `soma` = minhas saídas.
 */
export function foraDaRosca(
  fatias: readonly CategoriaSlice[],
  estornos: number,
): { quantidade: number; soma: number; estornos: number; frase: string | null } {
  const fora = fatias.filter((f) => reaisParaCentavos(f.meu) <= 0);
  const somaCent = fora.reduce((s, f) => s + reaisParaCentavos(f.meu), 0);
  const soma = centavosParaReais(somaCent);
  const quantidade = fora.length;

  const partes: string[] = [];
  if (quantidade > 0) {
    partes.push(
      `${quantidade} ${quantidade === 1 ? "categoria" : "categorias"} com valor zero ou negativo (${moedaComSinal(soma)})`,
    );
  }
  if (reaisParaCentavos(estornos) > 0) {
    partes.push(`estornos do cartão: −${formatCurrency(estornos)}`);
  }
  return {
    quantidade,
    soma,
    estornos,
    frase: partes.length === 0 ? null : `Fora da rosca: ${partes.join("; ")}.`,
  };
}

/* ───────────────────────────── Barras ───────────────────────────── */

/**
 * Os pontos das barras, iguais aos de entrada, com o mês em andamento — e qualquer mês DEPOIS dele,
 * quando um mês futuro está selecionado — marcado como parcial (revisão final 04-A): o que ainda
 * não aconteceu não pode ter o mesmo traço do realizado. `null` = nenhum parcial.
 */
export function dadosDasBarras(
  evolucao: readonly EvolucaoPonto[],
  mesAtual: string | null,
): (EvolucaoPonto & { parcial: boolean })[] {
  return evolucao.map((p) => ({ ...p, parcial: mesAtual !== null && p.mes >= mesAtual }));
}

/* ───────────────────────────── Faturas ───────────────────────────── */

/** O valor cheio da fatura; `null` = fatura prevista sem lançamentos ("sem lançamentos conhecidos"). */
export function valorDaFatura(f: Pick<FaturaProvisao, "total" | "virtual">): number | null {
  return f.virtual && reaisParaCentavos(f.total) === 0 ? null : f.total;
}

/**
 * A fatura "atual" de um cartão: a primeira aberta por competência; sem aberta, a primeira virtual;
 * sem nenhuma, `null`.
 */
export function faturaAtualDoCartao(
  faturas: readonly FaturaProvisao[],
  cardId: string,
): FaturaProvisao | null {
  const doCartao = faturas
    .filter((f) => f.cardId === cardId)
    .sort((a, b) => (a.competencia < b.competencia ? -1 : a.competencia > b.competencia ? 1 : 0));
  return doCartao.find((f) => f.status === "aberta") ?? doCartao.find((f) => f.virtual) ?? null;
}

/** "Pendente ao banco": o total cheio das faturas REAIS ainda não pagas (previsão não é dívida). */
export function pendenteAoBanco(faturas: readonly FaturaProvisao[]): number {
  return centavosParaReais(
    faturas
      .filter((f) => !f.virtual && f.status !== "paga")
      .reduce((s, f) => s + reaisParaCentavos(f.total), 0),
  );
}
