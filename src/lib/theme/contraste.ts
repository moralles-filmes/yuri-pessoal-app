/**
 * REDESIGN-09-A T1 — composição e contraste, puros.
 *
 * Mede o que os tokens de superfície e de texto declaram: a razão WCAG 2.x entre duas cores
 * opacas e a cor resultante de um vidro (alfa) sobre uma névoa opaca. Sem imports, sem I/O.
 *
 * Só aceita `#rrggbb` e `rgba(r, g, b, a)`. Qualquer outra forma (oklch, hsl, nomes) é
 * recusada com erro — uma cor que não se sabe medir não entra numa conta de contraste.
 */

/** Canais sRGB 0–255. */
export type Rgb = readonly [number, number, number];

const HEX = /^#([0-9a-f]{6})$/i;
const RGBA =
  /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d*\.?\d+)\s*\)$/i;

function canal(n: number, css: string): number {
  if (!Number.isFinite(n) || n < 0 || n > 255) {
    throw new Error(`canal fora de 0–255 em "${css}"`);
  }
  return n;
}

/** Lê uma cor CSS suportada. Lança com a cor na mensagem se a forma não for conhecida. */
export function lerCor(css: string): { rgb: Rgb; alfa: number } {
  const texto = css.trim();

  const hex = HEX.exec(texto);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return {
      rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255],
      alfa: 1,
    };
  }

  const rgba = RGBA.exec(texto);
  if (rgba) {
    const alfa = Number(rgba[4]);
    if (alfa > 1) throw new Error(`alfa fora de 0–1 em "${css}"`);
    return {
      rgb: [
        canal(Number(rgba[1]), css),
        canal(Number(rgba[2]), css),
        canal(Number(rgba[3]), css),
      ],
      alfa,
    };
  }

  throw new Error(`cor não reconhecida (use #rrggbb ou rgba(r, g, b, a)): "${css}"`);
}

function opaca(css: string): Rgb {
  const { rgb, alfa } = lerCor(css);
  if (alfa < 1) throw new Error(`cor não é opaca (alfa ${alfa}): "${css}"`);
  return rgb;
}

function hex2(n: number): string {
  return Math.round(n).toString(16).padStart(2, "0");
}

/**
 * Mistura `cima` (com alfa) sobre `baixo`. `baixo` precisa ser opaco: compor sobre algo
 * translúcido daria uma cor que não existe na tela. Devolve `#rrggbb` minúsculo.
 */
export function compor(cima: string, baixo: string): string {
  const topo = lerCor(cima);
  const fundo = opaca(baixo);
  const a = topo.alfa;
  const mistura = (i: 0 | 1 | 2) => a * topo.rgb[i] + (1 - a) * fundo[i];
  return `#${hex2(mistura(0))}${hex2(mistura(1))}${hex2(mistura(2))}`;
}

/** Luminância relativa WCAG 2.x (limiar sRGB 0.03928). */
function luminancia(rgb: Rgb): number {
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste WCAG 2.x (1–21) entre duas cores opacas. */
export function contraste(texto: string, fundo: string): number {
  const l1 = luminancia(opaca(texto));
  const l2 = luminancia(opaca(fundo));
  const clara = Math.max(l1, l2);
  const escura = Math.min(l1, l2);
  return (clara + 0.05) / (escura + 0.05);
}
