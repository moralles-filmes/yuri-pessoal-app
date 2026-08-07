import { describe, expect, it } from "vitest";
import {
  decidirReaplicacao,
  distribuirTerceirosPorParcela,
  dividirDespesa,
  mesmaDivisaoCentavos,
  sharedExpensesToFormParts,
  validarDivisao,
  somaTerceiros,
} from "@/lib/finance/split";

describe("dividirDespesa", () => {
  it("divide 50/50 por valor e a soma fecha (R$500 → 250 meu / 250 terceiro)", () => {
    const r = dividirDespesa(50000, [
      { personId: "p1", tipo: "valor", valorCentavos: 25000 },
    ]);
    expect(r.minhaParteCentavos).toBe(25000);
    expect(r.partesTerceiros).toEqual([{ personId: "p1", valorCentavos: 25000 }]);
    expect(r.minhaParteCentavos + somaTerceiros(r)).toBe(50000);
  });

  it("divide por % (70% meu / 30% terceiro)", () => {
    const r = dividirDespesa(50000, [
      { personId: "p1", tipo: "percentual", percentual: 30 },
    ]);
    expect(r.partesTerceiros[0].valorCentavos).toBe(15000);
    expect(r.minhaParteCentavos).toBe(35000);
    expect(r.minhaParteCentavos + somaTerceiros(r)).toBe(50000);
  });

  it("3 vias iguais por % (33,33% cada): resto de centavo cai na minha parte", () => {
    // R$100 = 10000c, dois terceiros a 33,33% → 3333 cada; minha parte 3334.
    const r = dividirDespesa(10000, [
      { personId: "p1", tipo: "percentual", percentual: 33.33 },
      { personId: "p2", tipo: "percentual", percentual: 33.33 },
    ]);
    expect(r.partesTerceiros.map((t) => t.valorCentavos)).toEqual([3333, 3333]);
    expect(r.minhaParteCentavos).toBe(3334);
    expect(r.minhaParteCentavos + somaTerceiros(r)).toBe(10000);
  });

  it("50% + 50% sem estourar por arredondamento (total ímpar)", () => {
    // 101c, dois a 50% → floor(50,5)=50 cada; minha parte absorve o centavo restante.
    const r = dividirDespesa(101, [
      { personId: "p1", tipo: "percentual", percentual: 50 },
      { personId: "p2", tipo: "percentual", percentual: 50 },
    ]);
    expect(r.partesTerceiros.map((t) => t.valorCentavos)).toEqual([50, 50]);
    expect(r.minhaParteCentavos).toBe(1);
    expect(r.minhaParteCentavos + somaTerceiros(r)).toBe(101);
  });

  it("múltiplas pessoas misturando valor e % (a soma sempre fecha)", () => {
    // R$1000 = 100000c: terceiro A = R$200 (valor), terceiro B = 25% (25000) → meu 55000.
    const r = dividirDespesa(100000, [
      { personId: "a", tipo: "valor", valorCentavos: 20000 },
      { personId: "b", tipo: "percentual", percentual: 25 },
    ]);
    expect(r.partesTerceiros).toEqual([
      { personId: "a", valorCentavos: 20000 },
      { personId: "b", valorCentavos: 25000 },
    ]);
    expect(r.minhaParteCentavos).toBe(55000);
    expect(r.minhaParteCentavos + somaTerceiros(r)).toBe(100000);
  });

  it("aceita soma de terceiros exatamente igual ao total (minha parte = 0)", () => {
    const r = dividirDespesa(50000, [
      { personId: "p1", tipo: "valor", valorCentavos: 50000 },
    ]);
    expect(r.minhaParteCentavos).toBe(0);
    expect(r.partesTerceiros[0].valorCentavos).toBe(50000);
  });

  it("rejeita quando a soma dos percentuais passa de 100", () => {
    expect(() =>
      dividirDespesa(50000, [
        { personId: "p1", tipo: "percentual", percentual: 60 },
        { personId: "p2", tipo: "percentual", percentual: 50 },
      ]),
    ).toThrow();
  });

  it("rejeita um percentual individual acima de 100", () => {
    expect(() =>
      dividirDespesa(50000, [
        { personId: "p1", tipo: "percentual", percentual: 150 },
      ]),
    ).toThrow();
  });

  it("rejeita quando a soma dos valores de terceiros passa do total", () => {
    expect(() =>
      dividirDespesa(50000, [
        { personId: "p1", tipo: "valor", valorCentavos: 60000 },
      ]),
    ).toThrow();
  });

  it("rejeita valor de terceiro negativo e total negativo", () => {
    expect(() =>
      dividirDespesa(50000, [{ personId: "p1", tipo: "valor", valorCentavos: -1 }]),
    ).toThrow();
    expect(() => dividirDespesa(-1, [])).toThrow();
  });

  it("pessoal (sem terceiros): minha parte = total e zero recebíveis", () => {
    const r = dividirDespesa(50000, []);
    expect(r.minhaParteCentavos).toBe(50000);
    expect(r.partesTerceiros).toEqual([]);
  });
});

