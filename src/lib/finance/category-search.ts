/**
 * Pesquisa do seletor de categoria do Financeiro (`CategoryPicker`). Puro, sem imports de
 * runtime — a tela o importa, e um import de `zod`/validators aqui arrastaria o bundle (regra 3
 * do carregamento sob demanda).
 *
 * Uma lista só: cada categoria seguida das suas subcategorias. Escolher a subcategoria escolhe a
 * categoria junto — o seletor nunca produz "Delivery sob Moradia".
 */

export type CategoryPickerCategory = {
  id: string;
  name: string;
  color?: string | null;
};

export type CategoryPickerSubcategory = {
  id: string;
  name: string;
  category_id: string;
};

export type CategoryPickerValue = {
  categoryId: string | null;
  subcategoryId: string | null;
};

export type CategoryPickerOption = {
  /** Chave estável da linha na lista. */
  key: string;
  categoryId: string;
  subcategoryId: string | null;
  /** Texto da própria linha ("Delivery"). */
  label: string;
  /** Categoria da linha — igual a `label` quando a linha é a categoria. */
  categoryName: string;
  color: string | null;
};

/**
 * Categorias que servem a um tipo de lançamento: despesa vê `despesa` + `ambos`, receita vê
 * `receita` + `ambos`; qualquer outro tipo (ajuste) vê todas.
 *
 * `manterId`: a categoria JÁ escolhida continua na lista mesmo sendo do outro tipo — senão um
 * lançamento antigo abriria sem o rótulo da própria categoria. Quem troca o tipo num formulário
 * limpa a escolha incompatível com `categoriaServeAoTipo`.
 */
export function categoriasDoTipo<T extends { id: string; kind?: string | null }>(
  categories: readonly T[],
  tipo: string | null | undefined,
  manterId?: string | null,
): T[] {
  return categories.filter(
    (c) => categoriaServeAoTipo(c.kind, tipo) || (manterId != null && c.id === manterId),
  );
}

export function categoriaServeAoTipo(
  kind: string | null | undefined,
  tipo: string | null | undefined,
): boolean {
  if (tipo === "despesa") return kind !== "receita";
  if (tipo === "receita") return kind !== "despesa";
  return true;
}

/** Minúsculas e sem acento: "alimentação" e "ALIMENTACAO" casam. */
export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Monta a lista filtrada. Regras:
 * - busca vazia ⇒ tudo, na ordem recebida;
 * - categoria cujo nome casa ⇒ entra com TODAS as subcategorias (quem procura "alimen" quer ver
 *   o que tem dentro);
 * - senão, só as subcategorias que casam, sob a categoria delas (o cabeçalho continua clicável:
 *   a busca por "deliv" ainda deixa escolher só "Alimentação");
 * - todos os termos digitados precisam casar ("ali deli" acha "Alimentação › Delivery").
 */
export function filtrarOpcoesDeCategoria(
  categories: readonly CategoryPickerCategory[],
  subcategories: readonly CategoryPickerSubcategory[],
  busca: string,
): CategoryPickerOption[] {
  const termos = normalizarBusca(busca).split(/\s+/).filter(Boolean);
  const casa = (texto: string) => {
    const t = normalizarBusca(texto);
    return termos.every((termo) => t.includes(termo));
  };

  const subsPorCategoria = new Map<string, CategoryPickerSubcategory[]>();
  for (const s of subcategories) {
    const lista = subsPorCategoria.get(s.category_id);
    if (lista) lista.push(s);
    else subsPorCategoria.set(s.category_id, [s]);
  }

  const out: CategoryPickerOption[] = [];
  for (const c of categories) {
    const subs = subsPorCategoria.get(c.id) ?? [];
    const color = c.color ?? null;
    const categoriaCasa = termos.length === 0 || casa(c.name);
    const subsQueCasam = categoriaCasa
      ? subs
      : subs.filter((s) => casa(`${c.name} ${s.name}`));
    if (!categoriaCasa && subsQueCasam.length === 0) continue;

    out.push({
      key: c.id,
      categoryId: c.id,
      subcategoryId: null,
      label: c.name,
      categoryName: c.name,
      color,
    });
    for (const s of subsQueCasam) {
      out.push({
        key: `${c.id}:${s.id}`,
        categoryId: c.id,
        subcategoryId: s.id,
        label: s.name,
        categoryName: c.name,
        color,
      });
    }
  }
  return out;
}

/**
 * Texto do botão para o valor atual: "Alimentação › Delivery", "Alimentação" ou `null` (sem
 * categoria, ou id que não está mais na lista — a tela mostra o texto de vazio).
 */
export function rotuloDaCategoria(
  categories: readonly CategoryPickerCategory[],
  subcategories: readonly CategoryPickerSubcategory[],
  value: CategoryPickerValue,
): string | null {
  if (!value.categoryId) return null;
  const c = categories.find((x) => x.id === value.categoryId);
  if (!c) return null;
  if (!value.subcategoryId) return c.name;
  const s = subcategories.find(
    (x) => x.id === value.subcategoryId && x.category_id === c.id,
  );
  return s ? `${c.name} › ${s.name}` : c.name;
}
