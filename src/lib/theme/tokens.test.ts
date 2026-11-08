/**
 * REDESIGN-02-B — o contrato dos tokens de tema.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ TOKEN REGISTRADO SEM VALOR É UMA CLASSE QUE NÃO FAZ NADA, EM SILÊNCIO.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * O `@theme inline` do Tailwind v4 só DECLARA a utilitária: `--color-chart-8` gera
 * `bg-chart-8` mesmo que `--chart-8` não exista em lugar nenhum. A classe compila, o lint
 * passa, o `tsc` passa — e o elemento é pintado com um valor vazio. O mesmo vale para um
 * token que exista no claro e falte no escuro: ali o valor do claro simplesmente vaza para o
 * tema escuro, e ninguém vê até abrir a tela.
 *
 * Nada disso é alcançável por tipo. O `globals.css` é CSS, não TypeScript, e o projeto já usa
 * varredura de fonte para os contratos nessa situação (`chat-events.test.ts`,
 * `painel-persistencia.test.ts`, `boundaries.test.ts`). Este arquivo faz o mesmo.
 *
 * ⚠️ E ele guarda o LAUDO da paleta: os oito hexes e as duas superfícies (`--card`) são
 * exatamente os que passaram pelo validador. Mexer em qualquer um deles sem revalidar deixa
 * a `docs/redesign/TOKENS.md` §7 afirmando um resultado que não foi medido — então mexer
 * deixa este teste vermelho, com o comando no lugar do erro.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CHART_COLORS } from "@/components/dashboard/chart-theme";
import { PAYMENT_METHOD_LABELS } from "@/lib/finance/constants";
import { claro, css, escuro, SRC, semComentarios, tema } from "./ler-tokens";
import { compor, lerCor } from "./contraste";

/**
 * Tokens que existem SÓ no claro de propósito: não são cor, não mudam com o tema.
 * Um token de cor nesta lista é um bug esperando a próxima tela escura.
 */
const SO_NO_CLARO = new Set(["font-sans", "font-mono", "radius"]);

/** Os oito hexes que passaram pelo validador. Ver `docs/redesign/TOKENS.md` §7. */
const PALETA_CLARA = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#4a3aa7", "#e34948",
];
const PALETA_ESCURA = [
  "#3987e5", "#d95926", "#199e70", "#c98500",
  "#d55181", "#008300", "#9085e9", "#e66767",
];

/** Os 21 tokens que a 09-A acrescenta, todos obrigatórios nos dois temas. */
const TOKENS_DE_VIDRO = [
  "fog-base", "fog-1", "fog-2", "fog-3",
  "glass", "glass-solid", "glass-strong", "glass-border", "glass-hi", "glass-lo",
  "glass-sheen", "glass-shadow",
  "tile", "tile-border", "pill", "pill-strong", "track", "grid",
  "primary-fill", "primary-fill-foreground", "muted-on-fog",
];

const REVALIDAR =
  "Mexeu na paleta ou na superfície? Rode o validador de novo e atualize o laudo em " +
  "docs/redesign/TOKENS.md §7 — o comando está lá. Um laudo que não corresponde ao CSS é " +
  "pior que nenhum laudo.";

