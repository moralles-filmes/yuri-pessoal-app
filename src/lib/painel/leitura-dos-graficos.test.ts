/**
 * C5.2 · Leitura textual dos gráficos do painel (tabela sr-only).
 *
 * Fixtures sintéticas. Os valores esperados passam por `formatCurrency`, para o teste afirmar
 * a formatação que o gráfico usa e não um texto escrito à mão.
 */
import { describe, expect, it } from "vitest";
import { formatCurrency } from "@/lib/format";
import {
  leituraDaForma,
  leituraDasBarras,
  leituraDasFaturas,
  leituraDaProjecao,
} from "./leitura-dos-graficos";

const mesAno = (m: string) => `mês ${m}`;

describe("leituraDasBarras", () => {
  const dados = [
    { mes: "2026-01", entradas: 1000, saidas: 250.5, saldo: 749.5, parcial: false },
    { mes: "2026-02", entradas: 0, saidas: 80, saldo: -80, parcial: true },
  ];

  it("colunas e valores formatados, com ' (parcial)' só no mês em andamento", () => {
    const leitura = leituraDasBarras({
      dados,
      series: "ambas",
      nomes: { entradas: "Entradas", saidas: "Saídas" },
      rotuloDoMes: mesAno,
    });
    expect(leitura).toEqual({
      colunas: ["Mês", "Entradas", "Saídas"],
      linhas: [
        {
          rotulo: "mês 2026-01",
          valores: [formatCurrency(1000), formatCurrency(250.5)],
        },
        {
          rotulo: "mês 2026-02 (parcial)",
          valores: [formatCurrency(0), formatCurrency(80)],
        },
      ],
    });
  });

  it("series 'saidas' não tem a coluna de entradas", () => {
    const leitura = leituraDasBarras({
      dados,
      series: "saidas",
      nomes: { entradas: "Entradas", saidas: "Saídas" },
      rotuloDoMes: mesAno,
    });
    expect(leitura?.colunas).toEqual(["Mês", "Saídas"]);
    expect(leitura?.linhas[0].valores).toEqual([formatCurrency(250.5)]);
  });

  it("sem nenhuma entrada nem saída é vazio (null), a mesma regra do EmptyState", () => {
    const zerado = [{ mes: "2026-03", entradas: 0, saidas: 0, saldo: 0, parcial: false }];
    expect(
      leituraDasBarras({
        dados: zerado,
        series: "ambas",
        nomes: { entradas: "E", saidas: "S" },
        rotuloDoMes: mesAno,
      }),
    ).toBeNull();
  });
});

describe("leituraDaProjecao", () => {
  it("colunas fixas e o total de cada mês", () => {
    const leitura = leituraDaProjecao({
      data: [
        { mes: "2026-03", faturas: 100, recorrencias: 50, contasFixas: 20, total: 170 },
      ],
      rotuloDoMes: mesAno,
    });
    expect(leitura).toEqual({
      colunas: [
        "Mês",
        "Minha parte das faturas (projetado)",
        "Recorrências (projetado)",
        "Contas fixas (projetado)",
        "Total",
      ],
      linhas: [
        {
          rotulo: "mês 2026-03",
          valores: [
            formatCurrency(100),
            formatCurrency(50),
            formatCurrency(20),
            formatCurrency(170),
          ],
        },
      ],
    });
  });

  it("sem nenhum total positivo é vazio (null)", () => {
    expect(
      leituraDaProjecao({
        data: [{ mes: "2026-03", faturas: 0, recorrencias: 0, contasFixas: 0, total: 0 }],
        rotuloDoMes: mesAno,
      }),
    ).toBeNull();
  });
});

