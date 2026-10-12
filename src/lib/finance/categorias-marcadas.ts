/**
 * REDESIGN-03-C2 · A6 (K1) — o ÚNICO ponto do servidor que FILTRA pela marcação da categoria.
 *
 * ⛔ Peneira, não decide: ele devolve ids para a lista de lançamentos mostrar só as linhas
 * dessas categorias. Não afirma nada sobre de quem é o dinheiro — essa verdade é
 * `transactions.classificacao` (03-C). Fica fora de `finance/queries.ts` de propósito, para a
 * allowlist de `quem-le-a-marcacao.test.ts` continuar estreita.
 *
 * Erro de leitura devolve `[]`, como o resto de `getTransactions` (RR-C2-3, destino 03-G).
 */
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { MARCACAO_DE_TERCEIROS } from "@/lib/finance/marcacao-da-categoria";

type ClienteDoServidor = Awaited<ReturnType<typeof createClient>>;

export async function idsDasCategoriasMarcadas(supabase: ClienteDoServidor): Promise<string[]> {
  const { data } = await supabase
    .from("categories")
    .select("id")
    .eq("classificacao_padrao", MARCACAO_DE_TERCEIROS);
  return (data ?? []).map((c) => c.id);
}
