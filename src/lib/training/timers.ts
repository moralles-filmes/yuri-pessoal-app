/**
 * Fase 17-C — Treinos · Cronômetros (PURO, sem I/O, sem `Date.now()`).
 *
 * ═══════════════════ TUDO NASCE DE TIMESTAMP, NADA DE CONTAGEM LOCAL ═══════════════════
 *
 * Um `setInterval` que decrementa "restam 87 segundos" para quando a aba perde o foco, quando a
 * tela do celular bloqueia e quando o navegador descarta a página em segundo plano —
 * exatamente as três coisas que acontecem no meio de um treino. O usuário volta e o descanso
 * está errado, sem nenhum aviso de que está errado.
 *
 * Aqui o estado guardado é o INSTANTE em que a coisa começou. O restante é
 * `planejado + ajustes − (agora − início)`, recalculado a cada render e recalculado do zero ao
 * voltar para a aba. O `setInterval` da tela existe só para provocar o re-render; ele não é a
 * fonte do número.
 *
 * `agora` é sempre INJETADO (epoch em ms). Nenhuma função deste arquivo chama `Date.now()` —
 * é o que permite testar "voltei depois de 20 minutos" sem esperar 20 minutos.
 *
 * ═══════════════════ FUSO ═══════════════════
 *
 * Os valores tratados aqui são INSTANTES (`timestamptz` → ISO com `Z`), não datas puras.
 * Instante não tem fuso: `Date.parse` devolve o mesmo epoch em Brasília e em UTC. Quem precisa
 * de "que dia foi isso" usa `dateInSaoPaulo`/`session_date`, nunca este arquivo.
 */

/** Um intervalo com começo e (talvez) fim. `endedAt` nulo = ainda correndo. */
export type Interval = {
  startedAt: string | number | Date;
  endedAt?: string | number | Date | null;
};

/** Epoch em ms. `NaN` quando o valor não é um instante válido. */
export function toEpoch(value: string | number | Date | null | undefined): number {
  if (value === null || value === undefined) return Number.NaN;
  if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number.NaN : parsed;
}

/** Segundos inteiros entre dois instantes. Nunca negativo: relógio não anda para trás na UI. */
export function elapsedSeconds(
  from: string | number | Date,
  to: string | number | Date,
): number {
  const a = toEpoch(from);
  const b = toEpoch(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.floor((b - a) / 1000));
}

/** Duração de um intervalo. Aberto = do início até `agora`. */
export function intervalSeconds(interval: Interval, agora: number): number {
  const start = toEpoch(interval.startedAt);
  if (Number.isNaN(start)) return 0;
  const end = interval.endedAt === null || interval.endedAt === undefined
    ? agora
    : toEpoch(interval.endedAt);
  if (Number.isNaN(end)) return 0;
  return Math.max(0, Math.floor((end - start) / 1000));
}

/**
 * Une intervalos que se sobrepõem.
 *
 * Necessário porque um descanso pode estar correndo quando o usuário pausa a sessão. Somar
 * "pausas + descansos" nesse caso subtrairia o mesmo minuto duas vezes do tempo ativo, e a
 * conta poderia até ficar negativa. A união conta cada segundo uma vez só.
 */
export function mergeIntervals(
  intervals: Interval[],
  agora: number,
): { start: number; end: number }[] {
  const ranges = intervals
    .map((interval) => {
      const start = toEpoch(interval.startedAt);
      const end =
        interval.endedAt === null || interval.endedAt === undefined
          ? agora
          : toEpoch(interval.endedAt);
      return { start, end: Number.isNaN(end) ? agora : Math.max(start, end) };
    })
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end))
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const range of ranges) {
    const last = merged.at(-1);
    if (last && range.start <= last.end) {
      last.end = Math.max(last.end, range.end);
      continue;
    }
    merged.push({ ...range });
  }
  return merged;
}

/** Segundos cobertos pela UNIÃO dos intervalos (sobreposição conta uma vez). */
export function unionSeconds(intervals: Interval[], agora: number): number {
  return mergeIntervals(intervals, agora).reduce(
    (total, range) => total + Math.max(0, Math.floor((range.end - range.start) / 1000)),
    0,
  );
}

/** Soma simples (cada intervalo por inteiro). É o total DESCANSADO, que pode se sobrepor a pausa. */
export function sumIntervals(intervals: Interval[], agora: number): number {
  return intervals.reduce((total, interval) => total + intervalSeconds(interval, agora), 0);
}

/* ───────────────────────────── Tempo da sessão ───────────────────────────── */

export type SessionTimesInput = {
  startedAt: string | number | Date | null;
  endedAt?: string | number | Date | null;
  pauses: Interval[];
  rests: Interval[];
};

export type SessionTimes = {
  /** Do início ao fim (ou até agora). É o "tempo de relógio" do treino. */
  totalSeconds: number;
  pausedSeconds: number;
  /** Total descansado (soma dos descansos, mesmo os que caíram dentro de uma pausa). */
  restSeconds: number;
  /** Total − união(pausas ∪ descansos). Nunca negativo. */
  activeSeconds: number;
  isRunning: boolean;
};

/**
 * Os quatro tempos de uma sessão.
 *
 * A sessão que atravessa a meia-noite não recebe tratamento especial de propósito: instantes
 * não têm dia. O "dia do treino" é `session_date`, data pura gravada no início.
 */
