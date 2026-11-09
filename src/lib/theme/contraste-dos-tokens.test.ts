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
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compor, contraste, lerCor } from "./contraste";
import { ALFA_PERIGO } from "./alfas";
import { claro, css, escuro, SRC, semComentarios } from "./ler-tokens";
import { OPACIDADE_ESMAECIDA } from "@/components/dashboard/chart-theme";

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

// Dívida: texto colorido direto sobre a névoa aberta. É uma PROIBIÇÃO de uso direto na névoa,
// não uma lista de usos: login e cadastro saíram dela na 09-C (links e erros foram para dentro
// do cartão de vidro, onde já têm 4,5:1 medido) e `casca-vidro.test.ts` trava a volta. A dona
// dos usos que restarem em páginas é a 09-F. Nenhum texto daqui pode ganhar uso novo direto na névoa.
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

// ---------------------------------------------------------------------------------------------
// 09-B Task 7 · controles desligados (WCAG 1.4.11, 3:1 para componente de interface). O alfa de cada
// aro é LIDO da classe no fonte: subir a classe sobe a prova junto, e baixá-la reprova.
// ---------------------------------------------------------------------------------------------

const MINIMO_COMPONENTE = 3;

const fonteUi = (arquivo: string) =>
  semComentarios(fs.readFileSync(path.join(SRC, "components", "ui", arquivo), "utf8"));

/** Alfa (0–1) da classe `<prefixo>/NN` no fonte; falha se a classe não existir. */
function alfaDaClasse(codigo: string, prefixo: string): number {
  const inicio = codigo.indexOf(`${prefixo}/`);
  if (inicio < 0) throw new Error(`classe ${prefixo}/NN não encontrada`);
  const digitos = /^[0-9]+/.exec(codigo.slice(inicio + prefixo.length + 1))?.[0];
  if (!digitos) throw new Error(`classe ${prefixo}/ sem alfa numérico`);
  return Number(digitos) / 100;
}

