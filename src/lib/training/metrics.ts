/**
 * Fase 17-D — Treinos · TODO NÚMERO AGREGADO DO MÓDULO (PURO, sem I/O, sem `Date.now()`).
 *
 * ═══════════ ESTE ARQUIVO É PARA OS TREINOS O QUE `calc.ts` É PARA A DIETA ═══════════
 *
 * Volume, tonelagem, repetições totais, tempo sob tensão, distância, séries por grupo muscular,
 * agregação por sessão / semana / mês / programa — tudo sai daqui. Histórico, gráfico, recorde,
 * dashboard (17-E) e relatório usam a MESMA função; é o que garante que concordem entre si.
 *
 * ═══════════ A REGRA QUE SUSTENTA O ARQUIVO: NÃO SOMAR O QUE NÃO SE SOMA ═══════════
 *
 * Um minuto de prancha, 12 repetições de flexão e 100 kg × 8 no supino não têm denominador
 * comum. Um app que joga tudo num número só de "volume" produz um gráfico bonito e sem
 * significado. Aqui cada `tracking_type` acumula na SUA unidade, declarada em `tracking.ts`:
 *
 *   volume (peso_reps)               = peso × repetições                          → kg
 *   volume (peso_corporal_adicional) = (peso corporal do dia + adicional) × reps   → kg
 *   volume (peso_corporal_assistido) = (peso corporal do dia − assistência) × reps → kg
 *   volume (peso_corporal_reps)      = peso corporal do dia × repetições           → kg
 *   volume (reps_sem_carga)          = SEM volume em kg                            → repetições
 *   volume (duracao / isometria)     = SEM volume em kg                            → segundos
 *   volume (distancia_duracao)       = SEM volume em kg                → distância e segundos
 *   volume (calorias)                = SEM volume em kg      → estimativa do painel, isolada
 *
 * `tracking.ts` continua sendo a ÚNICA matriz de medição — este arquivo a consulta, não a
 * reimplementa.
 *
 * ═══════════ AUSÊNCIA DE DADO NÃO É ZERO ═══════════
 *
 * Sem peso corporal registrado na sessão, a carga efetiva de um exercício de peso corporal é
 * INDISPONÍVEL. A série não entra como "0 kg × 12": ela fica de fora e o total do período é
 * marcado como **parcial**, com o motivo. É a mesma disciplina do `value_state` da Dieta.
 */
import type {
  Laterality,
  SessionSetStatus,
  SessionStatus,
  SetType,
  TrackingType,
  UnilateralVolumeRule,
} from "./constants";
import { UNILATERAL_VOLUME_RULE_LABELS } from "./constants";
import { addDaysIso, isDateIso, startOfWeekIso } from "./schedule";
import { isSetDone } from "./session-machine";
import { effectiveLoadKg, trackingSpec, type VolumeUnit } from "./tracking";

/* ═══════════════════════════ Qualidade do agregado ═══════════════════════════ */

export type MetricQuality = "exato" | "parcial";

/** Por que uma série ficou de fora do volume em kg. Nunca vira zero — vira motivo. */
export type MetricGapReason =
  | "sem_peso_corporal"
  | "carga_nao_informada"
  | "reps_nao_informadas";

export const METRIC_GAP_MESSAGES: Record<MetricGapReason, string> = {
  sem_peso_corporal:
    "Séries de peso corporal sem o peso do dia registrado. Registre o peso corporal na preparação do treino para o volume ficar completo.",
  carga_nao_informada: "Séries em que a carga não foi informada.",
  reps_nao_informadas: "Séries em que as repetições não foram informadas.",
};

export type MetricGap = { reason: MetricGapReason; sets: number };

export const VOLUME_UNIT_LABELS: Record<VolumeUnit, string> = {
  kg: "Volume (kg)",
  reps: "Repetições",
  segundos: "Tempo",
  distancia: "Distância",
  calorias: "Calorias",
  nenhum: "Sem métrica agregável",
};

/* ═══════════════════════════ Entradas mínimas ═══════════════════════════
 * Cada função aceita o MENOR shape que resolve a conta — não o tipo completo de domínio. O
 * teste monta um objeto de cinco linhas e a UI passa a sessão real sem adaptador.
 */

