/**
 * Fase 18-B — IA · Estimativa de tokens de entrada. Puro, sem I/O.
 *
 * ═══════════════════════ POR QUE ESTE ARQUIVO EXISTE SEPARADO ═══════════════════════
 *
 * `CARACTERES_POR_TOKEN` e `estimarTokensDeEntrada` nasceram em `reservation.ts` na 18-A.
 * A 18-B precisa que `tools/limits.ts` calcule `TOKENS_POR_RESULTADO_DE_FERRAMENTA` a partir
 * da mesma constante — mas `reservation.ts` também precisa importar `tools/limits.ts` para
 * somar os passos do laço. Duas dependências em sentidos opostos são um CICLO de import.
 *
 * A saída é a mesma de sempre: extrair o que os dois lados precisam para uma terceira folha
 * sem dependência de volta. `reservation.ts` reexporta os dois nomes, então quem já importava
 * daqui (`chat-runner.ts`) continua funcionando sem mudar uma linha.
 */

/**
 * Heurística de tokens de entrada, sobre o PROMPT JÁ MONTADO (system + histórico + a
 * mensagem), nunca sobre o texto cru do usuário.
 *
 * ~3 caracteres por token é deliberadamente pessimista: a média em português fica perto de
 * 4, e os tokenizadores mais novos produzem mais tokens para o mesmo texto. Subestimar aqui
 * fura a reserva; superestimar só a torna um pouco mais folgada.
 */
export const CARACTERES_POR_TOKEN = 3;

export function estimarTokensDeEntrada(promptMontado: string): number {
  return Math.ceil(promptMontado.length / CARACTERES_POR_TOKEN);
}
