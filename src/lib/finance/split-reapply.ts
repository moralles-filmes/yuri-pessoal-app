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
 * 03-G2 (E3b): a decisão (`planejarReaplicacao`) só LÊ; a escrita é UMA rpc `salvar_lancamento`.
 *
 * A "minha parte" continua sendo sempre DERIVADA (total − Σ terceiros), nunca informada.
 */
import { traduzirErroDaRpc, type AuthContext } from "@/lib/actions/helpers";
import { protecaoDosRecebiveis } from "@/lib/finance/recebimentos-leitura";
import { recebivelProtegido } from "@/lib/finance/protecao-do-recebivel";
import {
  divisaoVazia,
  montarDivisaoAVista,
  montarDivisaoParcelada,
  type AlcanceDaDivisao,
  type DivisaoPayload,
} from "@/lib/finance/split-persist";
import {
  decidirReaplicacao,
  dividirDespesa,
  toPartesDivisao,
} from "@/lib/finance/split";
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
        /** `transaction_installments.numero` REAL (pode começar em k > 1) — não a posição na lista. */
        numero: number;
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
  /** D-G2-4: o alcance da proteção que a RPC reconfere. Padrão `regra-cheia` (a edição). */
  alcance?: AlcanceDaDivisao;
};

/**
 * 03-G2 (E3b) — o que `planejarReaplicacao` decidiu. SÓ LÊ: quem grava é `reapplySplit`, numa
 * única chamada à RPC `salvar_lancamento` (substitui a divisão e escreve `classificacao` e
 * `valor_pessoal` na mesma transação, reconferindo a proteção no SQL).
 */
export type PlanoDaDivisao =
  | { acao: "nada" }
  | { acao: "bloqueado"; motivo: string }
  | { acao: "erro"; error: string }
  | {
      acao: "substituir";
      divisao: DivisaoPayload;
      colunas: { classificacao: Classificacao; valor_pessoal: number | null };
    };

/**
 * Lê a divisão gravada, confere os recebíveis e decide — sem escrever nada. As leituras e as
 * frases de erro são as de sempre; o que mudou é que a decisão "substituir" já sai com o
 * payload pronto para a RPC.
 */
export async function planejarReaplicacao(
  ctx: AuthContext,
  args: ReapplyArgs,
): Promise<PlanoDaDivisao> {
  const alcance = args.alcance ?? "regra-cheia";
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
      return { acao: "erro", error: (e as Error).message };
    }
  }

  const { data: shares, error: erroDaDivisao } = await ctx.supabase
    .from("shared_expenses")
    .select("person_id, valor")
    .eq("transaction_id", args.transactionId);
  // 03-G (D-G19, Z13) — antes, erro aqui lia "sem divisão atual" e PULAVA a proteção dos recebíveis
  // cobrados. Desde a 03-G2 o plano vem ANTES de qualquer escrita (RR6), então nada foi gravado.
  if (erroDaDivisao) {
    return {
      acao: "erro",
      error: "Não foi possível ler a divisão atual. A divisão não foi alterada.",
    };
  }
  const divisaoAtual = new Map<string, number>(
    (shares ?? []).map((s) => [s.person_id, reaisParaCentavos(s.valor)]),
  );

  // Sem divisão gravada não existe recebível desta transação — a consulta só é feita quando
  // pode haver algo a proteger.
  // REDESIGN-03-D · A4 — a regra única: recebimento registrado, cobrado, pago ou ignorado.
  let temRecebivelFechado = false;
  if (divisaoAtual.size > 0) {
    const protecao = await protecaoDosRecebiveis(ctx.supabase, {
      transactionIds: [args.transactionId],
    });
    if (protecao.erro) {
      return {
        acao: "erro",
        error: "Não foi possível conferir os recebíveis desta divisão. Tente de novo.",
      };
    }
    temRecebivelFechado = protecao.recebiveis.some(
      (r) => recebivelProtegido(r, "regra-cheia"),
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

  if (decisao.acao === "nada") return { acao: "nada" };
  if (decisao.acao === "bloqueado") {
    return { acao: "bloqueado", motivo: decisao.motivo };
  }

  if (decisao.acao === "limpar") {
    return {
      acao: "substituir",
      divisao: divisaoVazia(alcance),
      colunas: { classificacao: "pessoal", valor_pessoal: null },
    };
  }

  const montada =
    args.mode.kind === "avista"
      ? montarDivisaoAVista({
          totalCentavos: args.totalCentavos,
          parts: args.parts,
          statementId: args.mode.statementId,
          cardId: args.mode.cardId,
          dataPrevista: args.mode.dataPrevista ?? null,
          alcance,
        })
      : montarDivisaoParcelada({
          totalCentavos: args.totalCentavos,
          parts: args.parts,
          parcelas: args.mode.parcelas,
          alcance,
        });
  if (!montada.ok) return { acao: "erro", error: montada.error };

  return {
    acao: "substituir",
    divisao: montada.divisao,
    colunas: {
      classificacao: args.classificacaoNova,
      valor_pessoal: centavosParaReais(montada.minhaParteCentavos),
    },
  };
}

/**
 * Reaplica a divisão: planeja (só lê) e, se houver o que substituir, faz UMA chamada à RPC
 * `salvar_lancamento` — a substituição da divisão e as duas colunas da transação acontecem na
 * mesma transação, e a proteção dos recebíveis é reconferida no SQL.
 */
export async function reapplySplit(
  ctx: AuthContext,
  args: ReapplyArgs,
): Promise<ReapplyResult> {
  const plano = await planejarReaplicacao(ctx, args);

  if (plano.acao === "nada") return { ok: true };
  if (plano.acao === "bloqueado") return { ok: false, error: plano.motivo };
  if (plano.acao === "erro") return { ok: false, error: plano.error };

  const { error } = await ctx.supabase.rpc("salvar_lancamento", {
    p_lancamento: plano.colunas,
    p_divisao: plano.divisao,
    p_id: args.transactionId,
  });
  if (error) {
    // `ActionResult<never>` não tem ramo `ok: true` com valor: o ramo de sucesso é inalcançável aqui.
    const traduzido = traduzirErroDaRpc(error, "alterar a divisão");
    return { ok: false, error: traduzido.ok ? "" : traduzido.error };
  }
  return { ok: true };
}