function comAlfa(cor: string, alfa: number): string {
  const { rgb } = lerCor(cor);
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alfa})`;
}

describe("09-B T7 · controles desligados >= 3:1", () => {
  const alfaCaixa = alfaDaClasse(fonteUi("checkbox.tsx"), "border-foreground");
  const alfaAroTrilho = alfaDaClasse(fonteUi("switch.tsx"), "data-[state=unchecked]:ring-foreground");
  const trechoBotao = fonteUi("switch.tsx").slice(fonteUi("switch.tsx").indexOf("<SwitchPrimitive.Thumb"));
  const alfaAroBotao = alfaDaClasse(trechoBotao, "data-[state=unchecked]:ring-foreground");
  const alfaPreenchimento = 0.16; // spec: foreground a 16% no trilho desligado

  for (const [nomeTema, tema] of TEMAS) {
    it(`${nomeTema}: borda da caixa, aro do trilho e aro do botão`, () => {
      const foreground = valor(tema, "foreground");
      const cartao = compor(valor(tema, "glass"), valor(tema, "fog-base"));
      const ladrilho = compor(valor(tema, "tile"), cartao);
      const trilho = compor(comAlfa(foreground, alfaPreenchimento), cartao);

      const bordaCaixa = compor(comAlfa(foreground, alfaCaixa), ladrilho);
      const aroTrilho = compor(comAlfa(foreground, alfaAroTrilho), trilho);
      const aroBotao = compor(comAlfa(foreground, alfaAroBotao), trilho);

      const medidas: Array<[string, number]> = [
        ["borda da caixa × cartão", contraste(bordaCaixa, cartao)],
        ["borda da caixa × ladrilho", contraste(bordaCaixa, ladrilho)],
        ["aro do trilho × cartão", contraste(aroTrilho, cartao)],
        ["aro do botão × trilho desligado", contraste(aroBotao, trilho)],
      ];
      for (const [rotulo, razao] of medidas) {
        const r = (Math.round(razao * 100) / 100).toFixed(2).replace(".", ",");
        expect(
          razao,
          `${nomeTema} · ${rotulo}: ${r}:1 < 3:1 — suba só o alfa daquele aro`,
        ).toBeGreaterThanOrEqual(MINIMO_COMPONENTE);
      }
    });
  }
});

describe("09-B · borda de campo >= 3:1", () => {
  for (const arquivo of ["input.tsx", "textarea.tsx", "select.tsx"]) {
    it(arquivo + " usa o token da borda de campo", () => {
      expect(fonteUi(arquivo)).toContain("border-(--field-border)");
    });
  }

  for (const [nomeTema, tema] of TEMAS) {
    it(nomeTema + ": borda × cartão, diálogo e ladrilho", () => {
      const base = valor(tema, "fog-base");
      for (const [nome, vidro] of [["cartão", "glass"], ["diálogo", "glass-strong"]] as const) {
        const superficie = compor(valor(tema, vidro), base);
        const ladrilho = compor(valor(tema, "tile"), superficie);
        const borda = compor(valor(tema, "field-border"), ladrilho);
        expect(contraste(borda, superficie), nome + " × borda").toBeGreaterThanOrEqual(MINIMO_COMPONENTE);
        expect(contraste(borda, ladrilho), nome + " × ladrilho").toBeGreaterThanOrEqual(MINIMO_COMPONENTE);
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// 09-C · a casca do app em vidro: item ativo do menu, busca do cabeçalho e gaveta.
// ---------------------------------------------------------------------------------------------

/** As quatro composições de `glass-strong` (gaveta e menu): sobre a base e sobre cada mancha. */
function fortes(tema: Tema): Array<[string, string]> {
  const base = valor(tema, "fog-base");
  const forte = valor(tema, "glass-strong");
  const lista: Array<[string, string]> = [["glass-strong sobre a base", compor(forte, base)]];
  for (const k of [1, 2, 3]) {
    const nevoa = compor(valor(tema, `fog-${k}`), base);
    lista.push([`glass-strong sobre fog-${k}`, compor(forte, nevoa)]);
  }
  return lista;
}

describe("09-C · casca", () => {
  for (const [nomeTema, tema] of TEMAS) {
    describe(nomeTema, () => {
      const vidros = superficies(tema);
      const gaveta = fortes(tema);
      const todas = [...vidros, ...gaveta];

      const exigirMinimo = (rotulo: string, razao: number, minimo: number) => {
        const r = (Math.round(razao * 100) / 100).toFixed(2).replace(".", ",");
        const m = String(minimo).replace(".", ",");
        expect(razao, `${nomeTema} · ${rotulo}: ${r}:1 < ${m}:1`).toBeGreaterThanOrEqual(minimo);
      };

      it("a varredura leu o token do item ativo e as oito superfícies (anti-tautologia)", () => {
        expect(tema.has("nav-ativo-ink"), "--nav-ativo-ink").toBe(true);
        expect(tema.has("field-border"), "--field-border").toBe(true);
        expect(vidros).toHaveLength(4);
        expect(gaveta).toHaveLength(4);
        expect(css).toContain("--color-nav-ativo-ink: var(--nav-ativo-ink)");
      });

      it("item ativo (e aro do modo recolhido): nav-ativo-ink sobre pill-strong >= 4,5:1", () => {
        for (const [rotulo, s] of todas) {
          const fundo = compor(valor(tema, "pill-strong"), s);
          exigirMinimo(
            `nav-ativo-ink sobre pill-strong em ${rotulo}`,
            contraste(valor(tema, "nav-ativo-ink"), fundo),
            MINIMO,
          );
        }
      });

      it("botão do assistente: ícone nav-ativo-ink direto sobre o vidro >= 3:1", () => {
        for (const [rotulo, fundo] of vidros) {
          exigirMinimo(
            `nav-ativo-ink sobre ${rotulo}`,
            contraste(valor(tema, "nav-ativo-ink"), fundo),
            MINIMO_COMPONENTE,
          );
        }
      });

      it("busca: muted-foreground sobre o ladrilho >= 4,5:1 e borda do campo >= 3:1", () => {
        for (const [rotulo, s] of todas) {
          const fundo = compor(valor(tema, "tile"), s);
          exigirMinimo(
            `muted-foreground sobre tile em ${rotulo}`,
            contraste(valor(tema, "muted-foreground"), fundo),
            MINIMO,
          );
          const borda = compor(valor(tema, "field-border"), fundo);
          exigirMinimo(`field-border sobre tile em ${rotulo}`, contraste(borda, fundo), MINIMO_COMPONENTE);
        }
      });

      it("busca em hover: a borda vira foreground a 60% (o fundo não muda) e segue >= 3:1", () => {
        const [r, g, b] = lerCor(valor(tema, "foreground")).rgb;
        const borda60 = `rgba(${r}, ${g}, ${b}, 0.6)`;
        for (const [rotulo, s] of todas) {
          const fundo = compor(valor(tema, "tile"), s);
          exigirMinimo(
            `borda de hover sobre tile em ${rotulo}`,
            contraste(compor(borda60, fundo), fundo),
            MINIMO_COMPONENTE,
          );
        }
      });

      it("login: ícone dos destaques (foreground) sobre o ladrilho direto na névoa >= 4,5:1", () => {
        for (const [rotulo, fundo] of aberturas(tema)) {
          const ladrilho = compor(valor(tema, "tile"), fundo);
          exigirMinimo(
            `foreground sobre tile em ${rotulo}`,
            contraste(valor(tema, "foreground"), ladrilho),
            MINIMO,
          );
        }
      });

      it("login: aviso do modo prévia (muted-foreground sobre primary/5 no cartão) >= 4,5:1", () => {
        const [r, g, b] = lerCor(valor(tema, "primary")).rgb;
        const tinta = `rgba(${r}, ${g}, ${b}, 0.05)`;
        for (const [rotulo, s] of vidros) {
          const fundo = compor(tinta, s);
          exigirMinimo(
            `muted-foreground sobre primary/5 em ${rotulo}`,
            contraste(valor(tema, "muted-foreground"), fundo),
            MINIMO,
          );
        }
      });

      it("gaveta: foreground e muted-foreground sobre glass-strong >= 4,5:1", () => {
        for (const [rotulo, fundo] of gaveta) {
          for (const texto of ["foreground", "muted-foreground"]) {
            exigirMinimo(
              `${texto} sobre ${rotulo}`,
              contraste(valor(tema, texto), fundo),
              MINIMO,
            );
          }
        }
      });
    });
  }
});

// ---------------------------------------------------------------------------------------------
// 09-D · ícone do indicador sobre o quadrado tingido (token a 10% sobre a superfície de vidro).
// ---------------------------------------------------------------------------------------------

/** `oklch(L C H)` -> `#rrggbb` (sRGB, com recorte de gamut). Só para o `--success`, declarado em oklch. */
function oklchParaHex(css: string): string {
  const m = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)$/i.exec(css.trim());
  if (!m) return css;
  const [L, C, H] = [Number(m[1]), Number(m[2]), (Number(m[3]) * Math.PI) / 180];
  const a = C * Math.cos(H);
  const b = C * Math.sin(H);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mm = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * mm + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * mm - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * mm + 1.707614701 * s,
  ];
  const hex = linear
    .map((c) => {
      const v = Math.min(1, Math.max(0, c));
      const g = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(g * 255).toString(16).padStart(2, "0");
    })
    .join("");
  return `#${hex}`;
}

