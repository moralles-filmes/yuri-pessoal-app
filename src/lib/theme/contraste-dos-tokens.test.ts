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
import { compor, contraste, lerCor } from "./contraste";
import { ALFA_PERIGO } from "./alfas";
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
const TEXTOS_DIRETOS_NA_NEVOA = [
  "muted-on-fog", "foreground", "primary", "destructive",
  "success-ink", "warning-ink", "info-ink",
];

// Dívida: texto colorido direto sobre a névoa aberta. Dona: 09-C (login/cadastro põem o
// formulário sobre vidro). Nenhum texto daqui pode ganhar uso novo direto na névoa.
const DIVIDA_NA_NEVOA = new Set<string>([
  "claro:destructive:fog-1", "claro:destructive:fog-2", "claro:destructive:fog-3",
  "claro:info-ink:fog-1", "claro:info-ink:fog-2", "claro:info-ink:fog-3",
  "claro:primary:fog-1", "claro:primary:fog-2", "claro:primary:fog-3",
  "claro:warning-ink:fog-1", "claro:warning-ink:fog-2", "claro:warning-ink:fog-3",
  "escuro:destructive:fog-1", "escuro:destructive:fog-2", "escuro:destructive:fog-3",
]);

/** Mensagem da 09-B: as superfícies das primitivas (ladrilho, pílula, trilho, perigo, sobreposição). */
function exigirPrimitiva(
  tema: string,
  texto: string,
  material: string,
  superficie: string,
  razao: number,
) {
  const arredondada = (Math.round(razao * 100) / 100).toFixed(2).replace(".", ",");
  expect(
    razao,
    `${tema} · ${texto} sobre ${material} em ${superficie}: ${arredondada}:1 < 4,5:1 — baixe o alfa do tingimento ou da névoa antes de escurecer o texto`,
  ).toBeGreaterThanOrEqual(MINIMO);
}

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

  it("texto direto sobre a névoa aberta: só a dívida declarada reprova (< 4,5:1)", () => {
    const reprovados = new Set<string>();
    for (const [nomeTema, tema] of TEMAS) {
      const base = valor(tema, "fog-base");
      for (const k of [1, 2, 3]) {
        const fundo = compor(valor(tema, `fog-${k}`), base);
        for (const texto of TEXTOS_DIRETOS_NA_NEVOA) {
          if (contraste(valor(tema, texto), fundo) < MINIMO) {
            reprovados.add(`${nomeTema}:${texto}:fog-${k}`);
          }
        }
      }
    }
    expect([...reprovados].sort()).toEqual([...DIVIDA_NA_NEVOA].sort());
    for (const item of reprovados) {
      expect(item).not.toMatch(/:(?:muted-on-fog|foreground):/);
    }
  });
});

describe("09-B · contraste das superfícies das primitivas", () => {
  for (const [nomeTema, tema] of TEMAS) {
    const vidros = superficies(tema);

    describe(nomeTema, () => {
      it("a varredura leu as superfícies de vidro e os tokens das primitivas (anti-tautologia)", () => {
        expect(vidros).toHaveLength(4);
        for (const token of ["tile", "pill", "pill-strong", "track", "glass-strong", "destructive"]) {
          expect(tema.has(token), `--${token}`).toBe(true);
        }
      });

      it("ladrilho: foreground e muted-foreground >= 4,5:1", () => {
        for (const [rotulo, vidro] of vidros) {
          const fundo = compor(valor(tema, "tile"), vidro);
          for (const texto of ["foreground", "muted-foreground"]) {
            exigirPrimitiva(nomeTema, texto, "ladrilho", rotulo, contraste(valor(tema, texto), fundo));
          }
        }
      });

      it("pílula e pílula forte: foreground >= 4,5:1", () => {
        for (const [rotulo, vidro] of vidros) {
          for (const material of ["pill", "pill-strong"]) {
            const fundo = compor(valor(tema, material), vidro);
            exigirPrimitiva(
              nomeTema, "foreground", material, rotulo,
              contraste(valor(tema, "foreground"), fundo),
            );
          }
        }
      });

      it("trilho do seletor: aba inativa (muted-foreground) e ativa (foreground na pílula forte)", () => {
        for (const [rotulo, vidro] of vidros) {
          const trilho = compor(valor(tema, "track"), vidro);
          exigirPrimitiva(
            nomeTema, "muted-foreground", "track (aba inativa)", rotulo,
            contraste(valor(tema, "muted-foreground"), trilho),
          );
          const aba = compor(valor(tema, "pill-strong"), trilho);
          exigirPrimitiva(
            nomeTema, "foreground", "pill-strong sobre track (aba ativa)", rotulo,
            contraste(valor(tema, "foreground"), aba),
          );
        }
      });

      it("perigo tingido (botão destructive, 3%): destructive >= 4,5:1", () => {
        const { rgb } = lerCor(valor(tema, "destructive"));
        const tinta = `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${ALFA_PERIGO})`;
        for (const [rotulo, vidro] of vidros) {
          const fundo = compor(tinta, vidro);
          exigirPrimitiva(
            nomeTema, "destructive", "destructive/3", rotulo,
            contraste(valor(tema, "destructive"), fundo),
          );
        }
      });

      it("sobreposição (glass-strong): texto >= 4,5:1 sobre vidro, #000000 e #ffffff", () => {
        const sobre: Array<[string, string]> = [
          ...vidros,
          ["#000000", "#000000"],
          ["#ffffff", "#ffffff"],
        ];
        for (const [rotulo, s] of sobre) {
          const fundo = compor(valor(tema, "glass-strong"), s);
          for (const texto of ["foreground", "muted-foreground", "primary", "destructive"]) {
            exigirPrimitiva(
              nomeTema, texto, "glass-strong", rotulo, contraste(valor(tema, texto), fundo),
            );
          }
        }
        // Item ativo de menu/seletor: accent-foreground sobre accent (opaco, independe do fundo).
        exigirPrimitiva(
          nomeTema, "accent-foreground", "accent", "item ativo",
          contraste(valor(tema, "accent-foreground"), valor(tema, "accent")),
        );
      });

      it("sólidos das primitivas: tile-solid e popover-solid sustentam o texto", () => {
        for (const material of ["tile-solid", "popover-solid"]) {
          const fundo = valor(tema, material);
          expect(fundo, `--${material}`).toMatch(/^#[0-9a-f]{6}$/);
          for (const texto of ["foreground", "muted-foreground", "primary", "destructive"]) {
            exigirPrimitiva(
              nomeTema, texto, material, "transparência reduzida",
              contraste(valor(tema, texto), fundo),
            );
          }
        }
      });
    });
  }
});
