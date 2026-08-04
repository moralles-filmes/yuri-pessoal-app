"use server";

/**
 * Fase 16-F — pontes OPCIONAIS entre a Dieta e os outros módulos (TO-DO e Agenda).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ NADA AQUI ACONTECE SOZINHO.                                                          ║
 * ║                                                                                       ║
 * ║ Nenhuma refeição vira evento de agenda automaticamente, nenhuma lista de compras vira ║
 * ║ tarefa automaticamente, nenhum gasto de mercado vira lançamento financeiro            ║
 * ║ automaticamente. Toda função deste arquivo só roda depois de um clique explícito, e   ║
 * ║ nenhuma delas é chamada por trigger, cron ou efeito colateral de outra action.        ║
 * ║                                                                                       ║
 * ║ O motivo é o mesmo em todos os casos: transformar plano em compromisso é decisão de   ║
 * ║ quem vai cumpri-lo. Um sistema que enche a agenda com "almoço 12:30" todo dia sem      ║
 * ║ pedir vira ruído — e o usuário desliga o módulo inteiro para se livrar dele.           ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * INTEGRA, NÃO REIMPLEMENTA: chama `createTodoTask` (Fase 15) e `createEvent` (Fase 08).
 * Nenhuma linha de `todo_tasks` ou `calendar_events` é escrita aqui.
 */
import { z } from "zod";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { createTodoTask } from "@/lib/actions/todo";
import { createEvent } from "@/lib/actions/calendar";
import { isDateIso } from "@/lib/nutrition/calendar";
import { saoPauloWallClockToInstant } from "@/lib/format";
import { shoppingListLink } from "@/lib/search/nutrition-links";
import type { ActionResult } from "@/types/finance";

/* ═══════════════════════════ TO-DO ═══════════════════════════ */

const shoppingTodoSchema = z.object({
  list_id: z.uuid("Lista inválida"),
  scheduled_date: z
    .string()
    .refine(isDateIso, "Data inválida")
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

/**
 * Cria uma tarefa no TO-DO para fazer as compras de uma lista.
 *
 * O vínculo é por LINK na descrição, não por FK: a lista e a tarefa são independentes, e
 * excluir uma não pode arrastar a outra. Uma FK aqui obrigaria a decidir o destino da tarefa
 * a cada exclusão de lista — complexidade sem ganho para uma ponte opcional.
 */
export async function createShoppingTodo(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = shoppingTodoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  // A lista é do usuário? A RLS já barraria a leitura; a mensagem em pt-BR vem daqui.
  const { data: list } = await ctx.supabase
    .from("nutrition_shopping_lists")
    .select("id,name")
    .eq("id", data.list_id)
    .maybeSingle();
  if (!list) return dbError("Lista não encontrada.");

  return createTodoTask({
    title: `Fazer compras — ${list.name}`,
    description: `Lista de compras do módulo Dieta: ${shoppingListLink(list.id)}`,
    scheduled_date: data.scheduled_date,
    priority: 3,
  });
}

const genericTodoSchema = z.object({
  title: z.string().trim().min(1, "Informe o título").max(300),
  description: z
    .string()
    .trim()
    .max(10000)
    .nullable()
    .optional()
    .transform((v) => v || null),
  scheduled_date: z
    .string()
    .refine(isDateIso, "Data inválida")
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

/**
 * Tarefa avulsa criada a partir da Dieta (preparar refeições, medir, repor a despensa…).
 * Só existe porque o usuário pediu — o módulo nunca cria tarefa por conta própria.
 */
export async function createNutritionTodo(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = genericTodoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  return createTodoTask({
    title: data.title,
    description: data.description,
    scheduled_date: data.scheduled_date,
    priority: 3,
  });
}

/* ═══════════════════════════ Agenda ═══════════════════════════ */

const nutritionEventSchema = z
  .object({
    title: z.string().trim().min(1, "Informe o título").max(200),
    date: z.string().refine(isDateIso, "Data inválida"),
    /** Hora de parede EM BRASÍLIA, como todo horário digitado no sistema. */
    start_time: z.string().regex(/^\d{2}:\d{2}$/, "Horário inválido"),
    duration_minutes: z.coerce.number().int().min(5).max(600).optional().transform((v) => v ?? 60),
    notes: z
      .string()
      .trim()
      .max(2000)
      .nullable()
      .optional()
      .transform((v) => v || null),
  })
  .refine((d) => d.start_time.length === 5, { message: "Horário inválido" });

/**
 * Cria UM bloco na agenda (preparo de refeição, refeição, sessão de medidas).
 *
 * ⛔ UM bloco, para UMA data, por clique. Não existe caminho aqui para transformar um
 * planejamento inteiro em eventos — a regra 5 da subfase proíbe, e "criar 21 eventos de uma
 * vez" é exatamente a forma de encher a agenda que o usuário não pediu.
 *
 * O horário digitado é hora de BRASÍLIA (`saoPauloWallClockToInstant`), não do fuso do
 * aparelho: um celular configurado em outro fuso gravaria o evento com horas de diferença.
 */
export async function createNutritionEvent(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = nutritionEventSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const start = saoPauloWallClockToInstant(data.date, data.start_time);
  if (Number.isNaN(start.getTime())) return dbError("Data ou horário inválidos.");
  const end = new Date(start.getTime() + data.duration_minutes * 60_000);

  return createEvent({
    title: data.title,
    description: data.notes,
    tipo: "pessoal",
    all_day: false,
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  });
}