export function sessionTimes(input: SessionTimesInput, agora: number): SessionTimes {
  const start = toEpoch(input.startedAt);
  if (Number.isNaN(start)) {
    return {
      totalSeconds: 0,
      pausedSeconds: 0,
      restSeconds: 0,
      activeSeconds: 0,
      isRunning: false,
    };
  }

  const isRunning = input.endedAt === null || input.endedAt === undefined;
  const end = isRunning ? agora : toEpoch(input.endedAt);
  const boundary = Number.isNaN(end) ? agora : end;

  const totalSeconds = Math.max(0, Math.floor((boundary - start) / 1000));
  const pausedSeconds = unionSeconds(input.pauses, boundary);
  const restSeconds = sumIntervals(input.rests, boundary);
  const idleSeconds = unionSeconds([...input.pauses, ...input.rests], boundary);

  return {
    totalSeconds,
    pausedSeconds,
    restSeconds,
    activeSeconds: Math.max(0, totalSeconds - idleSeconds),
    isRunning,
  };
}

/** Tempo dedicado a um exercício: do primeiro registro ao último. Estimativa declarada. */
export function exerciseSeconds(
  input: { startedAt: string | number | Date | null; endedAt?: string | number | Date | null },
  agora: number,
): number {
  if (input.startedAt === null || input.startedAt === undefined) return 0;
  return intervalSeconds({ startedAt: input.startedAt, endedAt: input.endedAt ?? null }, agora);
}

/* ───────────────────────────── Descanso ───────────────────────────── */

export type RestInput = {
  startedAt: string | number | Date;
  endedAt?: string | number | Date | null;
  plannedSeconds: number;
  /** Soma dos +15 / +30 / −15 feitos durante o descanso. */
  adjustmentSeconds?: number;
};

export type RestTimer = {
  /** Alvo efetivo: planejado + ajustes, nunca abaixo de zero. */
  targetSeconds: number;
  elapsedSeconds: number;
  /** Pode ser negativo quando o descanso passou do alvo — é dado, não erro. */
  remainingSeconds: number;
  isOver: boolean;
  overtimeSeconds: number;
  isRunning: boolean;
  /** 0..1 (limitado a 1 para a barra não estourar). */
  progress: number;
};

/**
 * O estado de um descanso AGORA.
 *
 * Recalculado do zero a cada chamada: é o que faz o cronômetro estar certo depois de trocar de
 * aba, bloquear a tela ou recarregar a página. Nenhum valor intermediário é guardado.
 */
export function restTimer(rest: RestInput, agora: number): RestTimer {
  const targetSeconds = Math.max(0, rest.plannedSeconds + (rest.adjustmentSeconds ?? 0));
  const isRunning = rest.endedAt === null || rest.endedAt === undefined;
  const elapsed = intervalSeconds(
    { startedAt: rest.startedAt, endedAt: rest.endedAt ?? null },
    agora,
  );
  const remainingSeconds = targetSeconds - elapsed;

  return {
    targetSeconds,
    elapsedSeconds: elapsed,
    remainingSeconds,
    isOver: remainingSeconds <= 0,
    overtimeSeconds: remainingSeconds < 0 ? -remainingSeconds : 0,
    isRunning,
    progress: targetSeconds === 0 ? 1 : Math.min(1, elapsed / targetSeconds),
  };
}

/**
 * Ajusta a duração de um descanso em andamento (+15s, +30s, −15s).
 *
 * O alvo efetivo nunca fica abaixo do que já passou: reduzir 15s de um descanso que já correu
 * 80s de um alvo de 90s deve encerrá-lo, não criar um alvo de 75s "no passado". Devolvemos o
 * ajuste que faz o alvo bater exatamente no tempo decorrido — a action então encerra.
 */
export function adjustRest(
  rest: RestInput,
  deltaSeconds: number,
  agora: number,
): { adjustmentSeconds: number; targetSeconds: number; endsNow: boolean } {
  const current = rest.adjustmentSeconds ?? 0;
  const elapsed = intervalSeconds(
    { startedAt: rest.startedAt, endedAt: rest.endedAt ?? null },
    agora,
  );

  const wanted = Math.max(0, rest.plannedSeconds + current + deltaSeconds);
  if (wanted <= elapsed) {
    return {
      adjustmentSeconds: elapsed - rest.plannedSeconds,
      targetSeconds: elapsed,
      endsNow: true,
    };
  }
  return {
    adjustmentSeconds: wanted - rest.plannedSeconds,
    targetSeconds: wanted,
    endsNow: false,
  };
}

/**
 * O descanso deve terminar sozinho agora?
 *
 * `automatico` avança sem perguntar; `avisar` só sinaliza (a tela toca/vibra e espera);
 * `nunca` deixa o cronômetro correr para cima, mostrando quanto passou. Os três modos vêm das
 * preferências do módulo (17-A) e são congelados na sessão.
 */
export function shouldAutoAdvance(
  timer: RestTimer,
  mode: "automatico" | "avisar" | "nunca",
): boolean {
  return mode === "automatico" && timer.isRunning && timer.isOver;
}

/* ───────────────────────────── Rótulos ───────────────────────────── */

/** "1:05", "12:30", "1:02:03". Negativo vira "+" (tempo excedido), nunca "-". */
export function formatClock(totalSeconds: number): string {
  const negative = totalSeconds < 0;
  const value = Math.abs(Math.round(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  const pad = (n: number) => String(n).padStart(2, "0");

  const body =
    hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
  return negative ? `+${body}` : body;
}

/** "1 h 12 min", "45 min", "38 s" — para resumos, onde o relógio digital seria ruído. */
export function formatDuration(totalSeconds: number): string {
  const value = Math.max(0, Math.round(totalSeconds));
  if (value < 60) return `${value} s`;

  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);
  if (hours === 0) return `${minutes} min`;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}