export type MetricSet = {
  id?: string;
  setNumber: number;
  status: SessionSetStatus;
  setType: SetType;
  isWarmup: boolean;
  /** O usuário pode excluir uma série específica do volume (ex.: série de teste). */
  countsInVolume: boolean;

  reps: number | null;
  weightKg: number | null;
  /** SOMA à carga efetiva (cinto, colete). */
  additionalWeightKg: number | null;
  /** SUBTRAI da carga efetiva (barra assistida). Nunca somar. */
  assistanceWeightKg: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  calories: number | null;

  repsLeft?: number | null;
  repsRight?: number | null;
  weightLeftKg?: number | null;
  weightRightKg?: number | null;
};

export type MetricExercise = {
  id: string;
  /** Referência informativa. A identidade estável é o nome congelado. */
  exerciseId: string | null;
  exerciseName: string;
  trackingType: TrackingType;
  laterality: Laterality;
  /** Nome congelado do grupo muscular principal — o histórico não volta ao catálogo. */
  muscleGroup: string | null;
  countsInVolume: boolean;
  sets: MetricSet[];
};

export type MetricSession = {
  id: string;
  /** Data PURA 'yyyy-MM-dd'. Sessão que vira a meia-noite fica no dia em que começou. */
  sessionDate: string;
  status: SessionStatus;
  workoutId: string | null;
  workoutName: string;
  programId: string | null;
  programName: string | null;
  /** Sem ele, exercícios de peso corporal não têm carga efetiva. */
  bodyWeightKg: number | null;
  totalSeconds: number | null;
  activeSeconds: number | null;
  exercises: MetricExercise[];
};

export type MetricOptions = {
  /** Aquecimento fora do volume por padrão — com opção de incluir (preferência do usuário). */
  includeWarmup?: boolean;
  /** Como contar exercício unilateral. A UI SEMPRE mostra qual regra está valendo. */
  unilateralRule?: UnilateralVolumeRule;
};

const resolveOptions = (options: MetricOptions = {}) => ({
  includeWarmup: options.includeWarmup ?? false,
  unilateralRule: options.unilateralRule ?? ("soma_dos_lados" as UnilateralVolumeRule),
});

/** O texto que a tela exibe junto do número — a regra nunca fica implícita. */
export function volumeRuleLabel(options: MetricOptions = {}): string {
  const { includeWarmup, unilateralRule } = resolveOptions(options);
  return `${UNILATERAL_VOLUME_RULE_LABELS[unilateralRule]} · aquecimento ${
    includeWarmup ? "incluído" : "fora"
  } do volume`;
}

/* ═══════════════════════════ Totais ═══════════════════════════ */

export type MetricTotals = {
  /** Tonelagem: só das séries cujo tipo acumula em kg E cuja carga era calculável. */
  volumeKg: number;
  /** Repetições totais — de qualquer exercício que registre repetições. */
  reps: number;
  /** Tempo sob tensão (duração e isometria). Nunca somado com kg. */
  durationSeconds: number;
  distanceM: number;
  /** Estimativa do painel do aparelho. Sempre isolada e rotulada como estimativa. */
  calories: number;

  /** Séries contadas (já com a regra unilateral e o drop set aplicados). */
  sets: number;
  workingSets: number;
  warmupSets: number;
  /** Séries que ficaram de fora do volume em kg, com o motivo. */
  gaps: MetricGap[];
  /** Unidades presentes no agregado — a UI mostra uma série por unidade, nunca uma soma. */
  units: VolumeUnit[];
  quality: MetricQuality;
};

export const EMPTY_TOTALS: MetricTotals = {
  volumeKg: 0,
  reps: 0,
  durationSeconds: 0,
  distanceM: 0,
  calories: 0,
  sets: 0,
  workingSets: 0,
  warmupSets: 0,
  gaps: [],
  units: [],
  quality: "exato",
};

const round3 = (value: number): number => Number(value.toFixed(3));

function mergeGaps(a: MetricGap[], b: MetricGap[]): MetricGap[] {
  const byReason = new Map<MetricGapReason, number>();
  for (const gap of [...a, ...b]) {
    byReason.set(gap.reason, (byReason.get(gap.reason) ?? 0) + gap.sets);
  }
  return [...byReason.entries()]
    .map(([reason, sets]) => ({ reason, sets }))
    .sort((x, y) => y.sets - x.sets || x.reason.localeCompare(y.reason));
}

