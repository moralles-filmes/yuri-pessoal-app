/**
 * REDESIGN-04-A2 — a RESPONSABILIDADE do relatório financeiro (Meu · Terceiros · Consolidado).
 *
 * Esta é uma ESCOLHA DE CAMPO, não uma conta nova. `evolucaoDaResponsabilidade` apenas escolhe,
 * mês a mês, qual campo de `resumoMes` mostrar; quem calcula é o motor (`dashboard.ts`). O saldo
 * de um ponto em "terceiros" ou "consolidado" é `entradas − saidas` do mesmo par, em centavos.
 *
 * Nada aqui lê o relógio nem o banco: os meses e os dados chegam de fora. Todo dinheiro é
 * somado em CENTAVOS (`reaisParaCentavos`/`centavosParaReais`).
 */
import {
  type DashReceivable,
  type DashStatement,
  type DashTx,
  type EvolucaoPonto,
  evolucaoMensal,
  resumoMes,
} from "@/lib/finance/dashboard";
import { centavosParaReais, reaisParaCentavos } from "@/lib/format";

export type Responsabilidade = "meu" | "terceiros" | "consolidado";

export const ROTULO_DA_RESPONSABILIDADE: Record<Responsabilidade, string> = {
  meu: "Meu",
  terceiros: "Terceiros",
  consolidado: "Consolidado",
};

/**
 * Lê a responsabilidade da URL (`?resp=`). Ausente, inválida ou repetida (array) cai em "meu",
 * que é a visão que o painel mostra por padrão.
 */
export function responsabilidadeDaUrl(v: string | string[] | undefined): Responsabilidade {
  if (v === "terceiros" || v === "consolidado") return v;
  return "meu";
}

/**
 * A série mês a mês da responsabilidade. Só escolhe o campo de `resumoMes`:
 * - meu → `evolucaoMensal` (entradas e saídas minhas);
 * - terceiros → `entradasTerceiros` × `terceiros`;
 * - consolidado → `entradas` × `saidas` (brutos).
 */
export function evolucaoDaResponsabilidade(p: {
  meses: string[];
  resp: Responsabilidade;
  transactions: DashTx[];
  statements: DashStatement[];
  receivables: DashReceivable[];
}): EvolucaoPonto[] {
  const { meses, resp, transactions, statements, receivables } = p;
  if (resp === "meu") return evolucaoMensal({ meses, transactions, statements, receivables });

  return meses.map((mes) => {
    const r = resumoMes({ mes, transactions, statements, receivables });
    const entradas = resp === "terceiros" ? r.entradasTerceiros : r.entradas;
    const saidas = resp === "terceiros" ? r.terceiros : r.saidas;
    const saldo = centavosParaReais(reaisParaCentavos(entradas) - reaisParaCentavos(saidas));
    return { mes, entradas, saidas, saldo };
  });
}

/**
 * O valor de cada fatia na responsabilidade escolhida, em reais:
 * - meu → `meu`;
 * - consolidado → `movimentado`;
 * - terceiros → `movimentado − meu`, em centavos (a soma fecha sem drift de ponto flutuante).
 */
export function fatiasDaResponsabilidade<F extends { movimentado: number; meu: number }>(
  fatias: readonly F[],
  resp: Responsabilidade,
): (F & { valor: number })[] {
  return fatias.map((f) => {
    let valor: number;
    if (resp === "meu") valor = f.meu;
    else if (resp === "consolidado") valor = f.movimentado;
    else valor = centavosParaReais(reaisParaCentavos(f.movimentado) - reaisParaCentavos(f.meu));
    return { ...f, valor };
  });
}
