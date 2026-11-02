import { describe, expect, it } from "vitest";
import {
  type CategoriaSlice,
  type DashInstallmentItem,
  type DashReceivable,
  type DashStatement,
  type DashTx,
  type EvolucaoPonto,
  type FaturaProvisao,
  variacaoPct,
} from "@/lib/finance/dashboard";
import {
  aReceberPorPessoa,
  comparacaoDosIndicadores,
  dadosDaRosca,
  dadosDasBarras,
  estornosDoCartaoNoMes,
  faturaAtualDoCartao,
  foraDaRosca,
  indicadorMinhasEntradas,
  pendenteAoBanco,
  saldoComData,
  sentidoDaVariacao,
  valorDaFatura,
} from "@/lib/finance/painel";
import { totalPendenteAte } from "@/lib/finance/recebimentos";
import { formatCurrency, reaisParaCentavos } from "@/lib/format";
import { termosProibidosEm } from "@/lib/tone/vocabulary";

/* ───────────────────────────── K1 — Minhas entradas ───────────────────────────── */

describe("indicadorMinhasEntradas", () => {
  it("o valor é a minha parte, e a linha de terceiros traz o resto", () => {
    const r = indicadorMinhasEntradas({ entradasMeu: 1000, entradasTerceiros: 250 });
    expect(r.valor).toBe(1000);
    expect(r.linhaDeTerceiros).toBe(`+ ${formatCurrency(250)} de terceiros`);
    expect(r.linhaDeTerceiros).toContain("250,00");
  });

  it("sem terceiros em centavos, não há linha", () => {
    const r = indicadorMinhasEntradas({ entradasMeu: 1000, entradasTerceiros: 0.004 });
    expect(r.valor).toBe(1000);
    expect(r.linhaDeTerceiros).toBeNull();
    expect(indicadorMinhasEntradas({ entradasMeu: 0, entradasTerceiros: 0 }).linhaDeTerceiros).toBeNull();
  });
});

/* ───────────────────────────── K2 — Saldo com data ───────────────────────────── */

describe("saldoComData", () => {
  it("rotula com a data de hoje e explica a diferença para a view", () => {
    const r = saldoComData({ saldoAte: 900, saldoDaView: 1000, hoje: "2026-11-18" });
    expect(r.rotulo).toBe("Saldo das contas · em 18/11");
    expect(r.valor).toBe(900);
    expect(r.diferenca).toBe(
      `não inclui lançamentos pagos com data futura (diferença de ${formatCurrency(100)})`,
    );
  });

  it("saldo até hoje igual ao da view: sem linha de diferença", () => {
    const r = saldoComData({ saldoAte: 1000, saldoDaView: 1000, hoje: "2026-11-18" });
    expect(r.valor).toBe(1000);
    expect(r.diferenca).toBeNull();
  });

  it("diferença menor que um centavo não vira linha", () => {
    expect(saldoComData({ saldoAte: 1000, saldoDaView: 1000.004, hoje: "2026-11-18" }).diferenca).toBeNull();
  });

  it("leitura que falhou: sem número e sem diferença", () => {
    const r = saldoComData({ saldoAte: null, saldoDaView: 1000, hoje: "2026-11-18" });
    expect(r.valor).toBeNull();
    expect(r.diferenca).toBeNull();
    expect(r.rotulo).toBe("Saldo das contas · em 18/11");
  });
});

/* ───────────────────────────── Sentido e comparação ───────────────────────────── */

