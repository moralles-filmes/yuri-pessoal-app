import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CategoriaSlice } from "@/lib/finance/dashboard";
import { CHART_COLORS } from "./chart-theme";
import { corDaFatia } from "./cores-da-rosca";

/**
 * 04-A, Tarefa 5 — os gráficos do painel. Varredura de FONTE (o projeto não tem teste de
 * componente): é o que prova o carregamento sob demanda, que só aparece no tamanho do bundle.
 */

const pasta = join(process.cwd(), "src", "components", "dashboard");
const ler = (nome: string) => readFileSync(join(pasta, nome), "utf8");

/** Tira comentários, para que a explicação de uma regra não satisfaça (nem quebre) a própria varredura. */
const semComentarios = (fonte: string) =>
  fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const FACHADAS = ["barras-entradas-saidas-chart.tsx", "rosca-categorias-chart.tsx"] as const;

describe.each(FACHADAS)("fachada %s", (arquivo) => {
  const fonte = semComentarios(ler(arquivo));

  it("carrega o -impl por next/dynamic, sem SSR, reservando a altura do esqueleto", () => {
    expect(fonte).toContain('from "next/dynamic"');
    expect(fonte).toMatch(/ssr:\s*false/);
    expect(fonte).toContain("chartSkeletonHeightVar(");
    expect(fonte).toContain("ChartSkeleton");
  });

  it("o segundo argumento do dynamic é um OBJETO LITERAL escrito ali mesmo", () => {
    // O compilador lê o argumento estaticamente e recusa constante compartilhada.
    expect(fonte).toMatch(/dynamic\([\s\S]*?\.then\(\(m\) => m\.\w+\),\s*\{/);
  });

  it("NÃO importa recharts (os 109 KB gz ficam só no -impl)", () => {
    expect(fonte).not.toMatch(/from\s+["']recharts["']/);
    expect(fonte).not.toMatch(/import\(\s*["']recharts["']/);
  });
});

describe("alturas reservadas", () => {
  it("barras 280, rosca 260", () => {
    expect(ler("barras-entradas-saidas-chart.tsx")).toContain("chartSkeletonHeightVar(280)");
    expect(ler("rosca-categorias-chart.tsx")).toContain("chartSkeletonHeightVar(260)");
  });
});

describe("recharts só nos -impl", () => {
  it("cores-da-rosca.ts é puro: sem recharts e sem 'use client'", () => {
    const fonte = semComentarios(ler("cores-da-rosca.ts"));
    expect(fonte).not.toMatch(/recharts/);
    expect(fonte).not.toMatch(/["']use client["']/);
  });

  it("os dois -impl novos têm recharts", () => {
    expect(ler("barras-entradas-saidas-chart-impl.tsx")).toMatch(/from\s+["']recharts["']/);
    expect(ler("rosca-categorias-chart-impl.tsx")).toMatch(/from\s+["']recharts["']/);
  });
});

describe("corDaFatia", () => {
  const fatia = (color: string | null): CategoriaSlice => ({
    categoryId: "c",
    name: "Mercado",
    color,
    movimentado: 100,
    meu: 100,
  });

  it("a cor da categoria vence a paleta", () => {
    expect(corDaFatia(fatia("#ff0000"), 3)).toBe("#ff0000");
  });

  it("sem cor, usa o slot do índice", () => {
    expect(corDaFatia(fatia(null), 0)).toBe(CHART_COLORS[0]);
    expect(corDaFatia(fatia(null), 5)).toBe(CHART_COLORS[5]);
  });

  it("sem cor, o índice cicla nos 8 slots", () => {
    expect(CHART_COLORS).toHaveLength(8);
    expect(corDaFatia(fatia(null), 8)).toBe(CHART_COLORS[0]);
    expect(corDaFatia(fatia(null), 11)).toBe(CHART_COLORS[3]);
  });
});

describe("série futura e mês parcial são visualmente distintos do realizado", () => {
  it("projecao-chart-impl.tsx tem hachura, tracejado e legenda '(projetado)'", () => {
    const fonte = ler("projecao-chart-impl.tsx");
    expect(fonte).toContain("<pattern");
    expect(fonte).toContain("strokeDasharray");
    expect(fonte).toContain("(projetado)");
  });

  it("barras: hachura e tracejado no -impl, legenda do mês parcial na fachada (altura exata)", () => {
    const fonte = ler("barras-entradas-saidas-chart-impl.tsx");
    expect(fonte).toContain("<pattern");
    expect(fonte).toContain("strokeDasharray");
    expect(fonte).not.toContain("mês em andamento · parcial");
    expect(ler("barras-entradas-saidas-chart.tsx")).toContain("mês em andamento · parcial");
  });

  it("04-A2: a legenda parcial só aparece com dado (fachada) e as séries/nomes são props do -impl", () => {
    const fachada = semComentarios(ler("barras-entradas-saidas-chart.tsx"));
    expect(fachada).toMatch(/temDadosNasBarras\(props\.dados\)\s*&&/);
    const impl = semComentarios(ler("barras-entradas-saidas-chart-impl.tsx"));
    expect(impl).toContain("temDadosNasBarras");
    // com series === "saidas" a Bar de entradas não é renderizada
    expect(impl).toMatch(/series\s*!==\s*"saidas"[\s\S]{0,40}<Bar[\s\S]{0,40}dataKey="entradas"/);
    expect(impl).toContain("nomes.entradas");
    expect(impl).toContain("nomes.saidas");
    expect(impl).toContain('"Minhas entradas"');
    expect(impl).toContain('"Minhas saídas"');
    expect(impl).not.toContain('name="Minhas');
  });

  it("as barras de entradas e saídas têm eixo Y com largura automática", () => {
    const fonte = ler("barras-entradas-saidas-chart-impl.tsx");
    expect(fonte).toMatch(/<YAxis[\s\S]*?width="auto"[\s\S]*?\/>/);
  });
});
