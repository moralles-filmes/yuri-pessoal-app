/**
 * Tipos de domínio do módulo financeiro (Fase 02).
 * Construídos sobre os tipos gerados (src/types/supabase.ts), mas com os campos
 * de enum estreitados para os literais de src/lib/finance/constants.ts — assim
 * o app, o banco (CHECK) e os schemas Zod ficam sempre em sincronia.
 */
import type { Database } from "@/types/supabase";
import type {
  AccountType,
  CardBrand,
  CategoryKind,
  Classificacao,
  Frequency,
  GeneratedStatus,
  InstallmentStatus,
  PaymentMethod,
  ReceivableStatus,
  SplitType,
  StatementStatus,
  TransactionStatus,
  TransactionType,
} from "@/lib/finance/constants";
import type {
  ImportAs,
  ImportBatchStatus,
  ImportFormat,
  ImportOrigem,
  ImportRowStatus,
} from "@/lib/import/constants";
import type { ColumnMapping } from "@/lib/import/types";
import type {
  EventFrequency,
  EventOrigin,
  EventType,
} from "@/lib/calendar/constants";
import type {
  RoutineFrequency,
  RoutineType,
  TaskPriority,
  TaskStoredStatus,
} from "@/lib/tasks/constants";
import type { TaskRecurrence } from "@/lib/tasks/recurrence";
import type {
  HabitCategory,
  HabitFrequency,
  HabitUnit,
} from "@/lib/habits/constants";
import type {
  LanguageSkill,
  StudyCategory,
  StudyDifficulty,
  StudyPriority,
  StudyStatus,
  VocabMastery,
} from "@/lib/studies/constants";
import type { OverdueReason } from "@/lib/studies/progress";
import type { DashboardLayout } from "@/lib/dashboard/cards";
import type {
  NotificationPriority,
  NotificationType,
} from "@/lib/notifications/constants";

type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

type ViewRow<T extends keyof Database["public"]["Views"]> =
  Database["public"]["Views"][T]["Row"];

export type AccountRow = Omit<Row<"accounts">, "type"> & { type: AccountType };

export type AccountWithBalance = AccountRow & { current_balance: number };

export type CategoryRow = Omit<Row<"categories">, "kind"> & {
  kind: CategoryKind;
};

export type SubcategoryRow = Row<"subcategories">;

export type TransactionRow = Omit<
  Row<"transactions">,
  "type" | "payment_method" | "status" | "classificacao"
> & {
  type: TransactionType;
  payment_method: PaymentMethod | null;
  status: TransactionStatus;
  classificacao: Classificacao;
};

/* ───────────────────────── Fase 03 — Cartões & Faturas ───────────────────────── */

export type CreditCardRow = Omit<Row<"credit_cards">, "bandeira"> & {
  bandeira: CardBrand;
};

export type CardStatementRow = Omit<Row<"card_statements">, "status"> & {
  status: StatementStatus;
};

/**
 * Fatura já com total calculado na leitura (view card_statements_with_total).
 * A geração de tipos marca colunas de view como nullable; reafirmamos como não-nulas
 * as que sempre existem (vêm de colunas NOT NULL da tabela base).
 */
export type CardStatementWithTotal = Omit<
  ViewRow<"card_statements_with_total">,
  "status" | "id" | "competencia" | "data_fechamento" | "data_vencimento"
> & {
  id: string;
  competencia: string;
  data_fechamento: string;
  data_vencimento: string;
  status: StatementStatus | null;
  total_atual: number;
  itens: number;
  card: Pick<
    CreditCardRow,
    "id" | "nome" | "cor" | "bandeira" | "dia_fechamento" | "dia_vencimento"
  > | null;
};

export type BillRow = Omit<Row<"bills">, "frequency"> & {
  frequency: Frequency;
};

export type RecurringTransactionRow = Omit<
  Row<"recurring_transactions">,
  "type" | "payment_method" | "frequency" | "generated_status"
> & {
  type: TransactionType;
  payment_method: PaymentMethod | null;
  frequency: Frequency;
  generated_status: GeneratedStatus;
};

