/**
 * REDESIGN-03-G (L0) — o núcleo de leitura e o harness com erro injetado.
 * Fixture sintética: o repositório é público.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ErroDeLeitura,
  LeituraIncompleta,
  ehErroDeLeitura,
  exigir,
  exigirCompleta,
  leituraComTeto,
  listaComTeto,
  listaCompleta,
  registrarFalhaDeLeitura,
} from "@/lib/supabase/leitura";
import { falhaDeLeituraAntes, falhaDeLeituraDepois } from "@/lib/actions/helpers";
import { criarSupabaseEmMemoria, MENSAGEM_DO_BANCO_SIMULADA } from "@/test/supabase-em-memoria";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ERRO = { code: "XX000", message: `${MENSAGEM_DO_BANCO_SIMULADA} (transactions)` };

function capturar(f: () => unknown): unknown {
  try {
    f();
  } catch (e) {
    return e;
  }
  throw new Error("não lançou");
}

afterEach(() => vi.restoreAllMocks());

describe("03-G L0 · exigir", () => {
  it("lança ErroDeLeitura com a mensagem NOSSA, sem o texto do banco (Z16)", () => {
    const e = capturar(() => exigir({ data: null, error: ERRO }, "os lançamentos"));
    expect(e).toBeInstanceOf(ErroDeLeitura);
    const erro = e as ErroDeLeitura;
    expect(erro.message).toBe("Não foi possível ler os lançamentos.");
    expect(erro.message).not.toContain("segredo_do_banco");
    expect(erro.tipo).toBe("falhou");
    expect(erro.oQue).toBe("os lançamentos");
    expect(erro.codigo).toBe("XX000");
  });

  it("PGRST116 (single sem linha) é ausência, não erro (D-G27, Z19)", () => {
    expect(exigir({ data: null, error: { code: "PGRST116", message: "x" } }, "o lançamento")).toBeNull();
  });

  it("devolve o dado como veio, inclusive null de maybeSingle", () => {
    expect(exigir({ data: { id: "a" }, error: null }, "x")).toEqual({ id: "a" });
    expect(exigir({ data: null, error: null }, "x")).toBeNull();
  });
});

describe("03-G L0 · listas", () => {
  it("leituraComTeto carrega o count como total (D-G4)", () => {
    expect(leituraComTeto([1, 2], 5)).toEqual({ linhas: [1, 2], situacao: "saturou", total: 5 });
    expect(leituraComTeto([1, 2], 2)).toEqual({ linhas: [1, 2], situacao: "completa", total: 2 });
    expect(leituraComTeto([1], null)).toEqual({ linhas: [1], situacao: "sem_contagem", total: null });
  });

  it("listaComTeto devolve a situação sem lançar, e lança no erro", () => {
    expect(listaComTeto({ data: [1], error: null, count: 3 }, "x")).toEqual({
      linhas: [1],
      situacao: "saturou",
      total: 3,
    });
    expect(() => listaComTeto({ data: null, error: ERRO, count: null }, "x")).toThrow(ErroDeLeitura);
  });

  it("listaCompleta devolve a lista inteira", () => {
    expect(listaCompleta({ data: [1, 2], error: null, count: 2 }, "x")).toEqual([1, 2]);
  });

  it("listaCompleta lança LeituraIncompleta quando saturou (Z3)", () => {
    const e = capturar(() => listaCompleta({ data: [1, 2], error: null, count: 7 }, "as parcelas"));
    expect(e).toBeInstanceOf(LeituraIncompleta);
    const erro = e as LeituraIncompleta;
    expect(erro.tipo).toBe("incompleta");
    expect(erro.lidas).toBe(2);
    expect(erro.total).toBe(7);
    expect(erro.message).toBe("Não foi possível ler as parcelas.");
    expect(ehErroDeLeitura(erro)).toBe(true);
  });

  it("listaCompleta sem count lança — quem chamou esqueceu o count (Z3)", () => {
    expect(() => listaCompleta({ data: [1], error: null }, "x")).toThrow(LeituraIncompleta);
    expect(() => listaCompleta({ data: [1], error: null, count: null }, "x")).toThrow(LeituraIncompleta);
  });

  it("exigirCompleta decide sobre uma LeituraComTeto (D-G7)", () => {
    expect(exigirCompleta(leituraComTeto([1], 1), "x")).toEqual([1]);
    expect(() => exigirCompleta(leituraComTeto([1], 2), "x")).toThrow(LeituraIncompleta);
    expect(() => exigirCompleta(leituraComTeto([1], null), "x")).toThrow(LeituraIncompleta);
  });

  it("ehErroDeLeitura não aceita outro erro", () => {
    expect(ehErroDeLeitura(new Error("x"))).toBe(false);
    expect(ehErroDeLeitura(null)).toBe(false);
  });
});

describe("03-G L0 · log e mensagens das actions", () => {
  it("registrarFalhaDeLeitura grava só o rótulo e o código", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const e = capturar(() => exigir({ data: null, error: ERRO }, "as faturas")) as ErroDeLeitura;
    registrarFalhaDeLeitura(e);
    expect(spy).toHaveBeenCalledWith("[leitura]", "as faturas", "XX000");
    expect(JSON.stringify(spy.mock.calls)).not.toContain("segredo_do_banco");
  });

  it("as duas frases da D-G20", () => {
    expect(falhaDeLeituraAntes("o histórico da pessoa")).toEqual({
      ok: false,
      error: "Não foi possível ler o histórico da pessoa. Nada foi alterado.",
    });
    expect(falhaDeLeituraDepois("a fatura")).toEqual({
      ok: false,
      error:
        "Não foi possível ler a fatura. A alteração pode ter sido gravada em parte: recarregue a página para conferir.",
    });
  });
});

describe("03-G L0 · harness com erro injetado e count", () => {
  type Cliente = {
    from: (t: string) => {
      select: (c?: string, o?: { count?: string; head?: boolean }) => PromiseLike<{
        data: unknown;
        error: { code: string; message: string } | null;
        count?: number | null;
      }> & { insert: never; single: () => Promise<{ data: unknown; error: unknown }> };
      insert: (v: Record<string, unknown>) => PromiseLike<{ error: unknown }>;
    };
  };

  it("falharLeitura devolve erro no select, com a mensagem do banco preenchida; escrita continua", async () => {
    const fake = criarSupabaseEmMemoria(
      { transactions: [{ id: "t1" }] },
      { falharLeitura: { transactions: "XX000" } },
    );
    const c = fake.client as Cliente;
    const r = await c.from("transactions").select("*");
    expect(r.data).toBeNull();
    expect(r.error?.code).toBe("XX000");
    expect(r.error?.message).toContain(MENSAGEM_DO_BANCO_SIMULADA);
    const single = await c.from("transactions").select("*").single();
    expect(single.error).toMatchObject({ code: "XX000" });
    await c.from("transactions").insert({ id: "t2" });
    expect(fake.escritas("transactions")).toHaveLength(1);
  });

  it("count só vem quando pedido; maxRows corta data sem cortar count; head devolve data nula", async () => {
    const fake = criarSupabaseEmMemoria(
      { transactions: [{ id: "a" }, { id: "b" }, { id: "c" }] },
      { maxRows: 2 },
    );
    const c = fake.client as Cliente;
    const sem = await c.from("transactions").select("*");
    expect(sem.count).toBeNull();
    const com = await c.from("transactions").select("*", { count: "exact" });
    expect((com.data as unknown[]).length).toBe(2);
    expect(com.count).toBe(3);
    const head = await c.from("transactions").select("id", { count: "exact", head: true });
    expect(head.data).toBeNull();
    expect(head.count).toBe(3);
  });
});
