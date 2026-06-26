/**
 * Fase 12 — Tipos (somente dados) dos cards do Dashboard Geral. Módulo type-only:
 * importável tanto pelas leituras server-only (queries.ts) quanto pelos componentes
 * de card no client, sem arrastar código de servidor para o bundle do navegador.
 */
import type { CalendarEventLite } from "@/lib/calendar/events";
import type { StatementStatus } from "@/lib/finance/constants";
import type { HabitCategory, HabitUnit } from "@/lib/habits/constants";
import type { StudyCategory } from "@/lib/studies/constants";
import type { TaskPriority, TaskStatus, TaskStoredStatus } from "@/lib/tasks/constants";

/* ───────────────────────────── Financeiro ───────────────────────────── */

export type FinanceCardData = {
  saldo: number;
  entradas: number;
  saidas: number;
  meu: number;
  terceiros: number;
  cartao: number;
  aVista: number;
  aReceber: number;
  contasTotal: number;
  contasCount: number;
  proximaConta: { nome: string; data: string; valor: number } | null;
  mes: string;
};

/* ───────────────────────────── Cartões & Faturas ───────────────────────────── */

export type DashFaturaItem = {
  cardNome: string;
  cardCor: string | null;
  competencia: string;
  dataVencimento: string;
  total: number;
  meu: number;
  terceiros: number;
  status: StatementStatus;
  virtual: boolean;
};

export type InvoicesCardData = {
  abertas: number;
  fechadas: number;
  pagas: number;
  aReceber: number;
  totalProximas: number;
  proximas: DashFaturaItem[];
  hasCards: boolean;
};

/* ───────────────────────────── Agenda ───────────────────────────── */

export type AgendaCardData = {
  /** Próximos compromissos já expandidos (ocorrências) — render no servidor. */
  upcoming: CalendarEventLite[];
  countWindow: number;
  countToday: number;
};

/* ───────────────────────────── Tarefas & Rotinas ───────────────────────────── */

export type DashTaskItem = {
  id: string;
  title: string;
  status: TaskStoredStatus;
  due_date: string | null;
  priority: TaskPriority;
  effective: TaskStatus;
};

export type DashRoutineItem = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  done: boolean;
  streak: number;
};

export type TasksCardData = {
  openTotal: number;
  dueToday: number;
  overdue: number;
  inProgress: number;
  list: DashTaskItem[];
  routines: DashRoutineItem[];
};

/* ───────────────────────────── Hábitos ───────────────────────────── */

export type DashHabitItem = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  category: HabitCategory;
  unit: HabitUnit;
  target: number;
  value: number;
  done: boolean;
  /** Passo do "+" rápido por unidade. */
  step: number;
};

export type HabitsCardData = {
  doneToday: number;
  scheduledToday: number;
  topStreak: number;
  /** Taxa de conclusão (0–1) no período selecionado. */
  periodRate: number;
  items: DashHabitItem[];
  water: DashHabitItem | null;
  hasHabits: boolean;
};

/* ───────────────────────────── Estudos ───────────────────────────── */

export type DashCourseItem = {
  id: string;
  title: string;
  coverColor: string | null;
  category: StudyCategory;
  icon: string | null;
  overdue: boolean;
};

export type StudiesCardData = {
  inProgress: number;
  overdue: number;
  streak: number;
  minutesWeek: number;
  minutesMonth: number;
  minutesPeriod: number;
  courses: DashCourseItem[];
  totalCourses: number;
};

/* ───────────────────────────── Notificações (placeholder até a Fase 13) ───────────────────────────── */

export type NotificationsCardData = {
  available: boolean;
  unread: number;
};
