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
import { MSG_DATA_PAGAMENTO_FUTURA } from "@/lib/finance/caixa";
import { checkLiquidadoEmCoerente } from "@/test/check-liquidado-em";

let fake = criarSupabaseEmMemoria({});

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { updateTransaction, deleteTransaction, setTransactionStatus } = await import(
  "@/lib/actions/transactions"
);

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

describe("03-C2 A5 · updateTransaction NÃO lê a marcação da categoria (K2)", () => {
  const MARCADA = "c0ffee00-0000-4000-8000-000000000001";

  it("receita pessoal movida para uma categoria marcada, sem receita_*, continua pessoal", async () => {
    fake = criarSupabaseEmMemoria({
      transactions: [existente({ type: "receita" })],
      categories: [{ id: MARCADA, user_id: "user-1", kind: "receita", classificacao_padrao: "terceiro" }],
    });
    const r = await updateTransaction(ID, payload({ category_id: MARCADA }));
    expect(r.ok).toBe(true);
    expect(linhaFinal()).toMatchObject({ category_id: MARCADA, classificacao: "pessoal", valor_pessoal: null });
  });
});

describe("03-D · A4 — recebimento registrado bloqueia", () => {
  const recebimento = {
    id: "rr-1", user_id: "user-1", receivable_id: "rc-1", valor: 100,
    recebido_em: "2026-06-05", created_at: "2026-06-05T10:00:00Z",
  };

  it("reapplySplit: recebível PENDENTE com recebimento parcial recusa a mudança de divisão e não grava nada", async () => {
    fake = criarSupabaseEmMemoria({ ...despesaCompartilhada("pendente"), receivable_receipts: [recebimento] });
    const r = await updateTransaction(ID, payload({ receita_classificacao: "terceiro" }));
    expect(r).toEqual({ ok: false, error: MOTIVO_RECEBIVEL_FECHADO });
    expect(fake.escritas()).toHaveLength(0);
  });

  it("reapplySplit: recebível IGNORADO também bloqueia (D11)", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("ignorado"));
    const r = await updateTransaction(ID, payload({ receita_classificacao: "terceiro" }));
    expect(r).toEqual({ ok: false, error: MOTIVO_RECEBIVEL_FECHADO });
    expect(fake.escritas()).toHaveLength(0);
  });

  it("deleteTransaction: lançamento com recebimento registrado é recusado, sem escrita", async () => {
    fake = criarSupabaseEmMemoria({ ...despesaCompartilhada("pendente"), receivable_receipts: [recebimento] });
    const r = await deleteTransaction(ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/recebimento registrado/);
    expect(fake.escritas()).toHaveLength(0);
  });

  it("deleteTransaction: recebível PAGO legado sem recebimento continua deixando excluir (b)", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pago"));
    const r = await deleteTransaction(ID);
    expect(r.ok).toBe(true);
    expect(fake.escritas()).toEqual([
      { tabela: "transactions", tipo: "delete", filtros: [["eq", "id", ID]] },
    ]);
    expect(fake.tabelas.transactions).toEqual([]);
  });
});

const OUTRA_CONTA = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";

describe("03-D RR-D-17 · despesa dividida editada para transferência", () => {
  const recebimento = {
    id: "rr-1", user_id: "user-1", receivable_id: "rc-1", valor: 100,
    recebido_em: "2026-06-05", created_at: "2026-06-05T10:00:00Z",
  };
  const paraTransferencia = () =>
    payload({ type: "transferencia", status: "pago", transfer_account_id: OUTRA_CONTA });

  it("com recebimento registrado é recusada, sem escrita", async () => {
    fake = criarSupabaseEmMemoria({ ...despesaCompartilhada("pendente"), receivable_receipts: [recebimento] });
    const r = await updateTransaction(ID, paraTransferencia());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/recebimento registrado/);
    expect(fake.escritas()).toHaveLength(0);
  });

  it("pago legado sem recebimento continua deixando (b): a primeira escrita é o delete do lançamento", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pago"));
    await updateTransaction(ID, paraTransferencia());
    expect(fake.escritas()[0]).toEqual({ tabela: "transactions", tipo: "delete", filtros: [["eq", "id", ID]] });
  });
});

/**
 * REDESIGN-03-E · A3 (K0, P9) — a edição e o botão rápido de status mantêm `liquidado_em`
 * coerente com o status. O dublê aplica o CHECK da M2 (`checkLiquidadoEmCoerente`): um caminho
 * que tira o lançamento de `pago` sem limpar a data é recusado com 23514, como no banco.
 */