describe("sentidoDaVariacao", () => {
  it("entrada que sobe é boa; que cai é ruim", () => {
    expect(sentidoDaVariacao("entrada", 10, false)).toBe("bom");
    expect(sentidoDaVariacao("entrada", -10, false)).toBe("ruim");
  });

  it("saída fechada que sobe é ruim; que cai é boa", () => {
    expect(sentidoDaVariacao("saida", 10, false)).toBe("ruim");
    expect(sentidoDaVariacao("saida", -10, false)).toBe("bom");
  });

  it("saída de mês em andamento não ganha cor", () => {
    expect(sentidoDaVariacao("saida", 10, true)).toBe("neutro");
    expect(sentidoDaVariacao("saida", -10, true)).toBe("neutro");
  });

  it("sem base ou sem variação é neutro", () => {
    expect(sentidoDaVariacao("entrada", null, false)).toBe("neutro");
    expect(sentidoDaVariacao("saida", null, false)).toBe("neutro");
    expect(sentidoDaVariacao("entrada", 0, false)).toBe("neutro");
    expect(sentidoDaVariacao("saida", 0, false)).toBe("neutro");
  });
});

describe("comparacaoDosIndicadores", () => {
  const dados = {
    anterior: { entradas: 1000, saidas: 400 },
    atual: { entradas: 1100, saidas: 500 },
  };

  it("competência até o dia 18: saídas só do à vista e sem cor", () => {
    const r = comparacaoDosIndicadores({ dados, ateODia: 18, base: "competencia" });
    expect(r.saidas.sentido).toBe("neutro");
    expect(r.saidas.texto).toBe("só o à vista, até o dia 18, vs. mês anterior");
    expect(r.entradas.texto).toBe("até o dia 18 vs. mês anterior");
    expect(r.entradas.sentido).toBe("bom");
  });

  it("caixa em andamento: saídas sem cor e o mesmo texto das entradas", () => {
    const r = comparacaoDosIndicadores({ dados, ateODia: 18, base: "caixa" });
    expect(r.saidas.sentido).toBe("neutro");
    expect(r.saidas.texto).toBe("até o dia 18 vs. mês anterior");
    expect(r.entradas.texto).toBe("até o dia 18 vs. mês anterior");
  });

  it("revisão final: mês futuro não ganha cor — só o que já está lançado", () => {
    for (const base of ["competencia", "caixa"] as const) {
      const r = comparacaoDosIndicadores({ dados, ateODia: null, base, futuro: true });
      expect(r.entradas.sentido).toBe("neutro");
      expect(r.saidas.sentido).toBe("neutro");
      expect(r.entradas.texto).toBe("mês futuro: só o que já está lançado");
      expect(r.saidas.texto).toBe("mês futuro: só o que já está lançado");
    }
  });

  it("mês fora do andamento: texto simples e a seta de saídas ganha cor", () => {
    for (const base of ["competencia", "caixa"] as const) {
      const r = comparacaoDosIndicadores({ dados, ateODia: null, base });
      expect(r.entradas.texto).toBe("vs. mês anterior");
      expect(r.saidas.texto).toBe("vs. mês anterior");
      expect(r.saidas.sentido).toBe("ruim");
      expect(r.entradas.sentido).toBe("bom");
    }
  });

  it("o pct é o variacaoPct do motor", () => {
    const r = comparacaoDosIndicadores({ dados, ateODia: null, base: "competencia" });
    expect(r.entradas.pct).toBe(variacaoPct(1100, 1000));
    expect(r.saidas.pct).toBe(variacaoPct(500, 400));
  });

  it("anterior zerado: sem base de comparação, em qualquer recorte", () => {
    const semBase = {
      anterior: { entradas: 0, saidas: 0 },
      atual: { entradas: 100, saidas: 50 },
    };
    for (const ateODia of [18, null]) {
      const r = comparacaoDosIndicadores({ dados: semBase, ateODia, base: "competencia" });
      expect(r.entradas.pct).toBeNull();
      expect(r.saidas.pct).toBeNull();
      expect(r.entradas.texto).toBe("sem base de comparação");
      expect(r.saidas.texto).toBe("sem base de comparação");
      expect(r.entradas.sentido).toBe("neutro");
      expect(r.saidas.sentido).toBe("neutro");
    }
  });
});

/* ───────────────────────────── A receber por pessoa (D-A-14) ───────────────────────────── */

