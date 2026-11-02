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
export function valorDaFatura(f: FaturaProvisao): number | null {
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
