/**
 * REDESIGN-04-C · T4 — a LEITURA do reembolso e a proteção que só conta o recebimento MANUAL.
 *
 * A montagem do estado é pura (`montarEstadoDoReembolso`) e roda aqui sem banco; a leitura e a
 * proteção rodam sobre o client em memória. Fixture sintética.
 */
import { describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria, MENSAGEM_DO_BANCO_SIMULADA, type Linha } from "@/test/supabase-em-memoria";
import { ErroDeLeitura } from "@/lib/supabase/leitura";
import { ehManual, montarEstadoDoReembolso } from "@/lib/finance/recebimentos";
import { realocar, situacaoDaPessoa } from "@/lib/finance/reembolso";

// O `deletePerson` abaixo lê pelo client de servidor; as leituras recebem o dublê direto.
let fakeDoServidor = criarSupabaseEmMemoria({});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fakeDoServidor.client }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const { deletePerson } = await import("@/lib/actions/people");
import {
  lerEstadoDoReembolso,
  lerSituacoesDoReembolso,
  protecaoDosRecebiveis,
} from "@/lib/finance/recebimentos-leitura";
import type { ClienteSupabase } from "@/lib/finance/recebimentos-leitura";

const PESSOA = "pessoa-1";

const recebivel = (id: string, extra: Linha = {}): Linha => ({
  id,
  person_id: PESSOA,
  valor: 100,
  status: "pendente",
  data_prevista: null,
  created_at: "2026-07-15T12:00:00Z",
  statement: null,
  transaction: null,
  ...extra,
});

const receita = (id: string, extra: Linha = {}): Linha => ({
  id,
  reembolso_pessoa_id: PESSOA,
  type: "receita",
  status: "recebido",
  amount: 50,
  valor_pessoal: null,
  account_id: "conta-1",
  liquidado_em: null,
  competence_date: "2026-08-10",
  created_at: "2026-08-10T15:00:00Z",
  ...extra,
});

const recebimento = (id: string, receivable_id: string, extra: Linha = {}): Linha => ({
  id,
  receivable_id,
  valor: 10,
  recebido_em: "2026-08-01",
  created_at: "2026-08-01T12:00:00Z",
  transaction_id: null,
  ...extra,
});

type Entrada = Parameters<typeof montarEstadoDoReembolso>[0];
const montar = (e: { receitas?: Linha[]; recebiveis?: Linha[]; recebimentos?: Linha[] }) =>
  montarEstadoDoReembolso({
    receitas: (e.receitas ?? []) as unknown as Entrada["receitas"],
    recebiveis: (e.recebiveis ?? []) as unknown as Entrada["recebiveis"],
    recebimentos: (e.recebimentos ?? []) as unknown as Entrada["recebimentos"],
  });

describe("ehManual", () => {
  it("recebimento sem transaction_id é manual; com id, automático; sem a chave, manual", () => {
    expect(ehManual({ transaction_id: null })).toBe(true);
    expect(ehManual({})).toBe(true);
    expect(ehManual({ transaction_id: "tx-1" })).toBe(false);
  });
});

describe("montarEstadoDoReembolso — dataDaDivida", () => {
  it("com fatura: o vencimento da fatura", () => {
    const e = montar({
      recebiveis: [
        recebivel("r1", {
          statement: { data_vencimento: "2026-07-20" },
          transaction: { competence_date: "2026-06-01" },
          data_prevista: "2026-05-01",
        }),
      ],
    });
    expect(e.dividas[0].dataDaDivida).toBe("2026-07-20");
  });

  it("sem fatura: a competência do lançamento de origem", () => {
    const e = montar({
      recebiveis: [recebivel("r1", { transaction: { competence_date: "2026-06-01" }, data_prevista: "2026-05-01" })],
    });
    expect(e.dividas[0].dataDaDivida).toBe("2026-06-01");
  });

  it("sem fatura nem origem: a data prevista", () => {
    const e = montar({ recebiveis: [recebivel("r1", { data_prevista: "2026-05-01" })] });
    expect(e.dividas[0].dataDaDivida).toBe("2026-05-01");
  });

  it("sem nada: o dia de criação em BRASÍLIA, não em UTC", () => {
    const e = montar({ recebiveis: [recebivel("r1", { created_at: "2026-07-11T01:30:00Z" })] });
    expect(e.dividas[0].dataDaDivida).toBe("2026-07-10");
  });
});

