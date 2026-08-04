/**
 * Fase 17-B — Treinos · O treino-modelo como número (PURO, sem I/O, sem `Date.now()`).
 *
 * ═══════════════════════ `expandPlannedSets` é o coração deste arquivo ═══════════════════════
 *
 * Existem DOIS jeitos de configurar as séries de um exercício:
 *
 *   1. **Uniforme** — "4 séries de 8 a 12, 90s de descanso". Cabe inteiro em
 *      `training_workout_exercises.default_sets`.
 *   2. **Série a série** — top set pesado + duas back-off, pirâmide, drop set planejado.
 *      Cada série vira uma linha em `training_workout_sets`.
 *
 * Se cada tela resolvesse os dois casos por conta própria, o construtor de treino, a sessão ao
 * vivo (17-C) e o relatório (17-E) discordariam sobre quantas séries aquele treino tem. Por
 * isso `expandPlannedSets` devolve SEMPRE o mesmo formato — `PlannedSet[]` — e é o único
 * caminho. **A 17-C consome só esse formato e não precisa saber que existem dois jeitos.**
 *
 * ═══════════════════════ Três regras que este arquivo NÃO reimplementa ═══════════════════════
 *
 * • **O que cada exercício mede** vem de `tracking.ts`, a ÚNICA matriz de medição do módulo.
 *   Aqui ela é usada para APAGAR o que não se aplica: um exercício de duração não carrega peso
 *   planejado, um de repetições não carrega distância. Sem isso, um campo esquecido no
 *   formulário viraria número fantasma no snapshot da sessão.
 * • **Assistência SUBTRAI carga; carga adicional soma.** Quem faz essa conta é
 *   `effectiveLoadKg`, de `tracking.ts`. Aqui só passamos os três campos separados adiante.
 * • **Sem peso corporal, a carga efetiva é INDISPONÍVEL, nunca zero.** `plannedLoadForSet`
 *   devolve o erro tipado de `tracking.ts` em vez de inventar um número.
 */
import type { Laterality, SetType, TrackingType } from "./constants";
import { effectiveLoadKg, usesField, type EffectiveLoad, type MetricField } from "./tracking";

/* ───────────────────────────── Entradas (mínimas de propósito) ─────────────────────────────
 * As funções aceitam o MENOR shape que resolve a conta, e não o tipo completo de domínio.
 * Assim o teste monta um objeto de 5 linhas e a 17-C pode chamar com o snapshot dela.
 */

export type PlannedSetSource = {
  setNumber: number;
  setType: SetType;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDurationSeconds: number | null;
  targetDistanceM: number | null;
  plannedWeightKg: number | null;
  plannedAdditionalWeightKg: number | null;
  plannedAssistanceWeightKg: number | null;
  restSeconds: number | null;
  targetRir: number | null;
  targetRpe: number | null;
  isWarmup: boolean;
  countsInVolume: boolean;
  notes: string | null;
};

/** O exercício configurado. Só o que `expandPlannedSets` precisa. */
export type PlannableExercise = {
  id: string;
  trackingType: TrackingType;
  laterality?: Laterality;
  defaultSets: number;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDurationSeconds: number | null;
  targetDistanceM: number | null;
  plannedWeightKg: number | null;
  plannedAdditionalWeightKg: number | null;
  plannedAssistanceWeightKg: number | null;
  restSeconds: number | null;
  targetRir: number | null;
  targetRpe: number | null;
  setType: SetType;
  isWarmup: boolean;
  countsInVolume: boolean;
  notes: string | null;
  sets?: PlannedSetSource[];
};

/** Uma série planejada. FORMATO ÚNICO — o que a 17-C congela no snapshot. */
export type PlannedSet = {
  /** Sempre 1..N e sem buracos, mesmo que as linhas configuradas tenham numeração torta. */
  setNumber: number;
  setType: SetType;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  targetDurationSeconds: number | null;
  targetDistanceM: number | null;
  plannedWeightKg: number | null;
  plannedAdditionalWeightKg: number | null;
  plannedAssistanceWeightKg: number | null;
  restSeconds: number | null;
  targetRir: number | null;
  targetRpe: number | null;
  isWarmup: boolean;
  countsInVolume: boolean;
  notes: string | null;
  /** De onde a série veio. A UI usa para dizer "séries iguais" × "configuradas uma a uma". */
  origin: "uniforme" | "configurada";
};

