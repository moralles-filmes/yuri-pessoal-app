import { describe, expect, it } from "vitest";
import {
  divisaoDaLinha,
  divisaoPorStatus,
  type ImportRowSplitInput,
} from "@/lib/import/split-totals";

const NICOLE = "11111111-1111-4111-8111-111111111111";
const JOAO = "22222222-2222-4222-8222-222222222222";

function row(over: Partial<ImportRowSplitInput> = {}): ImportRowSplitInput {
  return {
    status: "para_importar",
    valor: 100,
    tipo: "despesa",
    classificacao: "pessoal",
    split_parts: [],
    ...over,
  };
}

describe("divisaoDaLinha", () => {
  it("linha pessoal é toda minha", () => {
    const d = divisaoDaLinha(row({ valor: 79.08 }));
    expect(d).toEqual({ ok: true, meuCentavos: 7908, partes: [] });
  });

  it("compartilhada por valor: o resto é meu", () => {
    const d = divisaoDaLinha(
      row({
        valor: 105,
        classificacao: "compartilhada",
        split_parts: [{ person_id: NICOLE, tipo: "valor", valor: 55 }],
      }),
    );
    expect(d).toEqual({
      ok: true,
      meuCentavos: 5000,
      partes: [{ personId: NICOLE, valorCentavos: 5500 }],
    });
  });

  it("compartilhada por percentual: o resto de centavo fica comigo", () => {
    // 50% de 1,01 = 50,5c → floor = 50c para ela, 51c para mim.
    const d = divisaoDaLinha(
      row({
        valor: 1.01,
        classificacao: "compartilhada",
        split_parts: [{ person_id: NICOLE, tipo: "percentual", percentual: 50 }],
      }),
    );
    expect(d).toEqual({
      ok: true,
      meuCentavos: 51,
      partes: [{ personId: NICOLE, valorCentavos: 50 }],
    });
  });

  it("de terceiro 100%: minha parte é zero", () => {
    const d = divisaoDaLinha(
      row({
        valor: 70.03,
        classificacao: "terceiro",
        split_parts: [{ person_id: NICOLE, tipo: "percentual", percentual: 100 }],
      }),
    );
    expect(d).toEqual({
      ok: true,
      meuCentavos: 0,
      partes: [{ personId: NICOLE, valorCentavos: 7003 }],
    });
  });

  it("estorno (receita) não é dividido e volta negativo", () => {
    const d = divisaoDaLinha(
      row({
        valor: 40,
        tipo: "receita",
        // Mesmo que a linha tenha partes gravadas de quando era despesa, receita não divide:
        // é o que o commitImport faz (crédito vai por createCardEstorno).
        classificacao: "compartilhada",
        split_parts: [{ person_id: NICOLE, tipo: "valor", valor: 20 }],
      }),
    );
    expect(d).toEqual({ ok: true, meuCentavos: -4000, partes: [] });
  });

  it("declara a linha irresolvível quando as partes somam mais que o valor", () => {
    const d = divisaoDaLinha(
      row({
        valor: 50,
        classificacao: "compartilhada",
        split_parts: [{ person_id: NICOLE, tipo: "valor", valor: 80 }],
      }),
    );
    expect(d.ok).toBe(false);
  });

  it("declara irresolvível a linha sem valor", () => {
    expect(divisaoDaLinha(row({ valor: null })).ok).toBe(false);
  });
});