describe("aReceberPorPessoa", () => {
  const A = { id: "pessoa-a", nome: "Pessoa A" };
  const B = { id: "pessoa-b", nome: "Pessoa B" };
  const corte = "2026-11-18";

  const recs = [
    { valor: 100, status: "pendente", recebimentos: [], person: A },
    // Recebimento DEPOIS do corte: no corte ainda era pendente por inteiro.
    {
      valor: 200,
      status: "pendente",
      recebimentos: [{ valor: 80, recebido_em: "2026-11-20" }],
      person: A,
    },
    {
      valor: 50,
      status: "pendente",
      recebimentos: [{ valor: 20, recebido_em: "2026-11-10" }],
      person: B,
    },
    { valor: 40, status: "pendente", recebimentos: [], person: null },
    // Quitado antes do corte: pendente 0 → não aparece.
    {
      valor: 70,
      status: "pago",
      recebimentos: [{ valor: 70, recebido_em: "2026-11-05" }],
      person: { id: "pessoa-c", nome: "Pessoa C" },
    },
  ];

  it("recebimento depois do corte ainda conta como pendente", () => {
    const r = aReceberPorPessoa(recs, corte);
    expect(r.find((x) => x.pessoaId === "pessoa-a")?.pendente).toBe(300);
    expect(r.find((x) => x.pessoaId === "pessoa-b")?.pendente).toBe(30);
  });

  it("a soma por pessoa é o totalPendenteAte, por construção", () => {
    const r = aReceberPorPessoa(recs, corte);
    const soma = r.reduce((s, x) => s + reaisParaCentavos(x.pendente), 0);
    expect(soma).toBe(reaisParaCentavos(totalPendenteAte(recs, corte)));
    expect(soma).toBe(37000);
  });

  it("sem pessoa vira 'Sem pessoa'; quem tem zero não aparece; ordem por pendente decrescente", () => {
    const r = aReceberPorPessoa(recs, corte);
    expect(r.map((x) => x.nome)).toEqual(["Pessoa A", "Sem pessoa", "Pessoa B"]);
    expect(r.find((x) => x.nome === "Sem pessoa")?.pessoaId).toBeNull();
    expect(r.some((x) => x.pessoaId === "pessoa-c")).toBe(false);
  });

  it("lista vazia devolve lista vazia", () => {
    expect(aReceberPorPessoa([], corte)).toEqual([]);
  });
});

/* ───────────────────────────── Estornos do cartão e rosca (D-A-11) ───────────────────────────── */

describe("estornosDoCartaoNoMes", () => {
  const statements: DashStatement[] = [
    {
      id: "f-nov",
      card_id: "cartao-a",
      competencia: "2026-11-01",
      data_fechamento: "2026-11-10",
      data_vencimento: "2026-11-18",
      pago_em: null,
      total_atual: 250,
    },
    {
      id: "f-dez",
      card_id: "cartao-a",
      competencia: "2026-12-01",
      data_fechamento: "2026-12-10",
      data_vencimento: "2026-12-18",
      pago_em: null,
      total_atual: 80,
    },
  ];

  const base = {
    id: "t",
    valor_pessoal: null,
    payment_method: "cartao_credito" as const,
    status: "pago" as const,
    card_id: "cartao-a",
    parcelado: false,
    category_id: "cat-a",
    category: { id: "cat-a", name: "Categoria A", color: "#112233" },
  };

  const transactions: DashTx[] = [
    { ...base, id: "t1", amount: 300, type: "despesa", competence_date: "2026-11-03", statement_id: "f-nov" },
    // Estorno de 50 na fatura de novembro.
    { ...base, id: "t2", amount: 50, type: "receita", competence_date: "2026-11-04", statement_id: "f-nov" },
    // Estorno de 20 na fatura de dezembro: não conta em novembro.
    { ...base, id: "t3", amount: 20, type: "receita", competence_date: "2026-12-04", statement_id: "f-dez" },
    { ...base, id: "t4", amount: 100, type: "despesa", competence_date: "2026-12-03", statement_id: "f-dez" },
  ];

  const parcelas: DashInstallmentItem[] = [];
  const receivables: DashReceivable[] = [];

  it("soma só o estorno da fatura do mês, como valor positivo da minha parte", () => {
    expect(
      estornosDoCartaoNoMes({
        mes: "2026-11",
        transactions,
        statements,
        installmentItems: parcelas,
        receivables,
      }),
    ).toBe(50);
    expect(
      estornosDoCartaoNoMes({
        mes: "2026-12",
        transactions,
        statements,
        installmentItems: parcelas,
        receivables,
      }),
    ).toBe(20);
  });

  it("mês sem estorno devolve 0", () => {
    expect(
      estornosDoCartaoNoMes({
        mes: "2026-10",
        transactions,
        statements,
        installmentItems: parcelas,
        receivables,
      }),
    ).toBe(0);
  });

  it("o estorno entra pela minha parte (valor_pessoal), não pelo valor cheio", () => {
    const comPartilha = transactions.map((t) => (t.id === "t2" ? { ...t, valor_pessoal: 30 } : t));
    expect(
      estornosDoCartaoNoMes({
        mes: "2026-11",
        transactions: comPartilha,
        statements,
        installmentItems: parcelas,
        receivables,
      }),
    ).toBe(30);
  });

  it("estorno cancelado não conta", () => {
    const cancelado = transactions.map((t) => (t.id === "t2" ? { ...t, status: "cancelado" as const } : t));
    expect(
      estornosDoCartaoNoMes({
        mes: "2026-11",
        transactions: cancelado,
        statements,
        installmentItems: parcelas,
        receivables,
      }),
    ).toBe(0);
  });
});

