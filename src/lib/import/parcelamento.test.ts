import { describe, expect, it } from "vitest";
import {
  escalarPartesParcelado,
  planejarImportParcelado,
} from "@/lib/import/parcelamento";

describe("planejarImportParcelado — importar linha k/N como parcelamento", () => {
  it("usa o valor da linha como valor de CADA parcela (não divide pelo total)", () => {
    // Linha 1/10 de R$50: 10 parcelas de R$50, total R$500 (não R$5 cada).
    const p = planejarImportParcelado({
      valorParcelaCentavos: 5000,
      parcela: 1,
      parcelasTotal: 10,
    });
    expect(p.qtd).toBe(10);
    expect(p.numeroInicial).toBe(1);
    expect(p.totalLabel).toBe(10);
    expect(p.valorTotalCentavos).toBe(50000);
  });

  it("gera só as parcelas RESTANTES a partir de uma parcela do meio (5/12)", () => {
    const p = planejarImportParcelado({
      valorParcelaCentavos: 10500,
      parcela: 5,
      parcelasTotal: 12,
    });
    expect(p.qtd).toBe(8); // 5,6,...,12
    expect(p.numeroInicial).toBe(5);
    expect(p.totalLabel).toBe(12);
    expect(p.valorTotalCentavos).toBe(84000); // 8 × 105,00
  });

  it("de 2/3 gera 2 parcelas (a atual + a restante 3/3)", () => {
    const p = planejarImportParcelado({
      valorParcelaCentavos: 14750,
      parcela: 2,
      parcelasTotal: 3,
    });
    expect(p.qtd).toBe(2);
    expect(p.numeroInicial).toBe(2);
    expect(p.totalLabel).toBe(3);
    expect(p.valorTotalCentavos).toBe(29500);
  });

  it("de 9/10 gera 2 parcelas (9 e 10)", () => {
    const p = planejarImportParcelado({
      valorParcelaCentavos: 11366,
      parcela: 9,
      parcelasTotal: 10,
    });
    expect(p.qtd).toBe(2);
    expect(p.numeroInicial).toBe(9);
    expect(p.valorTotalCentavos).toBe(22732);
  });

  it("na última parcela (3/3) gera 1 só — degenerado mas válido", () => {
    const p = planejarImportParcelado({
      valorParcelaCentavos: 8000,
      parcela: 3,
      parcelasTotal: 3,
    });
    expect(p.qtd).toBe(1);
    expect(p.numeroInicial).toBe(3);
    expect(p.totalLabel).toBe(3);
    expect(p.valorTotalCentavos).toBe(8000);
  });

  it("rejeita numeração inválida", () => {
    expect(() =>
      planejarImportParcelado({ valorParcelaCentavos: 1000, parcela: 0, parcelasTotal: 3 }),
    ).toThrow();
    expect(() =>
      planejarImportParcelado({ valorParcelaCentavos: 1000, parcela: 4, parcelasTotal: 3 }),
    ).toThrow();
    expect(() =>
      planejarImportParcelado({ valorParcelaCentavos: 1000, parcela: 1, parcelasTotal: 0 }),
    ).toThrow();
    expect(() =>
      planejarImportParcelado({ valorParcelaCentavos: 1.5, parcela: 1, parcelasTotal: 3 }),
    ).toThrow();
  });
});

describe("escalarPartesParcelado — parte per-parcela → total da compra", () => {
  it("multiplica a parte por VALOR pela qtd de parcelas (R$147,50/parcela × 2 = R$295)", () => {
    // Caso real do bug: Suzy R$147,50 por parcela, 2 parcelas. Sem escalar, o recebível dela
    // viria R$73,75/parcela (a parte total dividida por 2).
    const out = escalarPartesParcelado(
      [{ person_id: "p1", tipo: "valor" as const, valor: 147.5, percentual: null }],
      2,
    );
    expect(out[0].valor).toBe(295);
  });

  it("não mexe na parte por PERCENTUAL (P% da parcela já = P% do total)", () => {
    const out = escalarPartesParcelado(
      [{ person_id: "p1", tipo: "percentual" as const, valor: null, percentual: 100 }],
      8,
    );
    expect(out[0].percentual).toBe(100);
    expect(out[0].valor).toBeNull();
  });

  it("escala em CENTAVOS, sem erro de ponto flutuante (R$59,99 × 2 = R$119,98)", () => {
    const out = escalarPartesParcelado(
      [{ person_id: "p1", tipo: "valor" as const, valor: 59.99, percentual: null }],
      2,
    );
    expect(out[0].valor).toBe(119.98);
  });

  it("qtd = 1 (última parcela) é no-op para o valor", () => {
    const out = escalarPartesParcelado(
      [{ person_id: "p1", tipo: "valor" as const, valor: 80, percentual: null }],
      1,
    );
    expect(out[0].valor).toBe(80);
  });

  it("escala cada parte de uma divisão mista preservando as de percentual", () => {
    const out = escalarPartesParcelado(
      [
        { person_id: "a", tipo: "valor" as const, valor: 30, percentual: null },
        { person_id: "b", tipo: "percentual" as const, valor: null, percentual: 25 },
      ],
      3,
    );
    expect(out[0].valor).toBe(90);
    expect(out[1].percentual).toBe(25);
  });

  it("rejeita qtd inválida", () => {
    expect(() => escalarPartesParcelado([], 0)).toThrow();
    expect(() => escalarPartesParcelado([], 1.5)).toThrow();
  });
});
