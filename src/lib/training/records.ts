/**
 * Fase 17-D — Treinos · RECORDES: detecção, consolidação e desduplicação (PURO).
 *
 * ═══════════════════════ O QUE A 17-C DEIXOU, E O QUE FALTAVA ═══════════════════════
 *
 * `training_session_sets.is_personal_record` é um MARCADOR gravado no calor da sessão: aquela
 * série pareceu um recorde. Ele não conhece o resto do histórico, não desempata, não desduplica
 * e não guarda a marca anterior. A consolidação é aqui.
 *
 * ═══════════════════════ CINCO REGRAS QUE MORAM SÓ NESTE ARQUIVO ═══════════════════════
 *
 *  1. **Só série concluída e válida conta.** Pulada, cancelada, pendente e de AQUECIMENTO não
 *     geram recorde — um aquecimento pesado num dia bom não é marca pessoal.
 *  2. **Sessão cancelada ou ainda em preparação não existe** para efeito de recorde.
 *  3. **Empate não gera recorde novo.** Repetir 100 kg × 8 não "bate" nada: a data original é
 *     preservada e nenhuma notificação (17-F) dispara de novo.
 *  4. **A marca anterior não é apagada** — vai para `previous_value`/`previous_achieved_on`.
 *  5. **A identidade é o `record_key`**, montado do id do exercício ou, na falta dele, do NOME
 *     congelado. Um exercício excluído do catálogo continua com o recorde legível.
 *
 * Nada aqui chama `Date.now()`: a data do recorde é a `session_date` (data pura) da sessão.
 */
import type { OneRmFormula, TrackingType } from "./constants";
import { estimateOneRm } from "./one-rm";
import {
  dropSetBlocks,
  setContribution,
  setCountsForVolume,
  sessionCounts,
  type MetricExercise,
  type MetricOptions,
  type MetricSession,
  type MetricSet,
} from "./metrics";
import { addDaysIso, isDateIso, startOfWeekIso } from "./schedule";
import { trackingSpec } from "./tracking";

/* ═══════════════════════════ Vocabulário ═══════════════════════════ */

export const RECORD_TYPES = [
  "maior_peso",
  "maior_reps_no_peso",
  "melhor_volume_serie",
  "melhor_volume_sessao",
  "melhor_1rm_estimado",
  "maior_duracao",
  "maior_distancia",
  "maior_sequencia_semanas",
  "mais_sessoes_mes",
] as const;
export type RecordType = (typeof RECORD_TYPES)[number];

export const RECORD_TYPE_LABELS: Record<RecordType, string> = {
  maior_peso: "Maior carga",
  maior_reps_no_peso: "Mais repetições com a mesma carga",
  melhor_volume_serie: "Melhor volume numa série",
  melhor_volume_sessao: "Melhor volume numa sessão",
  melhor_1rm_estimado: "Melhor 1RM estimado",
  maior_duracao: "Maior duração",
  maior_distancia: "Maior distância",
  maior_sequencia_semanas: "Maior sequência de semanas treinadas",
  mais_sessoes_mes: "Mais treinos num mês",
};

export const RECORD_TYPE_HINTS: Record<RecordType, string> = {
  maior_peso: "A maior carga efetiva registrada numa série válida deste exercício.",
  maior_reps_no_peso: "Para cada carga, o maior número de repetições que você fez com ela.",
  melhor_volume_serie: "Carga × repetições da melhor série isolada.",
  melhor_volume_sessao: "Somatório de carga × repetições do exercício numa mesma sessão.",
  melhor_1rm_estimado: "Estimativa, não medição. A fórmula usada aparece junto do número.",
  maior_duracao: "O maior tempo registrado numa série deste exercício.",
  maior_distancia: "A maior distância registrada numa série deste exercício.",
  maior_sequencia_semanas: "Semanas seguidas com pelo menos um treino registrado.",
  mais_sessoes_mes: "O mês com mais treinos registrados.",
};

export type RecordUnit = "kg" | "reps" | "segundos" | "metros" | "sessoes" | "semanas";

export const RECORD_UNIT_LABELS: Record<RecordUnit, string> = {
  kg: "kg",
  reps: "repetições",
  segundos: "segundos",
  metros: "metros",
  sessoes: "treinos",
  semanas: "semanas",
};

export const RECORD_TYPE_UNITS: Record<RecordType, RecordUnit> = {
  maior_peso: "kg",
  maior_reps_no_peso: "reps",
  melhor_volume_serie: "kg",
  melhor_volume_sessao: "kg",
  melhor_1rm_estimado: "kg",
  maior_duracao: "segundos",
  maior_distancia: "metros",
  maior_sequencia_semanas: "semanas",
  mais_sessoes_mes: "sessoes",
};

