import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { css } from "@/lib/theme/ler-tokens";
import {
  LARGURA_BARRA_ESTREITA,
  LARGURA_BARRA_LARGA,
  MIRA_DA_LINHA,
  OPACIDADE_EM_ANDAMENTO,
  OPACIDADE_ESMAECIDA,
  RAIO_DA_PONTA,
  VAO_ENTRE_BARRAS,
  anguloDoVao,
  brlCompact,
  larguraDaBarra,
  opacidadeDoGrupo,
  raioDaPonta,
} from "./chart-theme";

describe("brlCompact — rótulo curto de eixo", () => {
  it("milhar inteiro sai sem casa decimal (cabe numa linha)", () => {
    expect(brlCompact(10000)).toBe("R$ 10 mil");
    expect(brlCompact(2000)).toBe("R$ 2 mil");
  });

  it("milhar fracionado mantém uma casa", () => {
    expect(brlCompact(2500)).toBe("R$ 2,5 mil");
    expect(brlCompact(7500)).toBe("R$ 7,5 mil");
  });

  it("abaixo de mil, inteiro; milhão vira 'mi'", () => {
    expect(brlCompact(600)).toBe("R$ 600");
    expect(brlCompact(1_200_000)).toBe("R$ 1,2 mi");
    expect(brlCompact(3_000_000)).toBe("R$ 3 mi");
  });

  it("negativo e inválido", () => {
    expect(brlCompact(-1500)).toBe("-R$ 1,5 mil");
    expect(brlCompact("x")).toBe("R$ 0");
  });
});

describe("barras em vidro — regras puras (09-E)", () => {
  it("constantes do desenho", () => {
    expect(LARGURA_BARRA_LARGA).toBe(22);
    expect(LARGURA_BARRA_ESTREITA).toBe(13);
    expect(VAO_ENTRE_BARRAS).toBe(2);
    expect(RAIO_DA_PONTA).toBe(4);
    expect(OPACIDADE_ESMAECIDA).toBe(0.3);
    expect(OPACIDADE_EM_ANDAMENTO).toBe(0.35);
  });

  it("larguraDaBarra: 22 px até 6 grupos, 13 px com mais de 6", () => {
    expect(larguraDaBarra(1)).toBe(22);
    expect(larguraDaBarra(6)).toBe(22);
    expect(larguraDaBarra(7)).toBe(13);
    expect(larguraDaBarra(12)).toBe(13);
  });

  it("raioDaPonta: raio só na ponta, conforme o sentido da barra", () => {
    expect(raioDaPonta("horizontal")).toEqual([4, 4, 0, 0]);
    expect(raioDaPonta("vertical")).toEqual([0, 4, 4, 0]);
  });

  it("opacidadeDoGrupo: sem foco tudo inteiro; com foco só o focado", () => {
    expect(opacidadeDoGrupo(2, null)).toBe(1);
    expect(opacidadeDoGrupo(2, 2)).toBe(1);
    expect(opacidadeDoGrupo(1, 2)).toBe(0.3);
    // foco no grupo 0 não pode ser confundido com "sem foco"
    expect(opacidadeDoGrupo(1, 0)).toBe(0.3);
    expect(opacidadeDoGrupo(0, 0)).toBe(1);
  });

  it("anguloDoVao: 0 com uma fatia ou menos; ~2 graus no raio da rosca com 5 fatias", () => {
    expect(anguloDoVao(1, 79)).toBe(0);
    expect(anguloDoVao(0, 79)).toBe(0);
    const graus = anguloDoVao(5, 79);
    expect(graus).toBeGreaterThan(1.4);
    expect(graus).toBeLessThan(2.2);
    // o vão em pixels é o parâmetro: 2,5 px por padrão, e o ângulo cai com o raio
    expect(anguloDoVao(5, 79, 5)).toBeCloseTo(graus * 2, 10);
    expect(anguloDoVao(5, 158)).toBeCloseTo(graus / 2, 10);
  });

  it("MIRA_DA_LINHA: linha fina em token de texto", () => {
    expect(MIRA_DA_LINHA).toEqual({ stroke: "var(--muted-foreground)", strokeWidth: 1 });
  });
});

describe("barras em vidro — crescimento em CSS (09-E)", () => {
  const regra = (seletor: string): string => {
    const i = css.indexOf(seletor);
    if (i < 0) return "";
    const abre = css.indexOf("{", i);
    return css.slice(abre + 1, css.indexOf("}", abre));
  };

  it(".grafico-barras cresce de baixo, no path da barra", () => {
    const r = regra(".grafico-barras .recharts-bar-rectangle path");
    expect(r).toMatch(/transform-origin:\s*bottom/);
    expect(r).toMatch(/transform-box:\s*fill-box/);
    expect(r).toMatch(/animation:\s*crescer-y\b/);
    expect(r).toMatch(/transition:\s*opacity/);
  });

  it(".grafico-barras-deitadas cresce da esquerda, no path da barra", () => {
    const r = regra(".grafico-barras-deitadas .recharts-bar-rectangle path");
    expect(r).toMatch(/transform-origin:\s*left/);
    expect(r).toMatch(/transform-box:\s*fill-box/);
    expect(r).toMatch(/animation:\s*crescer-x\b/);
    expect(r).toMatch(/transition:\s*opacity/);
  });

  it("os dois keyframes existem", () => {
    expect(css).toMatch(/@keyframes crescer-y\s*\{[^}]*scaleY\(0\)/);
    expect(css).toMatch(/@keyframes crescer-x\s*\{[^}]*scaleX\(0\)/);
  });

  it("prefers-reduced-motion desliga animação e transição dos dois seletores", () => {
    const i = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(i).toBeGreaterThan(-1);
    const abre = css.indexOf("{", i);
    let prof = 0;
    let fim = abre;
    for (; fim < css.length; fim += 1) {
      if (css[fim] === "{") prof += 1;
      else if (css[fim] === "}" && --prof === 0) break;
    }
    const corpo = css.slice(abre + 1, fim);
    expect(corpo).toContain(".grafico-barras .recharts-bar-rectangle path");
    expect(corpo).toContain(".grafico-barras-deitadas .recharts-bar-rectangle path");
    expect(corpo).toMatch(/animation:\s*none/);
    expect(corpo).toMatch(/transition:\s*none/);
  });
});

/**
 * Desenho 2026-10-18, §6: o rótulo do eixo cortava ("R$ 10,0 / mil" quebrando em duas linhas)
 * porque o eixo tinha largura FIXA. Todo eixo Y de gráfico do sistema mede o próprio conteúdo
 * (`width="auto"`) — número mágico por gráfico quebra no celular ou no próximo rótulo maior.
 */
describe("eixos Y sem largura fixa", () => {
  const raiz = join(process.cwd(), "src", "components");
  const arquivos = readdirSync(raiz, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith("-impl.tsx"))
    .map((f) => join(raiz, f));

  it("encontra os gráficos", () => {
    expect(arquivos.length).toBeGreaterThan(5);
  });

  it.each(arquivos)("%s: todo <YAxis usa width=\"auto\"", (arquivo) => {
    const fonte = readFileSync(arquivo, "utf8");
    const eixos = fonte.match(/<YAxis[\s\S]*?\/>/g) ?? [];
    for (const eixo of eixos) expect(eixo).toMatch(/width="auto"/);
  });
});
