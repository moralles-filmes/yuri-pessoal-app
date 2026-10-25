import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { brlCompact } from "./chart-theme";

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