describe("dadosDaRosca e foraDaRosca", () => {
  const fatia = (name: string, meu: number): CategoriaSlice => ({
    categoryId: name,
    name,
    color: null,
    movimentado: meu,
    meu,
  });

  it("a rosca só tem fatias com minha parte positiva", () => {
    const r = dadosDaRosca([fatia("Categoria A", 0), fatia("Categoria B", -20), fatia("Categoria C", 100)]);
    expect(r.map((f) => f.name)).toEqual(["Categoria C"]);
  });

  it("fatia de menos de um centavo não entra na rosca", () => {
    expect(dadosDaRosca([fatia("Categoria A", 0.004)])).toEqual([]);
  });

  it("conta o que ficou de fora e os estornos do cartão", () => {
    const r = foraDaRosca(
      [fatia("Categoria A", 0), fatia("Categoria B", -20), fatia("Categoria C", 100)],
      50,
    );
    expect(r.quantidade).toBe(2);
    expect(r.soma).toBe(-20);
    expect(r.estornos).toBe(50);
    expect(r.frase).toContain("estornos do cartão");
    expect(r.frase).toContain("50,00");
    expect(r.frase).toContain("20,00");
    expect(termosProibidosEm(r.frase ?? "")).toEqual([]);
  });

  it("zero conta como fora da rosca", () => {
    const r = foraDaRosca([fatia("Categoria A", 0), fatia("Categoria C", 100)], 0);
    expect(r.quantidade).toBe(1);
    expect(r.soma).toBe(0);
    expect(r.frase).not.toBeNull();
    expect(r.frase).not.toContain("estornos");
  });

  it("só estorno, sem fatia fora: a frase fala só do estorno", () => {
    const r = foraDaRosca([fatia("Categoria C", 100)], 50);
    expect(r.quantidade).toBe(0);
    expect(r.frase).toContain("estornos do cartão");
  });

  it("tudo positivo e sem estorno: sem frase", () => {
    const r = foraDaRosca([fatia("Categoria A", 10), fatia("Categoria B", 20)], 0);
    expect(r).toEqual({ quantidade: 0, soma: 0, estornos: 0, frase: null });
  });

  it("a conciliação fecha: Σ fatias − estornos + não-positivos = minhas saídas", () => {
    const fatias = [fatia("Categoria A", 0), fatia("Categoria B", -20), fatia("Categoria C", 100)];
    const estornos = 50;
    const fora = foraDaRosca(fatias, estornos);
    const somaRosca = dadosDaRosca(fatias).reduce((s, f) => s + reaisParaCentavos(f.meu), 0);
    const total = somaRosca - reaisParaCentavos(estornos) + reaisParaCentavos(fora.soma);
    expect(total).toBe(reaisParaCentavos(100 - 50 - 20));
  });
});

