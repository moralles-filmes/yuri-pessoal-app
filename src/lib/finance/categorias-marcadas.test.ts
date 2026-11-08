/**
 * 03-C2 · A6 — `getTransactions` com o filtro de categoria marcada, sobre o client em memória.
 * Fixture sintética.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria, type Linha } from "@/test/supabase-em-memoria";

let fake = criarSupabaseEmMemoria({});
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => fake.client }));

const { getTransactions } = await import("@/lib/finance/queries");

const tx = (id: string, category_id: string | null): Linha => ({
  id,
  user_id: "user-1",
  type: "receita",
  category_id,
  competence_date: "2026-06-10",
});

const TRES = [tx("t-marcada", "cat-m"), tx("t-outra", "cat-n"), tx("t-sem", null)];

beforeEach(() => {
  fake = criarSupabaseEmMemoria({
    categories: [
      { id: "cat-m", user_id: "user-1", kind: "receita", classificacao_padrao: "terceiro" },
      { id: "cat-n", user_id: "user-1", kind: "receita", classificacao_padrao: null },
    ],
    transactions: TRES,
  });
});

describe("03-C2 · A6 — o filtro de categoria marcada", () => {
  it("ligado, só vêm os lançamentos de categoria marcada", async () => {
    const r = await getTransactions({ categoriasMarcadas: true });
    expect(r.linhas.map((t) => t.id)).toEqual(["t-marcada"]);
  });
  it("sem nenhuma categoria marcada, a lista é vazia", async () => {
    fake = criarSupabaseEmMemoria({
      categories: [{ id: "cat-n", user_id: "user-1", kind: "receita", classificacao_padrao: null }],
      transactions: TRES,
    });
    expect((await getTransactions({ categoriasMarcadas: true })).linhas).toEqual([]);
  });
  it("desligado, nada é peneirado", async () => {
    expect((await getTransactions({})).linhas.map((t) => t.id).sort()).toEqual(["t-marcada", "t-outra", "t-sem"]);
  });
  it("combina em E com o filtro de categoria", async () => {
    expect((await getTransactions({ categoriasMarcadas: true, categoryId: "cat-n" })).linhas).toEqual([]);
  });
});