/** Lançamento já com as relações resolvidas (para listas e detalhes). */
export type TransactionWithRelations = TransactionRow & {
  account: Pick<AccountRow, "id" | "name" | "color"> | null;
  transfer_account: Pick<AccountRow, "id" | "name"> | null;
  category: Pick<CategoryRow, "id" | "name" | "color" | "icon"> | null;
  subcategory: Pick<SubcategoryRow, "id" | "name"> | null;
  card: Pick<CreditCardRow, "id" | "nome" | "cor" | "bandeira"> | null;
  // Fatura do lançamento de cartão — permite derivar pago/em-aberto na leitura.
  statement: Pick<CardStatementRow, "id" | "pago_em"> | null;
};

/* ───────────────────────────── Fase 04 — Parcelamentos ───────────────────────────── */

export type TransactionInstallmentRow = Omit<
  Row<"transaction_installments">,
  "status"
> & {
  status: InstallmentStatus;
};

/** Parcela com a fatura embutida — permite derivar o status pago e as datas na leitura. */
export type InstallmentWithStatement = TransactionInstallmentRow & {
  statement: Pick<
    CardStatementRow,
    "id" | "competencia" | "data_fechamento" | "data_vencimento" | "pago_em"
  > | null;
};

/**
 * Compra parcelada (a transação "pai") com cartão, categoria e todas as parcelas.
 * `valor_total`/`qtd_parcelas` são não-nulos quando `parcelado = true`.
 */
export type InstallmentPurchaseWithRelations = TransactionRow & {
  card: Pick<
    CreditCardRow,
    "id" | "nome" | "cor" | "bandeira" | "dia_fechamento" | "dia_vencimento"
  > | null;
  category: Pick<CategoryRow, "id" | "name" | "color" | "icon"> | null;
  installments: InstallmentWithStatement[];
};

/** Item de parcela exibido dentro de uma fatura (tela /faturas). */
export type StatementInstallmentItem = TransactionInstallmentRow & {
  parent:
    | (Pick<TransactionRow, "id" | "description"> & {
        category: Pick<CategoryRow, "id" | "name" | "color"> | null;
      })
    | null;
};

/* ───────────────────── Fase 05 — Gastos de Terceiros & Divisão ───────────────────── */

export type PersonRow = Row<"people">;

export type SharedExpenseRow = Omit<Row<"shared_expenses">, "tipo_divisao"> & {
  tipo_divisao: SplitType;
};

export type ReceivableRow = Omit<Row<"receivables">, "status"> & {
  status: ReceivableStatus;
};

/**
 * Recebível já com as relações resolvidas para a aba "A Receber" e a rastreabilidade
 * compra → fatura → pessoa: a pessoa, o cartão usado e a fatura/transação de origem.
 */
export type ReceivableWithRelations = ReceivableRow & {
  person: Pick<PersonRow, "id" | "nome" | "email"> | null;
  card: Pick<CreditCardRow, "id" | "nome" | "cor" | "bandeira"> | null;
  statement: Pick<
    CardStatementRow,
    "id" | "competencia" | "data_vencimento"
  > | null;
  transaction: Pick<
    TransactionRow,
    "id" | "description" | "purchase_date"
  > | null;
};

/** Recebível com a pessoa embutida — usado para agrupar "quem paga e quanto" na fatura. */
export type ReceivableWithPerson = ReceivableRow & {
  person: Pick<PersonRow, "id" | "nome"> | null;
};

/** Pessoa com a contagem de recebíveis vinculados (para bloquear/inativar na exclusão). */
export type PersonWithCounts = PersonRow & {
  receivables_count: number;
};

/* ───────────────────── Fase 06 — Importação (Excel/CSV/OFX) ───────────────────── */

/** Conteúdo do jsonb `import_batches.column_mapping`: cabeçalho do arquivo + mapeamento. */
export type ImportMappingJson = { headers: string[]; fields: ColumnMapping };

export type ImportBatchRow = Omit<
  Row<"import_batches">,
  "formato" | "origem" | "status" | "column_mapping"
> & {
  formato: ImportFormat;
  origem: ImportOrigem;
  status: ImportBatchStatus;
  column_mapping: ImportMappingJson;
};

/** Parte da divisão configurada numa linha de importação (formato de splitSchema). */
export type ImportSplitPart = {
  person_id: string;
  tipo: SplitType;
  valor?: number | null;
  percentual?: number | null;
};

