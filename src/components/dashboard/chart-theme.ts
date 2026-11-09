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

/** Uma casa decimal só quando ela existe: 10 → "10", 2,5 → "2,5". */
function curto(n: number): string {
  const arred = Math.round(n * 10) / 10;
  return Number.isInteger(arred) ? String(arred) : arred.toFixed(1).replace(".", ",");
}

/**
 * Abrevia BRL para eixos (ex.: R$ 10 mil / R$ 2,5 mil / R$ 1,2 mi). Sem ",0" — o rótulo de
 * eixo é o que mais aperta, e "R$ 10,0 mil" quebrava em duas linhas (desenho 2026-10-18, §6).
 * O tooltip continua com o valor exato (`formatCurrency`).
 */
export function brlCompact(v: number | string): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "R$ 0";
  const sinal = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sinal}R$ ${curto(abs / 1_000_000)} mi`;
  if (abs >= 1_000) return `${sinal}R$ ${curto(abs / 1_000)} mil`;
  return `${sinal}R$ ${Math.round(abs)}`;
}

/** Barras em vidro (09-E): larguras, vão, raio e opacidades do desenho. */
export const LARGURA_BARRA_LARGA = 22;
export const LARGURA_BARRA_ESTREITA = 13;
export const VAO_ENTRE_BARRAS = 2;
export const RAIO_DA_PONTA = 4;
export const OPACIDADE_ESMAECIDA = 0.3;
export const OPACIDADE_EM_ANDAMENTO = 0.35;

/** Até 6 grupos a barra é larga (22 px); com mais de 6 ela estreita (13 px). */
export function larguraDaBarra(grupos: number): number {
  return grupos > 6 ? LARGURA_BARRA_ESTREITA : LARGURA_BARRA_LARGA;
}

/**
 * Raio só na ponta da barra. `horizontal` é a barra em pé (o `layout` do recharts: categorias no
 * eixo X), com a ponta em cima; `vertical` é a deitada, com a ponta à direita.
 */
export function raioDaPonta(
  layout: "vertical" | "horizontal",
): [number, number, number, number] {
  const r = RAIO_DA_PONTA;
  return layout === "horizontal" ? [r, r, 0, 0] : [0, r, r, 0];
}

/** Sem foco, tudo inteiro; com foco, só o grupo focado fica inteiro. Foco 0 é foco. */
export function opacidadeDoGrupo(indice: number, foco: number | null): number {
  return foco === null || foco === indice ? 1 : OPACIDADE_ESMAECIDA;
}

/**
 * Numa pilha, só o segmento mais alto leva a ponta arredondada. Devolve a última chave (na ordem
 * de empilhamento, de baixo para cima) com valor POSITIVO nesta linha — zero, nulo e ausente não
 * têm barra, e arredondar a ponta de um segmento invisível deixaria a pilha reta. Sem nenhum
 * valor positivo, não há topo.
 */
export function chaveDoTopoDaPilha<K extends string>(
  linha: Readonly<Partial<Record<K, number | null | undefined>>>,
  chaves: readonly K[],
): K | null {
  for (let i = chaves.length - 1; i >= 0; i--) {
    const v = linha[chaves[i]];
    if (typeof v === "number" && v > 0) return chaves[i];
  }
  return null;
}

/**
 * Vão entre fatias da rosca, em graus: o arco de `vaoPx` no raio médio da fatia
 * (`vaoPx / (2π·raio) · 360`). Com uma fatia (ou nenhuma) não há vizinha, então não há vão.
 */
export function anguloDoVao(fatias: number, raioMedio: number, vaoPx = 2.5): number {
  if (fatias <= 1) return 0;
  return (vaoPx / (2 * Math.PI * raioMedio)) * 360;
}

/** Mira vertical das linhas: fina, em token de texto. */
export const MIRA_DA_LINHA = { stroke: "var(--muted-foreground)", strokeWidth: 1 } as const;

/** 'yyyy-MM' → rótulo curto pt-BR (ex.: "jun/26"). */
export function monthLabel(mes: string): string {
  const [y, m] = mes.split("-").map(Number);
  const nome = new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(new Date(y, m - 1, 1))
    .replace(".", "");
  return `${nome}/${String(y).slice(2)}`;
}
