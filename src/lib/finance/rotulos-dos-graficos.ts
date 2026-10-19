/**
 * Títulos e descrições dos gráficos financeiros — desenho 2026-10-18, §5.
 *
 * Fonte ÚNICA para `/dashboard/financeiro` e `/relatorios`: as duas telas usam os mesmos
 * gráficos, e duas cópias dos textos divergiriam na primeira edição. Cada título diz DE QUEM é o
 * número (meu × meu + terceiros) e cada descrição diz EM QUAL BASE ele está.
 *
 * A tela lê este módulo: ZERO imports de runtime (só `import type`).
 */
import type { BaseFinanceira } from "@/lib/finance/base";

type Rotulo = { titulo: string; descricao: string };

export type RotulosDosGraficos = {
  categorias: Rotulo;
  formas: Rotulo;
  evolucao: Rotulo;
  mesAMes: Rotulo;
  projecao: Rotulo;
  faturas: Rotulo;
  cardMinhasSaidas: { titulo: (mes: string) => string; bruto: string; terceiros: string };
};

const NOME_DA_BASE: Record<BaseFinanceira, string> = {
  competencia: "Competência",
  caixa: "Caixa realizado",
};

export function rotulosDosGraficos(p: {
  base: BaseFinanceira;
  /** Dia do corte do mês em andamento; `null` com o mês fechado. */
  ateODia: number | null;
}): RotulosDosGraficos {
  const nome = NOME_DA_BASE[p.base];
  const caixa = p.base === "caixa";
  const sobreOCartao = caixa
    ? " Compras do cartão no mês em que a fatura foi paga, só a sua parte."
    : " Compras do cartão no mês da fatura.";

  return {
    categorias: {
      titulo: "Meus gastos por categoria",
      descricao: `Só a sua parte. ${nome}.${sobreOCartao}`,
    },
    formas: {
      titulo: "Meus gastos por forma de pagamento",
      descricao: `Só a sua parte. ${nome}.${sobreOCartao}`,
    },
    evolucao: {
      titulo: "Minhas entradas e saídas mês a mês",
      descricao: caixa
        ? `Só a sua parte — terceiros fora. Últimos 6 meses, pelo dia em que o dinheiro mexeu na conta. ${nome}. Entradas = renda pessoal (reembolso não entra); fatura paga entra só com a sua parte. Resultado = minhas entradas − minhas saídas.`
        : `Só a sua parte — terceiros fora. Últimos 6 meses. ${nome}. Resultado = minhas entradas − minhas saídas.`,
    },
    mesAMes: {
      titulo: p.ateODia !== null ? `Meu mês a mês · até o dia ${p.ateODia}` : "Meu mês a mês",
      descricao: caixa
        ? `Minhas entradas e minhas saídas contra o mês anterior${p.ateODia !== null ? ", os dois até o mesmo dia" : ""}. ${nome}: o cartão entra como pagamento de fatura (sua parte).`
        : p.ateODia !== null
          ? `Minhas entradas e minhas saídas, os dois meses até o mesmo dia. ${nome}: saídas só à vista — o cartão não entra (a fatura não se divide por dia).`
          : `Minhas entradas e minhas saídas contra o mês anterior. ${nome}.`,
    },
    projecao: {
      titulo: "Minha projeção dos próximos meses",
      descricao: "Minha parte das faturas, recorrências e contas fixas. Pelo vencimento. Terceiros fora.",
    },
    faturas: {
      titulo: "Faturas dos próximos meses — valor cheio",
      descricao:
        "Total real das faturas de cartão, com todos os gastos: inclui gastos meus e de terceiros. Pelo vencimento.",
    },
    cardMinhasSaidas: {
      titulo: (mes) => `Minhas saídas · ${mes} · ${nome}`,
      bruto: caixa ? "Saiu das contas (bruto)" : "Saídas totais (bruto)",
      terceiros: caixa ? "Parte de terceiros no que saiu" : "Saídas de terceiros",
    },
  };
}
