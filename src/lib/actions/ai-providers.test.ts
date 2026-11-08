import { beforeEach, describe, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ auth: vi.fn(), del: vi.fn(), from: vi.fn(), cred: { data: null, error: null } as {
        data: unknown;
        error: unknown;
    }, result: { error: null } as {
        error: unknown;
    }, ops: [] as unknown[][] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/helpers", () => ({ authContext: d.auth, notAuthed: { ok: false, error: "Sem sessão" }, invalid: (fields: unknown) => ({ ok: false, error: "Inválido", fields }), dbError: (error: string) => ({ ok: false, error }) }));
vi.mock("@/lib/ai/server/credential-store", () => ({ deleteCredential: d.del, saveCredential: vi.fn(), testStoredCredential: vi.fn() }));
vi.mock("@/lib/ai/server/crypto-readiness", () => ({ getCryptoReadiness: vi.fn() }));
vi.mock("@/lib/ai/core/models", () => ({ findModel: () => ({ status: "ativo" }) }));
vi.mock("@/lib/ai/core/pricing", () => ({ hasRate: () => true }));
const { removeAiCredential, saveAiProviderConfig } = await import("./ai-providers");
beforeEach(() => { d.ops = []; d.result = { error: null }; d.cred = { data: null, error: null }; d.from.mockImplementation((table: string) => { const q = new Proxy({}, { get: (_, k) => k === "then" ? (ok: (v: unknown) => void) => Promise.resolve(table === "ai_provider_credentials" ? d.cred : d.result).then(ok) : (...a: unknown[]) => { d.ops.push([k, ...a]); return q; } }); return q; }); d.auth.mockResolvedValue({ userId: "dono", supabase: { from: d.from } }); d.del.mockResolvedValue({ ok: true }); });
describe("remoção da credencial", () => {
    it("desativa só a configuração do dono", async () => { expect((await removeAiCredential({ provider: "gemini" })).ok).toBe(true); expect(d.del).toHaveBeenCalledWith("dono", "gemini"); expect(d.from).toHaveBeenCalledWith("ai_provider_configs"); expect(d.ops).toContainEqual(["update", { enabled: false }]); expect(d.ops).toContainEqual(["eq", "user_id", "dono"]); expect(d.ops).toContainEqual(["eq", "provider", "gemini"]); });
    it("não anuncia sucesso se desativação falhar depois de remover chave", async () => { d.result = { error: { message: "falhou" } }; const r = await removeAiCredential({ provider: "gemini" }); expect(r).toMatchObject({ ok: false }); if (!r.ok)
        expect(r.error).toContain("chave foi removida"); });
    it("não toca configuração se remoção falhar", async () => { d.del.mockResolvedValueOnce({ ok: false, error: { message: "Falhou" } }); expect((await removeAiCredential({ provider: "gemini" })).ok).toBe(false); expect(d.ops).toEqual([]); });
});
const config = { provider: "gemini", enabled: true, displayName: null, defaultModel: "modelo", economyModel: null, advancedModel: null, visionModel: null, timeoutMs: 9000, maxRetries: 1, dailyLimit: null, monthlyLimit: null, fallbackAllowed: false, fallbackOrder: [] };
describe("ativação exige chave", () => {
    it("configuração obsoleta não reativa provedor sem chave", async () => { expect((await saveAiProviderConfig(config)).ok).toBe(false); expect(d.ops.some(o => o[0] === "upsert")).toBe(false); expect(d.ops).toContainEqual(["eq", "user_id", "dono"]); expect(d.ops).toContainEqual(["eq", "provider", "gemini"]); });
    it("erro de leitura da chave recusa ativação", async () => { d.cred = { data: null, error: { message: "falhou" } }; expect(await saveAiProviderConfig(config)).toEqual({ok:false,error:"Não foi possível conferir a chave do provedor."}); expect(d.ops.some(o => o[0] === "upsert")).toBe(false); });
    it("chave presente permite ativar, desativar não exige chave", async () => { d.cred = { data: { provider: "gemini" }, error: null }; expect((await saveAiProviderConfig(config)).ok).toBe(true); d.cred = { data: null, error: null }; expect((await saveAiProviderConfig({ ...config, enabled: false })).ok).toBe(true); expect(d.ops.filter(o => o[0] === "upsert")).toHaveLength(2); });
});