describe("09-D · ícone sobre fundo tingido", () => {
  const ALFA_TINGIMENTO = 0.1;
  // [cor do ícone, token que tinge o quadrado]
  const PARES: Array<[string, string]> = [
    ["primary", "primary"],
    ["success-ink", "success"],
    ["destructive", "destructive"],
    ["chart-7", "chart-7"],
  ];

  for (const [nomeTema, tema] of TEMAS) {
    it(`${nomeTema}: os quatro tokens existem (anti-tautologia)`, () => {
      for (const nome of ["primary", "success", "success-ink", "destructive", "chart-7"]) {
        expect(tema.has(nome), `--${nome}`).toBe(true);
      }
      expect(superficies(tema)).toHaveLength(4);
    });

    it(`${nomeTema}: ícone sobre o tingimento a 10% >= 3:1 nas quatro superfícies`, () => {
      for (const [rotulo, superficie] of superficies(tema)) {
        for (const [icone, tinta] of PARES) {
          const fundo = compor(comAlfa(oklchParaHex(valor(tema, tinta)), ALFA_TINGIMENTO), superficie);
          const razao = contraste(oklchParaHex(valor(tema, icone)), fundo);
          const r = (Math.round(razao * 100) / 100).toFixed(2).replace(".", ",");
          expect(
            razao,
            `${nomeTema} · ${icone} sobre ${tinta}/10 em ${rotulo}: ${r}:1 < 3:1 — baixe o alfa do tingimento`,
          ).toBeGreaterThanOrEqual(MINIMO_COMPONENTE);
        }
      }
    });
  }
});

