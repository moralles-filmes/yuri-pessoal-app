/**
 * REDESIGN-03-G (L4, K1.3, D-G17) — os dois cards financeiros capturam ErroDeLeitura NO
 * SERVIDOR, por varredura do código-fonte (o projeto não tem teste de componente — invariante 25).
 *
 * O que cai aqui (Z4): o card deixar de capturar, capturar qualquer exceção, montar JSX dentro
 * do `try`, ou mostrar um número (zero) no lugar do aviso.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ler = (arquivo: string) =>
  readFileSync(join(__dirname, arquivo), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe.each([
  ["finance-card.tsx", "getFinanceCardData"],
  ["invoices-card.tsx", "getInvoicesCardData"],
])("03-G L4 · %s", (arquivo, leitura) => {
  const codigo = ler(arquivo);
  const tryBloco = codigo.match(/try \{([\s\S]*?)\} catch \(e\) \{([\s\S]*?)\}/);

  it("a leitura está dentro de um try, e o try não monta JSX", () => {
    expect(tryBloco, "sem try/catch").not.toBeNull();
    expect(tryBloco![1]).toContain(`await ${leitura}(`);
    expect(tryBloco![1]).not.toContain("<");
  });

  it("o catch só aceita ErroDeLeitura e relança o resto", () => {
    expect(tryBloco![2]).toMatch(/if \(!ehErroDeLeitura\(e\)\) throw e;/);
    expect(tryBloco![2]).toContain("registrarFalhaDeLeitura(e)");
  });

  it("na falha, mostra o CardSemLeitura com o rótulo da leitura — nenhum número", () => {
    const ramo = codigo.match(/if \(falha[^)]*\) \{([\s\S]*?)\}/);
    expect(ramo, "sem ramo de falha").not.toBeNull();
    expect(ramo![1]).toContain("<CardSemLeitura oQue={falha?.oQue");
    expect(ramo![1]).not.toMatch(/formatCurrency|\b0\b/);
  });
});

describe("03-G L4 · CardSemLeitura", () => {
  const codigo = readFileSync(join(__dirname, "../../shared/card-sem-leitura.tsx"), "utf8");
  it("diz qual leitura falhou e por que o card fica sem valores", () => {
    expect(codigo).toContain("Não foi possível ler {oQue}. O card fica sem valores para não mostrar um número errado.");
    expect(codigo).toContain("Tentar de novo");
    expect(codigo).not.toContain('"use client"');
  });
});
