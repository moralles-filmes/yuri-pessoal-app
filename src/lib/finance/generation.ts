/**
 * Motor de geração de lançamentos recorrentes (Fase 02). Módulo server-only
 * (não é "use server"): usado tanto pela Server Action `generateRecurringNow`
 * quanto pelo catch-up chamado no render da página /financeiro.
 * NÃO chama revalidatePath — seguro para rodar durante o render.
 */
import { authContext, temSqlstate, type AuthContext } from "@/lib/actions/helpers";
import { ehErroDeLeitura, exigir, type RespostaDoBanco } from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import { computeDueOccurrences } from "@/lib/finance/recurrence";
import { resolveOrCreateStatement } from "@/lib/finance/statements";
import { hojeISO } from "@/lib/format";
import type { Frequency } from "@/lib/finance/constants";
import type { GenerationResult } from "@/types/finance";

export const RECURRENCE_FIELDS =
  "id, type, payment_method, account_id, card_id, category_id, subcategory_id, amount, description, tags, frequency, interval_count, anchor_date, next_due_date, end_date, generated_status, last_generated_at";

export type RecurrenceRow = {
  id: string;
  type: string;
  payment_method: string | null;
  account_id: string | null;
  card_id: string | null;
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
  last_generated_at: string | null;
};

/** Uma recorrência é de cartão quando paga no cartão e tem o cartão definido. */
export function isCardRecurrence(r: RecurrenceRow): boolean {
  return r.payment_method === "cartao_credito" && Boolean(r.card_id);
}

/**
 * Monta a linha base do lançamento gerado para UMA ocorrência (sem o statement_id,
 * que é I/O resolvido por data). Função pura/testável.
 * Cartão: account_id sempre null (não abate conta), card_id preservado.
 * Demais: card_id sempre null, account_id preservado.
 */
export function buildGeneratedRow(
  r: RecurrenceRow,
  date: string,
  userId: string,
) {
  const card = isCardRecurrence(r);
  return {
    user_id: userId,
    type: r.type,
    payment_method: r.payment_method,
    account_id: card ? null : r.account_id,
    card_id: card ? r.card_id : null,
    category_id: r.category_id,
    subcategory_id: r.subcategory_id,
    amount: r.amount,
    purchase_date: date,
    competence_date: date,
    description: r.description,
    tags: r.tags,
    status: r.generated_status,
    recurring_id: r.id,
  };
}

/**
 * Gera as ocorrências vencidas de cada recorrência e avança seu next_due_date.
 *
 * 03-G (D-G31): um `ErroDeLeitura` DENTRO do laço (o "busca ou cria" da fatura, depois de
 * lançamentos já gravados) INTERROMPE o laço e devolve `interrompida: true` — não é possível
 * desfazer o que já foi gravado, então a tela precisa dizer que algumas recorrências podem estar
 * faltando. Qualquer outro erro continua subindo.
 *
 * 03-G2 (S9, D-G2-10): a ordem, por recorrência com datas a gerar, é reserva condicional ->
 * insert -> devolução (claim-first, invariante 37).
 * - RESERVA: `update` de `next_due_date`/`is_active`/`last_generated_at` ANTES do insert, com a
 *   condição `next_due_date = antigo E is_active = true` e `.select("id")`. Duas gerações lendo a
 *   mesma recorrência (duas abas) disputam a mesma linha: só uma altera, a outra vê 0 linhas e
 *   NÃO insere. A condição leva `is_active = true` porque na ÚLTIMA geração `newNextDueDate` é
 *   nulo e só `is_active` muda — sem ela a segunda aba reservaria de novo e inseriria em dobro.
 * - INSERT: se falhar, a data é DEVOLVIDA (`next_due_date`, `is_active` e `last_generated_at`
 *   anteriores). A devolução filtra por `last_generated_at = agora` — o instante único da reserva
 *   —, então só desfaz a reserva DESTA geração, nunca a de outra que tenha vindo depois.
 * - Devolução com erro ou sem linha alterada: as datas podem ter sumido em silêncio (o catch-up
 *   só lê `is_active = true`), então devolve `interrompida: true`.
 * - Cair entre a reserva e o insert erra para "pode faltar" (o aviso `interrompida`), nunca para
 *   lançamento em dobro (invariante 37).
 * Sem datas a gerar, a atualização de `last_generated_at`/`is_active` é conferida; erro =>
 * `interrompida: true`.
 */
