/**
 * Motor de geração de lançamentos recorrentes (Fase 02). Módulo server-only
 * (não é "use server"): usado tanto pela Server Action `generateRecurringNow`
 * quanto pelo catch-up chamado no render da página /financeiro.
 * NÃO chama revalidatePath — seguro para rodar durante o render.
 */
import { authContext, type AuthContext } from "@/lib/actions/helpers";
import { computeDueOccurrences } from "@/lib/finance/recurrence";
import { toDateInputValue } from "@/lib/format";
import type { Frequency } from "@/lib/finance/constants";
import type { GenerationResult } from "@/types/finance";

export const RECURRENCE_FIELDS =
  "id, type, payment_method, account_id, category_id, subcategory_id, amount, description, tags, frequency, interval_count, anchor_date, next_due_date, end_date, generated_status";

export type RecurrenceRow = {
  id: string;
  type: string;
  payment_method: string | null;
  account_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  amount: number;
  description: string | null;
  tags: string[];
  frequency: string;
  interval_count: number;
  anchor_date: string;
  next_due_date: string;
  end_date: string | null;
  generated_status: string;
};

/** Gera as ocorrências vencidas de cada recorrência e avança seu next_due_date. */
export async function runGeneration(
  ctx: AuthContext,
  recurrences: RecurrenceRow[],
  today: string,
): Promise<number> {
  let generated = 0;

  for (const r of recurrences) {
    const plan = computeDueOccurrences(
      {
        frequency: r.frequency as Frequency,
        intervalCount: r.interval_count,
        anchorDate: r.anchor_date,
        nextDueDate: r.next_due_date,
        endDate: r.end_date,
      },
      today,
    );

    if (plan.dueDates.length > 0) {
      const rows = plan.dueDates.map((date) => ({
        user_id: ctx.userId,
        type: r.type,
        payment_method: r.payment_method,
        account_id: r.account_id,
        category_id: r.category_id,
        subcategory_id: r.subcategory_id,
        amount: r.amount,
        purchase_date: date,
        competence_date: date,
        description: r.description,
        tags: r.tags,
        status: r.generated_status,
        recurring_id: r.id,
      }));
      const { error } = await ctx.supabase.from("transactions").insert(rows);
      // Falha em uma recorrência não deve travar as demais.
      if (!error) generated += rows.length;
      else continue;
    }

    const update: {
      last_generated_at: string;
      next_due_date?: string;
      is_active?: boolean;
    } = { last_generated_at: new Date().toISOString() };
    if (plan.newNextDueDate) update.next_due_date = plan.newNextDueDate;
    if (plan.finished) update.is_active = false;

    await ctx.supabase
      .from("recurring_transactions")
      .update(update)
      .eq("id", r.id);
  }

  return generated;
}

/**
 * Catch-up: gera tudo que está vencido para o usuário atual. Seguro no render.
 * Idempotente: `next_due_date` avança além das datas geradas.
 */
export async function catchUpRecurrences(): Promise<GenerationResult> {
  const ctx = await authContext();
  if (!ctx) return { generated: 0, recurrences: 0 };

  const today = toDateInputValue(new Date());
  const { data, error } = await ctx.supabase
    .from("recurring_transactions")
    .select(RECURRENCE_FIELDS)
    .eq("is_active", true)
    .lte("next_due_date", today);

  if (error || !data || data.length === 0) {
    return { generated: 0, recurrences: 0 };
  }

  const recurrences = data as unknown as RecurrenceRow[];
  const generated = await runGeneration(ctx, recurrences, today);
  return { generated, recurrences: recurrences.length };
}