describe("03-E A3 · status e liquidado_em (K0, P9)", () => {
  const DATA = "2026-06-12";
  const comCheck = (tabelas: Record<string, Linha[]>) =>
    criarSupabaseEmMemoria(tabelas, { antesDeGravar: checkLiquidadoEmCoerente });

  it("(Z11) updateTransaction de despesa paga com data para 'pendente' limpa a data", async () => {
    fake = comCheck({ transactions: [existente({ liquidado_em: DATA })] });
    const r = await updateTransaction(ID, payload({ type: "despesa", status: "pendente" }));
    expect(r.ok).toBe(true);
    expect(linhaFinal()).toMatchObject({ status: "pendente", liquidado_em: null });
  });

  it("(Z11) setTransactionStatus de pago (com data) para 'pendente' limpa a data", async () => {
    fake = comCheck({ transactions: [existente({ liquidado_em: DATA })] });
    const r = await setTransactionStatus(ID, "pendente");
    expect(r.ok).toBe(true);
    expect(linhaFinal()).toMatchObject({ status: "pendente", liquidado_em: null });
  });

  it("(Z20) setTransactionStatus de pendente (sem data) para 'pago' grava null — não inventa data", async () => {
    fake = comCheck({ transactions: [existente({ status: "pendente" })] });
    const r = await setTransactionStatus(ID, "pago");
    expect(r.ok).toBe(true);
    expect(linhaFinal()).toMatchObject({ status: "pago", liquidado_em: null });
    const updates = fake.escritas("transactions");
    expect(updates).toHaveLength(1);
    expect(updates[0].valores).toEqual({ status: "pago", liquidado_em: null });
  });

  it("(P9) setTransactionStatus de pago para 'recebido' mantém a data e nem a menciona", async () => {
    fake = comCheck({ transactions: [existente({ liquidado_em: DATA })] });
    const r = await setTransactionStatus(ID, "recebido");
    expect(r.ok).toBe(true);
    expect(linhaFinal()).toMatchObject({ status: "recebido", liquidado_em: DATA });
    const updates = fake.escritas("transactions");
    expect(updates).toHaveLength(1);
    expect(Object.hasOwn(updates[0].valores as Linha, "liquidado_em")).toBe(false);
  });

  it("setTransactionStatus de transferência legada para 'cancelado' limpa a data das duas linhas", async () => {
    const perna = (id: string) =>
      existente({
        id,
        type: "transferencia",
        transfer_group_id: "grupo-1",
        liquidado_em: DATA,
      });
    fake = comCheck({ transactions: [perna(ID), perna("tx-2")] });
    const r = await setTransactionStatus(ID, "cancelado");
    expect(r.ok).toBe(true);
    expect(fake.tabelas.transactions).toHaveLength(2);
    for (const linha of fake.tabelas.transactions) {
      expect(linha).toMatchObject({ status: "cancelado", liquidado_em: null });
    }
  });

  it("updateTransaction de despesa paga que continua paga grava a data informada", async () => {
    fake = comCheck({ transactions: [existente({})] });
    const r = await updateTransaction(
      ID,
      payload({ type: "despesa", status: "pago", liquidado_em: DATA }),
    );
    expect(r.ok).toBe(true);
    expect(linhaFinal()).toMatchObject({ status: "pago", liquidado_em: DATA });
  });

  it("(P8) updateTransaction com data de pagamento futura é recusada no campo, sem nenhuma escrita", async () => {
    fake = comCheck({ transactions: [existente({ liquidado_em: DATA })] });
    const r = await updateTransaction(
      ID,
      payload({ type: "despesa", status: "pago", liquidado_em: "2999-01-01" }),
    );
    expect(r).toEqual({
      ok: false,
      error: expect.any(String),
      fieldErrors: { liquidado_em: [MSG_DATA_PAGAMENTO_FUTURA] },
    });
    expect(fake.escritas()).toEqual([]);
    expect(linhaFinal()).toMatchObject({ status: "pago", liquidado_em: DATA });
  });

  it("(P8) a recusa de data futura vem antes do apaga-e-recria: a transferência não é apagada", async () => {
    fake = comCheck({
      transactions: [
        existente({ type: "transferencia", transfer_group_id: "grupo-1", transfer_account_id: OUTRA_CONTA }),
      ],
    });
    const r = await updateTransaction(
      ID,
      payload({
        type: "transferencia",
        status: "pago",
        transfer_account_id: OUTRA_CONTA,
        liquidado_em: "2999-01-01",
      }),
    );
    expect(r.ok).toBe(false);
    expect(fake.escritas()).toEqual([]);
    expect(linhaFinal()).toMatchObject({ transfer_group_id: "grupo-1" });
  });

  it("updateTransaction de transferência (apaga e recria) preserva a data informada", async () => {
    fake = comCheck({
      transactions: [
        existente({
          type: "transferencia",
          payment_method: "transferencia",
          transfer_group_id: "grupo-1",
          transfer_account_id: OUTRA_CONTA,
        }),
      ],
    });
    const r = await updateTransaction(
      ID,
      payload({
        type: "transferencia",
        status: "pago",
        transfer_account_id: OUTRA_CONTA,
        liquidado_em: DATA,
      }),
    );
    expect(r.ok).toBe(true);
    expect(fake.tabelas.transactions).toHaveLength(1);
    expect(fake.tabelas.transactions[0]).toMatchObject({
      type: "transferencia",
      status: "pago",
      liquidado_em: DATA,
    });
  });

  it("controle do dublê: sem limpar a data, o CHECK simulado recusa (23514)", async () => {
    fake = comCheck({ transactions: [existente({ liquidado_em: DATA })] });
    const client = fake.client as {
      from: (t: string) => {
        update: (v: Linha) => { eq: (c: string, v: string) => PromiseLike<{ error: { code: string } | null }> };
      };
    };
    const { error } = await client.from("transactions").update({ status: "pendente" }).eq("id", ID);
    expect(error?.code).toBe("23514");
    expect(linhaFinal()).toMatchObject({ status: "pago", liquidado_em: DATA });
  });
});
