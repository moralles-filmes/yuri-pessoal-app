"use server";

/**
 * Fase 17-F — pontes OPCIONAIS entre os Treinos e o resto do sistema (Agenda, TO-DO, Hábitos).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ NADA AQUI ACONTECE SOZINHO.                                                          ║
 * ║                                                                                       ║
 * ║ Nenhum treino planejado vira evento sem o interruptor ligado, nenhuma tarefa nasce no  ║
 * ║ TO-DO sem clique, nenhum hábito é marcado sem vínculo escolhido. O motivo é sempre o   ║
 * ║ mesmo: transformar plano em compromisso é decisão de quem vai cumpri-lo — e um sistema ║
 * ║ que enche a agenda sozinho vira ruído até o usuário desligar o módulo inteiro.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ E NADA AQUI DUPLICA VERDADE. A tabela de fonte de verdade da subfase:
 *
 *   • "o treino aconteceu"        → `training_sessions`            (hábito LÊ, não registra)
 *   • "está planejado para o dia" → `training_scheduled_workouts`  (agenda/TO-DO são espelhos)
 *   • "peso e medidas"            → `body_*` (16-E)                (Dieta e Treinos, o mesmo)
 *
 * INTEGRA, NÃO REIMPLEMENTA: chama `createTodoTask` (Fase 15) e a camada de sincronização
 * `training/calendar-sync.ts`. Nenhuma linha de `todo_tasks` ou `calendar_events` é escrita
 * aqui.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { authContext, dbError, invalid, notAuthed } from "@/lib/actions/helpers";
import { createTodoTask } from "@/lib/actions/todo";
import { getGoogleIntegration } from "@/lib/google/tokens";
import { addDaysIso, isDateIso } from "@/lib/training/schedule";
import { hojeISO } from "@/lib/format";
import { TRAINING_BASE_PATH } from "@/lib/training/constants";
import { syncAllScheduledWorkoutsToGoogle } from "@/lib/training/calendar-sync";
import { goalLink, scheduleLink, todayLink } from "@/lib/search/training-links";
import type { ActionResult } from "@/types/finance";

const SCHEDULE_PATH = `${TRAINING_BASE_PATH}/calendario`;

/* ═══════════════════════════ Agenda (Google) ═══════════════════════════ */

/**
 * Liga/desliga o espelho dos treinos planejados no Google.
 *
 * Ao DESLIGAR, os eventos já criados permanecem no Google — o usuário decide o que fazer com
 * eles. Apagar em massa seria destrutivo e irreversível (mesma decisão do TO-DO, Fase 15).
 */
export async function setTrainingGoogleSync(enabled: boolean): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const integration = await getGoogleIntegration(ctx);
  if (!integration) {
    return { ok: false, error: "Conecte a conta Google antes de ativar o envio." };
  }

  const { error } = await ctx.supabase
    .from("google_integrations")
    .update({ training_sync_enabled: Boolean(enabled) })
    .eq("user_id", ctx.userId);
  if (error) return dbError("Não foi possível salvar a preferência.");

  revalidatePath("/agenda");
  revalidatePath(SCHEDULE_PATH);
  return { ok: true, data: null };
}

/**
 * Envia agora os treinos planejados numa janela [−7d, +120d]. Serve para preencher o
 * calendário logo depois de ligar a opção, sem despejar anos de planejamento.
 */
export async function syncTrainingToGoogle(): Promise<
  ActionResult<{ synced: number; failed: number }>
> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const integration = await getGoogleIntegration(ctx);
  if (!integration) {
    return { ok: false, error: "Google não conectado. Conecte a conta primeiro." };
  }
  if (!integration.training_sync_enabled) {
    return { ok: false, error: "Ative o envio de treinos antes de sincronizar." };
  }

  const hoje = hojeISO();
  const result = await syncAllScheduledWorkoutsToGoogle(
    ctx,
    addDaysIso(hoje, -7),
    addDaysIso(hoje, 120),
  );

  revalidatePath("/agenda");
  revalidatePath(SCHEDULE_PATH);
  return { ok: true, data: result };
}

/* ═══════════════════════════ TO-DO ═══════════════════════════ */