/** Tipos que existem por exercício × tipos do usuário como um todo. */
export const GENERAL_RECORD_TYPES: readonly RecordType[] = [
  "maior_sequencia_semanas",
  "mais_sessoes_mes",
];

export const isGeneralRecord = (type: RecordType): boolean =>
  GENERAL_RECORD_TYPES.includes(type);

/* ═══════════════════════════ Chave de consolidação ═══════════════════════════ */

/**
 * Identidade estável do recorde.
 *
 * Usa o id do exercício quando ele existe; senão, o nome congelado normalizado. É o que faz o
 * recorde de um exercício **excluído do catálogo** continuar existindo, com o nome que tinha —
 * mesma disciplina do `entry_kind` da Dieta e do `exercise_name_snapshot` da 17-C.
 */
export function recordKey(input: {
  recordType: RecordType;
  exerciseId?: string | null;
  exerciseName?: string | null;
  referenceWeightKg?: number | null;
}): string {
  if (isGeneralRecord(input.recordType)) return `geral|${input.recordType}`;

  const scope = input.exerciseId
    ? `id:${input.exerciseId}`
    : `nome:${(input.exerciseName ?? "").trim().toLowerCase()}`;

  const reference =
    input.referenceWeightKg === null || input.referenceWeightKg === undefined
      ? ""
      : `|${Number(input.referenceWeightKg).toFixed(3)}`;

  return `${scope}|${input.recordType}${reference}`;
}

/* ═══════════════════════════ Candidatos ═══════════════════════════ */

export type RecordCandidate = {
  key: string;
  scope: "exercicio" | "geral";
  recordType: RecordType;
  exerciseId: string | null;
  exerciseName: string | null;
  value: number;
  unit: RecordUnit;
  /** Dimensão extra de "mais repetições COM ESTA carga". */
  referenceWeightKg: number | null;
  reps: number | null;
  weightKg: number | null;
  oneRmFormula: OneRmFormula | null;
  /** Data PURA em que aconteceu. */
  achievedOn: string;
  sessionId: string | null;
  sessionSetId: string | null;
};

const round3 = (value: number): number => Number(value.toFixed(3));

/** A carga efetiva de uma série, quando dá para calcular. Reusa a conta de `metrics.ts`. */
function loadOfSet(
  set: MetricSet,
  exercise: Pick<MetricExercise, "trackingType" | "laterality">,
  bodyWeightKg: number | null,
): number | null {
  const contribution = setContribution(set, exercise, bodyWeightKg, {
    unilateralRule: "serie_completa",
  });
  if (!contribution.ok || contribution.unit !== "kg") return null;
  const reps = set.reps ?? null;
  if (reps === null || reps <= 0) return null;
  return round3(contribution.volumeKg / reps);
}

export type RecordDetectionOptions = {
  oneRmFormula?: OneRmFormula;
  /** Aquecimento NUNCA gera recorde — a opção existe só para simetria com `metrics.ts`. */
  unilateralRule?: MetricOptions["unilateralRule"];
  weekStartsOn?: number;
};

/**
 * Todos os candidatos a recorde de um conjunto de sessões.
 *
 * Devolve **candidatos**, não recordes: a comparação com o histórico e o desempate acontecem em
 * `consolidateRecords`. Separar as duas etapas é o que torna o recálculo (após excluir uma
 * sessão) idêntico à detecção normal — nenhum caminho especial, nenhuma divergência.
 */
