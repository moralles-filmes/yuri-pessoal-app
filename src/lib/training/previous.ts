/**
 * Fase 17-C — Treinos · Os valores da última vez (PURO, sem I/O, sem `Date.now()`).
 *
 * ═══════════════════ SUGESTÃO, NUNCA APLICAÇÃO AUTOMÁTICA ═══════════════════
 *
 * Este arquivo devolve o que o usuário FEZ da última vez. Ele nunca decide o que ele DEVE
 * fazer agora. A carga não muda sozinha: a preparação mostra o valor anterior ao lado do
 * planejado e o usuário aplica se quiser, com um toque.
 *
 * Sugerir progressão é trabalho da 17-D — e mesmo lá, com o usuário no comando. Aqui não há
 * fórmula, não há "+2,5 kg porque você fechou a faixa", não há recomendação.
 *
 * ═══════════════════ A FONTE É ESCOLHA DO USUÁRIO ═══════════════════
 *
 *   `qualquer_treino` → a última vez que fiz este exercício, em qualquer treino
 *   `mesmo_modelo`    → a última vez que fiz este exercício NESTE treino
 *
 * As duas respostas são legítimas e diferentes: quem faz supino no treino A e no C quer saber
 * de qual está falando. Não escolhemos por ele — a interface oferece as duas.
 *
 * ═══════════════════ SÓ SÉRIE FEITA CONTA ═══════════════════
 *
 * Série pulada, cancelada ou pendente não vira "última vez". Uma sessão abandonada no meio
 * entra com o que efetivamente foi registrado — o que aconteceu, aconteceu.
 */
import type { SessionSetStatus, TrackingType } from "./constants";
import { effectiveLoadKg, type EffectiveLoad } from "./tracking";
import { isSetDone } from "./session-machine";

/** Uma série já executada, vinda do histórico. Data pura para ordenar sem fuso. */
export type HistorySet = {
  sessionId: string;
  /** 'yyyy-MM-dd' — data pura, ordenável como texto. */
  sessionDate: string;
  /** Referência informativa do modelo daquela sessão. `null` em treino avulso/vazio. */
  workoutId: string | null;
  exerciseId: string | null;
  /** Identidade estável: o nome congelado casa mesmo se o exercício sumir do catálogo. */
  exerciseName: string;
  setNumber: number;
  status: SessionSetStatus;
  reps: number | null;
  weightKg: number | null;
  additionalWeightKg: number | null;
  assistanceWeightKg: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  rir: number | null;
  rpe: number | null;
  difficulty: string | null;
  restSeconds: number | null;
  isWarmup: boolean;
  /** Peso corporal daquela sessão, quando informado. Sem ele a carga efetiva é indisponível. */
  bodyWeightKg: number | null;
};

export type PreviousQuery = {
  exerciseId: string | null;
  exerciseName?: string;
  source: "qualquer_treino" | "mesmo_modelo";
  /** Obrigatório quando a fonte é `mesmo_modelo`. */
  workoutId?: string | null;
  /** A sessão atual nunca é a "última vez" dela mesma. */
  excludeSessionId?: string | null;
  /** Aquecimento não representa a carga de trabalho — fica de fora por padrão. */
  includeWarmup?: boolean;
};

export type PreviousPerformance = {
  sessionId: string;
  sessionDate: string;
  workoutId: string | null;
  /** As séries daquela sessão, na ordem, só as efetivamente feitas. */
  sets: HistorySet[];
  setCount: number;
  bodyWeightKg: number | null;
};

/* ───────────────────────────── Última execução ───────────────────────────── */

function matchesExercise(record: HistorySet, query: PreviousQuery): boolean {
  if (query.exerciseId && record.exerciseId) return record.exerciseId === query.exerciseId;
  // Sem id dos dois lados (exercício excluído do catálogo), o nome congelado é o que sobra.
  if (query.exerciseName) return record.exerciseName === query.exerciseName;
  return false;
}

/**
 * A última execução daquele exercício.
 *
 * `null` quando o exercício nunca foi feito — e a interface diz "primeira vez" em vez de
 * mostrar campos vazios com cara de zero.
 */
export function previousPerformance(
  history: HistorySet[],
  query: PreviousQuery,
): PreviousPerformance | null {
  const includeWarmup = query.includeWarmup ?? false;

  const candidates = history.filter((record) => {
    if (!isSetDone(record.status)) return false;
    if (!includeWarmup && record.isWarmup) return false;
    if (query.excludeSessionId && record.sessionId === query.excludeSessionId) return false;
    if (query.source === "mesmo_modelo") {
      // Sem modelo definido, "mesmo modelo" não tem resposta possível — e inventar uma seria
      // devolver a última vez em outro treino fingindo ser deste.
      if (!query.workoutId || record.workoutId !== query.workoutId) return false;
    }
    return matchesExercise(record, query);
  });

  if (candidates.length === 0) return null;

  // Mais recente primeiro: data pura ordena como texto; empate no mesmo dia usa o id da sessão
  // só para o resultado ser determinístico (duas sessões no mesmo dia são raras, mas existem).
  const bySession = new Map<string, HistorySet[]>();
  for (const record of candidates) {
    const list = bySession.get(record.sessionId) ?? [];
    list.push(record);
    bySession.set(record.sessionId, list);
  }

  const latest = [...bySession.entries()].sort(([idA, a], [idB, b]) => {
    const dateCompare = b[0].sessionDate.localeCompare(a[0].sessionDate);
    return dateCompare !== 0 ? dateCompare : idB.localeCompare(idA);
  })[0];

  const [sessionId, sets] = latest;
  const ordered = [...sets].sort((a, b) => a.setNumber - b.setNumber);

  return {
    sessionId,
    sessionDate: ordered[0].sessionDate,
    workoutId: ordered[0].workoutId,
    sets: ordered,
    setCount: ordered.length,
    bodyWeightKg: ordered[0].bodyWeightKg,
  };
}