/** Junta dois agregados preservando a qualidade: parcial + exato = **parcial**. */
export function mergeTotals(a: MetricTotals, b: MetricTotals): MetricTotals {
  const gaps = mergeGaps(a.gaps, b.gaps);
  const units = [...new Set([...a.units, ...b.units])];
  return {
    volumeKg: round3(a.volumeKg + b.volumeKg),
    reps: a.reps + b.reps,
    durationSeconds: a.durationSeconds + b.durationSeconds,
    distanceM: round3(a.distanceM + b.distanceM),
    calories: a.calories + b.calories,
    sets: a.sets + b.sets,
    workingSets: a.workingSets + b.workingSets,
    warmupSets: a.warmupSets + b.warmupSets,
    gaps,
    units,
    quality: gaps.length > 0 ? "parcial" : "exato",
  };
}

export const sumTotals = (list: MetricTotals[]): MetricTotals =>
  list.reduce(mergeTotals, EMPTY_TOTALS);

/* ═══════════════════════════ Contribuição de UMA série ═══════════════════════════ */

export type SetContribution = {
  unit: VolumeUnit;
  volumeKg: number;
  reps: number;
  durationSeconds: number;
  distanceM: number;
  calories: number;
  /** Quantas séries essa linha representa (2 no unilateral contado por lado). */
  setCount: number;
  /** `false` quando o volume em kg não pôde ser calculado — nunca vira zero silencioso. */
  ok: boolean;
  reason: MetricGapReason | null;
};

/**
 * Multiplicadores da regra unilateral.
 *
 * | regra            | valores por lado NÃO registrados | lados registrados |
 * | ---------------- | -------------------------------- | ----------------- |
 * | `por_lado`       | 2 séries · reps×2 · volume×2      | 2 séries · L+R    |
 * | `soma_dos_lados` | 1 série  · reps×2 · volume×2      | 1 série  · L+R    |
 * | `serie_completa` | 1 série  · reps×1 · volume×1      | 1 série  · L+R    |
 *
 * A diferença entre `soma_dos_lados` e `serie_completa` é o que o número registrado SIGNIFICA:
 * "10 repetições" de uma rosca unilateral pode querer dizer "10 de cada lado" (as duas
 * primeiras regras) ou "10 no total da série" (a terceira). O trabalho efetivamente executado
 * não muda com a regra: quando os lados vêm registrados separadamente, os dois sempre somam.
 */
function unilateralFactors(
  rule: UnilateralVolumeRule,
  hasSides: boolean,
): { setCount: number; multiplier: number } {
  if (hasSides) return { setCount: rule === "por_lado" ? 2 : 1, multiplier: 1 };
  switch (rule) {
    case "por_lado":
      return { setCount: 2, multiplier: 2 };
    case "soma_dos_lados":
      return { setCount: 1, multiplier: 2 };
    default:
      return { setCount: 1, multiplier: 1 };
  }
}

const numberOr = (value: number | null | undefined, fallback: number | null): number | null => {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  return value;
};

/**
 * O que UMA série acrescenta ao agregado.
 *
 * Nunca decide sozinha que campo existe: a matriz de `tracking.ts` diz em qual unidade aquele
 * exercício acumula, e `effectiveLoadKg` diz se a carga era calculável.
 */
