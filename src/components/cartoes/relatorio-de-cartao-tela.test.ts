/**
 * REDESIGN-05-C · T5 — o contrato da tela de Relatórios de cartão, por varredura de fonte.
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

const PAGINA = "src/app/(app)/cartoes/relatorios/page.tsx";
const COMPONENTE = "src/components/cartoes/relatorio-de-cartao.tsx";
const EXPORTAR = "src/components/cartoes/exportar-relatorio-de-cartao.tsx";

describe("05-C T5 · a página de Relatórios de cartão", () => {
  const pagina = fonteSemComentarios(PAGINA);

  it("leu o arquivo (não afirma sobre string vazia)", () => {
    expect(pagina.length).toBeGreaterThan(1000);
  });

  it("normaliza os parâmetros e monta o relatório pela função pura", () => {
    expect(pagina).toContain("baseDoRelatorio(");
    expect(pagina).toContain("periodoDoRelatorio(");
    expect(pagina).toContain("montarRelatorioDeCartao(");
  });

  it("lê as três leituras e só os recebíveis das faturas do período", () => {
    expect(pagina).toContain("getCreditCards()");
    expect(pagina).toContain("getStatements()");
    expect(pagina).toContain("getReceivablesByStatements(doPeriodo.map");
  });

  it("escreve as duas bases e o filtro de cartão como formulário GET, sem campo de texto", () => {
    expect(pagina).toContain("Por competência");
    expect(pagina).toContain("Por vencimento");
    expect(pagina).toContain('method="get"');
    expect(pagina).toContain('name="cartao"');
    expect(pagina).not.toContain('type="text"');
    expect(pagina).not.toContain("<input type=\"search\"");
  });

  it("lê o cookie do olho e envolve a tela nele", () => {
    expect(pagina).toContain("COOKIE_DO_OLHO");
    expect(pagina).toContain("valoresOcultos(");
    expect(pagina).toContain("<OlhoDosValores");
  });

  it("tem o título da aba", () => {
    expect(pagina).toContain('title: "Relatórios de cartão"');
  });

  it("não escreve nada: nenhum onClick e nenhuma action", () => {
    expect(pagina).not.toContain("onClick");
    expect(pagina).not.toContain("@/lib/actions");
    expect(pagina).not.toContain('"use client"');
  });
});

describe("05-C T5 · o relatório", () => {
  const tela = fonteSemComentarios(COMPONENTE);

  it("leu o arquivo (não afirma sobre string vazia)", () => {
    expect(tela.length).toBeGreaterThan(1500);
  });

  it("o gráfico entra pela FACHADA, nunca pelo -impl", () => {
    expect(tela).toContain('@/components/dashboard/faturas-chart"');
    expect(tela).not.toContain("faturas-chart-impl");
  });

  it("usa as peças comuns do painel", () => {
    expect(tela).toContain("Indicador");
    expect(tela).toContain("Bloco");
    expect(tela).toContain("BotaoDoOlho");
  });

  it("escreve a cópia aprovada", () => {
    for (const frase of [
      "Total das faturas",
      "Minha parte",
      "Parte dos terceiros",
      "o valor combinado, não o que já voltou",
      "sem faturas neste período",
      "Sem faturas neste período",
      "As faturas aparecem aqui pela base escolhida.",
      "sem fatura neste mês",
      "Por cartão",
      "Mês a mês",
      "desativado",
      "o mês atual ainda pode crescer",
    ]) {
      expect(tela, frase).toContain(frase);
    }
  });

  it("o mês sem fatura nunca vira R$ 0,00 nem barra de zero", () => {
    expect(tela).not.toMatch(/R\$ 0,00/);
    expect(tela).not.toContain("moeda(0)");
    // No gráfico, o mês nulo vai com `null` em todos os valores.
    expect(tela).toContain("total: null, meu: null, terceiros: null");
  });

  it("não recalcula: nenhuma soma de fatura aqui", () => {
    expect(tela).not.toContain("faturasPorMes");
    expect(tela).not.toContain("resolverFatura");
    expect(tela).not.toContain("statusEfetivo");
  });

  it("os valores passam pelo olho (CSS), e as tabelas rolam dentro do card", () => {
    expect(tela).toContain("group-data-[ocultar=true]/olho:hidden");
    expect(tela).toContain("R$ ••••");
    expect(tela.match(/overflow-x-auto/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("não escreve nada: nenhum onClick e nenhuma action, e nenhum JS de cliente", () => {
    expect(tela).not.toContain("onClick");
    expect(tela).not.toContain("@/lib/actions");
    expect(tela).not.toContain('"use client"');
  });
});

describe("05-C T5 · o botão do CSV", () => {
  const botao = fonteSemComentarios(EXPORTAR);

  it("leu o arquivo (não afirma sobre string vazia)", () => {
    expect(botao.length).toBeGreaterThan(300);
  });

  it("é o único arquivo de cliente da tela", () => {
    expect(botao.trimStart().startsWith('"use client"')).toBe(true);
    expect(fonteSemComentarios(COMPONENTE)).not.toContain("use client");
    expect(fonteSemComentarios(PAGINA)).not.toContain("use client");
  });

  it("exporta exatamente as cinco colunas", () => {
    expect(botao).toContain('["mes", "faturas", "total", "meu", "terceiros"]');
    expect(botao).toContain("toCsv(");
    expect(botao).toContain("downloadCsv(");
  });

  it("não escreve no banco", () => {
    expect(botao).not.toContain("@/lib/actions");
    expect(botao).not.toContain("supabase");
  });
});
