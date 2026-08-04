/**
 * Fase 17-C — Treinos · Calculadora de anilhas (PURO, sem I/O, sem `Date.now()`).
 *
 * "Quais anilhas eu ponho de cada lado para chegar em 82,5 kg?" — com as anilhas que existem
 * NAQUELE lugar (`training_location_plates`), e não com um conjunto ideal que a academia não
 * tem. Sugerir 1,25 kg onde só há anilhas de 5 em 5 é sugerir o impossível.
 *
 * ═══════════════════ O QUE ESTE ARQUIVO NÃO FAZ ═══════════════════
 *
 * Não sugere carga, não recomenda progressão e não estima carga máxima. Ele responde a uma
 * pergunta aritmética sobre um alvo que o USUÁRIO digitou.
 *
 * ═══════════════════ DUAS DECISÕES QUE PARECEM DETALHE ═══════════════════
 *
 * 1. **A barra é simétrica.** O que se calcula é o peso POR LADO: `(alvo − barra) / 2`. Uma
 *    anilha sozinha de um lado não é uma carga que alguém levanta de propósito, então o estoque
 *    é convertido em PARES (`floor(quantidade / 2)`).
 * 2. **Quando o alvo não é alcançável, dizemos o que dá para montar e a diferença.** Devolver
 *    "impossível" seco esconde que 80 kg estão a 2,5 kg de distância.
 */

export type PlateStock = {
  weightKg: number;
  /** Unidades daquele peso no local (não pares). */
  quantity: number;
};

export type PlateSolutionInput = {
  targetKg: number;
  barWeightKg: number;
  plates: PlateStock[];
  /** Menor diferença que ainda conta como "exato" (ponto flutuante). */
  toleranceKg?: number;
};

export type PlatePair = {
  weightKg: number;
  /** Quantos PARES entram (um de cada lado). */
  pairs: number;
};

export type PlateSolution =
  | {
      ok: true;
      /** Anilhas de cada lado, da mais pesada para a mais leve. */
      perSide: PlatePair[];
      perSideKg: number;
      achievedKg: number;
      /** Alcançado − alvo. Negativo = faltou; positivo = passou. */
      differenceKg: number;
      isExact: boolean;
    }
  | { ok: false; reason: PlateFailure; message: string; closestKg: number | null };

export type PlateFailure = "alvo_menor_que_barra" | "sem_anilhas" | "alvo_invalido";

export const PLATE_FAILURE_MESSAGES: Record<PlateFailure, string> = {
  alvo_menor_que_barra: "O alvo é menor que o peso da barra escolhida.",
  sem_anilhas: "Nenhuma anilha cadastrada para este local.",
  alvo_invalido: "Informe um alvo válido.",
};

const round3 = (value: number): number => Number(value.toFixed(3));

/**
 * A melhor montagem para o alvo.
 *
 * Guloso da anilha mais pesada para a mais leve, respeitando o estoque. Para conjuntos reais de
 * academia (múltiplos de 1,25 / 2,5 / 5) o guloso é ótimo; onde não for, ele ainda devolve uma
 * montagem válida com a diferença declarada — que é a informação honesta.
 *
 * O algoritmo **nunca passa do alvo**: montar 85 kg quando o usuário pediu 82,5 seria trocar
 * silenciosamente a carga dele.
 */
