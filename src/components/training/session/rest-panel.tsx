"use client";

/**
 * Fase 17-C — Treinos · Painel de descanso.
 *
 * ═══════════ COMPONENTE ISOLADO DE PROPÓSITO ═══════════
 *
 * O tique de um segundo vive AQUI. Se o `useNow` estivesse no cliente da sessão inteira, a
 * lista de exercícios, os campos de registro e o cabeçalho re-renderizariam 60 vezes por
 * minuto — numa tela que precisa responder ao toque de quem está com a mão suada.
 *
 * ═══════════ O NÚMERO VEM DO TIMESTAMP ═══════════
 *
 * `restTimer` recalcula do zero a cada render a partir de `startedAt`. Trocar de aba, bloquear
 * a tela ou recarregar não afeta a contagem — o tique só provoca o re-render.
 */
import * as React from "react";
import { Check, Minus, Pause, Play, Plus, SkipForward } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatClock, restTimer, sessionTimes, shouldAutoAdvance } from "@/lib/training/timers";
import { REST_ADJUSTMENTS } from "@/lib/training/constants";
import type { SessionRest } from "@/lib/training/types";
import { useNow, vibrate } from "./use-now";

export function RestPanel({
  rest,
  autoAdvance,
  soundEnabled,
  vibrationEnabled,
  nextLabel,
  nextTargetLabel,
  isPaused,
  onAdjust,
  onSkip,
  onFinish,
  onPauseToggle,
}: {
  rest: SessionRest;
  autoAdvance: "automatico" | "avisar" | "nunca";
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  /** "Próxima: Supino · série 3 de 4" */
  nextLabel: string | null;
  /** "60 kg × 8–12" — o próximo peso, para o usuário já ir montando a barra. */
  nextTargetLabel: string | null;
  isPaused: boolean;
  onAdjust: (deltaSeconds: number) => void;
  onSkip: () => void;
  onFinish: () => void;
  onPauseToggle: () => void;
}) {
  const now = useNow(rest.endedAt === null);
  const timer = restTimer(
    {
      startedAt: rest.startedAt,
      endedAt: rest.endedAt,
      plannedSeconds: rest.plannedSeconds,
      adjustmentSeconds: rest.adjustmentSeconds,
    },
    now,
  );

  // Avisa uma vez quando o tempo acaba. `alerted` é ref para o aviso não repetir a cada tique.
  const alerted = React.useRef(false);
  React.useEffect(() => {
    if (!timer.isOver || alerted.current || !timer.isRunning) return;
    alerted.current = true;

    if (vibrationEnabled) vibrate([200, 80, 200]);
    if (soundEnabled) playBeep();
    if (shouldAutoAdvance(timer, autoAdvance)) onFinish();
  }, [timer, autoAdvance, soundEnabled, vibrationEnabled, onFinish]);

  const over = timer.isOver;

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 sm:p-5",
        over ? "border-primary bg-primary/5" : "bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {over ? "Descanso concluído" : "Descansando"}
          </p>
          <p
            className={cn(
              "font-mono text-5xl font-semibold tabular-nums sm:text-6xl",
              over && "text-primary",
            )}
            // Leitores de tela não devem anunciar cada segundo.
            aria-live="off"
          >
            {formatClock(over ? -timer.overtimeSeconds : timer.remainingSeconds)}
          </p>
          <p className="text-xs text-muted-foreground">
            {over
              ? `Passou de ${formatClock(timer.targetSeconds)}`
              : `de ${formatClock(timer.targetSeconds)}`}
          </p>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="size-12 shrink-0"
          onClick={onPauseToggle}
          aria-label={isPaused ? "Retomar o treino" : "Pausar o treino"}
        >
          {isPaused ? <Play className="size-5" /> : <Pause className="size-5" />}
        </Button>
      </div>

      {/* Barra de progresso puramente visual — o número acima é a informação. */}
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn("h-full rounded-full transition-[width] duration-500", over ? "bg-primary" : "bg-foreground/40")}
          style={{ width: `${Math.round(timer.progress * 100)}%` }}
        />
      </div>

      {nextLabel && (
        <div className="mt-4 rounded-xl border bg-background/60 p-3">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">A seguir</p>
          <p className="truncate text-sm font-medium">{nextLabel}</p>
          {nextTargetLabel && (
            <p className="truncate text-sm text-muted-foreground">{nextTargetLabel}</p>
          )}
        </div>
      )}

      {/* Alvos de toque grandes: uma mão, celular, academia. */}
      <div className="mt-4 grid grid-cols-3 gap-2">
        {REST_ADJUSTMENTS.map((delta) => (
          <Button
            key={delta}
            variant="outline"
            className="h-12 text-base"
            onClick={() => onAdjust(delta)}
          >
            {delta > 0 ? <Plus className="size-4" /> : <Minus className="size-4" />}
            {Math.abs(delta)}s
          </Button>
        ))}
      </div>

      {/* `min-w-0` + `truncate`: "Pular descanso" em `text-base` mede ~150px e a célula
          fica no limite num celular de 375px. Sem isso o `whitespace-nowrap` do Button
          alargava o grid e a tela de descanso rolava na horizontal. */}
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="outline" className="h-12 min-w-0 text-sm sm:text-base" onClick={onSkip}>
          <SkipForward className="size-4" />
          <span className="truncate">Pular descanso</span>
        </Button>
        <Button className="h-12 min-w-0 text-sm sm:text-base" onClick={onFinish}>
          <Check className="size-4" />
          <span className="truncate">Continuar</span>
        </Button>
      </div>
    </div>
  );
}

/**
 * Bipe curto pelo Web Audio.
 *
 * Sem arquivo de áudio: nenhum asset de terceiros entra no módulo, nem um som. Se o navegador
 * bloquear o contexto de áudio (política de autoplay), simplesmente não toca — a vibração e o
 * visual continuam.
 */
function playBeep() {
  try {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const context = new Ctor();
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = "sine";
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.2, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);

    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.36);
    oscillator.onended = () => void context.close().catch(() => {});
  } catch {
    /* áudio indisponível: a opção some em vez de fingir que tocou */
  }
}

/**
 * Cronômetro do treino, isolado pelo mesmo motivo do painel de descanso.
 *
 * Mostra o tempo TOTAL (relógio de parede). O tempo ativo — total menos pausas e descansos —
 * aparece na revisão, onde há espaço para explicar a diferença.
 */
export function SessionClock({
  startedAt,
  endedAt,
  pauses,
  rests,
  running,
}: {
  startedAt: string | null;
  endedAt: string | null;
  pauses: { startedAt: string; endedAt: string | null }[];
  rests: { startedAt: string; endedAt: string | null }[];
  running: boolean;
}) {
  const now = useNow(running);
  const times = sessionTimes({ startedAt, endedAt, pauses, rests }, now);

  return (
    <span className="font-mono tabular-nums" aria-live="off">
      {formatClock(times.totalSeconds)}
    </span>
  );
}