describe("montarEstadoDoReembolso — recebido manual e alocações", () => {
  it("valores em reais viram centavos; só o recebimento manual entra em recebidoManual", () => {
    const e = montar({
      recebiveis: [recebivel("r1", { valor: 100.1 })],
      recebimentos: [
        recebimento("m1", "r1", { valor: 20.05 }),
        recebimento("a1", "r1", { valor: 30, transaction_id: "tx-1" }),
      ],
      receitas: [receita("tx-1")],
    });
    expect(e.dividas[0].valorCentavos).toBe(10010);
    expect(e.dividas[0].recebidoManualCentavos).toBe(2005);
  });

  it("o recebimento automático NÃO entra em recebidoManual e entra em alocações", () => {
    const e = montar({
      recebiveis: [recebivel("r1")],
      receitas: [receita("tx-1")],
      recebimentos: [recebimento("a1", "r1", { valor: 30, transaction_id: "tx-1", recebido_em: "2026-08-10" })],
    });
    expect(e.dividas[0].recebidoManualCentavos).toBe(0);
    expect(e.alocacoes).toEqual([
      {
        id: "a1",
        receivableId: "r1",
        transactionId: "tx-1",
        valorCentavos: 3000,
        recebidoEm: "2026-08-10",
        criadoEm: "2026-08-01T12:00:00Z",
      },
    ]);
  });

  it("legado K0: pago sem nenhum recebimento conta o valor inteiro como recebido manual", () => {
    const e = montar({ recebiveis: [recebivel("r1", { status: "pago", valor: 80 })] });
    expect(e.dividas[0].recebidoManualCentavos).toBe(8000);
  });

  it("pago COM recebimento manual: só o que foi recebido, sem inventar o legado", () => {
    const e = montar({
      recebiveis: [recebivel("r1", { status: "pago", valor: 80 })],
      recebimentos: [recebimento("m1", "r1", { valor: 80 })],
    });
    expect(e.dividas[0].recebidoManualCentavos).toBe(8000);
  });

  it("pendente sem recebimento: zero recebido", () => {
    const e = montar({ recebiveis: [recebivel("r1")] });
    expect(e.dividas[0].recebidoManualCentavos).toBe(0);
  });

  it("recebimento automático de recebível de OUTRA pessoa, de receita DESTA, entra (a regra o remove)", () => {
    const e = montar({
      recebiveis: [recebivel("r1")],
      receitas: [receita("tx-1")],
      recebimentos: [recebimento("a1", "r-de-outro", { transaction_id: "tx-1" })],
    });
    expect(e.alocacoes.map((a) => a.id)).toEqual(["a1"]);
    expect(realocar(e).remover).toEqual(["a1"]);
  });

  it("recebimento manual de recebível alheio ao conjunto é ignorado", () => {
    const e = montar({
      recebiveis: [recebivel("r1")],
      recebimentos: [recebimento("m1", "r-de-outro", { valor: 90 })],
    });
    expect(e.dividas[0].recebidoManualCentavos).toBe(0);
    expect(e.alocacoes).toEqual([]);
  });
});

describe("montarEstadoDoReembolso — pagamentos", () => {
  it("parte = amount − valor_pessoal; data = liquidado_em, senão a competência", () => {
    const e = montar({
      receitas: [
        receita("tx-1", { amount: 2500, valor_pessoal: 500, liquidado_em: "2026-08-12" }),
        receita("tx-2", { amount: 70.1, valor_pessoal: null }),
      ],
    });
    expect(e.pagamentos).toEqual([
      {
        transactionId: "tx-1",
        contaId: "conta-1",
        parteCentavos: 200000,
        recebidoEm: "2026-08-12",
        criadoEm: "2026-08-10T15:00:00Z",
      },
      {
        transactionId: "tx-2",
        contaId: "conta-1",
        parteCentavos: 7010,
        recebidoEm: "2026-08-10",
        criadoEm: "2026-08-10T15:00:00Z",
      },
    ]);
  });

  it("receita pendente não vira pagamento", () => {
    const e = montar({ receitas: [receita("tx-1", { status: "pendente" })] });
    expect(e.pagamentos).toEqual([]);
  });

  it("o que não é receita ou não tem parte positiva não vira pagamento", () => {
    const e = montar({
      receitas: [
        receita("tx-1", { type: "despesa" }),
        receita("tx-2", { amount: 50, valor_pessoal: 50 }),
      ],
    });
    expect(e.pagamentos).toEqual([]);
  });
});

