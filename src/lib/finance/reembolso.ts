/**
 * REDESIGN-04-C · T1 — A REGRA PURA DA DISTRIBUIÇÃO DO REEMBOLSO DE TERCEIROS (desenho §5.2).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Uma receita vinculada a uma pessoa é DINHEIRO QUE ENTROU; as dívidas dessa pessoa      ║
 * ║ (`receivables` em aberto) são o que ela deve. Esta regra diz como o primeiro abate o   ║
 * ║ segundo: do mais antigo para o mais novo, cada dívida recebendo no máximo o seu saldo. ║
 * ║                                                                                       ║
 * ║ ⛔ SÓ O DINHEIRO LIVRE CORRE. Alocação que já existe nunca é desfeita nem movida para   ║
 * ║    "abrir espaço" a uma dívida mais antiga que apareça depois (passo 6). A única       ║
 * ║    exceção é encolher/remover alocação cujo pagamento encolheu ou sumiu (passos 1–2).  ║
 * ║ ⛔ Saldo a favor e dívida em aberto NUNCA coexistem depois de aplicar a regra.         ║
 * ║ ⛔ Esta regra é espelhada em SQL (`realocar_reembolsos_da_pessoa`) passo a passo, e os  ║
 * ║    MESMOS casos dourados (`reembolso-casos.ts`) provam as duas. Mexeu na ordem ou num  ║
 * ║    desempate aqui, mexa lá.                                                           ║
 * ║                                                                                       ║
 * ║ Puro: sem I/O, sem `zod`, sem `Date.now()`. Valores em CENTAVOS inteiros, nunca       ║
 * ║ arredondados. Datas são 'yyyy-MM-dd' (data pura) ou ISO; todas as comparações de      ║
 * ║ texto são LEXICOGRÁFICAS.                                                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import type { Classificacao } from "@/lib/finance/constants";
import { centavosParaReais, formatCurrency } from "@/lib/format";

/** A parte da pessoa numa receita vinculada com status `recebido`. */
export type PagamentoDoReembolso = {
  readonly transactionId: string;
  readonly contaId: string | null;
  /** amount − coalesce(valor_pessoal, 0). */
  readonly parteCentavos: number;
  /** 'yyyy-MM-dd' = coalesce(liquidado_em, competence_date). */
  readonly recebidoEm: string;
  /** ISO; desempate. */
  readonly criadoEm: string;
};

/** Um recebível da pessoa, como a regra o enxerga. */
export type DividaDaPessoa = {
  readonly receivableId: string;
  readonly valorCentavos: number;
  /** Coluna crua. */
  readonly status: string;
  /** Σ recebimentos com `transaction_id` nulo (K0 incluído: legado `pago` = valor). */
  readonly recebidoManualCentavos: number;
  /** coalesce(fatura.data_vencimento, lançamento.competence_date, data_prevista, created_at::date). */
  readonly dataDaDivida: string;
  readonly criadoEm: string;
};

/** Um recebimento já gravado a partir de um pagamento (`receivable_receipts` com `transaction_id`). */
export type AlocacaoAutomatica = {
  readonly id: string;
  readonly receivableId: string;
  readonly transactionId: string;
  readonly valorCentavos: number;
  readonly recebidoEm: string;
  readonly criadoEm: string;
};

/** Alocação a inserir: leva a data e a conta DO PAGAMENTO de onde saiu o dinheiro. */
export type NovaAlocacao = Omit<AlocacaoAutomatica, "id" | "criadoEm"> & { readonly contaId: string | null };

export type Realocacao = {
  /** ids de alocação a apagar. */
  remover: string[];
  /** alocações que ficam, com o NOVO valor. */
  reduzir: { id: string; valorCentavos: number }[];
  inserir: NovaAlocacao[];
};

export type EstadoDoReembolso = {
  readonly pagamentos: readonly PagamentoDoReembolso[];
  readonly dividas: readonly DividaDaPessoa[];
  readonly alocacoes: readonly AlocacaoAutomatica[];
};

/** Status que RECEBEM alocação. `ignorado`, `pago` (inclusive o legado K0) e qualquer outro ficam fora. */
const STATUS_QUE_RECEBEM: ReadonlySet<string> = new Set(["pendente", "cobrado"]);

