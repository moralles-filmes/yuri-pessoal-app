/**
 * Fase 15 — Módulo TO-DO · Schemas Zod.
 *
 * Validação de SERVIDOR (as actions sempre re-validam o que vem do client — nunca
 * confiar só no formulário). Reaproveita os helpers de `validators/shared.ts`.
 *
 * `user_id` NÃO aparece em nenhum schema: ele vem sempre de `auth.getUser()` na action.
 * Isso é a proteção contra mass assignment exigida pela fase.
 */
import { z } from "zod";
import {
  TODO_BUSINESS_DAY_RULES,
  TODO_COLORS,
  TODO_FREQUENCIES,
  TODO_GROUPS,
  TODO_PRIORITIES,
  TODO_RECURRENCE_MODES,
  TODO_REMINDER_CHANNELS_ENABLED,
  TODO_SERIES_SCOPES,
  TODO_SORT_DIRS,
  TODO_SORTS,
  TODO_STATUSES,
  TODO_VIEWS,
  TODO_ATTACHMENT_MAX_BYTES,
  TODO_ATTACHMENT_MIME_TYPES,
} from "@/lib/todo/constants";
import {
  optionalDate,
  optionalText,
  optionalTime,
  optionalUuid,
} from "@/lib/validators/shared";

/* ───────────────────────────── Projeto ───────────────────────────── */

export const todoProjectSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe um nome")
    .max(120, "Máximo de 120 caracteres"),
  description: optionalText(2000),
  icon: optionalText(60),
  color: z.enum(TODO_COLORS).optional().transform((v) => v ?? "gold"),
  is_favorite: z.coerce.boolean().optional().transform((v) => v ?? false),
  default_view: z.enum(TODO_VIEWS).optional().transform((v) => v ?? "lista"),
  parent_project_id: optionalUuid,
});

export type TodoProjectInput = z.infer<typeof todoProjectSchema>;

/**
 * O que fazer com as tarefas ao excluir um projeto. Nunca há exclusão silenciosa:
 * a action exige uma destas escolhas e a UI só oferece 'excluir_tudo' com confirmação
 * reforçada.
 */
export const todoProjectDeleteSchema = z.object({
  strategy: z.enum(["mover_entrada", "mover_projeto", "excluir_tudo"]),
  /** Obrigatório quando `strategy = 'mover_projeto'`. */
  target_project_id: optionalUuid,
}).refine(
  (v) => v.strategy !== "mover_projeto" || !!v.target_project_id,
  { message: "Escolha o projeto de destino", path: ["target_project_id"] },
);

export type TodoProjectDeleteInput = z.infer<typeof todoProjectDeleteSchema>;

/* ───────────────────────────── Seção ───────────────────────────── */

export const todoSectionSchema = z.object({
  project_id: z.uuid("Projeto inválido"),
  name: z.string().trim().min(1, "Informe um nome").max(120, "Máximo de 120 caracteres"),
  description: optionalText(1000),
});

export type TodoSectionInput = z.infer<typeof todoSectionSchema>;

export const todoSectionDeleteSchema = z.object({
  strategy: z.enum(["mover_secao", "sem_secao", "excluir_tudo"]),
  /** Obrigatório quando `strategy = 'mover_secao'`. */
  target_section_id: optionalUuid,
}).refine(
  (v) => v.strategy !== "mover_secao" || !!v.target_section_id,
  { message: "Escolha a seção de destino", path: ["target_section_id"] },
);

export type TodoSectionDeleteInput = z.infer<typeof todoSectionDeleteSchema>;

/* ───────────────────────────── Etiqueta ───────────────────────────── */

export const todoLabelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe um nome")
    .max(60, "Máximo de 60 caracteres")
    // '@' é só um enfeite visual da UI; guardamos o nome limpo.
    .transform((v) => v.replace(/^@+/, "").trim())
    .refine((v) => v.length > 0, "Informe um nome"),
  description: optionalText(500),
  color: z.enum(TODO_COLORS).optional().transform((v) => v ?? "gold"),
});

export type TodoLabelInput = z.infer<typeof todoLabelSchema>;

/* ───────────────────────────── Recorrência ───────────────────────────── */

/**
 * Regra de recorrência. `null` = tarefa não recorre. As validações cruzadas garantem
 * que padrões incompletos não sejam gravados (ex.: "n-ésima segunda" sem dizer qual dia).
 */