describe("montarEstadoDoReembolso — situação", () => {
  it("devido e saldo a favor saem do estado montado", () => {
    const e = montar({
      recebiveis: [recebivel("r1", { valor: 100 })],
      receitas: [receita("tx-1", { amount: 150 })],
    });
    // O estado ainda não foi realocado: a regra aplica o que falta (100 abatidos, 50 de crédito).
    expect(situacaoDaPessoa(e)).toEqual({ devidoCentavos: 0, saldoAFavorCentavos: 5000 });
  });
});

describe("protecaoDosRecebiveis — só o recebimento MANUAL protege", () => {
  const cliente = (recebimentos: Linha[]) =>
    criarSupabaseEmMemoria({
      receivables: [{ id: "r1", transaction_id: "t1", status: "pendente" }],
      receivable_receipts: recebimentos,
    });

  it("caso 8: só recebimento automático → temRecebimento falso", async () => {
    const fake = cliente([recebimento("a1", "r1", { transaction_id: "tx-receita" })]);
    const r = await protecaoDosRecebiveis(fake.client as ClienteSupabase, { transactionIds: ["t1"] });
    expect(r).toEqual({ erro: false, recebiveis: [{ status: "pendente", temRecebimento: false }] });
  });

  it("caso 9: recebimento manual → temRecebimento verdadeiro", async () => {
    const fake = cliente([recebimento("m1", "r1")]);
    const r = await protecaoDosRecebiveis(fake.client as ClienteSupabase, { transactionIds: ["t1"] });
    expect(r).toEqual({ erro: false, recebiveis: [{ status: "pendente", temRecebimento: true }] });
  });

  it("manual e automático juntos → verdadeiro", async () => {
    const fake = cliente([recebimento("a1", "r1", { transaction_id: "tx" }), recebimento("m1", "r1")]);
    const r = await protecaoDosRecebiveis(fake.client as ClienteSupabase, { transactionIds: ["t1"] });
    expect(r).toMatchObject({ recebiveis: [{ temRecebimento: true }] });
  });
});

describe("lerEstadoDoReembolso", () => {
  const tabelas = () => ({
    transactions: [
      receita("tx-1", { user_id: "user-1" }),
      receita("tx-2", { user_id: "user-1", reembolso_pessoa_id: "outra" }),
    ],
    receivables: [
      recebivel("r1", { user_id: "user-1", statement: { data_vencimento: "2026-07-20" } }),
      recebivel("r2", { user_id: "user-1", person_id: "outra" }),
    ],
    receivable_receipts: [
      recebimento("m1", "r1", { valor: 25 }),
      recebimento("a1", "r1", { valor: 10, transaction_id: "tx-1" }),
      recebimento("x1", "r2", { valor: 99 }),
    ],
  });

  it("monta o estado só da pessoa pedida", async () => {
    const fake = criarSupabaseEmMemoria(tabelas());
    const e = await lerEstadoDoReembolso(fake.client as ClienteSupabase, PESSOA);
    expect(e.pagamentos.map((p) => p.transactionId)).toEqual(["tx-1"]);
    expect(e.dividas.map((d) => [d.receivableId, d.dataDaDivida, d.recebidoManualCentavos])).toEqual([
      ["r1", "2026-07-20", 2500],
    ]);
    expect(e.alocacoes.map((a) => a.id)).toEqual(["a1"]);
  });

  it("pessoa sem nada devolve o estado vazio (e isso é fato, não erro)", async () => {
    const fake = criarSupabaseEmMemoria({ transactions: [], receivables: [], receivable_receipts: [] });
    expect(await lerEstadoDoReembolso(fake.client as ClienteSupabase, PESSOA)).toEqual({
      pagamentos: [],
      dividas: [],
      alocacoes: [],
    });
  });

  it.each(["transactions", "receivables", "receivable_receipts"])(
    "falha ao ler %s lança ErroDeLeitura sem o texto do banco",
    async (tabela) => {
      const fake = criarSupabaseEmMemoria(tabelas(), { falharLeitura: { [tabela]: "42501" } });
      const falha = await lerEstadoDoReembolso(fake.client as ClienteSupabase, PESSOA).catch((x) => x);
      expect(falha).toBeInstanceOf(ErroDeLeitura);
      expect(String((falha as Error).message)).not.toContain(MENSAGEM_DO_BANCO_SIMULADA);
    },
  );

  it("leitura cortada pelo max_rows lança em vez de afirmar um estado incompleto", async () => {
    const fake = criarSupabaseEmMemoria(tabelas(), { maxRows: 1 });
    await expect(lerEstadoDoReembolso(fake.client as ClienteSupabase, PESSOA)).rejects.toBeInstanceOf(ErroDeLeitura);
  });
});

