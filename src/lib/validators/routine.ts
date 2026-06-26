import { z } from "zod";
import {
  ROUTINE_FREQUENCIES,
  ROUTINE_TYPES,
} from "@/lib/tasks/constants";
import { dateString, optionalColor, optionalText } from "@/lib/validators/shared";

/** Validação de uma rotina (Fase 09). */
export const routineSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Informe um nome")
      .max(120, "Máximo de 120 caracteres"),
    type: z.enum(ROUTINE_TYPES),
    description: optionalText(1000),
    color: optionalColor,
    icon: optionalText(40),
    frequency: z.enum(ROUTINE_FREQUENCIES),
    weekdays: z
      .array(z.coerce.number().int().min(0).max(6))
      .optional()
      .transform((arr) =>
        arr && arr.length ? Array.from(new Set(arr)).sort((a, b) => a - b) : [],
      ),
    time_of_day: z.preprocess(
      (v) => (v === "" || v === undefined ? null : v),
      z
        .string()
        .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Horário inválido")
        .nullable(),
    ),
    is_active: z
      .boolean()
      .optional()
      .transform((v) => v ?? true),
  })
  .refine((v) => v.frequency === "diaria" || v.weekdays.length > 0, {
    message: "Selecione ao menos um dia da semana",
    path: ["weekdays"],
  });

export type RoutineInput = z.infer<typeof routineSchema>;

/** Item (passo) de uma rotina. */
export const routineItemSchema = z.object({
  label: z
    .string()
    .trim()
    .min(1, "Informe o passo")
    .max(200, "Máximo de 200 caracteres"),
});

export type RoutineItemInput = z.infer<typeof routineItemSchema>;

/** Check-in diário de uma rotina (grava/atualiza routine_logs). */
export const routineLogSchema = z.object({
  log_date: dateString,
  is_done: z
    .boolean()
    .optional()
    .transform((v) => v ?? false),
  completed_items: z
    .array(z.uuid())
    .optional()
    .transform((v) => v ?? []),
  notes: optionalText(1000),
});

export type RoutineLogInput = z.infer<typeof routineLogSchema>;
