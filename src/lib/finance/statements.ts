/**
 * Resolução de fatura no servidor (Fase 03). Server-only (recebe o AuthContext),
 * mas NÃO é "use server": é uma função utilitária usada pelas Server Actions.
 *
 * Calcula a fatura-alvo (regra pura de invoice.ts) e faz get-or-create da linha em
 * `card_statements`. O `user_id` vem sempre de `auth.uid()` (via ctx). A unique
 * (user_id, card_id, competencia) protege contra duplicatas em corrida.
 *
 * Fase 04: `getOrCreateStatementByFatura` é exposto para os parcelamentos resolverem a
 * fatura de CADA parcela (já com a FaturaAlvo calculada por `distribuirFaturas`), sem
 * reconsultar o cartão a cada parcela.
 */
import type { AuthContext } from "@/lib/actions/helpers";
import {
  montarFatura,
  resolverFatura,
  type FaturaAlvo,
} from "@/lib/finance/invoice";

/** Get-or-create da `card_statements` para uma fatura-alvo já calculada. */
export async function getOrCreateStatementByFatura(
  ctx: AuthContext,
  cardId: string,
  alvo: FaturaAlvo,
): Promise<string | null> {
  // Get-or-create por (user_id implícito na RLS, card_id, competencia).
  const existing = await ctx.supabase
    .from("card_statements")
    .select("id")
    .eq("card_id", cardId)
    .eq("competencia", alvo.competencia)
    .maybeSingle();
  if (existing.data) return existing.data.id;

  const created = await ctx.supabase
    .from("card_statements")
    .insert({
      user_id: ctx.userId,
      card_id: cardId,
      competencia: alvo.competencia,
      data_fechamento: alvo.dataFechamento,
      data_vencimento: alvo.dataVencimento,
    })
    .select("id")
    .single();
  if (created.data) return created.data.id;

  // Corrida de unique (inserção concorrente criou a mesma fatura): re-seleciona.
  const again = await ctx.supabase
    .from("card_statements")
    .select("id")
    .eq("card_id", cardId)
    .eq("competencia", alvo.competencia)
    .maybeSingle();
  return again.data?.id ?? null;
}

/**
 * Get-or-create da fatura para uma COMPETÊNCIA explícita ('yyyy-MM-01' — ou qualquer dia do mês
 * de fechamento). Diferente de `resolveOrCreateStatement`, não deriva a fatura da data da compra:
 * monta a fatura direto do mês informado (regra de `montarFatura`). Usado na importação, onde a
 * fatura-alvo é a que está sendo importada — não a da data da compra original (que pode ser antiga).
 */
export async function getOrCreateStatementForCompetencia(
  ctx: AuthContext,
  cardId: string,
  competencia: string,
): Promise<string | null> {
  const { data: card } = await ctx.supabase
    .from("credit_cards")
    .select("id, dia_fechamento, dia_vencimento")
    .eq("id", cardId)
    .single();
  if (!card) return null;

  const [year, month] = competencia.split("-").map(Number); // 'yyyy-MM-01'
  if (!year || !month) return null;
  const alvo = montarFatura(
    year,
    month - 1, // montarFatura usa mês 0..11
    card.dia_fechamento,
    card.dia_vencimento,
  );
  return getOrCreateStatementByFatura(ctx, cardId, alvo);
}

export async function resolveOrCreateStatement(
  ctx: AuthContext,
  cardId: string,
  dataCompra: string,
): Promise<string | null> {
  // Dias de fechamento/vencimento do cartão (RLS garante que é do usuário).
  const { data: card } = await ctx.supabase
    .from("credit_cards")
    .select("id, dia_fechamento, dia_vencimento")
    .eq("id", cardId)
    .single();
  if (!card) return null;

  const alvo = resolverFatura(
    dataCompra,
    card.dia_fechamento,
    card.dia_vencimento,
  );
  return getOrCreateStatementByFatura(ctx, cardId, alvo);
}
