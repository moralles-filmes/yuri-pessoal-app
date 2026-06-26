import { z } from "zod";
import {
  HABIT_CATEGORIES,
  HABIT_FREQUENCIES,
  HABIT_UNITS,
} from "@/lib/habits/constants";
import {
  dateString,
  optionalColor,
  optionalText,
  optionalTime,
} from "@/lib/validators/shared";

/** Validação de um hábito (Fase 10). */
export const habitSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Informe um nome")
      .max(120, "Máximo de 120 caracteres"),
    category: z.enum(HABIT_CATEGORIES),
    description: optionalText(1000),
    frequency: z.enum(HABIT_FREQUENCIES),
    weekdays: z
      .array(z.coerce.number().int().min(0).max(6))
      .optional()
      .transform((arr) =>
        arr && arr.length ? Array.from(new Set(arr)).sort((a, b) => a - b) : [],
      ),
    target_value: z.coerce
      .number({ message: "Informe a meta" })
      .finite("Meta inválida")
      .positive("A meta deve ser maior que zero"),
    unit: z.enum(HABIT_UNITS),
    time_of_day: optionalTime,
    reminder_at: optionalTime,
    color: optionalColor,
    icon: optionalText(40),
    is_active: z
      .boolean()
      .optional()
      .transform((v) => v ?? true),
  })
  .refine((v) => v.frequency === "diaria" || v.weekdays.length > 0, {
    message: "Selecione ao menos um dia da semana",
    path: ["weekdays"],
  });

export type HabitInput = z.infer<typeof habitSchema>;

/**
 * Check-in/registro diário de um hábito (grava/atualiza habit_logs por dia).
 * `value` = quanto foi feito; `is_done` é opcional (quando ausente, a action deriva
 * da meta com reachedTarget). `notes` para a sessão (ex.: observações de leitura).
 */
export const habitLogSchema = z.object({
  log_date: dateString,
  value: z.coerce
    .number({ message: "Informe um valor" })
    .finite("Valor inválido")
    .nonnegative("O valor não pode ser negativo"),
  is_done: z.boolean().optional(),
  notes: optionalText(1000),
});

export type HabitLogInput = z.infer<typeof habitLogSchema>;
