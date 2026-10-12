/**
 * REDESIGN-03-D · A4 — NINGUÉM APAGA DINHEIRO QUE ENTROU. Uma regra, pura; os cinco pontos que
 * apagam recebível (direto ou por cascade) a chamam e nenhum a reimplementa.
 *
 * - "regra-cheia": recebimento registrado, ou status `cobrado`/`pago`/`ignorado` (o `ignorado`
 *   entrou com o B1, D11: apagá-lo mudaria minha despesa em silêncio).
 * - "so-dinheiro-registrado": só recebimento registrado — `deleteTransaction` e o desfazer da IA
 *   (decisão (b) do dono): a regra cheia neles bloquearia hoje a exclusão de até 170 lançamentos.
 */
export type RecebivelParaProteger = { readonly status: string; readonly temRecebimento: boolean };
export type AlcanceDaProtecao = "regra-cheia" | "so-dinheiro-registrado";
export type AcaoQueApaga =
  | "alterar a divisão"
  | "cancelar as parcelas futuras"
  | "desfazer a importação"
  | "excluir o lançamento";

const STATUS_PROTEGIDOS = ["cobrado", "pago", "ignorado"];

export function recebivelProtegido(r: RecebivelParaProteger, alcance: AlcanceDaProtecao): boolean {
  if (r.temRecebimento) return true;
  return alcance === "regra-cheia" && STATUS_PROTEGIDOS.includes(r.status);
}

export function motivoParaNaoApagar(
  recs: readonly RecebivelParaProteger[],
  alcance: AlcanceDaProtecao,
  acao: AcaoQueApaga,
): string | null {
  const comDinheiro = recs.filter((r) => r.temRecebimento).length;
  if (comDinheiro > 0) {
    return `Há ${comDinheiro} recebível(is) com recebimento registrado. Desfaça o recebimento em A Receber antes de ${acao}.`;
  }
  if (alcance === "so-dinheiro-registrado") return null;
  const decididos = recs.filter((r) => STATUS_PROTEGIDOS.includes(r.status)).length;
  if (decididos > 0) {
    return `Há ${decididos} recebível(is) cobrado(s), recebido(s) ou que você decidiu não cobrar. Acerte-os em A Receber antes de ${acao}.`;
  }
  return null;
}
