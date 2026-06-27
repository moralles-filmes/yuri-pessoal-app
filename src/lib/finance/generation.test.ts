import { describe, expect, it } from "vitest";
import {
  buildGeneratedRow,
  isCardRecurrence,
  type RecurrenceRow,
} from "@/lib/finance/generation";

const USER = "user-1";

function rec(overrides: Partial<RecurrenceRow> = {}): RecurrenceRow {
  return {
    id: "rec-1",
    type: "despesa",
    payment_method: null,
    account_id: "acc-1",
    card_id: null,
    category_id: "cat-1",
    subcategory_id: null,
    amount: 100,
    description: "Assinatura",
    tags: [],
    frequency: "mensal",
    interval_count: 1,
    anchor_date: "2026-01-10",
    next_due_date: "2026-01-10",
    end_date: null,
    generated_status: "pago",
    ...overrides,
  };
}

describe("isCardRecurrence", () => {
  it("é cartão quando paga no cartão e tem card_id", () => {
    expect(
      isCardRecurrence(rec({ payment_method: "cartao_credito", card_id: "card-1" })),
    ).toBe(true);
  });

  it("não é cartão sem card_id (órfã) nem com outra forma", () => {
    expect(
      isCardRecurrence(rec({ payment_method: "cartao_credito", card_id: null })),
    ).toBe(false);
    expect(isCardRecurrence(rec({ payment_method: "pix", card_id: null }))).toBe(
      false,
    );
  });
});

describe("buildGeneratedRow", () => {
  it("recorrência de cartão: card_id setado, account_id null, despesa", () => {
    const row = buildGeneratedRow(
      rec({
        payment_method: "cartao_credito",
        card_id: "card-1",
        account_id: "acc-1",
      }),
      "2026-02-10",
      USER,
    );
    expect(row.card_id).toBe("card-1");
    expect(row.account_id).toBeNull();
    expect(row.type).toBe("despesa");
    expect(row.purchase_date).toBe("2026-02-10");
    expect(row.competence_date).toBe("2026-02-10");
    expect(row.user_id).toBe(USER);
    expect(row.recurring_id).toBe("rec-1");
  });

  it("recorrência de conta: card_id null, account_id preservado", () => {
    const row = buildGeneratedRow(
      rec({ payment_method: "pix", account_id: "acc-9" }),
      "2026-02-10",
      USER,
    );
    expect(row.card_id).toBeNull();
    expect(row.account_id).toBe("acc-9");
  });

  it("cartão sem card_id (órfã) não vira lançamento de cartão", () => {
    const row = buildGeneratedRow(
      rec({ payment_method: "cartao_credito", card_id: null, account_id: "acc-1" }),
      "2026-02-10",
      USER,
    );
    // Sem card_id resolvido, trata como não-cartão: account_id preservado.
    expect(row.card_id).toBeNull();
    expect(row.account_id).toBe("acc-1");
  });
});
