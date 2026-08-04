/**
 * Fase 16-C — Dieta e Alimentação · Substituições (PURO, sem I/O).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ REGRA 4: NADA TROCA SOZINHO. REGRA 5: NENHUMA EQUIVALÊNCIA CLÍNICA É AFIRMADA.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Este arquivo faz UMA coisa: subtrair números e dizer se a diferença cabe na tolerância que
 * o próprio usuário configurou. Ele não sugere, não classifica, não pontua alternativa e não
 * decide nada. A lista de alternativas vem do que a pessoa cadastrou (`nutrition_substitution_
 * options`), ordenada pela prioridade que ela mesma deu — não existe heurística nova nem
 * ranking calculado (fora do escopo, e para sempre).
 *
 * ══ O QUE NÃO SE SABE NÃO VIRA ZERO ══
 * Se um dos lados não tem o nutriente medido, a diferença é `null` — "não dá para comparar" —
 * e o impacto no dia fica marcado como PARCIAL. Um `0` ali significaria "trocar não muda
 * nada", que é uma afirmação, não uma ausência.
 *
 * ══ O IMPACTO É MOSTRADO ANTES ══
 * `totalsAfterSubstitution` e `remainingAfterSubstitution` existem para a tela responder,
 * antes de qualquer gravação: "como fica o total do dia" e "o que sobra da meta". A troca só
 * acontece depois que o usuário vê isso e confirma.
 *
 * Nada aqui chama `Date.now()` nem toca no banco.
 */
import type { NutrientTotal, NutrientTotalQuality } from "./calc";
import { goalProgress, type GoalProgress } from "./goals";
import type { GoalTarget, SubstitutionOption, SubstitutionTolerances } from "./types";

/* ───────────────────────────── Comparação ───────────────────────────── */

export type NutrientComparison = {
  code: string;
  /** Valor do item original. `null` = não medido (≠ zero). */
  original: number | null;
  /** Valor da alternativa. `null` = não medido. */
  replacement: number | null;
  /** alternativa − original. `null` quando falta um dos lados. */
  diff: number | null;
  /** Variação relativa ao original, em %. `null` quando o original é zero ou falta um lado. */
  percent: number | null;
  /** Pior qualidade entre os dois lados: comparar totais parciais não produz certeza. */
  quality: NutrientTotalQuality;
};

const worst = (a: NutrientTotalQuality, b: NutrientTotalQuality): NutrientTotalQuality => {
  if (a === "parcial" || b === "parcial") return "parcial";
  if (a === "aproximado" || b === "aproximado") return "aproximado";
  return "exato";
};

/**
 * Valor comparável de um total.
 *
 * `contributing === 0` significa que NENHUM item trouxe o nutriente: o total é 0 por falta de
 * dado, não por medição. Tratar isso como zero faria a comparação afirmar que a troca zera um
 * nutriente que ninguém mediu.
 */
const comparableAmount = (total: NutrientTotal | undefined): number | null => {
  if (!total) return null;
  if (total.contributing === 0) return null;
  return total.amount;
};

/** Compara original × alternativa nutriente a nutriente. */
export function compareNutrients(
  original: Record<string, NutrientTotal>,
  replacement: Record<string, NutrientTotal>,
  codes: readonly string[],
): Record<string, NutrientComparison> {
  const result: Record<string, NutrientComparison> = {};

  for (const code of codes) {
    const a = comparableAmount(original[code]);
    const b = comparableAmount(replacement[code]);
    const diff = a !== null && b !== null ? b - a : null;

    result[code] = {
      code,
      original: a,
      replacement: b,
      diff,
      // Percentual precisa de uma base maior que zero. Sem ela, o número seria infinito — e
      // "aumentou infinito por cento" não informa nada a ninguém.
      percent: diff !== null && a !== null && a !== 0 ? (diff / a) * 100 : null,
      quality: worst(
        original[code]?.quality ?? "parcial",
        replacement[code]?.quality ?? "parcial",
      ),
    };
  }

  return result;
}

/* ───────────────────────────── Tolerância ───────────────────────────── */

export type ToleranceStatus = "dentro" | "fora" | "sem_tolerancia" | "incomparavel";

