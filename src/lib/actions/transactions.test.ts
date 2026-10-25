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
 * `authContext` é o real (o `createClient` é que devolve o dublê); `reapplySplit` também.
 * Fixture sintética.
 *
 * 03-G2 (D-G2-12, E3b): a reaplicação da divisão é UMA `rpc("salvar_lancamento")`. O dublê registra a
 * chamada e NÃO executa SQL — por isso os testes leem `p_id`/`p_lancamento`/`p_divisao` em vez de
 * olhar `shared_expenses`/`receivables` esvaziados.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria, type Linha } from "@/test/supabase-em-memoria";
import { MOTIVO_RECEBIVEL_FECHADO } from "@/lib/finance/split";
import { MSG_PARTE_TOTAL } from "@/lib/finance/responsabilidade-da-receita";
import { MSG_DATA_PAGAMENTO_FUTURA } from "@/lib/finance/caixa";
import { checkLiquidadoEmCoerente } from "@/test/check-liquidado-em";
import { revalidatePath } from "next/cache";

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

const ID_NOVO = "7c1d5e90-4b2a-4f36-8d10-5a9e3b7c2f84";
const RPC_OK = { rpc: () => ({ data: ID_NOVO, error: null }) };

/** As chamadas `rpc("salvar_lancamento")`, com os argumentos que o servidor mandou. */
const chamadasDaRpc = () =>
  fake.escritas("salvar_lancamento").map((o) => o.valores as Record<string, unknown>);

const linhaFinal = () => fake.tabelas.transactions.find((t) => t.id === ID) as Linha;

/** O `p_lancamento` da (única) rpc — o que o servidor mandou gravar no lançamento. */
const linhaDaRpc = () => chamadasDaRpc()[0].p_lancamento as Linha;

beforeEach(() => {
  fake = criarSupabaseEmMemoria({});
  vi.mocked(revalidatePath).mockClear();
});

