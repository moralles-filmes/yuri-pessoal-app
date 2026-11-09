import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { semComentarios } from "@/lib/theme/ler-tokens";
import { linhasDaDica, type EntradaDaDica } from "./linhas-da-dica";

/**
 * 09-E, Task 2 — a dica em vidro, a legenda e o gancho de foco. O projeto não tem teste de
 * componente, então a prova é varredura de FONTE sem comentários (a explicação de uma regra não
 * pode satisfazer nem quebrar a própria varredura) e função pura.
 */

const pasta = join(process.cwd(), "src", "components", "dashboard");
const lerFonte = (nome: string) => semComentarios(readFileSync(join(pasta, nome), "utf8"));
const globals = semComentarios(
  readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8"),
);

const dica = lerFonte("dica-do-grafico.tsx");
const foco = lerFonte("use-foco-do-grafico.ts");

/** O elemento de abertura que carrega `data-slot="chart-tooltip"`, com todos os atributos. */
function raizDaDica(): string {
  const inicio = dica.indexOf('data-slot="chart-tooltip"');
  expect(inicio, "a raiz da dica tem data-slot=chart-tooltip").toBeGreaterThan(-1);
  const abre = dica.lastIndexOf("<div", inicio);
  const fecha = dica.indexOf(">", inicio);
  return dica.slice(abre, fecha + 1);
}

describe("dica em vidro", () => {
  it("a raiz liga data-slot e vidro-sobreposicao no MESMO elemento, sem bg/border/shadow", () => {
    const raiz = raizDaDica();
    expect(raiz).toContain("vidro-sobreposicao");
    const classes = /className="([^"]*)"/.exec(raiz)?.[1] ?? "";
    expect(classes).not.toMatch(/(^|\s)(bg-|border|shadow)/);
    expect(classes).toContain("rounded-[14px]");
  });

  it("devolve null sem linhas", () => {
    expect(dica).toMatch(/linhas\.length\s*===\s*0[\s\S]{0,40}return null/);
  });

  it("o total e o valor em dinheiro passam por ValorComOlho", () => {
    expect(dica).toContain('from "@/components/shared/painel/valor-com-olho"');
    expect(dica).toMatch(/<ValorComOlho\s+texto=\{total\}/);
    expect(dica).toMatch(/dinheiro\s*\?[\s\S]{0,60}<ValorComOlho\s+texto=\{l\.valor\}/);
  });

  it("não usa transição (a dica acompanha o ponteiro)", () => {
    expect(dica).not.toMatch(/transition/);
  });

  it("valor em dinheiro é tabular-nums", () => {
    expect(dica).toContain("tabular-nums");
  });

  it("a legenda escreve o nome em text-muted-foreground, nunca na cor da série", () => {
    const legenda = dica.slice(dica.indexOf("export function LegendaDoGrafico"));
    expect(legenda).toContain("text-muted-foreground");
    expect(legenda).not.toMatch(/style=\{\{[^}]*color:/);
  });

  it("a amostra de cor tem 10 px, raio 3 e aro ring-1 ring-foreground/NN", () => {
    const amostra = dica.slice(
      dica.indexOf("export function AmostraDeCor"),
      dica.indexOf("export function DicaDoGrafico"),
    );
    expect(amostra).toContain("size-2.5");
    expect(amostra).toContain("rounded-[3px]");
    expect(amostra).toMatch(/ring-1 ring-foreground\/\d+/);
  });

  it("a regra de vidro sobre vidro (sem desfoque) alcança a dica", () => {
    const regra = globals.slice(globals.indexOf("body:has("));
    const lista = regra.slice(0, regra.indexOf("{"));
    expect(lista).toContain('[data-slot="chart-tooltip"]');
  });
});

describe("gráfico em dinheiro e o olho", () => {
  it("esconde os valores do eixo com visibility: hidden sob [data-ocultar=\"true\"]", () => {
    expect(globals).toMatch(
      /\[data-ocultar="true"\]\s+\.grafico-dinheiro\s+\.recharts-cartesian-axis-tick-value\s*\{[^}]*visibility:\s*hidden/,
    );
  });
});

