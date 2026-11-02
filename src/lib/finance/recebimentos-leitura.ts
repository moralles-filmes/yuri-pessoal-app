import "server-only";
/**
 * REDESIGN-03-D · P3 — A ÚNICA LEITURA de `receivable_receipts`.
 *
 * Consulta própria, nunca embed (a invariante 21 da 16-E registra FK composta impedindo o embed
 * do PostgREST). A junção com os recebíveis é pura (`anexarRecebimentos`). Teto visível:
 * saturado vira motivo de `completude`, nunca um saldo afirmado como exato.
 *
 * 03-G (D-G6): erro de leitura LANÇA `ErroDeLeitura` (antes virava lista vazia). A saturação
 * continua sendo `situacao`, não erro — quem decide é o chamador (`exigirCompleta` nas telas que
 * somam; `parcial` no motor e no caixa).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import type { LeituraDoDono } from "@/lib/supabase/owner";
import { createClient } from "@/lib/supabase/server";
import { dividirEmBlocos, TAMANHO_DO_BLOCO } from "@/lib/finance/receivables-bulk";
import {
  exigirCompleta,
  listaComTeto,
  listaCompleta,
  type LeituraComTeto,
  type RespostaDoBanco,
} from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA } from "@/lib/finance/rotulos-de-leitura";
import type { RecebimentoDoBanco } from "@/types/database";
import type { RecebivelParaProteger } from "@/lib/finance/protecao-do-recebivel";
import {
  ehManual,
  montarEstadoDoReembolso,
  type LinhaDeReceitaVinculada,
  type LinhaDeRecebivelDaPessoa,
} from "@/lib/finance/recebimentos";
import { situacaoDaPessoa, type EstadoDoReembolso } from "@/lib/finance/reembolso";

export type ClienteSupabase = SupabaseClient<Database>;

export const TETO_DE_RECEBIMENTOS = 5000;
const COLUNAS = "id, receivable_id, valor, recebido_em, observacoes, created_at, transaction_id";

/** Todos os recebimentos do dono (sessão, ou `owner` no Cron com service role). */
export async function lerRecebimentos(
  owner?: LeituraDoDono,
): Promise<LeituraComTeto<RecebimentoDoBanco>> {
  const supabase = owner?.client ?? (await createClient());
  const base = supabase.from("receivable_receipts").select(COLUNAS, { count: "exact" });
  const res = await (owner ? base.eq("user_id", owner.userId) : base)
    .order("recebido_em", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(TETO_DE_RECEBIMENTOS);
  return listaComTeto(
    res as RespostaDoBanco<RecebimentoDoBanco[] | null>,
    ROTULOS_DE_LEITURA.recebimentos,
  );
}

/** Os recebimentos de recebíveis específicos, por blocos (a query string do `in` cresce linear). */
export async function recebimentosDe(
  client: ClienteSupabase,
  receivableIds: readonly string[],
): Promise<{ erro: boolean; linhas: RecebimentoDoBanco[] }> {
  const linhas: RecebimentoDoBanco[] = [];
  for (const bloco of dividirEmBlocos([...new Set(receivableIds)], TAMANHO_DO_BLOCO)) {
    if (bloco.length === 0) continue;
    const { data, error } = await client
      .from("receivable_receipts")
      .select(COLUNAS)
      .in("receivable_id", bloco);
    if (error) return { erro: true, linhas: [] };
    linhas.push(...((data ?? []) as RecebimentoDoBanco[]));
  }
  return { erro: false, linhas };
}

/** O que a A4 precisa saber: status de cada recebível do alvo e se ele já recebeu algo MANUALMENTE (04-C). */
export async function protecaoDosRecebiveis(
  client: ClienteSupabase,
  filtro: { readonly transactionIds: readonly string[] } | { readonly installmentIds: readonly string[] },
): Promise<{ erro: true } | { erro: false; recebiveis: RecebivelParaProteger[] }> {
  const coluna = "transactionIds" in filtro ? "transaction_id" : "installment_id";
  const alvo = "transactionIds" in filtro ? filtro.transactionIds : filtro.installmentIds;
  const linhas: { id: string; status: string }[] = [];
  for (const bloco of dividirEmBlocos([...new Set(alvo)], TAMANHO_DO_BLOCO)) {
    if (bloco.length === 0) continue;
    const { data, error } = await client.from("receivables").select("id, status").in(coluna, bloco);
    if (error) return { erro: true };
    linhas.push(...((data ?? []) as { id: string; status: string }[]));
  }
  const recs = await recebimentosDe(client, linhas.map((l) => l.id));
  if (recs.erro) return { erro: true };
  // 04-C: só o recebimento MANUAL protege. O automático nasce de uma receita e se desfaz com ela.
  const comRecebimento = new Set(recs.linhas.filter(ehManual).map((x) => x.receivable_id));
  return {
    erro: false,
    recebiveis: linhas.map((l) => ({ status: l.status, temRecebimento: comRecebimento.has(l.id) })),
  };
}

// ───────────────────────────── 04-C · o estado do reembolso ─────────────────────────────

const COLUNAS_DA_RECEITA =
  "id, type, status, amount, valor_pessoal, account_id, liquidado_em, competence_date, created_at";
/** A ordem da dívida (M3) precisa da fatura e do lançamento de origem; a data prevista e a criação vêm da própria linha. */
const COLUNAS_DO_RECEBIVEL =
  "id, valor, status, data_prevista, created_at, statement:card_statements(data_vencimento), transaction:transactions!receivables_transaction_id_fkey(competence_date)";

const ROTULO_DA_RECEITA = "as receitas vinculadas";

type RecebivelDeAlguem = LinhaDeRecebivelDaPessoa & { person_id: string };
type ReceitaDeAlguem = LinhaDeReceitaVinculada & { reembolso_pessoa_id: string };

/**
 * Recebimentos de uma lista de ids por uma coluna, em blocos. Lança em erro e em corte: o estado do
 * reembolso decide quanto a pessoa deve, e uma lista incompleta seria um "deve menos" afirmado.
 */
async function recebimentosPorColuna(
  client: ClienteSupabase,
  coluna: "receivable_id" | "transaction_id",
  ids: readonly string[],
): Promise<RecebimentoDoBanco[]> {
  const linhas: RecebimentoDoBanco[] = [];
  for (const bloco of dividirEmBlocos([...new Set(ids)], TAMANHO_DO_BLOCO)) {
    if (bloco.length === 0) continue;
    const res = await client
      .from("receivable_receipts")
      .select(COLUNAS, { count: "exact" })
      .in(coluna, bloco);
    linhas.push(...listaCompleta(res as RespostaDoBanco<RecebimentoDoBanco[] | null>, ROTULOS_DE_LEITURA.recebimentos));
  }
  return linhas;
}

/**
 * O estado do reembolso de UMA pessoa: as receitas vinculadas a ela (pagamentos), os recebíveis
 * (dívidas, qualquer status) e as alocações automáticas já gravadas. Erro de leitura e leitura
 * cortada LANÇAM `ErroDeLeitura` — nunca viram "a pessoa não deve nada".
 */
export async function lerEstadoDoReembolso(
  client: ClienteSupabase,
  personId: string,
): Promise<EstadoDoReembolso> {
  const resReceitas = await client
    .from("transactions")
    .select(COLUNAS_DA_RECEITA, { count: "exact" })
    .eq("reembolso_pessoa_id", personId)
    .limit(TETO_DE_RECEBIMENTOS);
  const receitas = listaCompleta(
    resReceitas as RespostaDoBanco<LinhaDeReceitaVinculada[] | null>,
    ROTULO_DA_RECEITA,
  );

  const resRecebiveis = await client
    .from("receivables")
    .select(COLUNAS_DO_RECEBIVEL, { count: "exact" })
    .eq("person_id", personId)
    .limit(TETO_DE_RECEBIMENTOS);
  const recebiveis = listaCompleta(
    resRecebiveis as unknown as RespostaDoBanco<LinhaDeRecebivelDaPessoa[] | null>,
    ROTULOS_DE_LEITURA.recebiveis,
  );

  const porRecebivel = await recebimentosPorColuna(client, "receivable_id", recebiveis.map((r) => r.id));
  const porReceita = await recebimentosPorColuna(client, "transaction_id", receitas.map((t) => t.id));
  const unicos = new Map([...porRecebivel, ...porReceita].map((x) => [x.id, x] as const));

  return montarEstadoDoReembolso({ receitas, recebiveis, recebimentos: [...unicos.values()] });
}

/**
 * Quanto cada pessoa deve e quanto tem de saldo a favor, depois de aplicar a regra. Só aparece
 * quem tem recebível ou receita vinculada. `owner` (Cron) filtra `user_id` explicitamente.
 */
export async function lerSituacoesDoReembolso(
  owner?: LeituraDoDono,
): Promise<Map<string, { devidoCentavos: number; saldoAFavorCentavos: number }>> {
  const supabase = owner?.client ?? (await createClient());

  const baseDasReceitas = supabase
    .from("transactions")
    .select(COLUNAS_DA_RECEITA + ", reembolso_pessoa_id", { count: "exact" })
    .not("reembolso_pessoa_id", "is", null);
  const resReceitas = await (owner ? baseDasReceitas.eq("user_id", owner.userId) : baseDasReceitas).limit(
    TETO_DE_RECEBIMENTOS,
  );
  const receitas = listaCompleta(resReceitas as RespostaDoBanco<ReceitaDeAlguem[] | null>, ROTULO_DA_RECEITA);

  const baseDosRecebiveis = supabase
    .from("receivables")
    .select(COLUNAS_DO_RECEBIVEL + ", person_id", { count: "exact" })
    .not("person_id", "is", null);
  const resRecebiveis = await (owner ? baseDosRecebiveis.eq("user_id", owner.userId) : baseDosRecebiveis).limit(
    TETO_DE_RECEBIMENTOS,
  );
  const recebiveis = listaCompleta(
    resRecebiveis as unknown as RespostaDoBanco<RecebivelDeAlguem[] | null>,
    ROTULOS_DE_LEITURA.recebiveis,
  );
  const recebimentos = exigirCompleta(await lerRecebimentos(owner), ROTULOS_DE_LEITURA.recebimentos);

  const receitasDe = new Map<string, ReceitaDeAlguem[]>();
  for (const t of receitas) receitasDe.set(t.reembolso_pessoa_id, [...(receitasDe.get(t.reembolso_pessoa_id) ?? []), t]);
  const recebiveisDe = new Map<string, RecebivelDeAlguem[]>();
  for (const r of recebiveis) recebiveisDe.set(r.person_id, [...(recebiveisDe.get(r.person_id) ?? []), r]);

  const pessoaDaReceita = new Map(receitas.map((t) => [t.id, t.reembolso_pessoa_id] as const));
  const pessoaDoRecebivel = new Map(recebiveis.map((r) => [r.id, r.person_id] as const));
  const recebimentosDe = new Map<string, RecebimentoDoBanco[]>();
  const guardar = (pessoa: string | undefined, x: RecebimentoDoBanco) => {
    if (pessoa) recebimentosDe.set(pessoa, [...(recebimentosDe.get(pessoa) ?? []), x]);
  };
  for (const x of recebimentos) {
    const pDivida = pessoaDoRecebivel.get(x.receivable_id);
    const pReceita = x.transaction_id ? pessoaDaReceita.get(x.transaction_id) : undefined;
    guardar(pDivida, x);
    if (pReceita && pReceita !== pDivida) guardar(pReceita, x);
  }

  const resultado = new Map<string, { devidoCentavos: number; saldoAFavorCentavos: number }>();
  for (const pessoa of new Set([...receitasDe.keys(), ...recebiveisDe.keys()])) {
    resultado.set(
      pessoa,
      situacaoDaPessoa(
        montarEstadoDoReembolso({
          receitas: receitasDe.get(pessoa) ?? [],
          recebiveis: recebiveisDe.get(pessoa) ?? [],
          recebimentos: recebimentosDe.get(pessoa) ?? [],
        }),
      ),
    );
  }
  return resultado;
}
