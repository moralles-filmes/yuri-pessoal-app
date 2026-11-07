/**
 * REDESIGN-04-C · T8 — `lerReembolsosPorPessoa`: as situações E os pagamentos saem das MESMAS
 * consultas. Client em memória, fixture sintética.
 */
import { describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria, type Linha } from "@/test/supabase-em-memoria";
import { ErroDeLeitura } from "@/lib/supabase/leitura";

vi.mock("@/lib/supabase/server", () => ({ createClient: async () => criarSupabaseEmMemoria({}).client }));
import {
  lerReembolsosPorPessoa,
  lerSituacoesDoReembolso,
  type ClienteSupabase,
} from "@/lib/finance/recebimentos-leitura";

const DONO = "user-1";

const receita = (id: string, pessoa: string, extra: Linha = {}): Linha => ({
  id,
  user_id: DONO,
  reembolso_pessoa_id: pessoa,
  type: "receita",
  status: "recebido",
  amount: 500,
  valor_pessoal: null,
  account_id: "conta-1",
  liquidado_em: null,
  competence_date: "2026-11-01",
  created_at: "2026-11-01T12:00:00Z",
  ...extra,
});

const recebivel = (id: string, pessoa: string, extra: Linha = {}): Linha => ({
  id,
  user_id: DONO,
  person_id: pessoa,
  valor: 500,
  status: "pendente",
  data_prevista: null,
  created_at: "2026-07-15T12:00:00Z",
  statement: null,
  transaction: null,
  ...extra,
});

const owner = (fake: ReturnType<typeof criarSupabaseEmMemoria>) => ({
  client: fake.client as ClienteSupabase,
  userId: DONO,
});

describe("lerReembolsosPorPessoa", () => {
  const tabelas = () => ({
    transactions: [
      receita("t-antiga", "p-a", { liquidado_em: "2026-10-05", amount: 300 }),
      receita("t-nova", "p-a", { liquidado_em: "2026-11-03", amount: 700, valor_pessoal: 200 }),
      receita("t-pendente", "p-a", { status: "pendente" }),
      receita("t-outra", "p-b", { amount: 40 }),
    ],
    receivables: [recebivel("r1", "p-a"), recebivel("r2", "p-a"), recebivel("r9", "p-c")],
    receivable_receipts: [],
  });

  it("os pagamentos são as receitas RECEBIDAS da pessoa, pela parte dela, mais recente primeiro", async () => {
    const { pagamentos } = await lerReembolsosPorPessoa(owner(criarSupabaseEmMemoria(tabelas())));
    expect(pagamentos.get("p-a")).toEqual([
      { transactionId: "t-nova", centavos: 50000, data: "2026-11-03", contaId: "conta-1" },
      { transactionId: "t-antiga", centavos: 30000, data: "2026-10-05", contaId: "conta-1" },
    ]);
    expect(pagamentos.get("p-b")).toEqual([
      { transactionId: "t-outra", centavos: 4000, data: "2026-11-01", contaId: "conta-1" },
    ]);
    expect(pagamentos.get("p-c")).toEqual([]);
  });

  it("as situações e os pagamentos cobrem as mesmas pessoas", async () => {
    const { situacoes, pagamentos } = await lerReembolsosPorPessoa(owner(criarSupabaseEmMemoria(tabelas())));
    expect([...situacoes.keys()].sort()).toEqual(["p-a", "p-b", "p-c"]);
    expect([...pagamentos.keys()].sort()).toEqual(["p-a", "p-b", "p-c"]);
  });

  it("lerSituacoesDoReembolso devolve exatamente as situações", async () => {
    const completo = await lerReembolsosPorPessoa(owner(criarSupabaseEmMemoria(tabelas())));
    const soSituacoes = await lerSituacoesDoReembolso(owner(criarSupabaseEmMemoria(tabelas())));
    expect(Object.fromEntries(soSituacoes)).toEqual(Object.fromEntries(completo.situacoes));
  });

  it("só as linhas do dono entram", async () => {
    const fake = criarSupabaseEmMemoria({
      transactions: [receita("t-alheia", "p-a", { user_id: "outro-dono" })],
      receivables: [recebivel("r-alheio", "p-a", { user_id: "outro-dono" })],
      receivable_receipts: [],
    });
    const { situacoes, pagamentos } = await lerReembolsosPorPessoa(owner(fake));
    expect(situacoes.size).toBe(0);
    expect(pagamentos.size).toBe(0);
  });

  it("falha de leitura lança ErroDeLeitura (nunca 'não deve nada')", async () => {
    const fake = criarSupabaseEmMemoria(tabelas(), { falharLeitura: { transactions: "XX000" } });
    await expect(lerReembolsosPorPessoa(owner(fake))).rejects.toBeInstanceOf(ErroDeLeitura);
  });
});
