import { beforeEach, describe, expect, it, vi } from "vitest";
import { avaliarExtracao } from "@/lib/ai/vision/confidence";

const d = vi.hoisted(() => ({ from: vi.fn(), prever: vi.fn(), propor: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: d.from }) }));
vi.mock("./proposals", () => ({ criarPropostaDeDocumento: d.propor }));
vi.mock("./commands", () => ({
  nomesDeCommands: () => ["lancarTransacao"],
  findCommand: () => ({ name: "lancarTransacao", module: "finance", risk: 3,
    revalidar: ["/financeiro"], camposAuditaveis: [], desfazer: { kind: "nao-ha", porque: "Teste" },
    parse: (valor: unknown) => ({ ok: true, valor }), prever: d.prever }),
}));
const { prepararLancamentoDoComprovante } = await import("./document");
const campos = avaliarExtracao({
  estabelecimento: { valor: "Padaria", confianca: "alta" }, cnpj: { valor: null, confianca: "baixa" },
  data: { valor: "2026-11-01", confianca: "alta" }, hora: { valor: null, confianca: "baixa" },
  totalCentavos: { valor: 1500, confianca: "alta" }, formaPagamento: { valor: "PIX", confianca: "alta" },
  numeroDocumento: { valor: null, confianca: "baixa" }, itens: [],
}, "2026-11-08");
let tipo: string | null;
let documentoExiste: boolean;
let erroAnexo: boolean;
let erroDocumento: boolean;
const consultas: { tabela: string; colunas?: string; filtros: unknown[][] }[] = [];
const entrada = { userId: "dono", extractionId: "leitura", correcoes: {}, escolha: { conta: "Conta" } };
beforeEach(() => {
  vi.clearAllMocks(); consultas.length = 0; tipo = "ia_documento"; documentoExiste = true; erroAnexo = false; erroDocumento = false;
  d.from.mockImplementation((tabela: string) => {
    const consulta = { tabela, colunas: "", filtros: [] as unknown[][] }; consultas.push(consulta);
    const q = { select: (colunas: string) => { consulta.colunas = colunas; return q; },
      eq: (...filtro: unknown[]) => { consulta.filtros.push(filtro); return q; },
      maybeSingle: async () => ({ data: tabela === "ai_document_extractions" ? { id: "leitura", document_id: "documento", status: "extraida", campos }
        : tabela === "ai_documents" ? (documentoExiste ? { attachment_id: "anexo" } : null)
        : tipo === null ? null : { entity_type: tipo }, error: ((erroAnexo && tabela === "attachments") || (erroDocumento && tabela === "ai_documents")) ? { code: "XX000" } : null }),
      update: () => q, then: (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
    return q;
  });
  d.prever.mockResolvedValue({ previsao: { resumo: "Despesa de R$ 15,00", linhas: [{ rotulo: "Conta", valor: "Conta" }], ressalvas: [] } });
  d.propor.mockResolvedValue({ id: "proposta", effectHash: "hash", expiresAt: "2026-11-08T13:00:00Z" });
});
describe("Task 24 — preparo de comprovante já lançado", () => {
  it.each(["transaction", "outra_entidade"])("recusa anexo %s antes de prever ou gravar proposta", async estado => {
    tipo = estado;
    expect(await prepararLancamentoDoComprovante(entrada)).toEqual({ ok: false, mensagem: "Este comprovante já virou lançamento. Nada foi preparado." });
    expect(d.prever).not.toHaveBeenCalled(); expect(d.propor).not.toHaveBeenCalled();
  });
  it("comprovante guardado continua preparando pela previsão e proposta existentes", async () => {
    expect(await prepararLancamentoDoComprovante(entrada)).toMatchObject({ ok: true, proposta: { id: "proposta" } });
    expect(d.prever).toHaveBeenCalledTimes(1); expect(d.propor).toHaveBeenCalledTimes(1);
    expect(consultas.filter(c => c.colunas)).toEqual([
      { tabela: "ai_document_extractions", colunas: "id, document_id, status, campos", filtros: [["id", "leitura"], ["user_id", "dono"]] },
      { tabela: "ai_documents", colunas: "attachment_id", filtros: [["id", "documento"], ["user_id", "dono"]] },
      { tabela: "attachments", colunas: "entity_type", filtros: [["id", "anexo"], ["user_id", "dono"]] },
    ]);
  });
  it.each(["documento", "anexo", "erro", "erroDocumento"])("%s indisponível não prepara nem afirma lançamento", async falta => {
    documentoExiste = falta !== "documento"; tipo = falta === "anexo" ? null : "ia_documento"; erroAnexo = falta === "erro"; erroDocumento = falta === "erroDocumento";
    expect(await prepararLancamentoDoComprovante(entrada)).toEqual({ ok: false, mensagem: "Esta leitura não está mais registrada. Nada foi lançado — extraia o comprovante de novo." });
    expect(d.prever).not.toHaveBeenCalled(); expect(d.propor).not.toHaveBeenCalled();
  });
});
