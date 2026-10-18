import "server-only";
/**
 * REDESIGN-03-E · T4a — A LEITURA DA BASE CAIXA (§5.4 e §6.2 do desenho; P6, P10, P11).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ Uma consulta só alimenta o painel inteiro: do dia 1 do mês ANTERIOR ao último dia do  ║
 * ║ mês selecionado, para o comparativo "até o dia D" (K3) ter os dois lados.             ║
 * ║                                                                                      ║
 * ║ ⛔ A consulta pode trazer a MAIS; nunca decide sozinha. O `or` do PostgREST é só um   ║
 * ║    afunilamento — quem decide se um lançamento entra é `dataDeCaixa`, em memória      ║
 * ║    (P11). Por isso as linhas são REFILTRADAS aqui.                                    ║
 * ║ ⛔ Falha de leitura NUNCA vira zero: `{ ok: false }`, e a tela diz que não leu.       ║
 * ║ ⛔ Teto visível: saturou (`TETO_DO_CAIXA + 1` linhas) ⇒ `parcial: true`.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `card_statements.pago_transacao_id` vem de TODAS as faturas, sem filtro de data (P10): o
 * pagamento de uma fatura antiga pode cair no período, e a fatura não carrega a data dele.
 * Os recebíveis são os de `/terceiros` (`getReceivables`) — a mesma leitura, não uma segunda.
 *
 * O client é o COM SESSÃO: a RLS escopa o dono, então nenhuma consulta leva `user_id`.
 */
import { SETTLED_STATUSES } from "@/lib/finance/constants";
import {
  dataDeCaixa,
  mesAnteriorDe,
  periodoAteODia,
  type Periodo,
  type TxDeCaixa,
} from "@/lib/finance/caixa";
import { getReceivables } from "@/lib/finance/queries";
import type { RecebivelComRecebimentos } from "@/lib/finance/recebimentos";
import { createClient } from "@/lib/supabase/server";

/** Linhas lidas por consulta. Saturou ⇒ `parcial`. */
export const TETO_DO_CAIXA = 5000;

const COLUNAS =
  "id,type,status,amount,valor_pessoal,competence_date,liquidado_em,account_id,transfer_account_id,card_id";

export type LeituraDoCaixa =
  | {
      ok: true;
      transactions: TxDeCaixa[];
      pagamentosDeFatura: Set<string>;
      recebiveis: RecebivelComRecebimentos[];
      /** O teto cortou: há lançamentos na janela que não vieram. */
      parcial: boolean;
      periodoLido: Periodo;
    }
  | { ok: false };

/**
 * O filtro `or` do PostgREST para a janela: com data de liquidação, vale ela; sem, vale a
 * competência. Afunila a consulta — a decisão final é `dataDeCaixa` (P11).
 */
export function filtroDaJanelaDeCaixa(p: Periodo): string {
  return (
    `and(liquidado_em.is.null,competence_date.gte.${p.de},competence_date.lte.${p.ate}),` +
    `and(liquidado_em.gte.${p.de},liquidado_em.lte.${p.ate})`
  );
}

type LinhaBruta = Omit<TxDeCaixa, "amount" | "valor_pessoal"> & {
  // O PostgREST pode devolver `numeric` como texto.
  amount: number | string;
  valor_pessoal: number | string | null;
};

/** Lê os lançamentos liquidados da janela, os pagamentos de fatura e os recebíveis. */
export async function lerCaixaDoMes(mesSel: string): Promise<LeituraDoCaixa> {
  const periodoLido: Periodo = {
    de: `${mesAnteriorDe(mesSel)}-01`,
    ate: periodoAteODia(mesSel, 31).ate,
  };

  const supabase = await createClient();
  const [lancamentos, faturas, recebiveis] = await Promise.all([
    supabase
      .from("transactions")
      .select(COLUNAS)
      .in("status", [...SETTLED_STATUSES])
      .or(filtroDaJanelaDeCaixa(periodoLido))
      .limit(TETO_DO_CAIXA + 1),
    supabase.from("card_statements").select("pago_transacao_id").not("pago_transacao_id", "is", null),
    getReceivables(),
  ]);

  if (lancamentos.error || faturas.error) return { ok: false };

  const brutas = (lancamentos.data ?? []) as unknown as LinhaBruta[];
  const parcial = brutas.length > TETO_DO_CAIXA;

  const transactions: TxDeCaixa[] = brutas
    .slice(0, TETO_DO_CAIXA)
    .map((l) => ({
      ...l,
      amount: Number(l.amount),
      valor_pessoal: l.valor_pessoal === null ? null : Number(l.valor_pessoal),
    }))
    .filter((t) => {
      const { data } = dataDeCaixa(t);
      return data >= periodoLido.de && data <= periodoLido.ate;
    });

  const pagamentosDeFatura = new Set<string>();
  for (const f of (faturas.data ?? []) as { pago_transacao_id: string | null }[]) {
    if (f.pago_transacao_id) pagamentosDeFatura.add(f.pago_transacao_id);
  }

  return { ok: true, transactions, pagamentosDeFatura, recebiveis, parcial, periodoLido };
}
