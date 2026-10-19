/**
 * De qual base sai o dado de um gráfico ou de uma exportação (desenho 2026-10-18).
 *
 * ⛔ Caixa com erro de leitura devolve `null` — NUNCA o dado de competência. Cair para
 * competência faria o número errado sair com o rótulo de caixa (num CSV "-caixa", por exemplo):
 * falha de leitura não vira número (P2 da 03-E). Quem recebe `null` diz que não leu.
 *
 * A tela lê este módulo: ZERO imports de runtime.
 */
import type { BaseFinanceira } from "@/lib/finance/base";

export function dadosDaBase<T>(p: {
  base: BaseFinanceira;
  /** O dado da base caixa; `null` quando a leitura do caixa falhou (ou não existe). */
  caixa: T | null;
  competencia: T;
}): T | null {
  return p.base === "caixa" ? p.caixa : p.competencia;
}