/* ───────────────────────────── Barras ───────────────────────────── */

describe("dadosDasBarras", () => {
  const evolucao: EvolucaoPonto[] = [
    { mes: "2026-09", entradas: 1000, saidas: 800, saldo: 200 },
    { mes: "2026-10", entradas: 1200, saidas: 900, saldo: 300 },
    { mes: "2026-11", entradas: 600, saidas: 300, saldo: 300 },
  ];

  it("marca como parcial só o mês em andamento", () => {
    const r = dadosDasBarras(evolucao, "2026-11");
    expect(r.map((p) => p.parcial)).toEqual([false, false, true]);
  });

  it("revisão final: com um mês futuro selecionado, o mês em andamento e os seguintes são parciais", () => {
    const comFuturo: EvolucaoPonto[] = [
      ...evolucao,
      { mes: "2026-12", entradas: 0, saidas: 120, saldo: -120 },
    ];
    expect(dadosDasBarras(comFuturo, "2026-11").map((p) => p.parcial)).toEqual([false, false, true, true]);
  });

  it("sem mês em andamento, nenhuma barra é parcial", () => {
    expect(dadosDasBarras(evolucao, null).every((p) => p.parcial === false)).toBe(true);
  });

  it("mês fora da janela não marca nada", () => {
    expect(dadosDasBarras(evolucao, "2027-02").every((p) => p.parcial === false)).toBe(true);
  });

  it("os valores são idênticos aos de entrada", () => {
    const r = dadosDasBarras(evolucao, "2026-11");
    r.forEach((p, i) => {
      const { parcial, ...resto } = p;
      expect(parcial).toBeTypeOf("boolean");
      expect(resto).toEqual(evolucao[i]);
    });
  });
});

/* ───────────────────────────── Faturas ───────────────────────────── */

function fatura(p: Partial<FaturaProvisao> & Pick<FaturaProvisao, "cardId" | "competencia">): FaturaProvisao {
  return {
    cardNome: "Cartão A",
    cardCor: null,
    dataFechamento: "2026-11-10",
    dataVencimento: "2026-11-18",
    total: 100,
    meu: 100,
    terceiros: 0,
    status: "aberta",
    virtual: false,
    ...p,
  };
}

describe("valorDaFatura", () => {
  it("virtual e zerada: sem lançamentos conhecidos (null), não R$ 0,00", () => {
    expect(valorDaFatura(fatura({ cardId: "a", competencia: "2026-11-01", virtual: true, total: 0 }))).toBeNull();
  });

  it("virtual com total mostra o total", () => {
    expect(valorDaFatura(fatura({ cardId: "a", competencia: "2026-11-01", virtual: true, total: 310 }))).toBe(310);
  });

  it("real zerada é zero medido", () => {
    expect(valorDaFatura(fatura({ cardId: "a", competencia: "2026-11-01", virtual: false, total: 0 }))).toBe(0);
  });
});

