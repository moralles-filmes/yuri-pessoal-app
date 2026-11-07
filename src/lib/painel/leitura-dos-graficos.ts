/**
 * C5.2 · Leitura textual dos gráficos do painel (a tabela sr-only da fachada).
 *
 * Puro: sem I/O e sem `Date`. Cada função devolve `null` exatamente quando o `-impl` correspondente
 * mostra o EmptyState — a regra é a MESMA (em barras, `temDadosNasBarras` é importado, não copiado).
 * Os valores passam por `formatCurrency`, como no tooltip do gráfico.
 */
import { formatCurrency } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import type { FormaSlice, ProjecaoPonto } from "@/lib/finance/dashboard";
import { temDadosNasBarras } from "@/components/dashboard/barras-dados";

export type LinhaDaLeitura = { rotulo: string; valores: (string | null)[] };

/** `null` = gráfico vazio, sem tabela. */
export type LeituraDoGrafico = { colunas: string[]; linhas: LinhaDaLeitura[] } | null;

const brl = (v: number) => formatCurrency(v);

/** Espelha o `LABELS` de `forma-pagamento-chart-impl.tsx` (o -impl não exporta o seu). */
const LABELS: Record<string, string> = { ...PAYMENT_METHOD_LABELS, outro: "Outro" };

export function leituraDasBarras(p: {
  dados: readonly { mes: string; entradas: number; saidas: number; parcial: boolean }[];
  series?: "ambas" | "saidas";
  nomes?: { entradas: string; saidas: string };
  rotuloDoMes: (mes: string) => string;
}): LeituraDoGrafico {
  const {
    dados,
    series = "ambas",
    nomes = { entradas: "Minhas entradas", saidas: "Minhas saídas" },
    rotuloDoMes,
  } = p;
  if (!temDadosNasBarras(dados)) return null;

  const soSaidas = series === "saidas";
  return {
    colunas: soSaidas ? ["Mês", nomes.saidas] : ["Mês", nomes.entradas, nomes.saidas],
    linhas: dados.map((d) => ({
      // O mês em andamento sai marcado no texto, como sai hachurado no gráfico.
      rotulo: `${rotuloDoMes(d.mes)}${d.parcial ? " (parcial)" : ""}`,
      valores: soSaidas ? [brl(d.saidas)] : [brl(d.entradas), brl(d.saidas)],
    })),
  };
}

export function leituraDaProjecao(p: {
  data: readonly ProjecaoPonto[];
  rotuloDoMes: (mes: string) => string;
}): LeituraDoGrafico {
  const { data, rotuloDoMes } = p;
  if (!data.some((d) => d.total > 0)) return null;

  return {
    colunas: [
      "Mês",
      "Minha parte das faturas (projetado)",
      "Recorrências (projetado)",
      "Contas fixas (projetado)",
      "Total",
    ],
    linhas: data.map((d) => ({
      rotulo: rotuloDoMes(d.mes),
      valores: [brl(d.faturas), brl(d.recorrencias), brl(d.contasFixas), brl(d.total)],
    })),
  };
}

/** Mesmo formato de `ItemDoGraficoDeFaturas` (faturas-chart-impl), sem importar o componente. */
type ItemDeFatura = {
  mes: string;
  total: number | null;
  meu: number | null;
  terceiros: number | null;
};

export function leituraDasFaturas(p: {
  data: readonly ItemDeFatura[];
  vazio?: { titulo: string; descricao: string };
  rotuloDoMes: (mes: string) => string;
}): LeituraDoGrafico {
  const { data, vazio, rotuloDoMes } = p;
  // Mesma condição do -impl: com `vazio`, total zero é zero medido; sem ele, zero conta como vazio.
  const temFatura = vazio
    ? data.some((f) => f.total !== null)
    : data.some((f) => f.total !== null && f.total !== 0);
  if (!temFatura) return null;

  return {
    colunas: ["Mês", "Minha parte", "Parte de terceiros"],
    linhas: data.map((f) => {
      // Mês sem fatura: null em tudo, nunca R$ 0,00.
      if (f.total === null || f.meu === null || f.terceiros === null) {
        return { rotulo: rotuloDoMes(f.mes), valores: [null, null] };
      }
      return { rotulo: rotuloDoMes(f.mes), valores: [brl(f.meu), brl(f.terceiros)] };
    }),
  };
}

export function leituraDaForma(p: {
  data: readonly FormaSlice[];
  rotuloDaSerie?: string;
}): LeituraDoGrafico {
  const { data, rotuloDaSerie = "Minha parte" } = p;
  // Mesma regra do -impl: só o que eu gastei (meu > 0), do maior para o menor.
  const positivos = data.filter((d) => d.meu > 0).sort((a, b) => b.meu - a.meu);
  if (positivos.length === 0) return null;

  return {
    colunas: ["Forma de pagamento", rotuloDaSerie],
    linhas: positivos.map((d) => ({
      rotulo: LABELS[d.paymentMethod] ?? d.paymentMethod,
      valores: [brl(d.meu)],
    })),
  };
}
