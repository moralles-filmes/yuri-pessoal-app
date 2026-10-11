/**
 * 03-C2 · A6 — a página de lançamentos liga o filtro e NÃO o repassa ao saldo diário (K1).
 * Queries e o componente cliente são dublês; fixture sintética.
 */
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/finance/queries", () => ({
  getAccounts: vi.fn(async () => []),
  getCategories: vi.fn(async () => [
    { id: "cat-m", name: "Categoria A", kind: "receita", classificacao_padrao: "terceiro" },
    { id: "cat-n", name: "Categoria B", kind: "despesa", classificacao_padrao: null },
  ]),
  getCreditCards: vi.fn(async () => []),
  getDailyBalances: vi.fn(async () => null),
  getPeopleForSelect: vi.fn(async () => []),
  getSubcategories: vi.fn(async () => []),
  getTransactions: vi.fn(async () => [{ id: "t-1", competence_date: "2026-06-10" }]),
}));
vi.mock("./transactions-client", () => ({ TransactionsClient: () => null }));

const queries = await import("@/lib/finance/queries");
const { default: LancamentosPage } = await import("./page");

type Props = { filtroDeTerceiros: { ligado: boolean; categoriasMarcadas: number } };
const abrir = async (sp: Record<string, string>) =>
  (await LancamentosPage({ searchParams: Promise.resolve(sp) })) as ReactElement<Props>;

describe("03-C2 · A6 — página de lançamentos", () => {
  it("?marcadas=1 liga o filtro da lista e conta as categorias marcadas", async () => {
    const el = await abrir({ marcadas: "1" });
    expect(vi.mocked(queries.getTransactions).mock.lastCall?.[0]).toMatchObject({ categoriasMarcadas: true });
    expect(el.props.filtroDeTerceiros).toEqual({ ligado: true, categoriasMarcadas: 1 });
  });

  it("o saldo diário NÃO recebe o filtro: só conta, cartão e os dias", async () => {
    await abrir({ marcadas: "1" });
    const arg = vi.mocked(queries.getDailyBalances).mock.lastCall?.[0] ?? {};
    expect(Object.keys(arg).sort()).toEqual(["accountId", "cardId", "dias"]);
  });

  it("só o valor exato '1' liga (allowlist)", async () => {
    const el = await abrir({ marcadas: "sim" });
    expect(el.props.filtroDeTerceiros.ligado).toBe(false);
    expect(vi.mocked(queries.getTransactions).mock.lastCall?.[0]).toMatchObject({ categoriasMarcadas: false });
  });
});
