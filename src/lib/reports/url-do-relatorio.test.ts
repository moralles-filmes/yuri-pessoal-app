/**
 * REDESIGN-04-A2 · T8 — a URL do relatório financeiro é pura, e a barra de filtros não tem campo de texto.
 *
 * ⚠️ A barra é lida como código, não renderizada (invariante 25: o projeto não tem teste de componente).
 * Comentários saem antes da leitura — a explicação de uma regra não pode satisfazê-la.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEM_RECORTE, type Recorte } from "@/lib/finance/recorte";
import { semComentarios } from "@/test/links-inline";
import { comRecorte, semFiltros, urlDoRelatorio } from "./url-do-relatorio";

const MES = "2026-11";

describe("urlDoRelatorio", () => {
  it("o padrao so leva o mes", () => {
    expect(urlDoRelatorio({ mes: MES, base: "competencia", resp: "meu", recorte: SEM_RECORTE })).toBe(
      "/relatorios?mes=2026-11",
    );
  });

  it("a ordem dos parametros e fixa: mes, base, resp, conta, cartao, pessoa, categoria", () => {
    const url = urlDoRelatorio({
      mes: MES,
      base: "caixa",
      resp: "terceiros",
      recorte: { conta: "c1", cartao: null, pessoa: "p1", categoria: "g1" },
    });
    expect(url).toBe("/relatorios?mes=2026-11&base=caixa&resp=terceiros&conta=c1&pessoa=p1&categoria=g1");

    const comCartao = urlDoRelatorio({
      mes: MES,
      base: "caixa",
      resp: "consolidado",
      recorte: { conta: null, cartao: "k1", pessoa: "p1", categoria: "g1" },
    });
    expect(comCartao).toBe(
      "/relatorios?mes=2026-11&base=caixa&resp=consolidado&cartao=k1&pessoa=p1&categoria=g1",
    );
  });

  it("nunca escreve o padrao: sem resp=meu e sem base=competencia", () => {
    const url = urlDoRelatorio({
      mes: MES,
      base: "competencia",
      resp: "meu",
      recorte: { conta: "c1", cartao: null, pessoa: null, categoria: null },
    });
    expect(url).toBe("/relatorios?mes=2026-11&conta=c1");
    expect(url).not.toContain("resp=");
    expect(url).not.toContain("base=");
  });

  it("codifica o id como componente de URL", () => {
    const url = urlDoRelatorio({
      mes: MES,
      base: "competencia",
      resp: "meu",
      recorte: { ...SEM_RECORTE, categoria: "a&b=c" },
    });
    expect(url).toBe("/relatorios?mes=2026-11&categoria=a%26b%3Dc");
  });
});

describe("comRecorte", () => {
  const atual: Recorte = { conta: "c1", cartao: null, pessoa: "p1", categoria: "g1" };

  it("escolher a conta zera o cartao e preserva pessoa e categoria", () => {
    const r = comRecorte({ ...atual, conta: null, cartao: "k1" }, "conta", "c2");
    expect(r).toEqual({ conta: "c2", cartao: null, pessoa: "p1", categoria: "g1" });
  });

  it("escolher o cartao zera a conta e preserva pessoa e categoria", () => {
    const r = comRecorte(atual, "cartao", "k1");
    expect(r).toEqual({ conta: null, cartao: "k1", pessoa: "p1", categoria: "g1" });
  });

  it("pessoa e categoria nao mexem em conta nem cartao", () => {
    expect(comRecorte(atual, "pessoa", "p2")).toEqual({ ...atual, pessoa: "p2" });
    expect(comRecorte(atual, "categoria", "g2")).toEqual({ ...atual, categoria: "g2" });
  });

  it("id nulo limpa so aquele recorte", () => {
    expect(comRecorte(atual, "conta", null)).toEqual({ conta: null, cartao: null, pessoa: "p1", categoria: "g1" });
    expect(comRecorte(atual, "pessoa", null)).toEqual({ ...atual, pessoa: null });
  });

  it("nao altera o objeto recebido", () => {
    const copia = { ...atual };
    comRecorte(atual, "cartao", "k1");
    expect(atual).toEqual(copia);
  });
});

describe("semFiltros", () => {
  it("mantem so o mes", () => {
    expect(semFiltros(MES)).toBe("/relatorios?mes=2026-11");
  });
});

describe("barra-de-filtros.tsx (varredura da fonte)", () => {
  const FONTE = semComentarios(
    fs.readFileSync(path.resolve(__dirname, "..", "..", "components", "reports", "barra-de-filtros.tsx"), "utf8"),
  );

  it("e componente cliente", () => {
    expect(FONTE.trimStart().startsWith('"use client"')).toBe(true);
  });

  it("usa SeletorDeVisao duas vezes: base e responsabilidade", () => {
    expect(FONTE.match(/<SeletorDeVisao\b/g)?.length).toBe(2);
  });

  it("tem o rotulo ligado a cada um dos quatro selects", () => {
    // Um componente interno escreve o par rotulo/select UMA vez: `htmlFor` e `id` leem o mesmo valor.
    expect(FONTE).toMatch(/htmlFor=\{id\}/);
    expect(FONTE).toMatch(/<select\b[^>]*\bid=\{id\}/);
    // Os ids: um conjunto fora do <details> (sm para cima) e outro, com sufixo "-m", dentro dele (celular).
    for (const id of ["rel-conta", "rel-cartao", "rel-pessoa", "rel-categoria"]) {
      expect(FONTE).toContain(`"${id}"`);
    }
    expect(FONTE).toContain('"-m"');
  });

  it("agrupa os recortes num <details>", () => {
    expect(FONTE).toContain("<details");
  });

  it("nao tem campo de texto", () => {
    expect(FONTE).not.toContain("useUrlText");
    expect(FONTE).not.toMatch(/type=["']text["']/);
    expect(FONTE).not.toMatch(/type=["']search["']/);
  });
});