export const todoRecurrenceSchema = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .object({
      frequency: z.enum(TODO_FREQUENCIES),
      interval_count: z.coerce
        .number()
        .int()
        .min(1, "O intervalo mínimo é 1")
        .max(999, "Intervalo muito alto")
        .optional()
        .transform((n) => n ?? 1),
      days_of_week: z
        .array(z.coerce.number().int().min(0).max(6))
        .optional()
        .nullable()
        .transform((arr) =>
          arr && arr.length ? Array.from(new Set(arr)).sort((a, b) => a - b) : null,
        ),
      // -1 = último dia do mês.
      day_of_month: z
        .union([z.coerce.number().int().min(-1).max(31), z.null()])
        .optional()
        .transform((v) => (v === 0 || v === undefined ? null : (v ?? null))),
      month_of_year: z
        .union([z.coerce.number().int().min(1).max(12), z.null()])
        .optional()
        .transform((v) => v ?? null),
      // -1 = última semana do mês.
      week_of_month: z
        .union([z.coerce.number().int().min(-1).max(4), z.null()])
        .optional()
        .transform((v) => (v === 0 || v === undefined ? null : (v ?? null))),
      business_day_rule: z
        .union([z.enum(TODO_BUSINESS_DAY_RULES), z.null()])
        .optional()
        .transform((v) => v ?? null),
      recurrence_mode: z
        .enum(TODO_RECURRENCE_MODES)
        .optional()
        .transform((v) => v ?? "fixo"),
      starts_on: optionalDate,
      ends_on: optionalDate,
      max_occurrences: z
        .union([z.coerce.number().int().min(1).max(9999), z.null()])
        .optional()
        .transform((v) => v ?? null),
      is_paused: z.coerce.boolean().optional().transform((v) => v ?? false),
    })
    .superRefine((v, ctx) => {
      if (v.week_of_month != null && (!v.days_of_week || v.days_of_week.length === 0)) {
        ctx.addIssue({
          code: "custom",
          path: ["days_of_week"],
          message: "Escolha o dia da semana para o padrão mensal",
        });
      }
      if (v.ends_on && v.starts_on && v.ends_on < v.starts_on) {
        ctx.addIssue({
          code: "custom",
          path: ["ends_on"],
          message: "O fim da recorrência deve ser posterior ao início",
        });
      }
      if (v.frequency === "anual" && v.month_of_year == null && v.day_of_month != null) {
        ctx.addIssue({
          code: "custom",
          path: ["month_of_year"],
          message: "Escolha o mês da recorrência anual",
        });
      }
    })
    .nullable(),
);

/* ───────────────────────────── Tarefa ───────────────────────────── */

/** Duração em minutos (opcional). "" / 0 / ausente vira null. */
const optionalDuration = z.preprocess(
  (v) => (v === "" || v === undefined || v === null || v === 0 || v === "0" ? null : v),
  z
    .coerce.number()
    .int("Use minutos inteiros")
    .min(1, "A duração mínima é 1 minuto")
    .max(60 * 24 * 30, "Duração muito longa")
    .nullable(),
);

/** Schema completo da tarefa (formulário de detalhes). */
export const todoTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Informe um título")
      .max(300, "Máximo de 300 caracteres"),
    description: optionalText(10000),
    project_id: optionalUuid,
    section_id: optionalUuid,
    parent_task_id: optionalUuid,
    status: z.enum(TODO_STATUSES).optional().transform((v) => v ?? "pendente"),
    priority: z
      .coerce.number()
      .int()
      .refine((n): n is 1 | 2 | 3 | 4 => (TODO_PRIORITIES as readonly number[]).includes(n), {
        message: "Prioridade inválida",
      })
      .optional()
      .transform((v) => v ?? 4),
    scheduled_date: optionalDate,
    scheduled_time: optionalTime,
    duration_minutes: optionalDuration,
    deadline_at: optionalDate,
    label_ids: z
      .array(z.uuid())
      .optional()
      .transform((v) => v ?? []),
    recurrence: todoRecurrenceSchema,
  })
  .superRefine((v, ctx) => {
    // O prazo é o limite: não faz sentido programar a execução depois dele.
    if (v.scheduled_date && v.deadline_at && v.deadline_at < v.scheduled_date) {
      ctx.addIssue({
        code: "custom",
        path: ["deadline_at"],
        message: "O prazo final deve ser igual ou posterior à data programada",
      });
    }
    // Duração sem horário não posiciona nada no calendário.
    if (v.duration_minutes && !v.scheduled_time) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduled_time"],
        message: "Informe o horário para poder estimar a duração",
      });
    }
    // Recorrência precisa de uma data-âncora, senão não há de onde contar.
    if (v.recurrence && !v.scheduled_date && !v.deadline_at) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduled_date"],
        message: "Defina uma data para a tarefa poder se repetir",
      });
    }
  });

