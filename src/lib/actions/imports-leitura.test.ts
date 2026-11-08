/**
 * REDESIGN-03-G (L6c2) — as leituras da importação que DECIDEM uma escrita, com o erro (ou o
 * corte do max_rows) injetado pelo harness. Cada caso afirma a mensagem e o que foi (ou não)
 * escrito. Fixture sintética.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria } from "@/test/supabase-em-memoria";

let fake = criarSupabaseEmMemoria({});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const {
  parseImportFile,
  remapImportBatch,
  updateImportRow,
  setImportBatchCompetencia,
  commitImport,
  undoImportBatch,
} = await import("@/lib/actions/imports");

const CONTA = "4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f8a";
const escritas = () => fake.operacoes.filter((o) => o.tipo !== "rpc");
const ANTES = (oQue: string) => `Não foi possível ler ${oQue}. Nada foi alterado.`;

beforeEach(() => {
  fake = criarSupabaseEmMemoria({});
});

describe("03-G L6c2 · parseImportFile", () => {
  function formulario() {
    const f = new FormData();
    f.set("origem", "conta");
    f.set("account_id", CONTA);
    f.set("file", new File(["data;descricao;valor\n01/06/2026;Compra sintetica;-10,00\n"], "extrato.csv"));
    return f;
  }

  it.each([
    ["categories", "as categorias"],
    ["transactions", "os lançamentos já existentes"],
  ])("%s falhando recusa antes de gravar o lote", async (tabela, oQue) => {
    fake = criarSupabaseEmMemoria({ categories: [], transactions: [] }, { falharLeitura: { [tabela]: "XX000" } });
    expect(await parseImportFile(formulario())).toEqual({ ok: false, error: ANTES(oQue) });
    expect(escritas()).toEqual([]);
  });

  it("lançamentos existentes cortados pelo max_rows recusam — a dedup não roda sobre um conjunto parcial", async () => {
    fake = criarSupabaseEmMemoria(
      {
        categories: [],
        transactions: [
          { id: "t1", account_id: CONTA, purchase_date: "2026-05-01", amount: 1, description: "a" },
          { id: "t2", account_id: CONTA, purchase_date: "2026-05-02", amount: 2, description: "b" },
        ],
      },
      { maxRows: 1 },
    );
    expect(await parseImportFile(formulario())).toEqual({
      ok: false,
      error: ANTES("os lançamentos já existentes"),
    });
    expect(escritas()).toEqual([]);
  });
});

describe("03-G L6c2 · remapImportBatch", () => {
  const lote = () => ({
    import_batches: [
      { id: "lote-1", origem: "conta", account_id: CONTA, credit_card_id: null, status: "revisando", column_mapping: { headers: ["data"] } },
    ],
    import_rows: [
      { id: "ir-1", import_batch_id: "lote-1", linha_index: 0, raw: ["01/06/2026"] },
      { id: "ir-2", import_batch_id: "lote-1", linha_index: 1, raw: ["02/06/2026"] },
    ],
    categories: [],
    transactions: [],
  });

  it("linhas cortadas pelo max_rows recusam ANTES de apagar as linhas do lote", async () => {
    fake = criarSupabaseEmMemoria(lote(), { maxRows: 1 });
    expect(await remapImportBatch("lote-1", { fields: { data: 0 } })).toEqual({
      ok: false,
      error: ANTES("as linhas da importação"),
    });
    expect(escritas()).toEqual([]);
    expect(fake.tabelas.import_rows).toHaveLength(2);
  });

  it("lote falhando recusa sem escrever", async () => {
    fake = criarSupabaseEmMemoria(lote(), { falharLeitura: { import_batches: "XX000" } });
    expect(await remapImportBatch("lote-1", { fields: { data: 0 } })).toEqual({
      ok: false,
      error: ANTES("o lote da importação"),
    });
    expect(escritas()).toEqual([]);
  });
});

describe("03-G L6c2 · edição na revisão", () => {
  it("updateImportRow: linha falhando não vira 'não encontrada'", async () => {
    fake = criarSupabaseEmMemoria({ import_rows: [{ id: "ir-1" }] }, { falharLeitura: { import_rows: "XX000" } });
    expect(await updateImportRow("ir-1", { status: "ignorada" })).toEqual({
      ok: false,
      error: ANTES("a linha da importação"),
    });
    expect(escritas()).toEqual([]);
  });

  it("setImportBatchCompetencia: lote falhando recusa sem escrever", async () => {
    fake = criarSupabaseEmMemoria({ import_batches: [{ id: "lote-1" }] }, { falharLeitura: { import_batches: "XX000" } });
    expect(await setImportBatchCompetencia("lote-1", "2026-06-01")).toEqual({
      ok: false,
      error: ANTES("o lote da importação"),
    });
    expect(escritas()).toEqual([]);
  });
});

describe("03-G L6c2 · commitImport", () => {
  const lote = () => ({
    import_batches: [
      { id: "lote-1", origem: "conta", account_id: CONTA, credit_card_id: null, status: "revisando", competencia_fatura: null },
    ],
    import_rows: [
      // data ausente: o laço marca a linha como erro (uma escrita) e segue.
      { id: "ir-1", import_batch_id: "lote-1", linha_index: 0, status: "para_importar", data_norm: null, valor: 10 },
      { id: "ir-2", import_batch_id: "lote-1", linha_index: 1, status: "para_importar", data_norm: null, valor: 20 },
    ],
  });

  it("linhas a importar cortadas pelo max_rows: nada é importado e o lote não vira 'importado'", async () => {
    fake = criarSupabaseEmMemoria(lote(), { maxRows: 1 });
    expect(await commitImport("lote-1")).toEqual({ ok: false, error: ANTES("as linhas da importação") });
    expect(escritas()).toEqual([]);
  });

  it("recontagem falhando depois do laço: o lote não é marcado como importado e a frase é a de 'depois'", async () => {
    const opcoes: {
      falharLeitura: Record<string, string>;
      antesDeGravar: (op: { tabela: string; tipo: string }) => null;
    } = {
      falharLeitura: {},
      // A leitura das linhas passa a falhar só depois da primeira escrita do laço.
      antesDeGravar: ({ tabela, tipo }) => {
        if (tabela === "import_rows" && tipo === "update") opcoes.falharLeitura.import_rows = "XX000";
        return null;
      },
    };
    fake = criarSupabaseEmMemoria(lote(), opcoes);
    expect(await commitImport("lote-1")).toEqual({
      ok: false,
      error:
        "Não foi possível ler as linhas da importação. A alteração pode ter sido gravada em parte: recarregue a página para conferir.",
    });
    expect(escritas().map((o) => `${o.tabela}:${o.tipo}`)).toEqual(["import_rows:update", "import_rows:update"]);
    expect(fake.tabelas.import_batches[0]).toMatchObject({ status: "revisando" });
  });
});

describe("03-G L6c2 · undoImportBatch", () => {
  const lote = () => ({
    import_batches: [{ id: "lote-1", status: "importado" }],
    import_rows: [
      { id: "ir-1", import_batch_id: "lote-1", transaction_id: "tx-1", status: "importada" },
      { id: "ir-2", import_batch_id: "lote-1", transaction_id: "tx-2", status: "importada" },
    ],
    transactions: [
      { id: "tx-1", statement_id: "st-1" },
      { id: "tx-2", statement_id: "st-1" },
    ],
    transaction_installments: [],
    card_statements: [{ id: "st-1", competencia: "2026-06-01", pago_em: "2026-06-20" }],
    receivables: [],
  });

  it("faturas falhando: a fatura paga não passa despercebida — recusa sem apagar", async () => {
    fake = criarSupabaseEmMemoria(lote(), { falharLeitura: { card_statements: "XX000" } });
    expect(await undoImportBatch("lote-1")).toEqual({ ok: false, error: ANTES("as faturas") });
    expect(escritas()).toEqual([]);
    expect(fake.tabelas.transactions).toHaveLength(2);
  });

  it("linhas cortadas pelo max_rows recusam — desfazer só parte deixaria lançamento sem linha", async () => {
    fake = criarSupabaseEmMemoria(lote(), { maxRows: 1 });
    expect(await undoImportBatch("lote-1")).toEqual({ ok: false, error: ANTES("as linhas da importação") });
    expect(escritas()).toEqual([]);
  });

  it("sem erro, a fatura paga continua barrando como antes", async () => {
    fake = criarSupabaseEmMemoria(lote());
    expect(await undoImportBatch("lote-1")).toEqual({
      ok: false,
      error: "Fatura já paga (06/2026). Desfaça o pagamento em Faturas antes de desfazer a importação.",
    });
  });
});
