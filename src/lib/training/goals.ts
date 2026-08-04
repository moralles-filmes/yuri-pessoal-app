/**
 * Fase 17-E — Treinos · METAS (PURO, sem I/O, sem `Date.now()`).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ AS QUATRO REGRAS QUE ESTE ARQUIVO EXISTE PARA GARANTIR                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * 1. **ESTE ARQUIVO NÃO CALCULA VOLUME.** Nem séries, nem repetições, nem frequência. Ele
 *    RECEBE os agregados já prontos de `metrics.ts` (17-D) e escolhe qual número responde
 *    àquela meta. Refazer a conta aqui faria a meta discordar do histórico na primeira
 *    diferença de arredondamento — e o usuário veria dois números para a mesma semana.
 *
 * 2. **STATUS É DERIVADO NA LEITURA.** `atingida`, `expirada` e `em_atraso` nascem de valor
 *    atual × alvo × prazo, com `hoje` INJETADO. Só o que o usuário decide (`planejada`,
 *    `ativa`, `pausada`, `concluida`, `cancelada`) é gravado — o CHECK da migration nem
 *    aceita os derivados. Mesma disciplina de `atrasada` no TO-DO e de `atrasado` no
 *    planejamento (17-B).
 *
 * 3. **AUSÊNCIA DE DADO NÃO É ZERO.** Sem medição corporal, sem execução do exercício ou sem
 *    tipo de medida (o usuário excluiu na Dieta), o valor atual é `null` e a tela escreve o
 *    motivo. "Nunca mediu" e "mediu e deu zero" são coisas diferentes. Já um período de
 *    frequência sem nenhum treino É zero medido — e aí o zero é fato, não buraco.
 *
 * 4. **NADA AQUI SUGERE NADA.** Sem alvo recomendado, sem carga máxima, sem "peso ideal",
 *    sem juízo sobre a direção escolhida. As funções comparam número com alvo no sentido que
 *    o usuário pediu; o significado é dele.
 */
import { addDaysIso, addMonthsIso, diffDaysIso, endOfMonthIso, isDateIso, startOfMonthIso, startOfWeekIso } from "./schedule";
import type { MetricQuality, PeriodMetrics, FrequencyMetrics } from "./metrics";

/* ═══════════════════════════ Vocabulário ═══════════════════════════
 * Mora aqui, e não em `constants.ts`, porque `TRAINING_GOALS` já existe lá com outro sentido
 * (o OBJETIVO organizacional de um programa: hipertrofia, força…). Duas listas com o mesmo
 * nome no mesmo arquivo seria pedir para alguém importar a errada.
 */

export const GOAL_KINDS = [
  "frequencia",
  "desempenho",
  "corporal",
  "organizacao",
  "personalizada",
] as const;
export type GoalKind = (typeof GOAL_KINDS)[number];

export const GOAL_KIND_LABELS: Record<GoalKind, string> = {
  frequencia: "Frequência",
  desempenho: "Desempenho",
  corporal: "Corporal",
  organizacao: "Organização",
  personalizada: "Personalizada",
};

export const GOAL_KIND_HINTS: Record<GoalKind, string> = {
  frequencia: "Quantas vezes você treina — por semana, por mês ou no ano.",
  desempenho: "Carga, repetições, 1RM estimado, volume ou tempo num exercício ou no geral.",
  corporal: "Peso, percentual de gordura e medidas — lidos do módulo de medidas corporais.",
  organizacao: "Cumprir o planejamento, concluir sessões ou trabalhar um grupo muscular.",
  personalizada: "Você define o nome, a unidade, a partida e o alvo. O valor é registrado à mão.",
};

