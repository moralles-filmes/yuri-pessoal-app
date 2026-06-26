/**
 * Tipos auxiliares de UI/ações do módulo financeiro (Fase 02).
 */

/** Retorno padronizado de toda Server Action. */
export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/** Resultado de uma geração de recorrências. */
export type GenerationResult = { generated: number; recurrences: number };
