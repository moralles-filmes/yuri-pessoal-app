/**
 * A parte MINHA da base caixa (desenho 2026-10-18, §4.2–§4.3): evolução, mês a mês e
 * categorias/formas pelo dia em que o dinheiro mexeu na conta, sem a parte de terceiros.
 * Fixtures sintéticas: ids curtos, nenhum nome real.
 */
import { describe, expect, it } from "vitest";
import type { DashReceivable, DashStatement, DashTx, DashInstallmentItem } from "@/lib/finance/dashboard";
import { numerosDoCaixa, type TxDeCaixa } from "@/lib/finance/caixa";
import {
  evolucaoDoCaixa,
  gastosDeCaixa,
  mesAMesDoCaixa,
  minhaParteDoCaixa,
  type MotorDoCaixa,
} from "@/lib/finance/caixa-minha-parte";

let seq = 0;
function tx(over: Partial<TxDeCaixa> = {}): TxDeCaixa {
  seq += 1;
  return {
    id: `t${seq}`,
    type: "despesa",
    status: "pago",
    amount: 100,
    valor_pessoal: null,
    competence_date: "2026-10-10",
    liquidado_em: "2026-10-10",
    account_id: "conta-a",
    transfer_account_id: null,
    card_id: null,
    ...over,
  };
}

const OUTUBRO = { de: "2026-10-01", ate: "2026-10-31" };
const CAT_A = { id: "A", name: "Mercado", color: null };
const CAT_B = { id: "B", name: "Restaurante", color: null };
const CAT_C = { id: "C", name: "Eletrônicos", color: null };

const fatura = (over: Partial<DashStatement> = {}): DashStatement => ({
  id: "st-out",
  card_id: "c1",
  competencia: "2026-09-01",
  data_fechamento: "2026-09-28",
  data_vencimento: "2026-10-05",
  pago_em: "2026-10-05",
  total_atual: 253.41,
  ...over,
});

const motorVazio = (over: Partial<MotorDoCaixa> = {}): MotorDoCaixa => ({
  statements: [],
  receivables: [],
  transactions: [],
  installmentItems: [],
  ...over,
});

/** Pagamento de fatura: transferência da conta, sem destino, ligada à fatura `st-out`. */
const pagamento = (amount: number, over: Partial<TxDeCaixa> = {}) =>
  tx({ id: "pag", type: "transferencia", amount, ...over });
const PAGAMENTOS = new Map([["pag", "st-out"]]);

const terceiroDaFatura: DashReceivable = {
  statement_id: "st-out",
  installment_id: null,
  valor: 126.7,
  status: "pendente",
};

describe("minhaParteDoCaixa — saídas", () => {
  it("fatura paga inteira entra só com a minha parte (253,41 − 126,70 = 126,71)", () => {
    const r = minhaParteDoCaixa({
      periodo: OUTUBRO,
      transactions: [pagamento(253.41)],
      pagamentos: PAGAMENTOS,
      motor: motorVazio({ statements: [fatura()], receivables: [terceiroDaFatura] }),
    });
    expect(r.saidas).toBe(126.71);
    expect(r.saidasBrutas).toBe(253.41);
    expect(r.terceirosNasSaidas).toBe(126.7);
    expect(r.faturasSemTotal).toBe(0);
  });

  it("fatura paga em parte: a mesma proporção, arredondada em centavos", () => {
    const r = minhaParteDoCaixa({
      periodo: OUTUBRO,
      transactions: [pagamento(100)],
      pagamentos: PAGAMENTOS,
      motor: motorVazio({ statements: [fatura()], receivables: [terceiroDaFatura] }),
    });
    expect(r.saidas).toBe(Math.round((10000 * 12671) / 25341) / 100);
  });

  it("fatura com total zero: o pagamento conta cheio como meu e é DECLARADO", () => {
    const r = minhaParteDoCaixa({
      periodo: OUTUBRO,
      transactions: [pagamento(80)],
      pagamentos: PAGAMENTOS,
      motor: motorVazio({ statements: [fatura({ total_atual: 0 })] }),
    });
    expect(r.saidas).toBe(80);
    expect(r.faturasSemTotal).toBe(1);
    expect(Number.isFinite(r.saidas)).toBe(true);
  });

  it("fatura que não veio na leitura: mesma regra (cheio + declarado)", () => {
    const r = minhaParteDoCaixa({
      periodo: OUTUBRO,
      transactions: [pagamento(80)],
      pagamentos: PAGAMENTOS,
      motor: motorVazio(),
    });
    expect(r.saidas).toBe(80);
    expect(r.faturasSemTotal).toBe(1);
  });

  it("despesa com conta: valor_pessoal + o perdoado dela (D11, nas duas bases)", () => {
    const despesa = tx({ id: "d1", amount: 100, valor_pessoal: 40 });
    const r = minhaParteDoCaixa({
      periodo: OUTUBRO,
      transactions: [despesa],
      pagamentos: new Map(),
      motor: motorVazio({
        receivables: [
          { transaction_id: "d1", statement_id: null, installment_id: null, valor: 60, status: "ignorado", recebido: 0 },
        ],
      }),
    });
    expect(r.saidas).toBe(100);
  });

  it("transferência sem vínculo conta cheia", () => {
    const r = minhaParteDoCaixa({
      periodo: OUTUBRO,
      transactions: [tx({ type: "transferencia", amount: 70 })],
      pagamentos: new Map(),
      motor: motorVazio(),
    });
    expect(r.saidas).toBe(70);
  });

  it("saidasBrutas é exatamente as saídas de caixa de numerosDoCaixa", () => {
    const transactions = [
      pagamento(253.41),
      tx({ amount: 100, valor_pessoal: 40 }),
      tx({ type: "transferencia", amount: 70 }),
      tx({ card_id: "c1", account_id: null, amount: 999 }), // compra no cartão: não é saída de caixa
      tx({ type: "transferencia", amount: 500, transfer_account_id: "conta-b" }), // entre contas
    ];
    const r = minhaParteDoCaixa({
      periodo: OUTUBRO,
      transactions,
      pagamentos: PAGAMENTOS,
      motor: motorVazio({ statements: [fatura()], receivables: [terceiroDaFatura] }),
    });
    const n = numerosDoCaixa({
      periodo: OUTUBRO,
      transactions,
      pagamentosDeFatura: new Set(PAGAMENTOS.keys()),
      recebiveis: [],
    });
    expect(r.saidasBrutas).toBe(n.saidasDeCaixa);
    expect(r.saidas).toBe(236.71); // 126,71 + 40 + 70
  });
});

