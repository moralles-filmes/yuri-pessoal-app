import { beforeEach, describe, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ confere: vi.fn(), reconcile: vi.fn(), insight: vi.fn(), notifications: vi.fn() }));
vi.mock("@/lib/security/segredo-cron", () => ({ segredoConfere: d.confere }));
vi.mock("@/lib/supabase/service", () => ({ isServiceConfigured: true, createServiceClient: () => ({}) }));
vi.mock("@/lib/ai/server/reconcile", () => ({ reconcileAllAbandonedRuns: d.reconcile }));
vi.mock("@/lib/ai/server/insight-job", () => ({ runInsightJobForAllUsers: d.insight }));
vi.mock("@/lib/notifications/cron", () => ({ runNotificationGeneration: d.notifications }));
const insights = await import("@/app/api/cron/insights/route");
const notifications = await import("@/app/api/cron/notifications/route");
beforeEach(() => { vi.resetAllMocks(); d.confere.mockReturnValue(true); d.reconcile.mockResolvedValue({ runs: 0 }); d.insight.mockResolvedValue({ users: 1, resultados: [] }); d.notifications.mockResolvedValue({ users: 1, inserted: 0, results: [] }); });
describe("autenticação e reconciliação das rotas Cron", () => {
  it.each([insights, notifications])("nega antes de executar qualquer job", async rota => {
    d.confere.mockReturnValue(false);
    expect((await rota.GET(new Request("http://localhost/cron"))).status).toBe(401);
    expect(d.confere).toHaveBeenCalledWith(null, process.env.CRON_SECRET);
    expect(d.reconcile).not.toHaveBeenCalled(); expect(d.insight).not.toHaveBeenCalled(); expect(d.notifications).not.toHaveBeenCalled();
  });
  it("insights reconcilia globalmente antes de executar", async () => {
    expect((await insights.GET(new Request("http://localhost/cron"))).status).toBe(200);
    expect(d.reconcile).toHaveBeenCalledTimes(1);
    expect(d.reconcile.mock.invocationCallOrder[0]).toBeLessThan(d.insight.mock.invocationCallOrder[0]);
  });
  it("mantém a reconciliação na carona das notificações", async () => {
    expect((await notifications.GET(new Request("http://localhost/cron"))).status).toBe(200);
    expect(d.reconcile).toHaveBeenCalledTimes(1);
  });
});
