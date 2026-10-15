import "server-only";
/**
 * REDESIGN-03-D · A3 — A ÚNICA ESCRITA de `receivable_receipts` (e das transições de status
 * do recebível).
 *
 * ⛔ A COLUNA `status` NUNCA AFIRMA `pago` SEM A SOMA FECHAR (K1). Por isso a ORDEM:
 *   • receber/registrar: o recebimento PRIMEIRO (o trigger é a trava), a coluna DEPOIS;
 *   • desfazer: a coluna PRIMEIRO, o recebimento DEPOIS.
 * A falha no meio deixa sempre "coluna em aberto, soma fechada" — que conta zero em todo total
 * e se conserta com "Receber" —, nunca "coluna `pago`, soma aberta".
 * ⛔ `parcial` nunca é gravado. ⛔ `conta_id`/`transaction_id` nunca são enviados (K2).
 * ⛔ Valor acima do saldo: quem trava é o trigger (`23514`); a pré-checagem existe para a
 *    mensagem e para o legado, que o trigger não vê (K0).
 */
import { dbError, invalid, type AuthContext } from "@/lib/actions/helpers";
import type { ActionResult } from "@/types/finance";
import { centavosParaReais, formatCurrency, reaisParaCentavos } from "@/lib/format";
import {
  anexarRecebimentos,
  dataDoUltimoRecebimento,
  emAberto,
  estadoDoRecebivel,
  resumirRecebivel,
  saldoCentavos,
  ultimoRecebimento,
  type EstadoDoRecebivel,
} from "@/lib/finance/recebimentos";
import { recebimentosDe } from "@/lib/finance/recebimentos-leitura";
import {
  ORIGENS_DA_ACAO,
  TAMANHO_DO_BLOCO,
  dividirEmBlocos,
  patchDaAcao,
  type BulkReceivableAction,
} from "@/lib/finance/receivables-bulk";
import type { RecebimentoDoBanco } from "@/types/database";

export type ContextoDoServico = Pick<AuthContext, "supabase" | "userId">;

export type DadosDoRecebimento = {
  receivable_id: string;
  valor: number;
  recebido_em: string;
  observacoes: string | null;
};

const MSG = {
  naoExiste: "O recebível não existe mais (ou não é seu).",
  ignorado: "Volte o recebível para pendente antes de registrar um recebimento.",
  quitado: "Este recebível já está quitado.",
  futuro: "A data do recebimento não pode estar no futuro.",
  nadaADesfazer: "Não há recebimento para desfazer.",
  colunaDepois:
    "O recebimento foi registrado, mas o status não foi atualizado. Clique em Receber para concluir.",
  saldoMudou: "O saldo deste recebível mudou enquanto você recebia. Atualize a tela e confira.",
  desconhecido: "O status deste recebível não é reconhecido.",
} as const;

export function mensagemDoSaldo(saldoCentavos: number): string {
  return `Passa do saldo deste recebível: restam ${formatCurrency(centavosParaReais(saldoCentavos))}.`;
}

type Lido = {
  id: string;
  valor: number;
  status: string;
  pago_em: string | null;
  recebimentos: RecebimentoDoBanco[];
};

async function lerRecebivel(ctx: ContextoDoServico, id: string): Promise<Lido | null | "erro"> {
  const { data, error } = await ctx.supabase
    .from("receivables")
    .select("id, valor, status, pago_em")
    .eq("id", id)
    .maybeSingle();
  if (error) return "erro";
  if (!data) return null;
  const recs = await recebimentosDe(ctx.supabase, [id]);
  if (recs.erro) return "erro";
  return { ...(data as Omit<Lido, "recebimentos">), recebimentos: recs.linhas };
}

function situacao(r: Lido): { estado: EstadoDoRecebivel; saldo: number } {
  const resumido = resumirRecebivel(r);
  return { estado: estadoDoRecebivel(resumido), saldo: saldoCentavos(resumido) };
}

const campoValor = (saldo: number): ActionResult<never> => invalid({ valor: [mensagemDoSaldo(saldo)] });

/** Registrar um recebimento (parcial ou total). */
export async function registrarRecebimento(
  ctx: ContextoDoServico,
  dados: DadosDoRecebimento,
  hoje: string,
): Promise<ActionResult> {
  if (dados.recebido_em > hoje) return invalid({ recebido_em: [MSG.futuro] });

  const lido = await lerRecebivel(ctx, dados.receivable_id);
  if (lido === "erro") return dbError("Não foi possível ler o recebível.");
  if (!lido) return dbError(MSG.naoExiste);

  const { estado, saldo } = situacao(lido);
  if (estado === "desconhecido") return dbError(MSG.desconhecido);
  if (estado === "ignorado") return dbError(MSG.ignorado);
  if (saldo <= 0) return dbError(MSG.quitado);

  const valorCent = reaisParaCentavos(dados.valor);
  if (valorCent <= 0) return invalid({ valor: ["Informe um valor maior que zero."] });
  if (valorCent > saldo) return campoValor(saldo);

  const { error } = await ctx.supabase.from("receivable_receipts").insert({
    user_id: ctx.userId,
    receivable_id: lido.id,
    valor: centavosParaReais(valorCent),
    recebido_em: dados.recebido_em,
    observacoes: dados.observacoes,
  });
  if (error) {
    if (error.code === "23514") {
      const releitura = await lerRecebivel(ctx, lido.id);
      if (!releitura || releitura === "erro") return invalid({ valor: ["Passa do saldo deste recebível."] });
      return campoValor(situacao(releitura).saldo);
    }
    return dbError("Não foi possível registrar o recebimento.");
  }

  if (valorCent === saldo) {
    const { error: erroDaColuna } = await ctx.supabase
      .from("receivables")
      .update({ status: "pago", pago_em: dados.recebido_em })
      .eq("id", lido.id);
    if (erroDaColuna) return dbError(MSG.colunaDepois);
  }
  return { ok: true, data: undefined };
}

