/**
 * REDESIGN-03-G (L4, Z4) — o card CHAMADO, não só lido. Os dois cards são funções async do
 * servidor: chamadas com a leitura mockada, elas devolvem o elemento React que renderizariam.
 *
 * A varredura de `cards-sem-leitura.test.ts` prova a forma do código; esta prova o efeito. Ela
 * existe porque a mutação Z4 que compila (a leitura embrulhada num `.catch` que troca o
 * `ErroDeLeitura` por um `Error` qualquer) passava pela varredura: o texto continuava lá.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroDeLeitura } from "@/lib/supabase/leitura";

const leituras = vi.hoisted(() => ({
  getFinanceCardData: vi.fn(),
  getInvoicesCardData: vi.fn(),
}));
vi.mock("@/lib/dashboard/queries", () => leituras);

const { FinanceCard } = await import("./finance-card");
const { InvoicesCard } = await import("./invoices-card");
const { CardSemLeitura } = await import("@/components/shared/card-sem-leitura");

const JANELA = { mes: "2026-09" } as never;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe.each([
  ["FinanceCard", "getFinanceCardData", () => FinanceCard({ window: JANELA, todayIso: "2026-09-10" })],
  ["InvoicesCard", "getInvoicesCardData", () => InvoicesCard({ todayIso: "2026-09-10" })],
] as const)("03-G L4 · %s chamado", (_nome, leitura, chamar) => {
  it("ErroDeLeitura vira o CardSemLeitura com o rótulo da leitura — nenhum número", async () => {
    leituras[leitura].mockRejectedValueOnce(new ErroDeLeitura("os lançamentos"));
    const elemento = await chamar();
    expect(elemento.type).toBe(CardSemLeitura);
    expect(elemento.props).toMatchObject({ oQue: "os lançamentos" });
  });

  it("qualquer outra exceção sobe para o error.tsx", async () => {
    leituras[leitura].mockRejectedValueOnce(new TypeError("defeito de programação"));
    await expect(chamar()).rejects.toThrow(TypeError);
  });
});
