/**
 * Fase 15 — Módulo TO-DO · Fonte única dos enums, rótulos pt-BR e tokens visuais.
 *
 * Módulo PURO (sem React): alimenta os tipos TS, os schemas Zod, as queries, o gerador
 * de notificações e a UI. Os valores casam 1:1 com os CHECKs das migrations `todo_*` —
 * mexer aqui exige mexer lá.
 */

/* ───────────────────────────── Status ───────────────────────────── */

/**
 * Status GRAVÁVEIS de uma tarefa. 'atrasada' NÃO está aqui de propósito: é derivado na
 * leitura a partir das datas (ver `src/lib/todo/status.ts`) — mesma regra das Fases 03/09.
 */
export const TODO_STATUSES = [
  "pendente",
  "em_andamento",
  "concluida",
  "cancelada",
  "arquivada",
] as const;
export type TodoStatus = (typeof TODO_STATUSES)[number];

export const TODO_STATUS_LABELS: Record<TodoStatus, string> = {
  pendente: "Pendente",
  em_andamento: "Em andamento",
  concluida: "Concluída",
  cancelada: "Cancelada",
  arquivada: "Arquivada",
};

/** Status EFETIVO exibido na UI (inclui o derivado 'atrasada'). */
export const TODO_EFFECTIVE_STATUSES = [...TODO_STATUSES, "atrasada"] as const;
export type TodoEffectiveStatus = (typeof TODO_EFFECTIVE_STATUSES)[number];

export const TODO_EFFECTIVE_STATUS_LABELS: Record<TodoEffectiveStatus, string> = {
  ...TODO_STATUS_LABELS,
  atrasada: "Atrasada",
};

/**
 * Classes do badge de status. Legíveis em dark e light; nunca dependem SÓ da cor
 * (o rótulo textual sempre acompanha) — exigência de acessibilidade da fase.
 */
export const TODO_STATUS_BADGE: Record<TodoEffectiveStatus, string> = {
  pendente: "border-transparent bg-muted text-muted-foreground",
  em_andamento: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300",
  concluida: "border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  atrasada: "border-transparent bg-destructive/15 text-destructive",
  cancelada: "border-transparent bg-muted text-muted-foreground line-through",
  arquivada: "border-transparent bg-muted text-muted-foreground",
};

/** Status que contam como "fechados" (não aparecem nas visões de trabalho). */
export const TODO_CLOSED_STATUSES: readonly TodoStatus[] = [
  "concluida",
  "cancelada",
  "arquivada",
];

export function isClosedStatus(status: TodoStatus): boolean {
  return TODO_CLOSED_STATUSES.includes(status);
}

/* ───────────────────────────── Prioridade ───────────────────────────── */

/**
 * P1 (urgente) … P4 (normal). Guardado como smallint 1..4 — ordena direto no banco.
 * A identidade do sistema é dourada, então o dourado marca P2 (alta) e a prioridade
 * máxima usa o vermelho destrutivo, que já significa "atenção" no resto do app.
 */
export const TODO_PRIORITIES = [1, 2, 3, 4] as const;
export type TodoPriority = (typeof TODO_PRIORITIES)[number];

export const TODO_PRIORITY_LABELS: Record<TodoPriority, string> = {
  1: "P1 — Urgente",
  2: "P2 — Alta",
  3: "P3 — Média",
  4: "P4 — Normal",
};

/** Rótulo curto para chips/badges compactos. */
export const TODO_PRIORITY_SHORT: Record<TodoPriority, string> = {
  1: "P1",
  2: "P2",
  3: "P3",
  4: "P4",
};

/** Cor do indicador (bandeira). O rótulo P1..P4 SEMPRE acompanha — nunca só cor. */
export const TODO_PRIORITY_FLAG: Record<TodoPriority, string> = {
  1: "text-destructive",
  2: "text-primary",
  3: "text-sky-600 dark:text-sky-400",
  4: "text-muted-foreground",
};

