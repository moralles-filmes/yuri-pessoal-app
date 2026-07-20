import { describe, expect, it } from "vitest";
import {
  descricaoPagamentoFatura,
  montarPagamentoFatura,
} from "@/lib/finance/statement-payment";

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
