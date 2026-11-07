/**
 * C5.2 · Cada gráfico do painel tem leitura textual (tabela sr-only) na FACHADA — por varredura
 * de fonte, SEM comentários (as explicações citam os nomes que a regra proíbe).
 *
 * Regra 1 do carregamento sob demanda: a fachada não importa o `-impl` nem o `recharts` em
 * runtime; só `import type` e `next/dynamic`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fonteSemComentarios(relativo: string): string {
  const bruto = readFileSync(join(process.cwd(), relativo), "utf8");
  return bruto.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** Aspas simples viram duplas e todo espaço em branco vira um espaço só. */
function normalizada(fonte: string): string {
  return fonte.replace(/'/g, '"').replace(/\s+/g, " ");
}

const TABELA = "src/components/shared/painel/tabela-do-grafico.tsx";

const FACHADAS = [
  {
    nome: "barras-entradas-saidas",
    arquivo: "src/components/dashboard/barras-entradas-saidas-chart.tsx",
    funcao: "leituraDasBarras",
    mes: true,
  },
  {
    nome: "projecao",
    arquivo: "src/components/dashboard/projecao-chart.tsx",
    funcao: "leituraDaProjecao",
    mes: true,
  },
  {
    nome: "faturas",
    arquivo: "src/components/dashboard/faturas-chart.tsx",
    funcao: "leituraDasFaturas",
    mes: true,
  },
  {
    nome: "forma-pagamento",
    arquivo: "src/components/dashboard/forma-pagamento-chart.tsx",
    funcao: "leituraDaForma",
    mes: false,
  },
] as const;

describe("C5.2 · leitura textual dos quatro gráficos do painel", () => {
  for (const f of FACHADAS) {
    describe(f.nome, () => {
      const fonte = fonteSemComentarios(f.arquivo);
      const norm = normalizada(fonte);

      it("leu o arquivo (não afirma sobre string vazia)", () => {
        expect(fonte.length).toBeGreaterThan(200);
      });

      it("renderiza <TabelaDoGrafico> e chama a sua função de leitura", () => {
        expect(fonte).toContain("<TabelaDoGrafico");
        expect(fonte).toContain(f.funcao);
        expect(norm).toContain('from "@/components/shared/painel/tabela-do-grafico"');
      });

      if (f.mes) {
        it("passa monthLabel como rotuloDoMes", () => {
          expect(norm).toContain("rotuloDoMes: monthLabel");
        });
      }

      it("não importa o -impl em runtime (só import type e next/dynamic)", () => {
        const importDeValor = new RegExp(
          `import\\s+(?!type\\s)[^;]*?from\\s+["']\\./${f.nome}-chart-impl["']`,
        );
        expect(importDeValor.test(fonte)).toBe(false);
        expect(norm).toContain(`import("./${f.nome}-chart-impl")`);
      });

      it("não importa recharts", () => {
        expect(fonte).not.toContain("recharts");
      });
    });
  }
});

describe("C5.2 · tabela-do-grafico.tsx", () => {
  const fonte = fonteSemComentarios(TABELA);

  it("leu o arquivo", () => {
    expect(fonte.length).toBeGreaterThan(200);
  });

  it("é uma tabela sr-only com cabeçalho e linha por escopo", () => {
    expect(fonte).toContain("sr-only");
    expect(fonte).toContain('scope="col"');
    expect(fonte).toContain('scope="row"');
  });

  it("valores de dinheiro passam pelo ValorComOlho", () => {
    expect(fonte).toContain("ValorComOlho");
  });

  it("não importa recharts e não é componente client (sem estado)", () => {
    expect(fonte).not.toContain("recharts");
    expect(normalizada(fonte)).not.toContain('"use client"');
  });
});
