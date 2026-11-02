/**
 * 03-G2 (S10, S11, D-G2-11) — as ESCRITAS da importação: o commit reserva cada linha antes de
 * criar o lançamento e confere tudo; as escritas soltas de parse, remap e desfazer também.
 * Fixture sintética (o repositório é público).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria, type ErroSimulado, type Linha } from "@/test/supabase-em-memoria";
import {
  FRASE_DO_LOTE_NAO_MARCADO,
  MOTIVO_IMPORTACAO_INTERROMPIDA,
  fraseDoCommitInterrompido,
} from "@/lib/import/frases-do-commit";

let fake = criarSupabaseEmMemoria({});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const { parseImportFile, remapImportBatch, commitImport, undoImportBatch } = await import(
  "@/lib/actions/imports"
);

const CONTA = "4d5e6f7a-8b9c-4d0e-9f1a-3b4c5d6e7f8a";
const ID_NOVO = "7c1d5e90-4b2a-4f36-8d10-5a9e3b7c2f84";
const RPC_OK = { rpc: () => ({ data: ID_NOVO, error: null }) };
const RECUSA: ErroSimulado = { code: "XX000", message: "recusado pelo teste" };

const linhaDe = (n: number): Linha => ({
  id: `ir-${n}`,
  import_batch_id: "lote-1",
  linha_index: n,
  status: "para_importar",
  data_norm: "2031-03-10",
  valor: 12.34,
  descricao: `Linha sintética ${n}`,
  tipo: "despesa",
  import_as: "single",
  classificacao: "pessoal",
  split_parts: [],
  transfer_account_id: null,
  categoria_sugerida_id: null,
  subcategoria_sugerida_id: null,
  parcela: null,
  parcelas_total: null,
});

function lote(linhas = 2): Record<string, Linha[]> {
  return {
    import_batches: [
      { id: "lote-1", origem: "conta", account_id: CONTA, credit_card_id: null, status: "revisando", competencia_fatura: null },
    ],
    import_rows: Array.from({ length: linhas }, (_, i) => linhaDe(i + 1)),
  };
}

const linha = (id: string) => fake.tabelas.import_rows.find((l) => l.id === id) as Linha;
const rpcs = () => fake.operacoes.filter((o) => o.tipo === "rpc");

beforeEach(() => {
  fake = criarSupabaseEmMemoria({});
});

describe("03-G2 (S10, D-G2-11) · commitImport — reserva, cria, marca", () => {
  it("reserva antes de criar: update de import_rows (status erro + motivo de interrupção) vem antes da rpc/insert do lançamento", async () => {
    fake = criarSupabaseEmMemoria(lote(1), RPC_OK);
    const r = await commitImport("lote-1");
    expect(r).toEqual({ ok: true, data: { importadas: 1, falhas: 0 } });
    const ordem = fake.operacoes.map((o) => `${o.tabela}:${o.tipo}`);
    expect(ordem.slice(0, 3)).toEqual(["import_rows:update", "salvar_lancamento:rpc", "import_rows:update"]);
    expect(fake.operacoes[0].valores).toEqual({ status: "erro", motivo: MOTIVO_IMPORTACAO_INTERROMPIDA });
    expect(fake.operacoes[0].filtros).toEqual([
      ["eq", "id", "ir-1"],
      ["eq", "status", "para_importar"],
    ]);
    expect(linha("ir-1")).toMatchObject({ status: "importada", transaction_id: ID_NOVO, motivo: null });
    expect(fake.tabelas.import_batches[0]).toMatchObject({ status: "importado", total_importadas: 1 });
  });

  it("marca falha: o commit para", async () => {
    fake = criarSupabaseEmMemoria(lote(2), {
      ...RPC_OK,
      antesDeGravar: ({ tabela, tipo, valores }) =>
        tabela === "import_rows" && tipo === "update" && (valores as Linha).status === "importada"
          ? RECUSA
          : null,
    });
    const r = await commitImport("lote-1");
    expect(r).toEqual({ ok: false, error: fraseDoCommitInterrompido(1) });
    expect(r.ok === false && r.error).toContain("A importação parou depois de 1 linha(s).");
    // A 1ª ficou reservada, dizendo a verdade (Y16); a 2ª nem foi tocada.
    expect(linha("ir-1")).toMatchObject({ status: "erro", motivo: MOTIVO_IMPORTACAO_INTERROMPIDA });
    expect(linha("ir-2")).toMatchObject({ status: "para_importar" });
    expect(rpcs()).toHaveLength(1);
    expect(fake.tabelas.import_batches[0]).toMatchObject({ status: "revisando" });
  });

  it("dois commits: a linha entra uma vez", async () => {
    let primeira = true;
    fake = criarSupabaseEmMemoria(lote(2), {
      ...RPC_OK,
      antesDeGravar: ({ tabela, tipo, tabelas }) => {
        if (primeira && tabela === "import_rows" && tipo === "update") {
          primeira = false;
          // Outra execução reservou a ir-1 no meio (Y17).
          const outra = tabelas.import_rows.find((l) => l.id === "ir-1") as Linha;
          outra.status = "erro";
          outra.motivo = MOTIVO_IMPORTACAO_INTERROMPIDA;
        }
        return null;
      },
    });
    const r = await commitImport("lote-1");
    expect(r).toEqual({ ok: true, data: { importadas: 1, falhas: 0 } });
    // Só a ir-2 virou lançamento; a ir-1 continua com o que a outra execução deixou.
    expect(rpcs()).toHaveLength(1);
    expect(linha("ir-1")).toMatchObject({ status: "erro", motivo: MOTIVO_IMPORTACAO_INTERROMPIDA });
    expect(linha("ir-1").transaction_id).toBeUndefined();
    expect(linha("ir-2")).toMatchObject({ status: "importada", transaction_id: ID_NOVO });
  });

  it("criação falha: a frase da action vira o motivo e o commit segue", async () => {
    fake = criarSupabaseEmMemoria(lote(2), {
      rpc: () => ({ data: null, error: { code: "23514", message: "check_violation interna" } }),
    });
    const r = await commitImport("lote-1");
    expect(r).toEqual({ ok: true, data: { importadas: 0, falhas: 2 } });
    for (const id of ["ir-1", "ir-2"]) {
      expect(linha(id).status).toBe("erro");
      expect(linha(id).motivo).toMatch(/Nada foi alterado/);
      expect(linha(id).motivo).not.toBe(MOTIVO_IMPORTACAO_INTERROMPIDA);
      expect(String(linha(id).motivo)).not.toContain("check_violation");
    }
    expect(rpcs()).toHaveLength(2);
  });

  it("falha ao gravar o motivo da criação: a linha fica com o da reserva e o commit segue", async () => {
    fake = criarSupabaseEmMemoria(lote(2), {
      rpc: () => ({ data: null, error: { code: "23514", message: "x" } }),
      antesDeGravar: ({ tabela, tipo, valores }) =>
        tabela === "import_rows" && tipo === "update" && (valores as Linha).motivo !== MOTIVO_IMPORTACAO_INTERROMPIDA
          ? RECUSA
          : null,
    });
    const r = await commitImport("lote-1");
    expect(r).toEqual({ ok: true, data: { importadas: 0, falhas: 2 } });
    expect(linha("ir-1")).toMatchObject({ status: "erro", motivo: MOTIVO_IMPORTACAO_INTERROMPIDA });
    expect(linha("ir-2")).toMatchObject({ status: "erro", motivo: MOTIVO_IMPORTACAO_INTERROMPIDA });
  });

  it("reserva com erro: para sem criar nada", async () => {
    fake = criarSupabaseEmMemoria(lote(2), {
      ...RPC_OK,
      antesDeGravar: ({ tabela, tipo }) => (tabela === "import_rows" && tipo === "update" ? RECUSA : null),
    });
    const r = await commitImport("lote-1");
    expect(r).toEqual({ ok: false, error: fraseDoCommitInterrompido(0) });
    expect(rpcs()).toEqual([]);
    expect(linha("ir-1")).toMatchObject({ status: "para_importar" });
    expect(linha("ir-2")).toMatchObject({ status: "para_importar" });
  });

  it("linha sem data: reservada com o motivo próprio, conta como falha e o commit segue", async () => {
    const base = lote(2);
    base.import_rows[0] = { ...linhaDe(1), data_norm: null };
    fake = criarSupabaseEmMemoria(base, RPC_OK);
    const r = await commitImport("lote-1");
    expect(r).toEqual({ ok: true, data: { importadas: 1, falhas: 1 } });
    expect(linha("ir-1")).toMatchObject({ status: "erro", motivo: "Data ou valor ausente." });
    expect(rpcs()).toHaveLength(1);
  });

  it("linha sem data com erro na escrita: o commit para", async () => {
    const base = lote(2);
    base.import_rows[0] = { ...linhaDe(1), data_norm: null };
    fake = criarSupabaseEmMemoria(base, {
      ...RPC_OK,
      antesDeGravar: ({ tabela, tipo }) => (tabela === "import_rows" && tipo === "update" ? RECUSA : null),
    });
    expect(await commitImport("lote-1")).toEqual({ ok: false, error: fraseDoCommitInterrompido(0) });
    expect(rpcs()).toEqual([]);
  });

  it("lote não marcado: gravado em parte com FRASE_DO_LOTE_NAO_MARCADO", async () => {
    fake = criarSupabaseEmMemoria(lote(1), {
      ...RPC_OK,
      antesDeGravar: ({ tabela, tipo }) => (tabela === "import_batches" && tipo === "update" ? RECUSA : null),
    });
    expect(await commitImport("lote-1")).toEqual({ ok: false, error: FRASE_DO_LOTE_NAO_MARCADO });
    expect(linha("ir-1")).toMatchObject({ status: "importada" });
    expect(fake.tabelas.import_batches[0]).toMatchObject({ status: "revisando" });
    // Por que a frase não manda importar de novo: sem linha `para_importar`, o commit recusa
    // ANTES da recontagem — os totais não seriam atualizados.
    expect(await commitImport("lote-1")).toEqual({
      ok: false,
      error: "Não há linhas marcadas para importar neste lote.",
    });
  });
});

describe("03-G2 (S11) · as escritas soltas da importação", () => {
  function formulario() {
    const f = new FormData();
    f.set("origem", "conta");
    f.set("account_id", CONTA);
    f.set("file", new File(["data;descricao;valor\n01/06/2026;Compra sintetica;-10,00\n"], "extrato.csv"));
    return f;
  }

  it("parse: lote vazio que não saiu depois da falha das linhas é gravado em parte", async () => {
    fake = criarSupabaseEmMemoria(
      { categories: [], transactions: [] },
      {
        antesDeGravar: ({ tabela, tipo }) =>
          (tabela === "import_rows" && tipo === "insert") || (tabela === "import_batches" && tipo === "delete")
            ? RECUSA
            : null,
      },
    );
    expect(await parseImportFile(formulario())).toEqual({
      ok: false,
      error:
        "O lote foi registrado, mas as linhas do arquivo não foram salvas e o lote vazio não pôde ser removido. Exclua o lote em Importações e envie o arquivo de novo.",
    });
  });

  it("parse: compensação bem-sucedida mantém a mensagem de sempre e remove o lote", async () => {
    fake = criarSupabaseEmMemoria(
      { categories: [], transactions: [] },
      { antesDeGravar: ({ tabela, tipo }) => (tabela === "import_rows" && tipo === "insert" ? RECUSA : null) },
    );
    expect(await parseImportFile(formulario())).toEqual({
      ok: false,
      error: "Não foi possível salvar as linhas do arquivo.",
    });
    expect(fake.tabelas.import_batches).toEqual([]);
  });

  const loteRemap = () => ({
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
  const remap = () => remapImportBatch("lote-1", { fields: { data: 0 } });

  it("remap: delete das linhas antigas com erro — nada foi alterado", async () => {
    fake = criarSupabaseEmMemoria(loteRemap(), {
      antesDeGravar: ({ tabela, tipo }) => (tabela === "import_rows" && tipo === "delete" ? RECUSA : null),
    });
    expect(await remap()).toEqual({
      ok: false,
      error: "Não foi possível aplicar o mapeamento. Nada foi alterado.",
    });
    expect(fake.tabelas.import_rows).toHaveLength(2);
  });

  it("remap: insert das novas depois do delete com erro — reenviar o arquivo, porque o raw se foi", async () => {
    fake = criarSupabaseEmMemoria(loteRemap(), {
      antesDeGravar: ({ tabela, tipo }) => (tabela === "import_rows" && tipo === "insert" ? RECUSA : null),
    });
    expect(await remap()).toEqual({
      ok: false,
      error:
        "As linhas antigas do lote foram removidas e as novas não foram salvas. Exclua o lote em Importações e envie o arquivo de novo.",
    });
    expect(fake.tabelas.import_rows).toEqual([]);
  });

  it("remap: update do lote com erro — as linhas novas guardam o raw, então aplicar de novo funciona", async () => {
    fake = criarSupabaseEmMemoria(loteRemap(), {
      antesDeGravar: ({ tabela, tipo }) => (tabela === "import_batches" && tipo === "update" ? RECUSA : null),
    });
    expect(await remap()).toEqual({
      ok: false,
      error: "As linhas foram remapeadas, mas o lote não foi atualizado. Aplique o mapeamento de novo.",
    });
    // A premissa da frase: as linhas novas carregam o dado cru que o próximo remap lê.
    expect(fake.tabelas.import_rows.length).toBeGreaterThan(0);
    expect(fake.tabelas.import_rows.every((l) => Array.isArray(l.raw))).toBe(true);
  });

  const loteDesfazer = () => ({
    import_batches: [{ id: "lote-1", status: "importado", total_importadas: 1 }],
    import_rows: [{ id: "ir-1", import_batch_id: "lote-1", transaction_id: "tx-imp", status: "importada" }],
    transactions: [{ id: "tx-imp", statement_id: null }],
    transaction_installments: [],
    card_statements: [],
    receivables: [],
    receivable_receipts: [],
  });

  it("desfazer: 1º update (linhas → para_importar) com erro — lançamentos removidos, saída é reenviar", async () => {
    fake = criarSupabaseEmMemoria(loteDesfazer(), {
      antesDeGravar: ({ tabela, tipo }) => (tabela === "import_rows" && tipo === "update" ? RECUSA : null),
    });
    expect(await undoImportBatch("lote-1")).toEqual({
      ok: false,
      error:
        "Os lançamentos do lote foram removidos, mas as linhas não voltaram para a revisão. Exclua o lote em Importações e envie o arquivo de novo.",
    });
    expect(fake.tabelas.transactions).toEqual([]);
    expect(fake.tabelas.import_batches[0]).toMatchObject({ status: "importado" });
  });

  it("desfazer: 2º update (lote → revisando) com erro — as linhas já voltaram, o lote não", async () => {
    fake = criarSupabaseEmMemoria(loteDesfazer(), {
      antesDeGravar: ({ tabela, tipo }) => (tabela === "import_batches" && tipo === "update" ? RECUSA : null),
    });
    expect(await undoImportBatch("lote-1")).toEqual({
      ok: false,
      error:
        "Os lançamentos foram removidos e as linhas voltaram para a revisão, mas o lote continua marcado como importado, com o total antigo. As linhas podem ser corrigidas no lote e importadas de novo quando quiser.",
    });
    expect(fake.tabelas.import_rows[0]).toMatchObject({ status: "para_importar", transaction_id: null });
  });
});
