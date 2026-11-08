import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ create: vi.fn(), requests: [] as {
        table: string;
        ops: [
            string,
            ...unknown[]
        ][];
    }[], replies: [] as unknown[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: d.create }));
const { getUsageSummary, getUsageByModel } = await import("./queries");
function client() { return { from: (table: string) => { const req = { table, ops: [] as [
            string,
            ...unknown[]
        ][] }; d.requests.push(req); const q = new Proxy({}, { get: (_, k) => k === "then" ? (ok: (v: unknown) => void) => Promise.resolve(d.replies.shift()).then(ok) : (...a: unknown[]) => { req.ops.push([String(k), ...a]); return q; } }); return q; } }; }
const run = { id: "r", status: "completed", reserved_cost: 5, reservation_expires_at: "2026-11-09T00:00:00Z" };
const now = new Date("2026-11-08T12:00:00Z");
beforeEach(() => { d.requests = []; d.replies = []; d.create.mockResolvedValue(client()); });
describe("consumo honesto", () => {
    it("erro nos eventos não vira custo zero", async () => { d.replies = [{ data: [run], count: 1, error: null }, { data: null, error: { message: "falhou" } }]; const r = await getUsageSummary("dono", "mes", 10, now); expect(r).toMatchObject({ parcial: true, totalUsd: null, confirmadoUsd: null, restanteUsd: null, percentual: null, nivelDeAlerta: null }); });
    it("erro de runs é parcial e não medido", async () => { d.replies = [{ data: null, error: { message: "falhou" } }]; expect(await getUsageSummary("dono", "dia", 10, now)).toMatchObject({ parcial: true, totalUsd: null, reservadoUsd: null }); });
    it("preserva custo medido e escopo do dono", async () => { d.replies = [{ data: [run], count: 1, error: null }, { data: [{ run_id: "r", estimated_cost: 2 }], count: 1, error: null }]; expect(await getUsageSummary("dono", "mes", 10, now)).toMatchObject({ parcial: false, totalUsd: 2, confirmadoUsd: 2, restanteUsd: 8, percentual: 20 }); for (const q of d.requests)
        expect(q.ops).toContainEqual(["eq", "user_id", "dono"]); expect(d.requests[1].ops).toContainEqual(["in", "run_id", ["r"]]); });
    it("não mede ausência de tarifa como zero", async () => { d.replies = [{ data: [run], count: 1, error: null }, { data: [{ run_id: "r", estimated_cost: null }], count: 1, error: null }]; expect(await getUsageSummary("dono", "mes", 10, now)).toMatchObject({ parcial: true, totalUsd: null, execucoesSemCusto: 1 }); });
    it("detecta teto de runs mesmo com resposta menor que o teto", async () => { d.replies = [{ data: [run], count: 2001, error: null }, { data: [], count: 2001, error: null }, { data: [{ run_id: "r", estimated_cost: 2 }], count: 1, error: null }]; expect(await getUsageSummary("dono", "mes", 10, now)).toMatchObject({ parcial: true }); });
    it("modelo devolve metadado parcial no erro", async () => { d.replies = [{ data: null, error: { message: "falhou" } }]; expect(await getUsageByModel("dono", "mes", now)).toEqual({ linhas: [], parcial: true }); });
    it("modelo detecta teto e preserva soma disponível", async () => { d.replies = [{ data: [{ provider: "gemini", model_id: "m", estimated_cost: 3 }], count: 5001, error: null }, { data: [], count: 5001, error: null }]; const r = await getUsageByModel("dono", "mes", now); expect(r).toMatchObject({ parcial: true, linhas: [{ custoUsd: 3, execucoes: 1 }] }); });
    it("consumo e aviso anunciam parcial, sem vazio enganoso", () => { const page = readFileSync("src/app/(app)/ia/consumo/page.tsx", "utf8"); expect(page).toContain("porModelo.parcial"); expect(page).toContain("Consumo parcial"); expect(page).toContain("formatUsdOrUnavailable(dia.totalUsd)"); expect(page).toContain("formatUsdOrUnavailable(mes.totalUsd)"); expect(page).toContain("value={formatUsdOrUnavailable(mes.reservadoUsd)}"); expect(page).toContain("porModelo.parcial ? \"Leitura por modelo indisponível ou parcial\""); const aviso=readFileSync("src/components/ai/budget-alert.tsx", "utf8"); expect(aviso).toContain("Consumo parcial: não foi possível medir todo o período."); expect(aviso).toContain("Consumo parcial; os valores disponíveis podem ser menores"); const cron = readFileSync("src/lib/notifications/ai-cron.ts", "utf8"); expect(cron).toContain("parcial: mensal.parcial"); expect(cron).toContain("parcial: diario.parcial"); });
});
describe("páginas reais e saturação", () => {
    it("modelo lê teto + 1 e exclui a sentinela da soma", async () => {
        const ev = { provider: "gemini", model_id: "m", estimated_cost: 1 };
        d.replies = [...Array.from({ length: 10 }, () => ({ data: Array.from({ length: 500 }, () => ev), count: 5001, error: null })), { data: [ev], count: 5001, error: null }];
        const r = await getUsageByModel("dono", "mes", now);
        expect(r).toMatchObject({ parcial: true, linhas: [{ execucoes: 5000, custoUsd: 5000 }] });
        expect(d.requests.at(-1)?.ops).toContainEqual(["range", 5000, 5000]);
        expect(d.requests.every(q => q.ops.some(o => o[0] === "order" && o[1] === "id"))).toBe(true);
    });
    it("runs leem teto + 1 e eventos usam no máximo 200 ids", async () => {
        const rows = Array.from({ length: 2001 }, (_, i) => ({ ...run, id: "r" + i, status: "streaming" }));
        d.replies = [...Array.from({ length: 4 }, (_, i) => ({ data: rows.slice(i * 500, (i + 1) * 500), count: 2001, error: null })), { data: rows.slice(2000), count: 2001, error: null }, ...Array.from({ length: 10 }, () => ({ data: [], count: 0, error: null }))];
        expect(await getUsageSummary("dono", "mes", 20000, now)).toMatchObject({ parcial: true, totalUsd: 10000, confirmadoUsd: 0, reservadoUsd: 10000, execucoes: 2000, restanteUsd: null });
        const events = d.requests.filter(q => q.table === "ai_usage_events");
        expect(events).toHaveLength(10);
        for (const q of events)
            expect((q.ops.find(o => o[0] === "in")![2] as string[]).length).toBeLessThanOrEqual(200);
    });
    it("mais de uma página completa continua exata", async () => {
        const ev = { provider: "gemini", model_id: "m", estimated_cost: 0.5 };
        d.replies = [{ data: Array.from({ length: 500 }, () => ev), count: 501, error: null }, { data: [ev], count: 501, error: null }];
        expect(await getUsageByModel("dono", "mes", now)).toMatchObject({ parcial: false, linhas: [{ execucoes: 501, custoUsd: 250.5 }] });
    });
    it("sem consumo é zero medido", async () => { d.replies = [{ data: [], count: 0, error: null }]; expect(await getUsageSummary("dono", "mes", 10, now)).toMatchObject({ parcial: false, totalUsd: 0, execucoes: 0 }); });
    it("reserva viva e tentativa medida não são somadas juntas", async () => { d.replies = [{ data: [{ ...run, status: "streaming" }], count: 1, error: null }, { data: [{ run_id: "r", estimated_cost: 2 }], count: 1, error: null }]; expect(await getUsageSummary("dono", "mes", 10, now)).toMatchObject({ parcial: false, totalUsd: 5, confirmadoUsd: 0, reservadoUsd: 5 }); });
});

it("contagens sem leitura não aparecem como zero medido",()=>{
 const page=readFileSync("src/app/(app)/ia/consumo/page.tsx","utf8");
 expect(page).toContain('mes.execucoes === 0 && mes.totalUsd === null ? "não medido" : String(mes.execucoes)');
 expect(page).toMatch(/mes\.reservadoUsd === null\s+\? "reserva não medida"/);
});
