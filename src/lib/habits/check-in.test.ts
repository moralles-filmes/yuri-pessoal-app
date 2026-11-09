import { beforeEach, expect, it, vi } from "vitest";
import type { HabitServiceContext } from "./services";
import { registrarCheckIn } from "./services";
const insert = vi.fn(); const upsert = vi.fn();
const ctx = { userId: "dono", supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { target_value: 8 } }) }) }), insert, upsert }) } } as unknown as HabitServiceContext;
beforeEach(() => { vi.clearAllMocks(); insert.mockResolvedValue({ error: null }); upsert.mockResolvedValue({ error: null }); });
it("dia declarado novo usa insert e não sobrescreve se outro registro chegar antes", async () => {
  insert.mockResolvedValue({ error: { code: "23505" } });
  const r = await registrarCheckIn(ctx, "habito", { logDate: "2026-11-08", value: 8, somenteSeNovo: true });
  expect(r.ok).toBe(false); expect(insert).toHaveBeenCalledTimes(1); expect(upsert).not.toHaveBeenCalled();
});
it("chamadores normais mantêm o upsert do módulo", async () => {
  expect((await registrarCheckIn(ctx, "habito", { logDate: "2026-11-08", value: 8 })).ok).toBe(true);
  expect(upsert).toHaveBeenCalledTimes(1); expect(insert).not.toHaveBeenCalled();
});

it("criação bem-sucedida preserva dono, data e valor no insert", async () => {
  expect(await registrarCheckIn(ctx, "habito", { logDate: "2026-11-08", value: 8, somenteSeNovo: true })).toEqual({ ok: true, value: 8, isDone: true });
  expect(insert).toHaveBeenCalledWith({ user_id: "dono", habit_id: "habito", log_date: "2026-11-08", value: 8, is_done: true, notes: null });
  expect(upsert).not.toHaveBeenCalled();
});
