/**
 * REDESIGN-03-E · T4a — O PARÂMETRO DE BASE (`?base=`), puro.
 *
 * A tela lê este módulo, então ele tem ZERO imports de runtime (só `import type`, se precisar).
 *
 * ⛔ `caixa` SÓ quando o valor é exatamente `"caixa"`. Qualquer outra coisa — maiúscula, espaço,
 * lista (`?base=caixa&base=x`), vazio, ausente — cai em `competencia`, que é a base de sempre.
 * Errar para a base que o dono já conhece é o único erro aceitável: uma URL digitada à mão nunca
 * pode trocar de base em silêncio por causa de uma letra.
 */
export type BaseFinanceira = "competencia" | "caixa";

/** A base da URL. Igualdade exata: não há normalização, de propósito. */
export function baseDaUrl(v: unknown): BaseFinanceira {
  return v === "caixa" ? "caixa" : "competencia";
}

/** O rótulo que a tela escreve ao lado do número. */
export const ROTULO_DA_BASE: Record<BaseFinanceira, string> = {
  competencia: "Competência",
  caixa: "Caixa realizado",
};

/**
 * K1 — a marca de quando o dinheiro mexeu.
 *
 * A lista continua agrupada pela COMPETÊNCIA (o mês a que o lançamento pertence é a espinha
 * dorsal do extrato). A marca só declara, em texto, a data em que o dinheiro efetivamente
 * entrou/saiu — que pode ser outro dia, ou outro mês.
 *
 * Devolve `null` quando não há liquidação (`liquidado_em` nulo/vazio) ou quando ela coincide com
 * a competência — repetir a data do cabeçalho do dia seria ruído.
 *
 * Data pura `yyyy-MM-dd` manipulada como TEXTO (split), sem `Date`: nada de fuso horário
 * roubando um dia da data que veio do banco.
 */
export function marcaDaLiquidacao(t: {
  liquidado_em: string | null;
  competence_date: string;
  status: string;
}): string | null {
  const liquidado = t.liquidado_em;
  if (!liquidado || liquidado.length === 0) return null;
  if (liquidado === t.competence_date) return null;

  const [, mes, dia] = liquidado.split("-");
  if (!mes || !dia) return null;

  const verbo = t.status === "recebido" ? "recebido" : "pago";
  return `${verbo} em ${dia}/${mes}`;
}
