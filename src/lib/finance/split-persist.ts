/**
 * Fase 05 — Persistência da divisão no servidor. Server-only (recebe o AuthContext),
 * mas NÃO é "use server": é utilitário das Server Actions, no espírito de statements.ts.
 *
 * Centraliza a gravação de `shared_expenses` + `receivables` e devolve a MINHA PARTE (centavos)
 * para o caller atualizar `transactions.valor_pessoal`. Tudo derivado no servidor a partir de
 * `dividirDespesa` (split.ts) — nunca confiando nos valores de divisão do client sem revalidar.
 * O `user_id` vem sempre de `auth.uid()` (via ctx).
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

/** Insere as `shared_expenses` (1 por pessoa) e devolve person_id → shared_expense_id. */
async function inserirSharedExpenses(
  ctx: AuthContext,
  transactionId: string,
  parts: SplitPartInput[],
  resultado: ResultadoDivisao,
): Promise<Map<string, string> | null> {
  const rows = parts.map((p, i) => ({
    user_id: ctx.userId,
    transaction_id: transactionId,
    person_id: p.person_id,
    tipo_divisao: p.tipo,
    percentual: p.tipo === "percentual" ? (p.percentual ?? null) : null,
    valor: centavosParaReais(resultado.partesTerceiros[i].valorCentavos),
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
  let resultado: ResultadoDivisao;
  try {
    resultado = dividirDespesa(args.totalCentavos, toPartesDivisao(args.parts));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const shMap = await inserirSharedExpenses(
    ctx,
    args.transactionId,
    args.parts,
    resultado,
  );
  if (!shMap) return { ok: false, error: "Não foi possível salvar a divisão." };

  const recRows = resultado.partesTerceiros
    .filter((t) => t.valorCentavos > 0)
    .map((t) => ({
      user_id: ctx.userId,
      person_id: t.personId,
      transaction_id: args.transactionId,
      shared_expense_id: shMap.get(t.personId) ?? null,
      installment_id: null,
      statement_id: args.statementId,
      card_id: args.cardId,
      valor: centavosParaReais(t.valorCentavos),
      status: "pendente",
      data_prevista: args.dataPrevista ?? null,
    }));

  if (recRows.length > 0) {
    const { error } = await ctx.supabase.from("receivables").insert(recRows);
    if (error) {
      return { ok: false, error: "Não foi possível gerar os recebíveis." };
    }
  }

  return { ok: true, minhaParteCentavos: resultado.minhaParteCentavos };
}

/**
 * Divisão de uma compra PARCELADA e compartilhada: a parte TOTAL de cada pessoa é distribuída
 * entre as parcelas com `dividirParcelas` (resto na última, igual ao valor das parcelas) e cai
 * 1 `receivable` por (pessoa × parcela) na `statement_id` daquela parcela. Devolve a minha parte
 * total (para o caller gravar `valor_pessoal` na transação pai).
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
  let resultado: ResultadoDivisao;
  try {
    resultado = dividirDespesa(args.totalCentavos, toPartesDivisao(args.parts));
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const shMap = await inserirSharedExpenses(
    ctx,
    args.parentId,
    args.parts,
    resultado,
  );
  if (!shMap) return { ok: false, error: "Não foi possível salvar a divisão." };

  // Distribui a parte de cada terceiro entre as parcelas garantindo que a minha parte por
  // parcela (valor da parcela − terceiros) nunca fique negativa, preservando o total de cada
  // pessoa. `m[parcela][terceiro]` em centavos.
  const shares = resultado.partesTerceiros.map((t) => t.valorCentavos);
  const m = distribuirTerceirosPorParcela(
    shares,
    args.parcelas.map((p) => p.valorCentavos),
  );

  const recRows: {
    user_id: string;
    person_id: string;
    transaction_id: string;
    shared_expense_id: string | null;
    installment_id: string;
    statement_id: string | null;
    card_id: string | null;
    valor: number;
    status: string;
  }[] = [];

  args.parcelas.forEach((parcela, i) => {
    resultado.partesTerceiros.forEach((t, j) => {
      const centavos = m[i][j];
      if (centavos <= 0) return; // não cria recebível de R$0 numa parcela
      recRows.push({
        user_id: ctx.userId,
        person_id: t.personId,
        transaction_id: args.parentId,
        shared_expense_id: shMap.get(t.personId) ?? null,
        installment_id: parcela.installmentId,
        statement_id: parcela.statementId,
        card_id: parcela.cardId,
        valor: centavosParaReais(centavos),
        status: "pendente",
      });
    });
  });

  if (recRows.length > 0) {
    const { error } = await ctx.supabase.from("receivables").insert(recRows);
    if (error) {
      return { ok: false, error: "Não foi possível gerar os recebíveis." };
    }
  }

  return { ok: true, minhaParteCentavos: resultado.minhaParteCentavos };
}