/* ───────────────────────────── expandPlannedSets ───────────────────────────── */

/** Aplica a matriz de medição: o que aquele tipo não usa vira `null`, não zero. */
function applyTrackingMask(set: PlannedSet, type: TrackingType, laterality: Laterality): PlannedSet {
  const uses = (field: MetricField) => usesField(type, field, laterality);

  return {
    ...set,
    targetRepsMin: uses("reps") ? set.targetRepsMin : null,
    targetRepsMax: uses("reps") ? set.targetRepsMax : null,
    targetDurationSeconds: uses("duration") ? set.targetDurationSeconds : null,
    targetDistanceM: uses("distance") ? set.targetDistanceM : null,
    plannedWeightKg: uses("weight") ? set.plannedWeightKg : null,
    plannedAdditionalWeightKg: uses("additionalWeight") ? set.plannedAdditionalWeightKg : null,
    plannedAssistanceWeightKg: uses("assistanceWeight") ? set.plannedAssistanceWeightKg : null,
  };
}

/** `null` no nível da série significa "herda do exercício" — a herança mora só aqui. */
const inherit = <T>(own: T | null | undefined, fallback: T | null): T | null =>
  own === null || own === undefined ? fallback : own;

/**
 * As séries planejadas de um exercício, no formato único.
 *
 * **REGRA:** se existir ao menos uma linha configurada, ela é a verdade e `defaultSets` passa
 * a ser só metadado de exibição. Sem nenhuma linha, as séries são uniformes.
 *
 * Uma série de aquecimento é qualquer uma com `isWarmup` **ou** `setType === 'aquecimento'` —
 * marcar o tipo e esquecer o interruptor (ou o contrário) não pode gerar duas verdades.
 */
export function expandPlannedSets(exercise: PlannableExercise): PlannedSet[] {
  const laterality = exercise.laterality ?? "bilateral";
  const configured = [...(exercise.sets ?? [])].sort((a, b) => a.setNumber - b.setNumber);

  if (configured.length > 0) {
    return configured.map((set, index) => {
      const isWarmup = set.isWarmup || set.setType === "aquecimento";
      return applyTrackingMask(
        {
          // Renumerado: um buraco na numeração salva não pode virar buraco na sessão.
          setNumber: index + 1,
          setType: set.setType,
          targetRepsMin: inherit(set.targetRepsMin, exercise.targetRepsMin),
          targetRepsMax: inherit(set.targetRepsMax, exercise.targetRepsMax),
          targetDurationSeconds: inherit(set.targetDurationSeconds, exercise.targetDurationSeconds),
          targetDistanceM: inherit(set.targetDistanceM, exercise.targetDistanceM),
          plannedWeightKg: inherit(set.plannedWeightKg, exercise.plannedWeightKg),
          plannedAdditionalWeightKg: inherit(
            set.plannedAdditionalWeightKg,
            exercise.plannedAdditionalWeightKg,
          ),
          plannedAssistanceWeightKg: inherit(
            set.plannedAssistanceWeightKg,
            exercise.plannedAssistanceWeightKg,
          ),
          restSeconds: inherit(set.restSeconds, exercise.restSeconds),
          targetRir: inherit(set.targetRir, exercise.targetRir),
          targetRpe: inherit(set.targetRpe, exercise.targetRpe),
          isWarmup,
          countsInVolume: set.countsInVolume,
          notes: set.notes,
          origin: "configurada",
        },
        exercise.trackingType,
        laterality,
      );
    });
  }

  const total = Math.max(1, Math.trunc(exercise.defaultSets || 1));
  const isWarmup = exercise.isWarmup || exercise.setType === "aquecimento";

  return Array.from({ length: total }, (_, index) =>
    applyTrackingMask(
      {
        setNumber: index + 1,
        setType: exercise.setType,
        targetRepsMin: exercise.targetRepsMin,
        targetRepsMax: exercise.targetRepsMax,
        targetDurationSeconds: exercise.targetDurationSeconds,
        targetDistanceM: exercise.targetDistanceM,
        plannedWeightKg: exercise.plannedWeightKg,
        plannedAdditionalWeightKg: exercise.plannedAdditionalWeightKg,
        plannedAssistanceWeightKg: exercise.plannedAssistanceWeightKg,
        restSeconds: exercise.restSeconds,
        targetRir: exercise.targetRir,
        targetRpe: exercise.targetRpe,
        isWarmup,
        countsInVolume: exercise.countsInVolume,
        notes: exercise.notes,
        origin: "uniforme",
      },
      exercise.trackingType,
      laterality,
    ),
  );
}

