/**
 * REDESIGN-03-G (L2, K2) — o texto do aviso de lista cortada.
 *
 * Listas que só listam (lançamentos, faturas, histórico de importações) não somam nada: o teto
 * de linhas vira AVISO, não erro (D-G5). Este módulo é puro — o componente `AvisoDeTeto` só o
 * renderiza, e o teste o cobre sem React.
 *
 * Puro: o único import é de tipo, então os testes o importam sem mock.
 */
import type { LeituraComTeto } from "@/lib/supabase/leitura";

/**
 * Monta a frase do aviso. Com `total` → "Mostrando os N mais recentes de M {oQue}".
 * Sem `total` (contagem ausente) → "Mostrando os N mais recentes; pode haver mais."
 */
export function textoDoAvisoDeTeto(lidas: number, total: number | null, oQue: string): string {
  const n = lidas.toLocaleString("pt-BR");
  if (total === null) {
    return `Mostrando os ${n} mais recentes; pode haver mais.`;
  }
  return `Mostrando os ${n} mais recentes de ${total.toLocaleString("pt-BR")} ${oQue}. Use os filtros para ver os demais.`;
}

/**
 * Aviso para uma leitura com teto. `null` quando a lista está completa (nada a avisar).
 * Só a saturação traz `total`; `sem_contagem` cai no texto sem "de M".
 */
export function avisoDeTeto(
  leitura: Pick<LeituraComTeto<unknown>, "linhas" | "situacao" | "total">,
  oQue: string,
): string | null {
  if (leitura.situacao === "completa") return null;
  return textoDoAvisoDeTeto(
    leitura.linhas.length,
    leitura.situacao === "saturou" ? leitura.total : null,
    oQue,
  );
}
