/**
 * Fase 05 — Persistência da divisão no servidor. Server-only (recebe o AuthContext),
 * mas NÃO é "use server": é utilitário das Server Actions, no espírito de statements.ts.
 *
 * Centraliza a gravação de `shared_expenses` + `receivables` e devolve a MINHA PARTE (centavos)
 * para o caller atualizar `transactions.valor_pessoal`. Tudo derivado no servidor a partir de
 * `dividirDespesa` (split.ts) — nunca confiando nos valores de divisão do client sem revalidar.
 * O `user_id` vem sempre de `auth.uid()` (via ctx).
 *
 * 03-G2 · E1 — a MATEMÁTICA saiu do I/O: `montarDivisaoAVista`/`montarDivisaoParcelada` são puros
 * e devolvem o `DivisaoPayload` (o que a RPC receberá); `applySplit`/`applySplitParcelado`
 * continuam gravando como sempre, a partir do MESMO payload — uma conta só, dois destinos.
 */
import type { AuthContext } from "@/lib/actions/helpers";
import {
  distribuirTerceirosPorParcela,
  dividirDespesa,
  toPartesDivisao,
  type ResultadoDivisao,
} from "@/lib/finance/split";
import { centavosParaReais } from "@/lib/format";
import type { SplitPartInput } from "@/lib/validators/split";

export type SplitPersistResult =
  | { ok: true; minhaParteCentavos: number }
  | { ok: false; error: string };

/* ───────────────────────── O payload da divisão (puro) ───────────────────────── */

/** Alcance da proteção dos recebíveis (D-G2-4): vai no payload e o SQL reconfere. */
export type AlcanceDaDivisao = "regra-cheia" | "so-dinheiro-registrado";

export type DivisaoPayload = {
  alcance: AlcanceDaDivisao;
  /** 1 por pessoa (`shared_expenses`); `valor` em REAIS. */
  pessoas: {
    person_id: string;
    tipo_divisao: string;
    percentual: number | null;
    valor: number;
  }[];
  /** 1 por pessoa (× parcela); só valor > 0. `parcela_numero` nulo = à vista. */
  recebiveis: {
    person_id: string;
    parcela_numero: number | null;
    statement_id: string | null;
    card_id: string | null;
    valor: number;
    data_prevista: string | null;
  }[];
};

export type DivisaoMontada =
  | { ok: true; divisao: DivisaoPayload; minhaParteCentavos: number }
  | { ok: false; error: string };

/** O "limpar": a despesa virou pessoal — sem divisão e sem recebíveis. */
export function divisaoVazia(alcance: AlcanceDaDivisao): DivisaoPayload {
  return { alcance, pessoas: [], recebiveis: [] };
}

function pessoasDoPayload(
  parts: SplitPartInput[],
  resultado: ResultadoDivisao,
): DivisaoPayload["pessoas"] {
  return parts.map((p, i) => ({
    person_id: p.person_id,
    tipo_divisao: p.tipo,
    percentual: p.tipo === "percentual" ? (p.percentual ?? null) : null,
    valor: centavosParaReais(resultado.partesTerceiros[i].valorCentavos),
  }));
}

/**
 * Divisão de uma despesa À VISTA / cartão simples (não parcelada): 1 recebível por pessoa (na
 * fatura da compra, quando cartão). Mesma conta de sempre: `dividirDespesa` + `toPartesDivisao`.
 */