describe("03-C A2 · updateTransaction — a receita grava a responsabilidade da A1", () => {
  // 03-G2 (D-G2-12): afirmava a linha gravada; agora lê o p_lancamento da rpc (o dublê não executa SQL).
  it("receita pessoal reclassificada como de terceiro grava 'terceiro' e 0", async () => {
    fake = criarSupabaseEmMemoria({ transactions: [existente({ type: "receita" })] }, RPC_OK);
    const r = await updateTransaction(ID, payload({ receita_classificacao: "terceiro" }));
    expect(r.ok).toBe(true);
    expect(chamadasDaRpc()).toHaveLength(1);
    expect(chamadasDaRpc()[0].p_id).toBe(ID);
    expect(linhaDaRpc()).toMatchObject({ classificacao: "terceiro", valor_pessoal: 0 });
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
  // 03-G2 (D-G2-12): afirmava shared_expenses/receivables vazios e a ordem rpc → update; a limpeza
  // da divisão e a linha da receita agora vão na MESMA rpc (o dublê não executa SQL).
  it("limpa divisão e recebível pelo caminho de hoje e grava a receita pessoal", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pendente"), RPC_OK);
    const r = await updateTransaction(ID, payload({}));
    expect(r.ok).toBe(true);
    const chamadas = chamadasDaRpc();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].p_id).toBe(ID);
    expect(chamadas[0].p_lancamento).toMatchObject({
      type: "receita",
      classificacao: "pessoal",
      valor_pessoal: null,
    });
    expect(chamadas[0].p_divisao).toEqual({ alcance: "regra-cheia", pessoas: [], recebiveis: [] });
    expect(fake.escritas("shared_expenses")).toEqual([]);
    expect(fake.escritas("receivables")).toEqual([]);
    // Nenhum update direto: uma escrita só, a rpc.
    expect(fake.escritas().map((o) => `${o.tabela}:${o.tipo}`)).toEqual(["salvar_lancamento:rpc"]);
  });

  it("receita: as colunas da receita e a divisão vazia (regra-cheia) vão na mesma chamada", async () => {
    // A responsabilidade que o dono escolheu para a receita (A1) vence a "limpeza" do plano.
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pendente"), RPC_OK);
    const r = await updateTransaction(ID, payload({ receita_classificacao: "terceiro" }));
    expect(r.ok).toBe(true);
    expect(chamadasDaRpc()).toHaveLength(1);
    expect(linhaDaRpc()).toMatchObject({ type: "receita", classificacao: "terceiro", valor_pessoal: 0 });
    expect(chamadasDaRpc()[0].p_divisao).toEqual({ alcance: "regra-cheia", pessoas: [], recebiveis: [] });
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

describe("03-G · transferência editada para despesa de cartão, com a fatura sem leitura", () => {
  // 03-G2 (D-G2-12, RR-F-1): antes, o ramo de transferência apagava ANTES de recriar e a frase tinha de
  // ser a de 'depois'. Agora a fatura é lida antes de qualquer escrita: nada foi gravado, e a frase
  // pode (e deve) dizer "Nada foi alterado.". O lançamento da transferência continua intacto.
  it("a fatura sem leitura recusa ANTES de qualquer escrita: 'Nada foi alterado.' e a transferência intacta", async () => {
    const CARTAO = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
    fake = criarSupabaseEmMemoria(
      {
        transactions: [
          existente({
            type: "transferencia",
            payment_method: "transferencia",
            transfer_group_id: "grupo-1",
            transfer_account_id: "9c4e2a10-7b3d-4f61-8e25-1a2b3c4d5e6f",
          }),
        ],
        credit_cards: [{ id: CARTAO, dia_fechamento: 5, dia_vencimento: 12 }],
      },
      { falharLeitura: { credit_cards: "XX000" } },
    );
    const r = await updateTransaction(
      ID,
      payload({
        type: "despesa",
        payment_method: "cartao_credito",
        account_id: null,
        card_id: CARTAO,
        status: "pendente",
      }),
    );
    expect(r).toEqual({
      ok: false,
      error: "Não foi possível ler a fatura. Nada foi alterado.",
    });
    expect(fake.escritas()).toEqual([]);
    expect(linhaFinal()).toMatchObject({ type: "transferencia", transfer_group_id: "grupo-1" });
  });
});

describe("03-C A2 · sair de receita zera a responsabilidade", () => {
  // 03-G2 (D-G2-12, Y22): afirmava a linha gravada; agora lê o p_lancamento — as duas chaves
  // vão EXPLÍCITAS no payload (pessoal / nulo), sem divisão a substituir.
  it("receita de terceiro editada para despesa pessoal volta a pessoal, com valor nulo", async () => {
    fake = criarSupabaseEmMemoria(
      {
        transactions: [existente({ type: "receita", classificacao: "terceiro", valor_pessoal: 0 })],
      },
      RPC_OK,
    );
    const r = await updateTransaction(ID, payload({ type: "despesa", status: "pago" }));
    expect(r.ok).toBe(true);
    expect(chamadasDaRpc()).toHaveLength(1);
    expect(linhaDaRpc()).toMatchObject({
      type: "despesa",
      classificacao: "pessoal",
      valor_pessoal: null,
    });
    expect(Object.hasOwn(linhaDaRpc(), "valor_pessoal")).toBe(true);
    expect(chamadasDaRpc()[0].p_divisao).toBeNull();
  });

  // 03-G2 (D-G2-12): afirmava as linhas gravadas em shared_expenses/receivables e a linha final;
  // agora lê o que a rpc salvar_lancamento recebeu.
  it("receita de terceiro editada para despesa compartilhada aplica a divisão da despesa", async () => {
    fake = criarSupabaseEmMemoria(
      {
        transactions: [existente({ type: "receita", classificacao: "terceiro", valor_pessoal: 0 })],
      },
      RPC_OK,
    );
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
    const chamadas = chamadasDaRpc();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].p_id).toBe(ID);
    expect(chamadas[0].p_lancamento).toMatchObject({
      type: "despesa",
      classificacao: "compartilhada",
      valor_pessoal: 400,
    });
    const divisao = chamadas[0].p_divisao as { alcance: string; pessoas: Linha[]; recebiveis: Linha[] };
    expect(divisao.alcance).toBe("regra-cheia");
    expect(divisao.pessoas).toHaveLength(1);
    expect(divisao.recebiveis).toHaveLength(1);
    expect(divisao.recebiveis[0]).toMatchObject({ person_id: PESSOA, valor: 600 });
    expect(fake.escritas("shared_expenses")).toEqual([]);
    expect(fake.escritas("receivables")).toEqual([]);
  });
});

describe("03-C A2 · despesa → despesa continua como hoje", () => {
  // 03-G2 (D-G2-12/14): antes o update de `transactions` era um só, sem as duas chaves; agora é UMA
  // rpc, p_divisao nulo e p_lancamento sem classificacao/valor_pessoal.
  it("editar só a descrição de despesa dividida: UMA rpc, p_divisao nulo e sem classificacao/valor_pessoal", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pendente"), RPC_OK);
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
    // Uma escrita só — a rpc — e ela não toca a responsabilidade (quem a grava é a divisão).
    expect(fake.escritas().map((o) => `${o.tabela}:${o.tipo}`)).toEqual(["salvar_lancamento:rpc"]);
    expect(chamadasDaRpc()[0].p_id).toBe(ID);
    expect(chamadasDaRpc()[0].p_divisao).toBeNull();
    expect(linhaDaRpc()).toMatchObject({ description: "outra descrição" });
    expect(Object.hasOwn(linhaDaRpc(), "classificacao")).toBe(false);
    expect(Object.hasOwn(linhaDaRpc(), "valor_pessoal")).toBe(false);
  });
});

