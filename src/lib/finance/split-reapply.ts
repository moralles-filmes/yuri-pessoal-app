/**
 * Reaplicação da divisão numa EDIÇÃO — o caminho ÚNICO para gasto à vista e para compra
 * parcelada. Server-only (recebe o AuthContext), mas NÃO é "use server": é utilitário das
 * Server Actions, no mesmo espírito de `split-persist.ts`.
 *
 * POR QUE UM SÓ
 * -------------
 * O que difere entre à vista e parcelado é apenas COMO distribuir — e isso já está isolado em
 * `applySplit` × `applySplitParcelado`. Todo o resto é idêntico: resolver a divisão nova,
 * comparar com a gravada, sair calado quando nada mudou, recusar quando já existe recebível
 * cobrado/pago, limpar e re-aplicar, e derivar `valor_pessoal`. Duas cópias dessa regra
 * divergiriam na primeira alteração — foi para isso que ela virou uma função pura
 * (`decidirReaplicacao`, em split.ts) com dois chamadores.
 *
 * A "minha parte" continua sendo sempre DERIVADA (total − Σ terceiros), nunca informada.
 */
import type { AuthContext } from "@/lib/actions/helpers";
import {
  applySplit,
  applySplitParcelado,
  toPartesDivisao,
} from "@/lib/finance/split-persist";
import { decidirReaplicacao, dividirDespesa } from "@/lib/finance/split";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";
import type { Classificacao } from "@/lib/finance/constants";
import type { SplitPartInput } from "@/lib/validators/split";

/** Como a divisão nova deve ser distribuída. */
export type ReapplyMode =
  | {
      kind: "avista";
      statementId: string | null;
      cardId: string | null;
      dataPrevista?: string | null;
    }
  | {
      kind: "parcelado";
      parcelas: {
        installmentId: string;
        statementId: string | null;
        cardId: string | null;
        valorCentavos: number;
      }[];
    };

export type ReapplyResult = { ok: true } | { ok: false; error: string };

export type ReapplyArgs = {
  /** À vista: a própria transação. Parcelado: a transação PAI da compra. */
  transactionId: string;
  /**
   * Base da divisão em centavos. No parcelado é a soma das parcelas ATIVAS — não
   * `valor_total`: com parcela cancelada os dois divergem, e distribuir sobre o total
   * contratado quebraria a invariante de `distribuirTerceirosPorParcela` (Σ terceiros ≤ Σ
   * parcelas).
   */
  totalCentavos: number;
  /** Base que valia quando a divisão atual foi gravada (para detectar mudança de valor). */
  totalCentavosAtual: number;
  classificacaoAtual: Classificacao;
  classificacaoNova: Classificacao;
  parts: SplitPartInput[];
  mode: ReapplyMode;
};

export async function reapplySplit(
  ctx: AuthContext,
  args: ReapplyArgs,
): Promise<ReapplyResult> {
  const querDividir =
    args.classificacaoNova !== "pessoal" && args.parts.length > 0;

  // Divisão nova já resolvida em centavos (a mesma matemática que o servidor gravaria).
  const divisaoNova = new Map<string, number>();
  if (querDividir) {
    try {
      const resultado = dividirDespesa(
        args.totalCentavos,
        toPartesDivisao(args.parts),
      );
      for (const t of resultado.partesTerceiros) {
        divisaoNova.set(t.personId, t.valorCentavos);
      }
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  }

  const { data: shares } = await ctx.supabase
    .from("shared_expenses")
    .select("person_id, valor")
    .eq("transaction_id", args.transactionId);
  const divisaoAtual = new Map<string, number>(
    (shares ?? []).map((s) => [s.person_id, reaisParaCentavos(s.valor)]),
  );

  // Sem divisão gravada não existe recebível desta transação — a consulta só é feita quando
  // pode haver algo a proteger.
  let temRecebivelFechado = false;
  if (divisaoAtual.size > 0) {
    const { data: recs } = await ctx.supabase
      .from("receivables")
      .select("status")
      .eq("transaction_id", args.transactionId);
    temRecebivelFechado = (recs ?? []).some(
      (r) => r.status === "cobrado" || r.status === "pago",
    );
  }

  const decisao = decidirReaplicacao({
    classificacaoAtual: args.classificacaoAtual,
    classificacaoNova: querDividir ? args.classificacaoNova : "pessoal",
    totalCentavosAtual: args.totalCentavosAtual,
    totalCentavosNovo: args.totalCentavos,
    divisaoAtual,
    divisaoNova,
    temRecebivelFechado,
  });

  if (decisao.acao === "nada") return { ok: true };
  if (decisao.acao === "bloqueado") {
    return { ok: false, error: decisao.motivo };
  }

  // Limpa a divisão anterior — receivables primeiro, pela FK.
  await ctx.supabase
    .from("receivables")
    .delete()
    .eq("transaction_id", args.transactionId);
  await ctx.supabase
    .from("shared_expenses")
    .delete()
    .eq("transaction_id", args.transactionId);

  if (decisao.acao === "limpar") {
    await ctx.supabase
      .from("transactions")
      .update({ classificacao: "pessoal", valor_pessoal: null })
      .eq("id", args.transactionId);
    return { ok: true };
  }

  const res =
    args.mode.kind === "avista"
      ? await applySplit(ctx, {
          transactionId: args.transactionId,
          totalCentavos: args.totalCentavos,
          statementId: args.mode.statementId,
          cardId: args.mode.cardId,
          parts: args.parts,
          dataPrevista: args.mode.dataPrevista ?? null,
        })
      : await applySplitParcelado(ctx, {
          parentId: args.transactionId,
          totalCentavos: args.totalCentavos,
          parts: args.parts,
          parcelas: args.mode.parcelas,
        });

  if (!res.ok) return { ok: false, error: res.error };

  await ctx.supabase
    .from("transactions")
    .update({
      classificacao: args.classificacaoNova,
      valor_pessoal: centavosParaReais(res.minhaParteCentavos),
    })
    .eq("id", args.transactionId);

  return { ok: true };
}
