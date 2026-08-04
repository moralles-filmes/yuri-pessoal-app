/**
 * Fase 17-D — Treinos · Sincronização de recordes e sugestões (server-only, I/O).
 *
 * A DECISÃO fica toda em `records.ts` e `progression.ts` (puros e testados). Aqui só existe o
 * que precisa de banco: ler o histórico, comparar com o que está gravado e aplicar a diferença.
 *
 * ═══════════════════════ POR QUE RECONSTRUIR EM VEZ DE "IR SOMANDO" ═══════════════════════
 *
 * Um recorde não é um contador: ele é o melhor de um histórico que pode ENCOLHER (o usuário
 * exclui uma sessão, desfaz uma série, corrige um peso digitado errado). Tentar desfazer um
 * recorde pontualmente exigiria saber o que ele superou, e o que aquilo superou, e assim por
 * diante. Reconstruir do histórico é mais simples e não tem estado intermediário para
 * dessincronizar — é o mesmo motivo pelo qual volume e 1RM não são materializados.
 *
 * A operação é **idempotente**: rodar duas vezes seguidas não muda nada na segunda.
 */
import "server-only";
import { hojeISO } from "@/lib/format";
import type { AuthContext } from "@/lib/actions/helpers";
import { getSessionHistory } from "./history-queries";
import { getTrainingPreferences } from "./queries";
import { resolveIncrementKg } from "./tracking";
import { diffRebuild, rebuildRecords, type RecordCandidate, type StoredRecord } from "./records";
import {
  evaluateProgression,
  progressionDedupeKey,
  resolveRule,
  type ProgressionIncrementMode,
  type ProgressionRule,
  type ProgressionScope,
  type ProgressionSession,
} from "./progression";
import { asDifficultyLevel } from "./constants";
import type { HistoryItem } from "./history";

const HISTORY_DAYS = 3650;

/* ═══════════════════════════ Recordes ═══════════════════════════ */

export type RecordSyncResult = {
  created: number;
  improved: number;
  removed: number;
  /** Os recordes novos ou superados — a 17-F usa isto para notificar (uma vez só). */
  highlights: RecordCandidate[];
};

/**
 * Recalcula os recordes a partir do histórico inteiro.
 *
 * Chamada ao finalizar uma sessão **e** depois de excluir uma. Nos dois casos o caminho é o
 * mesmo: nenhum código especial de "desfazer recorde".
 */
export async function syncPersonalRecords(ctx: AuthContext): Promise<RecordSyncResult> {
  const [history, preferences] = await Promise.all([
    getSessionHistory({ days: HISTORY_DAYS }),
    getTrainingPreferences(),
  ]);

  const rebuilt = rebuildRecords(history, {
    oneRmFormula: preferences.oneRmFormula,
    unilateralRule: preferences.unilateralVolumeRule,
    weekStartsOn: preferences.weekStartsOn,
  });

  const { data: existingRows } = await ctx.supabase
    .from("training_personal_records")
    .select("id,record_key,record_type,value,achieved_on,previous_value,previous_achieved_on")
    .eq("user_id", ctx.userId);

  const existing: (StoredRecord & { id: string })[] = (existingRows ?? []).map((row) => ({
    id: row.id,
    key: row.record_key,
    recordType: row.record_type as StoredRecord["recordType"],
    value: Number(row.value),
    achievedOn: row.achieved_on,
    previousValue: row.previous_value === null ? null : Number(row.previous_value),
    previousAchievedOn: row.previous_achieved_on,
  }));

  const diff = diffRebuild(rebuilt, existing);
  const byKey = new Map(existing.map((record) => [record.key, record]));

  const rowFor = (candidate: RecordCandidate, previous: StoredRecord | null) => {
    // Quando o valor SOBE, a marca superada vira `previous`. Quando CAI (a sessão que
    // sustentava o recorde deixou de existir), não há marca anterior a exibir — gravar a
    // antiga afirmaria um recorde que o histórico já não sustenta.
    let previousValue: number | null = null;
    let previousAchievedOn: string | null = null;

    if (previous) {
      if (candidate.value > previous.value) {
        previousValue = previous.value;
        previousAchievedOn = previous.achievedOn;
      } else if (previous.previousValue !== null && previous.previousValue <= candidate.value) {
        previousValue = previous.previousValue;
        previousAchievedOn = previous.previousAchievedOn;
      }
    }

    return {
      user_id: ctx.userId,
      exercise_id: candidate.exerciseId,
      exercise_name_snapshot: candidate.exerciseName,
      scope: candidate.scope,
      record_type: candidate.recordType,
      record_key: candidate.key,
      value: candidate.value,
      unit: candidate.unit,
      reference_weight_kg: candidate.referenceWeightKg,
      reps: candidate.reps,
      weight_kg: candidate.weightKg,
      one_rm_formula: candidate.oneRmFormula,
      achieved_on: candidate.achievedOn,
      session_id: candidate.sessionId,
      session_set_id: candidate.sessionSetId,
      previous_value: previousValue,
      previous_achieved_on: previousAchievedOn,
    };
  };

  if (diff.inserts.length > 0) {
    await ctx.supabase
      .from("training_personal_records")
      .insert(diff.inserts.map((candidate) => rowFor(candidate, null)));
  }

  for (const update of diff.updates) {
    const current = byKey.get(update.candidate.key);
    if (!current) continue;
    await ctx.supabase
      .from("training_personal_records")
      .update(rowFor(update.candidate, update.previous))
      .eq("id", current.id)
      .eq("user_id", ctx.userId);
  }

  if (diff.removals.length > 0) {
    await ctx.supabase
      .from("training_personal_records")
      .delete()
      .eq("user_id", ctx.userId)
      .in("record_key", diff.removals);
  }

  const improved = diff.updates.filter(
    (update) => update.candidate.value > update.previous.value,
  );

  return {
    created: diff.inserts.length,
    improved: improved.length,
    removed: diff.removals.length,
    highlights: [...diff.inserts, ...improved.map((update) => update.candidate)],
  };
}