/** "Receber": um recebimento do saldo restante, e a coluna em `pago`. */
export async function receberSaldo(
  ctx: ContextoDoServico,
  id: string,
  recebidoEm: string,
  hoje: string,
): Promise<ActionResult> {
  if (recebidoEm > hoje) return invalid({ recebido_em: [MSG.futuro] });

  const lido = await lerRecebivel(ctx, id);
  if (lido === "erro") return dbError("Não foi possível ler o recebível.");
  if (!lido) return dbError(MSG.naoExiste);

  const { estado, saldo } = situacao(lido);
  if (estado === "desconhecido") return dbError(MSG.desconhecido);
  if (estado === "ignorado") return dbError(MSG.ignorado);
  if (lido.status === "pago" && saldo <= 0) return dbError(MSG.quitado);

  if (saldo <= 0) {
    // Soma fechada com a coluna em aberto (falha anterior entre as duas escritas), ou
    // recebível de valor zero: só a coluna — nunca um recebimento de zero.
    const data = dataDoUltimoRecebimento(lido.recebimentos) ?? recebidoEm;
    const { error } = await ctx.supabase
      .from("receivables")
      .update({ status: "pago", pago_em: data })
      .eq("id", lido.id);
    return error ? dbError("Não foi possível marcar como recebido.") : { ok: true, data: undefined };
  }

  const { error } = await ctx.supabase.from("receivable_receipts").insert({
    user_id: ctx.userId,
    receivable_id: lido.id,
    valor: centavosParaReais(saldo),
    recebido_em: recebidoEm,
    observacoes: null,
  });
  if (error) return dbError(error.code === "23514" ? MSG.saldoMudou : "Não foi possível marcar como recebido.");

  const { error: erroDaColuna } = await ctx.supabase
    .from("receivables")
    .update({ status: "pago", pago_em: recebidoEm })
    .eq("id", lido.id);
  if (erroDaColuna) return dbError(MSG.colunaDepois);
  return { ok: true, data: undefined };
}

/** "Desfazer": o ÚLTIMO recebimento (P6). A coluna sai de `pago` ANTES de apagar. */
export async function desfazerUltimoRecebimento(
  ctx: ContextoDoServico,
  id: string,
): Promise<ActionResult> {
  const lido = await lerRecebivel(ctx, id);
  if (lido === "erro") return dbError("Não foi possível ler o recebível.");
  if (!lido) return dbError(MSG.naoExiste);

  const ultimo = ultimoRecebimento(lido.recebimentos);
  if (!ultimo && lido.status !== "pago") return dbError(MSG.nadaADesfazer);

  if (lido.status === "pago") {
    const { error } = await ctx.supabase
      .from("receivables")
      .update({ status: "pendente", pago_em: null })
      .eq("id", lido.id);
    if (error) return dbError("Não foi possível desfazer o recebimento.");
  }
  if (!ultimo) return { ok: true, data: undefined }; // legado: só a coluna

  const { error } = await ctx.supabase
    .from("receivable_receipts")
    .delete()
    .eq("id", ultimo.id)
    .eq("receivable_id", lido.id);
  if (error) {
    return dbError("O recebível voltou para pendente, mas o recebimento não foi removido. Tente de novo.");
  }
  return { ok: true, data: undefined };
}

/** As decisões do dono: cobrado, ignorado e voltar para pendente (K1). */
export async function decidirRecebivel(
  ctx: ContextoDoServico,
  id: string,
  decisao: "pendente" | "cobrado" | "ignorado",
): Promise<ActionResult> {
  const lido = await lerRecebivel(ctx, id);
  if (lido === "erro") return dbError("Não foi possível ler o recebível.");
  if (!lido) return dbError(MSG.naoExiste);
  const { estado } = situacao(lido);

  if (decisao === "cobrado" && !(lido.status === "pendente" && emAberto(resumirRecebivel(lido)))) {
    return dbError("Só um recebível pendente pode ser marcado como cobrado.");
  }
  if (decisao === "ignorado") {
    if (estado === "ignorado") return dbError("Este recebível já está marcado como não cobrado.");
    if (!emAberto(resumirRecebivel(lido))) {
      return dbError("Este recebível já está quitado: desfaça o recebimento antes de ignorar.");
    }
  }
  if (decisao === "pendente") {
    if (lido.status === "pago") return dbError("Use Desfazer para reabrir um recebível recebido.");
    if (lido.status === "pendente") return { ok: true, data: undefined };
  }

  const { error } = await ctx.supabase
    .from("receivables")
    .update({ status: decisao, pago_em: null })
    .eq("id", lido.id);
  return error ? dbError("Não foi possível atualizar o recebível.") : { ok: true, data: undefined };
}