/** Comparação lexicográfica de texto (nunca `localeCompare`: o SQL ordena por bytes/collation C). */
function comparar(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Do mais antigo para o mais novo: `dataDaDivida`, `criadoEm`, `receivableId`. Não altera a entrada. */
export function ordenarDividas(d: readonly DividaDaPessoa[]): DividaDaPessoa[] {
  return [...d].sort(
    (x, y) =>
      comparar(x.dataDaDivida, y.dataDaDivida) ||
      comparar(x.criadoEm, y.criadoEm) ||
      comparar(x.receivableId, y.receivableId),
  );
}

/** Pagamentos na ordem em que o dinheiro corre: `recebidoEm`, `criadoEm`, `transactionId`. */
function ordenarPagamentos(p: readonly PagamentoDoReembolso[]): PagamentoDoReembolso[] {
  return [...p].sort(
    (x, y) =>
      comparar(x.recebidoEm, y.recebidoEm) ||
      comparar(x.criadoEm, y.criadoEm) ||
      comparar(x.transactionId, y.transactionId),
  );
}

/** Passos 1–2: o que sobra das alocações existentes depois de tirar as órfãs e aparar o excesso. */
function aparar(e: EstadoDoReembolso): {
  remover: string[];
  reduzir: { id: string; valorCentavos: number }[];
  depois: AlocacaoAutomatica[];
} {
  const remover: string[] = [];
  const reduzir: { id: string; valorCentavos: number }[] = [];
  const novoValor = new Map<string, number>(); // id → valor; 0 = removida

  // Passo 1 — alocação de pagamento que não existe mais, ou num recebível que não é desta pessoa
  // (o SQL faz o mesmo: a dívida sumiu ou mudou de dono).
  const pagamentos = new Set(e.pagamentos.map((p) => p.transactionId));
  const dividas = new Set(e.dividas.map((d) => d.receivableId));
  for (const a of e.alocacoes) {
    if (!pagamentos.has(a.transactionId) || !dividas.has(a.receivableId)) {
      remover.push(a.id);
      novoValor.set(a.id, 0);
    }
  }

  // Passo 2 — pagamento que encolheu: desfaz as alocações MAIS NOVAS primeiro.
  for (const p of e.pagamentos) {
    // Só as que sobreviveram ao passo 1 — o SQL apaga as órfãs ANTES de somar o excesso.
    const doPagamento = e.alocacoes.filter((a) => a.transactionId === p.transactionId && novoValor.get(a.id) !== 0);
    let excesso = doPagamento.reduce((s, a) => s + a.valorCentavos, 0) - p.parteCentavos;
    if (excesso <= 0) continue;
    const maisNovasPrimeiro = [...doPagamento].sort((x, y) => comparar(y.criadoEm, x.criadoEm) || comparar(y.id, x.id));
    for (const a of maisNovasPrimeiro) {
      if (excesso <= 0) break;
      if (a.valorCentavos <= excesso) {
        remover.push(a.id);
        novoValor.set(a.id, 0);
        excesso -= a.valorCentavos;
      } else {
        const valor = a.valorCentavos - excesso;
        reduzir.push({ id: a.id, valorCentavos: valor });
        novoValor.set(a.id, valor);
        excesso = 0;
      }
    }
  }

  const depois = e.alocacoes
    .filter((a) => novoValor.get(a.id) !== 0)
    .map((a) => (novoValor.has(a.id) ? { ...a, valorCentavos: novoValor.get(a.id)! } : a));
  return { remover, reduzir, depois };
}

/** Passo 3: dinheiro livre por pagamento (parte − alocado), na ordem de corrida. Só os com sobra. */
function livrePorPagamento(
  pagamentos: readonly PagamentoDoReembolso[],
  alocacoes: readonly AlocacaoAutomatica[],
): { pagamento: PagamentoDoReembolso; livreCentavos: number }[] {
  const resultado: { pagamento: PagamentoDoReembolso; livreCentavos: number }[] = [];
  for (const p of ordenarPagamentos(pagamentos)) {
    const alocado = alocacoes.filter((a) => a.transactionId === p.transactionId).reduce((s, a) => s + a.valorCentavos, 0);
    const livreCentavos = p.parteCentavos - alocado;
    if (livreCentavos > 0) resultado.push({ pagamento: p, livreCentavos });
  }
  return resultado;
}

/** Passo 4: dívidas abertas (`pendente`/`cobrado` com saldo > 0), em ordem, com o saldo já descontado. */
function dividasAbertas(
  dividas: readonly DividaDaPessoa[],
  alocacoes: readonly AlocacaoAutomatica[],
): { divida: DividaDaPessoa; saldoCentavos: number }[] {
  const automatico = new Map<string, number>();
  for (const a of alocacoes) automatico.set(a.receivableId, (automatico.get(a.receivableId) ?? 0) + a.valorCentavos);
  const abertas: { divida: DividaDaPessoa; saldoCentavos: number }[] = [];
  for (const d of ordenarDividas(dividas)) {
    if (!STATUS_QUE_RECEBEM.has(d.status)) continue;
    const saldoCentavos = d.valorCentavos - d.recebidoManualCentavos - (automatico.get(d.receivableId) ?? 0);
    if (saldoCentavos > 0) abertas.push({ divida: d, saldoCentavos });
  }
  return abertas;
}

/** O que mudar nas alocações para o estado ficar certo. Idempotente: sobre o resultado, devolve tudo vazio. */
export function realocar(e: EstadoDoReembolso): Realocacao {
  const { remover, reduzir, depois } = aparar(e);
  const livres = livrePorPagamento(e.pagamentos, depois);
  const abertas = dividasAbertas(e.dividas, depois);
  const inserir: NovaAlocacao[] = [];

  // Passo 5 — guloso: cada pagamento, na ordem, preenche as dívidas na ordem.
  for (const livre of livres) {
    let sobra = livre.livreCentavos;
    for (const aberta of abertas) {
      if (sobra <= 0) break;
      if (aberta.saldoCentavos <= 0) continue;
      const pedaco = Math.min(sobra, aberta.saldoCentavos);
      inserir.push({
        receivableId: aberta.divida.receivableId,
        transactionId: livre.pagamento.transactionId,
        valorCentavos: pedaco,
        recebidoEm: livre.pagamento.recebidoEm,
        contaId: livre.pagamento.contaId,
      });
      aberta.saldoCentavos -= pedaco;
      sobra -= pedaco;
    }
  }
  // Passo 6 — nada além de `inserir` toca alocação existente (fora o aparar dos passos 1–2).
  return { remover, reduzir, inserir };
}

/**
 * Lista final de alocações depois de aplicar `r` — para teste e prévia. As inseridas ganham id
 * `nova:<n>` e um `criadoEm` posterior a qualquer alocação real, para ficarem como as mais novas.
 */
export function aplicarRealocacao(e: EstadoDoReembolso, r: Realocacao): AlocacaoAutomatica[] {
  const removidos = new Set(r.remover);
  const novoValor = new Map(r.reduzir.map((x) => [x.id, x.valorCentavos] as const));
  const mantidas = e.alocacoes
    .filter((a) => !removidos.has(a.id))
    .map((a) => (novoValor.has(a.id) ? { ...a, valorCentavos: novoValor.get(a.id)! } : a));
  const inseridas = r.inserir.map(
    (n, i): AlocacaoAutomatica => ({
      id: `nova:${i}`,
      receivableId: n.receivableId,
      transactionId: n.transactionId,
      valorCentavos: n.valorCentavos,
      recebidoEm: n.recebidoEm,
      // Milissegundos = n: ISO de ano 9999 que ordena depois de qualquer data real e na ordem de inserção.
      criadoEm: `9999-12-31T00:00:00.${String(i).padStart(3, "0")}Z`,
    }),
  );
  return [...mantidas, ...inseridas];
}

/** Depois de aplicar a regra: devido = Σ saldos abertos; saldo a favor = Σ dinheiro livre que sobrou. */
export function situacaoDaPessoa(e: EstadoDoReembolso): { devidoCentavos: number; saldoAFavorCentavos: number } {
  const final = aplicarRealocacao(e, realocar(e));
  const devidoCentavos = dividasAbertas(e.dividas, final).reduce((s, d) => s + d.saldoCentavos, 0);
  const saldoAFavorCentavos = livrePorPagamento(e.pagamentos, final).reduce((s, l) => s + l.livreCentavos, 0);
  return { devidoCentavos, saldoAFavorCentavos };
}

export type PreviaDoReembolso = {
  /** O que a pessoa deve ANTES desta receita (já líquido de crédito, e sem a contribuição atual dela). */
  devidoAntesCentavos: number;
  devidoDepoisCentavos: number;
  /** O que passa do que a pessoa deve. */
  sobraCentavos: number;
};

/**
 * Prévia de um lançamento. Tira do estado a contribuição desta receita (na criação é 0 e 0),
 * reequilibra dívida e crédito, e só então aplica o valor novo.
 */
export function previaDoReembolso(a: {
  devidoCentavos: number;
  saldoAFavorCentavos: number;
  /** na edição: o que ESTA receita já contribui hoje (0 e 0 na criação) */
  parteAtualDestaCentavos: number;
  alocadoDestaCentavos: number;
  /** a parte da pessoa que o dono está lançando agora = amount inteiro */
  valorCentavos: number;
}): PreviaDoReembolso {
  const devido = a.devidoCentavos + a.alocadoDestaCentavos;
  const credito = a.saldoAFavorCentavos - (a.parteAtualDestaCentavos - a.alocadoDestaCentavos);
  const devidoReal = Math.max(0, devido - credito);
  return {
    devidoAntesCentavos: devidoReal,
    devidoDepoisCentavos: Math.max(0, devidoReal - a.valorCentavos),
    sobraCentavos: Math.max(0, a.valorCentavos - devidoReal),
  };
}

/**
 * Importação: vários lançamentos da mesma pessoa no mesmo lote, em sequência — a situação depois de
 * cada valor alimenta o seguinte. O crédito só sobrevive quando a pessoa não devia nada (senão foi
 * consumido pela dívida); a sobra NÃO vira crédito aqui, porque quem decide é a escolha do dono.
 */
export function previaDoLote(
  situacao: { devidoCentavos: number; saldoAFavorCentavos: number },
  valoresCentavos: readonly number[],
): PreviaDoReembolso[] {
  let devido = situacao.devidoCentavos;
  let credito = situacao.saldoAFavorCentavos;
  const previas: PreviaDoReembolso[] = [];
  for (const valorCentavos of valoresCentavos) {
    previas.push(
      previaDoReembolso({
        devidoCentavos: devido,
        saldoAFavorCentavos: credito,
        parteAtualDestaCentavos: 0,
        alocadoDestaCentavos: 0,
        valorCentavos,
      }),
    );
    const previa = previas[previas.length - 1]!;
    credito = Math.max(0, credito - devido);
    devido = previa.devidoDepoisCentavos;
  }
  return previas;
}

/** O que fazer com o valor que passa do que a pessoa deve: a receita fica do dono, ou vai para o saldo a favor. */
export const ESCOLHAS_DA_SOBRA = ["receita", "saldo"] as const;
export type EscolhaDaSobra = (typeof ESCOLHAS_DA_SOBRA)[number];

export const MSG_ESCOLHA_A_SOBRA = "Este valor passa do que a pessoa deve. Escolha o que fazer com a sobra.";
export const MSG_DIVIDA_MUDOU = "O que esta pessoa deve mudou enquanto você lançava. Confira a prévia e salve de novo.";
export const MSG_REEMBOLSO_SO_DE_TERCEIRO = "Só uma entrada de terceiro pode abater o que uma pessoa deve.";

export type DecisaoDoReembolso =
  | { ok: true; receita_classificacao: "terceiro" | "compartilhada" | "pessoal"; minhaParteCentavos: number | null; vincula: boolean }
  | { ok: false; campo: "reembolso_sobra" | "reembolso_pessoa_id"; mensagem: string };

/**
 * Decide o lançamento de uma receita com pessoa. A classificação final SAI DA SOBRA quando há
 * pessoa: `compartilhada` pedida pelo dono cai nas mesmas regras de `terceiro`. Puro: a prévia
 * e a escolha chegam prontas; `devidoVistoCentavos` null significa "não conferir" (importação).
 */
export function decidirReembolso(a: {
  classificacaoPedida: Classificacao;
  previa: PreviaDoReembolso;
  valorCentavos: number;
  escolha: EscolhaDaSobra | null;
  /** o que a tela mostrou; null = não conferir (importação) */
  devidoVistoCentavos: number | null;
}): DecisaoDoReembolso {
  if (a.classificacaoPedida === "pessoal") {
    return { ok: false, campo: "reembolso_pessoa_id", mensagem: MSG_REEMBOLSO_SO_DE_TERCEIRO };
  }
  if (a.devidoVistoCentavos !== null && a.devidoVistoCentavos !== a.previa.devidoAntesCentavos) {
    return { ok: false, campo: "reembolso_sobra", mensagem: MSG_DIVIDA_MUDOU };
  }
  const sobra = a.previa.sobraCentavos;
  if (sobra === 0) {
    return { ok: true, receita_classificacao: "terceiro", minhaParteCentavos: null, vincula: true };
  }
  if (a.escolha === null) {
    return { ok: false, campo: "reembolso_sobra", mensagem: MSG_ESCOLHA_A_SOBRA };
  }
  if (a.escolha === "saldo") {
    return { ok: true, receita_classificacao: "terceiro", minhaParteCentavos: null, vincula: true };
  }
  if (sobra < a.valorCentavos) {
    return { ok: true, receita_classificacao: "compartilhada", minhaParteCentavos: sobra, vincula: true };
  }
  return { ok: true, receita_classificacao: "pessoal", minhaParteCentavos: null, vincula: false };
}

/**
 * 04-C · T6 — o que a prévia de UM lançamento precisa do estado da pessoa. Puro: o servidor
 * (`lerReembolsoDaReceita`), a leitura da tela (`lerPreviaDoReembolso`) e o teste usam ESTA conta.
 * `transactionId` é a receita em edição (null na criação): a parte dela no pagamento e o que ela já
 * alocou entram para `previaDoReembolso` tirá-los antes de aplicar o valor novo.
 */
export function entradaDaPrevia(
  estado: EstadoDoReembolso,
  transactionId: string | null,
): {
  devidoCentavos: number;
  saldoAFavorCentavos: number;
  parteAtualDestaCentavos: number;
  alocadoDestaCentavos: number;
} {
  const { devidoCentavos, saldoAFavorCentavos } = situacaoDaPessoa(estado);
  if (transactionId === null) {
    return { devidoCentavos, saldoAFavorCentavos, parteAtualDestaCentavos: 0, alocadoDestaCentavos: 0 };
  }
  const parteAtualDestaCentavos =
    estado.pagamentos.find((p) => p.transactionId === transactionId)?.parteCentavos ?? 0;
  const alocadoDestaCentavos = estado.alocacoes
    .filter((a) => a.transactionId === transactionId)
    .reduce((soma, a) => soma + a.valorCentavos, 0);
  return { devidoCentavos, saldoAFavorCentavos, parteAtualDestaCentavos, alocadoDestaCentavos };
}

export const MSG_ESTORNO_NAO_ABATE = "Estorno de cartão não abate o que uma pessoa deve.";
export const MSG_LEITURA_DO_REEMBOLSO_FALHOU = "Não foi possível ler o que esta pessoa deve. Nada foi alterado.";

const brl = (centavos: number): string => formatCurrency(centavosParaReais(centavos));

export type FrasesDoReembolso = {
  /** A linha principal da prévia. */
  resumo: string;
  /** Só quando a receita é recebida e nada passa do que a pessoa deve. */
  foraDaRenda: string | null;
  /** Só com sobra: o quanto passa. */
  sobra: string | null;
  /** Textos das duas opções da sobra (sem padrão). */
  opcaoReceita: string | null;
  opcaoSaldo: string | null;
};

/** As frases da prévia (§5.4 / §11.3 do desenho). Puro: a tela só as escreve. */
export function frasesDoReembolso(a: {
  nome: string;
  previa: PreviaDoReembolso;
  valorCentavos: number;
  /** Receita ainda não recebida: não abate nada até ser marcada como recebida. */
  pendente: boolean;
}): FrasesDoReembolso {
  const { nome, previa, valorCentavos } = a;
  const sobra = previa.sobraCentavos;
  const resumo = a.pendente
    ? `${nome} deve ${brl(previa.devidoAntesCentavos)}. Receita pendente não abate; ao marcar como recebida, abate.`
    : previa.devidoAntesCentavos === 0
      ? `${nome} não deve nada agora.`
      : `${nome} deve ${brl(previa.devidoAntesCentavos)} → passa a dever ${brl(previa.devidoDepoisCentavos)}`;
  if (sobra === 0) {
    return {
      resumo,
      foraDaRenda: a.pendente ? null : "Fica fora da sua renda.",
      sobra: null,
      opcaoReceita: null,
      opcaoSaldo: null,
    };
  }
  return {
    resumo,
    foraDaRenda: null,
    sobra: `Passa ${brl(sobra)} do que ${nome} deve.`,
    opcaoReceita:
      sobra >= valorCentavos
        ? "A entrada inteira vira receita sua e não abate nada."
        : `${brl(sobra)} entra na sua renda; ${brl(valorCentavos - sobra)} abate o que ${nome} deve.`,
    opcaoSaldo: `Os ${brl(sobra)} abatem sozinhos as próximas compras divididas com ${nome}.`,
  };
}