export function setContribution(
  set: MetricSet,
  exercise: Pick<MetricExercise, "trackingType" | "laterality">,
  bodyWeightKg: number | null,
  options: MetricOptions = {},
): SetContribution {
  const { unilateralRule } = resolveOptions(options);
  const spec = trackingSpec(exercise.trackingType);

  const hasSides =
    set.repsLeft !== null && set.repsLeft !== undefined
      ? true
      : set.repsRight !== null && set.repsRight !== undefined;

  const isUnilateral =
    exercise.laterality !== "bilateral" || exercise.trackingType === "lado_a_lado";

  const { setCount, multiplier } = isUnilateral
    ? unilateralFactors(unilateralRule, hasSides)
    : { setCount: 1, multiplier: 1 };

  const reps = hasSides
    ? (set.repsLeft ?? 0) + (set.repsRight ?? 0)
    : (set.reps ?? 0) * multiplier;

  const base: SetContribution = {
    unit: spec.volumeUnit,
    volumeKg: 0,
    reps,
    durationSeconds: set.durationSeconds ?? 0,
    distanceM: set.distanceM ?? 0,
    calories: set.calories ?? 0,
    setCount,
    ok: true,
    reason: null,
  };

  if (spec.volumeUnit !== "kg") return base;

  // Volume em kg exige carga E repetições. Faltando qualquer um, a série fica de fora COM
  // motivo — inventar 0 kg ou 0 repetições distorceria o gráfico para baixo em silêncio.
  const loadOf = (weight: number | null, additional: number | null, assistance: number | null) =>
    effectiveLoadKg({
      trackingType: exercise.trackingType,
      weightKg: weight,
      additionalWeightKg: additional,
      assistanceWeightKg: assistance,
      bodyWeightKg,
    });

  if (hasSides) {
    const left = loadOf(
      numberOr(set.weightLeftKg, set.weightKg),
      set.additionalWeightKg,
      set.assistanceWeightKg,
    );
    const right = loadOf(
      numberOr(set.weightRightKg, set.weightKg),
      set.additionalWeightKg,
      set.assistanceWeightKg,
    );
    if (!left.ok || !right.ok) {
      const reason = (!left.ok ? left.reason : right.ok ? null : right.reason) ?? "carga_nao_informada";
      return {
        ...base,
        ok: false,
        reason: reason === "nao_usa_carga" ? "carga_nao_informada" : reason,
      };
    }
    const volume = left.kg * (set.repsLeft ?? 0) + right.kg * (set.repsRight ?? 0);
    return { ...base, volumeKg: round3(volume) };
  }

  const load = loadOf(set.weightKg, set.additionalWeightKg, set.assistanceWeightKg);
  if (!load.ok) {
    return {
      ...base,
      ok: false,
      reason: load.reason === "nao_usa_carga" ? "carga_nao_informada" : load.reason,
    };
  }
  if (set.reps === null || set.reps === undefined || !Number.isFinite(set.reps)) {
    return { ...base, ok: false, reason: "reps_nao_informadas" };
  }

  return { ...base, volumeKg: round3(load.kg * set.reps * multiplier) };
}

/* ═══════════════════════════ Drop set ═══════════════════════════
 * Séries de drop set consecutivas são BLOCOS: os pesos somam no volume, mas a contagem de
 * séries é UMA. Contar cada queda como uma série inflaria a série semanal por grupo muscular —
 * e "12 séries de peito" viraria um número que não descreve o treino que foi feito.
 */

export type SetBlock = { sets: MetricSet[]; isDropSet: boolean };

export function dropSetBlocks(sets: MetricSet[]): SetBlock[] {
  const ordered = [...sets].sort((a, b) => a.setNumber - b.setNumber);
  const blocks: SetBlock[] = [];

  for (const set of ordered) {
    const isDrop = set.setType === "drop_set";
    const last = blocks.at(-1);
    if (isDrop && last?.isDropSet) {
      last.sets.push(set);
      continue;
    }
    blocks.push({ sets: [set], isDropSet: isDrop });
  }
  return blocks;
}

/* ═══════════════════════════ Agregação por exercício ═══════════════════════════ */

/** A série entra no agregado? Só o que foi FEITO e não foi excluído do volume pelo usuário. */
export function setCountsForVolume(
  set: MetricSet,
  exerciseCountsInVolume: boolean,
  options: MetricOptions = {},
): boolean {
  const { includeWarmup } = resolveOptions(options);
  if (!isSetDone(set.status)) return false;
  if (!exerciseCountsInVolume || !set.countsInVolume) return false;
  if (!includeWarmup && set.isWarmup) return false;
  return true;
}

export type ExerciseMetrics = {
  exerciseId: string | null;
  exerciseName: string;
  trackingType: TrackingType;
  muscleGroup: string | null;
  unit: VolumeUnit;
  totals: MetricTotals;
  /** A melhor série do exercício naquele conjunto, pela unidade dele. `null` sem série válida. */
  bestSetVolumeKg: number | null;
};

