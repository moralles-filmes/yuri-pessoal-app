"use client";

import { useSyncExternalStore } from "react";

// Snapshot em cache: ler o store durante o render nunca consulta Date.now().
let agora: number | null = null;
let intervalo: ReturnType<typeof setInterval> | null = null;
const ouvintes = new Set<() => void>();
const snapshot = () => agora;
const snapshotDoServidor = () => null;
const assinarParado = () => () => {};

function atualizar() {
  agora = Date.now();
  for (const ouvir of ouvintes) ouvir();
}

function assinar(ouvir: () => void) {
  ouvintes.add(ouvir);
  if (intervalo === null) {
    intervalo = setInterval(atualizar, 30_000);
    atualizar();
  }
  return () => {
    ouvintes.delete(ouvir);
    if (ouvintes.size === 0 && intervalo !== null) {
      clearInterval(intervalo);
      intervalo = null;
      agora = null;
    }
  };
}

/** Relógio informativo compartilhado; SSR e hidratação começam sem uma hora conhecida. */
export function useAgora(ativo = true): number | null {
  return useSyncExternalStore(ativo ? assinar : assinarParado, snapshot, snapshotDoServidor);
}