describe("divisaoPorStatus", () => {
  it("quebra o total do lote em meu × cada pessoa", () => {
    const d = divisaoPorStatus([
      row({ valor: 200 }),
      row({
        valor: 105,
        classificacao: "compartilhada",
        split_parts: [{ person_id: NICOLE, tipo: "valor", valor: 55 }],
      }),
      row({
        valor: 70,
        classificacao: "terceiro",
        split_parts: [{ person_id: JOAO, tipo: "percentual", percentual: 100 }],
      }),
    ]);
    expect(d.meu).toBe(250); // 200 + 50 + 0
    expect(d.terceiros).toBe(125); // 55 + 70
    expect(d.porPessoa).toEqual([
      { personId: JOAO, valor: 70 },
      { personId: NICOLE, valor: 55 },
    ]);
    expect(d.temTerceiros).toBe(true);
    expect(d.parcial).toBe(false);
  });

  it("a mesma pessoa em linhas diferentes vira UMA entrada", () => {
    const d = divisaoPorStatus([
      row({
        valor: 40,
        classificacao: "terceiro",
        split_parts: [{ person_id: NICOLE, tipo: "percentual", percentual: 100 }],
      }),
      row({
        valor: 60,
        classificacao: "terceiro",
        split_parts: [{ person_id: NICOLE, tipo: "percentual", percentual: 100 }],
      }),
    ]);
    expect(d.porPessoa).toEqual([{ personId: NICOLE, valor: 100 }]);
    expect(d.meu).toBe(0);
  });

  it("estorno subtrai da minha parte, e meu + terceiros fecha o líquido", () => {
    const d = divisaoPorStatus([
      row({ valor: 200 }),
      row({
        valor: 100,
        classificacao: "compartilhada",
        split_parts: [{ person_id: NICOLE, tipo: "percentual", percentual: 40 }],
      }),
      row({ valor: 30, tipo: "receita" }),
    ]);
    // Líquido do lote: 200 + 100 − 30 = 270.
    expect(d.meu + d.terceiros).toBe(270);
    expect(d.meu).toBe(230); // 200 + 60 − 30
    expect(d.terceiros).toBe(40);
  });

  it("linha irresolvível fica FORA da conta e o lote se declara parcial", () => {
    const d = divisaoPorStatus([
      row({
        valor: 105,
        classificacao: "compartilhada",
        split_parts: [{ person_id: NICOLE, tipo: "valor", valor: 55 }],
      }),
      row({
        valor: 50,
        classificacao: "compartilhada",
        split_parts: [{ person_id: JOAO, tipo: "valor", valor: 80 }],
      }),
    ]);
    expect(d.parcial).toBe(true);
    expect(d.naoResolvidas).toBe(1);
    // O que resolveu continua somando — a linha ruim não derruba o resto.
    expect(d.meu).toBe(50);
    expect(d.terceiros).toBe(55);
    expect(d.porPessoa).toEqual([{ personId: NICOLE, valor: 55 }]);
  });

  it("linha sem valor não conta como divisão irresolvível", () => {
    const d = divisaoPorStatus([row({ valor: null }), row({ valor: 25 })]);
    expect(d.parcial).toBe(false);
    expect(d.naoResolvidas).toBe(0);
    expect(d.meu).toBe(25);
  });

  it("só olha o status pedido (ignoradas, duplicadas e erros ficam de fora)", () => {
    const rows = [
      row({ valor: 100, status: "para_importar" }),
      row({ valor: 999, status: "ignorada" }),
      row({ valor: 888, status: "duplicada" }),
      row({ valor: 777, status: "erro" }),
      row({ valor: 300, status: "importada" }),
    ];
    expect(divisaoPorStatus(rows).meu).toBe(100);
    expect(divisaoPorStatus(rows, "importada").meu).toBe(300);
  });

  it("lote sem terceiro nenhum não tem quebra a mostrar", () => {
    const d = divisaoPorStatus([row({ valor: 100 }), row({ valor: 50 })]);
    expect(d.temTerceiros).toBe(false);
    expect(d.porPessoa).toEqual([]);
    expect(d.terceiros).toBe(0);
    expect(d.meu).toBe(150);
  });

  it("não acumula erro de ponto flutuante (soma em centavos)", () => {
    const d = divisaoPorStatus([row({ valor: 0.1 }), row({ valor: 0.2 })]);
    expect(d.meu).toBe(0.3);
  });
});