describe("distribuirTerceirosPorParcela", () => {
  /** Invariantes que toda distribuição deve respeitar. */
  function checa(
    shares: number[],
    valores: number[],
    matriz: number[][],
  ) {
    // (a) coluna de cada terceiro soma exatamente a sua parte total.
    shares.forEach((share, j) => {
      const coluna = matriz.reduce((s, linha) => s + linha[j], 0);
      expect(coluna).toBe(share);
    });
    // (b) em cada parcela, a soma dos terceiros não passa do valor da parcela (minha parte >= 0).
    matriz.forEach((linha, i) => {
      const somaParcela = linha.reduce((s, v) => s + v, 0);
      expect(somaParcela).toBeLessThanOrEqual(valores[i]);
    });
  }

  it("50/50 entre 2 parcelas iguais: cada parcela divide igual", () => {
    const shares = [50000]; // um terceiro com R$500 de um total de R$1000
    const valores = [50000, 50000];
    const m = distribuirTerceirosPorParcela(shares, valores);
    expect(m).toEqual([[25000], [25000]]);
    checa(shares, valores, m);
  });

  it("dois terceiros, parcelas desiguais: soma fecha e minha parte nunca negativa", () => {
    const shares = [40000, 30000]; // terceiros somam 70000 de um total de 100000
    const valores = [33334, 33333, 33333];
    const m = distribuirTerceirosPorParcela(shares, valores);
    checa(shares, valores, m);
  });

  it("caso degenerado (centavos sub-parcela): respeita o teto e preserva os totais", () => {
    // total 3c em 3 parcelas de 1c, dois terceiros de 1c cada (minha parte 1c).
    const shares = [1, 1];
    const valores = [1, 1, 1];
    const m = distribuirTerceirosPorParcela(shares, valores);
    checa(shares, valores, m);
  });

  it("terceiro paga 100% (minha parte zero): cada parcela é integralmente do terceiro", () => {
    const shares = [30000];
    const valores = [10000, 10000, 10000];
    const m = distribuirTerceirosPorParcela(shares, valores);
    expect(m).toEqual([[10000], [10000], [10000]]);
    checa(shares, valores, m);
  });
});

describe("validarDivisao", () => {
  it("true para divisão que fecha, false para a que não fecha", () => {
    expect(
      validarDivisao(50000, [{ personId: "p1", tipo: "valor", valorCentavos: 25000 }]),
    ).toBe(true);
    expect(
      validarDivisao(50000, [{ personId: "p1", tipo: "valor", valorCentavos: 60000 }]),
    ).toBe(false);
    expect(
      validarDivisao(50000, [{ personId: "p1", tipo: "percentual", percentual: 120 }]),
    ).toBe(false);
  });
});

describe("sharedExpensesToFormParts", () => {
  it("reconstrói partes do form a partir das shared_expenses gravadas", () => {
    const parts = sharedExpensesToFormParts([
      { person_id: "p1", tipo_divisao: "valor", percentual: null, valor: 44.01 },
      { person_id: "p2", tipo_divisao: "percentual", percentual: 30, valor: 30 },
    ]);
    expect(parts).toEqual([
      { person_id: "p1", tipo: "valor", valor: "44,01", percentual: "" },
      { person_id: "p2", tipo: "percentual", valor: "", percentual: "30" },
    ]);
  });

  it("usa vírgula decimal no valor e devolve vazio quando não há linhas", () => {
    expect(
      sharedExpensesToFormParts([
        { person_id: "p1", tipo_divisao: "valor", percentual: null, valor: 1234.5 },
      ])[0].valor,
    ).toBe("1234,5");
    expect(sharedExpensesToFormParts([])).toEqual([]);
  });
});

