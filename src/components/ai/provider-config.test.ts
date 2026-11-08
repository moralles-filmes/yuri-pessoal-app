import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { montarConfigDoProvedor, fallbackDisponivel } from "./provider-config";
import type { ProviderCardView } from "@/lib/ai/types";
const card = { provider: "gemini", displayName: "Meu", visionModel: "visao-atual", timeoutMs: 9000, maxRetries: 2, fallbackOrder: ["openai"] } as unknown as ProviderCardView;
const form = { enabled: true, defaultModel: "padrao", economyModel: "__nenhum__", advancedModel: "avancado", fallbackAllowed: true };
describe("configuração preservada", () => {
    it("mantém visão não editada e normaliza só os selects", () => { expect(montarConfigDoProvedor(card, form, 1, null)).toEqual({ provider: "gemini", displayName: "Meu", visionModel: "visao-atual", timeoutMs: 9000, maxRetries: 2, fallbackOrder: ["openai"], enabled: true, defaultModel: "padrao", economyModel: null, advancedModel: "avancado", fallbackAllowed: true, dailyLimit: 1, monthlyLimit: null }); });
    it("visão ausente continua nula", () => expect(montarConfigDoProvedor({ ...card, visionModel: null }, form, null, 3).visionModel).toBeNull());
    it("fallback exige uma ordem", () => { expect(fallbackDisponivel([])).toBe(false); expect(fallbackDisponivel(["openai"])).toBe(true); });
    it("cartão integra o payload e desliga o formulário ao remover chave", () => { const s = readFileSync("src/components/ai/provider-card.tsx", "utf8"); expect(s).toContain("saveAiProviderConfig(montarConfigDoProvedor("); expect(s).toMatch(/onRemovida[\s\S]*setForm\(.*enabled: false/); expect(s).toContain("disabled={!fallbackDisponivel(card.fallbackOrder)}"); expect(s).toContain("Não há ordem de fallback configurada."); });
    it("preferências declaram fallback indisponível sem nenhuma ordem", () => { const s = readFileSync("src/components/ai/ai-preferences-form.tsx", "utf8"); expect(s).toContain("cards.some((card) => fallbackDisponivel(card.fallbackOrder))"); expect(s).toContain("disabled={!temOrdemDeFallback}"); expect(s).toContain("Não há ordem de fallback configurada."); });
});
