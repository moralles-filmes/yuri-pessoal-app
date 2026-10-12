/**
 * REDESIGN-03-D · A3b — o serviço de recebimentos visto pelas escritas, sobre o client em
 * memória (que aplica filtros e registra escritas NA ORDEM). O trigger da M1 é simulado por
 * `antesDeGravar`. Fixture sintética.
 */
import { describe, expect, it, vi } from "vitest";
import { criarSupabaseEmMemoria, type EscritaPretendida, type Linha } from "@/test/supabase-em-memoria";
import type { AuthContext } from "@/lib/actions/helpers";

// O serviço importa `invalid`/`dbError` de `actions/helpers` e a leitura importa `createClient`;
// os dois arrastam o client de servidor. O dublê entra pelo `ctx`, então o módulo é só neutralizado.
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
import {
  aplicarAcaoEmMassa,
  decidirRecebivel,
  desfazerUltimoRecebimento,
  receberSaldo,
  registrarRecebimento,
} from "@/lib/finance/recebimentos-servico";

const REC = "rec-1";
const HOJE = "2026-06-30";

const cent = (v: unknown) => Math.round(Number(v) * 100);

/** O trigger `receivable_receipts_nao_excede`, em memória. */
function gatilhoNaoExcede(op: EscritaPretendida) {
  if (op.tabela !== "receivable_receipts" || op.tipo !== "insert") return null;
  const somaPorRecebivel = new Map<string, number>();
  for (const v of [op.valores].flat() as Linha[]) {
    const id = String(v.receivable_id);
    const devido = cent(op.tabelas.receivables?.find((r) => r.id === id)?.valor);
    const ja =
      somaPorRecebivel.get(id) ??
      (op.tabelas.receivable_receipts ?? [])
        .filter((x) => x.receivable_id === id)
        .reduce((s, x) => s + cent(x.valor), 0);
    const novo = ja + cent(v.valor);
    if (novo > devido) return { code: "23514", message: "A soma dos recebimentos passaria do valor devido." };
    somaPorRecebivel.set(id, novo);
  }
  return null;
}

function cenario(
  sobre: Linha = {}, recebimentos: Linha[] = [], mais: Linha[] = [],
  antesDeGravar: (op: EscritaPretendida) => ReturnType<typeof gatilhoNaoExcede> = gatilhoNaoExcede,
) {
  const fake = criarSupabaseEmMemoria(
    {
      receivables: [{ id: REC, user_id: "user-1", valor: 600, status: "pendente", pago_em: null, ...sobre }, ...mais],
      receivable_receipts: recebimentos,
    },
    { antesDeGravar },
  );
  const ctx = { supabase: fake.client as AuthContext["supabase"], userId: "user-1" };
  return { fake, ctx };
}

const receb = (id: string, valor: number, recebido_em: string, created_at = `${recebido_em}T12:00:00Z`): Linha => ({
  id, user_id: "user-1", receivable_id: REC, valor, recebido_em, observacoes: null, created_at,
});