export type TodoTaskInput = z.infer<typeof todoTaskSchema>;

/**
 * Criação RÁPIDA: só o essencial. Mantém a captura em poucos segundos — os demais
 * campos são preenchidos depois, ao abrir a tarefa.
 */
export const todoQuickTaskSchema = z
  .object({
    title: z.string().trim().min(1, "Informe um título").max(300, "Máximo de 300 caracteres"),
    project_id: optionalUuid,
    section_id: optionalUuid,
    parent_task_id: optionalUuid,
    scheduled_date: optionalDate,
    scheduled_time: optionalTime,
    // Aceito aqui porque a interpretação de texto reconhece "até <data>"; sem isso o
    // chip "Prazo final" prometeria algo que não seria salvo.
    deadline_at: optionalDate,
    priority: z
      .coerce.number()
      .int()
      .refine((n): n is 1 | 2 | 3 | 4 => (TODO_PRIORITIES as readonly number[]).includes(n), {
        message: "Prioridade inválida",
      })
      .optional()
      .transform((v) => v ?? 4),
    label_ids: z.array(z.uuid()).optional().transform((v) => v ?? []),
    recurrence: todoRecurrenceSchema,
  })
  .superRefine((v, ctx) => {
    // Mesma regra da edição completa: o prazo é o limite da execução.
    if (v.scheduled_date && v.deadline_at && v.deadline_at < v.scheduled_date) {
      ctx.addIssue({
        code: "custom",
        path: ["deadline_at"],
        message: "O prazo final deve ser igual ou posterior à data programada",
      });
    }
  });

export type TodoQuickTaskInput = z.infer<typeof todoQuickTaskSchema>;

/** Movimentação (drag/menu): destino + nova ordem. */
export const todoMoveSchema = z.object({
  project_id: optionalUuid,
  section_id: optionalUuid,
  position: z.coerce.number().int().min(0).optional().transform((v) => v ?? 0),
});

export type TodoMoveInput = z.infer<typeof todoMoveSchema>;

/** Escopo de uma edição/exclusão em série recorrente. */
export const todoSeriesScopeSchema = z
  .enum(TODO_SERIES_SCOPES)
  .optional()
  .transform((v) => v ?? "ocorrencia");

/* ───────────────────────────── Comentário ───────────────────────────── */

export const todoCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Escreva algo")
    .max(5000, "Máximo de 5000 caracteres"),
});

export type TodoCommentInput = z.infer<typeof todoCommentSchema>;

/* ───────────────────────────── Lembrete ───────────────────────────── */

/**
 * Lembrete. Só canais IMPLEMENTADOS são aceitos (hoje: 'interno') — a fase proíbe
 * expor canal sem infraestrutura real.
 */
export const todoReminderSchema = z
  .object({
    remind_at: z
      .string()
      .refine((s) => !Number.isNaN(new Date(s).getTime()), "Data/hora inválida"),
    offset_minutes: z
      .union([z.coerce.number().int().min(0).max(60 * 24 * 30), z.null()])
      .optional()
      .transform((v) => v ?? null),
    channel: z
      .enum(TODO_REMINDER_CHANNELS_ENABLED as unknown as [string, ...string[]])
      .optional()
      .transform((v) => v ?? "interno"),
  });

export type TodoReminderInput = z.infer<typeof todoReminderSchema>;

/* ───────────────────────────── Anexo ───────────────────────────── */

/**
 * Metadados do anexo. A validação de tipo/tamanho acontece AQUI (servidor) além do
 * `accept` do input — o cliente não é autoridade. O arquivo em si vai para o bucket
 * privado `attachments` (Fase 14), no caminho '{user_id}/todo_task/{task_id}/...'.
 */
export const todoAttachmentSchema = z.object({
  file_name: z.string().trim().min(1, "Nome do arquivo inválido").max(300),
  mime_type: z
    .string()
    .trim()
    .refine(
      (v) => TODO_ATTACHMENT_MIME_TYPES.includes(v),
      "Tipo de arquivo não permitido",
    ),
  size_bytes: z.coerce
    .number()
    .int()
    .positive("Arquivo vazio")
    .max(TODO_ATTACHMENT_MAX_BYTES, "O arquivo passa de 10 MB"),
  storage_path: z.string().trim().min(1),
  /** Quando presente, o anexo pertence a um comentário e não à tarefa. */
  comment_id: optionalUuid,
});

export type TodoAttachmentInput = z.infer<typeof todoAttachmentSchema>;

/* ───────────────────────────── Filtro salvo ───────────────────────────── */