export async function runGeneration(
  ctx: AuthContext,
  recurrences: RecurrenceRow[],
  today: string,
): Promise<{ generated: number; interrompida: boolean }> {
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
      // Recorrência de cartão paga sem cartão definido (cartão excluído →
      // on delete set null): órfã. Pula sem gerar nem avançar next_due_date.
      if (r.payment_method === "cartao_credito" && !r.card_id) continue;

      const card = isCardRecurrence(r);
      let failed = false;
      const rows: Array<
        ReturnType<typeof buildGeneratedRow> & { statement_id?: string }
      > = [];

      for (const date of plan.dueDates) {
        const base = buildGeneratedRow(r, date, ctx.userId);
        if (card) {
          // Cada ocorrência cai na fatura da SUA data (mesma regra da compra avulsa).
          let statementId: string | null;
          try {
            statementId = await resolveOrCreateStatement(
              ctx,
              r.card_id!,
              date,
            );
          } catch (e) {
            // D-G31: lançamentos anteriores já foram gravados — o laço para e declara.
            if (ehErroDeLeitura(e)) return { generated, interrompida: true };
            throw e;
          }
          if (!statementId) {
            failed = true;
            break;
          }
          rows.push({ ...base, statement_id: statementId });
        } else {
          rows.push(base);
        }
      }

      // Falha ao resolver fatura: não insere nada desta recorrência nem avança.
      if (failed) continue;

      // 03-G2 (S9, D-G2-10): RESERVA a data ANTES de inserir. `agora` é único por reserva e é ele
      // que a devolução usa para achar a própria reserva.
      const agora = new Date().toISOString();
      const reserva = await ctx.supabase
        .from("recurring_transactions")
        .update({
          last_generated_at: agora,
          ...(plan.newNextDueDate ? { next_due_date: plan.newNextDueDate } : {}),
          ...(plan.finished ? { is_active: false } : {}),
        })
        .eq("id", r.id)
        .eq("next_due_date", r.next_due_date)
        .eq("is_active", true)
        .select("id");
      if (reserva.error) return { generated, interrompida: true };
      // Outra geração já reservou esta data: não insere (evita o lançamento em dobro).
      if ((reserva.data ?? []).length === 0) continue;

      const { error } = await ctx.supabase.from("transactions").insert(rows);
      if (!error) {
        generated += rows.length;
        continue;
      }

      // 03-G2 (revisão final) — sem SQLSTATE a resposta se perdeu e o insert PODE ter sido
      // gravado: devolver a data faria a próxima geração lançar as mesmas ocorrências de novo. A
      // reserva fica de pé e a geração declara `interrompida` — erra para "pode faltar", nunca
      // para "em dobro" (invariante 37).
      if (!temSqlstate(error)) return { generated, interrompida: true };

      // Insert recusado pelo banco: DEVOLVE a data (só se a reserva ainda for a desta geração).
      const devolucao = await ctx.supabase
        .from("recurring_transactions")
        .update({
          next_due_date: r.next_due_date,
          is_active: true,
          last_generated_at: r.last_generated_at,
        })
        .eq("id", r.id)
        .eq("last_generated_at", agora)
        .select("id");
      if (devolucao.error || (devolucao.data ?? []).length === 0) {
        return { generated, interrompida: true };
      }
      // Falha em uma recorrência não deve travar as demais.
      continue;
    }

    // Sem datas a gerar: só registra a conferência (e encerra a recorrência, se for o caso).
    const update: {
      last_generated_at: string;
      next_due_date?: string;
      is_active?: boolean;
    } = { last_generated_at: new Date().toISOString() };
    if (plan.newNextDueDate) update.next_due_date = plan.newNextDueDate;
    if (plan.finished) update.is_active = false;

    // 03-G2 (S9): a escrita é conferida.
    const { error } = await ctx.supabase
      .from("recurring_transactions")
      .update(update)
      .eq("id", r.id);
    if (error) return { generated, interrompida: true };
  }

  return { generated, interrompida: false };
}

/** 03-G (D-G31): o que `/financeiro` diz quando a geração parou no meio. */
export const AVISO_DE_RECORRENCIAS_INTERROMPIDAS =
  "Não foi possível gerar todas as recorrências deste mês; algumas podem estar faltando. Recarregue a página para tentar de novo.";

/**
 * Catch-up: gera tudo que está vencido para o usuário atual. Seguro no render.
 * Idempotente: `next_due_date` avança além das datas geradas.
 * Recorrências de cartão podem criar linhas em `card_statements` (get-or-create
 * idempotente) durante a resolução de fatura — aceitável no render, como já faz o
 * fluxo de compra avulsa; não há `revalidatePath` aqui.
 *
 * 03-G, duas regras (D-G8 e D-G31):
 * - a leitura das recorrências, feita ANTES de qualquer escrita, LANÇA `ErroDeLeitura`: dizer
 *   "nenhuma recorrência a gerar" com a leitura falha seria o R$ 0,00 por outro caminho;
 * - um erro DENTRO do laço de geração interrompe e volta `interrompida: true`, porque já pode
 *   haver lançamentos gravados.
 */
export async function catchUpRecurrences(): Promise<
  GenerationResult & { interrompida: boolean }
> {
  const ctx = await authContext();
  if (!ctx) return { generated: 0, recurrences: 0, interrompida: false };

  const today = hojeISO();
  const res = await ctx.supabase
    .from("recurring_transactions")
    .select(RECURRENCE_FIELDS)
    .eq("is_active", true)
    .lte("next_due_date", today);

  const data = exigir(
    res as RespostaDoBanco<RecurrenceRow[] | null>,
    ROTULOS_DE_LEITURA.recorrencias,
  );

  if (!data || data.length === 0) {
    return { generated: 0, recurrences: 0, interrompida: false };
  }

  const recurrences = data;
  const { generated, interrompida } = await runGeneration(ctx, recurrences, today);
  return { generated, recurrences: recurrences.length, interrompida };
}
