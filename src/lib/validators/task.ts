import { z } from "zod";
import {
  TASK_PRIORITIES,
  TASK_RECURRENCE_FREQUENCIES,
  TASK_STORED_STATUSES,
} from "@/lib/tasks/constants";
import {
  optionalDate,
  optionalText,
  optionalUuid,
  tagsArray,
} from "@/lib/validators/shared";

/**
 * Recorrência da tarefa (coluna jsonb versionável). Aceita objeto ou null/ausente.
 * Normaliza weekdays (dedup/ordena/filtra 0–6) e zera o intervalo mínimo em 1.
 */
export const taskRecurrenceSchema = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z
    .object({
      freq: z.enum(TASK_RECURRENCE_FREQUENCIES),
      interval: z.coerce
        .number()
        .int()
        .min(1, "Intervalo mínimo é 1")
        .optional()
        .transform((n) => n ?? 1),
      weekdays: z
        .array(z.coerce.number().int().min(0).max(6))
        .optional()
        .transform((arr) =>
          arr && arr.length
            ? Array.from(new Set(arr)).sort((a, b) => a - b)
            : null,
        )
        .nullable(),
      until: optionalDate,
    })
    .nullable(),
);

/** Lembrete: ISO datetime (timestamptz) ou null. */
const reminderAt = z.preprocess(
  (v) => (v === "" || v === undefined || v === null ? null : v),
  z
    .string()
    .refine((s) => !Number.isNaN(new Date(s).getTime()), "Data/hora inválida")
    .nullable(),
);

/** Validação de uma tarefa (Fase 09). `status` exclui 'atrasada' (derivada na leitura). */
export const taskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Informe um título")
      .max(200, "Máximo de 200 caracteres"),
    notes: optionalText(4000),
    project_id: optionalUuid,
    priority: z.enum(TASK_PRIORITIES),
    status: z
      .enum(TASK_STORED_STATUSES)
      .optional()
      .transform((v) => v ?? "pendente"),
    start_date: optionalDate,
    due_date: optionalDate,
    tags: tagsArray,
    recurrence: taskRecurrenceSchema,
    reminder_at: reminderAt,
    calendar_event_id: optionalUuid,
  })
  .refine(
    (v) =>
      !v.start_date || !v.due_date || v.due_date >= v.start_date,
    {
      message: "O vencimento deve ser igual ou posterior ao início",
      path: ["due_date"],
    },
  );

export type TaskInput = z.infer<typeof taskSchema>;

/** Item de checklist de uma tarefa. */
export const checklistItemSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Informe o item")
    .max(300, "Máximo de 300 caracteres"),
});

export type ChecklistItemInput = z.infer<typeof checklistItemSchema>;