/* ═══════════════════════════ Sugestões de progressão ═══════════════════════════ */

export type SuggestionSyncResult = {
  created: number;
  skipped: number;
  /** Motivo do "nada gerado", quando é um bloqueio global (recurso desligado, sem regra). */
  note: string | null;
};

type CatalogInfo = {
  muscleGroupId: string | null;
  incrementKg: number;
};

/**
 * Gera sugestões pendentes a partir das regras do usuário.
 *
 * Três garantias que vêm de graça por delegar a decisão ao puro:
 *  • progressão desligada → nada acontece;
 *  • dor registrada nas sessões avaliadas → nada é sugerido para aquele exercício;
 *  • proposta já pendente ou já ignorada → não é recriada (índice único PARCIAL; por isso a
 *    gravação é select-then-insert, nunca `ON CONFLICT` — ele não infere índice parcial).
 */
export async function syncProgressionSuggestions(
  ctx: AuthContext,
  options: { exerciseId?: string | null } = {},
): Promise<SuggestionSyncResult> {
  const preferences = await getTrainingPreferences();
  if (!preferences.progressionEnabled) {
    return {
      created: 0,
      skipped: 0,
      note: "As sugestões de progressão estão desligadas nas configurações do módulo.",
    };
  }

  const { data: ruleRows } = await ctx.supabase
    .from("training_progression_rules")
    .select(
      "id,name,scope,exercise_id,muscle_group_id,min_sessions,require_top_of_range,require_all_working_sets,require_no_failure,max_rir,max_rpe,max_difficulty,increment_mode,increment_kg,increment_percent,is_active",
    )
    .eq("user_id", ctx.userId);

  const rules: ProgressionRule[] = (ruleRows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    scope: row.scope as ProgressionScope,
    exerciseId: row.exercise_id,
    muscleGroupId: row.muscle_group_id,
    minSessions: row.min_sessions,
    requireTopOfRange: row.require_top_of_range,
    requireAllWorkingSets: row.require_all_working_sets,
    requireNoFailure: row.require_no_failure,
    maxRir: row.max_rir,
    maxRpe: row.max_rpe === null ? null : Number(row.max_rpe),
    maxDifficulty: asDifficultyLevel(row.max_difficulty),
    incrementMode: row.increment_mode as ProgressionIncrementMode,
    incrementKg: row.increment_kg === null ? null : Number(row.increment_kg),
    incrementPercent: row.increment_percent === null ? null : Number(row.increment_percent),
    isActive: row.is_active,
  }));

  if (rules.length === 0) {
    return {
      created: 0,
      skipped: 0,
      note: "Nenhuma regra de progressão cadastrada. Crie uma regra para receber sugestões.",
    };
  }

  // 180 dias bastam para avaliar "as últimas N sessões" sem carregar o histórico inteiro.
  const history = await getSessionHistory({ days: 180 });
  if (history.length === 0) return { created: 0, skipped: 0, note: null };

  const byExercise = groupExerciseSessions(history, options.exerciseId ?? null);
  if (byExercise.size === 0) return { created: 0, skipped: 0, note: null };

  const catalog = await loadCatalogInfo(ctx, [...byExercise.keys()], preferences.defaultIncrementKg);

  const { data: liveRows } = await ctx.supabase
    .from("training_progression_suggestions")
    .select("dedupe_key")
    .eq("user_id", ctx.userId)
    .in("status", ["pendente", "ignorada"]);

  const alive = new Set((liveRows ?? []).map((row) => row.dedupe_key));
  const hoje = hojeISO();

  let created = 0;
  let skipped = 0;

  for (const [exerciseId, entry] of byExercise) {
    const info = catalog.get(exerciseId) ?? {
      muscleGroupId: null,
      incrementKg: preferences.defaultIncrementKg,
    };

    const rule = resolveRule(rules, { exerciseId, muscleGroupId: info.muscleGroupId });

    const evaluation = evaluateProgression({
      rule,
      enabled: true,
      target: {
        exerciseId,
        exerciseName: entry.exerciseName,
        trackingType: entry.trackingType,
        incrementKg: info.incrementKg,
        workoutId: entry.workoutId,
        workoutName: entry.workoutName,
        workoutExerciseId: entry.workoutExerciseId,
      },
      sessions: entry.sessions,
    });

    if (!evaluation.suggest) {
      skipped += 1;
      continue;
    }

    const suggestion = evaluation.suggestion;
    const dedupeKey = progressionDedupeKey({
      exerciseId: suggestion.exerciseId,
      exerciseName: suggestion.exerciseName,
      kind: suggestion.kind,
      previousValue: suggestion.previousValue,
      suggestedValue: suggestion.suggestedValue,
    });

    // Select-then-insert: o índice de deduplicação é PARCIAL e `ON CONFLICT` não o infere.
    if (alive.has(dedupeKey)) {
      skipped += 1;
      continue;
    }

    const { error } = await ctx.supabase.from("training_progression_suggestions").insert({
      user_id: ctx.userId,
      rule_id: suggestion.ruleId,
      exercise_id: suggestion.exerciseId,
      exercise_name_snapshot: suggestion.exerciseName,
      workout_id: suggestion.workoutId,
      workout_exercise_id: suggestion.workoutExerciseId,
      workout_name_snapshot: suggestion.workoutName,
      kind: suggestion.kind,
      previous_value: suggestion.previousValue,
      suggested_value: suggestion.suggestedValue,
      unit: suggestion.unit,
      reason: suggestion.reason,
      basis: suggestion.basis,
      dedupe_key: dedupeKey,
      suggested_on: hoje,
    });

    if (error) {
      skipped += 1;
      continue;
    }
    alive.add(dedupeKey);
    created += 1;
  }

  return { created, skipped, note: null };
}

