/**
 * REDESIGN-03-C2 · A6 (K1) — o ÚNICO ponto do servidor que FILTRA pela marcação da categoria.
 *
 * ⛔ Peneira, não decide: ele devolve ids para a lista de lançamentos mostrar só as linhas
 * dessas categorias. Não afirma nada sobre de quem é o dinheiro — essa verdade é
 * `transactions.classificacao` (03-C). Fica fora de `finance/queries.ts` de propósito, para a
 * allowlist de `quem-le-a-marcacao.test.ts` continuar estreita.
 *
 * Erro de leitura LANÇA ErroDeLeitura (RR-C2-3, 03-G): `[]` diria "nenhum lançamento nas
 * categorias marcadas", e isso seria um fato que não aconteceu.
 */
import "server-only";
import type { createClient } from "@/lib/supabase/server";
import { listaCompleta, type RespostaDoBanco } from "@/lib/supabase/leitura";
import { MARCACAO_DE_TERCEIROS } from "@/lib/finance/marcacao-da-categoria";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";

type ClienteDoServidor = Awaited<ReturnType<typeof createClient>>;

export async function idsDasCategoriasMarcadas(supabase: ClienteDoServidor): Promise<string[]> {
  // Lista sem `count` não prova que veio inteira: `listaCompleta` exige a contagem e lança na
  // saturação (acceptance da 03-G — nenhuma lista do escopo sem `count: "exact"`).
  const res = await supabase
    .from("categories")
    .select("id", { count: "exact" })
    .eq("classificacao_padrao", MARCACAO_DE_TERCEIROS);
  const categorias = listaCompleta(
    res as RespostaDoBanco<{ id: string }[] | null>,
    ROTULOS_DE_LEITURA.categoriasMarcadas,
  );
  return categorias.map((c) => c.id);
}
