import { z } from "zod";
import { EVENT_FREQUENCIES, EVENT_TYPES } from "@/lib/calendar/constants";
import { dateString, optionalText, optionalUuid } from "@/lib/validators/shared";

/**
 * Validação de um evento da agenda (Fase 08). `start_at`/`end_at` chegam já como
 * ISO (o client converte o datetime-local do usuário para o fuso correto antes de
 * enviar; eventos "dia inteiro" são ancorados ao meio-dia UTC). Servidor revalida.
 */
export const calendarEventSchema = z
  .object({
    title: z.string().trim().min(1, "Informe um título").max(200, "Máximo de 200 caracteres"),
    description: optionalText(2000),
    location: optionalText(300),
    all_day: z.boolean().optional().transform((v) => v ?? false),
    start_at: z.string().min(1, "Informe o início"),
    end_at: z.string().min(1, "Informe o fim"),
    tipo: z.enum(EVENT_TYPES),
    color: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z
        .string()
        .regex(/^#?[0-9a-fA-F]{3,8}$/, "Cor inválida")
        .nullable(),
    ),
    recurrence_freq: z.preprocess(
      (v) => (v === "" || v === undefined || v === "none" ? null : v),
      z.enum(EVENT_FREQUENCIES).nullable(),
    ),
    recurrence_interval: z.coerce
      .number()
      .int()
      .min(1, "Intervalo mínimo é 1")
      .optional()
      .transform((v) => v ?? 1),
    recurrence_until: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      dateString.nullable(),
    ),
    reminder_minutes: z.preprocess(
      (v) => (v === "" || v === undefined || v === null ? null : v),
      z.coerce.number().int().min(0).nullable(),
    ),
    task_id: optionalUuid,
  })
  .refine(
    (v) => {
      const start = new Date(v.start_at).getTime();
      const end = new Date(v.end_at).getTime();
      return Number.isFinite(start) && Number.isFinite(end) && end >= start;
    },
    { message: "O fim deve ser igual ou posterior ao início", path: ["end_at"] },
  );

export type CalendarEventInput = z.infer<typeof calendarEventSchema>;
