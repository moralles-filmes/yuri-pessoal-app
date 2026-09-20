/**
 * Tokens e formatadores compartilhados dos gráficos do dashboard (Fase 07).
 * Cores e estilos saem SEMPRE das variáveis CSS do design system, garantindo
 * legibilidade em dark e light. Valores em BRL e meses em pt-BR.
 */
import { formatCurrency } from "@/lib/format";

/**
 * Paleta CATEGÓRICA dos gráficos — 8 slots, ordem fixa, definida em
 * `globals.css` para os dois temas e **validada** (`docs/redesign/TOKENS.md` §7).
 *
 * ⛔ ERAM 5, E ISSO ERA UM DEFEITO VISÍVEL, não só feiura. Dois dos cinco slots
 * antigos eram cinza, e quem indexa com `i % CHART_COLORS.length` repetia cor
 * DENTRO DO MESMO GRÁFICO: o donut de categorias desenha até 7 fatias (6 +
 * "Outros"), então a 6ª saía da cor da 1ª; as formas de pagamento são 8, então
 * três barras repetiam. Com 8 slots os dois cabem sem ciclar.
 *
 * ⚠️ Cor categórica é atribuída por IDENTIDADE e nunca ciclada. Uma 9ª série
 * não ganha cor gerada — ela vira "Outros", ou o gráfico vira vários pequenos.
 * Guardado por `src/lib/theme/tokens.test.ts`.
 */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

export const AXIS_COLOR = "var(--muted-foreground)";
export const GRID_COLOR = "var(--border)";

/** Estilo do tooltip (legível em ambos os temas). */
export const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  color: "var(--popover-foreground)",
  fontSize: 12,
  boxShadow: "0 4px 16px rgb(0 0 0 / 0.12)",
} as const;

export const tooltipLabelStyle = { color: "var(--muted-foreground)" } as const;
export const tooltipItemStyle = { color: "var(--popover-foreground)" } as const;

export const axisTick = { fill: AXIS_COLOR, fontSize: 12 } as const;

/** Formata um valor de eixo/tooltip como BRL. */
export const brl = (v: number | string) => formatCurrency(Number(v));

/** Abrevia BRL para eixos estreitos (ex.: R$ 1,2 mil / R$ 3 M). */
export function brlCompact(v: number | string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ 0";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `R$ ${(n / 1_000_000).toFixed(1).replace(".", ",")} M`;
  if (abs >= 1_000) return `R$ ${(n / 1_000).toFixed(1).replace(".", ",")} mil`;
  return `R$ ${Math.round(n)}`;
}

/** 'yyyy-MM' → rótulo curto pt-BR (ex.: "jun/26"). */
export function monthLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(y, m - 1, 1))
    .replace(".", "");
  return `${nome}/${String(y).slice(2)}`;
}