type ExerciseEntry = {
  exerciseName: string;
  trackingType: ProgressionEntryTracking;
  workoutId: string | null;
  workoutName: string | null;
  workoutExerciseId: string | null;
  sessions: ProgressionSession[];
};

type ProgressionEntryTracking = Parameters<typeof evaluateProgression>[0]["target"]["trackingType"];

/** Agrupa o histórico por exercício, no formato que `progression.ts` avalia. */
function groupExerciseSessions(
  history: HistoryItem[],
  onlyExerciseId: string | null,
): Map<string, ExerciseEntry> {
  const byExercise = new Map<string, ExerciseEntry>();

  for (const item of history) {
    for (const exercise of item.exercises) {
      if (!exercise.exerciseId) continue;
      if (onlyExerciseId && exercise.exerciseId !== onlyExerciseId) continue;

      const entry = byExercise.get(exercise.exerciseId) ?? {
        exerciseName: exercise.exerciseName,
        trackingType: exercise.trackingType,
        workoutId: item.workoutId,
        workoutName: item.workoutName,
        workoutExerciseId: null,
        sessions: [],
      };

      entry.sessions.push({
        sessionId: item.id,
        sessionDate: item.sessionDate,
        feltPain: item.feltPain,
        sets: exercise.sets.map((set) => {
          const extended = set as typeof set & {
            rir?: number | null;
            rpe?: number | null;
            difficulty?: string | null;
            plannedRepsMin?: number | null;
            plannedRepsMax?: number | null;
            plannedWeightKg?: number | null;
          };
          return {
            setNumber: set.setNumber,
            status: set.status,
            isWarmup: set.isWarmup,
            reps: set.reps,
            weightKg: set.weightKg,
            plannedRepsMax: extended.plannedRepsMax ?? null,
            plannedRepsMin: extended.plannedRepsMin ?? null,
            plannedWeightKg: extended.plannedWeightKg ?? null,
            rir: extended.rir ?? null,
            rpe: extended.rpe ?? null,
            difficulty: asDifficultyLevel(extended.difficulty ?? null),
          };
        }),
      });

      byExercise.set(exercise.exerciseId, entry);
    }
  }

  return byExercise;
}

