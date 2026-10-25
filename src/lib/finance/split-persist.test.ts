import { describe, expect, it, vi } from "vitest";
import {
  divisaoVazia,
  montarDivisaoAVista,
  montarDivisaoParcelada,
} from "@/lib/finance/split-persist";
import type { SplitPartInput } from "@/lib/validators/split";

// `split-persist.ts` importa o tipo do helpers (que puxa o client do servidor): o mock evita isso.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

// Fixtures sintéticas.
const PESSOA_1 = "00000000-0000-4000-8000-000000000011";
const PESSOA_2 = "00000000-0000-4000-8000-000000000022";
const FATURA = "00000000-0000-4000-8000-0000000000f1";
const CARTAO = "00000000-0000-4000-8000-0000000000c1";

const porValor = (id: string, valor: number): SplitPartInput => ({
  person_id: id,
  tipo: "valor",
  valor,
});
const porPercentual = (id: string, percentual: number): SplitPartInput => ({
  person_id: id,
  tipo: "percentual",
  percentual,
});

describe("montarDivisaoAVista", () => {
  it("1000,00 com terceiro de 600,00 por valor: minha parte 40000, uma pessoa, um recebível", () => {
    const r = montarDivisaoAVista({
      totalCentavos: 100000,
      parts: [porValor(PESSOA_1, 600)],
      statementId: FATURA,
      cardId: CARTAO,
      dataPrevista: "2026-11-05",
      alcance: "regra-cheia",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.minhaParteCentavos).toBe(40000);
    expect(r.divisao.alcance).toBe("regra-cheia");
    expect(r.divisao.pessoas).toEqual([
      { person_id: PESSOA_1, tipo_divisao: "valor", percentual: null, valor: 600 },
    ]);
    expect(r.divisao.recebiveis).toEqual([
      {
        person_id: PESSOA_1,
        parcela_numero: null,
        statement_id: FATURA,
        card_id: CARTAO,
        valor: 600,
        data_prevista: "2026-11-05",
      },
    ]);
  });

  it("percentual grava o percentual na pessoa; recebível de R$ 0 não existe", () => {
    const r = montarDivisaoAVista({
      totalCentavos: 10000,
      parts: [porPercentual(PESSOA_1, 25), porPercentual(PESSOA_2, 0)],
      statementId: null,
      cardId: null,
      alcance: "so-dinheiro-registrado",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.minhaParteCentavos).toBe(7500);
    expect(r.divisao.pessoas.map((p) => p.percentual)).toEqual([25, 0]);
    expect(r.divisao.recebiveis).toHaveLength(1);
    expect(r.divisao.recebiveis[0].valor).toBe(25);
    expect(r.divisao.recebiveis[0].data_prevista).toBeNull();
  });

  it("partes que não fecham: ok false com a mensagem de dividirDespesa", () => {
    const r = montarDivisaoAVista({
      totalCentavos: 10000,
      parts: [porValor(PESSOA_1, 150)],
      statementId: null,
      cardId: null,
      alcance: "regra-cheia",
    });
    expect(r).toEqual({
      ok: false,
      error: "A soma das partes de terceiros não pode passar do total.",
    });
  });
});

describe("montarDivisaoParcelada", () => {
  const parcelas = [
    { numero: 1, statementId: "f1", cardId: CARTAO, valorCentavos: 33333 },
    { numero: 2, statementId: "f2", cardId: CARTAO, valorCentavos: 33333 },
    { numero: 3, statementId: "f3", cardId: CARTAO, valorCentavos: 33334 },
  ];

  it("3 parcelas (333,33/333,33/333,34) com terceiro de 50%: Σ recebíveis = 500,00, numeração 1..3", () => {
    const r = montarDivisaoParcelada({
      totalCentavos: 100000,
      parts: [porPercentual(PESSOA_1, 50)],
      parcelas,
      alcance: "regra-cheia",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.minhaParteCentavos).toBe(50000);
    const soma = r.divisao.recebiveis.reduce((s, x) => s + Math.round(x.valor * 100), 0);
    expect(soma).toBe(50000);
    expect(r.divisao.recebiveis.every((x) => x.valor > 0)).toBe(true);
    expect(r.divisao.recebiveis.map((x) => x.parcela_numero)).toEqual([1, 2, 3]);
    expect(r.divisao.recebiveis.map((x) => x.statement_id)).toEqual(["f1", "f2", "f3"]);
  });

  it("uma pessoa com parte total menor que o nº de parcelas: nenhuma parcela de R$ 0", () => {
    const r = montarDivisaoParcelada({
      totalCentavos: 100000,
      parts: [porValor(PESSOA_1, 0.02)],
      parcelas,
      alcance: "regra-cheia",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.divisao.recebiveis.every((x) => x.valor > 0)).toBe(true);
    const soma = r.divisao.recebiveis.reduce((s, x) => s + Math.round(x.valor * 100), 0);
    expect(soma).toBe(2);
  });

  it("partes que não fecham: ok false com a mensagem de dividirDespesa", () => {
    const r = montarDivisaoParcelada({
      totalCentavos: 100000,
      parts: [porPercentual(PESSOA_1, 60), porPercentual(PESSOA_2, 60)],
      parcelas,
      alcance: "regra-cheia",
    });
    expect(r).toEqual({ ok: false, error: "A soma dos percentuais não pode passar de 100%." });
  });
});

describe("divisaoVazia", () => {
  it("é o 'limpar': sem pessoas e sem recebíveis, com o alcance pedido", () => {
    expect(divisaoVazia("so-dinheiro-registrado")).toEqual({
      alcance: "so-dinheiro-registrado",
      pessoas: [],
      recebiveis: [],
    });
  });
});