export const GOAL_METRICS = [
  "treinos_por_semana",
  "treinos_por_mes",
  "treinos_por_ano",
  "dias_ativos",
  "semanas_consecutivas",
  "peso_exercicio",
  "reps_exercicio",
  "um_rm_estimado",
  "volume_total",
  "series_por_semana",
  "tempo_total",
  "medida_corporal",
  "sessoes_concluidas",
  "aderencia_planejamento",
  "series_grupo_muscular",
  "personalizada",
] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const GOAL_METRIC_LABELS: Record<GoalMetric, string> = {
  treinos_por_semana: "Treinos por semana",
  treinos_por_mes: "Treinos por mês",
  treinos_por_ano: "Treinos no ano",
  dias_ativos: "Dias ativos",
  semanas_consecutivas: "Semanas consecutivas treinando",
  peso_exercicio: "Carga num exercício",
  reps_exercicio: "Repetições num exercício",
  um_rm_estimado: "1RM estimado",
  volume_total: "Volume total",
  series_por_semana: "Séries por semana",
  tempo_total: "Tempo treinado",
  medida_corporal: "Medida corporal",
  sessoes_concluidas: "Sessões concluídas",
  aderencia_planejamento: "Aderência ao planejamento",
  series_grupo_muscular: "Séries num grupo muscular",
  personalizada: "Valor que eu registro",
};

/** Unidade sugerida ao criar a meta. O usuário pode trocar — é o rótulo do número dele. */
export const GOAL_METRIC_UNITS: Record<GoalMetric, string> = {
  treinos_por_semana: "treinos",
  treinos_por_mes: "treinos",
  treinos_por_ano: "treinos",
  dias_ativos: "dias",
  semanas_consecutivas: "semanas",
  peso_exercicio: "kg",
  reps_exercicio: "reps",
  um_rm_estimado: "kg",
  volume_total: "kg",
  series_por_semana: "séries",
  tempo_total: "min",
  medida_corporal: "",
  sessoes_concluidas: "sessões",
  aderencia_planejamento: "%",
  series_grupo_muscular: "séries",
  personalizada: "",
};

export const METRICS_BY_KIND: Record<GoalKind, readonly GoalMetric[]> = {
  frequencia: [
    "treinos_por_semana",
    "treinos_por_mes",
    "treinos_por_ano",
    "dias_ativos",
    "semanas_consecutivas",
  ],
  desempenho: [
    "peso_exercicio",
    "reps_exercicio",
    "um_rm_estimado",
    "volume_total",
    "series_por_semana",
    "tempo_total",
  ],
  corporal: ["medida_corporal"],
  organizacao: ["sessoes_concluidas", "aderencia_planejamento", "series_grupo_muscular"],
  personalizada: ["personalizada"],
};

/** A família a que uma métrica pertence — a matriz inversa, sem segunda tabela para divergir. */
export const GOAL_METRIC_KIND: Record<GoalMetric, GoalKind> = Object.fromEntries(
  GOAL_KINDS.flatMap((kind) => METRICS_BY_KIND[kind].map((metric) => [metric, kind])),
) as Record<GoalMetric, GoalKind>;

/** Métricas que exigem um exercício escolhido — sem ele não há o que medir. */
export const METRICS_REQUIRING_EXERCISE: readonly GoalMetric[] = [
  "peso_exercicio",
  "reps_exercicio",
  "um_rm_estimado",
];

export const GOAL_PERIODS = [
  "semanal",
  "mensal",
  "trimestral",
  "semestral",
  "anual",
  "personalizado",
] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

export const GOAL_PERIOD_LABELS: Record<GoalPeriod, string> = {
  semanal: "Semanal",
  mensal: "Mensal",
  trimestral: "Trimestral",
  semestral: "Semestral",
  anual: "Anual",
  personalizado: "Período personalizado",
};

export const GOAL_DIRECTIONS = ["aumentar", "reduzir", "manter"] as const;
export type GoalDirection = (typeof GOAL_DIRECTIONS)[number];

export const GOAL_DIRECTION_LABELS: Record<GoalDirection, string> = {
  aumentar: "Aumentar até o alvo",
  reduzir: "Reduzir até o alvo",
  manter: "Manter perto do alvo",
};

/** Status GRAVADO — só decisão do usuário. Ver o bloco 2 no topo do arquivo. */
export const GOAL_STATUSES = ["planejada", "ativa", "pausada", "concluida", "cancelada"] as const;
export type GoalStatus = (typeof GOAL_STATUSES)[number];

