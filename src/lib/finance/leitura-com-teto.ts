/**
 * Leitura com teto visível (03-B2, A5): o `count: "exact"` comparado com o que chegou. Saiu de
 * `queries.ts` na 03-D para a leitura de recebimentos usar a MESMA regra sem import circular.
 */
export type LeituraComTeto<T> = {
  linhas: T[];
  situacao: "completa" | "saturou" | "sem_contagem";
};

/** Compara com o recebido: o max_rows do PostgREST pode cortar antes do nosso limit. */
export function leituraComTeto<T>(linhas: T[], count: number | null): LeituraComTeto<T> {
  return {
    linhas,
    situacao: count === null ? "sem_contagem" : count > linhas.length ? "saturou" : "completa",
  };
}
