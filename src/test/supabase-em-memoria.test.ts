import { describe, expect, it } from "vitest";
import { criarSupabaseEmMemoria } from "@/test/supabase-em-memoria";

/** Só a cadeia que estes testes usam — o dublê não tem o tipo real do client. */
type Resultado = { data: unknown; error: { code: string; message: string } | null };
type Consulta = PromiseLike<Resultado> & {
  insert(v: Record<string, unknown>): Consulta;
  update(v: Record<string, unknown>): Consulta;
  select(colunas?: string): Consulta;
  in(coluna: string, alvo: unknown[]): Consulta;
  not(coluna: string, op: string, alvo: unknown): Consulta;
};
type Builder = { from: (t: string) => Consulta };

describe("harness em memória — extensões da 03-D", () => {
  it("antesDeGravar recusa a escrita, devolve o erro e NÃO registra operação", async () => {
    const fake = criarSupabaseEmMemoria(
      { t: [] },
      { antesDeGravar: ({ tabela }) => (tabela === "t" ? { code: "23514", message: "x" } : null) },
    );
    const r = await (fake.client as Builder).from("t").insert({ a: 1 });
    expect(r.error?.code).toBe("23514");
    expect(fake.tabelas.t).toHaveLength(0);
    expect(fake.escritas("t")).toHaveLength(0);
  });

  it("update().select() devolve as linhas alteradas", async () => {
    const fake = criarSupabaseEmMemoria({ t: [{ id: "1", s: "a" }, { id: "2", s: "b" }] });
    const r = await (fake.client as Builder).from("t").update({ s: "z" }).in("id", ["1"]).select("id");
    expect(r.data).toEqual([{ id: "1", s: "z" }]);
  });

  it("not(coluna, 'is', null) filtra os não nulos", async () => {
    const fake = criarSupabaseEmMemoria({ t: [{ id: "1", x: null }, { id: "2", x: "v" }] });
    const r = await (fake.client as Builder).from("t").select("id").not("x", "is", null);
    expect((r.data as { id: string }[]).map((l) => l.id)).toEqual(["2"]);
  });
});