describe("03-C2 A5 · updateTransaction NÃO lê a marcação da categoria (K2)", () => {
  const MARCADA = "c0ffee00-0000-4000-8000-000000000001";

  it("receita pessoal movida para uma categoria marcada, sem receita_*, continua pessoal", async () => {
    fake = criarSupabaseEmMemoria(
      {
        transactions: [existente({ type: "receita" })],
        categories: [{ id: MARCADA, user_id: "user-1", kind: "receita", classificacao_padrao: "terceiro" }],
      },
      RPC_OK,
    );
    const r = await updateTransaction(ID, payload({ category_id: MARCADA }));
    expect(r.ok).toBe(true);
    // 03-G2 (D-G2-12): lê o p_lancamento da rpc em vez da linha gravada.
    expect(linhaDaRpc()).toMatchObject({ category_id: MARCADA, classificacao: "pessoal", valor_pessoal: null });
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

  // 03-G2 (D-G2-12): a primeira (e única) escrita era o delete do lançamento; agora é a rpc, com a
  // divisão vazia no alcance 'so-dinheiro-registrado' — e nenhum delete.
  it("pago legado sem recebimento continua deixando (b): a única escrita é a rpc, sem delete", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pago"), RPC_OK);
    const r = await updateTransaction(ID, paraTransferencia());
    expect(r.ok).toBe(true);
    expect(fake.escritas().map((o) => `${o.tabela}:${o.tipo}`)).toEqual(["salvar_lancamento:rpc"]);
    expect(chamadasDaRpc()[0].p_id).toBe(ID);
    expect(chamadasDaRpc()[0].p_divisao).toEqual({
      alcance: "so-dinheiro-registrado",
      pessoas: [],
      recebiveis: [],
    });
  });

  it("despesa vira transferência sem recebimento: divisão vazia no alcance so-dinheiro-registrado e a linha de transferência", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pendente"), RPC_OK);
    const r = await updateTransaction(ID, paraTransferencia());
    expect(r.ok).toBe(true);
    expect(chamadasDaRpc()).toHaveLength(1);
    expect(chamadasDaRpc()[0].p_divisao).toEqual({
      alcance: "so-dinheiro-registrado",
      pessoas: [],
      recebiveis: [],
    });
    expect(linhaDaRpc()).toMatchObject({
      type: "transferencia",
      payment_method: "transferencia",
      transfer_account_id: OUTRA_CONTA,
      category_id: null,
      subcategory_id: null,
      card_id: null,
      statement_id: null,
      classificacao: "pessoal",
      valor_pessoal: null,
    });
    expect(typeof linhaDaRpc().transfer_group_id).toBe("string");
    expect(fake.escritas("transactions")).toEqual([]);
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
    criarSupabaseEmMemoria(tabelas, { antesDeGravar: checkLiquidadoEmCoerente, ...RPC_OK });

  it("(Z11) updateTransaction de despesa paga com data para 'pendente' limpa a data", async () => {
    fake = comCheck({ transactions: [existente({ liquidado_em: DATA })] });
    const r = await updateTransaction(ID, payload({ type: "despesa", status: "pendente" }));
    expect(r.ok).toBe(true);
    // 03-G2 (D-G2-12): o CHECK simulado só vale para escritas diretas; aqui lê-se o p_lancamento.
    expect(linhaDaRpc()).toMatchObject({ status: "pendente", liquidado_em: null });
  });

  it("(Z11) updateTransaction para 'pendente' descarta a data que o formulário ainda carrega", async () => {
    // O campo some da tela quando o status deixa de ser pago, mas o valor pode continuar no
    // payload: quem decide se a data é gravada é o STATUS, nunca a presença do campo.
    fake = comCheck({ transactions: [existente({ liquidado_em: DATA })] });
    const r = await updateTransaction(
      ID,
      payload({ type: "despesa", status: "pendente", liquidado_em: DATA }),
    );
    expect(r.ok).toBe(true);
    expect(linhaDaRpc()).toMatchObject({ status: "pendente", liquidado_em: null });
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
    expect(linhaDaRpc()).toMatchObject({ status: "pago", liquidado_em: DATA });
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

  // 03-G2 (D-G2-12): a transferência é editada NO LUGAR (era apaga-e-recria): rpc com p_id, a data
  // vem em p_lancamento e o transfer_group_id existente é mantido.
  it("updateTransaction de transferência (editada no lugar) preserva a data informada", async () => {
    fake = criarSupabaseEmMemoria(
      {
        transactions: [
          existente({
            type: "transferencia",
            payment_method: "transferencia",
            transfer_group_id: "grupo-1",
            transfer_account_id: OUTRA_CONTA,
          }),
        ],
      },
      { antesDeGravar: checkLiquidadoEmCoerente, ...RPC_OK },
    );
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
    // Nada é apagado: o mesmo id é atualizado pela rpc.
    expect(fake.escritas("transactions")).toEqual([]);
    const chamadas = chamadasDaRpc();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].p_id).toBe(ID);
    expect(chamadas[0].p_lancamento).toMatchObject({
      type: "transferencia",
      status: "pago",
      liquidado_em: DATA,
      transfer_group_id: "grupo-1",
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

/**
 * 03-G2 (D-G2-12, E3b) — a reaplicação da divisão é UMA chamada a `salvar_lancamento`, a proteção
 * dos recebíveis é lida ANTES (planejarReaplicacao só lê) e o erro da rpc vira a frase da falha.
 */
describe("03-G2 E3b · reaplicar a divisão é UMA rpc", () => {
  const despesaDividida = (sobre: Linha = {}) =>
    payload({
      type: "despesa",
      status: "pago",
      classificacao: "compartilhada",
      parts: [{ person_id: PESSOA, tipo: "valor", valor: 500 }],
      ...sobre,
    });

  it("reaplicar divisão: UMA rpc salvar_lancamento e nenhum delete/insert direto em receivables/shared_expenses", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pendente"), RPC_OK);
    const r = await updateTransaction(ID, despesaDividida());
    expect(r.ok).toBe(true);
    const chamadas = chamadasDaRpc();
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].p_id).toBe(ID);
    // 03-G2 (E3c): a linha inteira e as duas colunas da divisão vão na mesma rpc.
    expect(chamadas[0].p_lancamento).toMatchObject({ classificacao: "compartilhada", valor_pessoal: 500 });
    expect(chamadas[0].p_divisao).toMatchObject({
      alcance: "regra-cheia",
      pessoas: [{ person_id: PESSOA, tipo_divisao: "valor", percentual: null, valor: 500 }],
      recebiveis: [{ person_id: PESSOA, parcela_numero: null, valor: 500 }],
    });
    expect(fake.escritas("receivables")).toEqual([]);
    expect(fake.escritas("shared_expenses")).toEqual([]);
  });

  it.each(["cobrado", "pago"])(
    "reaplicar com recebível %s: recusa sem rpc",
    async (status) => {
      fake = criarSupabaseEmMemoria(despesaCompartilhada(status), RPC_OK);
      const r = await updateTransaction(ID, despesaDividida());
      expect(r).toEqual({ ok: false, error: MOTIVO_RECEBIVEL_FECHADO });
      expect(chamadasDaRpc()).toEqual([]);
      expect(fake.escritas("receivables")).toEqual([]);
      expect(fake.escritas("shared_expenses")).toEqual([]);
    },
  );

  it("rpc com erro P0001 DIVISAO_PROTEGIDA: a frase termina em 'Nada foi alterado.'", async () => {
    // O banco reconfere a proteção dentro da transação: o recebível pode ter mudado entre a leitura
    // do servidor e a rpc.
    fake = criarSupabaseEmMemoria(despesaCompartilhada("pendente"), {
      rpc: () => ({ data: null, error: { code: "P0001", message: "DIVISAO_PROTEGIDA" } }),
    });
    const r = await updateTransaction(ID, despesaDividida());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.endsWith("Nada foi alterado.")).toBe(true);
    expect(chamadasDaRpc()).toHaveLength(1);
  });
});

/**
 * 03-G2 (D-G2-12, E3c) — `updateTransaction` num caminho só: decide tudo antes de escrever e grava por
 * UMA rpc `salvar_lancamento` com `p_id`.
 */
describe("03-G2 E3c · updateTransaction é uma rpc só", () => {
  const CARTAO = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
  const GRUPO = "grupo-1";

  it("editar com recebível cobrado: recusa sem NENHUMA escrita (RR6)", async () => {
    fake = criarSupabaseEmMemoria(despesaCompartilhada("cobrado"), RPC_OK);
    const r = await updateTransaction(
      ID,
      payload({
        type: "despesa",
        status: "pago",
        description: "outra descrição",
        classificacao: "compartilhada",
        parts: [{ person_id: PESSOA, tipo: "valor", valor: 500 }],
      }),
    );
    expect(r).toEqual({ ok: false, error: MOTIVO_RECEBIVEL_FECHADO });
    expect(fake.escritas()).toEqual([]);
    // Antes da 03-G2 o update do lançamento já tinha acontecido quando a recusa chegava.
    expect(linhaFinal()).toMatchObject({ classificacao: "compartilhada", valor_pessoal: 400 });
  });

  it("editar transferência que paga fatura: rpc com p_id = id, nenhum delete, nenhuma escrita em card_statements (RR-F-1)", async () => {
    fake = criarSupabaseEmMemoria(
      {
        transactions: [
          existente({
            type: "transferencia",
            payment_method: "transferencia",
            transfer_group_id: GRUPO,
            transfer_account_id: OUTRA_CONTA,
          }),
        ],
        card_statements: [{ id: "st-1", pago_transacao_id: ID, status: "paga" }],
      },
      RPC_OK,
    );
    const r = await updateTransaction(
      ID,
      payload({ type: "transferencia", status: "pago", transfer_account_id: OUTRA_CONTA, description: "novo" }),
    );
    expect(r).toEqual({ ok: true, data: { id: ID } });
    expect(fake.escritas().map((o) => `${o.tabela}:${o.tipo}`)).toEqual(["salvar_lancamento:rpc"]);
    expect(fake.escritas("card_statements")).toEqual([]);
    expect(chamadasDaRpc()[0].p_id).toBe(ID);
    expect(chamadasDaRpc()[0].p_divisao).toBeNull();
    expect(linhaDaRpc()).toMatchObject({ transfer_group_id: GRUPO, description: "novo", classificacao: "pessoal", valor_pessoal: null });
    expect(fake.tabelas.card_statements[0]).toMatchObject({ pago_transacao_id: ID });
  });

  it("transferência que deixa de ser transferência: transfer_account_id e transfer_group_id nulos", async () => {
    fake = criarSupabaseEmMemoria(
      {
        transactions: [
          existente({
            type: "transferencia",
            payment_method: "transferencia",
            transfer_group_id: GRUPO,
            transfer_account_id: OUTRA_CONTA,
          }),
        ],
      },
      RPC_OK,
    );
    const r = await updateTransaction(ID, payload({ type: "despesa", status: "pago" }));
    expect(r.ok).toBe(true);
    expect(linhaDaRpc()).toMatchObject({
      type: "despesa",
      transfer_account_id: null,
      transfer_group_id: null,
      classificacao: "pessoal",
      valor_pessoal: null,
    });
    expect(chamadasDaRpc()[0].p_divisao).toBeNull();
  });

  it("editar a descrição de um estorno: card_id e statement_id do existente, account_id e payment_method nulos (RR11)", async () => {
    fake = criarSupabaseEmMemoria(
      {
        transactions: [
          existente({
            type: "receita",
            payment_method: null,
            account_id: null,
            card_id: CARTAO,
            statement_id: "st-9",
          }),
        ],
      },
      RPC_OK,
    );
    const r = await updateTransaction(
      ID,
      // A data mudou: o estorno NÃO muda de fatura (D-G2-1). Nenhum cartão cadastrado no dublê —
      // se o servidor tentasse re-resolver, a leitura falharia.
      payload({
        description: "estorno corrigido",
        payment_method: "",
        account_id: "",
        card_id: CARTAO,
        purchase_date: "2026-08-20",
        competence_date: "2026-08-20",
      }),
    );
    expect(r.ok).toBe(true);
    expect(fake.escritas().map((o) => `${o.tabela}:${o.tipo}`)).toEqual(["salvar_lancamento:rpc"]);
    expect(linhaDaRpc()).toMatchObject({
      type: "receita",
      card_id: CARTAO,
      statement_id: "st-9",
      account_id: null,
      payment_method: null,
      description: "estorno corrigido",
      purchase_date: "2026-08-20",
    });
  });

  it("compra parcelada que muda de tipo: invalid no campo, sem escrita (RR12)", async () => {
    fake = criarSupabaseEmMemoria({ transactions: [existente({ parcelado: true })] }, RPC_OK);
    const r = await updateTransaction(ID, payload({ type: "receita" }));
    expect(r).toMatchObject({
      ok: false,
      fieldErrors: { type: ["Compra parcelada muda em Parcelamentos."] },
    });
    expect(fake.escritas()).toEqual([]);
  });

  it("compra parcelada que continua despesa: divisão intocada (p_divisao nulo) e sem as colunas da divisão", async () => {
    fake = criarSupabaseEmMemoria({ transactions: [existente({ parcelado: true })] }, RPC_OK);
    const r = await updateTransaction(ID, payload({ type: "despesa", status: "pago", description: "x2" }));
    expect(r.ok).toBe(true);
    expect(chamadasDaRpc()[0].p_divisao).toBeNull();
    expect(Object.hasOwn(linhaDaRpc(), "classificacao")).toBe(false);
    expect(Object.hasOwn(linhaDaRpc(), "valor_pessoal")).toBe(false);
  });

  it("rpc sem code (rede/timeout): a frase diz que pode ter sido salvo e a tela é revalidada", async () => {
    fake = criarSupabaseEmMemoria(
      { transactions: [existente({})] },
      { rpc: () => ({ data: null, error: { code: "", message: "fetch failed" } }) },
    );
    const r = await updateTransaction(ID, payload({ type: "despesa", status: "pago" }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toMatch(/pode ter sido salvo/);
      expect(r.error).not.toMatch(/Nada foi alterado/);
    }
    expect(revalidatePath).toHaveBeenCalled();
  });

  it("rpc com SQLSTATE (transação revertida): 'Nada foi alterado.' e nenhuma revalidação", async () => {
    fake = criarSupabaseEmMemoria(
      { transactions: [existente({})] },
      { rpc: () => ({ data: null, error: { code: "23514", message: "check" } }) },
    );
    const r = await updateTransaction(ID, payload({ type: "despesa", status: "pago" }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.endsWith("Nada foi alterado.")).toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
