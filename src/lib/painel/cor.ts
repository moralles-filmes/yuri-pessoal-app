/**
 * REDESIGN-04-A — que cor de texto fica legível sobre uma cor de fundo. PURO e genérico: serve ao
 * painel financeiro, à 04-A2 e à 06, então não importa nada de `@/lib/finance`.
 */

/** O quase-preto do tema escuro, o mesmo que o texto usa sobre fundo claro. */
const ESCURO = "#111827";
const BRANCO = "#FFFFFF";

function canais(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const t = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [
    Number.parseInt(t.slice(0, 2), 16),
    Number.parseInt(t.slice(2, 4), 16),
    Number.parseInt(t.slice(4, 6), 16),
  ];
}

/** Luminância relativa, WCAG 2.1 (sRGB → linear). */
function luminancia([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function razao(l1: number, l2: number): number {
  const [claro, escuro] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * `"branco"` ou `"escuro"` — o que tiver MAIOR razão de contraste WCAG 2.1 contra a cor de fundo,
 * comparando `#FFFFFF` com `#111827`. Cor inválida (ou ausente) devolve `null`: quem chama decide o
 * padrão, em vez de este módulo chutar.
 */
export function textoSobreACor(cor: string | null): "branco" | "escuro" | null {
  if (!cor) return null;
  const rgb = canais(cor);
  if (!rgb) return null;
  const l = luminancia(rgb);
  const contraBranco = razao(l, luminancia(canais(BRANCO) as [number, number, number]));
  const contraEscuro = razao(l, luminancia(canais(ESCURO) as [number, number, number]));
  return contraBranco >= contraEscuro ? "branco" : "escuro";
}
