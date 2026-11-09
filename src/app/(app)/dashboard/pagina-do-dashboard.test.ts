/**
 * REDESIGN-06 T9 — a página do dashboard geral. O projeto não tem teste de componente, então o
 * contrato é verificado por varredura do código-fonte (sem comentários, para a explicação de uma
 * regra não casar com a própria regra).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DASH_CARD_IDS } from "@/lib/dashboard/cards";
import { DASH_CARD_HREF } from "@/components/dashboard/general/card-meta";
import * as primitives from "@/components/dashboard/general/primitives";

const RAIZ = process.cwd();

function fonte(...partes: string[]): string {
  const bruto = readFileSync(join(RAIZ, ...partes), "utf8");
  return bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const page = fonte("src", "app", "(app)", "dashboard", "page.tsx");
const cliente = fonte("src", "app", "(app)", "dashboard", "general-dashboard-client.tsx");
const barra = fonte("src", "components", "dashboard", "general", "period-toolbar.tsx");

describe("page.tsx do dashboard geral", () => {
  it("cada card entra dentro de um LimiteDoBloco", () => {
    const posicoes = DASH_CARD_IDS.map((id) => ({ id, pos: page.indexOf(`${id}: (`) }));
    for (const { id, pos } of posicoes) {
      expect(pos, `${id}: ( não achado em page.tsx`).toBeGreaterThanOrEqual(0);
    }
    for (const { id, pos } of posicoes) {
      const proximo = posicoes
        .map((p) => p.pos)
        .filter((p) => p > pos)
        .sort((a, b) => a - b)[0];
      const fim = proximo ?? page.indexOf("\n  };", pos);
      const trecho = page.slice(pos, fim);
      expect(trecho, `o card ${id} não está em <LimiteDoBloco`).toContain("<LimiteDoBloco");
    }
  });

  it("a faixa do Resumo financeiro está dentro de um LimiteDoBloco", () => {
    const resumo = page.indexOf("<ResumoFinanceiro");
    expect(resumo).toBeGreaterThanOrEqual(0);
    const abre = page.lastIndexOf("<LimiteDoBloco", resumo);
    expect(abre).toBeGreaterThanOrEqual(0);
    expect(page.slice(abre, resumo)).not.toContain("</LimiteDoBloco>");
  });

  it("tem a abertura, a linha de apoio e o rótulo de hoje", () => {
    expect(page).toContain("Aqui está um resumo da sua vida em um só lugar.");
    expect(page).toContain("<Abertura");
    expect(page).toContain("dataDaAbertura(");
    expect(page).toContain("rotuloDeHoje(");
  });

  it("o título da página é o <h1> da abertura: nenhum PageHeader, nenhuma frase do dia", () => {
    expect(page).not.toContain("<PageHeader");
    expect(page).not.toContain("FRASES_DO_BANNER");
  });
});

describe("general-dashboard-client.tsx", () => {
  it("recebe a abertura por prop e a põe antes da barra de período; não tem <h1>", () => {
    expect(cliente).toContain("{abertura}");
    expect(cliente.indexOf("{abertura}")).toBeLessThan(cliente.indexOf("<PeriodToolbar"));
    expect(cliente).not.toContain("<h1");
    expect(cliente).not.toMatch(/\bbanner\b/);
  });

  it("grava o período PADRÃO (R7), não o da URL", () => {
    expect(cliente).toContain("payloadDoSalvar(");
    expect(cliente).toContain("Período padrão");
    expect(cliente).not.toContain("saveDashboardLayout({ order, hidden, period, view })");
  });
});

describe("period-toolbar.tsx", () => {
  it("o grupo de visão é um grupo com botões de estado (F3)", () => {
    expect(barra).toContain("aria-pressed=");
    expect(barra).toContain('role="group"');
  });
});

describe("meta e primitivas", () => {
  it("o link de Notificações aponta para /notificacoes", () => {
    expect(DASH_CARD_HREF.notificacoes).toBe("/notificacoes");
  });

  it("primitives exporta Quadro", () => {
    expect(typeof primitives.Quadro).toBe("function");
  });
});