/** Status APRESENTADO: o gravado + os três derivados. */
export const DERIVED_GOAL_STATUSES = [
  ...GOAL_STATUSES,
  "atingida",
  "expirada",
  "em_atraso",
] as const;
export type DerivedGoalStatus = (typeof DERIVED_GOAL_STATUSES)[number];

export const GOAL_STATUS_LABELS: Record<DerivedGoalStatus, string> = {
  planejada: "Planejada",
  ativa: "Em andamento",
  pausada: "Pausada",
  concluida: "Concluída",
  cancelada: "Cancelada",
  atingida: "Alvo alcançado",
  expirada: "Prazo encerrado",
  // Descritivo, não acusatório: informa o ritmo, não cobra o usuário.
  em_atraso: "Atrás do ritmo previsto",
};

export const GOAL_PROGRESS_KINDS = [
  "registro",
  "alteracao_meta",
  "mudanca_status",
  "marco_atingido",
] as const;
export type GoalProgressKind = (typeof GOAL_PROGRESS_KINDS)[number];

export const GOAL_PROGRESS_KIND_LABELS: Record<GoalProgressKind, string> = {
  registro: "Progresso registrado",
  alteracao_meta: "Meta alterada",
  mudanca_status: "Situação alterada",
  marco_atingido: "Marco alcançado",
};

const asEnum =
  <T extends string>(values: readonly T[], fallback: T) =>
  (value: string | null | undefined): T =>
    values.includes(value as T) ? (value as T) : fallback;

export const asGoalKind = asEnum(GOAL_KINDS, "personalizada");
export const asGoalMetric = asEnum(GOAL_METRICS, "personalizada");
export const asGoalPeriod = asEnum(GOAL_PERIODS, "mensal");
export const asGoalDirection = asEnum(GOAL_DIRECTIONS, "aumentar");
export const asGoalStatus = asEnum(GOAL_STATUSES, "planejada");
export const asGoalProgressKind = asEnum(GOAL_PROGRESS_KINDS, "registro");

/* ═══════════════════════════ Tipos de domínio ═══════════════════════════ */

/** Marco intermediário. É CONFIGURAÇÃO da meta (jsonb), não histórico. */
export type GoalMilestone = {
  value: number;
  label: string | null;
  /** Prazo do marco. `null` = sem prazo próprio. */
  dueOn: string | null;
};