export const TODO_PRIORITY_BADGE: Record<TodoPriority, string> = {
  1: "border-transparent bg-destructive/15 text-destructive",
  2: "border-transparent bg-primary/15 text-primary",
  3: "border-transparent bg-sky-500/15 text-sky-700 dark:text-sky-300",
  4: "border-transparent bg-muted text-muted-foreground",
};

export function asPriority(value: unknown): TodoPriority {
  const n = Math.floor(Number(value));
  return n === 1 || n === 2 || n === 3 ? (n as TodoPriority) : 4;
}

/* ───────────────────────────── Cores (projetos/etiquetas) ───────────────────────────── */

/**
 * Paleta fechada de tokens de cor. Guardar o TOKEN (não o hex) mantém as cores
 * consistentes com o tema e funcionando em dark/light sem recalcular contraste.
 */
export const TODO_COLORS = [
  "gold",
  "grafite",
  "azul",
  "verde",
  "vermelho",
  "roxo",
  "laranja",
  "rosa",
] as const;
export type TodoColor = (typeof TODO_COLORS)[number];

export const TODO_COLOR_LABELS: Record<TodoColor, string> = {
  gold: "Dourado",
  grafite: "Grafite",
  azul: "Azul",
  verde: "Verde",
  vermelho: "Vermelho",
  roxo: "Roxo",
  laranja: "Laranja",
  rosa: "Rosa",
};

/** Classe de PREENCHIMENTO (bolinha/ponto do projeto ou etiqueta). */
export const TODO_COLOR_DOT: Record<TodoColor, string> = {
  gold: "bg-primary",
  grafite: "bg-foreground/60",
  azul: "bg-sky-500",
  verde: "bg-emerald-500",
  vermelho: "bg-red-500",
  roxo: "bg-violet-500",
  laranja: "bg-orange-500",
  rosa: "bg-pink-500",
};

/** Classe de CHIP (fundo suave + texto legível nos dois temas). */
export const TODO_COLOR_CHIP: Record<TodoColor, string> = {
  gold: "bg-primary/15 text-primary",
  grafite: "bg-muted text-muted-foreground",
  azul: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  verde: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  vermelho: "bg-red-500/15 text-red-700 dark:text-red-300",
  roxo: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  laranja: "bg-orange-500/15 text-orange-700 dark:text-orange-300",
  rosa: "bg-pink-500/15 text-pink-700 dark:text-pink-300",
};

export function asColor(value: unknown): TodoColor {
  return (TODO_COLORS as readonly string[]).includes(String(value))
    ? (value as TodoColor)
    : "gold";
}

/* ───────────────────────────── Visões e navegação ───────────────────────────── */

/** Visão de renderização de uma lista de tarefas. */
export const TODO_VIEWS = ["lista", "quadro", "calendario"] as const;
export type TodoView = (typeof TODO_VIEWS)[number];

export const TODO_VIEW_LABELS: Record<TodoView, string> = {
  lista: "Lista",
  quadro: "Quadro",
  calendario: "Calendário",
};

/** Visões fixas da navegação interna do módulo (slug usado na URL `?v=`). */
export const TODO_NAV_VIEWS = [
  "entrada",
  "hoje",
  "proximos",
  "todas",
  "concluidas",
] as const;
export type TodoNavView = (typeof TODO_NAV_VIEWS)[number];

export const TODO_NAV_VIEW_LABELS: Record<TodoNavView, string> = {
  entrada: "Caixa de entrada",
  hoje: "Hoje",
  proximos: "Próximos",
  todas: "Todas as tarefas",
  concluidas: "Concluídas",
};

/** Sub-modo da visão "Próximos". */
export const TODO_UPCOMING_MODES = ["dias", "semana", "mes"] as const;
export type TodoUpcomingMode = (typeof TODO_UPCOMING_MODES)[number];

export const TODO_UPCOMING_MODE_LABELS: Record<TodoUpcomingMode, string> = {
  dias: "Lista por dia",
  semana: "Semana",
  mes: "Calendário mensal",
};

/* ───────────────────────────── Ordenação e agrupamento ───────────────────────────── */

