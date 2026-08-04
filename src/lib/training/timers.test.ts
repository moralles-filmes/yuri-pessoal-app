/**
 * Fase 17-C — Treinos · Testes dos cronômetros.
 *
 * Todos os instantes são ABSOLUTOS (com `Z`) e `agora` é sempre INJETADO. É o que faz a suíte
 * passar igual em `TZ=UTC` e em `TZ=America/Sao_Paulo` — e é o que permite testar "voltei
 * depois de 20 minutos" sem esperar 20 minutos.
 */
import { describe, expect, it } from "vitest";
import {
  adjustRest,
  elapsedSeconds,
  exerciseSeconds,
  formatClock,
  formatDuration,
  intervalSeconds,
  mergeIntervals,
  restTimer,
  sessionTimes,
  shouldAutoAdvance,
  sumIntervals,
  toEpoch,
  unionSeconds,
} from "./timers";

const at = (iso: string) => Date.parse(iso);

/* ═══════════════════════ Aritmética básica ═══════════════════════ */

describe("aritmética de instantes", () => {
  it("converte ISO, epoch e Date para epoch", () => {
    expect(toEpoch("2026-08-04T10:00:00.000Z")).toBe(at("2026-08-04T10:00:00.000Z"));
    expect(toEpoch(1_700_000_000_000)).toBe(1_700_000_000_000);
    expect(toEpoch(new Date("2026-08-04T10:00:00.000Z"))).toBe(at("2026-08-04T10:00:00.000Z"));
    expect(Number.isNaN(toEpoch("não é data"))).toBe(true);
    expect(Number.isNaN(toEpoch(null))).toBe(true);
  });

  it("elapsedSeconds nunca é negativo", () => {
    expect(elapsedSeconds("2026-08-04T10:00:00Z", "2026-08-04T10:01:30Z")).toBe(90);
    expect(elapsedSeconds("2026-08-04T10:01:30Z", "2026-08-04T10:00:00Z")).toBe(0);
  });

  it("intervalo aberto conta até agora", () => {
    const seconds = intervalSeconds(
      { startedAt: "2026-08-04T10:00:00Z", endedAt: null },
      at("2026-08-04T10:05:00Z"),
    );
    expect(seconds).toBe(300);
  });

  it("o mesmo instante em fuso diferente dá o mesmo resultado", () => {
    const emUtc = elapsedSeconds("2026-08-04T03:00:00Z", "2026-08-04T03:30:00Z");
    const emBrt = elapsedSeconds("2026-08-04T00:00:00-03:00", "2026-08-04T00:30:00-03:00");
    expect(emUtc).toBe(emBrt);
  });
});

/* ═══════════════════════ União de intervalos ═══════════════════════ */

describe("mergeIntervals / unionSeconds", () => {
  it("une intervalos que se sobrepõem", () => {
    const merged = mergeIntervals(
      [
        { startedAt: "2026-08-04T10:00:00Z", endedAt: "2026-08-04T10:05:00Z" },
        { startedAt: "2026-08-04T10:03:00Z", endedAt: "2026-08-04T10:08:00Z" },
      ],
      at("2026-08-04T11:00:00Z"),
    );
    expect(merged).toHaveLength(1);
    expect(unionSeconds(
      [
        { startedAt: "2026-08-04T10:00:00Z", endedAt: "2026-08-04T10:05:00Z" },
        { startedAt: "2026-08-04T10:03:00Z", endedAt: "2026-08-04T10:08:00Z" },
      ],
      at("2026-08-04T11:00:00Z"),
    )).toBe(480);
  });

  it("mantém separados os intervalos que não se tocam", () => {
    const intervals = [
      { startedAt: "2026-08-04T10:00:00Z", endedAt: "2026-08-04T10:02:00Z" },
      { startedAt: "2026-08-04T10:05:00Z", endedAt: "2026-08-04T10:06:00Z" },
    ];
    expect(mergeIntervals(intervals, at("2026-08-04T11:00:00Z"))).toHaveLength(2);
    expect(unionSeconds(intervals, at("2026-08-04T11:00:00Z"))).toBe(180);
  });

  it("sumIntervals soma por inteiro (sobreposição conta duas vezes)", () => {
    const intervals = [
      { startedAt: "2026-08-04T10:00:00Z", endedAt: "2026-08-04T10:05:00Z" },
      { startedAt: "2026-08-04T10:03:00Z", endedAt: "2026-08-04T10:08:00Z" },
    ];
    expect(sumIntervals(intervals, at("2026-08-04T11:00:00Z"))).toBe(600);
  });
});

/* ═══════════════════════ Tempo da sessão ═══════════════════════ */

