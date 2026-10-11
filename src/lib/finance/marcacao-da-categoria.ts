/**
 * REDESIGN-03-C2 · A2 — o vocabulário da marcação de categoria (E7/D8) e a regra do atalho.
 *
 * ⛔ A categoria PROPÕE, o lançamento REGISTRA (METRICAS-FINANCEIRAS.md §11). Quem guarda a
 * verdade de quem é o dinheiro é `transactions.classificacao` + `valor_pessoal`, gravados no
 * ato (03-C). Esta regra só decide o que o formulário MOSTRA num lançamento NOVO.
 *
 * Puro — sem zod, sem server-only, sem I/O — porque a tela de categorias, o formulário de
 * lançamento, o schema e o filtro do servidor usam o MESMO vocabulário. Ele recebe o VALOR da
 * marcação, nunca a linha da categoria: por isso não nomeia a coluna, e a varredura da A1 não
 * o lista.
 */
import type { CategoryKind, Classificacao, TransactionType } from "@/lib/finance/constants";

/** Espelha o CHECK da M3. `null` = sem sugestão. */
export type MarcacaoDaCategoria = "pessoal" | "terceiro" | null;

/** K0: o único estado que a tela oferece além de "sem sugestão". */
export const MARCACAO_DE_TERCEIROS = "terceiro" as const;

/** K0: só estes tipos de categoria têm o campo. Despesa de terceiro exige pessoa. */
export const TIPOS_DE_CATEGORIA_QUE_SUGEREM: readonly CategoryKind[] = ["receita", "ambos"];

export function sugereTerceiros(marcacao: string | null | undefined): boolean {
  return marcacao === MARCACAO_DE_TERCEIROS;
}

export function tipoDeCategoriaSugere(kind: string): boolean {
  return (TIPOS_DE_CATEGORIA_QUE_SUGEREM as readonly string[]).includes(kind);
}

/** De onde veio a classificação que está na tela. Não vai ao servidor. */
export type OrigemDaClassificacao = "padrao" | "atalho" | "usuario";

export type ClassificacaoNaTela = {
  readonly classificacao: Classificacao;
  readonly origem: OrigemDaClassificacao;
};

export type ContextoDoAtalho = {
  /** Da categoria escolhida; "sem categoria" = null. */
  readonly marcacao: MarcacaoDaCategoria;
  readonly tipo: TransactionType;
  readonly modo: "criar" | "editar";
};

export const DICA_DO_ATALHO = "Sugerido pela categoria. Você pode trocar antes de salvar.";

/**
 * Avaliada em ordem; a primeira regra que casa decide. Sem mudança, devolve o MESMO objeto.
 *
 *  1. edição → intacto (D10: trocar a categoria de um lançamento existente não reclassifica);
 *  2. escolha do usuário → intacta (nunca sobrescreve);
 *  3. receita + categoria marcada → `terceiro`, origem `atalho`;
 *  4. sem sugestão e a classificação na tela era do atalho → volta a `pessoal` (P1);
 *  5. senão → intacto.
 */
export function aplicarAtalhoDaCategoria(
  atual: ClassificacaoNaTela,
  contexto: ContextoDoAtalho,
): ClassificacaoNaTela {
  if (contexto.modo === "editar") return atual;
  if (atual.origem === "usuario") return atual;
  if (contexto.tipo === "receita" && sugereTerceiros(contexto.marcacao)) {
    return atual.classificacao === MARCACAO_DE_TERCEIROS && atual.origem === "atalho"
      ? atual
      : { classificacao: MARCACAO_DE_TERCEIROS, origem: "atalho" };
  }
  if (atual.origem === "atalho") return { classificacao: "pessoal", origem: "padrao" };
  return atual;
}

/** P2: o que o formulário de categoria manda. Categoria de despesa nunca leva marcação. */
export function marcacaoParaGravar(
  kind: string,
  escolha: string | null,
): typeof MARCACAO_DE_TERCEIROS | null {
  return tipoDeCategoriaSugere(kind) && sugereTerceiros(escolha) ? MARCACAO_DE_TERCEIROS : null;
}

/** A6 (K1): a lista vazia com o filtro ligado diz por quê. */
export function motivoDaListaVazia(categoriasMarcadas: number): string {
  return categoriasMarcadas === 0
    ? "Nenhuma categoria está marcada como de terceiros. Marque uma em Categorias."
    : "Nenhum lançamento nas categorias marcadas como de terceiros, com os filtros atuais.";
}

/** P5: sem categoria marcada o botão não ligaria nada; ligado pela URL, aparece para desligar. */
export function mostrarFiltroDeTerceiros(args: {
  ligado: boolean;
  categoriasMarcadas: number;
}): boolean {
  return args.ligado || args.categoriasMarcadas > 0;
}
