/**
 * REDESIGN-06 (T7) — a faixa do Resumo financeiro, por varredura do código-fonte (o projeto não
 * tem teste de componente). O que cai aqui: a faixa ler por outro caminho que não a leitura única,
 * perder o selo "parcial" ou a base escrita, e a constante do indicador pequeno voltar a morar na
 * tela da 04-A.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ler = (caminho: string) =>
  readFileSync(join(__dirname, caminho), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

describe("06 T7 · resumo-financeiro.tsx", () => {
  const codigo = ler("resumo-financeiro.tsx");

  it.each([
    "Minhas entradas",
    "Minhas saídas",
    "Total em cartões",
    "entradasInd",
    "<BotaoDoOlho",
    "Resumo financeiro",
    "base: competência",
  ])("contém %s", (trecho) => {
    expect(codigo).toContain(trecho);
  });

  it.each(["getFinanceCardData", "lerFinanceiro", "lerSaldoAte"])(
    "não lê por outro caminho: %s",
    (trecho) => {
      expect(codigo).not.toContain(trecho);
    },
  );
});

describe("06 T7 · INDICADOR_PEQUENO_NO_CELULAR mora na peça comum", () => {
  it("a tela da 04-A não declara mais a constante", () => {
    const cliente = ler("../../../app/(app)/dashboard/financeiro/financial-dashboard-client.tsx");
    expect(cliente).not.toContain("const INDICADOR_PEQUENO_NO_CELULAR");
  });

  it("a peça comum a exporta", () => {
    const indicador = ler("../../shared/painel/indicador.tsx");
    expect(indicador).toContain("export const INDICADOR_PEQUENO_NO_CELULAR");
  });
});
