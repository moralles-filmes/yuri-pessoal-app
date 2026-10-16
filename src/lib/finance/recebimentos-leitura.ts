import "server-only";
/**
 * REDESIGN-03-D · P3 — A ÚNICA LEITURA de `receivable_receipts`.
 *
 * Consulta própria, nunca embed (a invariante 21 da 16-E registra FK composta impedindo o embed
 * do PostgREST). A junção com os recebíveis é pura (`anexarRecebimentos`). Teto visível:
 * saturado vira motivo de `completude`, nunca um saldo afirmado como exato.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { LeituraDoDono } from "@/lib/supabase/owner";
import { createClient } from "@/lib/supabase/server";
import { dividirEmBlocos, TAMANHO_DO_BLOCO } from "@/lib/finance/receivables-bulk";
import { leituraComTeto, type LeituraComTeto } from "@/lib/finance/leitura-com-teto";
import type { RecebimentoDoBanco } from "@/types/database";
import type { RecebivelParaProteger } from "@/lib/finance/protecao-do-recebivel";

export type ClienteSupabase = SupabaseClient<Database>;

export const TETO_DE_RECEBIMENTOS = 5000;
const COLUNAS = "id, receivable_id, valor, recebido_em, observacoes, created_at";

/** Todos os recebimentos do dono (sessão, ou `owner` no Cron com service role). */
export async function lerRecebimentos(
  owner?: LeituraDoDono,
): Promise<LeituraComTeto<RecebimentoDoBanco>> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase.from("receivable_receipts").select(COLUNAS, { count: "exact" });
  const { data, count } = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("recebido_em", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(TETO_DE_RECEBIMENTOS);
  return leituraComTeto((data ?? []) as RecebimentoDoBanco[], count);
}

/** Os recebimentos de recebíveis específicos, por blocos (a query string do `in` cresce linear). */
export async function recebimentosDe(
  client: ClienteSupabase,
  receivableIds: readonly string[],
): Promise<{ erro: boolean; linhas: RecebimentoDoBanco[] }> {
  const linhas: RecebimentoDoBanco[] = [];
  for (const bloco of dividirEmBlocos([...new Set(receivableIds)], TAMANHO_DO_BLOCO)) {
    if (bloco.length === 0) continue;
    const { data, error } = await client
      .from("receivable_receipts")
      .select(COLUNAS)
      .in("receivable_id", bloco);
    if (error) return { erro: true, linhas: [] };
    linhas.push(...((data ?? []) as RecebimentoDoBanco[]));
  }
  return { erro: false, linhas };
}

/** O que a A4 precisa saber: status de cada recebível do alvo e se ele já recebeu algo. */
export async function protecaoDosRecebiveis(
  client: ClienteSupabase,
  filtro: { readonly transactionIds: readonly string[] } | { readonly installmentIds: readonly string[] },
): Promise<{ erro: true } | { erro: false; recebiveis: RecebivelParaProteger[] }> {
  const coluna = "transactionIds" in filtro ? "transaction_id" : "installment_id";
  const alvo = "transactionIds" in filtro ? filtro.transactionIds : filtro.installmentIds;
  const linhas: { id: string; status: string }[] = [];
  for (const bloco of dividirEmBlocos([...new Set(alvo)], TAMANHO_DO_BLOCO)) {
    if (bloco.length === 0) continue;
    const { data, error } = await client.from("receivables").select("id, status").in(coluna, bloco);
    if (error) return { erro: true };
    linhas.push(...((data ?? []) as { id: string; status: string }[]));
  }
  const recs = await recebimentosDe(client, linhas.map((l) => l.id));
  if (recs.erro) return { erro: true };
  const comRecebimento = new Set(recs.linhas.map((x) => x.receivable_id));
  return {
    erro: false,
    recebiveis: linhas.map((l) => ({ status: l.status, temRecebimento: comRecebimento.has(l.id) })),
  };
}
