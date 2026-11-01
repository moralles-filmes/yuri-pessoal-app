import { describe, expect, it } from "vitest";
import {
  buildGeneratedRow,
  isCardRecurrence,
  runGeneration,
  type RecurrenceRow,
} from "@/lib/finance/generation";
import type { AuthContext } from "@/lib/actions/helpers";
import { criarSupabaseEmMemoria, type Linha } from "@/test/supabase-em-memoria";

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
    last_generated_at: null,
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

describe("03-G2 E6 · runGeneration reserva antes de inserir (S9, D-G2-10)", () => {
  const HOJE = "2031-03-15";
  const ANTES = "2031-01-10T12:00:00.000Z";

  // Fixture sintética: recorrência mensal de conta (sem cartão, sem fatura), 3 datas vencidas.
  function linhaDaRecorrencia(extra: Partial<RecurrenceRow> = {}): Linha {
    return {
      ...rec({
        id: "rec-sint",
        payment_method: "pix",
        description: "Recorrencia sintetica",
        anchor_date: "2031-01-10",
        next_due_date: "2031-01-10",
        last_generated_at: ANTES,
        ...extra,
      }),
      user_id: USER,
      is_active: true,
    };
  }

  function montar(
    extra: Partial<RecurrenceRow> = {},
    antesDeGravar?: Parameters<typeof criarSupabaseEmMemoria>[1] extends infer O
      ? O extends { antesDeGravar?: infer F }
        ? F
        : never
      : never,
  ) {
    const fake = criarSupabaseEmMemoria(
      { recurring_transactions: [linhaDaRecorrencia(extra)], transactions: [] },
      { userId: USER, antesDeGravar },
    );
    const ctx = { supabase: fake.client, userId: USER } as AuthContext;
    // O que a página leu ANTES de gerar (a "aba" que carrega a lista).
    const lidas = fake.tabelas.recurring_transactions.map((l) => ({ ...l })) as unknown as RecurrenceRow[];
    return { fake, ctx, lidas };
  }

  it("recorrência: a reserva vem antes do insert", async () => {
    const { fake, ctx, lidas } = montar();
    const r = await runGeneration(ctx, lidas, HOJE);
    expect(r).toEqual({ generated: 3, interrompida: false });
    const escritas = fake.escritas();
    expect(escritas.map((e) => `${e.tipo}:${e.tabela}`)).toEqual([
      "update:recurring_transactions",
      "insert:transactions",
    ]);
    // A reserva já carrega a nova data, e é condicional.
    expect(escritas[0].valores).toMatchObject({ next_due_date: "2031-04-10" });
    expect(escritas[0].filtros).toEqual(
      expect.arrayContaining([
        ["eq", "next_due_date", "2031-01-10"],
        ["eq", "is_active", true],
      ]),
    );
    expect(fake.tabelas.transactions).toHaveLength(3);
  });

  it("duas gerações: a segunda não insere", async () => {
    const { fake, ctx, lidas } = montar();
    const primeira = await runGeneration(ctx, lidas, HOJE);
    const segunda = await runGeneration(ctx, lidas, HOJE);
    expect(primeira).toEqual({ generated: 3, interrompida: false });
    expect(segunda).toEqual({ generated: 0, interrompida: false });
    expect(fake.tabelas.transactions).toHaveLength(3);
  });

  it("última geração (finished) em duas abas: a segunda não insere", async () => {
    // end_date em 2031-03-10: as 3 datas vencem e não há próxima (finished, newNextDueDate nulo).
    const { fake, ctx, lidas } = montar({ end_date: "2031-03-10" });
    const primeira = await runGeneration(ctx, lidas, HOJE);
    expect(primeira).toEqual({ generated: 3, interrompida: false });
    expect(fake.tabelas.recurring_transactions[0].is_active).toBe(false);
    // Só is_active mudou: next_due_date continua o antigo — é is_active = true que barra a 2ª aba.
    expect(fake.tabelas.recurring_transactions[0].next_due_date).toBe("2031-01-10");
    const segunda = await runGeneration(ctx, lidas, HOJE);
    expect(segunda).toEqual({ generated: 0, interrompida: false });
    expect(fake.tabelas.transactions).toHaveLength(3);
  });

  it("insert falho: a data volta e a recorrência segue ativa", async () => {
    const { fake, ctx, lidas } = montar({}, (op) =>
      op.tabela === "transactions" && op.tipo === "insert"
        ? { code: "23514", message: "x" }
        : null,
    );
    const r = await runGeneration(ctx, lidas, HOJE);
    expect(r).toEqual({ generated: 0, interrompida: false });
    expect(fake.tabelas.transactions).toHaveLength(0);
    expect(fake.tabelas.recurring_transactions[0]).toMatchObject({
      next_due_date: "2031-01-10",
      is_active: true,
      last_generated_at: ANTES,
    });
  });

  it("reserva com erro: interrompida e nenhum insert", async () => {
    const { fake, ctx, lidas } = montar({}, (op) =>
      op.tabela === "recurring_transactions" && op.tipo === "update"
        ? { code: "XX000", message: "x" }
        : null,
    );
    const r = await runGeneration(ctx, lidas, HOJE);
    expect(r).toEqual({ generated: 0, interrompida: true });
    expect(fake.escritas("transactions")).toHaveLength(0);
  });

  it("devolução falha: interrompida", async () => {
    let updates = 0;
    const { fake, ctx, lidas } = montar({}, (op) => {
      if (op.tabela === "transactions" && op.tipo === "insert") return { code: "23514", message: "x" };
      if (op.tabela === "recurring_transactions" && op.tipo === "update") {
        updates += 1;
        if (updates === 2) return { code: "XX000", message: "x" };
      }
      return null;
    });
    const r = await runGeneration(ctx, lidas, HOJE);
    expect(r).toEqual({ generated: 0, interrompida: true });
    expect(updates).toBe(2);
    expect(fake.tabelas.transactions).toHaveLength(0);
  });

  it("sem datas a gerar: o update conferido; erro => interrompida", async () => {
    // next_due_date no futuro: nenhuma data vencida, mas o catch-up ainda registra a conferência.
    const ok = montar({ next_due_date: "2031-04-10" });
    expect(await runGeneration(ok.ctx, ok.lidas, HOJE)).toEqual({ generated: 0, interrompida: false });
    expect(ok.fake.escritas("recurring_transactions")).toHaveLength(1);
    expect(ok.fake.escritas("transactions")).toHaveLength(0);

    const falho = montar({ next_due_date: "2031-04-10" }, (op) =>
      op.tabela === "recurring_transactions" && op.tipo === "update"
        ? { code: "XX000", message: "x" }
        : null,
    );
    expect(await runGeneration(falho.ctx, falho.lidas, HOJE)).toEqual({
      generated: 0,
      interrompida: true,
    });
  });
});