describe("sessionTimes", () => {
  const base = {
    startedAt: "2026-08-04T10:00:00Z",
    pauses: [] as { startedAt: string; endedAt: string | null }[],
    rests: [] as { startedAt: string; endedAt: string | null }[],
  };

  it("sessão correndo conta até agora", () => {
    const times = sessionTimes(base, at("2026-08-04T11:00:00Z"));
    expect(times.totalSeconds).toBe(3600);
    expect(times.activeSeconds).toBe(3600);
    expect(times.isRunning).toBe(true);
  });

  it("a pausa NÃO entra no tempo ativo", () => {
    const times = sessionTimes(
      {
        ...base,
        pauses: [{ startedAt: "2026-08-04T10:10:00Z", endedAt: "2026-08-04T10:20:00Z" }],
      },
      at("2026-08-04T11:00:00Z"),
    );
    expect(times.totalSeconds).toBe(3600);
    expect(times.pausedSeconds).toBe(600);
    expect(times.activeSeconds).toBe(3000);
  });

  it("o descanso também sai do tempo ativo, e o total descansado é reportado", () => {
    const times = sessionTimes(
      {
        ...base,
        rests: [
          { startedAt: "2026-08-04T10:05:00Z", endedAt: "2026-08-04T10:06:30Z" },
          { startedAt: "2026-08-04T10:10:00Z", endedAt: "2026-08-04T10:11:30Z" },
        ],
      },
      at("2026-08-04T10:30:00Z"),
    );
    expect(times.restSeconds).toBe(180);
    expect(times.activeSeconds).toBe(1800 - 180);
  });

  it("descanso DENTRO de uma pausa não é subtraído duas vezes", () => {
    const times = sessionTimes(
      {
        ...base,
        pauses: [{ startedAt: "2026-08-04T10:05:00Z", endedAt: "2026-08-04T10:15:00Z" }],
        rests: [{ startedAt: "2026-08-04T10:06:00Z", endedAt: "2026-08-04T10:08:00Z" }],
      },
      at("2026-08-04T10:30:00Z"),
    );
    expect(times.totalSeconds).toBe(1800);
    expect(times.pausedSeconds).toBe(600);
    expect(times.restSeconds).toBe(120);
    // 1800 − união(600) = 1200, e não 1800 − 600 − 120 = 1080.
    expect(times.activeSeconds).toBe(1200);
  });

  it("sessão encerrada para de crescer", () => {
    const times = sessionTimes(
      { ...base, endedAt: "2026-08-04T11:00:00Z" },
      at("2026-08-04T23:00:00Z"),
    );
    expect(times.totalSeconds).toBe(3600);
    expect(times.isRunning).toBe(false);
  });

  it("sessão que atravessa a meia-noite conta certo (nenhum tratamento de dia)", () => {
    const times = sessionTimes(
      { startedAt: "2026-08-05T02:30:00Z", pauses: [], rests: [] }, // 23h30 BRT do dia 4
      at("2026-08-05T03:40:00Z"), // 00h40 BRT do dia 5
    );
    expect(times.totalSeconds).toBe(70 * 60);
  });

  it("sem início devolve tudo zerado em vez de NaN", () => {
    expect(sessionTimes({ startedAt: null, pauses: [], rests: [] }, at("2026-08-04T10:00:00Z"))).toEqual(
      { totalSeconds: 0, pausedSeconds: 0, restSeconds: 0, activeSeconds: 0, isRunning: false },
    );
  });

  it("tempo ativo nunca fica negativo", () => {
    const times = sessionTimes(
      {
        ...base,
        pauses: [{ startedAt: "2026-08-04T09:00:00Z", endedAt: "2026-08-04T12:00:00Z" }],
      },
      at("2026-08-04T10:30:00Z"),
    );
    expect(times.activeSeconds).toBe(0);
  });

  it("exerciseSeconds mede do primeiro ao último registro", () => {
    expect(
      exerciseSeconds(
        { startedAt: "2026-08-04T10:00:00Z", endedAt: "2026-08-04T10:12:00Z" },
        at("2026-08-04T11:00:00Z"),
      ),
    ).toBe(720);
    expect(exerciseSeconds({ startedAt: null }, at("2026-08-04T11:00:00Z"))).toBe(0);
  });
});

/* ═══════════════════════ Descanso ═══════════════════════ */

