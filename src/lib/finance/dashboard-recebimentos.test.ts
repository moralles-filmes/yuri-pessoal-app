/**
 * REDESIGN-03-D · B1a/B4 — o recebimento e o perdoado no motor. Fixture sintética (§9).
 */
import { describe, expect, it } from "vitest";
import {
  gastosPorCategoria,
  perdoadoDoMes,
  proximas6Faturas,
  resumoMes,
  totalAReceber,
  type DashReceivable,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";

const MES = "2026-06";
const st = (over: Partial<DashStatement> = {}): DashStatement => ({
  id: "st-9", card_id: "card-9", competencia: "2026-06-01", data_fechamento: "2026-06-10",
  data_vencimento: "2026-06-20", pago_em: null, total_atual: 1000, ...over,
});
const rec = (over: Partial<DashReceivable> = {}): DashReceivable => ({
  statement_id: "st-9", installment_id: null, valor: 600, status: "pendente", transaction_id: null, recebido: 0, ...over,
});
const tx = (over: Partial<DashTx> = {}): DashTx => ({
  id: "tx-av", amount: 1000, valor_pessoal: 400, type: "despesa", payment_method: "pix", status: "pago",
  competence_date: "2026-06-15", card_id: null, statement_id: null, parcelado: false, category_id: null, category: null, ...over,
});
const resumo = (receivables: DashReceivable[], transactions: DashTx[] = []) =>
  resumoMes({ mes: MES, transactions, statements: transactions.length ? [] : [st()], receivables });

describe("B1a — D11: o perdoado vira despesa minha", () => {
  it("ignorado sem recebimento: 400/600 → 1000/0, perdoado 600", () => {
    const r = resumo([rec({ status: "ignorado" })]);
    expect([r.cartaoMeu, r.terceiros]).toEqual([1000, 0]);
    expect(perdoadoDoMes({ mes: MES, transactions: [], statements: [st()], receivables: [rec({ status: "ignorado" })] })).toBe(600);
  });

  it("ignorado com 250 recebidos (K3-a): 750/250, perdoado 350", () => {
    const rs = [rec({ status: "ignorado", recebido: 250 })];
    const r = resumo(rs);
    expect([r.cartaoMeu, r.terceiros]).toEqual([750, 250]);
    expect(perdoadoDoMes({ mes: MES, transactions: [], statements: [st()], receivables: rs })).toBe(350);
  });

  it.each(["pendente", "cobrado", "pago"])("%s com recebimento parcial continua 400/600 (D3)", (status) => {
    const r = resumo([rec({ status, recebido: 250 })]);
    expect([r.cartaoMeu, r.terceiros]).toEqual([400, 600]);
  });

  it("à vista em conta: ignorado vinculado pelo transaction_id sobe a minha parte 400 → 1000", () => {
    const transacoes = [tx()];
    const recs = [rec({ statement_id: null, transaction_id: "tx-av", status: "ignorado" })];
    const r = resumoMes({ mes: MES, transactions: transacoes, statements: [], receivables: recs });
    expect(r.aVistaMeu).toBe(1000);
    expect(perdoadoDoMes({ mes: MES, transactions: transacoes, statements: [], receivables: recs })).toBe(600);
    const [fatia] = gastosPorCategoria({ mes: MES, transactions: transacoes, statements: [], installmentItems: [], receivables: recs });
    expect(fatia.meu).toBe(1000);
  });

  it("perdoadoDoMes conta só o do mês: fatura de outro mês, à vista de outro mês e lançamento cancelado ficam de fora", () => {
    const transacoes = [
      tx(),
      tx({ id: "tx-julho", competence_date: "2026-07-15" }),
      tx({ id: "tx-cancelado", status: "cancelado" }),
    ];
    const recs = [
      rec({ valor: 100, status: "ignorado" }),
      rec({ statement_id: "st-7", valor: 200, status: "ignorado" }),
      rec({ statement_id: null, transaction_id: "tx-av", valor: 300, status: "ignorado" }),
      rec({ statement_id: null, transaction_id: "tx-julho", valor: 400, status: "ignorado" }),
      rec({ statement_id: null, transaction_id: "tx-cancelado", valor: 500, status: "ignorado" }),
    ];
    const statements = [st(), st({ id: "st-7", competencia: "2026-07-01" })];
    // Só a fatura de junho (100) e o à vista de junho ativo (300).
    expect(perdoadoDoMes({ mes: MES, transactions: transacoes, statements, receivables: recs })).toBe(400);
  });

  it("parcela: ignorado sai do desconto da parcela", () => {
    const [fatia] = gastosPorCategoria({
      mes: MES, transactions: [], statements: [st()],
      installmentItems: [{ id: "inst", statement_id: "st-9", valor: 500, status: "ativa", parent: { category: { id: "c", name: "Categoria", color: null } } }],
      receivables: [rec({ statement_id: null, installment_id: "inst", valor: 100, status: "ignorado" })],
    });
    expect(fatia.meu).toBe(500);
  });

  it("próximas faturas: ignorado sai dos terceiros", () => {
    const [f] = proximas6Faturas({
      hoje: "2026-06-15",
      cards: [{ id: "card-9", nome: "Cartao", cor: null, limite_total: 1000, dia_fechamento: 10, dia_vencimento: 20 }],
      statements: [st({ competencia: "2026-07-01", total_atual: 500 })],
      receivables: [rec({ valor: 100, status: "ignorado" })],
      n: 1,
    });
    expect([f.meu, f.terceiros]).toEqual([500, 0]);
  });

  it("a conta fecha: saídas = meu + terceiros, e meu − perdoado = parte acordada", () => {
    const recs = [rec({ status: "ignorado", recebido: 250 }), rec({ valor: 100, status: "pendente" })];
    const efetiva = resumo(recs);
    expect(efetiva.saidas).toBe(efetiva.meu + efetiva.terceiros);
    const acordada = resumo(recs.map((r) => ({ ...r, status: r.status === "ignorado" ? "pendente" : r.status })));
    const perdoado = perdoadoDoMes({ mes: MES, transactions: [], statements: [st()], receivables: recs });
    expect(efetiva.meu - perdoado).toBeCloseTo(acordada.meu, 2);
  });

  it("sem ignorado e sem recebimento, nada muda (equivalência com o dado de hoje)", () => {
    for (const status of ["pendente", "cobrado", "pago"]) {
      const comCampos = resumo([rec({ status })]);
      const semCampos = resumo([{ statement_id: "st-9", installment_id: null, valor: 600, status }]);
      expect(comCampos).toEqual(semCampos);
    }
  });
});

describe("B4 — 'a receber' é o saldo", () => {
  it("totalAReceber: 600 com 250 recebidos → 350 (com e sem mês)", () => {
    const recs = [rec({ recebido: 250, ref_month: "2026-06" })];
    expect(totalAReceber(recs)).toBe(350);
    expect(totalAReceber(recs, "2026-06")).toBe(350);
  });

  it("D3 — o [1] do §9 COM recebimento parcial: minha despesa continua 400", () => {
    const r = resumo([rec({ recebido: 250 })]);
    expect([r.cartaoMeu, r.terceiros]).toEqual([400, 600]);
  });

  it("reembolso não é renda: entradas e entradasMeu não sobem com o recebido", () => {
    const r = resumo([rec({ recebido: 250 })]);
    expect([r.entradas, r.entradasMeu]).toEqual([0, 0]);
  });

  it("sem recebimento, o número é o de antes (equivalência com o dado de hoje)", () => {
    const recs = [
      rec({ status: "pendente", valor: 10.1 }),
      rec({ status: "cobrado", valor: 20.2 }),
      { statement_id: null, installment_id: null, valor: 30.3, status: "pago" },
      rec({ status: "ignorado", valor: 40.4 }),
    ];
    const antigo = recs
      .filter((r) => r.status === "pendente" || r.status === "cobrado")
      .reduce((s, r) => s + Math.round(r.valor * 100), 0) / 100;
    expect(totalAReceber(recs)).toBe(antigo);
  });
});