describe("use-foco-do-grafico", () => {
  it("registra pointerdown e scroll passivos e remove os dois no cleanup", () => {
    expect(foco).toMatch(/addEventListener\("pointerdown",[^)]*passive:\s*true/);
    expect(foco).toMatch(/addEventListener\("scroll",[^)]*passive:\s*true/);
    expect(foco).toMatch(/removeEventListener\("pointerdown"/);
    expect(foco).toMatch(/removeEventListener\("scroll"/);
  });

  it("pointerdown só apaga a dica quando o alvo está FORA do ref", () => {
    expect(foco).toMatch(/\.contains\(e\.target\)/);
    expect(foco).toMatch(/dentro\s*\?\s*undefined\s*:\s*false/);
  });

  it("foco é null enquanto a dica está apagada (dicaAtiva === false)", () => {
    expect(foco).toMatch(/dicaAtiva\s*===\s*false\s*\?\s*null/);
  });

  it("o observador lê a dica do recharts e só chama aoMudar num efeito", () => {
    expect(foco).toContain("useActiveTooltipDataPoints");
    expect(foco).toMatch(/useEffect\(/);
    expect(foco).toMatch(/dados\.indexOf\(/);
  });
});

describe("linhasDaDica", () => {
  const entrada = (o: Partial<EntradaDaDica>): EntradaDaDica =>
    ({ graphicalItemId: "g", ...o }) as EntradaDaDica;

  it("descarta quem o formatador recusa (null) e mantém zero medido", () => {
    const linhas = linhasDaDica(
      [
        entrada({ dataKey: "a", name: "Entradas", value: 0, color: "var(--chart-1)" }),
        entrada({ dataKey: "b", name: "Saídas", value: 5, color: "var(--chart-2)" }),
        entrada({ dataKey: "c", name: "Sem dado", value: undefined, color: "var(--chart-3)" }),
      ],
      (e) => {
        if (e.value === undefined) return null;
        return { valor: e.value === 0 ? "R$ 0,00" : "R$ 5,00", dinheiro: true };
      },
    );
    expect(linhas.map((l) => l.valor)).toEqual(["R$ 0,00", "R$ 5,00"]);
    expect(linhas[0]).toMatchObject({
      chave: "a",
      nome: "Entradas",
      cor: "var(--chart-1)",
      dinheiro: true,
    });
  });

  it("o nome do formatador vence o da entrada; sem nenhum dos dois, vira texto vazio", () => {
    const [a, b] = linhasDaDica(
      [entrada({ dataKey: "x", name: "Original", color: "c" }), entrada({ dataKey: "y", color: "c" })],
      (e) => (e.dataKey === "x" ? { nome: "Trocado", valor: "1", dinheiro: false } : { valor: "2", dinheiro: false }),
    );
    expect(a.nome).toBe("Trocado");
    expect(b.nome).toBe("");
  });

  it("chave repetida não repete: cai no índice", () => {
    const linhas = linhasDaDica(
      [entrada({ dataKey: "k", color: "c" }), entrada({ dataKey: "k", color: "c" })],
      () => ({ valor: "1", dinheiro: false }),
    );
    expect(new Set(linhas.map((l) => l.chave)).size).toBe(2);
  });
});

describe("nenhum arquivo de gráfico diz 'Sobrou'", () => {
  it("varre os -impl, as fachadas e as peças novas", async () => {
    const { readdirSync } = await import("node:fs");
    const arquivos = readdirSync(pasta).filter(
      (n) => /\.tsx?$/.test(n) && !n.endsWith(".test.ts") && !n.endsWith(".test.tsx"),
    );
    expect(arquivos).toContain("dica-do-grafico.tsx");
    for (const nome of arquivos) {
      expect(lerFonte(nome), nome).not.toContain("Sobrou");
    }
  });
});