describe("REDESIGN-02-B · contrato dos tokens de tema", () => {
  it("a varredura leu mesmo o globals.css (anti-tautologia)", () => {
    // Sem isto, uma regex quebrada deixaria TODO o resto deste arquivo afirmando
    // coisas verdadeiras sobre listas vazias.
    expect(css.length).toBeGreaterThan(2000);
    expect(tema.size).toBeGreaterThan(30);
    expect(claro.size).toBeGreaterThan(30);
    expect(escuro.size).toBeGreaterThan(20);
    expect(tema.has("color-primary")).toBe(true);
    expect(claro.has("primary")).toBe(true);
    expect(escuro.has("primary")).toBe(true);
  });

  it("todo `--color-*` do @theme inline aponta para um token que EXISTE", () => {
    const orfaos: string[] = [];
    for (const [nome, valor] of tema) {
      const alvo = valor.match(/^var\(--([a-z0-9-]+)\)$/)?.[1];
      if (!alvo) continue; // `--radius-*` usa calc(); `--font-heading` é alias direto.
      if (!claro.has(alvo)) orfaos.push(`--${nome} → --${alvo}`);
    }
    expect(orfaos, `Utilitária registrada sem valor no :root — a classe existe e não pinta nada: ${orfaos.join(", ")}`).toEqual([]);
  });

  it("todo token de COR do claro é redefinido no escuro", () => {
    const faltando = [...claro.keys()].filter(
      (nome) => !SO_NO_CLARO.has(nome) && !escuro.has(nome),
    );
    expect(faltando, `Sem redefinição no .dark, o valor do tema CLARO vaza para o escuro: ${faltando.join(", ")}`).toEqual([]);
  });

  it("o escuro não inventa token que o claro não tem", () => {
    const sobrando = [...escuro.keys()].filter((nome) => !claro.has(nome));
    expect(sobrando, `Token só no escuro fica indefinido no claro: ${sobrando.join(", ")}`).toEqual([]);
  });

  it("`--primary` deixou de ser dourado nos dois temas", () => {
    // O dourado vivia em hue 83 (claro) e 84 (escuro) em oklch. O azul medido em hex tem
    // matiz HSL ~212; o dourado, em HSL, fica em ~40-50 e nunca chega a 200.
    const matiz = (v: string) => {
      const [r, g, b] = lerCor(v).rgb.map((c) => c / 255);
      const max = Math.max(r, g, b);
      const d = max - Math.min(r, g, b);
      if (d === 0) return 0;
      if (max === r) return (((g - b) / d + 6) % 6) * 60;
      if (max === g) return ((b - r) / d + 2) * 60;
      return ((r - g) / d + 4) * 60;
    };
    for (const tm of [claro, escuro]) {
      const h = matiz(tm.get("primary")!);
      expect(h).toBeGreaterThan(200);
      expect(h).toBeLessThan(260);
    }
  });

  it("`--gold` é apelido de `--primary`, e nos DOIS temas", () => {
    // Declarado num tema só, o dourado do claro vazaria para o escuro caso a classe
    // `.dark` não caísse no mesmo elemento que `:root`.
    expect(claro.get("gold")).toBe("var(--primary)");
    expect(escuro.get("gold")).toBe("var(--primary)");
    expect(claro.get("gold-foreground")).toBe("var(--primary-foreground)");
    expect(escuro.get("gold-foreground")).toBe("var(--primary-foreground)");
  });

  it("nada em src/ ainda pede `text-gradient-gold`", () => {
    // O utilitário foi renomeado. Uma classe Tailwind que não existe mais não quebra o
    // build: ela simplesmente não pinta nada.
    const sobrou: string[] = [];
    const varrer = (dir: string) => {
      for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, item.name);
        if (item.isDirectory()) varrer(p);
        else if (/\.(tsx?|css)$/.test(item.name)) {
          // Este arquivo cita o nome antigo para poder proibi-lo, e o `globals.css` o cita
          // no comentário que explica a renomeação. Comentário não vira classe.
          if (p === __filename) continue;
          if (semComentarios(fs.readFileSync(p, "utf8")).includes("text-gradient-gold")) {
            sobrou.push(path.relative(SRC, p));
          }
        }
      }
    };
    varrer(SRC);
    expect(sobrou, `Renomeado para text-gradient-brand; sobrou em: ${sobrou.join(", ")}`).toEqual([]);
  });

  it("a paleta tem 8 slots no CSS, nos dois temas, e em CHART_COLORS", () => {
    const slots = (m: Map<string, string>) =>
      [...m.keys()].filter((k) => /^chart-\d+$/.test(k)).length;
    expect(slots(claro)).toBe(8);
    expect(slots(escuro)).toBe(8);
    expect(CHART_COLORS.length).toBe(8);
    // E o TS não pode apontar para um slot que o CSS não tem.
    for (const cor of CHART_COLORS) {
      const alvo = cor.match(/^var\(--(chart-\d+)\)$/)?.[1];
      expect(alvo, `CHART_COLORS deve conter só var(--chart-N): ${cor}`).toBeTruthy();
      expect(claro.has(alvo!)).toBe(true);
    }
  });

  it("os oito hexes são exatamente os que passaram pelo validador", () => {
    for (let i = 0; i < 8; i += 1) {
      expect(claro.get(`chart-${i + 1}`), REVALIDAR).toBe(PALETA_CLARA[i]);
      expect(escuro.get(`chart-${i + 1}`), REVALIDAR).toBe(PALETA_ESCURA[i]);
    }
  });

  it("`--glass-solid` é a superfície em que a paleta foi validada", () => {
    // O laudo da §7 é sobre ESTAS duas superfícies. Trocar a superfície sem revalidar
    // transforma "todas passam" numa afirmação sobre um fundo que não existe mais.
    expect(claro.get("glass-solid"), REVALIDAR).toBe("#f5f7fa");
    expect(escuro.get("glass-solid"), REVALIDAR).toBe("#14171e");
  });

  it("a casca aponta para o vidro", () => {
    for (const [nome, tm] of [["claro", claro], ["escuro", escuro]] as const) {
      expect(tm.get("card"), nome).toBe("var(--glass)");
      expect(tm.get("popover"), nome).toBe("var(--glass-strong)");
      expect(tm.get("background"), nome).toBe("var(--fog-base)");
    }
  });

  it("os tokens de vidro existem nos dois temas", () => {
    const faltando: string[] = [];
    for (const [nome, tm] of [["claro", claro], ["escuro", escuro]] as const) {
      for (const token of TOKENS_DE_VIDRO) {
        if (!tm.has(token)) faltando.push(`${nome}: --${token}`);
      }
    }
    expect(faltando, `Token de vidro sem valor: ${faltando.join(", ")}`).toEqual([]);
    expect(TOKENS_DE_VIDRO.length).toBe(21);
  });

  it("as utilitárias de vidro estão registradas no @theme inline", () => {
    const registradas = [
      "glass", "glass-solid", "glass-strong", "glass-border", "tile", "tile-border",
      "pill", "pill-strong", "track", "grid", "primary-fill", "primary-fill-foreground",
      "muted-on-fog",
    ];
    for (const nome of registradas) {
      expect(tema.get(`color-${nome}`), `--color-${nome}`).toBe(`var(--${nome})`);
    }
    expect(tema.get("ease-mola")).toBe("cubic-bezier(.22,1.45,.36,1)");
    expect(tema.get("ease-estalo")).toBe("cubic-bezier(.22,1.6,.36,1)");
  });

  it("09-B: --tile-solid e --popover-solid existem nos dois temas, como sólidos compostos", () => {
    for (const [nome, tm] of [["claro", claro], ["escuro", escuro]] as const) {
      for (const token of ["tile-solid", "popover-solid"]) {
        expect(tm.get(token), `${nome}: --${token}`).toMatch(/^#[0-9a-f]{6}$/);
      }
      const v = (t: string) => tm.get(t) ?? "";
      expect(compor(v("tile"), v("glass-solid")), `${nome}: tile-solid = tile sobre glass-solid`).toBe(
        v("tile-solid"),
      );
      expect(
        compor(v("glass-strong"), v("fog-base")),
        `${nome}: popover-solid = glass-strong sobre fog-base`,
      ).toBe(v("popover-solid"));
    }
  });

  it("09-B: o bloco de transparência reduzida dos tokens redefine --tile, --pill e --popover-solid", () => {
    const m = /@media \(prefers-reduced-transparency: reduce\)\s*\{\s*:root/.exec(css);
    expect(m, "falta o @media de topo que redefine os tokens").not.toBeNull();
    const inicio = css.indexOf("{", m?.index ?? 0);
    let prof = 0;
    let fim = inicio;
    for (; fim < css.length; fim += 1) {
      if (css[fim] === "{") prof += 1;
      else if (css[fim] === "}" && (prof -= 1) === 0) break;
    }
    const corpo = css.slice(inicio, fim);
    expect(corpo).toMatch(/--tile\s*:\s*var\(--tile-solid\)/);
    expect(corpo).toMatch(/--pill\s*:\s*var\(--glass-solid\)/);
    expect(corpo).toMatch(/--popover-solid\s*:\s*var\(--glass-solid\)/);
  });

  it("09-B: as utilitárias dos sólidos e a sombra de vidro estão registradas no @theme inline", () => {
    expect(tema.get("color-tile-solid")).toBe("var(--tile-solid)");
    expect(tema.get("color-popover-solid")).toBe("var(--popover-solid)");
    expect(tema.get("shadow-vidro")).toBe(
      "inset 0 1px 0 var(--glass-hi), inset 0 -1px 0 var(--glass-lo), var(--glass-shadow)",
    );
  });

  it("o raio base é 1rem no claro (09-A)", () => {
    // Raio maior da base de vidro. A escala derivada (`--radius-sm…4xl`, `calc(var(--radius) * k)`)
    // acompanha sozinha; por isso só o valor base é afirmado aqui.
    expect(claro.get("radius"), "raio da 09-A (spec §6.5); a escala derivada acompanha").toBe("1rem");
  });

  it("a pilha de fontes é a do sistema Apple, com Inter de reserva (09-A)", () => {
    const pilha = claro.get("font-sans") ?? "";
    expect(pilha.replace(/\s+/g, " ")).toMatch(
      /^-apple-system, BlinkMacSystemFont, var\(--font-inter\)/,
    );
    expect(pilha).not.toContain("Arial");
  });

  it("fonts.ts é o ÚNICO lugar que chama a Inter por next/font, sem preload", () => {
    // `next/font` exige a chamada literal em módulo; a de reserva (09-A) mora aqui para o
    // layout e o `global-error` compartilharem a MESMA instância e a mesma variável CSS.
    const fonts = semComentarios(fs.readFileSync(path.join(SRC, "app", "fonts.ts"), "utf8"));
    expect(fonts).toMatch(/import\s*\{[^}]*\bInter\b[^}]*\}\s*from\s*"next\/font\/google"/);
    expect(fonts).toMatch(/export\s+const\s+inter\s*=\s*Inter\(/);
    expect(fonts).toContain("preload: false");
    expect(fonts).toContain('variable: "--font-inter"');
    expect(fonts).toContain('subsets: ["latin"]');
    expect(fonts).toContain('display: "swap"');
    for (const arquivo of ["layout.tsx", "global-error.tsx"]) {
      const fonte = semComentarios(fs.readFileSync(path.join(SRC, "app", arquivo), "utf8"));
      expect(fonte, `${arquivo} não chama next/font`).not.toContain("next/font");
      expect(fonte, `${arquivo} não chama Inter()`).not.toMatch(/\bInter\(/);
    }
  });

  it("o layout importa a Inter de ./fonts e a põe na className do <html>", () => {
    const layout = semComentarios(
      fs.readFileSync(path.join(SRC, "app", "layout.tsx"), "utf8"),
    );
    expect(layout).toMatch(/import\s*\{\s*inter\s*\}\s*from\s*"\.\/fonts"/);
    expect(layout).toMatch(/<html\b[^>]*className=\{[^>]*inter\.variable/);
  });

  it("o global-error importa a Inter de ./fonts e a põe na className do <html>", () => {
    // Ele SUBSTITUI o layout raiz quando este cai, então não herda a variável: sem a classe,
    // `--font-inter` fica indefinida e a pilha de fontes cai direto para `Segoe UI`/`system-ui`.
    const erro = semComentarios(
      fs.readFileSync(path.join(SRC, "app", "global-error.tsx"), "utf8"),
    );
    expect(erro).toMatch(/import\s*\{\s*inter\s*\}\s*from\s*"\.\/fonts"/);
    expect(erro).toMatch(/<html\b[^>]*className=\{[^>]*inter\.variable/);
  });

  it("a paleta cobre as formas de pagamento sem repetir cor", () => {
    // Derivado da fonte real, não de um número escrito à mão: `forma-pagamento-chart-impl`
    // indexa com `i % CHART_COLORS.length` sobre as formas + "outro". Com 5 slots, três
    // barras repetiam cor no mesmo gráfico.
    const formas = Object.keys(PAYMENT_METHOD_LABELS).length + 1; // + "outro"
    expect(formas).toBeLessThanOrEqual(CHART_COLORS.length);
  });

  it("a paleta cobre o donut de categorias sem repetir cor", () => {
    const impl = semComentarios(
      fs.readFileSync(
        path.join(SRC, "components", "dashboard", "categoria-chart-impl.tsx"),
        "utf8",
      ),
    );
    const topN = Number(impl.match(/positivos\.slice\(0,\s*(\d+)\)/)?.[1]);
    expect(topN, "não achei o corte do donut em categoria-chart-impl.tsx").toBeGreaterThan(0);
    // As N maiores + a fatia "Outros".
    expect(topN + 1).toBeLessThanOrEqual(CHART_COLORS.length);
  });
});
