/**
 * REDESIGN-03-C2 · A4 (D8) — a lista de categorias separada por tipo. Puro.
 *
 * A ordem sai de `CATEGORY_KINDS` (fonte única dos enums), não de uma lista à mão. Um `kind`
 * fora dela — inalcançável hoje pelo CHECK do banco — vai para um grupo final em vez de sumir:
 * categoria que some sem ninguém ver é o defeito que este projeto não aceita.
 */
import { CATEGORY_KINDS, type CategoryKind } from "@/lib/finance/constants";

type ChaveDoGrupo = CategoryKind | "desconhecido";

const TITULOS: Record<ChaveDoGrupo, string> = {
  despesa: "Despesas",
  receita: "Receitas",
  ambos: "Receitas e despesas",
  desconhecido: "Tipo não reconhecido",
};

export type GrupoDeCategorias<T> = {
  readonly chave: ChaveDoGrupo;
  readonly titulo: string;
  readonly categorias: T[];
};

export function agruparCategoriasPorTipo<T extends { readonly kind: string }>(
  categorias: readonly T[],
): GrupoDeCategorias<T>[] {
  const conhecidos = new Set<string>(CATEGORY_KINDS);
  const chaves: ChaveDoGrupo[] = [...CATEGORY_KINDS, "desconhecido"];
  return chaves
    .map((chave) => ({
      chave,
      titulo: TITULOS[chave],
      categorias: categorias.filter((c) =>
        chave === "desconhecido" ? !conhecidos.has(c.kind) : c.kind === chave,
      ),
    }))
    .filter((g) => g.categorias.length > 0);
}
