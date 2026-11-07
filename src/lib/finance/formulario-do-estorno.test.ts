/**
 * 03-G2 (D-G2-19, E3c) — o formulário de um ESTORNO de cartão manda o cartão e não pede conta.
 *
 * O estorno é uma receita com `card_id` (D-G2-1): o servidor preserva cartão e fatura e força
 * `account_id` e `payment_method` nulos. Se o schema continuasse exigindo uma conta, o formulário
 * teria de pedir uma que o servidor descartaria em silêncio.
 *
 * O projeto não tem teste de componente (ambiente `node`): a metade da tela é verificada no
 * CÓDIGO-FONTE, ignorando comentários — como `src/lib/ai/painel-persistencia.test.ts`. Fixture
 * sintética.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { transactionSchema } from "@/lib/validators/transaction";

const CARTAO = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";

const base = {
  type: "receita",
  payment_method: "",
  account_id: "",
  card_id: "",
  amount: 50,
  purchase_date: "2026-06-10",
  competence_date: "2026-06-10",
  description: "estorno",
};

function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const formulario = semComentarios(
  fs.readFileSync(
    path.resolve(__dirname, "..", "..", "app", "(app)", "financeiro", "lancamentos", "transaction-form.tsx"),
    "utf8",
  ),
);

describe("03-G2 D-G2-19 · o schema aceita o estorno de cartão", () => {
  it("receita com card_id e sem account_id é válida", () => {
    const r = transactionSchema.safeParse({ ...base, card_id: CARTAO });
    expect(r.success).toBe(true);
  });

  it("receita sem card_id e sem account_id continua recusada: 'Selecione a conta'", () => {
    const r = transactionSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.flatten().fieldErrors.account_id).toEqual(["Selecione a conta"]);
  });

  it("despesa com card_id e sem conta nem cartão de crédito continua recusada", () => {
    const r = transactionSchema.safeParse({ ...base, type: "despesa", card_id: CARTAO });
    expect(r.success).toBe(false);
  });
});

describe("03-G2 D-G2-19 · o formulário trata o estorno", () => {
  it("a leitura encontrou o fonte de verdade", () => {
    expect(formulario).toContain("TransactionFormDialog");
    expect(formulario).toContain("onSubmit");
  });

  it("ehEstorno nasce do lançamento editado: receita que já tem cartão", () => {
    expect(formulario).toMatch(/const ehEstorno\s*=[^;]*transaction\?\.type === "receita"[^;]*transaction\?\.card_id/);
  });

  it("o payload manda o cartão do lançamento e esvazia conta e meio de pagamento", () => {
    expect(formulario).toMatch(/account_id:\s*ehEstorno \? ""/);
    expect(formulario).toMatch(/card_id:\s*ehEstorno \? \(transaction\?\.card_id \?\? ""\)/);
    expect(formulario).toMatch(/payment_method:\s*ehEstorno\s*\?\s*""/);
  });

  it("a tela troca Conta e Forma de pagamento pela frase do estorno", () => {
    expect(formulario).toContain("Estorno no cartão — continua na fatura em que foi lançado.");
    expect(formulario).toMatch(/\{ehEstorno \? \(/);
  });
});
