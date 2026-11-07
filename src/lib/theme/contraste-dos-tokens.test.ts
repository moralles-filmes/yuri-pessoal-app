/**
 * REDESIGN-09-A — o contraste MEDIDO dos tokens de vidro e de névoa.
 *
 * O vidro é translúcido: o que o texto "vê" por baixo muda com a névoa. Por isso a superfície
 * de cada medição é composta (`compor`) sobre a névoa e sobre a base, nas quatro situações que
 * existem na tela: vidro puro (`glass-solid`) e vidro sobre cada uma das três manchas.
 *
 * Se um par falhar, a regra é BAIXAR O ALFA DA NÉVOA primeiro — nunca escurecer o texto — e
 * anotar o novo valor na tabela do plano (Task 2).
 */
import { describe, expect, it } from "vitest";
import { compor, contraste } from "./contraste";
import { claro, escuro } from "./ler-tokens";

const MINIMO = 4.5;

type Tema = ReadonlyMap<string, string>;

/** Resolve `var(--x)` dentro do mesmo tema (encadeamento com limite). */
function valor(tema: Tema, nome: string): string {
  let v = tema.get(nome);
  for (let i = 0; i < 5 && v !== undefined; i += 1) {
    const alvo = v.match(/^var\(--([a-z0-9-]+)\)$/)?.[1];
    if (!alvo) return v;
    v = tema.get(alvo);
  }
  if (v === undefined) throw new Error(`token --${nome} não resolve no tema`);
  return v;
}

function superficies(tema: Tema): Array<[string, string]> {
  const base = valor(tema, "fog-base");
  const vidro = valor(tema, "glass");
  const lista: Array<[string, string]> = [["glass-solid", valor(tema, "glass-solid")]];
  for (const k of [1, 2, 3]) {
    const nevoa = compor(valor(tema, `fog-${k}`), base);
    lista.push([`vidro sobre fog-${k}`, compor(vidro, nevoa)]);
  }
  return lista;
}

function aberturas(tema: Tema): Array<[string, string]> {
  const base = valor(tema, "fog-base");
  const lista: Array<[string, string]> = [["fog-base", base]];
  for (const k of [1, 2, 3]) {
    lista.push([`fog-${k} sobre a base`, compor(valor(tema, `fog-${k}`), base)]);
  }
  return lista;
}

const TEMAS: Array<[string, Tema]> = [
  ["claro", claro],
  ["escuro", escuro],
];

const TEXTOS_SOBRE_VIDRO = [
  "foreground", "muted-foreground", "primary", "destructive",
  "success-ink", "warning-ink", "info-ink",
];
const TEXTOS_SOBRE_NEVOA = ["foreground", "muted-on-fog"];

function exigir(tema: string, texto: string, sobre: string, razao: number) {
  const arredondada = (Math.round(razao * 100) / 100).toFixed(2).replace(".", ",");
  expect(
    razao,
    `${tema} · ${texto} sobre ${sobre}: ${arredondada}:1 < 4,5:1 — baixe o alfa da névoa antes de escurecer o texto`,
  ).toBeGreaterThanOrEqual(MINIMO);
}

describe("09-A · contraste dos tokens de vidro", () => {
  it("a varredura leu os dois temas (anti-tautologia)", () => {
    for (const [, tema] of TEMAS) {
      expect(tema.has("glass")).toBe(true);
      expect(tema.has("fog-base")).toBe(true);
      expect(superficies(tema)).toHaveLength(4);
      expect(aberturas(tema)).toHaveLength(4);
    }
  });

  for (const [nomeTema, tema] of TEMAS) {
    describe(nomeTema, () => {
      it("texto sobre vidro >= 4,5:1 em todas as superfícies", () => {
        for (const [rotulo, fundo] of superficies(tema)) {
          for (const texto of TEXTOS_SOBRE_VIDRO) {
            exigir(nomeTema, texto, rotulo, contraste(valor(tema, texto), fundo));
          }
        }
      });

      it("texto sobre a névoa (abertura) >= 4,5:1", () => {
        for (const [rotulo, fundo] of aberturas(tema)) {
          for (const texto of TEXTOS_SOBRE_NEVOA) {
            exigir(nomeTema, texto, rotulo, contraste(valor(tema, texto), fundo));
          }
        }
      });

      it("preenchimentos: texto sobre primary-fill, primary e accent >= 4,5:1", () => {
        const pares: Array<[string, string]> = [
          ["primary-fill-foreground", "primary-fill"],
          ["primary-foreground", "primary"],
          ["accent-foreground", "accent"],
        ];
        for (const [texto, fundo] of pares) {
          exigir(nomeTema, texto, fundo, contraste(valor(tema, texto), valor(tema, fundo)));
        }
      });

      it("coerência: o vidro sobre a base é a superfície sólida", () => {
        expect(compor(valor(tema, "glass"), valor(tema, "fog-base"))).toBe(
          valor(tema, "glass-solid").toLowerCase(),
        );
      });
    });
  }
});
