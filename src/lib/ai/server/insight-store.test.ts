import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GravarInsightInput } from "./insight-store";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";
import { gravarInsight } from "./insight-store";
const insert = vi.fn(); const filtros: [string, unknown][] = [];
const existente = vi.fn(); let erro: { code: string } | null = null;
const client = { from: (table: string) => ({
  insert: (v: unknown) => { insert(table, v); return table === "ai_insights" ? { select: () => ({ single: async () => ({ data: erro ? null : { id: "novo" }, error: erro }) }) } : Promise.resolve({ error: null }); },
  select: () => { const q = { eq: (k: string, v: unknown) => { filtros.push([k, v]); return q; }, maybeSingle: existente }; return q; },
}) } as unknown as SupabaseClient<Database>;
const input = { userId: "dono", runId: "run", modulo: "financeiro", insight: { tipo: "observacao", prioridade: "baixa", titulo: "Gasto", resumo: "Gasto", explicacao: "Medido", evidencias: [] }, confianca: "alta", indicadores: [], citados: [], periodo: { de: "2026-10-01", ate: "2026-10-31" }, dedupeKey: "chave", expiresAt: "2026-11-01T03:00:00Z", provider: "anthropic", model: "claude-sonnet-5", promptVersion: "v1" } as GravarInsightInput;
beforeEach(() => { vi.clearAllMocks(); filtros.length = 0; erro = null; existente.mockResolvedValue({ data: { id: "existente", expires_at: "2026-11-01" } }); });
describe("concorrência na gravação do insight", () => {
  it("23505 busca a mesma chave e dono, devolve existente reaproveitado sem novas fontes", async () => {
    erro = { code: "23505" };
    expect(await gravarInsight(input, client)).toEqual({ id: "existente", dedupeKey: "chave", reaproveitado: true });
    expect(filtros).toEqual([["user_id", "dono"], ["dedupe_key", "chave"]]);
    expect(insert).toHaveBeenCalledTimes(1);
  });
  it("inserção nova não é reaproveitamento", async () => {
    expect(await gravarInsight(input, client)).toEqual({ id: "novo", dedupeKey: "chave", reaproveitado: false });
  });
  it("outro erro ou conflito sem linha legível continua falha", async () => {
    erro = { code: "XX000" }; expect(await gravarInsight(input, client)).toBeNull(); expect(existente).not.toHaveBeenCalled();
    erro = { code: "23505" }; existente.mockResolvedValue({ data: null }); expect(await gravarInsight(input, client)).toBeNull();
  });
});