export type ImportRowRow = Omit<
  Row<"import_rows">,
  "status" | "tipo" | "import_as" | "raw" | "classificacao" | "split_parts"
> & {
  status: ImportRowStatus;
  tipo: "despesa" | "receita" | null;
  import_as: ImportAs;
  raw: string[];
  classificacao: Classificacao;
  split_parts: ImportSplitPart[];
};

/** Lote com o alvo (cartão/conta) resolvido para exibição. */
export type ImportBatchWithTarget = ImportBatchRow & {
  card: Pick<CreditCardRow, "id" | "nome" | "cor" | "bandeira"> | null;
  account: Pick<AccountRow, "id" | "name"> | null;
};

/** Linha de importação com categoria e transação gerada embutidas (revisão e resultado). */
export type ImportRowWithRelations = ImportRowRow & {
  categoria: Pick<CategoryRow, "id" | "name" | "color"> | null;
  transaction: Pick<TransactionRow, "id" | "description"> | null;
};

/* ───────────────────────── Fase 08 — Agenda & Google Agenda ───────────────────────── */

/** Evento da agenda, com os enums estreitados para os literais do domínio. */
export type CalendarEventRow = Omit<
  Row<"calendar_events">,
  "tipo" | "origin" | "recurrence_freq"
> & {
  tipo: EventType;
  origin: EventOrigin;
  recurrence_freq: EventFrequency | null;
};

/** Tokens OAuth do Google (server-only). Nunca enviado ao client. */
export type GoogleIntegrationRow = Row<"google_integrations">;

/**
 * Estado da integração Google exposto ao client — SEM tokens. Apenas o necessário
 * para a UI (conectado, e-mail e último sync).
 */
export type GoogleConnectionStatus = {
  connected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
};

/* ───────────────────── Fase 09 — Demandas, Tarefas & Rotinas ───────────────────── */

export type ProjectRow = Row<"projects">;

/** Tarefa com os enums estreitados e a recorrência tipada (jsonb → TaskRecurrence). */
export type TaskRow = Omit<Row<"tasks">, "priority" | "status" | "recurrence"> & {
  priority: TaskPriority;
  status: TaskStoredStatus;
  recurrence: TaskRecurrence | null;
};

export type TaskChecklistItemRow = Row<"task_checklist_items">;
export type TaskAttachmentRow = Row<"task_attachments">;

export type RoutineRow = Omit<Row<"routines">, "type" | "frequency"> & {
  type: RoutineType;
  frequency: RoutineFrequency;
};

export type RoutineItemRow = Row<"routine_items">;
export type RoutineLogRow = Row<"routine_logs">;

/** Projeto com a contagem de tarefas abertas (pendente/em andamento). */
export type ProjectWithCount = ProjectRow & { open_tasks: number };

/** Tarefa já com as relações resolvidas (projeto, checklist, anexos e evento). */
export type TaskWithRelations = TaskRow & {
  project: Pick<ProjectRow, "id" | "name" | "color" | "icon"> | null;
  checklist: TaskChecklistItemRow[];
  attachments: TaskAttachmentRow[];
  calendar_event: Pick<CalendarEventRow, "id" | "title" | "start_at"> | null;
};

/** Rotina com seus itens (passos). */
export type RoutineWithItems = RoutineRow & { items: RoutineItemRow[] };

/** Aderência de uma rotina numa janela (espelha src/lib/tasks/routines.ts). */
export type RoutineAdherence = { scheduled: number; done: number; rate: number };

/**
 * Rotina pronta para a tela "Rotinas de hoje": itens, log do dia (se houver),
 * aderência dos últimos 7 dias e sequência atual.
 */
export type RoutineWithToday = RoutineWithItems & {
  todayLog: RoutineLogRow | null;
  scheduledToday: boolean;
  adherence7: RoutineAdherence;
  streak: number;
};

/* ───────────────────────────── Fase 10 — Hábitos ───────────────────────────── */

/** Hábito com os enums (categoria/frequência/unidade) estreitados para o domínio. */
export type HabitRow = Omit<
  Row<"habits">,
  "category" | "frequency" | "unit"
> & {
  category: HabitCategory;
  frequency: HabitFrequency;
  unit: HabitUnit;
};