const workoutTodoSchema = z.object({
  scheduled_id: z.uuid("Dia planejado inválido").nullable().optional().transform((v) => v ?? null),
  title: z.string().trim().min(1, "Informe o título").max(300),
  scheduled_date: z
    .string()
    .refine(isDateIso, "Data inválida")
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

/**
 * Cria no TO-DO uma tarefa para realizar um treino.
 *
 * O vínculo é por LINK na descrição, não por FK — a mesma decisão da 16-F. A tarefa e o
 * planejamento são independentes: excluir um não pode arrastar o outro, e uma FK obrigaria a
 * decidir o destino da tarefa a cada exclusão de dia planejado, complexidade sem ganho para
 * uma ponte opcional. O link é o que permite ao usuário abrir o treino a partir da tarefa.
 */
export async function createWorkoutTodo(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = workoutTodoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  // O dia planejado é do usuário? A RLS já barraria; a mensagem em pt-BR vem daqui.
  let date = data.scheduled_date;
  if (data.scheduled_id) {
    const { data: entry } = await ctx.supabase
      .from("training_scheduled_workouts")
      .select("id,scheduled_date")
      .eq("id", data.scheduled_id)
      .maybeSingle();
    if (!entry) return dbError("Dia planejado não encontrado.");
    date = entry.scheduled_date;
  }

  return createTodoTask({
    title: data.title,
    description: `Treino planejado no módulo Treinos: ${
      date ? scheduleLink(date) : todayLink()
    }`,
    scheduled_date: date,
    priority: 3,
  });
}

const goalTodoSchema = z.object({
  goal_id: z.uuid("Meta inválida"),
  scheduled_date: z
    .string()
    .refine(isDateIso, "Data inválida")
    .nullable()
    .optional()
    .transform((v) => v ?? null),
});

/** Vincula uma meta de treino a uma tarefa do TO-DO (revisar, medir, atualizar o alvo). */
export async function createGoalTodo(input: unknown): Promise<ActionResult<{ id: string }>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = goalTodoSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const data = parsed.data;

  const { data: goal } = await ctx.supabase
    .from("training_goals")
    .select("id,name")
    .eq("id", data.goal_id)
    .maybeSingle();
  if (!goal) return dbError("Meta não encontrada.");

  return createTodoTask({
    title: `Acompanhar meta — ${goal.name}`,
    description: `Meta do módulo Treinos: ${goalLink(goal.id)}`,
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
 * Tarefa avulsa criada a partir dos Treinos (atualizar o programa, registrar medidas, comprar
 * equipamento…). Só existe porque o usuário pediu — o módulo nunca cria tarefa por conta
 * própria.
 */
export async function createTrainingTodo(
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

/* ═══════════════════════════ Hábitos ═══════════════════════════ */

const habitLinkSchema = z.object({
  habit_id: z.uuid("Hábito inválido").nullable().optional().transform((v) => v ?? null),
});

/**
 * Escolhe (ou desfaz) o hábito que REFLETE as sessões concluídas.
 *
 * ⛔ O hábito não é uma segunda fonte de verdade: quem sabe que o treino aconteceu é
 * `training_sessions`. O que esta ponte faz é manter o check-in do dia igual à contagem real
 * de sessões — em vez de pedir ao usuário que registre a mesma coisa duas vezes.
 */
export async function setTrainingHabit(input: unknown): Promise<ActionResult<null>> {
  const ctx = await authContext();
  if (!ctx) return notAuthed;

  const parsed = habitLinkSchema.safeParse(input);
  if (!parsed.success) return invalid(parsed.error.flatten().fieldErrors);
  const habitId = parsed.data.habit_id;

  if (habitId) {
    const { data: habit } = await ctx.supabase
      .from("habits")
      .select("id")
      .eq("id", habitId)
      .maybeSingle();
    if (!habit) return dbError("Hábito não encontrado.");
  }

  const { error } = await ctx.supabase
    .from("training_preferences")
    .upsert({ user_id: ctx.userId, habit_id: habitId }, { onConflict: "user_id" });
  if (error) return dbError("Não foi possível salvar o vínculo com o hábito.");

  revalidatePath(`${TRAINING_BASE_PATH}/configuracoes`);
  revalidatePath("/habitos");
  return { ok: true, data: null };
}