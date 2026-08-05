import "server-only";

/**
 * Fase 18-B — IA · Mapa nome → executor.
 *
 * Separado do registry porque `registry.ts` é camada PURA (o `boundaries.test.ts` depende
 * disso) e o executor faz I/O. A bijeção entre os dois é garantida por teste — a garantia é
 * a mesma que guardar a função dentro do descriptor daria, sem quebrar a fronteira.
 *
 * ⚠️ Este mapa é ESTÁTICO e literal. Nada é registrado em runtime: uma ferramenta que não
 * esteja escrita aqui, com nome idêntico ao do descriptor, simplesmente não roda.
 */

import type { ZodType } from "zod";
import type { ToolOutput } from "./contracts";
import * as training from "./adapters/training";

export type ToolExecutorEntry = {
  readonly schema: ZodType;
  readonly run: (input: never) => Promise<ToolOutput>;
};

export const TOOL_EXECUTORS: Readonly<Record<string, ToolExecutorEntry>> = {
  "training.get_last_workout": {
    schema: training.getLastWorkoutInput,
    run: training.getLastWorkout as (input: never) => Promise<ToolOutput>,
  },
  "training.get_volume": {
    schema: training.getVolumeInput,
    run: training.getVolume as (input: never) => Promise<ToolOutput>,
  },
  "training.get_records": {
    schema: training.getRecordsInput,
    run: training.getRecords as (input: never) => Promise<ToolOutput>,
  },
};
