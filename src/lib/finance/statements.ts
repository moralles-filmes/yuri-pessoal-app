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
 *
 * 03-G (D-G21): erro de LEITURA lança `ErroDeLeitura` ANTES de tentar criar. Antes, um erro na
 * busca levava a criar a fatura, o unique recusava, devolvia `null` e o lançamento era gravado
 * SEM fatura. Quem chama (Server Action ou serviço) captura.
 */
import type { AuthContext } from "@/lib/actions/helpers";
import { exigir } from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
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
  const existente = exigir(
    await ctx.supabase
      .from("card_statements")
      .select("id")
      .eq("card_id", cardId)
      .eq("competencia", alvo.competencia)
      .maybeSingle(),
    ROTULOS_DE_LEITURA.fatura,
  );
  if (existente) return existente.id;

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
  const again = exigir(
    await ctx.supabase
      .from("card_statements")
      .select("id")
      .eq("card_id", cardId)
      .eq("competencia", alvo.competencia)
      .maybeSingle(),
    ROTULOS_DE_LEITURA.fatura,
  );
  return again?.id ?? null;
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
  // 03-G: falha de leitura do cartão lança ErroDeLeitura; "não encontrado" (PGRST116) segue null.
  const card = exigir(
    await ctx.supabase
      .from("credit_cards")
      .select("id, dia_fechamento, dia_vencimento")
      .eq("id", cardId)
      .single(),
    ROTULOS_DE_LEITURA.cartao,
  );
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
  // 03-G: falha de leitura do cartão lança ErroDeLeitura; "não encontrado" (PGRST116) segue null.
  const card = exigir(
    await ctx.supabase
      .from("credit_cards")
      .select("id, dia_fechamento, dia_vencimento")
      .eq("id", cardId)
      .single(),
    ROTULOS_DE_LEITURA.cartao,
  );
  if (!card) return null;

  const alvo = resolverFatura(
    dataCompra,
    card.dia_fechamento,
    card.dia_vencimento,
  );
  return getOrCreateStatementByFatura(ctx, cardId, alvo);
}