export const TODO_SORTS = [
  "manual",
  "data",
  "horario",
  "prazo",
  "prioridade",
  "nome",
  "criacao",
  "conclusao",
] as const;
export type TodoSort = (typeof TODO_SORTS)[number];

export const TODO_SORT_LABELS: Record<TodoSort, string> = {
  manual: "Ordem manual",
  data: "Data programada",
  horario: "Horário",
  prazo: "Prazo final",
  prioridade: "Prioridade",
  nome: "Nome",
  criacao: "Data de criação",
  conclusao: "Data de conclusão",
};

export const TODO_GROUPS = [
  "nenhum",
  "projeto",
  "secao",
  "prioridade",
  "etiqueta",
  "data",
  "status",
] as const;
export type TodoGroup = (typeof TODO_GROUPS)[number];

export const TODO_GROUP_LABELS: Record<TodoGroup, string> = {
  nenhum: "Sem agrupamento",
  projeto: "Projeto",
  secao: "Seção",
  prioridade: "Prioridade",
  etiqueta: "Etiqueta",
  data: "Data",
  status: "Status",
};

export const TODO_SORT_DIRS = ["asc", "desc"] as const;
export type TodoSortDir = (typeof TODO_SORT_DIRS)[number];

/* ───────────────────────────── Recorrência ───────────────────────────── */

export const TODO_FREQUENCIES = ["diaria", "semanal", "mensal", "anual"] as const;
export type TodoFrequency = (typeof TODO_FREQUENCIES)[number];

export const TODO_FREQUENCY_LABELS: Record<TodoFrequency, string> = {
  diaria: "Diária",
  semanal: "Semanal",
  mensal: "Mensal",
  anual: "Anual",
};

/**
 * Como a próxima data é calculada:
 *  • 'fixo'           — ancorada no CALENDÁRIO (toda segunda continua na segunda, mesmo
 *                       que a conclusão tenha sido na terça).
 *  • 'apos_conclusao' — contada A PARTIR DA CONCLUSÃO ("a cada 7 dias após concluir":
 *                       concluiu dia 10 → próxima dia 17).
 */
export const TODO_RECURRENCE_MODES = ["fixo", "apos_conclusao"] as const;
export type TodoRecurrenceMode = (typeof TODO_RECURRENCE_MODES)[number];

export const TODO_RECURRENCE_MODE_LABELS: Record<TodoRecurrenceMode, string> = {
  fixo: "Data fixa no calendário",
  apos_conclusao: "Contar a partir da conclusão",
};

export const TODO_BUSINESS_DAY_RULES = [
  "primeiro_dia_util",
  "ultimo_dia_util",
  "apenas_dias_uteis",
] as const;
export type TodoBusinessDayRule = (typeof TODO_BUSINESS_DAY_RULES)[number];

export const TODO_BUSINESS_DAY_RULE_LABELS: Record<TodoBusinessDayRule, string> = {
  primeiro_dia_util: "Primeiro dia útil do mês",
  ultimo_dia_util: "Último dia útil do mês",
  apenas_dias_uteis: "Somente em dias úteis",
};

/** Escopo de uma edição/exclusão em série recorrente. */
export const TODO_SERIES_SCOPES = ["ocorrencia", "futuras", "serie"] as const;
export type TodoSeriesScope = (typeof TODO_SERIES_SCOPES)[number];

export const TODO_SERIES_SCOPE_LABELS: Record<TodoSeriesScope, string> = {
  ocorrencia: "Somente esta ocorrência",
  futuras: "Esta e as próximas",
  serie: "Toda a série",
};

/* ───────────────────────────── Dias da semana ───────────────────────────── */

/** 0 = domingo … 6 = sábado (mesma convenção de `Date.getDay()`). */
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export const WEEKDAY_LABELS: Record<number, string> = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
};

export const WEEKDAY_SHORT: Record<number, string> = {
  0: "Dom",
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
};

/* ───────────────────────────── Outros enums ───────────────────────────── */