describe("restTimer", () => {
  const rest = { startedAt: "2026-08-04T10:00:00Z", plannedSeconds: 90 };

  it("conta o restante a partir do instante de início", () => {
    const timer = restTimer(rest, at("2026-08-04T10:00:30Z"));
    expect(timer.elapsedSeconds).toBe(30);
    expect(timer.remainingSeconds).toBe(60);
    expect(timer.isOver).toBe(false);
    expect(timer.progress).toBeCloseTo(1 / 3);
  });

  it("continua CERTO depois de a aba ficar 20 minutos sem foco", () => {
    const timer = restTimer(rest, at("2026-08-04T10:20:00Z"));
    expect(timer.elapsedSeconds).toBe(1200);
    expect(timer.isOver).toBe(true);
    expect(timer.overtimeSeconds).toBe(1110);
    expect(timer.progress).toBe(1);
  });

  it("recarregar a página devolve o mesmo número (não há estado local)", () => {
    const antes = restTimer(rest, at("2026-08-04T10:00:45Z"));
    const depois = restTimer({ ...rest }, at("2026-08-04T10:00:45Z"));
    expect(depois).toEqual(antes);
  });

  it("os ajustes entram no alvo", () => {
    const timer = restTimer({ ...rest, adjustmentSeconds: 30 }, at("2026-08-04T10:00:30Z"));
    expect(timer.targetSeconds).toBe(120);
    expect(timer.remainingSeconds).toBe(90);
  });

  it("descanso encerrado para de contar", () => {
    const timer = restTimer(
      { ...rest, endedAt: "2026-08-04T10:01:00Z" },
      at("2026-08-04T10:30:00Z"),
    );
    expect(timer.elapsedSeconds).toBe(60);
    expect(timer.isRunning).toBe(false);
  });

  it("alvo zero é considerado terminado, sem divisão por zero", () => {
    const timer = restTimer(
      { startedAt: "2026-08-04T10:00:00Z", plannedSeconds: 0 },
      at("2026-08-04T10:00:00Z"),
    );
    expect(timer.progress).toBe(1);
    expect(timer.isOver).toBe(true);
  });
});

describe("adjustRest", () => {
  const rest = { startedAt: "2026-08-04T10:00:00Z", plannedSeconds: 90 };

  it("+15 e +30 acumulam", () => {
    const mais15 = adjustRest(rest, 15, at("2026-08-04T10:00:10Z"));
    expect(mais15.targetSeconds).toBe(105);

    const mais30 = adjustRest(
      { ...rest, adjustmentSeconds: mais15.adjustmentSeconds },
      30,
      at("2026-08-04T10:00:10Z"),
    );
    expect(mais30.targetSeconds).toBe(135);
  });

  it("−15 reduz", () => {
    expect(adjustRest(rest, -15, at("2026-08-04T10:00:10Z")).targetSeconds).toBe(75);
  });

  it("reduzir abaixo do tempo já decorrido encerra o descanso em vez de criar alvo no passado", () => {
    const result = adjustRest(rest, -15, at("2026-08-04T10:01:20Z")); // já correram 80s
    expect(result.endsNow).toBe(true);
    expect(result.targetSeconds).toBe(80);
  });

  it("nunca gera alvo negativo", () => {
    const result = adjustRest(rest, -500, at("2026-08-04T10:00:05Z"));
    expect(result.targetSeconds).toBeGreaterThanOrEqual(0);
    expect(result.endsNow).toBe(true);
  });
});

describe("shouldAutoAdvance", () => {
  const timerAt = (iso: string) =>
    restTimer({ startedAt: "2026-08-04T10:00:00Z", plannedSeconds: 60 }, at(iso));

  it("avança sozinho só no modo automático e só depois do tempo", () => {
    expect(shouldAutoAdvance(timerAt("2026-08-04T10:01:05Z"), "automatico")).toBe(true);
    expect(shouldAutoAdvance(timerAt("2026-08-04T10:00:30Z"), "automatico")).toBe(false);
  });

  it("os modos avisar e nunca não avançam", () => {
    expect(shouldAutoAdvance(timerAt("2026-08-04T10:01:05Z"), "avisar")).toBe(false);
    expect(shouldAutoAdvance(timerAt("2026-08-04T10:01:05Z"), "nunca")).toBe(false);
  });

  it("descanso já encerrado não dispara avanço", () => {
    const timer = restTimer(
      { startedAt: "2026-08-04T10:00:00Z", plannedSeconds: 60, endedAt: "2026-08-04T10:01:00Z" },
      at("2026-08-04T10:05:00Z"),
    );
    expect(shouldAutoAdvance(timer, "automatico")).toBe(false);
  });
});

/* ═══════════════════════ Rótulos ═══════════════════════ */

describe("rótulos de tempo", () => {
  it("formatClock usa m:ss e h:mm:ss", () => {
    expect(formatClock(65)).toBe("1:05");
    expect(formatClock(750)).toBe("12:30");
    expect(formatClock(3723)).toBe("1:02:03");
    expect(formatClock(0)).toBe("0:00");
  });

  it("tempo excedido aparece com + em vez de sinal negativo", () => {
    expect(formatClock(-12)).toBe("+0:12");
  });

  it("formatDuration é legível em resumo", () => {
    expect(formatDuration(38)).toBe("38 s");
    expect(formatDuration(2700)).toBe("45 min");
    expect(formatDuration(3600)).toBe("1 h");
    expect(formatDuration(4320)).toBe("1 h 12 min");
  });
});
