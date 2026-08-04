/**
 * Fase 12 — Tipos (somente dados) dos cards do Dashboard Geral. Módulo type-only:
 * importável tanto pelas leituras server-only (queries.ts) quanto pelos componentes
 * de card no client, sem arrastar código de servidor para o bundle do navegador.
 */
import type { CalendarEventLite } from "@/lib/calendar/events";
import type { NutrientTotalQuality } from "@/lib/nutrition/constants";
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

/* ───────────────────────────── Dieta e Alimentação (Fase 16-F) ───────────────────────────── */

/**
 * Um nutriente no card. `amount` é `null` quando NÃO HOUVE REGISTRO no dia — jamais 0.
 * `quality` viaja junto porque um total somado sobre itens sem o nutriente analisado é um
 * piso, e a tela é obrigada a dizer isso (regra 1 do módulo).
 */
export type DashNutrientValue = {
  code: string;
  label: string;
  unit: string;
  amount: number | null;
  target: number | null;
  /** 0..100 do alvo. `null` quando não há meta ou não há registro. */
  percent: number | null;
  quality: NutrientTotalQuality | null;
};

export type DashNextMeal = {
  name: string;
  /** 'HH:mm' já formatado, ou null quando a refeição não tem horário. */
  time: string | null;
  /** O horário já passou da tolerância. */
  late: boolean;
};

export type NutritionCardData = {
  /** Houve ao menos um item registrado hoje. Falso ≠ "comeu zero". */
  hasRecord: boolean;
  /** Existe alguma coisa do módulo configurada (evita um card vazio sem explicação). */
  hasModule: boolean;
  energy: DashNutrientValue | null;
  protein: DashNutrientValue | null;
  /** 0..100 da aderência do dia; `null` sem meta ou sem registro. */
  adherence: number | null;
  mealsTotal: number;
  mealsDone: number;
  mealsPending: number;
  mealsLate: number;
  nextMeal: DashNextMeal | null;
  /** Itens a pegar somados nas listas ativas. */
  shoppingPending: number;
  shoppingLists: number;
  /** Última medição de peso. `null` = nunca mediu. */
  weight: {
    value: number;
    unit: string;
    decimals: number;
    measuredOn: string;
    /** Diferença desde a medição anterior. `null` com uma medição só. */
    sincePrevious: number | null;
  } | null;
  /** Meta de água do dia (fonte de verdade: módulo Hábitos). `null` = sem hábito de água. */
  water: { value: number; target: number; unit: string } | null;
};

/* ───────────────────────────── Treinos (Fase 17-F) ───────────────────────────── */

/**
 * O card de Treinos no Dashboard Geral.
 *
 * ⛔ TODO NÚMERO AQUI JÁ EXISTE. Volume, séries e frequência saem de `metrics.ts` (17-D) por
 * meio de `dashboards.ts` (17-E); o status do dia planejado sai de `derivePlannedStatus`
 * (17-B); o peso vem do módulo central `body_*` (16-E). O card não soma nada.
 *
 * ⛔ AUSÊNCIA DE DADO NÃO É ZERO. Semana sem treino devolve o volume como `null` com o motivo,
 * nunca "0 kg" com cara de resultado.
 */
export type TrainingCardData = {
  /** Existe alguma coisa do módulo configurada (evita card vazio sem explicação). */
  hasModule: boolean;
  /** A sessão em execução — o botão "continuar" do card. */
  activeSession: { id: string; label: string; status: string } | null;
  /** O que está planejado para hoje (ou o descanso marcado). */
  today: {
    label: string;
    time: string | null;
    isRest: boolean;
    /** Status DERIVADO na leitura (17-B), nunca gravado. */
    status: string;
  } | null;
  /** Já houve sessão concluída hoje? */
  trainedToday: boolean;
  /** Sessões da semana × meta semanal das preferências. `target` nulo = sem meta declarada. */
  week: { sessions: number; target: number | null; volumeKg: number | null; partialReason: string };
  /** A regra de contagem vigente, que viaja junto do volume (17-D). */
  volumeRule: string;
  /** Último treino registrado. */
  lastSession: {
    id: string;
    label: string;
    date: string;
    volumeKg: number | null;
    durationSeconds: number | null;
  } | null;
  /** Uma meta em andamento, para dar direção. `percent` nulo = sem base para calcular. */
  goal: { id: string; name: string; percent: number | null; status: string } | null;
  /** Última medição de peso — o MESMO dado que a Dieta mostra (`body_*`). */
  weight: {
    value: number;
    unit: string;
    decimals: number;
    measuredOn: string;
    sincePrevious: number | null;
  } | null;
};