export type HabitLogRow = Row<"habit_logs">;

/** Consistência (taxa de conclusão) numa janela — espelha src/lib/habits/streak.ts. */
export type HabitConsistency = { scheduled: number; done: number; rate: number };

/**
 * Hábito pronto para a UI: log do dia (se houver), se cai hoje, progresso do dia
 * (feito x meta), sequência atual e recorde, consistência de 7 e 30 dias, e as datas
 * concluídas na janela carregada (para o heatmap/histórico).
 */
export type HabitWithStats = HabitRow & {
  todayLog: HabitLogRow | null;
  scheduledToday: boolean;
  /** Valor já registrado hoje (0 quando não há log). */
  todayValue: number;
  /** Hoje atingiu a meta? (derivado do log do dia). */
  todayDone: boolean;
  streak: number;
  bestStreak: number;
  consistency7: HabitConsistency;
  consistency30: HabitConsistency;
  /** Datas 'yyyy-MM-dd' concluídas dentro da janela (para heatmap/histórico). */
  doneDates: string[];
  /** Últimos 7 dias (mais antigo → hoje): valor, conclusão e se estava agendado. */
  last7: HabitDay[];
  /** Registros recentes com valor/observações (para histórico de leitura/exercícios). */
  recentLogs: HabitLogEntry[];
};

/** Um dia da janela curta (semana) de um hábito. */
export type HabitDay = {
  date: string;
  value: number;
  done: boolean;
  scheduled: boolean;
};

/** Registro recente resumido de um hábito (histórico). */
export type HabitLogEntry = {
  log_date: string;
  value: number;
  is_done: boolean;
  notes: string | null;
};

/** Item do ranking de hábitos mais consistentes (período de 30 dias). */
export type HabitRankItem = {
  id: string;
  name: string;
  icon: string | null;
  color: string | null;
  category: HabitCategory;
  rate: number;
  done: number;
  scheduled: number;
  streak: number;
};

/** Ponto do heatmap agregado: fração de hábitos do dia concluídos. */
export type HabitHeatCell = {
  date: string;
  done: number;
  scheduled: number;
  rate: number;
};

/** Ponto da série semanal de consistência (gráfico recharts). */
export type HabitWeekPoint = {
  weekStart: string;
  label: string;
  done: number;
  scheduled: number;
  rate: number;
};

/** Visão agregada de consistência para a aba "Consistência" da tela de hábitos. */
export type HabitsConsistency = {
  completionRate30: number;
  done30: number;
  scheduled30: number;
  weekly: HabitWeekPoint[];
  heatmap: HabitHeatCell[];
  ranking: HabitRankItem[];
};

/** Pacote completo da tela de hábitos (cards do dia + agregados de consistência). */
export type HabitsDashboard = {
  habits: HabitWithStats[];
  consistency: HabitsConsistency;
};

/* ───────────────────────────── Fase 11 — Estudos ───────────────────────────── */

/** Conteúdo do jsonb study_courses.materials: [{ label, url }, ...]. */
export type StudyMaterial = { label: string; url: string };

/** Curso com os enums estreitados e os materiais tipados (jsonb → StudyMaterial[]). */
export type StudyCourseRow = Omit<
  Row<"study_courses">,
  "category" | "status" | "priority" | "materials"
> & {
  category: StudyCategory;
  status: StudyStatus;
  priority: StudyPriority;
  materials: StudyMaterial[];
};

export type StudyModuleRow = Row<"study_modules">;
export type StudyLessonRow = Row<"study_lessons">;

export type StudySessionRow = Omit<Row<"study_sessions">, "difficulty"> & {
  difficulty: StudyDifficulty;
};

export type StudyVocabularyRow = Omit<Row<"study_vocabulary">, "mastery"> & {
  mastery: VocabMastery;
};

export type StudyLanguagePracticeRow = Omit<
  Row<"study_language_practice">,
  "skill"
> & {
  skill: LanguageSkill;
};

/**
 * Curso com estatísticas DERIVADAS na leitura: total/concluídas de aulas, progresso
 * (%), tempo estudado (minutos, soma das sessões), última sessão, próxima aula e o
 * motivo de "atraso" (ou null). Fonte única — sem dupla contagem.
 */