describe("registrar recebimento", () => {
  it.each([0, -10])("recusa valor %s no campo valor, sem escritas", async (valor) => {
    const { fake, ctx } = cenario();
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor, recebido_em: HOJE, observacoes: null }, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.valor).toEqual(["Informe um valor maior que zero."]);
    expect(fake.escritas()).toHaveLength(0);
  });

  it("grava o mesmo valor arredondado usado para decidir a quitação", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")]);
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 350.004, recebido_em: HOJE, observacoes: null }, HOJE);
    expect(r.ok).toBe(true);
    expect((fake.escritas("receivable_receipts")[0].valores as Linha).valor).toBe(350);
    expect(fake.escritas("receivables")[0].valores).toEqual({ status: "pago", pago_em: HOJE });
  });

  it("23514 sem recebível na releitura não inventa saldo zero", async () => {
    const { fake, ctx } = cenario({}, [], [], (op) => {
      if (op.tabela !== "receivable_receipts" || op.tipo !== "insert") return null;
      op.tabelas.receivables = [];
      return { code: "23514", message: "Saldo alterado." };
    });
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 100, recebido_em: HOJE, observacoes: null }, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors?.valor?.[0]).toBe("Passa do saldo deste recebível.");
      expect(r.fieldErrors?.valor?.[0]).not.toContain("R$");
    }
    expect(fake.escritas()).toHaveLength(0);
  });

  it("parcial grava SÓ o recebimento — a coluna não muda e nunca vira 'parcial'", async () => {
    const { fake, ctx } = cenario();
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 250, recebido_em: "2026-06-05", observacoes: null }, HOJE);
    expect(r.ok).toBe(true);
    expect(fake.escritas("receivables")).toHaveLength(0);
    const [ins] = fake.escritas("receivable_receipts");
    expect(Object.keys(ins.valores as Linha).sort()).toEqual(
      ["observacoes", "recebido_em", "receivable_id", "user_id", "valor"],
    );
    expect(fake.operacoes.some((o) => (o.valores as Linha | undefined)?.status === "parcial")).toBe(false);
  });

  it("o saldo inteiro grava o recebimento e DEPOIS pago + pago_em", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")]);
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 350, recebido_em: "2026-06-20", observacoes: null }, HOJE);
    expect(r.ok).toBe(true);
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual([
      "insert:receivable_receipts",
      "update:receivables",
    ]);
    expect(fake.escritas("receivables")[0].valores).toEqual({ status: "pago", pago_em: "2026-06-20" });
  });

  it("valor acima do saldo é recusado NO CAMPO valor, sem gravar nada", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")]);
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 400, recebido_em: "2026-06-20", observacoes: null }, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.valor?.[0]).toContain("restam");
    expect(fake.operacoes).toHaveLength(0);
  });

  it("o 23514 do trigger (duas abas) vira erro NO CAMPO valor", async () => {
    const fake = criarSupabaseEmMemoria(
      { receivables: [{ id: REC, valor: 600, status: "pendente", pago_em: null }], receivable_receipts: [] },
      { antesDeGravar: (op) => (op.tabela === "receivable_receipts" ? { code: "23514", message: "x" } : null) },
    );
    const ctx = { supabase: fake.client as AuthContext["supabase"], userId: "user-1" };
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 100, recebido_em: "2026-06-20", observacoes: null }, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.valor?.[0]).toMatch(/Passa do saldo/);
    expect(fake.escritas()).toHaveLength(0);
  });

  it.each([
    ["ignorado", { status: "ignorado" }, [], /pendente antes/],
    ["quitado legado", { status: "pago", pago_em: "2026-06-01" }, [], /quitado/],
    ["quitado pela soma", {}, [receb("r1", 600, "2026-06-05")], /quitado/],
  ])("recusa recebimento em %s, sem gravar nada", async (_n, sobre, recs, msg) => {
    const { fake, ctx } = cenario(sobre as Linha, recs as Linha[]);
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 10, recebido_em: "2026-06-20", observacoes: null }, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(msg);
    expect(fake.escritas()).toHaveLength(0);
  });

  it("recusa data no futuro (hoje de Brasília injetado), no campo recebido_em", async () => {
    const { fake, ctx } = cenario();
    const r = await registrarRecebimento(ctx, { receivable_id: REC, valor: 10, recebido_em: "2026-07-01", observacoes: null }, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors?.recebido_em?.[0]).toMatch(/futuro/);
    expect(fake.escritas()).toHaveLength(0);
  });
});

describe("receber o saldo", () => {
  it("grava o recebimento do saldo restante ANTES da coluna", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")]);
    const r = await receberSaldo(ctx, REC, "2026-06-21", HOJE);
    expect(r.ok).toBe(true);
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual([
      "insert:receivable_receipts",
      "update:receivables",
    ]);
    expect((fake.escritas("receivable_receipts")[0].valores as Linha).valor).toBe(350);
    expect(Object.keys(fake.escritas("receivable_receipts")[0].valores as Linha).sort()).toEqual(
      ["observacoes", "recebido_em", "receivable_id", "user_id", "valor"],
    );
  });

  it("com a soma já fechada e a coluna aberta, só conserta a coluna (data do último recebimento)", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 600, "2026-06-05")]);
    const r = await receberSaldo(ctx, REC, "2026-06-21", HOJE);
    expect(r.ok).toBe(true);
    expect(fake.escritas("receivable_receipts")).toHaveLength(0);
    expect(fake.escritas("receivables")[0].valores).toEqual({ status: "pago", pago_em: "2026-06-05" });
  });

  it("recebível de valor ZERO: não cria recebimento de zero, só a coluna", async () => {
    const { fake, ctx } = cenario({ valor: 0 });
    const r = await receberSaldo(ctx, REC, "2026-06-21", HOJE);
    expect(r.ok).toBe(true);
    expect(fake.escritas("receivable_receipts")).toHaveLength(0);
    expect(fake.escritas("receivables")[0].valores).toEqual({ status: "pago", pago_em: "2026-06-21" });
  });

  it("recusa ignorado e data no futuro", async () => {
    expect((await receberSaldo(cenario({ status: "ignorado" }).ctx, REC, "2026-06-21", HOJE)).ok).toBe(false);
    expect((await receberSaldo(cenario().ctx, REC, "2026-07-01", HOJE)).ok).toBe(false);
  });
});