export function exerciseMetrics(
  exercise: MetricExercise,
  bodyWeightKg: number | null,
  options: MetricOptions = {},
): ExerciseMetrics {
  const spec = trackingSpec(exercise.trackingType);

  let bestSetVolumeKg: number | null = null;
  const gaps: MetricGap[] = [];
  let sets = 0;
  let workingSets = 0;
  let warmupSets = 0;
  let volumeKg = 0;
  let reps = 0;
  let durationSeconds = 0;
  let distanceM = 0;
  let calories = 0;
  let anyCounted = false;

  for (const block of dropSetBlocks(exercise.sets)) {
    const eligible = block.sets.filter((set) =>
      setCountsForVolume(set, exercise.countsInVolume, options),
    );
    if (eligible.length === 0) continue;

    let blockVolume = 0;
    let blockVolumeOk = false;
    let blockSetCount = 0;

    for (const set of eligible) {
      const contribution = setContribution(set, exercise, bodyWeightKg, options);
      blockSetCount = Math.max(blockSetCount, contribution.setCount);

      reps += contribution.reps;
      durationSeconds += contribution.durationSeconds;
      distanceM += contribution.distanceM;
      calories += contribution.calories;

      if (spec.volumeUnit === "kg") {
        if (contribution.ok) {
          blockVolume += contribution.volumeKg;
          blockVolumeOk = true;
        } else if (contribution.reason) {
          gaps.push({ reason: contribution.reason, sets: 1 });
        }
      }
    }

    anyCounted = true;
    // Um bloco de drop set conta como UMA série (ou duas, no unilateral por lado).
    sets += blockSetCount;
    const isWarmupBlock = eligible.every((set) => set.isWarmup);
    if (isWarmupBlock) warmupSets += blockSetCount;
    else workingSets += blockSetCount;

    if (spec.volumeUnit === "kg" && blockVolumeOk) {
      volumeKg += blockVolume;
      if (bestSetVolumeKg === null || blockVolume > bestSetVolumeKg) bestSetVolumeKg = blockVolume;
    }
  }

  const mergedGaps = mergeGaps(gaps, []);
  const totals: MetricTotals = {
    volumeKg: round3(volumeKg),
    reps,
    durationSeconds,
    distanceM: round3(distanceM),
    calories,
    sets,
    workingSets,
    warmupSets,
    gaps: mergedGaps,
    units: anyCounted && spec.volumeUnit !== "nenhum" ? [spec.volumeUnit] : [],
    quality: mergedGaps.length > 0 ? "parcial" : "exato",
  };

  return {
    exerciseId: exercise.exerciseId,
    exerciseName: exercise.exerciseName,
    trackingType: exercise.trackingType,
    muscleGroup: exercise.muscleGroup,
    unit: spec.volumeUnit,
    totals,
    bestSetVolumeKg: bestSetVolumeKg === null ? null : round3(bestSetVolumeKg),
  };
}

/* ═══════════════════════════ Agregação por sessão ═══════════════════════════ */

export type SessionMetrics = {
  sessionId: string;
  sessionDate: string;
  workoutId: string | null;
  workoutName: string;
  programId: string | null;
  programName: string | null;
  totals: MetricTotals;
  exercises: ExerciseMetrics[];
  /** Séries por grupo muscular PRINCIPAL (nome congelado). Sem soma com secundário. */
  setsByMuscleGroup: Record<string, number>;
  volumeByMuscleGroup: Record<string, number>;
  totalSeconds: number | null;
  activeSeconds: number | null;
};

/** Sessão cancelada não é execução: nunca entra em agregado nem em recorde. */
export const sessionCounts = (session: Pick<MetricSession, "status">): boolean =>
  session.status !== "cancelada" && session.status !== "rascunho" && session.status !== "pronta";

export function sessionMetrics(
  session: MetricSession,
  options: MetricOptions = {},
): SessionMetrics {
  const exercises = session.exercises.map((exercise) =>
    exerciseMetrics(exercise, session.bodyWeightKg, options),
  );

  const setsByMuscleGroup: Record<string, number> = {};
  const volumeByMuscleGroup: Record<string, number> = {};

  for (const item of exercises) {
    const group = item.muscleGroup ?? "Sem grupo";
    if (item.totals.sets === 0) continue;
    setsByMuscleGroup[group] = (setsByMuscleGroup[group] ?? 0) + item.totals.sets;
    if (item.unit === "kg") {
      volumeByMuscleGroup[group] = round3(
        (volumeByMuscleGroup[group] ?? 0) + item.totals.volumeKg,
      );
    }
  }

  return {
    sessionId: session.id,
    sessionDate: session.sessionDate,
    workoutId: session.workoutId,
    workoutName: session.workoutName,
    programId: session.programId,
    programName: session.programName,
    totals: sumTotals(exercises.map((item) => item.totals)),
    exercises,
    setsByMuscleGroup,
    volumeByMuscleGroup,
    totalSeconds: session.totalSeconds,
    activeSeconds: session.activeSeconds,
  };
}