export function detectRecords(
  sessions: MetricSession[],
  options: RecordDetectionOptions = {},
): RecordCandidate[] {
  const formula: OneRmFormula = options.oneRmFormula ?? "epley";
  const candidates: RecordCandidate[] = [];

  const valid = sessions
    .filter(sessionCounts)
    .filter((session) => isDateIso(session.sessionDate));

  for (const session of valid) {
    for (const exercise of session.exercises) {
      const spec = trackingSpec(exercise.trackingType);
      const sets = exercise.sets.filter((set) =>
        // Aquecimento fora SEMPRE: `includeWarmup` não é oferecido aqui de propósito.
        setCountsForVolume(set, exercise.countsInVolume, { includeWarmup: false }),
      );
      if (sets.length === 0) continue;

      const push = (partial: Omit<RecordCandidate, "key" | "scope" | "unit">) => {
        candidates.push({
          ...partial,
          key: recordKey({
            recordType: partial.recordType,
            exerciseId: partial.exerciseId,
            exerciseName: partial.exerciseName,
            referenceWeightKg: partial.referenceWeightKg,
          }),
          scope: "exercicio",
          unit: RECORD_TYPE_UNITS[partial.recordType],
        });
      };

      const common = {
        exerciseId: exercise.exerciseId,
        exerciseName: exercise.exerciseName,
        achievedOn: session.sessionDate,
        sessionId: session.id,
        oneRmFormula: null as OneRmFormula | null,
      };

      /* ── Recordes de carga ── */
      if (spec.volumeUnit === "kg") {
        let sessionVolume = 0;
        let sessionVolumeOk = false;

        for (const block of dropSetBlocks(sets)) {
          let blockVolume = 0;
          let blockOk = false;

          for (const set of block.sets) {
            const contribution = setContribution(set, exercise, session.bodyWeightKg, {
              unilateralRule: options.unilateralRule,
            });
            if (!contribution.ok) continue;
            blockVolume += contribution.volumeKg;
            blockOk = true;

            const load = loadOfSet(set, exercise, session.bodyWeightKg);
            if (load !== null && load > 0) {
              push({
                ...common,
                recordType: "maior_peso",
                value: load,
                referenceWeightKg: null,
                reps: set.reps,
                weightKg: load,
                sessionSetId: set.id ?? null,
              });

              if (set.reps !== null && set.reps > 0) {
                // Um recorde POR CARGA: "12 repetições com 80 kg" não compete com "5 com 100".
                push({
                  ...common,
                  recordType: "maior_reps_no_peso",
                  value: set.reps,
                  referenceWeightKg: load,
                  reps: set.reps,
                  weightKg: load,
                  sessionSetId: set.id ?? null,
                });

                const estimate = estimateOneRm({ weightKg: load, reps: set.reps, formula });
                // Fora da faixa de validade a estimativa não vira RECORDE — ela continua
                // visível na tela do exercício, mas não define uma marca pessoal.
                if (estimate.ok && estimate.withinValidRange) {
                  push({
                    ...common,
                    recordType: "melhor_1rm_estimado",
                    value: estimate.value,
                    referenceWeightKg: null,
                    reps: set.reps,
                    weightKg: load,
                    oneRmFormula: formula,
                    sessionSetId: set.id ?? null,
                  });
                }
              }
            }
          }

          if (blockOk && blockVolume > 0) {
            push({
              ...common,
              recordType: "melhor_volume_serie",
              value: round3(blockVolume),
              referenceWeightKg: null,
              reps: null,
              weightKg: null,
              sessionSetId: block.sets[0].id ?? null,
            });
            sessionVolume += blockVolume;
            sessionVolumeOk = true;
          }
        }

        if (sessionVolumeOk && sessionVolume > 0) {
          push({
            ...common,
            recordType: "melhor_volume_sessao",
            value: round3(sessionVolume),
            referenceWeightKg: null,
            reps: null,
            weightKg: null,
            sessionSetId: null,
          });
        }
      }

      /* ── Duração e distância ── */
      for (const set of sets) {
        if (spec.volumeUnit === "segundos" && set.durationSeconds && set.durationSeconds > 0) {
          push({
            ...common,
            recordType: "maior_duracao",
            value: set.durationSeconds,
            referenceWeightKg: null,
            reps: null,
            weightKg: set.weightKg,
            sessionSetId: set.id ?? null,
          });
        }
        if (spec.volumeUnit === "distancia" && set.distanceM && set.distanceM > 0) {
          push({
            ...common,
            recordType: "maior_distancia",
            value: round3(set.distanceM),
            referenceWeightKg: null,
            reps: null,
            weightKg: null,
            sessionSetId: set.id ?? null,
          });
        }
      }
    }
  }

  candidates.push(...generalRecords(valid, options.weekStartsOn ?? 1));
  return candidates;
}

