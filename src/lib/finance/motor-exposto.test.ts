/**
 * 04-B, Task 1 — o motor EXPÕE os classificadores que já usa, e o pipeline carrega os campos de
 * exibição. Nenhum número muda: o que se prova aqui é que a gaveta de registros (Task 2) lê da
 * mesma fonte que o número, e não de um filtro paralelo.
 *
 * Fixture SINTÉTICA: o repositório é público. Nomes e valores inventados.
 */
import { describe, expect, it } from "vitest";
import {
  ehEntradaDeConta,
  itensDeGasto,
  proximasContasPagar,
  vencimentosDasContas,
  type DashBill,
  type DashInstallmentItem,
  type DashStatement,
  type DashTx,
} from "@/lib/finance/dashboard";
import { classeDeCaixa, type TxDeCaixa } from "@/lib/finance/caixa";
import { montarEntradas, type LinhaParcela, type LinhaTx } from "@/lib/finance/pipeline";
import { reaisParaCentavos } from "@/lib/format";

const MES = "2026-03";

function tx(p: Partial<DashTx> = {}): DashTx {
  return {
    id: "t1",
    amount: 100,
    valor_pessoal: null,
    type: "receita",
    payment_method: null,
    status: "recebido",
    competence_date: `${MES}-10`,
    card_id: null,
    statement_id: null,
    parcelado: false,
    category_id: null,
    ...p,
  };
}

describe("ehEntradaDeConta", () => {
  it("receita de conta do mês é entrada", () => {
    expect(ehEntradaDeConta(tx(), MES)).toBe(true);
  });
  it("receita com cartão (estorno) não é entrada", () => {
    expect(ehEntradaDeConta(tx({ card_id: "c1" }), MES)).toBe(false);
  });
  it("cancelado não é entrada", () => {
    expect(ehEntradaDeConta(tx({ status: "cancelado" }), MES)).toBe(false);
  });
  it("outro mês não é entrada", () => {
    expect(ehEntradaDeConta(tx({ competence_date: "2026-02-10" }), MES)).toBe(false);
  });
  it("despesa não é entrada", () => {
    expect(ehEntradaDeConta(tx({ type: "despesa" }), MES)).toBe(false);
  });
});

describe("itensDeGasto", () => {
  const statements: DashStatement[] = [
    {
      id: "f1",
      card_id: "cartao-a",
      competencia: `${MES}-01`,
      data_fechamento: `${MES}-05`,
      data_vencimento: `${MES}-12`,
      pago_em: null,
      total_atual: 300,
    },
  ];
  const transactions: DashTx[] = [
    tx({
      id: "avista",
      type: "despesa",
      amount: 50,
      status: "pago",
      payment_method: "pix",
      descricao: "Compra A",
      data_compra: `${MES}-08`,
    }),
    tx({
      id: "cartao",
      type: "despesa",
      amount: 80,
      status: "pago",
      card_id: "cartao-a",
      statement_id: "f1",
      payment_method: "cartao_credito",
      descricao: "Compra B",
      data_compra: `${MES}-03`,
    }),
    tx({
      id: "pai",
      type: "despesa",
      amount: 1000,
      status: "pago",
      card_id: "cartao-a",
      parcelado: true,
      descricao: "Compra C",
    }),
  ];
  const installmentItems: DashInstallmentItem[] = [
    {
      id: "p3",
      statement_id: "f1",
      valor: 100,
      status: "ativa",
      parent: null,
      numero: 3,
      total_parcelas: 10,
      descricao: "Compra C",
    },
  ];

  const itens = itensDeGasto({ transactions, statements, installmentItems, receivables: [] });

  it("devolve três itens e deixa a compra-pai de fora", () => {
    expect(itens).toHaveLength(3);
    expect(itens.some((i) => i.txId === "pai")).toBe(false);
  });
  it("marca a origem de cada um", () => {
    expect(itens.map((i) => i.origem).sort()).toEqual(["avista", "cartao", "parcela"]);
  });
  it("a parcela carrega numero, total e descricao", () => {
    const p = itens.find((i) => i.origem === "parcela");
    expect(p).toMatchObject({
      installmentId: "p3",
      txId: null,
      numero: 3,
      totalParcelas: 10,
      descricao: "Compra C",
      data: null,
      movCent: 10000,
    });
  });
  it("à vista e cartão carregam descricao e data (compra, senão competência)", () => {
    expect(itens.find((i) => i.origem === "avista")).toMatchObject({
      txId: "avista",
      descricao: "Compra A",
      data: `${MES}-08`,
      numero: null,
      totalParcelas: null,
    });
    expect(itens.find((i) => i.origem === "cartao")).toMatchObject({
      txId: "cartao",
      statementId: "f1",
      descricao: "Compra B",
      data: `${MES}-03`,
    });
  });
  it("sem data_compra, a data é a competência do lançamento", () => {
    const [um] = itensDeGasto({
      transactions: [tx({ type: "despesa", status: "pago", id: "x" })],
      statements: [],
      installmentItems: [],
      receivables: [],
    });
    expect(um.data).toBe(`${MES}-10`);
  });
});

