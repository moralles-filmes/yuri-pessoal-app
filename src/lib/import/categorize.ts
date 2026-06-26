/**
 * Fase 06 — Sugestão de categoria pela descrição (lógica PURA, testada em categorize.test.ts).
 * Heurística por palavras-chave (CATEGORY_RULES, mais específicas primeiro) que devolve o NOME
 * de uma das categorias do usuário; o nome é então casado (sem acento/caixa) contra as
 * categorias reais para virar um id. NUNCA é aplicada silenciosamente — a UI sempre deixa editar.
 */
import { CATEGORY_RULES } from "@/lib/import/constants";
import { semAcento } from "@/lib/import/normalize";
import type { CategoriaLookup } from "@/lib/import/types";

/**
 * Devolve o NOME da categoria sugerida para uma descrição, ou null se nenhuma regra casar.
 * Puro e independente das categorias do usuário (útil para testar a heurística isoladamente).
 */
export function sugerirCategoriaNome(
  descricao: string | null | undefined,
): string | null {
  if (!descricao) return null;
  const texto = ` ${semAcento(descricao).replace(/\s+/g, " ")} `;
  for (const regra of CATEGORY_RULES) {
    if (regra.keywords.some((k) => texto.includes(k))) {
      return regra.categoria;
    }
  }
  return null;
}

/**
 * Sugere o ID de uma das categorias do usuário a partir da descrição. Casa o nome sugerido
 * pela heurística (sem acento/caixa) com as categorias reais; retorna null se não houver
 * regra ou se a categoria sugerida não existir entre as do usuário.
 */
export function sugerirCategoriaId(
  descricao: string | null | undefined,
  categorias: CategoriaLookup[],
): string | null {
  const nome = sugerirCategoriaNome(descricao);
  if (!nome) return null;
  const alvo = semAcento(nome).trim();
  const match = categorias.find((c) => semAcento(c.name).trim() === alvo);
  return match?.id ?? null;
}
