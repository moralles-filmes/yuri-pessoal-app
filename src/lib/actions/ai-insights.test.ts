/**
 * REDESIGN-03-G (L4, D-G18) — `gerarInsight` com o coletor falhando.
 *
 * O coletor é o passo 1 do runner, antes de qualquer custo: um `ErroDeLeitura` ali vira a
 * resposta "nada foi gasto", e qualquer OUTRA exceção continua subindo. Dublês sintéticos.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ErroDeLeitura } from "@/lib/supabase/leitura";

const runInsight = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/helpers", async (original) => ({
  ...(await original<typeof import("@/lib/actions/helpers")>()),
  authContext: async () => ({ supabase: {}, userId: "user-1" }),
}));
vi.mock("@/lib/ai/queries", () => ({
  getAiPreferences: async () => ({ permissions: { allow_finance: true }, writePermissions: {} }),
}));
vi.mock("@/lib/ai/server/insight-runner", () => ({ runInsight: (...a: unknown[]) => runInsight(...a) }));
vi.mock("@/lib/ai/server/insight-store", () => ({ registrarFeedback: vi.fn() }));
vi.mock("@/lib/ai/approval/insight", () => ({ prepararTarefaDeInsight: vi.fn() }));

const { gerarInsight } = await import("@/lib/actions/ai-insights");

beforeEach(() => {
  runInsight.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("03-G L4 · gerarInsight", () => {
  it("leitura do coletor falhando devolve erro, sem análise e sem custo", async () => {
    runInsight.mockRejectedValue(new ErroDeLeitura("os lançamentos", { codigo: "XX000" }));
    expect(await gerarInsight({ modulo: "financeiro" })).toEqual({
      ok: false,
      error: "Não foi possível ler os dados do módulo. Nenhuma análise foi gerada e nada foi gasto.",
    });
  });

  it("outra exceção continua subindo", async () => {
    runInsight.mockRejectedValue(new Error("outra coisa"));
    await expect(gerarInsight({ modulo: "financeiro" })).rejects.toThrow("outra coisa");
  });
});
