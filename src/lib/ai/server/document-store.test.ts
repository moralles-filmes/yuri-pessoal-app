import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { guardarDocumento } from "./document-store";
import { estimarTokensDoArquivo } from "../usage/vision-tokens";

const upload = vi.fn(); const inserir = vi.fn();
const client = { storage: { from: () => ({ upload }) }, from: (tabela: string) => ({
  insert: (dados: unknown) => { inserir(tabela, dados); return { select: () => ({ single: async () => ({ data: { id: tabela }, error: null }) }) }; },
}) } as unknown as SupabaseClient<Database>;
function pdf(paginas: number | null, tamanho = 0) {
  const cabecalho = new TextEncoder().encode("%PDF-1.7\n" + (paginas === null ? "/Type /ObjStm" : "/Type /Pages\n" + "/Type /Page\n".repeat(paginas)));
  const bytes = new Uint8Array(Math.max(cabecalho.length, tamanho)); bytes.set(cabecalho); return bytes;
}
const guardar = (bytes: Uint8Array) => guardarDocumento({ supabase: client, userId: "dono", bytes, nomeOriginal: "nota.pdf", observacao: null });
beforeEach(() => { vi.clearAllMocks(); upload.mockResolvedValue({ error: null }); });
describe("Task 24 — PDF antes de guardar bytes ou metadados", () => {
  it("recusa PDF sintético de 30 páginas com o limite explícito", async () => {
    expect(await guardar(pdf(30))).toEqual({ ok: false, falha: { motivo: "paginas_demais", mensagem: "O PDF tem 30 páginas; o limite é 20. Envie só as páginas do comprovante." } });
    expect(upload).not.toHaveBeenCalled(); expect(inserir).not.toHaveBeenCalled();
  });
  it("recusa a 21ª página, e aceita exatamente 20", async () => {
    expect((await guardar(pdf(21))).ok).toBe(false); expect(upload).not.toHaveBeenCalled();
    const r = await guardar(pdf(20)); expect(r.ok).toBe(true);
    if (r.ok) expect(r.documento.paginas).toBe(20);
  });
  it("sem contagem e acima de 2 MB recusa antes do upload", async () => {
    expect(await guardar(pdf(null, 2 * 1024 * 1024 + 1))).toEqual({ ok: false, falha: { motivo: "paginas_desconhecidas", mensagem: "Não consegui contar as páginas deste PDF. Envie um arquivo menor ou só a página do comprovante." } });
    expect(upload).not.toHaveBeenCalled(); expect(inserir).not.toHaveBeenCalled();
  });
  it.each([100, 2 * 1024 * 1024])("sem contagem com %i bytes aceita e reserva 20 páginas sem inventar medição", async tamanho => {
    const r = await guardar(pdf(null, tamanho)); expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.documento.paginas).toBeNull();
    expect(estimarTokensDoArquivo({ especie: "pdf", paginas: r.documento.paginas })).toMatchObject({ tokens: 60_000, base: "teto" });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(inserir).toHaveBeenCalledWith("ai_documents", expect.objectContaining({ paginas: null, size_bytes: tamanho }));
  });
  it("PDF legível maior que 2 MB continua aceito quando respeita 20 páginas", async () => {
    expect((await guardar(pdf(2, 2 * 1024 * 1024 + 1))).ok).toBe(true);
  });
});