describe("desfazer", () => {
  it("reabre a coluna ANTES de apagar, e apaga SÓ o último", async () => {
    const { fake, ctx } = cenario({ status: "pago", pago_em: "2026-06-20" }, [
      receb("r1", 250, "2026-06-05"),
      receb("r2", 350, "2026-06-20"),
    ]);
    const r = await desfazerUltimoRecebimento(ctx, REC);
    expect(r.ok).toBe(true);
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual([
      "update:receivables",
      "delete:receivable_receipts",
    ]);
    expect(fake.escritas("receivables")[0].valores).toEqual({ status: "pendente", pago_em: null });
    expect(fake.tabelas.receivable_receipts.map((x) => x.id)).toEqual(["r1"]);
  });

  it("dois na mesma data: apaga o criado por último", async () => {
    const { fake, ctx } = cenario({}, [
      receb("r1", 100, "2026-06-20", "2026-06-20T10:00:00Z"),
      receb("r2", 100, "2026-06-20", "2026-06-20T11:00:00Z"),
    ]);
    await desfazerUltimoRecebimento(ctx, REC);
    expect(fake.tabelas.receivable_receipts.map((x) => x.id)).toEqual(["r1"]);
  });

  it("parcial com a coluna em aberto: não toca a coluna", async () => {
    const { fake, ctx } = cenario({ status: "cobrado" }, [receb("r1", 100, "2026-06-05")]);
    await desfazerUltimoRecebimento(ctx, REC);
    expect(fake.escritas("receivables")).toHaveLength(0);
    expect(fake.tabelas.receivable_receipts).toHaveLength(0);
  });

  it("legado (pago sem recebimento): só a coluna", async () => {
    const { fake, ctx } = cenario({ status: "pago", pago_em: "2026-06-10" });
    await desfazerUltimoRecebimento(ctx, REC);
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual(["update:receivables"]);
  });

  it("nada a desfazer é recusado", async () => {
    expect((await desfazerUltimoRecebimento(cenario().ctx, REC)).ok).toBe(false);
  });
});

describe("decidir (K1)", () => {
  it("ignorar não alcança quitado", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 600, "2026-06-05")]);
    expect((await decidirRecebivel(ctx, REC, "ignorado")).ok).toBe(false);
    expect(fake.escritas()).toHaveLength(0);
  });

  it("ignorar alcança parcial", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")]);
    expect((await decidirRecebivel(ctx, REC, "ignorado")).ok).toBe(true);
    expect(fake.escritas("receivables")[0].valores).toEqual({ status: "ignorado", pago_em: null });
  });

  it("voltar para pendente não sai de pago (é o Desfazer)", async () => {
    expect((await decidirRecebivel(cenario({ status: "pago", pago_em: "2026-06-01" }).ctx, REC, "pendente")).ok).toBe(false);
  });
});