// ---------------------------------------------------------------------------------------------
// 09-E · dica em vidro, legenda, amostra de cor e esmaecimento dos gráficos. O alfa do aro da
// amostra é LIDO da classe no fonte (subir a classe sobe a prova junto, baixá-la reprova).
// ---------------------------------------------------------------------------------------------

describe("09-E · dica e legenda dos gráficos", () => {
  const fonteDica = semComentarios(
    fs.readFileSync(path.join(SRC, "components", "dashboard", "dica-do-grafico.tsx"), "utf8"),
  );
  const trechoAmostra = fonteDica.slice(
    fonteDica.indexOf("export function AmostraDeCor"),
    fonteDica.indexOf("export function DicaDoGrafico"),
  );
  const alfaDoAro = alfaDaClasse(trechoAmostra, "ring-foreground");

  /** Sobre o que a dica pode cair: vidro, as quatro composições fortes e dois extremos de página. */
  function fundosDaDica(tema: Tema): Array<[string, string]> {
    const sobre: Array<[string, string]> = [
      ...superficies(tema),
      ["#000000", "#000000"],
      ["#ffffff", "#ffffff"],
    ];
    const lista = sobre.map(([r, s]): [string, string] => [
      `glass-strong sobre ${r}`,
      compor(valor(tema, "glass-strong"), s),
    ]);
    return [...lista, ...fortes(tema)];
  }

  /** Sobre o que as barras e o contorno do mês em andamento são desenhados. */
  function fundosDoGrafico(tema: Tema): Array<[string, string]> {
    return [
      ...superficies(tema),
      ["#000000", "#000000"],
      ["#ffffff", "#ffffff"],
    ];
  }

  const razaoTexto = (r: number) => (Math.round(r * 100) / 100).toFixed(2).replace(".", ",");

  for (const [nomeTema, tema] of TEMAS) {
    describe(nomeTema, () => {
      const exigirMinimo = (rotulo: string, razao: number, minimo: number) => {
        expect(
          razao,
          `${nomeTema} · ${rotulo}: ${razaoTexto(razao)}:1 < ${String(minimo).replace(".", ",")}:1 — baixe o alfa antes de escurecer o texto`,
        ).toBeGreaterThanOrEqual(minimo);
      };

      it("anti-tautologia: oito composições de glass-strong + os dois extremos", () => {
        expect(fundosDaDica(tema)).toHaveLength(10);
        expect(alfaDoAro).toBeGreaterThan(0);
        expect(alfaDoAro).toBeLessThan(1);
      });

      it("foreground e muted-foreground sobre glass-strong >= 4,5:1", () => {
        for (const [rotulo, fundo] of fundosDaDica(tema)) {
          for (const texto of ["foreground", "muted-foreground"]) {
            exigirMinimo(`${texto} sobre ${rotulo}`, contraste(valor(tema, texto), fundo), MINIMO);
          }
        }
      });

      it("aro da amostra de cor (alfa lido da classe) >= 3:1 sobre glass-strong composto", () => {
        for (const [rotulo, fundo] of fundosDaDica(tema)) {
          const aro = compor(comAlfa(valor(tema, "foreground"), alfaDoAro), fundo);
          exigirMinimo(
            `aro foreground/${Math.round(alfaDoAro * 100)} sobre ${rotulo}`,
            contraste(aro, fundo),
            MINIMO_COMPONENTE,
          );
        }
      });

      it("contorno do mês em andamento (chart-1 e muted-foreground) >= 3:1 nas quatro superfícies", () => {
        const fundos = superficies(tema);
        expect(fundos).toHaveLength(4);
        for (const [rotulo, fundo] of fundos) {
          for (const token of ["chart-1", "muted-foreground"]) {
            exigirMinimo(
              `contorno ${token} sobre ${rotulo}`,
              contraste(oklchParaHex(valor(tema, token)), fundo),
              MINIMO_COMPONENTE,
            );
          }
        }
      });

      it("laudo do esmaecimento: 30% é REFORÇO de foco, não carrega o significado (sem exigir 3:1)", () => {
        // Decisão do dono (09-E): o grupo fora de foco fica a 30% e o laudo é gravado, não exigido.
        // O que o teste prova é o que sustenta a decisão: o foco continua sendo dito por outro
        // meio (a dica abre com o nome e o valor do grupo) e o esmaecido é, de fato, mais fraco
        // que o inteiro em todas as séries e fundos — uma série que ficasse MAIS contrastada
        // esmaecida seria um defeito de cálculo, não de desenho.
        expect(OPACIDADE_ESMAECIDA).toBe(0.3);
        const series = [1, 2, 3, 4, 5, 6, 7, 8].map((k) => `chart-${k}`).concat("muted-foreground");
        const laudo: string[] = [];
        for (const [rotulo, fundo] of fundosDoGrafico(tema)) {
          for (const token of series) {
            const cor = oklchParaHex(valor(tema, token));
            const inteira = contraste(cor, fundo);
            const esmaecida = contraste(compor(comAlfa(cor, OPACIDADE_ESMAECIDA), fundo), fundo);
            expect(Number.isFinite(esmaecida), `${token} sobre ${rotulo}`).toBe(true);
            expect(
              esmaecida,
              `${nomeTema} · ${token} esmaecida (${razaoTexto(esmaecida)}:1) deveria ser mais fraca que inteira (${razaoTexto(inteira)}:1) sobre ${rotulo}`,
            ).toBeLessThan(inteira);
            laudo.push(`${token}@${rotulo}=${razaoTexto(esmaecida)}`);
          }
        }
        expect(laudo).toHaveLength(series.length * fundosDoGrafico(tema).length);
      });
    });
  }
});

