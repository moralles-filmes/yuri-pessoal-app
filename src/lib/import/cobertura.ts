/**
 * O arquivo cobre a fatura inteira? (lógica PURA, testada em cobertura.test.ts)
 *
 * PROBLEMA QUE RESOLVE (bug real, 2026-08-06)
 * -------------------------------------------
 * Uma fatura foi importada com **R$ 7,96 a menos** que a fatura do banco. O sistema estava
 * certo em tudo: o parse batia centavo a centavo com o arquivo, e a soma da fatura batia com
 * a soma das linhas. O que faltava estava **fora do sistema** — o OFX exportado ia até 25/06,
 * mas a fatura só fechou em 04/07, e a compra do dia 03/07 nunca esteve no arquivo.
 *
 * Nenhuma tela tinha como mostrar isso: a revisão confere o que ESTÁ no arquivo, e o que não
 * está não aparece em lugar nenhum. Daí a comparação explícita entre a última data do arquivo
 * e o fechamento da fatura de destino.
 *
 * QUANDO NÃO AVISA
 * ----------------
 * - Fatura ainda ABERTA (fechamento no futuro): é natural o arquivo terminar antes — a fatura
 *   ainda vai receber compras, e avisar aqui seria ruído em toda importação parcial.
 * - Intervalo menor que `MIN_DIAS_AVISO`: ninguém compra todo dia, então a última compra cair
 *   um dia antes do fechamento é normal, não sinal de arquivo truncado.
 * - Sem competência confirmada, sem dias do cartão ou sem data válida: não dá para afirmar
 *   nada, e um aviso sem base é pior que nenhum.
 */
import { montarFatura } from "@/lib/finance/invoice";

/**
 * A partir de quantos dias entre a última compra do arquivo e o fechamento vale avisar.
 * Dois dias já indicam recorte (o caso real tinha nove); um dia é o intervalo comum de quem
 * simplesmente não comprou na véspera.
 */
export const MIN_DIAS_AVISO = 2;

export type CoberturaFatura = {
  /** Última data encontrada no arquivo ('yyyy-MM-dd'). */
  ultimaData: string;
  /** Data de fechamento da fatura de destino ('yyyy-MM-dd'). */
  dataFechamento: string;
  /** Dias entre a última data do arquivo e o fechamento (> 0). */
  diasDescobertos: number;
};

/** Diferença em dias entre duas datas puras 'yyyy-MM-dd' (sem fuso: aritmética em UTC). */
function diasEntre(de: string, ate: string): number {
  const [y1, m1, d1] = de.split("-").map(Number);
  const [y2, m2, d2] = ate.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Devolve o alerta de cobertura quando o arquivo termina ANTES do fechamento de uma fatura que
 * JÁ FECHOU — ou null quando não há o que avisar (ver "quando não avisa" acima).
 *
 * `hoje` é injetado pelo servidor (regra do projeto: nada de `Date.now()` em lógica pura).
 */
export function coberturaDaFatura(args: {
  /** Datas das linhas do arquivo ('yyyy-MM-dd'); nulas e inválidas são ignoradas. */
  datas: (string | null | undefined)[];
  /** Competência confirmada da fatura de destino ('yyyy-MM-01'). */
  competencia: string | null | undefined;
  diaFechamento: number | null | undefined;
  diaVencimento: number | null | undefined;
  /** 'yyyy-MM-dd' de hoje, no fuso do servidor. */
  hoje: string;
}): CoberturaFatura | null {
  const { competencia, diaFechamento, diaVencimento, hoje } = args;
  if (!competencia || diaFechamento == null || diaVencimento == null) return null;

  const m = /^(\d{4})-(\d{2})/.exec(competencia);
  if (!m) return null;

  // Competência é o dia 1 do mês de FECHAMENTO (invoice.ts) — daí sai a data de fechamento
  // com as mesmas guardas de borda usadas em todo o financeiro.
  const { dataFechamento } = montarFatura(
    Number(m[1]),
    Number(m[2]) - 1,
    diaFechamento,
    diaVencimento,
  );

  let ultimaData: string | null = null;
  for (const d of args.datas) {
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (ultimaData == null || d > ultimaData) ultimaData = d;
  }
  if (ultimaData == null) return null;

  // Fatura ainda aberta: arquivo parcial é o esperado.
  if (hoje < dataFechamento) return null;
  // O arquivo alcança o fechamento.
  if (ultimaData >= dataFechamento) return null;

  const diasDescobertos = diasEntre(ultimaData, dataFechamento);
  if (diasDescobertos < MIN_DIAS_AVISO) return null;

  return { ultimaData, dataFechamento, diasDescobertos };
}
