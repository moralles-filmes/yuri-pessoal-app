import { beforeEach, describe, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ auth: vi.fn(), requests: [] as {
        table: string;
        ops: [
            string,
            ...unknown[]
        ][];
    }[], replies: [] as unknown[], discard: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actions/helpers", () => ({ authContext: d.auth, notAuthed: { ok: false, error: "Sem sessão" }, invalid: () => ({ ok: false, error: "Inválido" }), dbError: (error: string) => ({ ok: false, error }) }));
vi.mock("@/lib/ai/server/document-store", () => ({ descartarDocumento: d.discard }));
const { contarDadosDaIa, apagarDadosDaIa } = await import("./ai-retention");
function client() { return { from: (table: string) => { const req = { table, ops: [] as [
            string,
            ...unknown[]
        ][] }; d.requests.push(req); const q = new Proxy({}, { get: (_, k) => k === "then" ? (ok: (v: unknown) => void) => Promise.resolve(d.replies.shift()).then(ok) : (...a: unknown[]) => { req.ops.push([String(k), ...a]); return q; } }); return q; } }; }
const ids = Array.from({ length: 401 }, (_, i) => ({ id: "c" + i }));
beforeEach(() => { d.requests = []; d.replies = []; d.auth.mockResolvedValue({ supabase: client(), userId: "dono" }); });
describe("retenção sem teto oculto", () => {
    it("usa última mensagem, corte de Brasília, dono e contagem exata", async () => { d.replies = [{ data: [{ id: "a" }], count: 1, error: null }, { data: [], count: 0, error: null }]; expect(await contarDadosDaIa({ escopo: "conversas_antigas", anteriorA: "2026-11-01" })).toEqual({ ok: true, data: { quantidade: 1 } }); const q = d.requests[0]; expect(q.ops).toContainEqual(["select", "id", { count: "exact" }]); expect(q.ops).toContainEqual(["lt", "last_message_at", "2026-11-01T03:00:00.000Z"]); expect(q.ops).not.toContainEqual(["lt", "created_at", "2026-11-01T03:00:00.000Z"]); expect(q.ops).toContainEqual(["eq", "user_id", "dono"]); });
    it("não conta conversa com run reserved ou streaming", async () => { d.replies = [{ data: [{ id: "a" }, { id: "b" }], count: 2, error: null }, { data: [{ conversation_id: "a" }], count: 1, error: null }]; expect(await contarDadosDaIa({ escopo: "conversas" })).toEqual({ ok: true, data: { quantidade: 1 } }); expect(d.requests[1].ops).toContainEqual(["in", "status", ["reserved", "streaming"]]); expect(d.requests[1].ops).toContainEqual(["in", "conversation_id", ["a", "b"]]); expect(d.requests[1].ops).toContainEqual(["eq", "user_id", "dono"]); });
    it("erro ao ler runs impede contagem e exclusão", async () => { d.replies = [{ data: [{ id: "a" }], count: 1, error: null }, { data: null, error: { message: "falhou" } }]; expect((await apagarDadosDaIa({ escopo: "conversas", confirmar: true })).ok).toBe(false); expect(d.requests.some(q => q.ops.some(o => o[0] === "delete"))).toBe(false); });
    it("percorre todas as páginas e apaga em blocos de até 200", async () => { d.replies = [{ data: ids.slice(0, 200), count: 401, error: null }, { data: ids.slice(200, 400), count: 401, error: null }, { data: ids.slice(400), count: 401, error: null }, ...Array.from({ length: 3 }, () => ({ data: [], count: 0, error: null })), { count: 200, error: null }, { count: 200, error: null }, { count: 1, error: null }]; expect(await apagarDadosDaIa({ escopo: "conversas", confirmar: true })).toEqual({ ok: true, data: { apagados: 401 } }); const reads = d.requests.filter(q => q.table === "ai_conversations" && !q.ops.some(o => o[0] === "delete")); expect(reads.map(q => q.ops.find(o => o[0] === "range"))).toEqual([["range", 0, 199], ["range", 200, 399], ["range", 400, 599]]); const deletes = d.requests.filter(q => q.ops.some(o => o[0] === "delete")); expect(deletes).toHaveLength(3); expect(deletes.map(q => (q.ops.find(o => o[0] === "in")![2] as string[]).length)).toEqual([200, 200, 1]); for (const q of deletes) {
        expect(q.ops).toContainEqual(["eq", "user_id", "dono"]);
        expect(q.ops).toContainEqual(["delete", { count: "exact" }]);
    } });
    it("página interrompida antes da contagem exata recusa apagar", async () => { d.replies = [{ data: [{ id: "a" }], count: 2, error: null }, { data: [], count: 2, error: null }]; expect((await apagarDadosDaIa({ escopo: "insights", confirmar: true })).ok).toBe(false); expect(d.requests.some(q => q.ops.some(o => o[0] === "delete"))).toBe(false); });
    it("erro ou contagem ausente não viram sucesso", async () => { d.replies = [{ data: null, count: null, error: { message: "falhou" } }]; expect((await contarDadosDaIa({ escopo: "insights" })).ok).toBe(false); });
    it("sem sessão e sem confirmação não apaga", async () => { d.auth.mockResolvedValueOnce(null); expect((await apagarDadosDaIa({ escopo: "conversas", confirmar: true })).ok).toBe(false); expect((await apagarDadosDaIa({ escopo: "conversas" })).ok).toBe(false); expect(d.requests).toHaveLength(0); });
});
describe("comprovantes e falha parcial da exclusão", () => {
    it("pagina comprovantes, filtra anexos soltos e conta tudo", async () => {
        const docs = Array.from({ length: 201 }, (_, i) => ({ id: "d" + i, attachment_id: "a" + i }));
        d.replies = [{ data: docs.slice(0, 200), count: 201, error: null }, { data: docs.slice(200), count: 201, error: null }, { data: docs.slice(0, 200).map(x => ({ id: x.attachment_id })), count: 200, error: null }, { data: [{ id: "a200" }], count: 1, error: null }];
        expect(await contarDadosDaIa({ escopo: "documentos" })).toEqual({ ok: true, data: { quantidade: 201 } });
        for (const q of d.requests) {
            expect(q.ops).toContainEqual(["eq", "user_id", "dono"]);
            expect(q.ops.find(o => o[0] === "select")?.[2]).toEqual({ count: "exact" });
        }
        expect(d.requests[1].ops).toContainEqual(["range", 200, 399]);
        for (const q of d.requests.filter(q => q.table === "attachments")) {
            expect(q.ops).toContainEqual(["eq", "entity_type", "ia_documento"]);
            expect((q.ops.find(o => o[0] === "in")![2] as string[]).length).toBeLessThanOrEqual(200);
        }
    });
    it("insight não depende de runs e falha no segundo lote relata o que já apagou", async () => {
        d.replies = [{ data: ids.slice(0, 200), count: 201, error: null }, { data: ids.slice(200, 201), count: 201, error: null }, { count: 200, error: null }, { count: null, error: { message: "falhou" } }];
        const r = await apagarDadosDaIa({ escopo: "insights", confirmar: true });
        expect(r.ok).toBe(false);
        if (!r.ok)
            expect(r.error).toContain("200 registros foram apagados");
        expect(d.requests.some(q => q.table === "ai_runs")).toBe(false);
    });
    it("contagem ausente impede exclusão", async () => { d.replies = [{ data: [], count: null, error: null }]; expect((await contarDadosDaIa({ escopo: "insights" })).ok).toBe(false); });
});

describe("exclusão usa o mesmo escopo seguro da contagem",()=>{
 it("a conversa em andamento não entra no delete",async()=>{
  d.replies=[{data:[{id:"a"},{id:"b"}],count:2,error:null},{data:[{id:"r",conversation_id:"a"}],count:1,error:null},{count:1,error:null}];
  expect(await apagarDadosDaIa({escopo:"conversas_antigas",anteriorA:"2026-11-01",confirmar:true})).toEqual({ok:true,data:{apagados:1}});
  const del=d.requests.find(q=>q.ops.some(o=>o[0]==="delete"));expect(del?.ops).toContainEqual(["in","id",["b"]]);
 });
 it("comprovante vinculado permanece, solto passa pelo descarte oficial",async()=>{
  d.discard.mockResolvedValue(true);
  d.replies=[{data:[{id:"d1",attachment_id:"a1"},{id:"d2",attachment_id:"a2"}],count:2,error:null},{data:[{id:"a1"}],count:1,error:null}];
  expect(await apagarDadosDaIa({escopo:"documentos",confirmar:true})).toEqual({ok:true,data:{apagados:1}});
  expect(d.discard).toHaveBeenLastCalledWith(expect.anything(),"dono","d1");expect(d.discard).toHaveBeenCalledTimes(1);
  expect(d.requests.some(q=>q.ops.some(o=>o[0]==="delete"))).toBe(false);
 });
 it("falha de anexos não vira contagem zero",async()=>{d.replies=[{data:[{id:"d",attachment_id:"a"}],count:1,error:null},{data:null,error:{message:"falhou"},count:null}];expect((await contarDadosDaIa({escopo:"documentos"})).ok).toBe(false);});
});
