/**
 * REDESIGN-03-C · A2 — `updateTransaction` visto de fora, sobre um client em memória.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO PROVA                                                              ║
 * ║                                                                                       ║
 * ║ 1. A receita editada grava a responsabilidade da A1; a recusa da A1 não grava nada.   ║
 * ║ 2. A2(b): despesa compartilhada que vira receita passa por `reapplySplit` ANTES do    ║
 * ║    update — a limpeza de divisão e recebíveis é a de hoje, e a recusa por recebível   ║
 * ║    cobrado/pago não deixa NENHUMA escrita. Sem isso, a linha ficaria receita com o    ║
 * ║    `valor_pessoal` da despesa antiga, e o motor (que passa a ler `valor_pessoal` de    ║
 * ║    receita na A4) a contaria como renda parcial.                                      ║
 * ║ 3. Sair de receita zera as colunas: `decidirReaplicacao` responde "nada" quando não   ║
 * ║    há divisão gravada nem a gravar, e a despesa ficaria `terceiro` com valor 0.        ║
 * ║ 4. Despesa → despesa continua no caminho e na ordem de hoje.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * `authContext` é o real (o `createClient` é que devolve o dublê); `reapplySplit` e
 * `applySplit` também. Fixture sintética.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria, type Linha } from "@/test/supabase-em-memoria";
import { MOTIVO_RECEBIVEL_FECHADO } from "@/lib/finance/split";
import { MSG_PARTE_TOTAL } from "@/lib/finance/responsabilidade-da-receita";

let fake = criarSupabaseEmMemoria({});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updateTransaction } = await import("@/lib/actions/transactions");

const ID = "tx-1";
const CONTA = "3f1a7c60-9d2b-4a11-8f37-2c9a1b7e5d40";
const PESSOA = "8b2e4d10-1c3f-4e55-9a02-6d7b8c9e0f11";

/** O lançamento gravado antes da edição. */
function existente(sobre: Linha): Linha {
  return {
    id: ID,
    user_id: "user-1",
    type: "despesa",
    payment_method: "pix",
    account_id: CONTA,
    card_id: null,
    statement_id: null,
    amount: 1000,
    status: "pago",
    transfer_group_id: null,
    parcelado: false,
    classificacao: "pessoal",
    valor_pessoal: null,
    competence_date: "2026-06-10",
    purchase_date: "2026-06-10",
    ...sobre,
  };
}

/** Uma despesa compartilhada: R$ 600 do terceiro, R$ 400 meus, com um recebível. */
function despesaCompartilhada(statusDoRecebivel: string): Record<string, Linha[]> {
  return {
    transactions: [existente({ classificacao: "compartilhada", valor_pessoal: 400 })],
    shared_expenses: [
      { id: "se-1", transaction_id: ID, person_id: PESSOA, tipo_divisao: "valor", valor: 600 },
    ],
    receivables: [
      { id: "rc-1", transaction_id: ID, person_id: PESSOA, valor: 600, status: statusDoRecebivel },
    ],
  };
}

/** O payload que o formulário manda. */
function payload(sobre: Linha): Linha {
  return {
    type: "receita",
    payment_method: "pix",
    account_id: CONTA,
    amount: 1000,
    purchase_date: "2026-06-10",
    competence_date: "2026-06-10",
    status: "recebido",
    description: "x",
    classificacao: "pessoal",
    parts: [],
    ...sobre,
  };
}

const linhaFinal = () => fake.tabelas.transactions.find((t) => t.id === ID) as Linha;

beforeEach(() => {
  fake = criarSupabaseEmMemoria({});
});

describe("03-C A2 · updateTransaction — a receita grava a responsabilidade da A1", () => {
  it("receita pessoal reclassificada como de terceiro grava 'terceiro' e 0", async () => {
    fake = criarSupabaseEmMemoria({ transactions: [existente({ type: "receita" })] });
    const r = await updateTransaction(ID, payload({ receita_classificacao: "terceiro" }));
    expect(r.ok).toBe(true);
    expect(linhaFinal()).toMatchObject({ classificacao: "terceiro", valor_pessoal: 0 });
  });

  it("compartilhada com o valor reduzido abaixo da parte é RECUSADA no campo, sem nada gravado", async () => {
    // C0: a parte não é recalculada proporcionalmente em silêncio.
    fake = criarSupabaseEmMemoria({
      transactions: [
        existente({ type: "receita", classificacao: "compartilhada", valor_pessoal: 400 }),
      ],
    });
    const r = await updateTransaction(
      ID,
      payload({
        amount: 300,
        receita_classificacao: "compartilhada",
        receita_minha_parte: 400,
      }),
    );
    expect(r).toEqual({
      ok: false,
      error: expect.any(String),
      fieldErrors: { receita_minha_parte: [MSG_PARTE_TOTAL] },
    });
    expect(fake.escritas()).toEqual([]);
    expect(linhaFinal()).toMatchObject({ amount: 1000, valor_pessoal: 400 });
  });
});