describe("leituraDasFaturas", () => {
  it("mês com fatura mostra minha parte e terceiros; mês sem fatura vira [null, null]", () => {
    const leitura = leituraDasFaturas({
      data: [
        { mes: "2026-05", total: 1000, meu: 600, terceiros: 400 },
        { mes: "2026-06", total: null, meu: null, terceiros: null },
      ],
      rotuloDoMes: mesAno,
    });
    expect(leitura).toEqual({
      colunas: ["Mês", "Minha parte", "Parte de terceiros"],
      linhas: [
        { rotulo: "mês 2026-05", valores: [formatCurrency(600), formatCurrency(400)] },
        { rotulo: "mês 2026-06", valores: [null, null] },
      ],
    });
  });

  it("sem `vazio`, total zero conta como vazio (null)", () => {
    expect(
      leituraDasFaturas({
        data: [{ mes: "2026-05", total: 0, meu: 0, terceiros: 0 }],
        rotuloDoMes: mesAno,
      }),
    ).toBeNull();
  });

  it("com `vazio`, mês com fatura de total zero é zero medido e aparece", () => {
    const leitura = leituraDasFaturas({
      data: [{ mes: "2026-05", total: 0, meu: 0, terceiros: 0 }],
      vazio: { titulo: "t", descricao: "d" },
      rotuloDoMes: mesAno,
    });
    expect(leitura?.linhas[0].valores).toEqual([formatCurrency(0), formatCurrency(0)]);
  });

  it("com `vazio`, só mês sem fatura (null) continua vazio", () => {
    expect(
      leituraDasFaturas({
        data: [{ mes: "2026-06", total: null, meu: null, terceiros: null }],
        vazio: { titulo: "t", descricao: "d" },
        rotuloDoMes: mesAno,
      }),
    ).toBeNull();
  });
});

describe("leituraDaForma", () => {
  const data = [
    { paymentMethod: "pix" as const, movimentado: 300, meu: 0 },
    { paymentMethod: "debito" as const, movimentado: 900, meu: 100 },
    { paymentMethod: "cartao_credito" as const, movimentado: 500, meu: 400 },
    { paymentMethod: "outro" as const, movimentado: 50, meu: 50 },
  ];

  it("ignora meu zero, ordena do maior para o menor e usa os rótulos do módulo", () => {
    expect(leituraDaForma({ data })).toEqual({
      colunas: ["Forma de pagamento", "Minha parte"],
      linhas: [
        { rotulo: "Cartão de crédito", valores: [formatCurrency(400)] },
        { rotulo: "Débito", valores: [formatCurrency(100)] },
        { rotulo: "Outro", valores: [formatCurrency(50)] },
      ],
    });
  });

  it("aceita o nome da série vindo de quem chama", () => {
    const leitura = leituraDaForma({ data, rotuloDaSerie: "Gasto meu" });
    expect(leitura?.colunas[1]).toBe("Gasto meu");
  });

  it("sem nenhum meu positivo é vazio (null)", () => {
    expect(
      leituraDaForma({ data: [{ paymentMethod: "pix", movimentado: 300, meu: 0 }] }),
    ).toBeNull();
  });
});

describe("08 revisão · leituraDasBarras além da janela lida", () => {
  // Além do último mês lido a leitura não trouxe nada: o zero das barras não é um fato medido,
  // e a tabela lida em voz alta não pode dizer "R$ 0,00" ali (ausência nunca é zero).
  const dados = [
    { mes: "2026-05", entradas: 300, saidas: 120, saldo: 180, parcial: false },
    { mes: "2026-06", entradas: 0, saidas: 0, saldo: 0, parcial: false },
    { mes: "2026-07", entradas: 0, saidas: 0, saldo: 0, parcial: false },
  ];

  it("meses depois de ultimoMesLido dizem 'fora do período lido' em vez de valor", () => {
    const leitura = leituraDasBarras({
      dados,
      nomes: { entradas: "Entradas", saidas: "Saídas" },
      rotuloDoMes: mesAno,
      ultimoMesLido: "2026-05",
    });
    expect(leitura?.linhas).toEqual([
      { rotulo: "mês 2026-05", valores: [formatCurrency(300), formatCurrency(120)] },
      {
        rotulo: "mês 2026-06",
        valores: [{ ausente: "fora do período lido" }, { ausente: "fora do período lido" }],
      },
      {
        rotulo: "mês 2026-07",
        valores: [{ ausente: "fora do período lido" }, { ausente: "fora do período lido" }],
      },
    ]);
  });

  it("sem ultimoMesLido (base caixa), nenhum mês é marcado", () => {
    const leitura = leituraDasBarras({ dados, rotuloDoMes: mesAno });
    expect(leitura?.linhas.every((l) => l.valores.every((v) => typeof v === "string"))).toBe(true);
  });
});