const uuidArray = z.array(z.uuid()).optional().nullable().transform((v) => v ?? null);
const boolFlag = z.union([z.boolean(), z.null()]).optional().transform((v) => v ?? null);

/** Shape de `todo_saved_filters.filter_definition` — espelha `TodoFilterDefinition`. */
export const todoFilterDefinitionSchema = z.object({
  search: optionalText(200),
  projectIds: uuidArray,
  sectionIds: uuidArray,
  labelIds: uuidArray,
  priorities: z
    .array(z.coerce.number().int().min(1).max(4))
    .optional()
    .nullable()
    .transform((v) => (v && v.length ? (v as (1 | 2 | 3 | 4)[]) : null)),
  statuses: z
    .array(z.enum(TODO_STATUSES))
    .optional()
    .nullable()
    .transform((v) => (v && v.length ? v : null)),
  scheduledFrom: optionalDate,
  scheduledTo: optionalDate,
  deadlineFrom: optionalDate,
  deadlineTo: optionalDate,
  createdFrom: optionalDate,
  createdTo: optionalDate,
  completedFrom: optionalDate,
  completedTo: optionalDate,
  onlyOverdue: boolFlag,
  onlyToday: boolFlag,
  onlyUpcoming: boolFlag,
  onlyNoDate: boolFlag,
  onlyRecurring: boolFlag,
  onlyWithReminder: boolFlag,
  onlyWithComments: boolFlag,
  onlyWithAttachments: boolFlag,
  onlyParents: boolFlag,
  onlySubtasks: boolFlag,
  includeCompleted: boolFlag,
  includeArchived: boolFlag,
});

export const todoSavedFilterSchema = z.object({
  name: z.string().trim().min(1, "Informe um nome").max(120, "Máximo de 120 caracteres"),
  description: optionalText(500),
  icon: optionalText(60),
  color: z.enum(TODO_COLORS).optional().transform((v) => v ?? "gold"),
  is_favorite: z.coerce.boolean().optional().transform((v) => v ?? false),
  show_in_nav: z.coerce.boolean().optional().transform((v) => v ?? true),
  filter_definition: todoFilterDefinitionSchema,
});

export type TodoSavedFilterInput = z.infer<typeof todoSavedFilterSchema>;

/* ───────────────────────────── Preferências ───────────────────────────── */

export const todoPreferenceSchema = z.object({
  scope: z.string().trim().min(1).max(80).optional().transform((v) => v ?? "global"),
  view: z.enum(TODO_VIEWS).optional().transform((v) => v ?? "lista"),
  sort_by: z.enum(TODO_SORTS).optional().transform((v) => v ?? "manual"),
  sort_dir: z.enum(TODO_SORT_DIRS).optional().transform((v) => v ?? "asc"),
  group_by: z.enum(TODO_GROUPS).optional().transform((v) => v ?? "nenhum"),
  show_completed: z.coerce.boolean().optional().transform((v) => v ?? false),
});

export type TodoPreferenceInput = z.infer<typeof todoPreferenceSchema>;

/* ───────────────────────────── Ações em massa ───────────────────────────── */

/** Ação aplicada a várias tarefas de uma vez. Máx. 500 por chamada. */
export const todoBulkSchema = z
  .object({
    ids: z.array(z.uuid()).min(1, "Selecione ao menos uma tarefa").max(500),
    action: z.enum([
      "concluir",
      "reabrir",
      "mover_projeto",
      "mover_secao",
      "prioridade",
      "adicionar_etiqueta",
      "remover_etiqueta",
      "data",
      "adiar",
      "arquivar",
      "excluir",
    ]),
    project_id: optionalUuid,
    section_id: optionalUuid,
    label_id: optionalUuid,
    priority: z
      .union([z.coerce.number().int().min(1).max(4), z.null()])
      .optional()
      .transform((v) => v ?? null),
    scheduled_date: optionalDate,
    /** Dias a adiar (usado com `action = 'adiar'`). */
    days: z.coerce.number().int().min(1).max(365).optional().transform((v) => v ?? 1),
  })
  .superRefine((v, ctx) => {
    const need = (field: "project_id" | "section_id" | "label_id" | "priority", action: string) => {
      if (v.action === action && v[field] == null) {
        ctx.addIssue({ code: "custom", path: [field], message: "Escolha o destino da ação" });
      }
    };
    need("project_id", "mover_projeto");
    need("section_id", "mover_secao");
    need("label_id", "adicionar_etiqueta");
    need("label_id", "remover_etiqueta");
    need("priority", "prioridade");
  });

export type TodoBulkInput = z.infer<typeof todoBulkSchema>;