describe("minhaParteDoCaixa — entradas e resultado", () => {
  it("entradas = só a renda pessoal (a parte de terceiros e o reembolso ficam fora)", () => {
    const r = minhaParteDoCaixa({
      periodo: OUTUBRO,
      transactions: [
        tx({ type: "receita", status: "recebido", amount: 1000, valor_pessoal: 300 }),
        tx({ amount: 100 }),
      ],
      pagamentos: new Map(),
      motor: motorVazio(),
    });
    expect(r.entradas).toBe(300);
    expect(r.resultado).toBe(200);
  });
});

describe("evolucaoDoCaixa", () => {
  it("um ponto por mês cheio, pela data de caixa", () => {
    const ev = evolucaoDoCaixa({
      meses: ["2026-09", "2026-10"],
      transactions: [
        tx({ amount: 50, liquidado_em: "2026-09-20", competence_date: "2026-09-20" }),
        tx({ type: "receita", status: "recebido", amount: 400, liquidado_em: "2026-10-02" }),
        pagamento(253.41),
      ],
      pagamentos: PAGAMENTOS,
      motor: motorVazio({ statements: [fatura()], receivables: [terceiroDaFatura] }),
    });
    expect(ev).toEqual([
      { mes: "2026-09", entradas: 0, saidas: 50, saldo: -50 },
      { mes: "2026-10", entradas: 400, saidas: 126.71, saldo: 273.29 },
    ]);
  });
});

describe("mesAMesDoCaixa", () => {
  const transactions = [
    tx({ amount: 30, liquidado_em: "2026-09-10", competence_date: "2026-09-10" }),
    tx({ amount: 20, liquidado_em: "2026-09-25", competence_date: "2026-09-25" }),
    tx({ amount: 10, liquidado_em: "2026-10-05" }),
    tx({ amount: 5, liquidado_em: "2026-10-25" }),
  ];

  it("mês fechado: o mês cheio contra o anterior cheio", () => {
    const r = mesAMesDoCaixa({ mes: "2026-10", hoje: "2026-11-02", transactions, pagamentos: new Map(), motor: motorVazio() });
    expect(r.ateODia).toBeNull();
    expect(r.dados).toEqual({ anterior: { entradas: 0, saidas: 50 }, atual: { entradas: 0, saidas: 15 } });
  });

  it("mês em andamento: os dois lados cortados no mesmo dia", () => {
    const r = mesAMesDoCaixa({ mes: "2026-10", hoje: "2026-10-18", transactions, pagamentos: new Map(), motor: motorVazio() });
    expect(r.ateODia).toBe(18);
    expect(r.dados).toEqual({ anterior: { entradas: 0, saidas: 30 }, atual: { entradas: 0, saidas: 10 } });
  });
});