/** Séries de todos os exercícios, na ordem canônica do treino. */
export function expandWorkoutSets(
  exercises: PlannableExercise[],
): { exercise: PlannableExercise; sets: PlannedSet[] }[] {
  return exercises.map((exercise) => ({ exercise, sets: expandPlannedSets(exercise) }));
}

/**
 * Carga efetiva PLANEJADA de uma série. Delega a `tracking.ts` — sem peso corporal do dia,
 * devolve o erro tipado (`sem_peso_corporal`) em vez de "0 kg".
 */
export function plannedLoadForSet(
  set: PlannedSet,
  trackingType: TrackingType,
  bodyWeightKg: number | null = null,
): EffectiveLoad {
  return effectiveLoadKg({
    trackingType,
    weightKg: set.plannedWeightKg,
    additionalWeightKg: set.plannedAdditionalWeightKg,
    assistanceWeightKg: set.plannedAssistanceWeightKg,
    bodyWeightKg,
  });
}

/* ───────────────────────────── Contagem de séries ───────────────────────────── */

export type SetCounts = {
  /** Todas as séries, inclusive aquecimento. */
  total: number;
  /** Séries de trabalho (tudo que não é aquecimento). */
  working: number;
  warmup: number;
};

export function countSets(exercises: PlannableExercise[]): SetCounts {
  let total = 0;
  let warmup = 0;

  for (const exercise of exercises) {
    for (const set of expandPlannedSets(exercise)) {
      total += 1;
      if (set.isWarmup) warmup += 1;
    }
  }
  return { total, working: total - warmup, warmup };
}

/**
 * Séries por grupo muscular.
 *
 * Principal e secundário são contados SEPARADAMENTE de propósito: somar os dois faria uma
 * remada aparecer como se treinasse bíceps tanto quanto costas. Quem quiser um número só
 * decide o peso de cada um — o dado bruto continua honesto.
 */
export type MuscleSetCounts = {
  primary: Record<string, number>;
  secondary: Record<string, number>;
};

export function countSetsByMuscleGroup(
  exercises: (PlannableExercise & {
    primaryMuscleGroupId: string;
    secondaryMuscleGroupIds?: string[];
  })[],
  options: { includeWarmup?: boolean } = {},
): MuscleSetCounts {
  const includeWarmup = options.includeWarmup ?? false;
  const primary: Record<string, number> = {};
  const secondary: Record<string, number> = {};

  for (const exercise of exercises) {
    const sets = expandPlannedSets(exercise).filter((set) => includeWarmup || !set.isWarmup);
    if (sets.length === 0) continue;

    primary[exercise.primaryMuscleGroupId] =
      (primary[exercise.primaryMuscleGroupId] ?? 0) + sets.length;

    for (const groupId of exercise.secondaryMuscleGroupIds ?? []) {
      if (groupId === exercise.primaryMuscleGroupId) continue;
      secondary[groupId] = (secondary[groupId] ?? 0) + sets.length;
    }
  }

  return { primary, secondary };
}

/* ───────────────────────────── Duração estimada ─────────────────────────────
 * ESTIMATIVA, e a interface diz isso. Duração = execução + descanso, e nada mais: não há
 * como o sistema saber quanto tempo o usuário leva trocando de aparelho ou conversando.
 */

/** Segundos por repetição quando o exercício não é medido em tempo. Estimativa declarada. */
export const SECONDS_PER_REP = 3;

export type DurationEstimate = {
  executionSeconds: number;
  restSeconds: number;
  totalSeconds: number;
  totalMinutes: number;
  /** Alguma série não tinha alvo nenhum: o número é PARCIAL, e a UI precisa dizer. */
  isPartial: boolean;
};