/**
 * Grupo muscular e incremento realizável de cada exercício.
 *
 * ⚠️ Esta é a única leitura do catálogo em todo o fluxo — e ela decide o FUTURO (qual regra se
 * aplica, qual o menor salto possível), não renderiza o passado. O histórico continua saindo só
 * do snapshot.
 */
async function loadCatalogInfo(
  ctx: AuthContext,
  exerciseIds: string[],
  defaultIncrementKg: number,
): Promise<Map<string, CatalogInfo>> {
  const result = new Map<string, CatalogInfo>();
  if (exerciseIds.length === 0) return result;

  const [exercisesRes, prefsRes, equipmentRes] = await Promise.all([
    ctx.supabase
      .from("training_exercises")
      .select("id,primary_muscle_group_id,default_increment_kg,equipment_id")
      .in("id", exerciseIds),
    ctx.supabase
      .from("training_exercise_prefs")
      .select("exercise_id,custom_increment_kg")
      .eq("user_id", ctx.userId)
      .in("exercise_id", exerciseIds),
    ctx.supabase.from("training_equipment").select("id,default_increment_kg"),
  ]);

  const prefByExercise = new Map(
    (prefsRes.data ?? []).map((row) => [row.exercise_id, row.custom_increment_kg]),
  );
  const equipmentIncrement = new Map(
    (equipmentRes.data ?? []).map((row) => [row.id, row.default_increment_kg]),
  );

  for (const row of exercisesRes.data ?? []) {
    const toNumber = (value: unknown): number | null => {
      if (value === null || value === undefined) return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    result.set(row.id, {
      muscleGroupId: row.primary_muscle_group_id,
      incrementKg: resolveIncrementKg({
        prefIncrementKg: toNumber(prefByExercise.get(row.id)),
        exerciseIncrementKg: toNumber(row.default_increment_kg),
        equipmentIncrementKg: row.equipment_id
          ? toNumber(equipmentIncrement.get(row.equipment_id))
          : null,
        defaultIncrementKg,
      }),
    });
  }

  return result;
}

/** O `workout_exercise_id` mais recente daquele exercício — o alvo de "aceitar a sugestão". */
export async function findWorkoutExerciseTarget(
  ctx: AuthContext,
  exerciseId: string,
): Promise<{ workoutExerciseId: string; workoutId: string; workoutName: string } | null> {
  const { data } = await ctx.supabase
    .from("training_workout_exercises")
    .select("id,workout_id,workout:training_workouts!inner(id,name,status,archived_at)")
    .eq("user_id", ctx.userId)
    .eq("exercise_id", exerciseId)
    .limit(20);

  for (const row of data ?? []) {
    const workout = row.workout as
      | { id: string; name: string; status: string; archived_at: string | null }
      | { id: string; name: string; status: string; archived_at: string | null }[]
      | null;
    const item = Array.isArray(workout) ? workout[0] : workout;
    if (!item || item.archived_at || item.status === "arquivado") continue;
    return { workoutExerciseId: row.id, workoutId: item.id, workoutName: item.name };
  }

  return null;
}
