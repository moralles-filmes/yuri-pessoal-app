/**
 * Tokens e formatadores compartilhados dos gráficos do dashboard (Fase 07).
 * Cores e estilos saem SEMPRE das variáveis CSS do design system (preto/branco/dourado),
 * garantindo legibilidade em dark e light. Valores em BRL e meses em pt-BR.
 */
import { formatCurrency } from "@/lib/format";

/** Paleta dos gráficos: dourado + neutros (definida em globals.css p/ dark e light). */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
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