describe("faturaAtualDoCartao", () => {
  it("é a primeira aberta do cartão, por competência", () => {
    const lista = [
      fatura({ cardId: "a", competencia: "2026-12-01", status: "aberta" }),
      fatura({ cardId: "a", competencia: "2026-10-01", status: "fechada" }),
      fatura({ cardId: "a", competencia: "2026-11-01", status: "aberta" }),
      fatura({ cardId: "b", competencia: "2026-09-01", status: "aberta" }),
    ];
    expect(faturaAtualDoCartao(lista, "a")?.competencia).toBe("2026-11-01");
    expect(faturaAtualDoCartao(lista, "b")?.competencia).toBe("2026-09-01");
  });

  it("sem aberta, a primeira virtual", () => {
    const lista = [
      fatura({ cardId: "a", competencia: "2026-10-01", status: "fechada" }),
      fatura({ cardId: "a", competencia: "2026-12-01", status: "aberta", virtual: true }),
      fatura({ cardId: "a", competencia: "2026-11-01", status: "aberta", virtual: true }),
    ];
    // As duas virtuais são "abertas" pelo status; a regra é a primeira por competência.
    expect(faturaAtualDoCartao(lista, "a")?.competencia).toBe("2026-11-01");
    const semAberta = [
      fatura({ cardId: "a", competencia: "2026-10-01", status: "fechada" }),
      fatura({ cardId: "a", competencia: "2026-12-01", status: "fechada", virtual: true }),
      fatura({ cardId: "a", competencia: "2026-11-01", status: "paga", virtual: true }),
    ];
    expect(faturaAtualDoCartao(semAberta, "a")?.competencia).toBe("2026-11-01");
  });

  it("sem nenhuma aberta nem virtual, ou sem o cartão: null", () => {
    const lista = [fatura({ cardId: "a", competencia: "2026-10-01", status: "fechada" })];
    expect(faturaAtualDoCartao(lista, "a")).toBeNull();
    expect(faturaAtualDoCartao(lista, "b")).toBeNull();
    expect(faturaAtualDoCartao([], "a")).toBeNull();
  });

  it("não altera a lista recebida", () => {
    const lista = [
      fatura({ cardId: "a", competencia: "2026-12-01" }),
      fatura({ cardId: "a", competencia: "2026-11-01" }),
    ];
    const copia = lista.map((f) => f.competencia);
    faturaAtualDoCartao(lista, "a");
    expect(lista.map((f) => f.competencia)).toEqual(copia);
  });
});

describe("pendenteAoBanco", () => {
  it("soma o total cheio das faturas reais ainda não pagas", () => {
    const lista = [
      fatura({ cardId: "a", competencia: "2026-10-01", status: "paga", total: 500 }),
      fatura({ cardId: "a", competencia: "2026-11-01", status: "fechada", total: 200.1 }),
      fatura({ cardId: "b", competencia: "2026-11-01", status: "atrasada", total: 100.2 }),
      fatura({ cardId: "a", competencia: "2026-12-01", status: "aberta", total: 50 }),
      // Virtual é previsão, não dívida.
      fatura({ cardId: "a", competencia: "2027-01-01", status: "aberta", total: 900, virtual: true }),
    ];
    expect(pendenteAoBanco(lista)).toBe(350.3);
  });

  it("sem faturas, zero", () => {
    expect(pendenteAoBanco([])).toBe(0);
  });
});

/* ───────────────────────────── Indicadores da base caixa (T6) ───────────────────────────── */

import type { EstadoDoCaixa } from "@/lib/finance/caixa-leitura";
import { indicadoresDoCaixa } from "@/lib/finance/painel";

describe("indicadoresDoCaixa", () => {
  // Só `graficos.minha` importa aqui; o resto do estado do caixa não é lido por esta função.
  const caixaOk = {
    estado: "ok",
    graficos: {
      minha: {
        entradas: 3000,
        saidas: 1200.5,
        saidasBrutas: 1500.5,
        terceirosNasSaidas: 300,
        resultado: 1799.5,
        faturasSemTotal: 0,
      },
    },
  } as unknown as EstadoDoCaixa;

  it("leitura do caixa com erro: os três indicadores levam o texto de erro, nunca um número", () => {
    const r = indicadoresDoCaixa({ estado: "erro" });
    const erro = { erro: "Não foi possível ler o caixa" };
    expect(r).toEqual({ entradas: erro, saidas: erro, terceiros: erro });
    for (const v of Object.values(r ?? {})) expect(typeof v).not.toBe("number");
  });

  it("caixa ok: os três números são os de graficos.minha", () => {
    expect(indicadoresDoCaixa(caixaOk)).toEqual({
      entradas: 3000,
      saidas: 1200.5,
      terceiros: 300,
    });
  });

  it("base competência (caixa nulo): não há indicador de caixa", () => {
    expect(indicadoresDoCaixa(null)).toBeNull();
  });
});