export const TOLERANCE_STATUS_LABELS: Record<ToleranceStatus, string> = {
  dentro: "Dentro da sua tolerância",
  fora: "Fora da sua tolerância",
  sem_tolerancia: "Sem tolerância definida",
  incomparavel: "Não dá para comparar",
};

export const TOLERANCE_STATUS_HINTS: Record<ToleranceStatus, string> = {
  dentro: "A variação cabe no limite que você configurou para este macro.",
  fora: "A variação passa do limite que você configurou. Isso não impede a troca — só avisa.",
  sem_tolerancia:
    "Você não definiu um limite para este macro, então a diferença é apenas informada.",
  incomparavel:
    "Um dos lados não tem este nutriente medido. A diferença é desconhecida — e desconhecido não é zero.",
};

/**
 * A diferença cabe na tolerância?
 *
 * A tolerância é uma PREFERÊNCIA do usuário, e o resultado é informativo: nada aqui bloqueia
 * a troca. "Fora da tolerância" é um aviso, não uma proibição — quem decide o que comer é a
 * pessoa.
 */
export function toleranceStatus(
  comparison: NutrientComparison,
  tolerancePercent: number | null,
): ToleranceStatus {
  if (comparison.diff === null) return "incomparavel";
  if (tolerancePercent === null || !Number.isFinite(tolerancePercent)) return "sem_tolerancia";
  // Diferença nenhuma cabe em qualquer limite, inclusive quando o original é zero.
  if (comparison.diff === 0) return "dentro";
  // Saiu de zero para algum valor: não existe percentual que descreva isso.
  if (comparison.percent === null) return "fora";
  return Math.abs(comparison.percent) <= tolerancePercent ? "dentro" : "fora";
}

/** Mapa código → tolerância configurada, para os cinco macros comparados. */
export function toleranceFor(
  tolerances: SubstitutionTolerances,
  codes: { energia: string; proteina: string; carboidrato: string; lipidios: string; fibra: string },
): Record<string, number | null> {
  return {
    [codes.energia]: tolerances.energy,
    [codes.proteina]: tolerances.protein,
    [codes.carboidrato]: tolerances.carb,
    [codes.lipidios]: tolerances.fat,
    [codes.fibra]: tolerances.fiber,
  };
}

export type SubstitutionAssessment = {
  statuses: Record<string, ToleranceStatus>;
  /** Quantos macros ficaram fora da tolerância configurada. */
  outside: number;
  /** Quantos não puderam ser comparados por falta de dado. */
  incomparable: number;
  /** Pior qualidade entre os nutrientes comparados. */
  quality: NutrientTotalQuality;
};

/** Resumo da comparação para o cabeçalho da tela de confirmação. */
export function assessSubstitution(
  comparisons: Record<string, NutrientComparison>,
  tolerances: Record<string, number | null>,
): SubstitutionAssessment {
  const statuses: Record<string, ToleranceStatus> = {};
  let outside = 0;
  let incomparable = 0;
  let quality: NutrientTotalQuality = "exato";

  for (const comparison of Object.values(comparisons)) {
    const status = toleranceStatus(comparison, tolerances[comparison.code] ?? null);
    statuses[comparison.code] = status;
    if (status === "fora") outside += 1;
    if (status === "incomparavel") incomparable += 1;
    quality = worst(quality, comparison.quality);
  }

  return { statuses, outside, incomparable, quality };
}

/* ───────────────────────────── Impacto no dia ───────────────────────────── */

/**
 * Como fica o total (do dia ou da refeição) DEPOIS da troca.
 *
 * Nada é gravado: é a prévia que a tela mostra antes de o usuário confirmar.
 *
 * Quando a diferença é desconhecida, o total resultante é marcado como PARCIAL em vez de
 * ficar igual. "Não sei o efeito" e "não muda nada" são respostas diferentes, e só a segunda
 * autoriza alguém a confiar no número.
 */