describe("mesmaDivisaoCentavos", () => {
  it("ignora a ordem das chaves e distingue valor e conjunto", () => {
    const a = new Map([
      ["p1", 100],
      ["p2", 200],
    ]);
    expect(mesmaDivisaoCentavos(a, new Map([["p2", 200], ["p1", 100]]))).toBe(true);
    expect(mesmaDivisaoCentavos(a, new Map([["p1", 100], ["p2", 201]]))).toBe(false);
    expect(mesmaDivisaoCentavos(a, new Map([["p1", 100]]))).toBe(false);
    expect(mesmaDivisaoCentavos(new Map(), new Map())).toBe(true);
  });
});

describe("decidirReaplicacao", () => {
  const base = {
    classificacaoAtual: "compartilhada",
    classificacaoNova: "compartilhada",
    totalCentavosAtual: 50000,
    totalCentavosNovo: 50000,
    divisaoAtual: new Map([["p1", 25000]]),
    divisaoNova: new Map([["p1", 25000]]),
    temRecebivelFechado: false,
  };

  it("pessoal → pessoal não faz nada (nunca houve divisão)", () => {
    expect(
      decidirReaplicacao({
        ...base,
        classificacaoAtual: "pessoal",
        classificacaoNova: "pessoal",
        divisaoAtual: new Map(),
        divisaoNova: new Map(),
      }),
    ).toEqual({ acao: "nada" });
  });

  it("divisão idêntica não é reaplicada (editar descrição não mexe em recebível)", () => {
    expect(decidirReaplicacao(base)).toEqual({ acao: "nada" });
  });

  it("trocar a PESSOA mantendo o valor conta como mudança", () => {
    expect(
      decidirReaplicacao({ ...base, divisaoNova: new Map([["p2", 25000]]) }),
    ).toEqual({ acao: "reaplicar" });
  });

  it("mudar só o TOTAL conta como mudança, mesmo com as mesmas pessoas", () => {
    // 50% de R$500 = 25000; de R$600 = 30000. O mapa novo já vem resolvido.
    expect(
      decidirReaplicacao({
        ...base,
        totalCentavosNovo: 60000,
        divisaoNova: new Map([["p1", 30000]]),
      }),
    ).toEqual({ acao: "reaplicar" });
  });

  it("mudar só a CLASSIFICAÇÃO (terceiro ↔ compartilhada) reaplica", () => {
    expect(
      decidirReaplicacao({ ...base, classificacaoNova: "terceiro" }),
    ).toEqual({ acao: "reaplicar" });
  });

  it("virar pessoal manda LIMPAR", () => {
    expect(
      decidirReaplicacao({
        ...base,
        classificacaoNova: "pessoal",
        divisaoNova: new Map(),
      }),
    ).toEqual({ acao: "limpar" });
  });

  it("recebível cobrado/pago BLOQUEIA qualquer mudança, inclusive limpar", () => {
    const mudanca = decidirReaplicacao({
      ...base,
      divisaoNova: new Map([["p2", 25000]]),
      temRecebivelFechado: true,
    });
    expect(mudanca.acao).toBe("bloqueado");

    const limpeza = decidirReaplicacao({
      ...base,
      classificacaoNova: "pessoal",
      divisaoNova: new Map(),
      temRecebivelFechado: true,
    });
    expect(limpeza.acao).toBe("bloqueado");
  });

  it("recebível cobrado/pago NÃO bloqueia quando nada mudou", () => {
    expect(
      decidirReaplicacao({ ...base, temRecebivelFechado: true }),
    ).toEqual({ acao: "nada" });
  });

  it("dividir uma despesa que era pessoal reaplica", () => {
    expect(
      decidirReaplicacao({
        ...base,
        classificacaoAtual: "pessoal",
        divisaoAtual: new Map(),
      }),
    ).toEqual({ acao: "reaplicar" });
  });
});