describe("lote", () => {
  it("K2: cada linha do insert de receber contém somente as cinco chaves permitidas", async () => {
    const { fake, ctx } = cenario({}, [], [
      { id: "rec-2", user_id: "user-1", valor: 100, status: "cobrado", pago_em: null },
    ]);
    const r = await aplicarAcaoEmMassa(ctx, [REC, "rec-2"], "receber", HOJE, HOJE);
    expect(r.ok).toBe(true);
    const linhas = fake.escritas("receivable_receipts")[0].valores as Linha[];
    expect(linhas).toHaveLength(2);
    for (const linha of linhas) {
      expect(Object.keys(linha).sort()).toEqual(["observacoes", "recebido_em", "receivable_id", "user_id", "valor"]);
    }
  });

  it("desfazer: falha no delete orienta concluir individualmente", async () => {
    const recebimentos = [receb("r1", 600, "2026-06-20")];
    const { fake, ctx } = cenario({ status: "pago", pago_em: "2026-06-20" }, recebimentos, [], (op) =>
      op.tabela === "receivable_receipts" && op.tipo === "delete"
        ? { code: "57014", message: "Exclusão recusada." } : null,
    );
    const r = await aplicarAcaoEmMassa(ctx, [REC], "desfazer", HOJE, HOJE);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("Os recebíveis voltaram para pendente, mas os recebimentos não foram removidos. Use Desfazer em cada recebível para concluir.");
    expect(fake.tabelas.receivables[0].status).toBe("pendente");
    expect(fake.tabelas.receivable_receipts).toEqual(recebimentos);
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual(["update:receivables"]);
  });

  it("receber: um recebimento do SALDO por recebível; ignorado fica de fora", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")], [
      { id: "rec-2", user_id: "user-1", valor: 100, status: "ignorado", pago_em: null },
    ]);
    const r = await aplicarAcaoEmMassa(ctx, [REC, "rec-2"], "receber", "2026-06-25", HOJE);
    expect(r).toEqual({ ok: true, data: { afetados: 1, ignorados: 1 } });
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual([
      "insert:receivable_receipts",
      "update:receivables",
    ]);
    expect((fake.escritas("receivable_receipts")[0].valores as Linha[]).map((v) => v.valor)).toEqual([350]);
  });

  it("desfazer: reabre a coluna ANTES de apagar o último", async () => {
    const { fake, ctx } = cenario({ status: "pago", pago_em: "2026-06-20" }, [receb("r1", 600, "2026-06-20")]);
    await aplicarAcaoEmMassa(ctx, [REC], "desfazer", "2026-06-25", HOJE);
    expect(fake.operacoes.map((o) => `${o.tipo}:${o.tabela}`)).toEqual([
      "update:receivables",
      "delete:receivable_receipts",
    ]);
  });

  it("ignorar não alcança quem a soma já quitou (coluna ainda pendente)", async () => {
    const { fake, ctx } = cenario({}, [receb("r1", 600, "2026-06-05")]);
    const r = await aplicarAcaoEmMassa(ctx, [REC], "ignorar", "2026-06-25", HOJE);
    expect(r).toEqual({ ok: true, data: { afetados: 0, ignorados: 1 } });
    expect(fake.escritas("receivables")).toHaveLength(0);
  });
});

describe("K1 — a primeira escrita falha, a segunda nao acontece", () => {
  it.each(["registrarRecebimento", "receberSaldo", "lote receber"] as const)(
    "%s: insert recusado impede atualizar a coluna", async (acao) => {
      const antesDeGravar = vi.fn((op: EscritaPretendida) =>
        op.tabela === "receivable_receipts" && op.tipo === "insert"
          ? { code: "57014", message: "Inserção recusada." } : null,
      );
      const { fake, ctx } = cenario({}, [receb("r1", 250, "2026-06-05")], [], antesDeGravar);
      const r = acao === "registrarRecebimento"
        ? await registrarRecebimento(ctx, { receivable_id: REC, valor: 350, recebido_em: HOJE, observacoes: null }, HOJE)
        : acao === "receberSaldo"
          ? await receberSaldo(ctx, REC, HOJE, HOJE)
          : await aplicarAcaoEmMassa(ctx, [REC], "receber", HOJE, HOJE);
      expect(r.ok).toBe(false);
      expect(antesDeGravar).toHaveBeenCalledTimes(1);
      expect(antesDeGravar.mock.calls[0][0]).toMatchObject({ tabela: "receivable_receipts", tipo: "insert" });
      expect(fake.escritas("receivables")).toHaveLength(0);
      expect(fake.escritas()).toHaveLength(0);
    },
  );

  it.each(["desfazerUltimoRecebimento", "lote desfazer"] as const)(
    "%s: update recusado preserva todos os recebimentos", async (acao) => {
      const recebimentos = [receb("r1", 250, "2026-06-05"), receb("r2", 350, "2026-06-20")];
      const antesDeGravar = vi.fn((op: EscritaPretendida) =>
        op.tabela === "receivables" && op.tipo === "update"
          ? { code: "57014", message: "Atualização recusada." } : null,
      );
      const { fake, ctx } = cenario({ status: "pago", pago_em: "2026-06-20" }, recebimentos, [], antesDeGravar);
      const r = acao === "desfazerUltimoRecebimento"
        ? await desfazerUltimoRecebimento(ctx, REC)
        : await aplicarAcaoEmMassa(ctx, [REC], "desfazer", HOJE, HOJE);
      expect(r.ok).toBe(false);
      expect(antesDeGravar).toHaveBeenCalledTimes(1);
      expect(antesDeGravar.mock.calls[0][0]).toMatchObject({ tabela: "receivables", tipo: "update" });
      expect(fake.operacoes.filter((o) => o.tipo === "delete")).toHaveLength(0);
      expect(fake.tabelas.receivable_receipts).toEqual(recebimentos);
      expect(fake.tabelas.receivables[0].status).toBe("pago");
      expect(fake.escritas()).toHaveLength(0);
    },
  );
});