/** Recordes que não pertencem a um exercício: constância. */
function generalRecords(sessions: MetricSession[], weekStartsOn: number): RecordCandidate[] {
  if (sessions.length === 0) return [];

  const general = (
    recordType: RecordType,
    value: number,
    achievedOn: string,
  ): RecordCandidate => ({
    key: recordKey({ recordType }),
    scope: "geral",
    recordType,
    exerciseId: null,
    exerciseName: null,
    value,
    unit: RECORD_TYPE_UNITS[recordType],
    referenceWeightKg: null,
    reps: null,
    weightKg: null,
    oneRmFormula: null,
    achievedOn,
    sessionId: null,
    sessionSetId: null,
  });

  const result: RecordCandidate[] = [];

  // Sequência de semanas consecutivas com treino.
  const weeks = [...new Set(sessions.map((s) => startOfWeekIso(s.sessionDate, weekStartsOn)))].sort();
  let best = 0;
  let bestEnd = weeks[0] ?? "";
  let run = 0;
  let previous: string | null = null;
  for (const week of weeks) {
    run = previous !== null && addDaysIso(previous, 7) === week ? run + 1 : 1;
    previous = week;
    if (run > best) {
      best = run;
      bestEnd = addDaysIso(week, 6);
    }
  }
  if (best > 0) result.push(general("maior_sequencia_semanas", best, bestEnd));

  // Mês com mais treinos (dias distintos, não sessões: dois treinos no mesmo dia são um dia).
  const daysByMonth = new Map<string, Set<string>>();
  for (const session of sessions) {
    const month = session.sessionDate.slice(0, 7);
    const days = daysByMonth.get(month) ?? new Set<string>();
    days.add(session.sessionDate);
    daysByMonth.set(month, days);
  }
  let bestMonth: { month: string; count: number } | null = null;
  for (const [month, days] of daysByMonth) {
    if (!bestMonth || days.size > bestMonth.count) bestMonth = { month, count: days.size };
  }
  if (bestMonth) {
    result.push(general("mais_sessoes_mes", bestMonth.count, `${bestMonth.month}-01`));
  }

  return result;
}

/* ═══════════════════════════ Consolidação ═══════════════════════════ */

export type StoredRecord = {
  id?: string;
  key: string;
  recordType: RecordType;
  value: number;
  achievedOn: string;
  previousValue: number | null;
  previousAchievedOn: string | null;
};

export type ConsolidationResult = {
  /** Chaves novas — nenhum recorde anterior existia. */
  inserts: RecordCandidate[];
  /** Recordes superados: o candidato vence e a marca anterior é preservada. */
  updates: { candidate: RecordCandidate; previous: StoredRecord }[];
  /** Empates e marcas inferiores. Nada é gravado, nada é notificado. */
  unchanged: RecordCandidate[];
};

