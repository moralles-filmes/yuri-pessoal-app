/**
 * Fase 05 — Divisão de despesa entre o usuário e terceiros (lógica PURA, testada em
 * split.test.ts). Espelha o rigor de installments.ts: toda aritmética em CENTAVOS (inteiros)
 * e a soma SEMPRE fecha — `minhaParte + Σ(terceiros) === total`.
 *
 * REGRA CENTRAL DA FASE
 * ---------------------
 * A "minha parte" NUNCA é informada diretamente: é o RESTO (`total − Σ terceiros`). Assim o
 * resto de centavo cai sempre na minha parte e os recebíveis de terceiros ficam exatos. O
 * servidor grava `transactions.valor_pessoal = minhaParte` — é esse valor (não `amount`) que
 * representa "quanto eu realmente gastei", para que valores de terceiros não distorçam o gasto.
 *
 * PERCENTUAL → CENTAVOS
 * ---------------------
 * Cada `%` é aplicado sobre o TOTAL com `Math.floor` (não `round`): garante que a soma das
 * partes de terceiros nunca ESTOURA o total por arredondamento (ex.: 50% + 50% de 101c daria
 * 51 + 51 = 102 com round). O que sobra de centavo fica comigo — exatamente a regra acima.
 */

import { dividirParcelas } from "@/lib/finance/installments";
import type { SplitType } from "@/lib/finance/constants";

/** Parte de UM terceiro: informada por valor (centavos) ou por percentual (0..100) do total. */
export type ParteDivisao =
  | { personId: string; tipo: "valor"; valorCentavos: number }
  | { personId: string; tipo: "percentual"; percentual: number };

/** Resultado da divisão: minha parte (resto) + a parte resolvida de cada terceiro. */
export type ResultadoDivisao = {
  minhaParteCentavos: number;
  partesTerceiros: { personId: string; valorCentavos: number }[];
};

const PCT_EPSILON = 1e-9;

/** Soma das partes de terceiros (centavos) de um resultado. */
export function somaTerceiros(resultado: ResultadoDivisao): number {
  return resultado.partesTerceiros.reduce((acc, t) => acc + t.valorCentavos, 0);
}

/**
 * Divide `valorTotalCentavos` entre o usuário e os terceiros de `partes`. Determinística.
 * Lança quando a divisão não fecha (Σ% > 100, percentual fora de 0..100, soma de terceiros
 * maior que o total, ou entradas inválidas) — deve ser validada no servidor antes de gravar.
 */
export function dividirDespesa(
  valorTotalCentavos: number,
  partes: ParteDivisao[],
): ResultadoDivisao {
  if (!Number.isInteger(valorTotalCentavos) || valorTotalCentavos < 0) {
    throw new Error("valorTotalCentavos deve ser um inteiro >= 0.");
  }

  let somaPct = 0;
  const partesTerceiros = partes.map((p) => {
    if (p.tipo === "valor") {
      if (!Number.isInteger(p.valorCentavos) || p.valorCentavos < 0) {
        throw new Error("Valor de terceiro inválido (centavos inteiros >= 0).");
      }
      return { personId: p.personId, valorCentavos: p.valorCentavos };
    }
    if (
      !Number.isFinite(p.percentual) ||
      p.percentual < 0 ||
      p.percentual > 100
    ) {
      throw new Error("Percentual deve estar entre 0 e 100.");
    }
    somaPct += p.percentual;
    return {
      personId: p.personId,
      valorCentavos: Math.floor((valorTotalCentavos * p.percentual) / 100),
    };
  });

  if (somaPct - 100 > PCT_EPSILON) {
    throw new Error("A soma dos percentuais não pode passar de 100%.");
  }

  const total = partesTerceiros.reduce((acc, t) => acc + t.valorCentavos, 0);
  if (total > valorTotalCentavos) {
    throw new Error("A soma das partes de terceiros não pode passar do total.");
  }

  return {
    minhaParteCentavos: valorTotalCentavos - total,
    partesTerceiros,
  };
}

/** True se a divisão fecha (sem lançar). Útil para o preview reativo da UI. */
export function validarDivisao(
  valorTotalCentavos: number,
  partes: ParteDivisao[],
): boolean {
  try {
    dividirDespesa(valorTotalCentavos, partes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Distribui a parte total (centavos) de cada terceiro entre as parcelas, alinhado aos valores
 * das parcelas. Retorna a matriz `m[parcela][terceiro]` garantindo DUAS invariantes:
 *   (a) a soma da coluna de cada terceiro == a sua parte total (recebíveis fecham por pessoa);
 *   (b) em CADA parcela, a soma dos terceiros <= o valor da parcela → a MINHA parte por parcela
 *       (valor da parcela − terceiros) nunca fica negativa.
 *
 * Estratégia: distribui cada terceiro igualmente entre as parcelas (`dividirParcelas`, resto na
 * última) e, se em alguma parcela a soma estourar o teto (caso degenerado de centavos
 * sub-parcela), move 1 centavo daquele terceiro para outra parcela do MESMO terceiro com folga —
 * preserva o total da pessoa e respeita o teto. Como Σ(partes terceiros) <= total = Σ(parcelas),
 * sempre há folga para acomodar o excedente.
 */
export function distribuirTerceirosPorParcela(
  sharesCentavos: number[],
  parcelaValoresCentavos: number[],
): number[][] {
  const N = parcelaValoresCentavos.length;
  const m = parcelaValoresCentavos.map(() => sharesCentavos.map(() => 0));
  sharesCentavos.forEach((share, j) => {
    const espalhado = dividirParcelas(share, N);
    for (let i = 0; i < N; i++) m[i][j] = espalhado[i];
  });

  const usado = m.map((linha) => linha.reduce((s, v) => s + v, 0));
  for (let i = 0; i < N; i++) {
    while (usado[i] > parcelaValoresCentavos[i]) {
      const j = m[i].findIndex((v) => v > 0);
      if (j === -1) break;
      const destino = parcelaValoresCentavos.findIndex(
        (valor, k) => k !== i && usado[k] < valor,
      );
      if (destino === -1) break; // sem folga (não ocorre se Σshares <= Σparcelas)
      m[i][j] -= 1;
      usado[i] -= 1;
      m[destino][j] += 1;
      usado[destino] += 1;
    }
  }

  return m;
}

/** Parte da divisão na forma que o formulário consome (strings pt-BR/numérica). */
export type SplitFormPart = {
  person_id: string;
  tipo: SplitType;
  valor: string;
  percentual: string;
};

/** Uma linha de `shared_expenses` (parte já resolvida) para reconstruir o formulário. */
export type SharedExpenseLike = {
  person_id: string;
  tipo_divisao: SplitType;
  percentual: number | null;
  valor: number; // reais (parte resolvida da pessoa)
};

/**
 * Converte `shared_expenses` gravadas → partes do formulário de edição (Fase 05). `valor` (reais)
 * vira string pt-BR ("1.234,56" → "1234,56" com vírgula, igual ao default do form); `percentual`
 * vira string numérica (ponto decimal, como o input `number`). Pura — testada em split.test.ts.
 */
export function sharedExpensesToFormParts(
  rows: SharedExpenseLike[],
): SplitFormPart[] {
  return rows.map((r) =>
    r.tipo_divisao === "percentual"
      ? {
          person_id: r.person_id,
          tipo: "percentual",
          valor: "",
          percentual: r.percentual != null ? String(r.percentual) : "",
        }
      : {
          person_id: r.person_id,
          tipo: "valor",
          valor: String(r.valor).replace(".", ","),
          percentual: "",
        },
  );
}
