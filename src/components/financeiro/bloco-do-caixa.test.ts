/**
 * REDESIGN-03-E · A4 — o bloco do caixa, renderizado no servidor (`renderToStaticMarkup`).
 *
 * O projeto não tem infraestrutura de teste de componente (`environment: node`); este componente
 * é de apresentação pura (sem estado, sem efeito, sem `"use client"`), então dá para afirmar o
 * HTML que ele produz. É o "teste da tela" da mutação Z5: a contagem de aproximados não pode
 * sumir da tela, e o erro de leitura não pode virar zero. Fixture sintética.
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BlocoDoCaixa } from "@/components/financeiro/bloco-do-caixa";
import type { NumerosDoCaixa } from "@/lib/finance/caixa";
import type { EstadoDoCaixa } from "@/lib/finance/caixa-leitura";

function numeros(sobre: Partial<NumerosDoCaixa> = {}): NumerosDoCaixa {
  return {
    rendaPessoalRecebida: 0,
    reembolsosRecebidos: 0,
    outrasEntradasDeTerceiros: 0,
    saidasDeCaixa: 0,
    pagamentosDeFatura: 0,
    transferenciasSemVinculo: { quantidade: 0, total: 0 },
    transferenciasEntreContas: 0,
    resultadoDeCaixa: 0,
    aproximados: 0,
    semConta: 0,
    avisoDeSobreposicao: false,
    ...sobre,
  };
}

function ok(atual: NumerosDoCaixa, parcial = false): EstadoDoCaixa {
  return {
    estado: "ok",
    atual,
    anterior: numeros(),
    parcial,
    entradasDeCaixa: 0,
    entradasPct: null,
    saidasPct: null,
    corte: {
      ateODia: null,
      entradas: { atual: 0, anterior: 0, pct: null },
      saidas: { atual: 0, anterior: 0, pct: null },
      cartaoFora: false,
    },
    graficos: {
      minha: { entradas: 0, saidas: 0, saidasBrutas: 0, terceirosNasSaidas: 0, resultado: 0, faturasSemTotal: 0 },
      evolucao: [],
      mesAMes: { ateODia: null, dados: { anterior: { entradas: 0, saidas: 0 }, atual: { entradas: 0, saidas: 0 } } },
      categorias: [],
      formas: [],
    },
  };
}

const html = (caixa: EstadoDoCaixa) =>
  renderToStaticMarkup(createElement(BlocoDoCaixa, { mesRotulo: "outubro de 2026", caixa }));

describe("03-E · A4 — BlocoDoCaixa", () => {
  it("declara quantos lançamentos estão na data aproximada (Z5), e só quando há", () => {
    expect(html(ok(numeros({ aproximados: 3 })))).toContain(
      "3 lançamento(s) com data aproximada pela competência",
    );
    expect(html(ok(numeros()))).not.toContain("data aproximada");
  });

  it("declara os sem conta, as transferências sem vínculo e a leitura parcial", () => {
    const h = html(
      ok(numeros({ semConta: 2, transferenciasSemVinculo: { quantidade: 1, total: 50 } }), true),
    );
    expect(h).toContain("2 lançamento(s) sem conta ficaram fora");
    expect(h).toContain("1 transferência(s) sem destino e sem vínculo com");
    expect(h).toContain("Leitura parcial");
  });

  it("as três entradas aparecem em linhas SEPARADAS (K4)", () => {
    const h = html(ok(numeros()));
    for (const rotulo of ["Renda pessoal recebida", "Reembolsos recebidos", "Outras entradas de terceiros"]) {
      expect(h).toContain(rotulo);
    }
  });

  it.each([
    { caso: "só reembolso > 0", reembolsos: 100, outras: 0, aviso: false },
    { caso: "só outras entradas > 0", reembolsos: 0, outras: 100, aviso: false },
    { caso: "os dois > 0", reembolsos: 100, outras: 100, aviso: true },
    { caso: "nenhum dos dois", reembolsos: 0, outras: 0, aviso: false },
  ])("B3 · a nota da sobreposição (K4, Z18): $caso", ({ reembolsos, outras, aviso }) => {
    // O bloco mostra o que `numerosDoCaixa` decidiu; a regra dos quatro casos é testada lá.
    const h = html(
      ok(
        numeros({
          reembolsosRecebidos: reembolsos,
          outrasEntradasDeTerceiros: outras,
          avisoDeSobreposicao: reembolsos > 0 && outras > 0,
        }),
      ),
    );
    const nota = "pode contar duas vezes um reembolso que também foi lançado como receita";
    if (aviso) expect(h).toContain(nota);
    else expect(h).not.toContain(nota);
  });

  it("erro de leitura não vira zero: diz que não leu e não mostra valor nenhum", () => {
    const h = html({ estado: "erro" });
    expect(h).toContain("não puderam ser lidos");
    expect(h).not.toMatch(/R\$/);
  });

  it("não importa nada de runtime do motor nem da leitura (só `import type`)", () => {
    // Comentários fora: o cabeçalho do arquivo CITA "use client" para dizer que não o usa.
    const fonte = fs
      .readFileSync(path.join(process.cwd(), "src/components/financeiro/bloco-do-caixa.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/[^\r\n]*/g, "");
    expect(fonte).not.toMatch(/^import\s+(?!type\b)[^;]*from\s+"@\/lib\/finance\/(caixa|caixa-leitura|dashboard)"/m);
    expect(fonte).not.toMatch(/"use client"/);
  });
});