/* ═══════════════════════════ Agregação de período ═══════════════════════════ */

export type PeriodMetrics = {
  sessionCount: number;
  totals: MetricTotals;
  totalSeconds: number;
  activeSeconds: number;
  setsByMuscleGroup: Record<string, number>;
  volumeByMuscleGroup: Record<string, number>;
  /** Datas distintas com treino — "3 treinos na semana" conta DIAS, não sessões. */
  trainedDays: string[];
};

export function aggregateSessions(
  sessions: MetricSession[],
  options: MetricOptions = {},
): PeriodMetrics {
  const valid = sessions.filter(sessionCounts);
  const perSession = valid.map((session) => sessionMetrics(session, options));

  const setsByMuscleGroup: Record<string, number> = {};
  const volumeByMuscleGroup: Record<string, number> = {};
  let totalSeconds = 0;
  let activeSeconds = 0;
  const days = new Set<string>();

  for (const metrics of perSession) {
    totalSeconds += metrics.totalSeconds ?? 0;
    activeSeconds += metrics.activeSeconds ?? 0;
    days.add(metrics.sessionDate);
    for (const [group, count] of Object.entries(metrics.setsByMuscleGroup)) {
      setsByMuscleGroup[group] = (setsByMuscleGroup[group] ?? 0) + count;
    }
    for (const [group, volume] of Object.entries(metrics.volumeByMuscleGroup)) {
      volumeByMuscleGroup[group] = round3((volumeByMuscleGroup[group] ?? 0) + volume);
    }
  }

  return {
    sessionCount: perSession.length,
    totals: sumTotals(perSession.map((metrics) => metrics.totals)),
    totalSeconds,
    activeSeconds,
    setsByMuscleGroup,
    volumeByMuscleGroup,
    trainedDays: [...days].sort(),
  };
}

/* ═══════════════════════════ Séries temporais ═══════════════════════════
 * Agrupamento por DATA PURA — texto, sem `Date`, sem fuso. `startOfWeekIso` (17-B) já resolve
 * a semana com o primeiro dia configurável.
 */

export type MetricBucket = {
  /** Chave ordenável: 'yyyy-MM-dd' (dia/semana) ou 'yyyy-MM' (mês). */
  key: string;
  label: string;
  metrics: PeriodMetrics;
};

const monthLabel = (key: string): string => {
  const [year, month] = key.split("-");
  const names = [
    "jan", "fev", "mar", "abr", "mai", "jun",
    "jul", "ago", "set", "out", "nov", "dez",
  ];
  const index = Number(month) - 1;
  return `${names[index] ?? month}/${year.slice(2)}`;
};

const dayLabel = (key: string): string => {
  const [, month, day] = key.split("-");
  return `${day}/${month}`;
};

function bucketize(
  sessions: MetricSession[],
  keyOf: (session: MetricSession) => string,
  labelOf: (key: string) => string,
  options: MetricOptions,
): MetricBucket[] {
  const byKey = new Map<string, MetricSession[]>();
  for (const session of sessions.filter(sessionCounts)) {
    if (!isDateIso(session.sessionDate)) continue;
    const key = keyOf(session);
    const list = byKey.get(key) ?? [];
    list.push(session);
    byKey.set(key, list);
  }

  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => ({
      key,
      label: labelOf(key),
      metrics: aggregateSessions(list, options),
    }));
}

export const metricsByDay = (sessions: MetricSession[], options: MetricOptions = {}) =>
  bucketize(sessions, (session) => session.sessionDate, dayLabel, options);

export const metricsByWeek = (
  sessions: MetricSession[],
  options: MetricOptions & { weekStartsOn?: number } = {},
) =>
  bucketize(
    sessions,
    (session) => startOfWeekIso(session.sessionDate, options.weekStartsOn ?? 1),
    (key) => `${dayLabel(key)} a ${dayLabel(addDaysIso(key, 6))}`,
    options,
  );

