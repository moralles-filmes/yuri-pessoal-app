import { describe, expect, it } from "vitest";
import {
  argumentosDoPagamento,
  descricaoPagamentoFatura,
  mensagemDoErroDoPagamento,
  montarPagamentoFatura,
  pagoEmTimestamp,
} from "@/lib/finance/statement-payment";
import { dateInSaoPaulo } from "@/lib/format";

describe("montarPagamentoFatura", () => {
  const base = {
    contaId: "11111111-1111-1111-1111-111111111111",
    total: 693.07,
    cartaoNome: "Nubank",
    competencia: "2026-07-01",
    dataPagamento: "2026-06-27",
  };

  it("é uma transferência paga, fora da fatura e dos relatórios", () => {
    const p = montarPagamentoFatura(base);
    expect(p.type).toBe("transferencia");
    expect(p.status).toBe("pago");
    expect(p.payment_method).toBe("transferencia");
    // Fora da fatura e do saldo de cartão: sem vínculo de cartão/fatura e sem 2ª perna.
    expect(p.card_id).toBeNull();
    expect(p.statement_id).toBeNull();
    expect(p.transfer_account_id).toBeNull();
    expect(p.transfer_group_id).toBeNull();
  });

  it("debita a conta escolhida pelo total cheio da fatura", () => {
    const p = montarPagamentoFatura(base);
    expect(p.account_id).toBe(base.contaId);
    expect(p.amount).toBe(693.07);
  });

  it("usa a data de pagamento injetada como compra e competência", () => {
    const p = montarPagamentoFatura(base);
    expect(p.purchase_date).toBe("2026-06-27");
    expect(p.competence_date).toBe("2026-06-27");
  });

  it("grava a data do pagamento como data de caixa (K0.2) e o status é pago", () => {
    const p = montarPagamentoFatura(base);
    expect(p.liquidado_em).toBe(base.dataPagamento);
    expect(p.status).toBe("pago");
  });

  it("aceita data retroativa (pagamento lançado depois, batendo com o extrato)", () => {
    const p = montarPagamentoFatura({ ...base, dataPagamento: "2026-06-10" });
    expect(p.purchase_date).toBe("2026-06-10");
    expect(p.competence_date).toBe("2026-06-10");
  });

  it("descreve o pagamento com o cartão e o ano da competência", () => {
    const desc = descricaoPagamentoFatura("Nubank", "2026-07-01");
    expect(desc).toContain("Pagamento fatura");
    expect(desc).toContain("Nubank");
    expect(desc).toContain("2026");
  });
});

describe("pagoEmTimestamp", () => {
  it("grava meio-dia UTC da data escolhida", () => {
    expect(pagoEmTimestamp("2031-01-10")).toBe("2031-01-10T12:00:00Z");
  });

  it("cai no mesmo dia do calendário em São Paulo", () => {
    expect(dateInSaoPaulo(new Date(pagoEmTimestamp("2031-01-10")))).toBe("2031-01-10");
  });
});

describe("argumentosDoPagamento", () => {
  it("entrega à RPC o MESMO lançamento recebido e o instante do pagamento", () => {
    const lancamento = montarPagamentoFatura({
      contaId: "11111111-1111-1111-1111-111111111111",
      total: 100,
      cartaoNome: "Cartão Sintético",
      competencia: "2031-01-01",
      dataPagamento: "2031-01-10",
    });
    const args = argumentosDoPagamento({
      statementId: "22222222-2222-2222-2222-222222222222",
      dataPagamento: "2031-01-10",
      lancamento,
    });
    expect(args.p_lancamento).toBe(lancamento);
    expect(args.p_pago_em).toBe("2031-01-10T12:00:00Z");
    expect(args.p_statement_id).toBe("22222222-2222-2222-2222-222222222222");
  });
});

describe("mensagemDoErroDoPagamento", () => {
  it("traduz os quatro códigos da RPC", () => {
    expect(mensagemDoErroDoPagamento({ message: "FATURA_JA_PAGA" })).toBe(
      "Esta fatura já está paga.",
    );
    expect(mensagemDoErroDoPagamento({ message: "FATURA_NAO_ENCONTRADA" })).toBe(
      "Fatura não encontrada.",
    );
    expect(mensagemDoErroDoPagamento({ message: "FATURA_SEM_SESSAO" })).toBe(
      "Sessão expirada. Faça login novamente.",
    );
    expect(mensagemDoErroDoPagamento({ message: "FATURA_PAGAMENTO_INVALIDO" })).toBe(
      "Não foi possível registrar o pagamento.",
    );
  });

  const incerto =
    "Não foi possível confirmar o pagamento. Recarregue a página para ver se ele foi registrado.";

  it("erro desconhecido não afirma que o pagamento falhou", () => {
    expect(mensagemDoErroDoPagamento({ message: "fetch failed" })).toBe(incerto);
  });

  it("não casa por substring", () => {
    expect(mensagemDoErroDoPagamento({ message: "xFATURA_JA_PAGA" })).toBe(incerto);
  });

  it("aceita erro nulo", () => {
    expect(mensagemDoErroDoPagamento(null)).toBe(incerto);
  });
});
