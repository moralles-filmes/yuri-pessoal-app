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
    const doPagamento = e.alocacoes.filter((a) => a.transactionId === p.transactionId);
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
