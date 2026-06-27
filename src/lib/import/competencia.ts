/**
 * Detecção da competência da fatura de cartão sendo importada (lógica PURA, testada em
 * competencia.test.ts).
 *
 * PROBLEMA QUE RESOLVE
 * --------------------
 * Numa fatura de cartão, a parcela "k/N" e a última parcela "N/N" trazem na linha a data da
 * COMPRA ORIGINAL (meses atrás), não a data desta fatura. Ancorar a distribuição nessa data
 * antiga joga parcelas para faturas passadas. A regra correta é: TODA linha do arquivo pertence
 * à fatura sendo importada — a parcela `k` cai nessa fatura e `k+1, k+2…` nas seguintes.
 *
 * COMO DETECTA
 * ------------
 * As compras À VISTA (sem parcela) trazem data do ciclo atual, então caem na competência da
 * fatura importada. Tomamos a competência (regra pura de invoice.ts: `resolverFatura`) com MAIS
 * linhas à vista — desempate pela mais recente. Sem linhas à vista válidas → null (o chamador
 * decide o fallback / pede confirmação na revisão).
 */
import { resolverFatura, type FaturaAlvo } from "@/lib/finance/invoice";

/** Mínimo necessário de cada linha para detectar a competência. */
export type LinhaCompetencia = {
  dataNorm: string | null; // 'yyyy-MM-dd'
  parcelasTotal: number | null; // null = compra à vista
};

/**
 * Competência da fatura sendo importada, deduzida das linhas à vista do arquivo. Retorna a
 * `FaturaAlvo` (competência/fechamento/vencimento) mais frequente entre as compras à vista;
 * em empate, a competência mais recente. Sem linha à vista válida, retorna null.
 */
export function detectarCompetenciaFatura(
  linhas: LinhaCompetencia[],
  diaFechamento: number,
  diaVencimento: number,
): FaturaAlvo | null {
  const contagem = new Map<string, { fatura: FaturaAlvo; n: number }>();
  for (const l of linhas) {
    if (l.dataNorm == null) continue;
    if (l.parcelasTotal != null) continue; // linha parcelada traz data antiga — não conta
    const fatura = resolverFatura(l.dataNorm, diaFechamento, diaVencimento);
    const atual = contagem.get(fatura.competencia);
    if (atual) atual.n += 1;
    else contagem.set(fatura.competencia, { fatura, n: 1 });
  }

  let melhor: { fatura: FaturaAlvo; n: number } | null = null;
  for (const v of contagem.values()) {
    if (
      melhor == null ||
      v.n > melhor.n ||
      (v.n === melhor.n && v.fatura.competencia > melhor.fatura.competencia)
    ) {
      melhor = v;
    }
  }
  return melhor?.fatura ?? null;
}
