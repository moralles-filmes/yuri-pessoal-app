import { beforeEach, expect, it, vi } from "vitest";
import type { CommandContext } from "../contracts";
import { filtrarCamposTocados, isCommandCoherent } from "../contracts";
const d = vi.hoisted(() => ({ log: vi.fn(), gravar: vi.fn() }));
vi.mock("@/lib/habits/queries", () => ({ getHabitsDashboard: async () => ({ habits: [{ id: "h", name: "Água", is_active: true }] }), getHabitLogForDate: d.log }));
vi.mock("@/lib/habits/services", () => ({ registrarCheckIn: d.gravar, metaDoHabito: async () => 8 }));
const { registrarHabito } = await import("./habits");
const ctx = { userId: "dono" } as CommandContext;
beforeEach(() => { vi.clearAllMocks(); d.gravar.mockResolvedValue({ ok: true, value: 8, isDone: true }); });
it.each([null, { id: "log", value: 0 }, { id: "log", value: 4 }])("grava somente a existência da criação, sem valor anterior: %j", async anterior => {
  d.log.mockResolvedValue(anterior);
  const r = await registrarHabito.executar(ctx, { habito: "Água", valor: 8, data: "2026-11-01" }, "chave");
  expect(d.log).toHaveBeenCalledWith("h", "2026-11-01");
  expect(d.gravar).toHaveBeenCalledWith(ctx, "h", { logDate: "2026-11-01", value: 8, somenteSeNovo: anterior === null });
  expect(r.alterados).toEqual({ value: 8, is_done: true, log_date: "2026-11-01", registro_novo: anterior === null });
  expect(filtrarCamposTocados(r.alterados, registrarHabito.camposAuditaveis).campos.registro_novo).toBe(anterior === null);
});
it("falha de leitura não inventa que o dia estava vazio", async () => {
  d.log.mockRejectedValue(new Error("leitura indisponível"));
  await expect(registrarHabito.executar(ctx, { habito: "Água", valor: 8 }, "chave")).rejects.toThrow();
  expect(d.gravar).not.toHaveBeenCalled();
});
it("falha de insert não retorna fatos de uma criação", async () => {
  d.log.mockResolvedValue(null); d.gravar.mockResolvedValue({ ok: false, erro: "O dia mudou" });
  await expect(registrarHabito.executar(ctx, { habito: "Água", valor: 8 }, "chave")).rejects.toThrow("O dia mudou");
});
it("descriptor continua coerente e a montagem do inverso também recusa legado e substituição", () => {
  expect(isCommandCoherent(registrarHabito, ["registrarHabito", "desfazerHabito"])).toBe(true);
  if (registrarHabito.desfazer.kind !== "command") throw Error("Sem inverso");
  for (const registro_novo of [false, undefined, "true", 1]) {
    expect(registrarHabito.desfazer.payload({ targetId: "h", changedFields: { log_date: "2026-11-01", registro_novo: registro_novo ?? null } })).toBeNull();
  }
});