export const metricsByMonth = (sessions: MetricSession[], options: MetricOptions = {}) =>
  bucketize(sessions, (session) => session.sessionDate.slice(0, 7), monthLabel, options);

/** Agrupa por programa ou por treino-modelo — o rótulo vem do SNAPSHOT, nunca do modelo atual. */
export function metricsByKey(
  sessions: MetricSession[],
  keyOf: (session: MetricSession) => { key: string; label: string },
  options: MetricOptions = {},
): MetricBucket[] {
  const byKey = new Map<string, { label: string; sessions: MetricSession[] }>();
  for (const session of sessions.filter(sessionCounts)) {
    const { key, label } = keyOf(session);
    const entry = byKey.get(key) ?? { label, sessions: [] };
    entry.sessions.push(session);
    byKey.set(key, entry);
  }

  return [...byKey.entries()]
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      metrics: aggregateSessions(entry.sessions, options),
    }))
    .sort((a, b) => b.metrics.totals.volumeKg - a.metrics.totals.volumeKg || a.label.localeCompare(b.label));
}

/* ═══════════════════════════ Frequência ═══════════════════════════ */

export type FrequencyMetrics = {
  /** Dias distintos com treino. */
  trainedDays: number;
  sessions: number;
  /** Semanas distintas com pelo menos um treino. */
  trainedWeeks: number;
  /** Maior sequência de semanas consecutivas com treino. */
  longestWeekStreak: number;
  /** Sequência de semanas que continua valendo na semana de `hoje`. */
  currentWeekStreak: number;
};

/**
 * Frequência a partir das datas puras.
 *
 * @param hoje 'yyyy-MM-dd' INJETADO. Nenhuma função deste arquivo chama `Date.now()`.
 */
export function frequencyMetrics(
  sessions: MetricSession[],
  hoje: string,
  options: { weekStartsOn?: number } = {},
): FrequencyMetrics {
  const weekStartsOn = options.weekStartsOn ?? 1;
  const valid = sessions.filter(sessionCounts).filter((s) => isDateIso(s.sessionDate));

  const days = new Set(valid.map((session) => session.sessionDate));
  const weeks = [...new Set(valid.map((session) => startOfWeekIso(session.sessionDate, weekStartsOn)))]
    .sort();

  let longest = 0;
  let run = 0;
  let previous: string | null = null;

  for (const week of weeks) {
    run = previous !== null && addDaysIso(previous, 7) === week ? run + 1 : 1;
    previous = week;
    if (run > longest) longest = run;
  }

  // A sequência ATUAL só vale se a semana corrente (ou a anterior, se ainda não treinou nesta)
  // estiver na ponta — senão ela já foi interrompida.
  const currentWeek = isDateIso(hoje) ? startOfWeekIso(hoje, weekStartsOn) : null;
  let current = 0;
  if (currentWeek && weeks.length > 0) {
    const last = weeks.at(-1) as string;
    if (last === currentWeek || addDaysIso(last, 7) === currentWeek) {
      current = 1;
      for (let index = weeks.length - 2; index >= 0; index -= 1) {
        if (addDaysIso(weeks[index], 7) === weeks[index + 1]) current += 1;
        else break;
      }
    }
  }

  return {
    trainedDays: days.size,
    sessions: valid.length,
    trainedWeeks: weeks.length,
    longestWeekStreak: longest,
    currentWeekStreak: current,
  };
}

/* ═══════════════════════════ Apresentação ═══════════════════════════ */

/** "12.480 kg" · "12,5 t" quando passa de mil. Arredondar só aqui, nunca no cálculo. */
export function formatVolumeKg(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (Math.abs(value) >= 1000) {
    return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value / 1000)} t`;
  }
  return `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value)} kg`;
}

/** Frase pronta com o motivo do "parcial". Vazia quando o total é exato. */
export function partialExplanation(totals: MetricTotals): string {
  if (totals.quality === "exato" || totals.gaps.length === 0) return "";
  return totals.gaps
    .map((gap) => `${gap.sets} ${gap.sets === 1 ? "série" : "séries"}: ${METRIC_GAP_MESSAGES[gap.reason]}`)
    .join(" ");
}