function executionSecondsOf(set: PlannedSet): { seconds: number; known: boolean } {
  if (set.targetDurationSeconds !== null) return { seconds: set.targetDurationSeconds, known: true };

  // Faixa de repetições: usa o topo, que é o cenário realista de quem completa a série.
  const reps = set.targetRepsMax ?? set.targetRepsMin;
  if (reps !== null && reps !== undefined) return { seconds: reps * SECONDS_PER_REP, known: true };

  return { seconds: 0, known: false };
}

/**
 * Duração estimada do treino.
 *
 * O descanso da ÚLTIMA série não entra: ninguém fica na academia esperando 90 segundos depois
 * de guardar a anilha. Contar esse descanso inflaria todo treino em pelo menos um intervalo.
 */
export function estimateWorkoutDuration(
  exercises: PlannableExercise[],
  options: { defaultRestSeconds?: number } = {},
): DurationEstimate {
  const defaultRest = options.defaultRestSeconds ?? 0;

  const allSets = exercises.flatMap((exercise) => expandPlannedSets(exercise));

  let executionSeconds = 0;
  let restSeconds = 0;
  let isPartial = false;

  allSets.forEach((set, index) => {
    const execution = executionSecondsOf(set);
    executionSeconds += execution.seconds;
    if (!execution.known) isPartial = true;

    const isLast = index === allSets.length - 1;
    if (!isLast) restSeconds += set.restSeconds ?? defaultRest;
  });

  const totalSeconds = executionSeconds + restSeconds;
  return {
    executionSeconds,
    restSeconds,
    totalSeconds,
    totalMinutes: Math.round(totalSeconds / 60),
    isPartial,
  };
}

/* ───────────────────────────── Superset ─────────────────────────────
 * `superset_group` é uma letra (A, B, C…). Exercícios com o MESMO grupo e posições
 * CONTÍGUAS formam um bloco.
 *
 * Um superset furado (A, B, A) não tem execução possível: a sessão ao vivo teria de alternar
 * entre dois exercícios com um terceiro no meio. Por isso a validação é pura, testada, e a
 * interface bloqueia o salvamento — em vez de deixar o problema aparecer na academia.
 */

export type SupersetIssueKind = "nao_contiguo" | "sozinho";

export type SupersetIssue = {
  group: string;
  kind: SupersetIssueKind;
  message: string;
  /** Posições (0-based, na ordem atual) envolvidas. */
  positions: number[];
};

export type SupersetValidation = {
  ok: boolean;
  issues: SupersetIssue[];
};

