/**
 * REDESIGN-05-C · T2 — o contrato da tela de Próximos meses, por varredura de fonte.
 *
 * O projeto não tem teste de componente (invariante 25): o que a tela promete é provado lendo o
 * código-fonte, SEM comentários (a explicação da regra cita os nomes que a regra proíbe).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fonteSemComentarios(relativo: string): string {
  const bruto = readFileSync(join(process.cwd(), relativo), "utf8");
  return bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

const PAGINA = "src/app/(app)/cartoes/proximos-meses/page.tsx";
const COMPONENTE = "src/components/cartoes/proximos-meses.tsx";

describe("05-C T2 · a página de Próximos meses", () => {
  const pagina = fonteSemComentarios(PAGINA);

  it("leu o arquivo (não afirma sobre string vazia)", () => {
    expect(pagina.length).toBeGreaterThan(500);
  });

  it("monta a grade pela função pura e normaliza o horizonte por ela", () => {
    expect(pagina).toContain("montarProximosMeses(");
    expect(pagina).toContain("horizonteDeMeses(");
  });

  it("lê o cookie do olho e envolve a tela nele", () => {
    expect(pagina).toContain("COOKIE_DO_OLHO");
    expect(pagina).toContain("valoresOcultos(");
    expect(pagina).toContain("<OlhoDosValores");
  });

  it("o título e a descrição nunca contam faturas", () => {
    expect(pagina).not.toContain("6 faturas");
    expect(fonteSemComentarios(COMPONENTE)).not.toContain("6 faturas");
  });

  it("não escreve nada: nenhum onClick e nenhuma action", () => {
    expect(pagina).not.toContain("onClick");
    expect(pagina).not.toContain("@/lib/actions");
  });
});

describe("05-C T2 · a grade", () => {
  const tela = fonteSemComentarios(COMPONENTE);

  it("leu o arquivo (não afirma sobre string vazia)", () => {
    expect(tela.length).toBeGreaterThan(1000);
  });

  it("o selo sai de rotuloDoEstado; a tela não decide estado nem soma", () => {
    expect(tela).toContain("rotuloDoEstado");
    expect(tela).not.toContain("statusEfetivo");
    expect(tela).not.toContain("resolverFatura");
    expect(tela).not.toContain("faturasPorMes");
  });

  it("escreve as frases da cópia aprovada", () => {
    for (const frase of [
      "sem lançamentos conhecidos",
      "fechou sem lançamentos",
      "— não projeta",
      "Total conhecido",
      "parcial: ",
      "nada a pagar",
    ]) {
      expect(tela, frase).toContain(frase);
    }
  });

  it("a prevista e o mês sem fatura nunca viram R$ 0,00", () => {
    // O único "R$ 0,00" do arquivo é o texto da legenda que o NEGA.
    expect(tela.match(/R\$ 0,00/g)?.length ?? 0).toBeLessThanOrEqual(2);
    expect(tela).not.toContain("moeda(0)");
  });

  it("só célula com fatura é link; 'fechou sem lançamentos' e 'não projeta' não", () => {
    const nao = tela.indexOf('celula.tipo === "nao-projeta"');
    const fechou = tela.indexOf('celula.tipo === "fechou-sem-lancamentos"');
    const prevista = tela.indexOf('celula.tipo === "prevista"', fechou);
    expect(nao).toBeGreaterThan(-1);
    expect(fechou).toBeGreaterThan(nao);
    expect(prevista).toBeGreaterThan(fechou);
    // Do ramo "não projeta" até o ramo da prevista não aparece nenhum <Link>.
    expect(tela.slice(nao, prevista)).not.toContain("<Link");
    // E o ramo da prevista, sim, navega.
    expect(tela.slice(prevista, prevista + 400)).toContain("<Link");
  });

  it("não escreve nada: nenhum onClick e nenhuma action", () => {
    expect(tela).not.toContain("onClick");
    expect(tela).not.toContain("@/lib/actions");
  });

  it("os valores passam pelo olho (CSS), e a tabela rola dentro do card", () => {
    expect(tela).toContain("group-data-[ocultar=true]/olho:hidden");
    expect(tela).toContain("R$ ••••");
    expect(tela).toContain("overflow-x-auto");
  });

  it("a inicial do mês é maiúscula em JS, nunca por CSS", () => {
    expect(tela).not.toContain("capitalize");
  });
});