describe("gastosDeCaixa — categorias e formas", () => {
  const dashTx = (over: Partial<DashTx>): DashTx => ({
    amount: 0,
    valor_pessoal: null,
    type: "despesa",
    payment_method: "cartao_credito",
    status: "pago",
    competence_date: "2026-09-15",
    card_id: "c1",
    statement_id: "st-out",
    parcelado: false,
    category_id: null,
    category: null,
    ...over,
  });
  const compraB = dashTx({ id: "cB", amount: 200, valor_pessoal: 150, category_id: "B", category: CAT_B });
  const parcelaC: DashInstallmentItem = {
    id: "it1",
    statement_id: "st-out",
    valor: 53.41,
    status: "ativa",
    parent: { category: CAT_C },
  };
  const recs: DashReceivable[] = [
    { statement_id: "st-out", installment_id: null, valor: 50, status: "pendente" },
    { statement_id: "st-out", installment_id: "it1", valor: 26.7, status: "pendente" },
  ];
  const motor = (over: Partial<MotorDoCaixa> = {}) =>
    motorVazio({
      statements: [fatura()],
      receivables: recs,
      transactions: [compraB],
      installmentItems: [parcelaC],
      ...over,
    });
  const aVista = tx({ amount: 100, valor_pessoal: 40, payment_method: "pix", category: CAT_A });

  const meuDe = (cats: { categoryId: string | null; meu: number }[], id: string | null) =>
    cats.find((c) => c.categoryId === id)?.meu;
  const soma = (xs: { meu: number }[]) => Math.round(xs.reduce((s, x) => s + x.meu * 100, 0)) / 100;

  it("a fatura paga se abre pelas compras dela, cada uma na sua categoria, só a minha parte", () => {
    const g = gastosDeCaixa({ periodo: OUTUBRO, transactions: [aVista, pagamento(253.41)], pagamentos: PAGAMENTOS, motor: motor() });
    expect(meuDe(g.categorias, "A")).toBe(40);
    expect(meuDe(g.categorias, "B")).toBe(150);
    expect(meuDe(g.categorias, "C")).toBe(26.71);
    expect(g.categorias.find((c) => c.categoryId === "B")?.movimentado).toBe(200);
    expect(g.formas.find((f) => f.paymentMethod === "cartao_credito")?.meu).toBe(176.71);
    expect(g.formas.find((f) => f.paymentMethod === "pix")?.meu).toBe(40);
  });

  it("Σ das categorias (meu) fecha com as minhas saídas de caixa", () => {
    const transactions = [aVista, pagamento(100), tx({ type: "transferencia", amount: 70 })];
    const g = gastosDeCaixa({ periodo: OUTUBRO, transactions, pagamentos: PAGAMENTOS, motor: motor() });
    const m = minhaParteDoCaixa({ periodo: OUTUBRO, transactions, pagamentos: PAGAMENTOS, motor: motor() });
    expect(soma(g.categorias)).toBe(m.saidas);
    expect(soma(g.formas)).toBe(m.saidas);
    expect(meuDe(g.categorias, "__sem_vinculo__")).toBe(70);
  });

  it("estorno de cartão entra negativo na categoria dele e a conta fecha", () => {
    const estorno = dashTx({ id: "e1", type: "receita", status: "recebido", amount: 20, category_id: "B", category: CAT_B });
    const transactions = [pagamento(233.41)];
    const m2 = motor({ statements: [fatura({ total_atual: 233.41 })], transactions: [compraB, estorno] });
    const g = gastosDeCaixa({ periodo: OUTUBRO, transactions, pagamentos: PAGAMENTOS, motor: m2 });
    expect(meuDe(g.categorias, "B")).toBe(130);
    expect(meuDe(g.categorias, "__diferenca_fatura__")).toBeUndefined();
    expect(soma(g.categorias)).toBe(minhaParteDoCaixa({ periodo: OUTUBRO, transactions, pagamentos: PAGAMENTOS, motor: m2 }).saidas);
  });

  it("o que não fecha vira a fatia visível 'Diferença da fatura'", () => {
    const compraDesalinhada = { ...compraB, valor_pessoal: 160 };
    const transactions = [pagamento(253.41)];
    const m2 = motor({ transactions: [compraDesalinhada] });
    const g = gastosDeCaixa({ periodo: OUTUBRO, transactions, pagamentos: PAGAMENTOS, motor: m2 });
    const dif = g.categorias.find((c) => c.categoryId === "__diferenca_fatura__");
    expect(dif?.name).toBe("Diferença da fatura");
    expect(dif?.meu).toBe(-10);
    expect(soma(g.categorias)).toBe(176.71);
  });

  it("fatura sem total: o pagamento vira a fatia 'Fatura sem detalhe'", () => {
    const g = gastosDeCaixa({
      periodo: OUTUBRO,
      transactions: [pagamento(80)],
      pagamentos: PAGAMENTOS,
      motor: motor({ statements: [fatura({ total_atual: 0 })] }),
    });
    expect(g.categorias).toEqual([
      expect.objectContaining({ categoryId: "__fatura_sem_detalhe__", name: "Fatura sem detalhe", meu: 80 }),
    ]);
  });
});