/** Valida os blocos de superset da ORDEM ATUAL da lista (índice = posição). */
export function validateSupersets(
  exercises: { supersetGroup: string | null }[],
): SupersetValidation {
  const positionsByGroup = new Map<string, number[]>();

  exercises.forEach((exercise, index) => {
    const group = exercise.supersetGroup?.trim();
    if (!group) return;
    const list = positionsByGroup.get(group) ?? [];
    list.push(index);
    positionsByGroup.set(group, list);
  });

  const issues: SupersetIssue[] = [];

  for (const [group, positions] of [...positionsByGroup.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    if (positions.length < 2) {
      issues.push({
        group,
        kind: "sozinho",
        positions,
        message: `O bloco ${group} tem um exercício só. Um superset precisa de pelo menos dois — junte outro exercício ao bloco ou remova a marcação.`,
      });
      continue;
    }

    const contiguous = positions.every((value, index) =>
      index === 0 ? true : value === positions[index - 1] + 1,
    );
    if (!contiguous) {
      issues.push({
        group,
        kind: "nao_contiguo",
        positions,
        message: `Os exercícios do bloco ${group} não estão em sequência. Um superset alterna entre exercícios vizinhos — mova-os para posições seguidas.`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

export type SupersetBlock = {
  group: string;
  /** Índices (0-based) na ordem atual. */
  positions: number[];
};

/**
 * Blocos de superset REAIS: mesmo grupo em posições vizinhas, com dois ou mais exercícios.
 * Uma marcação solta ou furada não vira bloco — ela vira erro em `validateSupersets`.
 */
export function supersetBlocks(exercises: { supersetGroup: string | null }[]): SupersetBlock[] {
  const blocks: SupersetBlock[] = [];

  for (let index = 0; index < exercises.length; index += 1) {
    const group = exercises[index].supersetGroup?.trim() || null;
    if (!group) continue;

    const last = blocks.at(-1);
    if (last && last.group === group && last.positions.at(-1) === index - 1) {
      last.positions.push(index);
      continue;
    }
    blocks.push({ group, positions: [index] });
  }

  return blocks.filter((block) => block.positions.length >= 2);
}

/* ───────────────────────────── Ordem canônica ─────────────────────────────
 * Reordenar é sempre reversível e tem alternativa por teclado (acessibilidade). Aqui fica só
 * a aritmética: a interface arrasta, esta função devolve as posições limpas.
 */

/** Ordena por `position` (empate = ordem de chegada) e renumera 0..n-1, sem buracos. */
export function canonicalOrder<T extends { id: string; position: number }>(items: T[]): T[] {
  return [...items]
    .map((item, index) => ({ item, index }))
    .sort((a, b) => a.item.position - b.item.position || a.index - b.index)
    .map(({ item }, index) => ({ ...item, position: index }));
}

/**
 * Aplica uma ordem vinda da interface (lista de ids) e renumera.
 * Ids desconhecidos são ignorados; itens que ficaram de fora vão para o fim, na ordem antiga —
 * reordenar NUNCA pode fazer um exercício sumir da lista.
 */
export function applyOrder<T extends { id: string; position: number }>(
  items: T[],
  orderedIds: string[],
): T[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: T[] = [];

  for (const id of orderedIds) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  }
  for (const item of canonicalOrder([...byId.values()])) ordered.push(item);

  return ordered.map((item, index) => ({ ...item, position: index }));
}

/** Move um item uma casa (alternativa por teclado ao arrastar). */
export function moveByOffset<T extends { id: string; position: number }>(
  items: T[],
  id: string,
  offset: number,
): T[] {
  const ordered = canonicalOrder(items);
  const from = ordered.findIndex((item) => item.id === id);
  if (from < 0) return ordered;

  const to = Math.min(ordered.length - 1, Math.max(0, from + offset));
  if (to === from) return ordered;

  const next = [...ordered];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next.map((item, index) => ({ ...item, position: index }));
}

/* ───────────────────────────── Resumo do treino ───────────────────────────── */

export type WorkoutSummary = {
  exerciseCount: number;
  sets: SetCounts;
  muscles: MuscleSetCounts;
  duration: DurationEstimate;
  supersets: SupersetValidation;
  /** Ids dos grupos musculares principais, na ordem em que aparecem no treino. */
  primaryMuscleGroupIds: string[];
};

/** Tudo que a UI mostra sobre um treino-modelo, calculado num lugar só. */
export function summarizeWorkout(
  exercises: (PlannableExercise & {
    primaryMuscleGroupId: string;
    secondaryMuscleGroupIds?: string[];
    supersetGroup: string | null;
  })[],
  options: { defaultRestSeconds?: number; includeWarmupInMuscleCount?: boolean } = {},
): WorkoutSummary {
  const primaryMuscleGroupIds: string[] = [];
  for (const exercise of exercises) {
    if (!primaryMuscleGroupIds.includes(exercise.primaryMuscleGroupId)) {
      primaryMuscleGroupIds.push(exercise.primaryMuscleGroupId);
    }
  }

  return {
    exerciseCount: exercises.length,
    sets: countSets(exercises),
    muscles: countSetsByMuscleGroup(exercises, {
      includeWarmup: options.includeWarmupInMuscleCount,
    }),
    duration: estimateWorkoutDuration(exercises, {
      defaultRestSeconds: options.defaultRestSeconds,
    }),
    supersets: validateSupersets(exercises),
    primaryMuscleGroupIds,
  };
}

/* ───────────────────────────── Rótulos ───────────────────────────── */

/** "8 a 12", "12", "até a falha" — nunca "0" quando o alvo não foi definido. */
export function repRangeLabel(min: number | null, max: number | null): string {
  if (min === null && max === null) return "livre";
  if (min !== null && max !== null) return min === max ? String(min) : `${min} a ${max}`;
  return String(min ?? max);
}

/** "1 min 30 s" a partir de segundos. Vazio quando não há valor. */
export function secondsLabel(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return "";
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
}
