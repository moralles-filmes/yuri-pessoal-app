/**
 * REDESIGN-03-G (L1) — as leituras do financeiro com o erro INJETADO pelo harness.
 *
 * O que este arquivo prova: leitura que falhou LANÇA `ErroDeLeitura` (com o rótulo da tabela
 * única), lista que alimenta número e veio cortada lança `LeituraIncompleta`, e o corte que é
 * REGRA (as 10 candidatas do comprovante) não lança. Fixture sintética: o repositório é público.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroDeLeitura, LeituraIncompleta } from "@/lib/supabase/leitura";
import { ROTULOS_DE_LEITURA as R } from "@/lib/finance/rotulos-de-leitura";
import { criarSupabaseEmMemoria, type Linha } from "@/test/supabase-em-memoria";

let fake = criarSupabaseEmMemoria({});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("@/lib/format", async (original) => ({
  ...(await original<typeof import("@/lib/format")>()),
  hojeISO: () => "2031-01-15",
}));
const resolverFatura = vi.fn<() => Promise<string | null>>();
vi.mock("@/lib/finance/statements", () => ({
  resolveOrCreateStatement: () => resolverFatura(),
}));

const Q = await import("@/lib/finance/queries");
const { idsDasCategoriasMarcadas } = await import("@/lib/finance/categorias-marcadas");
const { lerRecebimentos } = await import("@/lib/finance/recebimentos-leitura");
const { catchUpRecurrences } = await import("@/lib/finance/generation");

const U = "user-1";

beforeEach(() => {
  fake = criarSupabaseEmMemoria({});
  resolverFatura.mockReset();
});

function falhando(tabela: string, extras: Record<string, Linha[]> = {}) {
  fake = criarSupabaseEmMemoria(extras, { falharLeitura: { [tabela]: "XX000" } });
}

async function rejeitaCom(
  p: Promise<unknown>,
  oQue: string,
  classe: abstract new (...args: never[]) => ErroDeLeitura = ErroDeLeitura,
) {
  const e = await p.then(
    () => {
      throw new Error("não lançou");
    },
    (erro: unknown) => erro,
  );
  expect(e).toBeInstanceOf(classe);
  expect((e as ErroDeLeitura).oQue).toBe(oQue);
}

describe("03-G L1 · erro de leitura lança, com o rótulo da tabela única", () => {
  const casos: Array<[string, string, () => Promise<unknown>, string]> = [
    ["getAccounts", "accounts_with_balance", () => Q.getAccounts(), R.contas],
    ["getCategories", "categories", () => Q.getCategories(), R.categorias],
    ["getCategoriesEnsureSeed", "categories", () => Q.getCategoriesEnsureSeed(), R.categorias],
    ["getSubcategories", "subcategories", () => Q.getSubcategories(), R.subcategorias],
    ["getTransactions", "transactions", () => Q.getTransactions(), R.lancamentos],
    ["getTransactionsRange", "transactions", () => Q.getTransactionsRange({ from: "2031-01-01", to: "2031-01-31" }), R.lancamentos],
    ["getCreditCards", "credit_cards", () => Q.getCreditCards(), R.cartoes],
    ["getStatementByCompetencia", "card_statements", () => Q.getStatementByCompetencia("c", "2031-01-01"), R.fatura],
    ["getCardBillingDays", "credit_cards", () => Q.getCardBillingDays("c"), R.cartao],
    ["getTransactionById", "transactions", () => Q.getTransactionById("t"), R.lancamento],
    ["getTransactionsForReceiptMatch", "transactions", () => Q.getTransactionsForReceiptMatch({ dataISO: "2031-01-02", valorCentavos: 1000 }), R.candidatasDoComprovante],
    ["getStatements", "card_statements_with_total", () => Q.getStatements(), R.faturas],
    ["getInstallmentPurchases", "transactions", () => Q.getInstallmentPurchases(), R.comprasParceladas],
    ["getStatementInstallmentItems", "transaction_installments", () => Q.getStatementInstallmentItems(["s"]), R.parcelas],
    ["getBills", "bills", () => Q.getBills(), R.contasFixas],
    ["getRecurrences", "recurring_transactions", () => Q.getRecurrences(), R.recorrencias],
    ["getPeople", "people", () => Q.getPeople(), R.pessoas],
    ["getPeopleForSelect", "people", () => Q.getPeopleForSelect(), R.pessoas],
    ["lerRecebiveis", "receivables", () => Q.lerRecebiveis(), R.recebiveis],
    ["getReceivablesByStatements", "receivables", () => Q.getReceivablesByStatements(["s"]), R.recebiveis],
    ["getImportBatches", "import_batches", () => Q.getImportBatches(), R.lotesDaImportacao],
    ["getImportBatch", "import_batches", () => Q.getImportBatch("b"), R.loteDaImportacao],
    ["getImportRows", "import_rows", () => Q.getImportRows("b"), R.linhasDaImportacao],
    ["lerRecebimentos", "receivable_receipts", () => lerRecebimentos(), R.recebimentos],
    ["catchUpRecurrences", "recurring_transactions", () => catchUpRecurrences(), R.recorrencias],
  ];

  it.each(casos)("%s lança quando %s falha", async (_nome, tabela, chamar, oQue) => {
    falhando(tabela);
    await rejeitaCom(chamar(), oQue);
  });

  it("idsDasCategoriasMarcadas lança em vez de dizer \"nenhuma categoria marcada\" (RR-C2-3, Z11)", async () => {
    falhando("categories");
    await rejeitaCom(idsDasCategoriasMarcadas(fake.client as never), R.categoriasMarcadas);
    await rejeitaCom(Q.getTransactions({ categoriasMarcadas: true }), R.categoriasMarcadas);
  });

  it("recebimentos falhando derrubam as telas fora do motor que somam saldo (D-G29)", async () => {
    falhando("receivable_receipts");
    await rejeitaCom(Q.getInstallmentPurchases(), R.recebimentos);
    await rejeitaCom(Q.getReceivablesByStatements(["s"]), R.recebimentos);
    await rejeitaCom(Q.lerRecebiveis(), R.recebimentos);
  });

  it("registro ausente continua sendo null, não erro (D-G27)", async () => {
    expect(await Q.getTransactionById("nao-existe")).toBeNull();
    expect(await Q.getImportBatch("nao-existe")).toBeNull();
  });
});

describe("03-G L1 · o teto", () => {
  const linhas = (n: number, extra: Linha = {}): Linha[] =>
    Array.from({ length: n }, (_, i) => ({ id: `x-${i}`, user_id: U, ...extra }));

  it("lista que alimenta número e veio cortada lança LeituraIncompleta", async () => {
    fake = criarSupabaseEmMemoria(
      {
        card_statements_with_total: linhas(3, { itens: 1, competencia: "2031-01-01" }),
        import_rows: linhas(3, { import_batch_id: "b" }),
        accounts_with_balance: linhas(3),
      },
      { maxRows: 2 },
    );
    await rejeitaCom(Q.getStatements(), R.faturas, LeituraIncompleta);
    await rejeitaCom(Q.getImportRows("b"), R.linhasDaImportacao, LeituraIncompleta);
    await rejeitaCom(Q.getAccounts(), R.contas, LeituraIncompleta);
  });

  it("getTransactions saturada devolve a situação e o total, sem lançar (D-G7)", async () => {
    fake = criarSupabaseEmMemoria({ transactions: linhas(3) }, { maxRows: 2 });
    const r = await Q.getTransactions();
    expect(r.situacao).toBe("saturou");
    expect(r.linhas).toHaveLength(2);
    expect(r.total).toBe(3);
  });

  it("getInstallmentPurchases saturada devolve a situação (o chamador exige completa, D-G5)", async () => {
    fake = criarSupabaseEmMemoria({ transactions: linhas(3, { parcelado: true }) }, { maxRows: 2 });
    const r = await Q.getInstallmentPurchases();
    expect(r.situacao).toBe("saturou");
  });

  it("11 candidatas do comprovante devolvem 10, sem lançar — o corte é regra (D-G28)", async () => {
    fake = criarSupabaseEmMemoria({
      transactions: linhas(11, { purchase_date: "2031-01-02", amount: 10 }),
    });
    const r = await Q.getTransactionsForReceiptMatch({ dataISO: "2031-01-02", valorCentavos: 1000 });
    expect(r).toHaveLength(10);
  });
});

describe("03-G L1 · catchUpRecurrences (D-G8, D-G31)", () => {
  const recorrencia = (id: string, extra: Linha): Linha => ({
    id,
    user_id: U,
    is_active: true,
    type: "despesa",
    payment_method: "pix",
    account_id: "acc-1",
    card_id: null,
    category_id: null,
    subcategory_id: null,
    amount: 10,
    description: "Recorrencia sintetica",
    tags: [],
    frequency: "mensal",
    interval_count: 1,
    anchor_date: "2031-01-10",
    next_due_date: "2031-01-10",
    end_date: null,
    generated_status: "pendente",
    ...extra,
  });

  it("erro DENTRO do laço, depois de lançamento gravado, interrompe e declara (Z21)", async () => {
    fake = criarSupabaseEmMemoria({
      recurring_transactions: [
        recorrencia("r-conta", {}),
        recorrencia("r-cartao", { payment_method: "cartao_credito", account_id: null, card_id: "card-1" }),
      ],
    });
    resolverFatura.mockRejectedValue(new ErroDeLeitura(R.fatura));
    const r = await catchUpRecurrences();
    expect(r).toEqual({ generated: 1, recurrences: 2, interrompida: true });
    expect(fake.escritas("transactions")).toHaveLength(1);
  });

  it("outro erro dentro do laço continua subindo", async () => {
    fake = criarSupabaseEmMemoria({
      recurring_transactions: [
        recorrencia("r-cartao", { payment_method: "cartao_credito", account_id: null, card_id: "card-1" }),
      ],
    });
    resolverFatura.mockRejectedValue(new Error("outra coisa"));
    await expect(catchUpRecurrences()).rejects.toThrow("outra coisa");
  });

  it("sem erro, nada é interrompido", async () => {
    fake = criarSupabaseEmMemoria({ recurring_transactions: [recorrencia("r-conta", {})] });
    expect(await catchUpRecurrences()).toEqual({ generated: 1, recurrences: 1, interrompida: false });
  });
});