export function plateSolution(input: PlateSolutionInput): PlateSolution {
  const tolerance = input.toleranceKg ?? 0.001;

  if (!Number.isFinite(input.targetKg) || input.targetKg <= 0) {
    return {
      ok: false,
      reason: "alvo_invalido",
      message: PLATE_FAILURE_MESSAGES.alvo_invalido,
      closestKg: null,
    };
  }

  const bar = Number.isFinite(input.barWeightKg) ? Math.max(0, input.barWeightKg) : 0;

  if (input.targetKg + tolerance < bar) {
    return {
      ok: false,
      reason: "alvo_menor_que_barra",
      message: PLATE_FAILURE_MESSAGES.alvo_menor_que_barra,
      closestKg: round3(bar),
    };
  }

  const available = input.plates
    .map((plate) => ({ weightKg: plate.weightKg, pairs: Math.floor(plate.quantity / 2) }))
    .filter((plate) => plate.weightKg > 0 && plate.pairs > 0)
    .sort((a, b) => b.weightKg - a.weightKg);

  const targetPerSide = (input.targetKg - bar) / 2;

  // Alvo exatamente igual à barra: montagem válida, sem anilha nenhuma.
  if (targetPerSide <= tolerance) {
    return {
      ok: true,
      perSide: [],
      perSideKg: 0,
      achievedKg: round3(bar),
      differenceKg: round3(bar - input.targetKg),
      isExact: Math.abs(bar - input.targetKg) <= tolerance,
    };
  }

  if (available.length === 0) {
    return {
      ok: false,
      reason: "sem_anilhas",
      message: PLATE_FAILURE_MESSAGES.sem_anilhas,
      closestKg: round3(bar),
    };
  }

  const perSide: PlatePair[] = [];
  let remaining = targetPerSide;

  for (const plate of available) {
    if (remaining < plate.weightKg - tolerance) continue;
    const pairs = Math.min(plate.pairs, Math.floor((remaining + tolerance) / plate.weightKg));
    if (pairs <= 0) continue;
    perSide.push({ weightKg: plate.weightKg, pairs });
    remaining = round3(remaining - pairs * plate.weightKg);
    if (remaining <= tolerance) break;
  }

  const perSideKg = round3(perSide.reduce((sum, plate) => sum + plate.weightKg * plate.pairs, 0));
  const achievedKg = round3(bar + perSideKg * 2);
  const differenceKg = round3(achievedKg - input.targetKg);

  return {
    ok: true,
    perSide,
    perSideKg,
    achievedKg,
    differenceKg,
    isExact: Math.abs(differenceKg) <= tolerance,
  };
}

/* ───────────────────────────── Cargas alcançáveis ───────────────────────────── */

/**
 * Todas as cargas que dá para montar naquele local, em ordem.
 *
 * Serve à interface para oferecer "o próximo peso possível" em vez de deixar o usuário
 * descobrir na marra que 83 kg não existe naquela academia. É enumeração de fato, não sugestão
 * de progressão.
 */
export function achievableLoads(
  plates: PlateStock[],
  barWeightKg: number,
  options: { maxKg?: number } = {},
): number[] {
  const bar = Math.max(0, barWeightKg);
  const maxKg = options.maxKg ?? 500;

  const available = plates
    .map((plate) => ({ weightKg: plate.weightKg, pairs: Math.floor(plate.quantity / 2) }))
    .filter((plate) => plate.weightKg > 0 && plate.pairs > 0);

  // Conjunto de somas possíveis POR LADO. O teto evita explodir a combinatória num estoque
  // absurdo — 500 kg é muito acima de qualquer carga real de academia.
  let perSideOptions = new Set<number>([0]);
  for (const plate of available) {
    const next = new Set<number>(perSideOptions);
    for (const base of perSideOptions) {
      for (let count = 1; count <= plate.pairs; count += 1) {
        const value = round3(base + plate.weightKg * count);
        if (bar + value * 2 > maxKg) break;
        next.add(value);
      }
    }
    perSideOptions = next;
  }

  return [...perSideOptions]
    .map((perSide) => round3(bar + perSide * 2))
    .sort((a, b) => a - b);
}

/** A carga alcançável mais próxima de um alvo. `null` quando não há nenhuma. */
export function closestAchievable(
  plates: PlateStock[],
  barWeightKg: number,
  targetKg: number,
): number | null {
  const loads = achievableLoads(plates, barWeightKg, { maxKg: Math.max(500, targetKg * 2) });
  if (loads.length === 0) return null;

  return loads.reduce((best, load) =>
    Math.abs(load - targetKg) < Math.abs(best - targetKg) ? load : best,
  );
}

/** "2 × 20 kg + 1 × 5 kg por lado" — rótulo pronto, para a tela não montar texto. */
export function plateLabel(perSide: PlatePair[]): string {
  if (perSide.length === 0) return "Só a barra";
  return perSide
    .map((plate) => `${plate.pairs} × ${formatPlateWeight(plate.weightKg)}`)
    .join(" + ");
}

/** "20 kg", "1,25 kg" — vírgula decimal, sem zeros à toa. */
export function formatPlateWeight(weightKg: number): string {
  const text = Number.isInteger(weightKg)
    ? String(weightKg)
    : String(round3(weightKg)).replace(".", ",");
  return `${text} kg`;
}
