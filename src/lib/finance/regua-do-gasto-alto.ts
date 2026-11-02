import { diaDeCorte, resumoAteODia } from "@/lib/finance/caixa";
import {
  mediaDeSaidas,
  resumoMes,
  ultimosMeses,
  type DashReceivable,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";

/**
 * REDESIGN-04-A (K3) — A régua do alerta de gasto alto, a MESMA para a tela e para o sino.
 *
 * Desde a 03-B2 (B2, decisão do dono) a tela e o sino compartilham UMA régua: `mediaSaidas` é a
 * média dos até 5 meses ANTERIORES a `mes` que tiveram saída (`ultimosMeses(mes, 6)` sem o
 * último), mês sem saída ignorado.
 *
 * K3 (04-A): com `mes` em andamento (`hoje` dentro dele), a comparação passa a ser "até o dia D,
 * sem o cartão" — `saidas` e cada mês da média são cortados na MESMA altura (D = o dia de `hoje`)
 * por `resumoAteODia`, só o à vista; a fatura do cartão fica de fora e `cartaoFora` diz isso.
 * Comparar o mês parcial com meses inteiros fazia o alerta nunca disparar no começo do mês e
 * disparar sempre perto da fatura. Com o mês fechado (`ateODia: null`) a conta é a de antes,
 * inalterada: mês inteiro, pendente e cartão incluídos (§13.3).
 *
 * Quem chama lê pelo menos `janelaDoGastoAlto(mes)` (pipeline.ts): meses fora dela entram como
 * sem saída, e seriam ignorados em silêncio.
 */
export type ReguaDoGastoAlto = {
  saidas: number;
  mediaSaidas: number;
  /** O dia de corte; `null` com o mês fechado (a conta inteira de sempre). */
  ateODia: number | null;
  /** O cartão fica fora da conta (só no corte até o dia D). */
  cartaoFora: boolean;
};

export function reguaDoGastoAlto(params: {
  mes: string;
  hoje: string;
  transactions: DashTx[];
  statements: DashStatement[];
  receivables: DashReceivable[];
}): ReguaDoGastoAlto {
  const { mes, hoje, transactions, statements, receivables } = params;
  const dia = diaDeCorte(mes, hoje);
  const anteriores = ultimosMeses(mes, 6).slice(0, -1);

  if (dia === null) {
    const saidasDe = (m: string) =>
      resumoMes({ mes: m, transactions, statements, receivables }).saidas;
    return {
      saidas: saidasDe(mes),
      mediaSaidas: mediaDeSaidas(anteriores.map((m) => ({ mes: m, saidas: saidasDe(m) }))),
      ateODia: null,
      cartaoFora: false,
    };
  }

  const saidasAteODia = (m: string) => resumoAteODia(m, dia, transactions, receivables).saidas;
  return {
    saidas: saidasAteODia(mes),
    mediaSaidas: mediaDeSaidas(anteriores.map((m) => ({ mes: m, saidas: saidasAteODia(m) }))),
    ateODia: dia,
    cartaoFora: true,
  };
}