export type StudyCourseStats = StudyCourseRow & {
  totalLessons: number;
  doneLessons: number;
  progressPct: number;
  studiedMinutes: number;
  lastSessionDate: string | null;
  nextLessonTitle: string | null;
  overdue: OverdueReason | null;
};

/** Item de "próxima aula" agregado no dashboard (de cursos em andamento). */
export type NextLessonItem = {
  courseId: string;
  courseTitle: string;
  coverColor: string | null;
  category: StudyCategory;
  icon: string | null;
  lessonId: string;
  lessonTitle: string;
  moduleTitle: string;
};

/** Ponto da série de evolução (minutos estudados por semana). */
export type StudyWeekPoint = {
  weekStart: string;
  label: string;
  minutes: number;
};

/** Curso enxuto para os seletores (form de sessão): com suas aulas. */
export type StudyCourseOption = {
  id: string;
  title: string;
  is_language: boolean;
  lessons: { id: string; title: string }[];
};

/**
 * Pacote completo da tela de estudos (painel + cursos + sessões + idiomas). Uma única
 * leitura agregada alimenta todas as visões (espelha getHabitsDashboard da Fase 10).
 */
export type StudyDashboard = {
  courses: StudyCourseStats[];
  totalCourses: number;
  inProgress: number;
  completed: number;
  minutesWeek: number;
  minutesMonth: number;
  streak: number;
  bestStreak: number;
  nextLessons: NextLessonItem[];
  overdue: StudyCourseStats[];
  weekly: StudyWeekPoint[];
  /** Histórico global recente de sessões (visão "Sessões"). */
  recentSessions: StudySessionWithRelations[];
  /** Cursos + aulas para o seletor do formulário de sessão. */
  courseOptions: StudyCourseOption[];
  /** Tarefas abertas (Fase 09) para vínculo opcional na sessão. */
  taskOptions: StudyTaskOption[];
  /** Minutos de prática de idioma NA SEMANA, por curso (visão "Idiomas"). */
  practiceWeekByCourse: Record<string, number>;
};

/** Módulo com suas aulas (árvore do curso). */
export type StudyModuleWithLessons = StudyModuleRow & {
  lessons: StudyLessonRow[];
};

/** Sessão de estudo com a aula e a tarefa vinculadas resolvidas (histórico). */
export type StudySessionWithRelations = StudySessionRow & {
  lesson: Pick<StudyLessonRow, "id" | "title"> | null;
  task: Pick<TaskRow, "id" | "title"> | null;
  courseTitle?: string;
  courseColor?: string | null;
};

/** Progresso semanal de idioma (meta + realizado por habilidade). */
export type LanguageWeekProgress = {
  goalMinutes: number | null;
  doneMinutes: number;
  bySkill: Record<LanguageSkill, number>;
};

/** Opção de tarefa para vincular a uma sessão (Fase 09). */
export type StudyTaskOption = { id: string; title: string };

/** Detalhe completo de um curso (árvore + sessões + idioma). */
export type StudyCourseDetail = StudyCourseStats & {
  modules: StudyModuleWithLessons[];
  sessions: StudySessionWithRelations[];
  vocabulary: StudyVocabularyRow[];
  practice: StudyLanguagePracticeRow[];
  languageWeek: LanguageWeekProgress;
  taskOptions: StudyTaskOption[];
};

/* ───────────────────────────── Fase 12 — Dashboard Geral ───────────────────────────── */

/**
 * Preferências do usuário (Fase 12). O jsonb `dashboard_layout` é estreitado para
 * DashboardLayout (ordem/visibilidade dos cards + período/visão padrão). Reutilizável
 * pela Fase 14. Uma linha por usuário (unique user_id).
 */
export type SettingsRow = Omit<Row<"settings">, "dashboard_layout"> & {
  dashboard_layout: DashboardLayout;
};

/* ───────────────────────────── Fase 13 — Notificações ───────────────────────────── */

/**
 * Notificação (Fase 13). `type`/`priority` estreitados para os literais de
 * src/lib/notifications/constants.ts (o banco aceita texto livre por flexibilidade,
 * mas o app só produz/lê estes valores).
 */
export type NotificationRow = Omit<Row<"notifications">, "type" | "priority"> & {
  type: NotificationType;
  priority: NotificationPriority;
};
