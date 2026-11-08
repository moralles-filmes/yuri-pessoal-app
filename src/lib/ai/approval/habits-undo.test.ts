import { beforeEach, describe, expect, it, vi } from "vitest";
const d = vi.hoisted(() => ({ fonte: vi.fn(), ja: vi.fn(), propor: vi.fn(), apagar: vi.fn(), inserts: [] as string[] }));
vi.mock("./queries", async original => ({ ...await original<typeof import("./queries")>(), getExecucaoDaIa: d.fonte, jaFoiDesfeita: d.ja }));
vi.mock("./proposals", async original => ({ ...await original<typeof import("./proposals")>(), criarPropostaDeDesfazer: d.propor }));
vi.mock("@/lib/ai/queries", () => ({ getAiPreferences: async () => ({ permissions: { allow_habits: true }, writePermissions: { allow_write_habits: true } }) }));
vi.mock("@/lib/habits/queries", () => ({ getHabitsDashboard: async () => ({ habits: [{ id: ID, name: "Água" }] }) }));
vi.mock("@/lib/habits/services", () => ({ desfazerCheckIn: d.apagar }));
const ID = "11111111-1111-4111-8111-111111111111";
const agora = new Date("2026-11-08T12:00:00Z");
let hash = "";
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (tabela: string) => {
  const q = { select: () => q, eq: () => q, update: () => q, insert: () => { d.inserts.push(tabela); return q; },
    maybeSingle: async () => ({ data: tabela === "ai_action_proposals" ? { id: "p", command: "desfazerHabito", payload: { habito_id: ID, data: "2026-11-08" }, tool_name: "tela.desfazer", tool_version: "1", effect_hash: hash, expires_at: "2026-11-08T13:00:00Z", undoes_execution_id: "original" } : tabela === "ai_action_approvals" ? { id: "aprovacao", decision: "confirmada" } : null, error: null }),
    single: async () => ({ data: { id: "nova" }, error: null }), then: (resolve: (r: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve) };
  return q;
} }) }));
const { prepararDesfazer } = await import("./undo");
const { montarHistorico, MOTIVO_SEM_DESFAZER } = await import("./history");
const { catalogoDeCommands } = await import("./queries");
const { executarAcaoAprovada } = await import("./execute");
const { hashDe } = await import("./proposals");
const { preverDesfazerHabito } = await import("./commands/habits-preview");
const fonte = (registroNovo?: boolean) => ({ id: "original", proposalId: "antiga", command: "registrarHabito", status: "sucesso", errorCode: null, targetId: ID, targetRoute: "/habitos", changedFields: { value: 8, is_done: true, log_date: "2026-11-08", ...(registroNovo === undefined ? {} : { registro_novo: registroNovo }) }, undetailed: false, itens: [], undoesExecutionId: null, startedAt: "2026-11-08T11:00:00Z", finishedAt: "2026-11-08T11:00:01Z", durationMs: 1000 });
beforeEach(async () => {
  vi.clearAllMocks(); d.inserts.length = 0; d.fonte.mockResolvedValue(fonte(false)); d.ja.mockResolvedValue(false); d.propor.mockResolvedValue({ id: "p", effectHash: "hash", expiresAt: "2026-11-08T13:00:00Z" }); d.apagar.mockResolvedValue({ ok: true });
  hash = hashDe(await preverDesfazerHabito({ habito_id: ID, data: "2026-11-08" }), "tela.desfazer", "1");
});
describe("Task 25 — restrição do desfazer sobrevive à proposta", () => {
  it.each([false, undefined])("histórico órfão não oferece desfazer com registro_novo=%s", registroNovo => {
    const h = montarHistorico({ propostas: [], aprovacoes: [], execucoes: [fonte(registroNovo)] }, catalogoDeCommands(), agora);
    expect(h[0].desfazer).toMatchObject({ tipo: "indisponivel" });
  });
  it("dia novo continua oferecendo o inverso no histórico", () => {
    const h = montarHistorico({ propostas: [], aprovacoes: [], execucoes: [fonte(true)] }, catalogoDeCommands(), agora);
    expect(h[0].desfazer.tipo).toBe("disponivel");
  });
  it.each([false, undefined])("servidor recusa preparar desfazer com registro_novo=%s", async registroNovo => {
    d.fonte.mockResolvedValue(fonte(registroNovo));
    expect(await prepararDesfazer({ userId: "dono", executionId: "original" })).toMatchObject({ ok: false });
    expect(d.propor).not.toHaveBeenCalled();
    expect(d.fonte).toHaveBeenCalledWith("dono", "original");
  });
  it("motivo de registro anterior chega ao dono", async () => {
    expect(await prepararDesfazer({ userId: "dono", executionId: "original" })).toEqual({ ok: false, mensagem: "O dia já tinha um registro; desfazer apagaria também o que estava antes." });
  });
  it("dia criado prepara o desfazer pelo mesmo motor", async () => {
    d.fonte.mockResolvedValue(fonte(true));
    expect(await prepararDesfazer({ userId: "dono", executionId: "original" })).toMatchObject({ ok: true });
    expect(d.propor).toHaveBeenCalledTimes(1);
  });
  it.each([false, undefined])("proposta de desfazer já preparada também é recusada com registro_novo=%s", async registroNovo => {
    d.fonte.mockResolvedValue(fonte(registroNovo));
    expect(await executarAcaoAprovada({ userId: "dono", proposalId: "p", hashDaTela: hash, agora })).toMatchObject({ ok: false });
    expect(d.apagar).not.toHaveBeenCalled(); expect(d.inserts).toEqual([]);
  });
  it("origem sem sucesso não autoriza proposta já preparada", async () => {
    d.fonte.mockResolvedValue({ ...fonte(true), status: "executando" });
    expect(await executarAcaoAprovada({ userId: "dono", proposalId: "p", hashDaTela: hash, agora })).toMatchObject({ ok: false });
    expect(d.apagar).not.toHaveBeenCalled();
  });
  it("inverso não pode apontar para execução de outro command", async () => {
    d.fonte.mockResolvedValue({ ...fonte(true), command: "concluirTarefaTodo" });
    expect(await executarAcaoAprovada({ userId: "dono", proposalId: "p", hashDaTela: hash, agora })).toMatchObject({ ok: false });
    expect(d.apagar).not.toHaveBeenCalled();
  });
  it("proposta válida de dia criado ainda executa", async () => {
    d.fonte.mockResolvedValue(fonte(true));
    expect(await executarAcaoAprovada({ userId: "dono", proposalId: "p", hashDaTela: hash, agora })).toMatchObject({ ok: true, status: "sucesso" });
    expect(d.apagar).toHaveBeenCalledTimes(1);
  });
});

it("legado explica a falta de prova sem afirmar que havia registro", async () => {
  d.fonte.mockResolvedValue(fonte());
  expect(await prepararDesfazer({ userId: "dono", executionId: "original" })).toMatchObject({ ok: false, mensagem: expect.stringContaining("não registrou se o dia estava vazio") });
});

it.each(["executando", "falhou", "parcial"] as const)("o estado %s mantém sua recusa antes de avaliar a restrição do hábito", async status => {
  d.fonte.mockResolvedValue({ ...fonte(), status });
  const motivos = { executando: MOTIVO_SEM_DESFAZER.EXECUTANDO, falhou: MOTIVO_SEM_DESFAZER.FALHOU, parcial: MOTIVO_SEM_DESFAZER.PARCIAL };
  expect(await prepararDesfazer({ userId: "dono", executionId: "original" })).toEqual({ ok: false, mensagem: motivos[status] });
  expect(d.propor).not.toHaveBeenCalled();
});