/* ───────────────────────────── Melhor marca recente ───────────────────────────── */

export type BestSet = {
  set: HistorySet;
  /** A carga efetiva daquela série, se dava para calcular. */
  load: EffectiveLoad;
  sessionDate: string;
};

/**
 * A melhor série do período, pela carga efetiva.
 *
 * Empate de carga desempata por repetições; sem carga calculável (peso corporal sem peso
 * registrado, exercício de tempo), a série **não entra na disputa** em vez de entrar como zero.
 * Um agregado que ignora séries fica marcado como parcial — quem exibe precisa dizer isso.
 */
export function bestRecentSet(
  history: HistorySet[],
  query: PreviousQuery & { trackingType: TrackingType },
): { best: BestSet | null; isPartial: boolean; ignored: number } {
  const includeWarmup = query.includeWarmup ?? false;
  const candidates = history.filter(
    (record) =>
      isSetDone(record.status) &&
      (includeWarmup || !record.isWarmup) &&
      (!query.excludeSessionId || record.sessionId !== query.excludeSessionId) &&
      matchesExercise(record, query),
  );

  let best: BestSet | null = null;
  let ignored = 0;

  for (const record of candidates) {
    const load = effectiveLoadKg({
      trackingType: query.trackingType,
      weightKg: record.weightKg,
      additionalWeightKg: record.additionalWeightKg,
      assistanceWeightKg: record.assistanceWeightKg,
      bodyWeightKg: record.bodyWeightKg,
    });

    if (!load.ok) {
      ignored += 1;
      continue;
    }
    if (
      !best ||
      load.kg > (best.load.ok ? best.load.kg : -1) ||
      (best.load.ok && load.kg === best.load.kg && (record.reps ?? 0) > (best.set.reps ?? 0))
    ) {
      best = { set: record, load, sessionDate: record.sessionDate };
    }
  }

  return { best, isPartial: ignored > 0, ignored };
}

/* ───────────────────────────── Sugestão ─────────────────────────────
 * O que a interface OFERECE. Nada é aplicado sem toque do usuário.
 */

export type PreviousSuggestion = {
  setNumber: number;
  weightKg: number | null;
  additionalWeightKg: number | null;
  assistanceWeightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  distanceM: number | null;
  rir: number | null;
  rpe: number | null;
  /** De qual série da última vez esta sugestão veio. */
  fromSessionDate: string;
};

/**
 * Sugestões série a série a partir da última execução.
 *
 * Quando a sessão de hoje tem MAIS séries que a última vez, as sobrando repetem a última série
 * conhecida — é o comportamento que o usuário espera ao adicionar uma 4ª série a um exercício
 * que fazia 3. Quando tem MENOS, as extras simplesmente não aparecem.
 */
export function suggestFromPrevious(
  previous: PreviousPerformance | null,
  setCount: number,
): PreviousSuggestion[] {
  if (!previous || previous.sets.length === 0 || setCount <= 0) return [];

  return Array.from({ length: setCount }, (_, index) => {
    const source = previous.sets[Math.min(index, previous.sets.length - 1)];
    return {
      setNumber: index + 1,
      weightKg: source.weightKg,
      additionalWeightKg: source.additionalWeightKg,
      assistanceWeightKg: source.assistanceWeightKg,
      reps: source.reps,
      durationSeconds: source.durationSeconds,
      distanceM: source.distanceM,
      rir: source.rir,
      rpe: source.rpe,
      fromSessionDate: source.sessionDate,
    };
  });
}

/* ───────────────────────────── Comparação ───────────────────────────── */

export type PreviousComparison = {
  /** `null` quando não dá para comparar (faltou o valor de um dos lados). */
  weightDeltaKg: number | null;
  repsDelta: number | null;
  durationDeltaSeconds: number | null;
  /** "Igual", "acima" ou "abaixo" — descrição do fato, sem julgamento nem incentivo. */
  direction: "acima" | "igual" | "abaixo" | "indisponivel";
};

const delta = (current: number | null, before: number | null): number | null =>
  current === null || before === null ? null : Number((current - before).toFixed(3));

/**
 * Compara uma série de hoje com a mesma série da última vez.
 *
 * A direção descreve o FATO ("acima do da última vez"). Nenhuma mensagem daqui parabeniza,
 * cobra ou sugere subir carga — a 17-C não faz prescrição.
 */
export function compareToPrevious(
  current: { weightKg: number | null; reps: number | null; durationSeconds: number | null },
  before: { weightKg: number | null; reps: number | null; durationSeconds: number | null } | null,
): PreviousComparison {
  if (!before) {
    return {
      weightDeltaKg: null,
      repsDelta: null,
      durationDeltaSeconds: null,
      direction: "indisponivel",
    };
  }

  const weightDeltaKg = delta(current.weightKg, before.weightKg);
  const repsDelta = delta(current.reps, before.reps);
  const durationDeltaSeconds = delta(current.durationSeconds, before.durationSeconds);

  const reference = weightDeltaKg ?? repsDelta ?? durationDeltaSeconds;
  const direction =
    reference === null ? "indisponivel" : reference > 0 ? "acima" : reference < 0 ? "abaixo" : "igual";

  return { weightDeltaKg, repsDelta, durationDeltaSeconds, direction };
}