export const TODO_SOURCES = [
  "manual",
  "rapido",
  "recorrencia",
  "agenda",
  "estudos",
  "financeiro",
  "habitos",
  "importacao",
] as const;
export type TodoSource = (typeof TODO_SOURCES)[number];

export const TODO_SOURCE_LABELS: Record<TodoSource, string> = {
  manual: "Criada manualmente",
  rapido: "Lançamento rápido",
  recorrencia: "Gerada por recorrência",
  agenda: "Vinda da agenda",
  estudos: "Vinda de estudos",
  financeiro: "Vinda do financeiro",
  habitos: "Vinda de hábitos",
  importacao: "Importada",
};

/**
 * Canais de lembrete. Só 'interno' (o sino de notificações) está IMPLEMENTADO — os
 * demais existem no schema para evolução futura e não são oferecidos na UI enquanto
 * não houver infraestrutura real (a regra do projeto proíbe simular canal inexistente).
 */
export const TODO_REMINDER_CHANNELS = ["interno", "email", "push"] as const;
export type TodoReminderChannel = (typeof TODO_REMINDER_CHANNELS)[number];

export const TODO_REMINDER_CHANNELS_ENABLED: readonly TodoReminderChannel[] = ["interno"];

export const TODO_REMINDER_CHANNEL_LABELS: Record<TodoReminderChannel, string> = {
  interno: "Notificação no sistema",
  email: "E-mail",
  push: "Push",
};

/** Offsets rápidos de lembrete, em minutos antes do horário da tarefa. */
export const TODO_REMINDER_OFFSETS = [0, 5, 15, 30, 60, 1440] as const;

export const TODO_REMINDER_OFFSET_LABELS: Record<number, string> = {
  0: "No horário",
  5: "5 minutos antes",
  15: "15 minutos antes",
  30: "30 minutos antes",
  60: "1 hora antes",
  1440: "1 dia antes",
};

/** Eventos do histórico de atividades (rótulos pt-BR). */
export const TODO_ACTIVITY_LABELS: Record<string, string> = {
  criada: "Tarefa criada",
  titulo_alterado: "Título alterado",
  descricao_alterada: "Descrição alterada",
  projeto_alterado: "Projeto alterado",
  secao_alterada: "Seção alterada",
  data_alterada: "Data alterada",
  prazo_alterado: "Prazo alterado",
  prioridade_alterada: "Prioridade alterada",
  etiqueta_adicionada: "Etiqueta adicionada",
  etiqueta_removida: "Etiqueta removida",
  comentario_criado: "Comentário adicionado",
  anexo_adicionado: "Anexo adicionado",
  anexo_removido: "Anexo removido",
  concluida: "Tarefa concluída",
  reaberta: "Tarefa reaberta",
  cancelada: "Tarefa cancelada",
  recorrencia_alterada: "Recorrência alterada",
  lembrete_criado: "Lembrete criado",
  lembrete_removido: "Lembrete removido",
  arquivada: "Tarefa arquivada",
  restaurada: "Tarefa restaurada",
  movida: "Tarefa movida",
  duplicada: "Tarefa duplicada",
  promovida: "Convertida em tarefa principal",
  rebaixada: "Convertida em subtarefa",
};

export function activityLabel(eventType: string): string {
  return TODO_ACTIVITY_LABELS[eventType] ?? "Alteração";
}

/* ───────────────────────────── Anexos ───────────────────────────── */

/** Entity types usados na tabela genérica `attachments` (Fase 14) — sem tabela nova. */
export const TODO_ATTACHMENT_ENTITY = "todo_task";
export const TODO_COMMENT_ATTACHMENT_ENTITY = "todo_comment";

/** Limite de tamanho por arquivo (10 MB). Validado no cliente E no servidor. */
export const TODO_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** Tipos MIME aceitos. Lista fechada — nada de executável. */
export const TODO_ATTACHMENT_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
];

export const TODO_ATTACHMENT_ACCEPT = TODO_ATTACHMENT_MIME_TYPES.join(",");
