import { beforeEach, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ filtros: [] as unknown[][], colunas: "", error: null as null | { code: string }, data: null as null | { id: string; value: number } }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (tabela: string) => {
  expect(tabela).toBe("habit_logs"); const q = { select: (colunas: string) => { d.colunas = colunas; return q; }, eq: (...f: unknown[]) => { d.filtros.push(f); return q; }, maybeSingle: async () => ({ data: d.data, error: d.error }) }; return q;
} }) }));
const { getHabitLogForDate } = await import("./queries");
beforeEach(() => { d.filtros.length = 0; d.colunas = ""; d.error = null; d.data = null; });
it("consulta exatamente o hábito e o dia, preservando zero como registro", async () => {
  d.data = { id: "log", value: 0 }; expect(await getHabitLogForDate("h", "2020-01-01")).toEqual(d.data);
  expect(d.colunas).toBe("id, value"); expect(d.filtros).toEqual([["habit_id", "h"], ["log_date", "2020-01-01"]]);
});
it("erro não é interpretado como dia vazio", async () => {
  d.error = { code: "XX000" }; await expect(getHabitLogForDate("h", "2020-01-01")).rejects.toThrow();
});
it("consulta sem linha devolve ausência", async () => { expect(await getHabitLogForDate("h", "2020-01-01")).toBeNull(); });
