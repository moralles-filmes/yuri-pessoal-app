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
import * as todo from "./adapters/todo";
import * as habits from "./adapters/habits";
import * as studies from "./adapters/studies";

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

  // ───────────────────────────── 18-C · Lote 1 ─────────────────────────────
  "todo.get_agenda": {
    schema: todo.getAgendaInput,
    run: todo.getAgenda as (input: never) => Promise<ToolOutput>,
  },
  "todo.search_tasks": {
    schema: todo.searchTasksInput,
    run: todo.searchTasks as (input: never) => Promise<ToolOutput>,
  },
  "todo.get_projects": {
    schema: todo.getProjectsInput,
    run: todo.getProjects as (input: never) => Promise<ToolOutput>,
  },
  "habits.get_today": {
    schema: habits.getTodayInput,
    run: habits.getToday as (input: never) => Promise<ToolOutput>,
  },
  "habits.get_streaks": {
    schema: habits.getStreaksInput,
    run: habits.getStreaks as (input: never) => Promise<ToolOutput>,
  },
  "studies.get_courses": {
    schema: studies.getCoursesInput,
    run: studies.getCourses as (input: never) => Promise<ToolOutput>,
  },
  "studies.get_study_time": {
    schema: studies.getStudyTimeInput,
    run: studies.getStudyTime as (input: never) => Promise<ToolOutput>,
  },
};