export type TrainingGoal = {
  id: string;
  name: string;
  description: string | null;
  kind: GoalKind;
  metric: GoalMetric;
  exerciseId: string | null;
  muscleGroupId: string | null;
  programId: string | null;
  bodyMeasurementTypeId: string | null;
  direction: GoalDirection;
  period: GoalPeriod;
  startsOn: string;
  endsOn: string | null;
  /** `null` = use o primeiro valor observado. NUNCA zero. */
  startValue: number | null;
  targetValue: number;
  unit: string;
  milestones: GoalMilestone[];
  status: GoalStatus;
  notes: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type GoalProgressEntry = {
  id: string;
  goalId: string;
  entryKind: GoalProgressKind;
  recordedOn: string;
  value: number | null;
  field: string | null;
  previousText: string | null;
  newText: string | null;
  previousValue: number | null;
  newValue: number | null;
  source: "automatico" | "manual" | "sistema";
  note: string | null;
  createdAt: string;
};

/* ═══════════════════════════ Janela do período ═══════════════════════════ */

export type GoalRange = { from: string; to: string; label: string };

const MONTH_NAMES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

const brDay = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const monthLabel = (iso: string): string =>
  `${MONTH_NAMES[Number(iso.slice(5, 7)) - 1] ?? iso.slice(5, 7)} de ${iso.slice(0, 4)}`;

/**
 * Quantos meses cada período recorrente cobre. `null` = não é bloco de meses.
 *
 * Trimestral, semestral e anual são BLOCOS ANCORADOS EM `starts_on`, não no calendário: uma
 * meta que começou em março fecha o trimestre no fim de maio, e não no fim de março só porque
 * o primeiro trimestre do ano terminou ali.
 */
const BLOCK_MONTHS: Partial<Record<GoalPeriod, number>> = {
  trimestral: 3,
  semestral: 6,
  anual: 12,
};

/**
 * A janela que está valendo AGORA para a meta.
 *
 * • `semanal` e `mensal` acompanham o CALENDÁRIO (a semana e o mês de `hoje`) — é o que as
 *   palavras "treinos por semana" e "treinos por mês" significam para quem lê.
 * • `trimestral`, `semestral` e `anual` são blocos contados a partir de `starts_on`.
 * • `personalizado` é literalmente `starts_on` → `ends_on`.
 *
 * Em todos os casos a janela é PRESA a [`starts_on`, `ends_on`]: nenhuma meta conta um treino
 * feito antes de ela existir, e nenhuma conta depois do prazo.
 *
 * @param hoje 'yyyy-MM-dd' INJETADO.
 */
export function goalPeriodRange(
  goal: Pick<TrainingGoal, "period" | "startsOn" | "endsOn">,
  hoje: string,
  weekStartsOn = 1,
): GoalRange {
  const start = isDateIso(goal.startsOn) ? goal.startsOn : hoje;
  const hardEnd = goal.endsOn && isDateIso(goal.endsOn) ? goal.endsOn : null;
  // Antes de a meta começar, a janela mostrada é a PRIMEIRA — não uma janela vazia no passado.
  const reference = isDateIso(hoje) && hoje > start ? hoje : start;

  const clamp = (from: string, to: string, label: string): GoalRange => ({
    from: from < start ? start : from,
    to: hardEnd !== null && to > hardEnd ? hardEnd : to,
    label,
  });

  if (goal.period === "personalizado") {
    const to = hardEnd ?? reference;
    return { from: start, to, label: `${brDay(start)} a ${brDay(to)}` };
  }

  if (goal.period === "semanal") {
    const from = startOfWeekIso(reference, weekStartsOn);
    const to = addDaysIso(from, 6);
    return clamp(from, to, `semana de ${brDay(from)} a ${brDay(to)}`);
  }

  if (goal.period === "mensal") {
    const from = startOfMonthIso(reference);
    return clamp(from, endOfMonthIso(reference), monthLabel(from));
  }

  const months = BLOCK_MONTHS[goal.period] ?? 12;
  // Quantos blocos inteiros couberam entre o início e a referência.
  let from = start;
  let guard = 0;
  while (guard < 200) {
    const next = addMonthsIso(from, months);
    if (next > reference) break;
    from = next;
    guard += 1;
  }
  const to = addDaysIso(addMonthsIso(from, months), -1);
  return clamp(from, to, `${brDay(from)} a ${brDay(to)}`);
}

/** A meta já começou e ainda não passou do prazo, na data dada? */
export function isGoalInWindow(
  goal: Pick<TrainingGoal, "startsOn" | "endsOn">,
  date: string,
): boolean {
  if (date < goal.startsOn) return false;
  return goal.endsOn === null || date <= goal.endsOn;
}

/* ═══════════════════════════ Valor atual ═══════════════════════════ */

/**
 * Tudo que uma meta pode precisar ler — JÁ CALCULADO em outro lugar.
 *
 * `period` e `frequency` vêm de `aggregateSessions` / `frequencyMetrics` (`metrics.ts`),
 * recortados na janela da meta. As melhores marcas vêm de `records.ts`. O valor corporal vem
 * de `src/lib/body/`. NADA é recalculado aqui — este arquivo só escolhe o número certo.
 */
export type GoalValueSources = {
  period: PeriodMetrics;
  frequency: FrequencyMetrics;
  /** Semanas completas (ou fração) da janela — divide "séries por semana". Mínimo 1. */
  weeksInRange?: number;
  /** Melhor marca do exercício da meta na janela. `null` = não executou. */
  bestWeightKg?: number | null;
  bestReps?: number | null;
  bestOneRmKg?: number | null;
  /** Séries do grupo muscular escolhido — vem de `period.setsByMuscleGroup`. */
  muscleGroupSets?: number | null;
  /** Medição corporal vigente na janela. `null` = não mediu. */
  bodyValue?: number | null;
  /** O tipo de medida foi excluído na Dieta? Então a meta não tem de onde ler. */
  bodyTypeMissing?: boolean;
  /** Aderência ao planejamento (0–100). `null` = nada planejado no período. */
  adherencePercent?: number | null;
  /** Último valor que o usuário registrou à mão (meta personalizada). */
  manualValue?: number | null;
};

export type GoalValue = {
  /** `null` = INDISPONÍVEL. Nunca zero por falta de dado. */
  value: number | null;
  quality: MetricQuality;
  /** Por que está indisponível ou parcial. Vazio quando o número é exato. */
  reason: string;
};

const available = (value: number, quality: MetricQuality = "exato", reason = ""): GoalValue => ({
  value,
  quality,
  reason,
});

const unavailable = (reason: string): GoalValue => ({ value: null, quality: "parcial", reason });

/**
 * O valor atual da meta, a partir dos agregados prontos.
 *
 * A distinção que importa: um período de frequência **sem nenhum treino** vale 0 — isso é um
 * fato medido, o sistema sabe que não houve sessão. Já uma medida corporal nunca registrada,
 * ou um exercício nunca executado, vale `null` — não existe "melhor carga" de zero execuções.
 */
export function goalCurrentValue(
  goal: Pick<TrainingGoal, "metric" | "bodyMeasurementTypeId">,
  sources: GoalValueSources,
): GoalValue {
  const { period, frequency } = sources;
  const partial = period.totals.quality === "parcial";
  const partialReason = partial
    ? "Parte das séries do período ficou fora do cálculo — o total é parcial."
    : "";
  const weeks = Math.max(1, sources.weeksInRange ?? 1);

  switch (goal.metric) {
    case "treinos_por_semana":
    case "treinos_por_mes":
    case "treinos_por_ano":
      return available(period.sessionCount);

    case "dias_ativos":
      return available(period.trainedDays.length);

    case "semanas_consecutivas":
      return available(frequency.currentWeekStreak);

    case "sessoes_concluidas":
      return available(period.sessionCount);

    case "volume_total":
      return available(
        period.totals.volumeKg,
        partial ? "parcial" : "exato",
        partialReason,
      );

    case "series_por_semana":
      return available(
        Number((period.totals.sets / weeks).toFixed(2)),
        partial ? "parcial" : "exato",
        partialReason,
      );

    case "series_grupo_muscular":
      // Sem grupo escolhido o agregado não tem recorte; a tela pede o grupo na criação.
      return sources.muscleGroupSets === null || sources.muscleGroupSets === undefined
        ? unavailable("Escolha o grupo muscular da meta para acompanhar as séries.")
        : available(sources.muscleGroupSets, partial ? "parcial" : "exato", partialReason);

    case "tempo_total":
      // O tempo é acumulado em segundos e a meta é em minutos — a unidade padrão da tela.
      return available(Math.round(period.totalSeconds / 60));

    case "peso_exercicio":
      return sources.bestWeightKg === null || sources.bestWeightKg === undefined
        ? unavailable("Nenhuma execução registrada deste exercício no período.")
        : available(sources.bestWeightKg);

    case "reps_exercicio":
      return sources.bestReps === null || sources.bestReps === undefined
        ? unavailable("Nenhuma execução registrada deste exercício no período.")
        : available(sources.bestReps);

    case "um_rm_estimado":
      return sources.bestOneRmKg === null || sources.bestOneRmKg === undefined
        ? unavailable("Sem série válida para estimar o 1RM no período.")
        : available(
            sources.bestOneRmKg,
            "parcial",
            "O 1RM é uma ESTIMATIVA calculada a partir de carga e repetições, não uma carga testada.",
          );

    case "medida_corporal":
      if (sources.bodyTypeMissing) {
        return unavailable(
          "O tipo de medida desta meta foi removido nas medidas corporais. Escolha outro tipo para voltar a acompanhar.",
        );
      }
      if (!goal.bodyMeasurementTypeId) {
        return unavailable("Escolha a medida corporal que esta meta acompanha.");
      }
      return sources.bodyValue === null || sources.bodyValue === undefined
        ? unavailable("Nenhuma medição registrada no período. Registre uma medida para acompanhar.")
        : available(sources.bodyValue);

    case "aderencia_planejamento":
      return sources.adherencePercent === null || sources.adherencePercent === undefined
        ? unavailable("Nada planejado no período — não há aderência a medir.")
        : available(Number(sources.adherencePercent.toFixed(1)));

    case "personalizada":
      return sources.manualValue === null || sources.manualValue === undefined
        ? unavailable("Registre um valor para começar a acompanhar esta meta.")
        : available(sources.manualValue);
  }
}

/* ═══════════════════════════ Progresso ═══════════════════════════ */

/** O alvo foi alcançado, no sentido que o USUÁRIO escolheu? */
export function goalReached(
  direction: GoalDirection,
  current: number,
  target: number,
  startValue: number | null,
): boolean {
  if (direction === "aumentar") return current >= target;
  if (direction === "reduzir") return current <= target;
  // "Manter" precisa de uma faixa, e a faixa honesta é metade do caminho que a pessoa aceitou
  // percorrer. Sem partida declarada, exige o valor exato. (Mesma regra de `body/measurements`.)
  if (startValue === null) return current === target;
  const tolerance = Math.abs(target - startValue) / 2;
  return tolerance === 0 ? current === target : Math.abs(current - target) <= tolerance;
}

export type GoalPace = {
  /** Fração do prazo já decorrida, 0–100. `null` = meta sem prazo. */
  elapsedPercent: number | null;
  /** Dias até o prazo. Negativo = já passou. `null` = sem prazo. */
  daysLeft: number | null;
  /** Progresso − tempo decorrido, em pontos percentuais. `null` sem prazo ou sem progresso. */
  aheadByPoints: number | null;
};

export type GoalProgressResult = {
  startValue: number | null;
  current: number | null;
  target: number;
  /** Quanto falta, no sinal da direção. `null` sem valor atual. */
  remaining: number | null;
  /** 0–100 do caminho entre partida e alvo. `null` quando não dá para calcular. */
  percent: number | null;
  reached: boolean;
  status: DerivedGoalStatus;
  pace: GoalPace;
  quality: MetricQuality;
  /** Motivo do indisponível/parcial, pronto para a tela. */
  reason: string;
};

/** Quantos pontos percentuais de atraso são necessários para a meta virar "atrás do ritmo". */
export const PACE_TOLERANCE_POINTS = 15;

/**
 * Progresso completo de uma meta.
 *
 * `hoje` é injetado: o status derivado não pode depender do relógio da máquina que renderiza —
 * senão a mesma meta apareceria "expirada" num aparelho e "ativa" em outro.
 */
export function goalProgress(
  goal: Pick<
    TrainingGoal,
    "direction" | "startValue" | "targetValue" | "startsOn" | "endsOn" | "status"
  >,
  value: GoalValue,
  hoje: string,
): GoalProgressResult {
  const current = value.value;
  const startValue = goal.startValue;

  const daysLeft = goal.endsOn ? diffDaysIso(hoje, goal.endsOn) : null;
  const totalDays = goal.endsOn ? diffDaysIso(goal.startsOn, goal.endsOn) : null;
  const elapsedDays = diffDaysIso(goal.startsOn, hoje);

  const elapsedPercent =
    totalDays === null || totalDays <= 0
      ? null
      : Math.max(0, Math.min(100, (elapsedDays / totalDays) * 100));

  const reached =
    current !== null && goalReached(goal.direction, current, goal.targetValue, startValue);

  let percent: number | null = null;
  if (current !== null && startValue !== null) {
    const span = goal.targetValue - startValue;
    if (span === 0) {
      // Partida já é o alvo: 100% se ainda está lá, 0% se saiu. Sem divisão por zero.
      percent = reached ? 100 : 0;
    } else {
      percent = Math.max(0, Math.min(100, ((current - startValue) / span) * 100));
    }
  } else if (current !== null && startValue === null) {
    // Sem partida declarada nem observada, a leitura honesta é "quanto do alvo já foi
    // alcançado" — e só faz sentido quando o alvo é um acúmulo (direção "aumentar").
    percent =
      goal.direction === "aumentar" && goal.targetValue > 0
        ? Math.max(0, Math.min(100, (current / goal.targetValue) * 100))
        : reached
          ? 100
          : null;
  }

  const aheadByPoints =
    percent === null || elapsedPercent === null ? null : Number((percent - elapsedPercent).toFixed(1));

  return {
    startValue,
    current,
    target: goal.targetValue,
    remaining: current === null ? null : Number((goal.targetValue - current).toFixed(3)),
    percent: percent === null ? null : Number(percent.toFixed(1)),
    reached,
    status: deriveGoalStatus(goal, reached, hoje, aheadByPoints),
    pace: { elapsedPercent: elapsedPercent === null ? null : Number(elapsedPercent.toFixed(1)), daysLeft, aheadByPoints },
    quality: value.quality,
    reason: value.reason,
  };
}

/**
 * Status como a TELA exibe.
 *
 * Decisão do usuário vence sempre: uma meta pausada, cancelada ou concluída não muda de estado
 * sozinha só porque o número passou pelo alvo ou porque o prazo virou. Só o que ainda está
 * correndo é derivado.
 */
export function deriveGoalStatus(
  goal: Pick<TrainingGoal, "status" | "startsOn" | "endsOn">,
  reached: boolean,
  hoje: string,
  aheadByPoints: number | null = null,
): DerivedGoalStatus {
  if (goal.status !== "ativa" && goal.status !== "planejada") return goal.status;
  if (reached) return "atingida";
  if (goal.status === "planejada" && hoje < goal.startsOn) return "planejada";
  if (goal.endsOn !== null && hoje > goal.endsOn) return "expirada";
  if (aheadByPoints !== null && aheadByPoints < -PACE_TOLERANCE_POINTS) return "em_atraso";
  return "ativa";
}

/** Metas que continuam pedindo atenção — o que a visão geral e o dashboard destacam. */
export const isGoalOpen = (status: DerivedGoalStatus): boolean =>
  status === "ativa" || status === "em_atraso" || status === "planejada";

/* ═══════════════════════════ Marcos intermediários ═══════════════════════════ */

export type MilestoneState = "atingido" | "pendente" | "prazo_vencido";

export type MilestoneStatus = GoalMilestone & {
  state: MilestoneState;
  /** Posição do marco no trajeto partida → alvo, 0–100. `null` sem partida. */
  percentOfPath: number | null;
};

/**
 * Lê os marcos do jsonb, descartando o que não é utilizável.
 *
 * Nada de `as`: o jsonb pode ter qualquer coisa (inclusive de uma versão futura do app), e um
 * marco sem número não é um marco — é ruído que quebraria a barra de progresso.
 */
export function parseMilestones(raw: unknown): GoalMilestone[] {
  if (!Array.isArray(raw)) return [];
  const list: GoalMilestone[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue;
    const record = item as Record<string, unknown>;
    const value = typeof record.value === "number" ? record.value : Number(record.value);
    if (!Number.isFinite(value)) continue;
    const dueRaw = record.due_on ?? record.dueOn;
    list.push({
      value,
      label: typeof record.label === "string" && record.label.trim() ? record.label.trim() : null,
      dueOn: isDateIso(dueRaw) ? dueRaw : null,
    });
  }
  return list;
}

/** Serializa de volta para o jsonb da coluna (snake_case, como o resto do banco). */
export const serializeMilestones = (milestones: GoalMilestone[]) =>
  milestones.map((milestone) => ({
    value: milestone.value,
    label: milestone.label,
    due_on: milestone.dueOn,
  }));

/**
 * Situação de cada marco, ordenados na direção do trajeto.
 *
 * Um marco sem valor atual fica `pendente` — não "vencido": o usuário pode simplesmente não
 * ter medido ainda, e tratar falta de dado como fracasso é o erro que a regra 3 do arquivo
 * existe para evitar.
 */
export function milestoneStatuses(
  goal: Pick<TrainingGoal, "direction" | "startValue" | "targetValue" | "milestones">,
  current: number | null,
  hoje: string,
): MilestoneStatus[] {
  const span =
    goal.startValue === null ? null : goal.targetValue - goal.startValue;

  return [...goal.milestones]
    .sort((a, b) =>
      goal.direction === "reduzir" ? b.value - a.value : a.value - b.value,
    )
    .map((milestone) => {
      const hit =
        current !== null && goalReached(goal.direction, current, milestone.value, goal.startValue);
      const overdue =
        !hit && milestone.dueOn !== null && isDateIso(hoje) && hoje > milestone.dueOn;

      return {
        ...milestone,
        state: hit ? "atingido" : overdue ? "prazo_vencido" : "pendente",
        percentOfPath:
          span === null || span === 0 || goal.startValue === null
            ? null
            : Number(
                Math.max(
                  0,
                  Math.min(100, ((milestone.value - goal.startValue) / span) * 100),
                ).toFixed(1),
              ),
      } satisfies MilestoneStatus;
    });
}

/** O próximo marco ainda não alcançado. `null` quando todos caíram (ou não há nenhum). */
export function nextMilestone(statuses: MilestoneStatus[]): MilestoneStatus | null {
  return statuses.find((milestone) => milestone.state !== "atingido") ?? null;
}

/* ═══════════════════════════ Apresentação ═══════════════════════════ */

/** "82,5 kg" · "12 treinos". Arredondar só aqui — o cálculo mantém a precisão. */
export function formatGoalValue(value: number | null, unit: string): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const digits = Number.isInteger(value) ? 0 : 1;
  const text = value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: Math.max(digits, 2),
  });
  return unit ? `${text} ${unit}` : text;
}