function falhaNoMeio(afetados: number, detalhe?: string): ActionResult<never> {
  return dbError(
    detalhe ??
      (afetados > 0
        ? `Falha no meio do lote. ${afetados} recebível(is) foram atualizados; tente novamente para o restante.`
        : "Não foi possível aplicar a ação aos recebíveis."),
  );
}

/** O lote, com as MESMAS regras e a MESMA ordem das ações de um item só. */
export async function aplicarAcaoEmMassa(
  ctx: ContextoDoServico,
  ids: readonly string[],
  acao: BulkReceivableAction,
  data: string,
  hoje: string,
): Promise<ActionResult<{ afetados: number; ignorados: number }>> {
  if (acao === "receber" && data > hoje) return invalid({ pago_em: [MSG.futuro] });
  const unicos = [...new Set(ids)];
  let afetados = 0;

  for (const bloco of dividirEmBlocos(unicos, TAMANHO_DO_BLOCO)) {
    const { data: linhas, error } = await ctx.supabase
      .from("receivables")
      .select("id, valor, status, pago_em")
      .in("id", bloco)
      .in("status", ORIGENS_DA_ACAO[acao]);
    if (error) return falhaNoMeio(afetados);
    const recs = await recebimentosDe(ctx.supabase, (linhas ?? []).map((l) => l.id));
    if (recs.erro) return falhaNoMeio(afetados);
    const lidos = anexarRecebimentos((linhas ?? []) as Omit<Lido, "recebimentos">[], recs.linhas);

    if (acao === "cobrado" || acao === "ignorar") {
      const alvo = lidos
        .filter((r) => (acao === "ignorar" ? emAberto(resumirRecebivel(r)) : situacao(r).estado !== "pago"))
        .map((r) => r.id);
      if (alvo.length === 0) continue;
      const { data: alterados, error: e } = await ctx.supabase
        .from("receivables")
        .update(patchDaAcao(acao, data))
        .in("id", alvo)
        .in("status", ORIGENS_DA_ACAO[acao])
        .select("id");
      if (e) return falhaNoMeio(afetados);
      afetados += alterados?.length ?? 0;
      continue;
    }

    if (acao === "receber") {
      const novos: { user_id: string; receivable_id: string; valor: number; recebido_em: string; observacoes: null }[] = [];
      const alvo: string[] = [];
      for (const r of lidos) {
        const { estado, saldo } = situacao(r);
        if (!emAberto(resumirRecebivel(r)) && estado !== "pago") continue;
        if (saldo > 0) {
          novos.push({ user_id: ctx.userId, receivable_id: r.id, valor: centavosParaReais(saldo), recebido_em: data, observacoes: null });
        }
        alvo.push(r.id);
      }
      if (novos.length > 0) {
        const { error: e } = await ctx.supabase.from("receivable_receipts").insert(novos);
        if (e) return falhaNoMeio(afetados, e.code === "23514" ? MSG.saldoMudou : undefined);
      }
      if (alvo.length === 0) continue;
      const { data: alterados, error: e } = await ctx.supabase
        .from("receivables")
        .update({ status: "pago", pago_em: data })
        .in("id", alvo)
        .select("id");
      if (e) return falhaNoMeio(afetados, MSG.colunaDepois);
      afetados += alterados?.length ?? 0;
      continue;
    }

    // desfazer — origem: coluna `pago`. A coluna PRIMEIRO, o último recebimento DEPOIS.
    const alvo = lidos.map((r) => r.id);
    if (alvo.length === 0) continue;
    const { data: alterados, error: e } = await ctx.supabase
      .from("receivables")
      .update({ status: "pendente", pago_em: null })
      .in("id", alvo)
      .in("status", ["pago"])
      .select("id");
    if (e) return falhaNoMeio(afetados);
    afetados += alterados?.length ?? 0;
    const ultimos = lidos
      .map((r) => ultimoRecebimento(r.recebimentos)?.id)
      .filter((x): x is string => Boolean(x));
    if (ultimos.length > 0) {
      const { error: e2 } = await ctx.supabase.from("receivable_receipts").delete().in("id", ultimos);
      if (e2) {
        return falhaNoMeio(afetados, "Os recebíveis voltaram para pendente, mas os recebimentos não foram removidos. Use Desfazer em cada recebível para concluir.");
      }
    }
  }

  return { ok: true, data: { afetados, ignorados: unicos.length - afetados } };
}