describe("lerSituacoesDoReembolso", () => {
  it("devido e saldo a favor por pessoa; quem não tem recebível nem receita vinculada não aparece", async () => {
    const fake = criarSupabaseEmMemoria({
      transactions: [
        receita("tx-1", { user_id: "user-1", amount: 30 }),
        receita("tx-2", { user_id: "user-1", reembolso_pessoa_id: "pessoa-2", amount: 40 }),
      ],
      receivables: [
        recebivel("r1", { user_id: "user-1", valor: 100 }),
        recebivel("r2", { user_id: "user-1", person_id: "pessoa-3", valor: 50 }),
      ],
      receivable_receipts: [recebimento("a1", "r1", { valor: 30, transaction_id: "tx-1" })],
    });
    const mapa = await lerSituacoesDoReembolso({ client: fake.client as ClienteSupabase, userId: "user-1" });
    expect(Object.fromEntries(mapa)).toEqual({
      "pessoa-1": { devidoCentavos: 7000, saldoAFavorCentavos: 0 },
      "pessoa-2": { devidoCentavos: 0, saldoAFavorCentavos: 4000 },
      "pessoa-3": { devidoCentavos: 5000, saldoAFavorCentavos: 0 },
    });
  });

  it("com owner, só as linhas do dono entram", async () => {
    const fake = criarSupabaseEmMemoria({
      transactions: [],
      receivables: [
        recebivel("r1", { user_id: "user-1", valor: 100 }),
        recebivel("r9", { user_id: "outro-dono", valor: 900 }),
      ],
      receivable_receipts: [],
    });
    const mapa = await lerSituacoesDoReembolso({ client: fake.client as ClienteSupabase, userId: "user-1" });
    expect(mapa.get(PESSOA)).toEqual({ devidoCentavos: 10000, saldoAFavorCentavos: 0 });
  });

  it("falha de leitura lança ErroDeLeitura (nunca um mapa vazio)", async () => {
    const fake = criarSupabaseEmMemoria(
      { transactions: [], receivables: [], receivable_receipts: [] },
      { falharLeitura: { receivables: "XX000" } },
    );
    await expect(
      lerSituacoesDoReembolso({ client: fake.client as ClienteSupabase, userId: "user-1" }),
    ).rejects.toBeInstanceOf(ErroDeLeitura);
  });
});

describe("deletePerson — receita vinculada também é histórico", () => {
  const PESSOA_ID = "1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b";
  const escritas = () => fakeDoServidor.operacoes.filter((o) => o.tipo !== "rpc");

  it("só com receita vinculada (sem recebível nem divisão): recusa e manda inativar", async () => {
    fakeDoServidor = criarSupabaseEmMemoria({
      people: [{ id: PESSOA_ID }],
      receivables: [],
      shared_expenses: [],
      transactions: [{ id: "tx-1", reembolso_pessoa_id: PESSOA_ID }],
    });
    const r = await deletePerson(PESSOA_ID);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Inative-a em vez de excluir");
    expect(escritas()).toEqual([]);
    expect(fakeDoServidor.tabelas.people).toHaveLength(1);
  });

  it("receita de OUTRA pessoa não segura esta", async () => {
    fakeDoServidor = criarSupabaseEmMemoria({
      people: [{ id: PESSOA_ID }],
      receivables: [],
      shared_expenses: [],
      transactions: [{ id: "tx-1", reembolso_pessoa_id: "outra" }],
    });
    expect(await deletePerson(PESSOA_ID)).toEqual({ ok: true, data: undefined });
  });

  it("contagem das receitas falhando não exclui a pessoa", async () => {
    fakeDoServidor = criarSupabaseEmMemoria(
      { people: [{ id: PESSOA_ID }], receivables: [], shared_expenses: [], transactions: [] },
      { falharLeitura: { transactions: "XX000" } },
    );
    expect(await deletePerson(PESSOA_ID)).toEqual({
      ok: false,
      error: "Não foi possível ler o histórico da pessoa. Nada foi alterado.",
    });
    expect(escritas()).toEqual([]);
    expect(fakeDoServidor.tabelas.people).toHaveLength(1);
  });
});