export function montarDivisaoAVista(args: {
  totalCentavos: number;
  parts: SplitPartInput[];
  statementId: string | null;
  cardId: string | null;
  dataPrevista?: string | null;
  alcance: AlcanceDaDivisao;
}): DivisaoMontada {
  let resultado: ResultadoDivisao;
  try {
    resultado = dividirDespesa(args.totalCentavos, toPartesDivisao(args.parts));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  return {
    ok: true,
    minhaParteCentavos: resultado.minhaParteCentavos,
    divisao: {
      alcance: args.alcance,
      pessoas: pessoasDoPayload(args.parts, resultado),
      recebiveis: resultado.partesTerceiros
        .filter((t) => t.valorCentavos > 0)
        .map((t) => ({
          person_id: t.personId,
          parcela_numero: null,
          statement_id: args.statementId,
          card_id: args.cardId,
          valor: centavosParaReais(t.valorCentavos),
          data_prevista: args.dataPrevista ?? null,
        })),
    },
  };
}

/**
 * Divisão de uma compra PARCELADA e compartilhada: a parte TOTAL de cada pessoa é distribuída
 * entre as parcelas com `distribuirTerceirosPorParcela` (resto na última, igual ao valor das
 * parcelas) e cai 1 recebível por (pessoa × parcela) na fatura daquela parcela — nenhum de R$ 0.
 */
export function montarDivisaoParcelada(args: {
  totalCentavos: number;
  parts: SplitPartInput[];
  parcelas: {
    numero: number;
    statementId: string | null;
    cardId: string | null;
    valorCentavos: number;
  }[];
  alcance: AlcanceDaDivisao;
}): DivisaoMontada {
  let resultado: ResultadoDivisao;
  try {
    resultado = dividirDespesa(args.totalCentavos, toPartesDivisao(args.parts));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  // Distribui a parte de cada terceiro entre as parcelas garantindo que a minha parte por
  // parcela (valor da parcela − terceiros) nunca fique negativa, preservando o total de cada
  // pessoa. `m[parcela][terceiro]` em centavos.
  const shares = resultado.partesTerceiros.map((t) => t.valorCentavos);
  const m = distribuirTerceirosPorParcela(
    shares,
    args.parcelas.map((p) => p.valorCentavos),
  );

  const recebiveis: DivisaoPayload["recebiveis"] = [];
  args.parcelas.forEach((parcela, i) => {
    resultado.partesTerceiros.forEach((t, j) => {
      const centavos = m[i][j];
      if (centavos <= 0) return; // não cria recebível de R$0 numa parcela
      recebiveis.push({
        person_id: t.personId,
        parcela_numero: parcela.numero,
        statement_id: parcela.statementId,
        card_id: parcela.cardId,
        valor: centavosParaReais(centavos),
        data_prevista: null,
      });
    });
  });

  return {
    ok: true,
    minhaParteCentavos: resultado.minhaParteCentavos,
    divisao: {
      alcance: args.alcance,
      pessoas: pessoasDoPayload(args.parts, resultado),
      recebiveis,
    },
  };
}

/* ───────────────────────── A gravação (I/O) ───────────────────────── */

/** Insere as `shared_expenses` (1 por pessoa) e devolve person_id → shared_expense_id. */
async function inserirSharedExpenses(
  ctx: AuthContext,
  transactionId: string,
  pessoas: DivisaoPayload["pessoas"],
): Promise<Map<string, string> | null> {
  const rows = pessoas.map((p) => ({
    user_id: ctx.userId,
    transaction_id: transactionId,
    person_id: p.person_id,
    tipo_divisao: p.tipo_divisao,
    percentual: p.percentual,
    valor: p.valor,
  }));
  const { data, error } = await ctx.supabase
    .from("shared_expenses")
    .insert(rows)
    .select("id, person_id");
  if (error || !data) return null;
  return new Map(data.map((s) => [s.person_id, s.id]));
}

/**
 * Divisão de uma despesa À VISTA / cartão simples (não parcelada): grava `shared_expenses`
 * e 1 `receivable` por pessoa (na fatura da compra, quando cartão). Devolve a minha parte.
 */
export async function applySplit(
  ctx: AuthContext,
  args: {
    transactionId: string;
    totalCentavos: number;
    statementId: string | null;
    cardId: string | null;
    parts: SplitPartInput[];
    dataPrevista?: string | null;
  },
): Promise<SplitPersistResult> {
  const montada = montarDivisaoAVista({
    totalCentavos: args.totalCentavos,
    parts: args.parts,
    statementId: args.statementId,
    cardId: args.cardId,
    dataPrevista: args.dataPrevista,
    // O alcance só importa à RPC; neste caminho (gravação direta) não muda o que é gravado.
    alcance: "regra-cheia",
  });
  if (!montada.ok) return { ok: false, error: montada.error };

  const shMap = await inserirSharedExpenses(
    ctx,
    args.transactionId,
    montada.divisao.pessoas,
  );
  if (!shMap) return { ok: false, error: "Não foi possível salvar a divisão." };

  const recRows = montada.divisao.recebiveis.map((r) => ({
    user_id: ctx.userId,
    person_id: r.person_id,
    transaction_id: args.transactionId,
    shared_expense_id: shMap.get(r.person_id) ?? null,
    installment_id: null,
    statement_id: r.statement_id,
    card_id: r.card_id,
    valor: r.valor,
    status: "pendente",
    data_prevista: r.data_prevista,
  }));

  if (recRows.length > 0) {
    const { error } = await ctx.supabase.from("receivables").insert(recRows);
    if (error) {
      return { ok: false, error: "Não foi possível gerar os recebíveis." };
    }
  }

  return { ok: true, minhaParteCentavos: montada.minhaParteCentavos };
}

/**
 * Divisão de uma compra PARCELADA e compartilhada (ver `montarDivisaoParcelada`). Devolve a minha
 * parte total (para o caller gravar `valor_pessoal` na transação pai).
 */
export async function applySplitParcelado(
  ctx: AuthContext,
  args: {
    parentId: string;
    totalCentavos: number;
    parts: SplitPartInput[];
    parcelas: {
      installmentId: string;
      statementId: string | null;
      cardId: string | null;
      valorCentavos: number;
    }[];
  },
): Promise<SplitPersistResult> {
  // A lista recebida é identificada pela POSIÇÃO (1..N): o `parcela_numero` do payload volta para
  // o `installmentId` por aqui. Não é a numeração exibida (que pode começar em k > 1).
  const montada = montarDivisaoParcelada({
    totalCentavos: args.totalCentavos,
    parts: args.parts,
    parcelas: args.parcelas.map((p, i) => ({
      numero: i + 1,
      statementId: p.statementId,
      cardId: p.cardId,
      valorCentavos: p.valorCentavos,
    })),
    alcance: "regra-cheia",
  });
  if (!montada.ok) return { ok: false, error: montada.error };

  const shMap = await inserirSharedExpenses(
    ctx,
    args.parentId,
    montada.divisao.pessoas,
  );
  if (!shMap) return { ok: false, error: "Não foi possível salvar a divisão." };

  const recRows = montada.divisao.recebiveis.map((r) => ({
    user_id: ctx.userId,
    person_id: r.person_id,
    transaction_id: args.parentId,
    shared_expense_id: shMap.get(r.person_id) ?? null,
    installment_id: args.parcelas[(r.parcela_numero ?? 1) - 1].installmentId,
    statement_id: r.statement_id,
    card_id: r.card_id,
    valor: r.valor,
    status: "pendente",
  }));

  if (recRows.length > 0) {
    const { error } = await ctx.supabase.from("receivables").insert(recRows);
    if (error) {
      return { ok: false, error: "Não foi possível gerar os recebíveis." };
    }
  }

  return { ok: true, minhaParteCentavos: montada.minhaParteCentavos };
}