describe("vencimentosDasContas × proximasContasPagar", () => {
  const bills: DashBill[] = [
    { name: "Conta A", amount: 120.5, due_day: 20, is_active: true },
    { name: "Conta B", amount: 33.33, due_day: 25, is_active: true },
    { name: "Conta C", amount: 99, due_day: 22, is_active: false },
  ];
  it("o total é a soma dos vencimentos, em centavos", () => {
    const venc = vencimentosDasContas({ hoje: `${MES}-15`, bills });
    const total = proximasContasPagar({ hoje: `${MES}-15`, bills });
    expect(venc.map((v) => v.nome)).toEqual(["Conta A", "Conta B"]);
    expect(reaisParaCentavos(total.total)).toBe(
      venc.reduce((s, v) => s + reaisParaCentavos(v.valor), 0),
    );
    expect(total.count).toBe(venc.length);
  });
});

describe("classeDeCaixa", () => {
  function c(p: Partial<TxDeCaixa> = {}): TxDeCaixa {
    return {
      id: "k1",
      type: "despesa",
      status: "pago",
      amount: 10,
      valor_pessoal: null,
      competence_date: `${MES}-10`,
      liquidado_em: `${MES}-10`,
      account_id: "conta-a",
      transfer_account_id: null,
      card_id: null,
      ...p,
    };
  }
  const nenhum = new Set<string>();
  it("uma linha por classe", () => {
    expect(classeDeCaixa(c({ type: "receita" }), nenhum)).toBe("renda");
    expect(classeDeCaixa(c(), nenhum)).toBe("despesa");
    expect(classeDeCaixa(c({ id: "pg", type: "transferencia" }), new Set(["pg"]))).toBe("fatura");
    expect(classeDeCaixa(c({ type: "transferencia" }), nenhum)).toBe("sem-vinculo");
    expect(
      classeDeCaixa(c({ type: "transferencia", transfer_account_id: "conta-b" }), nenhum),
    ).toBe("entre-contas");
    expect(classeDeCaixa(c({ account_id: null }), nenhum)).toBe("sem-conta");
    expect(classeDeCaixa(c({ type: "receita", account_id: null }), nenhum)).toBe("sem-conta");
    expect(classeDeCaixa(c({ type: "transferencia", account_id: null }), nenhum)).toBe(
      "sem-conta",
    );
    expect(classeDeCaixa(c({ type: "ajuste" }), nenhum)).toBe("fora");
    expect(classeDeCaixa(c({ card_id: "cartao-a" }), nenhum)).toBe("fora");
    expect(classeDeCaixa(c({ type: "receita", card_id: "cartao-a" }), nenhum)).toBe("fora");
  });
});

describe("montarEntradas copia os campos de exibição", () => {
  const linhaTx: LinhaTx = {
    id: "t1",
    amount: 10,
    type: "despesa",
    status: "pago",
    competence_date: `${MES}-10`,
    valor_pessoal: null,
    payment_method: "pix",
    card_id: null,
    statement_id: null,
    parcelado: false,
    category_id: null,
    category: null,
    account_id: null,
    description: "Compra A",
    purchase_date: `${MES}-08`,
  };
  const linhaParcela: LinhaParcela = {
    id: "p1",
    statement_id: "f1",
    valor: 20,
    status: "ativa",
    numero: 4,
    total_parcelas: 12,
    parent: { description: "Compra C", category: null },
  };
  it("transação: description e purchase_date", () => {
    const { txs } = montarEntradas({ transacoes: [linhaTx] });
    expect(txs[0]).toMatchObject({ descricao: "Compra A", data_compra: `${MES}-08` });
  });
  it("parcela: numero, total_parcelas e a descrição da compra-pai", () => {
    const { inst } = montarEntradas({ parcelas: [linhaParcela] });
    expect(inst[0]).toMatchObject({ numero: 4, total_parcelas: 12, descricao: "Compra C" });
  });
  it("parent embutido como lista também chega", () => {
    const { inst } = montarEntradas({
      parcelas: [{ ...linhaParcela, parent: [{ description: "Compra D", category: null }] }],
    });
    expect(inst[0].descricao).toBe("Compra D");
  });
});
