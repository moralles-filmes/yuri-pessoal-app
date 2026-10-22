/**
 * REDESIGN-03-F · A2 — o desfazer do pagamento de fatura, PURO (testado em
 * desfazer-pagamento.test.ts). Sem supabase e sem next: a tela importa daqui.
 *
 * Desfazer deixou de ser um clique. A tela LÊ o pagamento antes (qual lançamento sai, de qual
 * conta, com que valor e em que data foi pago), e a confirmação fica PRESA ao lançamento lido:
 * a RPC `desfazer_pagamento_fatura` recusa se o pagamento mudou entre a leitura e o clique.
 */
import { MSG_FATURA_NAO_ENCONTRADA, MSG_FATURA_SEM_SESSAO } from "@/lib/finance/statement-payment";
import { dateInSaoPaulo, formatCurrency, formatDate } from "@/lib/format";

/** O lançamento apontado por `card_statements.pago_transacao_id`, já com o nome da conta. */
export type LancamentoDoPagamento = {
  id: string;
  type: string;
  status: string;
  amount: number;
  description: string;
  transfer_account_id: string | null;
  transfer_group_id: string | null;
  /** Nome da conta debitada; `null` = a conta foi excluída (nenhum saldo volta). */
  conta: string | null;
};

export type PrevisaoDoDesfazer =
  | {
      estado: "com-lancamento";
      lancamentoId: string;
      descricao: string;
      conta: string | null;
      valor: number;
      /** 'yyyy-MM-dd', em Brasília. */
      dataPagamento: string;
    }
  | { estado: "sem-lancamento"; dataPagamento: string }
  | { estado: "pagamento-editado" }
  | { estado: "nao-paga" };

/**
 * O lançamento ainda tem a forma do pagamento que `pagar_fatura` cria? São as MESMAS quatro
 * condições que `desfazer_pagamento_fatura` confere no SQL (o lado SQL é travado por
 * `m-f-pagamento-fatura.test.ts`). Um pagamento editado em Lançamentos — virou despesa (e pode
 * ter sido dividido), saiu de `pago`, ganhou destino — sai por Lançamentos → excluir, que
 * confere os recebíveis (D-F7).
 */
export function temFormaDePagamentoDeFatura(
  l: Pick<LancamentoDoPagamento, "type" | "status" | "transfer_account_id" | "transfer_group_id">,
): boolean {
  return (
    l.type === "transferencia" &&
    l.status === "pago" &&
    l.transfer_account_id == null &&
    l.transfer_group_id == null
  );
}

export function previsaoDoDesfazer(p: {
  fatura: { pago_em: string | null; pago_transacao_id: string | null };
  lancamento: LancamentoDoPagamento | null;
}): PrevisaoDoDesfazer {
  const { fatura, lancamento } = p;
  if (!fatura.pago_em) return { estado: "nao-paga" };
  // `pago_em` é timestamptz: o dia sai em Brasília, nunca de `.slice(0, 10)` (que é o dia UTC).
  const dataPagamento = dateInSaoPaulo(new Date(fatura.pago_em));
  // Ponteiro preenchido sem lançamento é corrida (o FK zeraria o ponteiro): a confirmação manda
  // `null`, e a RPC recusa com PAGAMENTO_MUDOU se o ponteiro ainda existir.
  if (!fatura.pago_transacao_id || !lancamento) return { estado: "sem-lancamento", dataPagamento };
  if (!temFormaDePagamentoDeFatura(lancamento)) return { estado: "pagamento-editado" };
  return {
    estado: "com-lancamento",
    lancamentoId: lancamento.id,
    descricao: lancamento.description,
    conta: lancamento.conta,
    valor: lancamento.amount,
    dataPagamento,
  };
}

export const MSG_FATURA_NAO_PAGA = "Esta fatura já não está paga.";
export const MSG_PAGAMENTO_MUDOU =
  "O pagamento desta fatura mudou desde que você abriu a confirmação. Abra de novo para ver o atual.";
export const MSG_PAGAMENTO_EDITADO =
  "O lançamento deste pagamento foi editado em Lançamentos. Para desfazer, exclua-o por lá — a fatura reabre junto.";
export const MSG_DESFAZER_INCERTO =
  "Não foi possível confirmar o desfazer. Recarregue a página para ver o estado atual.";

/**
 * O que o diálogo de desfazer escreve para cada estado da leitura (REDESIGN-03-F · A3, spec §5.4).
 * Puro: valor e data saem formatados daqui, para a tela não montar frase nenhuma.
 *
 * `podeConfirmar` só vale onde há o que desfazer; `linkLancamentos` só onde a saída é por
 * Lançamentos (pagamento editado).
 */
export function textoDoDesfazer(p: PrevisaoDoDesfazer): {
  texto: string;
  podeConfirmar: boolean;
  linkLancamentos: boolean;
} {
  switch (p.estado) {
    case "com-lancamento": {
      const emAberto = "As compras desta fatura voltam a ficar em aberto.";
      const feitoEm = `Pagamento feito em ${formatDate(p.dataPagamento)}.`;
      const texto =
        p.conta != null
          ? `O lançamento «${p.descricao}» será excluído. ${formatCurrency(p.valor)} volta ao saldo de ${p.conta}. ${feitoEm} ${emAberto}`
          : `O lançamento «${p.descricao}», de ${formatCurrency(p.valor)}, será excluído. Ele era de uma conta que foi excluída; nenhum saldo volta. ${feitoEm} ${emAberto}`;
      return { texto, podeConfirmar: true, linkLancamentos: false };
    }
    case "sem-lancamento":
      return {
        texto: `Esta fatura está marcada como paga em ${formatDate(p.dataPagamento)}, mas sem lançamento de pagamento. Desfazer só a reabre; nenhum saldo muda.`,
        podeConfirmar: true,
        linkLancamentos: false,
      };
    case "pagamento-editado":
      return { texto: MSG_PAGAMENTO_EDITADO, podeConfirmar: false, linkLancamentos: true };
    case "nao-paga":
      return { texto: MSG_FATURA_NAO_PAGA, podeConfirmar: false, linkLancamentos: false };
  }
}

/**
 * Traduz o erro da RPC `desfazer_pagamento_fatura` (o texto exato do `raise`) para a tela. Só
 * igualdade exata; o desconhecido (rede, timeout) não afirma o que aconteceu.
 */
export function mensagemDoErroDoDesfazer(error: { message?: string } | null): string {
  switch (error?.message) {
    case "FATURA_NAO_PAGA":
      return MSG_FATURA_NAO_PAGA;
    case "PAGAMENTO_MUDOU":
      return MSG_PAGAMENTO_MUDOU;
    case "PAGAMENTO_EDITADO":
      return MSG_PAGAMENTO_EDITADO;
    case "FATURA_NAO_ENCONTRADA":
      return MSG_FATURA_NAO_ENCONTRADA;
    case "FATURA_SEM_SESSAO":
      return MSG_FATURA_SEM_SESSAO;
    default:
      return MSG_DESFAZER_INCERTO;
  }
}