export function totalsAfterSubstitution(
  totals: Record<string, NutrientTotal>,
  comparisons: Record<string, NutrientComparison>,
): Record<string, NutrientTotal> {
  const result: Record<string, NutrientTotal> = {};
  const codes = new Set([...Object.keys(totals), ...Object.keys(comparisons)]);

  for (const code of codes) {
    const base = totals[code];
    const comparison = comparisons[code];

    if (!comparison) {
      if (base) result[code] = { ...base };
      continue;
    }

    if (comparison.diff === null) {
      // Efeito desconhecido: o valor não muda, mas o total deixa de ser confiável.
      result[code] = base
        ? { ...base, quality: "parcial", missing: base.missing + 1 }
        : {
            code,
            amount: 0,
            quality: "parcial",
            contributing: 0,
            trace: 0,
            missing: 1,
          };
      continue;
    }

    if (!base) {
      // O dia não tinha este nutriente registrado; a troca introduz uma diferença sobre uma
      // base desconhecida, então o resultado nasce parcial.
      result[code] = {
        code,
        amount: comparison.diff,
        quality: "parcial",
        contributing: 1,
        trace: 0,
        missing: 1,
      };
      continue;
    }

    result[code] = {
      ...base,
      amount: base.amount + comparison.diff,
      quality: worst(base.quality, comparison.quality),
    };
  }

  return result;
}

export type RemainingAfterSubstitution = {
  code: string;
  before: GoalProgress;
  after: GoalProgress;
  /** Quanto sobra da meta depois da troca. `null` quando não há meta. */
  remainingAfter: number | null;
  /** Variação do que sobra (depois − antes). `null` quando não há meta nos dois lados. */
  remainingDelta: number | null;
};

/**
 * O que resta da meta ANTES e DEPOIS da troca — a última coluna da tela de confirmação.
 *
 * Reusa `goalProgress` (goals.ts) para o cálculo do que sobra ser exatamente o mesmo do resto
 * do módulo. A meta considerada é a do DIA em questão, resolvida por quem chama.
 */
export function remainingAfterSubstitution(
  before: Record<string, NutrientTotal>,
  after: Record<string, NutrientTotal>,
  targets: Record<string, GoalTarget>,
  codes: readonly string[],
): Record<string, RemainingAfterSubstitution> {
  const result: Record<string, RemainingAfterSubstitution> = {};

  for (const code of codes) {
    const target = targets[code] ?? null;
    const progressBefore = goalProgress(code, before[code], target);
    const progressAfter = goalProgress(code, after[code], target);

    result[code] = {
      code,
      before: progressBefore,
      after: progressAfter,
      remainingAfter: progressAfter.remaining,
      remainingDelta:
        progressBefore.remaining !== null && progressAfter.remaining !== null
          ? progressAfter.remaining - progressBefore.remaining
          : null,
    };
  }

  return result;
}

/* ───────────────────────────── Alternativas ───────────────────────────── */

/**
 * Ordena as alternativas do jeito que o USUÁRIO pediu: prioridade, depois a ordem manual,
 * depois o nome. Nenhum critério nutricional entra aqui — ordenar por "melhor macro" seria
 * o sistema recomendando, que é justamente o que a regra 5 proíbe.
 */
export function sortedOptions(options: SubstitutionOption[]): SubstitutionOption[] {
  return [...options].sort(
    (a, b) =>
      a.priority - b.priority ||
      a.position - b.position ||
      a.label.localeCompare(b.label, "pt-BR"),
  );
}

/** Só as alternativas ativas, já ordenadas. */
export function availableOptions(options: SubstitutionOption[]): SubstitutionOption[] {
  return sortedOptions(options.filter((option) => option.isActive));
}

/* ───────────────────────────── Diferença → colunas quentes ───────────────────────────── */

/**
 * Extrai a diferença de um macro para gravar na coluna quente do histórico.
 * `null` quando a comparação não foi possível — jamais 0, que significaria "não mudou".
 */
export function deltaOf(
  comparisons: Record<string, NutrientComparison>,
  code: string,
): number | null {
  return comparisons[code]?.diff ?? null;
}

/** Serializa a comparação para o `diff_snapshot` (jsonb) do histórico. */
export function comparisonsToSnapshot(
  comparisons: Record<string, NutrientComparison>,
): Record<string, { original: number | null; replacement: number | null; diff: number | null; quality: NutrientTotalQuality }> {
  const snapshot: Record<
    string,
    { original: number | null; replacement: number | null; diff: number | null; quality: NutrientTotalQuality }
  > = {};
  for (const [code, comparison] of Object.entries(comparisons)) {
    snapshot[code] = {
      original: comparison.original,
      replacement: comparison.replacement,
      diff: comparison.diff,
      quality: comparison.quality,
    };
  }
  return snapshot;
}
