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

const SRC = path.resolve(__dirname, "..", "..");

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const css = semComentarios(
  fs.readFileSync(path.join(SRC, "app", "globals.css"), "utf8"),
);

/** Recorta o corpo `{ … }` de um bloco CSS pelo seu seletor, contando profundidade. */
function bloco(seletor: string): string {
  const inicio = css.indexOf(seletor);
  if (inicio < 0) return "";
  const abre = css.indexOf("{", inicio);
  if (abre < 0) return "";
  let profundidade = 0;
  for (let i = abre; i < css.length; i += 1) {
    if (css[i] === "{") profundidade += 1;
    else if (css[i] === "}") {
      profundidade -= 1;
      if (profundidade === 0) return css.slice(abre + 1, i);
    }
  }
  return "";
}

/** Nome → valor das custom properties declaradas num corpo de bloco. */
function tokens(corpo: string): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const m of corpo.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    mapa.set(m[1], m[2].trim());
  }
  return mapa;
}

const tema = tokens(bloco("@theme inline"));
const claro = tokens(bloco(":root"));
const escuro = tokens(bloco(".dark {"));

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
    // O dourado vivia em hue 83 (claro) e 84 (escuro), croma ~0,12. O azul está em 254–256.
    const hue = (v: string) => Number(v.match(/oklch\([\d.]+\s+[\d.]+\s+([\d.]+)\)/)?.[1]);
    expect(hue(claro.get("primary")!)).toBeGreaterThan(200);
    expect(hue(escuro.get("primary")!)).toBeGreaterThan(200);
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

  it("`--card` continua sendo a superfície em que a paleta foi validada", () => {
    // O laudo da §7 é sobre ESTAS duas superfícies. Trocar o card sem revalidar transforma
    // "todas passam" numa afirmação sobre um fundo que não existe mais.
    expect(claro.get("card"), REVALIDAR).toBe("oklch(1 0 0)");
    expect(escuro.get("card"), REVALIDAR).toBe("oklch(0.217 0.013 264)");
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