// ---------------------------------------------------------------------------------------------
// 09-E T7 · anel de progresso: o traço de progresso (`--primary`) sobre o trilho (`--track`)
// composto sobre cada superfície é componente de interface, >= 3:1 (WCAG 1.4.11).
// ---------------------------------------------------------------------------------------------

describe("09-E T7 · anel de progresso >= 3:1", () => {
  for (const [nomeTema, tema] of TEMAS) {
    it(`${nomeTema}: primary sobre track composto nas quatro superfícies`, () => {
      const fundos = superficies(tema);
      expect(fundos).toHaveLength(4);
      for (const [rotulo, superficie] of fundos) {
        const trilho = compor(valor(tema, "track"), superficie);
        const razao = contraste(oklchParaHex(valor(tema, "primary")), trilho);
        expect(
          razao,
          `${nomeTema} · primary sobre track em ${rotulo}: ${razaoTextoDoAnel(razao)}:1 < 3:1`,
        ).toBeGreaterThanOrEqual(MINIMO_COMPONENTE);
      }
    });
  }
});

function razaoTextoDoAnel(r: number): string {
  return (Math.round(r * 100) / 100).toFixed(2).replace(".", ",");
}

// ---------------------------------------------------------------------------------------------
// 09-F T2 · círculo de concluir: a borda do círculo vazio é componente de interface (>= 3:1) e o
// visto sobre o preenchimento é ícone (>= 4,5:1). O alfa vem do próprio componente.
// ---------------------------------------------------------------------------------------------

describe("09-F T2 · círculo de concluir", () => {
  const fonteCirculo = semComentarios(
    fs.readFileSync(path.join(SRC, "components", "shared", "circulo-de-concluir.tsx"), "utf8"),
  );
  const alfaBorda = alfaDaClasse(fonteCirculo, "border-foreground");

  for (const [nomeTema, tema] of TEMAS) {
    it(`${nomeTema}: borda do círculo vazio sobre cartão e ladrilho >= 3:1`, () => {
      const cartao = compor(valor(tema, "glass"), valor(tema, "fog-base"));
      const ladrilho = compor(valor(tema, "tile"), cartao);
      for (const [rotulo, superficie] of [["cartão", cartao], ["ladrilho", ladrilho]] as const) {
        const borda = compor(comAlfa(valor(tema, "foreground"), alfaBorda), superficie);
        const razao = contraste(borda, superficie);
        expect(
          razao,
          `${nomeTema} · foreground/${Math.round(alfaBorda * 100)} sobre ${rotulo}: ${razaoTextoDoAnel(razao)}:1 < 3:1 — suba só o alfa da borda`,
        ).toBeGreaterThanOrEqual(MINIMO_COMPONENTE);
      }
    });

    it(`${nomeTema}: visto (primary-fill-foreground) sobre primary-fill >= 4,5:1`, () => {
      const razao = contraste(valor(tema, "primary-fill-foreground"), valor(tema, "primary-fill"));
      expect(
        razao,
        `${nomeTema} · visto sobre o preenchimento: ${razaoTextoDoAnel(razao)}:1 < 4,5:1`,
      ).toBeGreaterThanOrEqual(MINIMO);
    });
  }
});
