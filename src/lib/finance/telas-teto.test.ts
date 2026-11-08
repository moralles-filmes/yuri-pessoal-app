/**
 * REDESIGN-03-G (L2, K2) — o teto de cada tela: aviso onde a lista só lista, erro onde ela soma.
 *
 * O texto do aviso é puro (`aviso-de-teto.ts`); a decisão de cada página é conferida por
 * varredura do código-fonte (o projeto não tem teste de componente — invariante 25). Uma página
 * que volte a ler `.linhas` sem decidir o teto derruba este arquivo.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { avisoDeTeto, textoDoAvisoDeTeto } from "@/lib/finance/aviso-de-teto";
import { leituraComTeto } from "@/lib/supabase/leitura";

const RAIZ = join(__dirname, "..", "..", "..");
const pagina = (rota: string) =>
  readFileSync(join(RAIZ, "src/app/(app)", rota, "page.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

describe("03-G L2 · o texto do aviso (§5.3)", () => {
  it("com o total, diz N de M e manda usar os filtros", () => {
    expect(textoDoAvisoDeTeto(500, 1234, "lançamentos")).toBe(
      "Mostrando os 500 mais recentes de 1.234 lançamentos. Use os filtros para ver os demais.",
    );
  });

  it("sem contagem, não inventa o M", () => {
    expect(textoDoAvisoDeTeto(1500, null, "lançamentos")).toBe(
      "Mostrando os 1.500 mais recentes; pode haver mais.",
    );
  });

  it("lista completa não tem aviso; saturada e sem contagem têm", () => {
    expect(avisoDeTeto(leituraComTeto([1, 2], 2), "x")).toBeNull();
    expect(avisoDeTeto(leituraComTeto([1, 2], 9), "itens")).toBe(
      "Mostrando os 2 mais recentes de 9 itens. Use os filtros para ver os demais.",
    );
    expect(avisoDeTeto(leituraComTeto([1, 2], null), "itens")).toBe(
      "Mostrando os 2 mais recentes; pode haver mais.",
    );
  });
});

describe("03-G L2 · a regra de cada tela (§5.3, D-G5)", () => {
  it.each([
    ["financeiro/lancamentos", "lançamentos"],
    ["faturas", "lançamentos deste cartão"],
    ["importar", "importações"],
  ])("%s só lista: mostra o AvisoDeTeto (Z6)", (rota, oQue) => {
    expect(pagina(rota)).toContain(`<AvisoDeTeto leitura={`);
    expect(pagina(rota)).toContain(`oQue="${oQue}"`);
  });

  it.each([
    ["financeiro", "ROTULOS_DE_LEITURA.lancamentos"],
    ["parcelamentos", "ROTULOS_DE_LEITURA.comprasParceladas"],
    ["terceiros", "ROTULOS_DE_LEITURA.recebiveis"],
  ])("%s soma: exige a lista completa", (rota, rotulo) => {
    expect(pagina(rota)).toMatch(new RegExp(`exigirCompleta\\(l, ${rotulo.replace(".", "\\.")}\\)`));
  });

  it("terceiros também recusa recebimentos cortados (D-G29)", () => {
    expect(pagina("terceiros")).toMatch(/situacaoDosRecebimentos !== "completa"[\s\S]*throw new LeituraIncompleta/);
  });

  it("nenhuma das seis lê só `.linhas` de getTransactions/getInstallmentPurchases/getImportBatches/lerRecebiveis", () => {
    for (const rota of ["financeiro", "financeiro/lancamentos", "faturas", "parcelamentos", "terceiros", "importar"]) {
      expect(pagina(rota), rota).not.toMatch(/\.then\(\(l\) => l\.linhas\)/);
    }
  });
});
