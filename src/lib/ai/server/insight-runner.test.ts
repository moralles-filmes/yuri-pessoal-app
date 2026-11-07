import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiObjectRequest } from "@/lib/ai/core/contracts";
const d = vi.hoisted(() => ({
  buscar: vi.fn(), gravar: vi.fn(), begin: vi.fn(), start: vi.fn(), close: vi.fn(), complete: vi.fn(), fail: vi.fn(), generate: vi.fn(), chave: vi.fn(), coletar: vi.fn(), timeoutMs: 60_000,
}));
vi.mock("./crypto-readiness", () => ({ getCryptoReadiness: () => ({ ready: true }), AI_CRYPTO_NOT_CONFIGURED: "crypto" }));
vi.mock("./credential-store", () => ({ resolveApiKey: d.chave }));
vi.mock("./insight-store", () => ({ buscarInsightPorChave: d.buscar, gravarInsight: d.gravar }));
vi.mock("./run-store", () => ({ beginInsightRun: d.begin, startAttempt: d.start, closeAttempt: d.close, completeRun: d.complete, failRun: d.fail, MENSAGEM_ADMISSAO: { NEGADO: "Sem autorização" } }));
vi.mock("@/lib/ai/insights/collectors/finance", () => ({ coletarFinanceiro: d.coletar }));
vi.mock("@/lib/ai/insights/collectors/training", () => ({ coletarTreinos: d.coletar }));
vi.mock("@/lib/ai/insights/collectors/nutrition", () => ({ coletarDieta: d.coletar }));
vi.mock("@/lib/ai/providers/provider-factory", () => ({ createProviderClient: () => ({ generateObject: d.generate }) }));
vi.mock("@/lib/ai/queries", () => ({
  getRouterConfigs: async () => [{ provider: "anthropic", enabled: true, defaultModel: "claude-sonnet-5", economyModel: null, advancedModel: null, fallbackAllowed: false, fallbackOrder: [], maxRetries: 1, timeoutMs: d.timeoutMs, hasUsableCredential: true }],
  getAiPreferences: async () => ({ defaultProvider: "anthropic", defaultModel: "claude-sonnet-5", allowFallback: false, reservationMargin: 1.15 }),
}));
const { runInsight } = await import("./insight-runner");
const periodo = { de: "2026-10-01", ate: "2026-10-31" };
const indicador = { id: "financeiro.gasto_mes", modulo: "financeiro", rotulo: "Gasto", valor: 10, unidade: "R$", qualidade: "exato", periodo, n: 1, rota: "/financeiro" };
const valido = { tipo: "observacao", prioridade: "baixa", titulo: "Gasto medido", resumo: "Gasto {{ind:financeiro.gasto_mes}}", explicacao: "O gasto foi medido.", evidencias: [{ afirmacao: "Gasto medido", indicador_id: indicador.id }] };
const resposta = { ok: true, value: valido, usage: { inputTokens: 100, outputTokens: 20, cachedInputTokens: null, availability: { inputTokens: "available", outputTokens: "available", cachedInputTokens: "unavailable" } }, providerRequestId: "req" };
const input = { userId: "u", modulo: "financeiro" as const, agora: new Date("2026-10-21T12:00:00Z") };
beforeEach(() => {
  vi.resetAllMocks(); d.timeoutMs = 60_000;
  d.buscar.mockResolvedValue(null); d.gravar.mockResolvedValue({ id: "insight", reaproveitado: false });
  d.begin.mockResolvedValue({ ok: true, value: { runId: "run" } }); d.start.mockResolvedValue({ id: "attempt" });
  d.chave.mockResolvedValue({ ok: true, value: "sintetica" }); d.coletar.mockResolvedValue({ indicadores: [indicador], periodo }); d.generate.mockResolvedValue(resposta);
});
describe("resultado pago e fechamento do insight", () => {
  it("persiste antes de completar o run e propaga o reaproveitamento", async () => {
    d.gravar.mockResolvedValue({ id: "existente", reaproveitado: true });
    expect(await runInsight(input)).toEqual({ ok: true, insightId: "existente", reaproveitado: true });
    expect(d.gravar.mock.invocationCallOrder[0]).toBeLessThan(d.complete.mock.invocationCallOrder[0]);
    expect(d.fail).not.toHaveBeenCalled();
  });
  it("falha de gravação não conclui o run", async () => {
    d.gravar.mockResolvedValue(null);
    expect(await runInsight(input)).toMatchObject({ ok: false, code: "INSIGHT_NOT_RECORDED" });
    expect(d.complete).not.toHaveBeenCalled(); expect(d.fail).toHaveBeenCalledTimes(1);
  });
  it.each(["start", "chave", "generate", "gravar", "complete"] as const)("exceção em %s depois da admissão fecha o run", async borda => {
    d[borda].mockRejectedValueOnce(new Error("detalhe privado"));
    const resultado = await runInsight(input);
    expect(resultado).toMatchObject({ ok: false, code: "INSIGHT_INTERRUPTED" });
    expect(JSON.stringify(resultado)).not.toContain("detalhe privado");
    expect(d.fail).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(d.fail.mock.calls)).not.toContain("detalhe privado");
    if (borda === "generate" || borda === "chave") expect(d.close).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", usage: null }));
  });
  it("admissão recusada não chama nem fecha execução inexistente", async () => {
    d.begin.mockResolvedValue({ ok: false, code: "NEGADO" });
    expect(await runInsight(input)).toMatchObject({ ok: false, code: "NEGADO" });
    expect(d.fail).not.toHaveBeenCalled(); expect(d.generate).not.toHaveBeenCalled();
  });
  it("recorta generateObject pelo prazo restante desde antes da coleta", async () => {
    let agora = 0; d.coletar.mockImplementation(async () => { agora = 10_000; return { indicadores: [indicador], periodo }; });
    await runInsight({ ...input, agoraMs: () => agora });
    expect((d.generate.mock.calls[0][0] as AiObjectRequest).timeoutMs).toBe(45_000);
  });
  it("não começa chamada abaixo do piso depois de abrir a credencial", async () => {
    let agora = 0; d.chave.mockImplementation(async () => { agora = 51_000; return { ok: true, value: "sintetica" }; });
    expect(await runInsight({ ...input, agoraMs: () => agora })).toMatchObject({ ok: false, code: "AI_DEADLINE" });
    expect(d.generate).not.toHaveBeenCalled(); expect(d.fail).toHaveBeenCalledTimes(1);
  });
  it("prazo gasto na coleta impede a primeira tentativa", async () => {
    let agora = 0; d.coletar.mockImplementation(async () => { agora = 51_000; return { indicadores: [indicador], periodo }; });
    expect(await runInsight({ ...input, agoraMs: () => agora })).toMatchObject({ ok: false, code: "AI_DEADLINE" });
    expect(d.start).not.toHaveBeenCalled(); expect(d.fail).toHaveBeenCalledTimes(1);
  });
  it("não repete a chamada depois de esgotar o prazo", async () => {
    let agora = 0; d.generate.mockImplementation(async () => { agora = 55_000; return { ...resposta, ok: false, error: { class: "ERRO_TEMPORARIO", code: "TEMP", message: "Indisponível", retryable: true } }; });
    expect(await runInsight({ ...input, agoraMs: () => agora })).toMatchObject({ ok: false, code: "AI_DEADLINE" });
    expect(d.generate).toHaveBeenCalledTimes(1);
  });
});

it("mantém o timeout configurado quando é menor que o prazo restante", async () => {
  d.timeoutMs = 10_000;
  await runInsight({ ...input, agoraMs: () => 0 });
  expect((d.generate.mock.calls[0][0] as AiObjectRequest).timeoutMs).toBe(10_000);
});
