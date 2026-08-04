"use client";

/**
 * Fase 17-C — Treinos · O relógio da tela ao vivo.
 *
 * ═══════════ O TIQUE NÃO É A FONTE DO NÚMERO ═══════════
 *
 * Este hook só devolve "que horas são agora". Quem calcula quanto falta de descanso é
 * `timers.ts`, a partir do `started_at` gravado no banco. O intervalo existe **apenas** para
 * provocar o re-render — se ele atrasar, perder tiques ou parar, o número continua certo no
 * próximo render.
 *
 * É a diferença entre um cronômetro que sobrevive a bloquear a tela e um que não sobrevive.
 *
 * Três gatilhos de recálculo, e nenhum deles é "confiar no setInterval":
 *   • `visibilitychange` — voltar para a aba recalcula na hora, sem esperar o próximo tique;
 *   • `focus` — voltar para a janela idem;
 *   • `online` — reconectar também atualiza a tela junto com a fila.
 */
import * as React from "react";

/**
 * @param active quando `false`, o intervalo nem é criado — uma tela sem cronômetro correndo
 *   não deve re-renderizar de segundo em segundo.
 * @param intervalMs 1000 na sessão; a tela de revisão usa valores maiores.
 */
export function useNow(active = true, intervalMs = 1000): number {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!active) return;

    const tick = () => setNow(Date.now());
    const id = window.setInterval(tick, intervalMs);

    // Voltar do segundo plano recalcula imediatamente, em vez de esperar o próximo tique.
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", tick);
    window.addEventListener("online", tick);

    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", tick);
      window.removeEventListener("online", tick);
    };
  }, [active, intervalMs]);

  return now;
}

/**
 * Mantém a tela acesa durante o treino, quando o navegador oferece.
 *
 * ⚠️ Detectado em tempo de execução. Onde não houver `wakeLock`, a opção simplesmente não
 * acontece — nada de prometer o que o navegador não entrega. O lock é reobtido ao voltar para
 * a aba porque o sistema operacional o solta sozinho quando a página perde visibilidade.
 */
export function useWakeLock(enabled: boolean): { supported: boolean } {
  const [supported] = React.useState(
    () => typeof navigator !== "undefined" && "wakeLock" in navigator,
  );

  React.useEffect(() => {
    if (!enabled || !supported) return;

    let released = false;
    let sentinel: { release: () => Promise<void> } | null = null;

    const request = async () => {
      try {
        const api = (navigator as Navigator & {
          wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
        }).wakeLock;
        if (!api) return;
        sentinel = await api.request("screen");
      } catch {
        // Negado pelo navegador (aba em segundo plano, bateria baixa): seguimos sem.
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible" && !released) void request();
    };

    void request();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", onVisible);
      void sentinel?.release().catch(() => {});
    };
  }, [enabled, supported]);

  return { supported };
}

/** Vibração curta ao fim do descanso. Só onde existe — sem simulacro. */
export function vibrate(pattern: number | number[]): boolean {
  if (typeof navigator === "undefined" || !("vibrate" in navigator)) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/** O navegador suporta vibração? Usado para esconder a opção em vez de fingir. */
export const supportsVibration = (): boolean =>
  typeof navigator !== "undefined" && "vibrate" in navigator;
