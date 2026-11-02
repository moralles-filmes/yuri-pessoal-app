/**
 * 03-G2 E9 (K5) — três itens da matriz de fechamento que EXISTIAM no código e não tinham teste.
 * Nenhum código de produção muda: o teste só prova o que já está lá.
 *
 * Fixture sintética: nenhum dado real do dono. O projeto não tem teste de componente
 * (environment node), então os itens de tela se provam por varredura do código-fonte sem
 * comentários, como `src/lib/finance/exclusao-confirmada.test.ts` faz.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { completudeDe } from "@/lib/finance/pipeline";

const leitura = vi.hoisted(() => ({ lerFinanceiro: vi.fn() }));
vi.mock("@/lib/finance/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/finance/queries")>()),
  lerFinanceiro: leitura.lerFinanceiro,
}));

const { getInvoicesCardData } = await import("@/lib/dashboard/queries");

const semComentarios = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const HOJE = "2031-03-05";

const CARTAO = {
  id: "cartao-sintetico",
  nome: "Cartão Sintético",
  cor: "#123456",
  limite_total: 1000,
  dia_fechamento: 10,
  dia_vencimento: 20,
};

function fatura(id: string, competencia: string, total: number, pagoEm: string | null = null) {
  return {
    id,
    card_id: CARTAO.id,
    competencia,
    data_fechamento: `${competencia.slice(0, 7)}-10`,
    data_vencimento: `${competencia.slice(0, 7)}-20`,
    pago_em: pagoEm,
    total_atual: total,
  };
}

describe("03-G2 E9 · itens da matriz que existiam sem teste (K5)", () => {
  it("Pendente ao banco: totalProximas soma só as faturas reais não pagas", async () => {
    leitura.lerFinanceiro.mockResolvedValueOnce({
      entradas: {
        cards: [CARTAO],
        sts: [
          fatura("fatura-a", "2031-04-01", 100),
          fatura("fatura-b", "2031-05-01", 200),
          fatura("fatura-c", "2031-06-01", 400, "2031-06-15T12:00:00Z"),
        ],
        recs: [],
      },
      completude: completudeDe([]),
    });

    const resultado = await getInvoicesCardData(HOJE);

    expect(resultado.totalProximas).toBe(300);
    expect(resultado.pagas).toBe(1);
  });

  it("pizza nunca negativa: as duas pizzas filtram só valores positivos", () => {
    // Sem nota de "o que ficou de fora": a lista de itens de fora é declarada aberta (REDESIGN-05).
    const pizzas = [
      path.resolve(__dirname, "..", "..", "components", "dashboard", "categoria-chart-impl.tsx"),
      path.resolve(__dirname, "..", "..", "components", "dashboard", "forma-pagamento-chart-impl.tsx"),
    ];
    for (const arquivo of pizzas) {
      const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
      expect(codigo, arquivo).toMatch(/\.filter\(\s*\(d\)\s*=>\s*d\.meu\s*>\s*0\s*\)/);
    }
  });

  // 04-A (reescrito no lugar): os cards antigos saíram do painel; quem escreve "sem base de
  // comparação" agora é `comparacaoDosIndicadores` (com teste de valor em painel.test.ts), e o
  // painel a chama.
  it("base anterior zero: o indicador escreve 'sem base de comparação'", () => {
    const arquivo = path.resolve(
      __dirname,
      "..",
      "..",
      "app",
      "(app)",
      "dashboard",
      "financeiro",
      "financial-dashboard-client.tsx",
    );
    const codigo = semComentarios(fs.readFileSync(arquivo, "utf8"));
    expect(codigo).toContain("comparacaoDosIndicadores(");
    const regra = semComentarios(fs.readFileSync(path.resolve(__dirname, "painel.ts"), "utf8"));
    expect(regra).toMatch(/pct === null\) return "sem base de comparação"/);
  });
});