/** O melhor candidato de cada chave. Empate mantém o MAIS ANTIGO (a data original vale). */
export function dedupeCandidates(candidates: RecordCandidate[]): RecordCandidate[] {
  const byKey = new Map<string, RecordCandidate>();

  for (const candidate of candidates) {
    const current = byKey.get(candidate.key);
    if (!current) {
      byKey.set(candidate.key, candidate);
      continue;
    }
    if (candidate.value > current.value) {
      byKey.set(candidate.key, candidate);
      continue;
    }
    if (candidate.value === current.value && candidate.achievedOn < current.achievedOn) {
      byKey.set(candidate.key, candidate);
    }
  }

  return [...byKey.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Cruza os candidatos com o que já estava gravado.
 *
 * **Empate não gera recorde novo** — é o que impede duplicidade na lista e notificação repetida
 * na 17-F. Superar preserva a marca anterior; nada é apagado.
 */
export function consolidateRecords(
  candidates: RecordCandidate[],
  existing: StoredRecord[],
): ConsolidationResult {
  const best = dedupeCandidates(candidates);
  const byKey = new Map(existing.map((record) => [record.key, record]));

  const inserts: RecordCandidate[] = [];
  const updates: { candidate: RecordCandidate; previous: StoredRecord }[] = [];
  const unchanged: RecordCandidate[] = [];

  for (const candidate of best) {
    const current = byKey.get(candidate.key);
    if (!current) {
      inserts.push(candidate);
      continue;
    }
    if (candidate.value > current.value) updates.push({ candidate, previous: current });
    else unchanged.push(candidate);
  }

  return { inserts, updates, unchanged };
}

/**
 * Reconstrução completa a partir do histórico.
 *
 * É o caminho usado depois de **excluir uma sessão**: o recorde que dependia dela deixa de
 * existir e o segundo melhor assume, com a data dele. Recalcular do zero é mais simples — e
 * mais confiável — do que tentar "desfazer" um recorde pontualmente.
 */
export function rebuildRecords(
  sessions: MetricSession[],
  options: RecordDetectionOptions = {},
): RecordCandidate[] {
  return dedupeCandidates(detectRecords(sessions, options));
}

/** As chaves que sumiram: recordes gravados que o histórico atual já não sustenta. */
export function staleRecordKeys(
  rebuilt: RecordCandidate[],
  existing: StoredRecord[],
): string[] {
  const alive = new Set(rebuilt.map((candidate) => candidate.key));
  return existing.filter((record) => !alive.has(record.key)).map((record) => record.key);
}

/**
 * O que mudou de fato numa reconstrução: o que entra, o que muda de valor e o que sai.
 *
 * Diferente de `consolidateRecords`, aqui um valor MENOR também é uma mudança legítima — a
 * sessão que sustentava a marca deixou de existir.
 */
export function diffRebuild(
  rebuilt: RecordCandidate[],
  existing: StoredRecord[],
): {
  inserts: RecordCandidate[];
  updates: { candidate: RecordCandidate; previous: StoredRecord }[];
  removals: string[];
  unchanged: RecordCandidate[];
} {
  const byKey = new Map(existing.map((record) => [record.key, record]));
  const inserts: RecordCandidate[] = [];
  const updates: { candidate: RecordCandidate; previous: StoredRecord }[] = [];
  const unchanged: RecordCandidate[] = [];

  for (const candidate of rebuilt) {
    const current = byKey.get(candidate.key);
    if (!current) inserts.push(candidate);
    else if (current.value !== candidate.value || current.achievedOn !== candidate.achievedOn) {
      updates.push({ candidate, previous: current });
    } else unchanged.push(candidate);
  }

  return { inserts, updates, removals: staleRecordKeys(rebuilt, existing), unchanged };
}

/* ═══════════════════════════ Apresentação ═══════════════════════════ */

/** "100 kg", "12 repetições", "1 min 30 s", "3.000 m". Arredondar só aqui. */
export function formatRecordValue(value: number, unit: RecordUnit): string {
  const number = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 });
  switch (unit) {
    case "kg":
      return `${number.format(value)} kg`;
    case "reps":
      return `${number.format(value)} ${value === 1 ? "repetição" : "repetições"}`;
    case "segundos": {
      const total = Math.round(value);
      if (total < 60) return `${total} s`;
      const minutes = Math.floor(total / 60);
      const rest = total % 60;
      return rest === 0 ? `${minutes} min` : `${minutes} min ${rest} s`;
    }
    case "metros":
      return value >= 1000
        ? `${number.format(value / 1000)} km`
        : `${number.format(value)} m`;
    case "sessoes":
      return `${number.format(value)} ${value === 1 ? "treino" : "treinos"}`;
    default:
      return `${number.format(value)} ${value === 1 ? "semana" : "semanas"}`;
  }
}

/** "Superou os 95 kg de 02/02/2026" — a marca anterior sempre visível. */
export function previousMarkLabel(
  previousValue: number | null,
  previousAchievedOn: string | null,
  unit: RecordUnit,
): string | null {
  if (previousValue === null || !isDateIso(previousAchievedOn ?? "")) return null;
  const [year, month, day] = (previousAchievedOn as string).split("-");
  return `Superou ${formatRecordValue(previousValue, unit)} de ${day}/${month}/${year}`;
}

/** Rótulo do tipo, já contando a carga de referência quando existe. */
export function recordTypeLabel(type: RecordType, referenceWeightKg: number | null): string {
  if (type === "maior_reps_no_peso" && referenceWeightKg !== null) {
    return `Mais repetições com ${new Intl.NumberFormat("pt-BR", {
      maximumFractionDigits: 2,
    }).format(referenceWeightKg)} kg`;
  }
  return RECORD_TYPE_LABELS[type];
}

/** Conversor seguro banco → enum, no padrão do módulo. */
export const asRecordType = (value: string | null | undefined): RecordType =>
  RECORD_TYPES.includes(value as RecordType) ? (value as RecordType) : "maior_peso";

export const asRecordUnit = (value: string | null | undefined): RecordUnit =>
  (["kg", "reps", "segundos", "metros", "sessoes", "semanas"] as const).includes(
    value as RecordUnit,
  )
    ? (value as RecordUnit)
    : "kg";

/** O tipo de acompanhamento define quais recordes fazem sentido para o exercício. */
export function recordTypesForTracking(trackingType: TrackingType): RecordType[] {
  const spec = trackingSpec(trackingType);
  switch (spec.volumeUnit) {
    case "kg":
      return [
        "maior_peso",
        "maior_reps_no_peso",
        "melhor_volume_serie",
        "melhor_volume_sessao",
        "melhor_1rm_estimado",
      ];
    case "segundos":
      return ["maior_duracao"];
    case "distancia":
      return ["maior_distancia"];
    default:
      return [];
  }
}