describe("03-C A2(b) · despesa compartilhada que vira receita", () => {
  it("limpa divisão e recebível pelo caminho de hoje e grava a receita pessoal", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pendente"));
    const r = await updateTransaction(ID, payload({}));
    expect(r.ok).toBe(true);
    expect(fake.tabelas.shared_expenses).toEqual([]);
    expect(fake.tabelas.receivables).toEqual([]);
    expect(linhaFinal()).toMatchObject({
      type: "receita",
      classificacao: "pessoal",
      valor_pessoal: null,
    });
  });

  it.each(["cobrado", "pago"])(
    "com recebível %s, RECUSA e não grava NADA — a linha continua despesa compartilhada",
    async (status) => {
      fake = criarSupabaseEmMemoria(despesaCompartilhada(status));
      const r = await updateTransaction(ID, payload({ receita_classificacao: "terceiro" }));
      expect(r).toEqual({ ok: false, error: MOTIVO_RECEBIVEL_FECHADO });
      expect(fake.escritas()).toEqual([]);
      expect(linhaFinal()).toMatchObject({
        type: "despesa",
        classificacao: "compartilhada",
        valor_pessoal: 400,
      });
      expect(fake.tabelas.receivables).toHaveLength(1);
    },
  );
});

/**
 * Achado P2 da auditoria do módulo (2026-10-11): o ramo de transferência APAGA o lançamento e
 * recria pelo `criarTransacao`. Com a A1 recusando DEPOIS do delete, uma transferência editada
 * para receita compartilhada sem parte sumia — e, sendo o pagamento de uma fatura, deixava a
 * fatura "paga" apontando para o nada. A A1 roda antes de qualquer escrita, inclusive desta.
 */
describe("03-C A2 · transferência editada para receita: a recusa da A1 vem antes do delete", () => {
  const transferencia = () =>
    existente({
      type: "transferencia",
      payment_method: "transferencia",
      transfer_group_id: "grupo-1",
      transfer_account_id: "9c4e2a10-7b3d-4f61-8e25-1a2b3c4d5e6f",
    });

  it("recusa no campo e não apaga nada", async () => {
    fake = criarSupabaseEmMemoria({ transactions: [transferencia()] });
    const r = await updateTransaction(
      ID,
      payload({ receita_classificacao: "compartilhada" }),
    );
    expect(r).toMatchObject({ ok: false, fieldErrors: { receita_minha_parte: expect.any(Array) } });
    expect(fake.escritas()).toEqual([]);
    expect(linhaFinal()).toMatchObject({ type: "transferencia", transfer_group_id: "grupo-1" });
  });

  it("sendo o pagamento de uma fatura, a fatura continua apontando para ele", async () => {
    fake = criarSupabaseEmMemoria({
      transactions: [transferencia()],
      card_statements: [{ id: "st-1", pago_transacao_id: ID, status: "paga" }],
    });
    const r = await updateTransaction(
      ID,
      payload({ receita_classificacao: "compartilhada", receita_minha_parte: 1000 }),
    );
    expect(r.ok).toBe(false);
    expect(fake.escritas()).toEqual([]);
    expect(fake.tabelas.card_statements[0]).toMatchObject({ pago_transacao_id: ID });
  });
});

describe("03-C A2 · sair de receita zera a responsabilidade", () => {
  it("receita de terceiro editada para despesa pessoal volta a pessoal, com valor nulo", async () => {
    fake = criarSupabaseEmMemoria({
      transactions: [existente({ type: "receita", classificacao: "terceiro", valor_pessoal: 0 })],
    });
    const r = await updateTransaction(ID, payload({ type: "despesa", status: "pago" }));
    expect(r.ok).toBe(true);
    expect(linhaFinal()).toMatchObject({
      type: "despesa",
      classificacao: "pessoal",
      valor_pessoal: null,
    });
  });

  it("receita de terceiro editada para despesa compartilhada aplica a divisão da despesa", async () => {
    fake = criarSupabaseEmMemoria({
      transactions: [existente({ type: "receita", classificacao: "terceiro", valor_pessoal: 0 })],
    });
    const r = await updateTransaction(
      ID,
      payload({
        type: "despesa",
        status: "pago",
        classificacao: "compartilhada",
        parts: [{ person_id: PESSOA, tipo: "valor", valor: 600 }],
      }),
    );
    expect(r.ok).toBe(true);
    expect(fake.tabelas.shared_expenses).toHaveLength(1);
    expect(fake.tabelas.receivables).toHaveLength(1);
    expect(linhaFinal()).toMatchObject({
      type: "despesa",
      classificacao: "compartilhada",
      valor_pessoal: 400,
    });
  });
});

describe("03-C A2 · despesa → despesa continua como hoje", () => {
  it("mudar só a descrição de uma despesa dividida não encosta em divisão nem recebível", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pendente"));
    const r = await updateTransaction(
      ID,
      payload({
        type: "despesa",
        status: "pago",
        description: "outra descrição",
        classificacao: "compartilhada",
        parts: [{ person_id: PESSOA, tipo: "valor", valor: 600 }],
      }),
    );
    expect(r.ok).toBe(true);
    expect(fake.escritas("shared_expenses")).toEqual([]);
    expect(fake.escritas("receivables")).toEqual([]);
    // O update de `transactions` é um só, e não toca a responsabilidade (quem a grava é a divisão).
    const updates = fake.escritas("transactions");
    expect(updates).toHaveLength(1);
    expect(Object.hasOwn(updates[0].valores as Linha, "classificacao")).toBe(false);
    expect(Object.hasOwn(updates[0].valores as Linha, "valor_pessoal")).toBe(false);
    expect(linhaFinal()).toMatchObject({ classificacao: "compartilhada", valor_pessoal: 400 });
  });
});
