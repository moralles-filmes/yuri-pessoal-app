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
import * as calendar from "./adapters/calendar";
import * as tasks from "./adapters/tasks";
import * as body from "./adapters/body";
import * as finance from "./adapters/finance";
import * as nutrition from "./adapters/nutrition";

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

  // ───────────────────────────── 18-C · Lote 2 ─────────────────────────────
  "calendar.get_upcoming": {
    schema: calendar.getUpcomingInput,
    run: calendar.getUpcoming as (input: never) => Promise<ToolOutput>,
  },
  "calendar.get_day": {
    schema: calendar.getDayInput,
    run: calendar.getDay as (input: never) => Promise<ToolOutput>,
  },
  "tasks.get_pending": {
    schema: tasks.getPendingInput,
    run: tasks.getPending as (input: never) => Promise<ToolOutput>,
  },
  "tasks.get_routines_today": {
    schema: tasks.getRoutinesTodayInput,
    run: tasks.getRoutinesToday as (input: never) => Promise<ToolOutput>,
  },
  "body.get_latest": {
    schema: body.getLatestInput,
    run: body.getLatest as (input: never) => Promise<ToolOutput>,
  },
  "body.get_series": {
    schema: body.getSeriesInput,
    run: body.getSeries as (input: never) => Promise<ToolOutput>,
  },

  // ───────────────────────────── 18-C · Lote 3 ─────────────────────────────
  "finance.get_balances": {
    schema: finance.getBalancesInput,
    run: finance.getBalances as (input: never) => Promise<ToolOutput>,
  },
  "finance.get_spending": {
    schema: finance.getSpendingInput,
    run: finance.getSpending as (input: never) => Promise<ToolOutput>,
  },
  "finance.get_invoice": {
    schema: finance.getInvoiceInput,
    run: finance.getInvoice as (input: never) => Promise<ToolOutput>,
  },
  "nutrition.get_day": {
    schema: nutrition.getDayInput,
    run: nutrition.getDay as (input: never) => Promise<ToolOutput>,
  },
  "nutrition.get_period": {
    schema: nutrition.getPeriodInput,
    run: nutrition.getPeriod as (input: never) => Promise<ToolOutput>,
  },
  "nutrition.get_goals": {
    schema: nutrition.getGoalsInput,
    run: nutrition.getGoals as (input: never) => Promise<ToolOutput>,
  },
};