/** "faltam 7,5 kg" · "passou do alvo em 2 kg" · "—" quando não há valor. */
export function remainingLabel(progress: GoalProgressResult, direction: GoalDirection, unit: string): string {
  if (progress.current === null || progress.remaining === null) return "—";
  if (progress.reached) return "Alvo alcançado";
  const distance = Math.abs(progress.remaining);
  const verb = direction === "reduzir" ? "reduzir" : direction === "manter" ? "ajustar" : "somar";
  return `Faltam ${verb} ${formatGoalValue(distance, unit)}`;
}

/**
 * Frase do ritmo, sem cobrança.
 *
 * Diz onde o número está em relação ao tempo, e para aí. Nada de "você está falhando" nem de
 * "corra atrás" — a leitura do dado é do usuário.
 */
export function paceLabel(pace: GoalPace): string {
  if (pace.elapsedPercent === null || pace.aheadByPoints === null) return "";
  if (pace.aheadByPoints >= PACE_TOLERANCE_POINTS) return "Adiantado em relação ao prazo.";
  if (pace.aheadByPoints <= -PACE_TOLERANCE_POINTS) {
    return "O progresso está abaixo do tempo já decorrido do prazo.";
  }
  return "No ritmo do prazo.";
}

/** Ordena para a tela: o que está aberto primeiro, depois por prazo mais próximo. */
export function sortGoalsForDisplay<T extends { status: DerivedGoalStatus; endsOn: string | null; position: number; name: string }>(
  goals: T[],
): T[] {
  const rank: Record<DerivedGoalStatus, number> = {
    em_atraso: 0,
    ativa: 1,
    planejada: 2,
    atingida: 3,
    pausada: 4,
    expirada: 5,
    concluida: 6,
    cancelada: 7,
  };
  return [...goals].sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    if (a.position !== b.position) return a.position - b.position;
    if (a.endsOn !== b.endsOn) {
      if (a.endsOn === null) return 1;
      if (b.endsOn === null) return -1;
      return a.endsOn < b.endsOn ? -1 : 1;
    }
    return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" });
  });
}
