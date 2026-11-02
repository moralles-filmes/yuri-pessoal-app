/**
 * REDESIGN-05-C · T6 — a aba Cartões de `/relatorios` não diz "6 faturas" (são 6 ciclos por cartão)
 * e linka para o relatório de cartões. Por varredura de fonte, SEM comentários: o projeto não tem
 * teste de componente (invariante 25).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fonteSemComentarios(relativo: string): string {
  const bruto = readFileSync(join(process.cwd(), relativo), "utf8");
  return bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const TELA = "src/app/(app)/relatorios/relatorios-client.tsx";

describe("aba Cartões de /relatorios (05-C T6)", () => {
  const tela = fonteSemComentarios(TELA);

  it("leu o arquivo (não afirma sobre string vazia)", () => {
    expect(tela.length).toBeGreaterThan(1000);
  });

  it("não contém mais o rótulo 'Próximas 6 faturas' nem 'Provisão de 6 ciclos'", () => {
    expect(tela).not.toContain("Próximas 6 faturas");
    expect(tela).not.toContain("Provisão de 6 ciclos");
  });

  it("contém 'Próximos 6 ciclos de cada cartão'", () => {
    expect(tela).toContain("Próximos 6 ciclos de cada cartão");
  });

  it("linka para o relatório de cartões", () => {
    expect(tela).toContain('href="/cartoes/relatorios"');
  });

  it("calcula a contagem de cartões pelos cardId distintos de card.faturas", () => {
    expect(tela.replace(/\s+/g, " ")).toContain(
      "new Set(card.faturas.map((f) => f.cardId)).size",
    );
  });
});

describe("aba Cartões de /relatorios — plural (05-C, revisão)", () => {
  it("um cartão é 'cartão', nunca '1 cartões'", () => {
    const tela = fonteSemComentarios(TELA).replace(/\s+/g, " ");
    expect(tela).toContain('cartoesNaProvisao === 1 ? "cartão" : "cartões"');
    expect(tela).not.toContain("${cartoesNaProvisao} cartões");
  });
});
