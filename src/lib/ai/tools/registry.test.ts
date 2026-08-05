/**
 * Fase 18-B — IA · Integridade do Tool Registry.
 *
 * O registry é a ÚNICA porta pela qual uma ferramenta existe. Estes testes guardam as
 * propriedades que nenhuma revisão de código pega sozinha: nome de domínio (nunca operação
 * de banco), schema fechado, `user_id` ausente da entrada, e a concordância nos DOIS sentidos
 * entre `allowedAgents` do descriptor e `allowedTools` do agente.
 */

import { describe, expect, it } from "vitest";
import { isToolDescriptorCoherent } from "./contracts";
import { AI_TOOL_REGISTRY, findTool, toolDefinitionsFor } from "./registry";
import { AI_AGENT_REGISTRY } from "@/lib/ai/agents/registry";

describe("integridade do registry (18-B)", () => {
  it("toda ferramenta é de LEITURA — a 18-B não tem escrita", () => {
    expect(AI_TOOL_REGISTRY.length).toBeGreaterThan(0);
    for (const t of AI_TOOL_REGISTRY) expect(t.kind).toBe("leitura");
  });

  it("toda ferramenta é coerente", () => {
    for (const t of AI_TOOL_REGISTRY) {
      expect(isToolDescriptorCoherent(t), t.name).toBe(true);
    }
  });

  it("nome é ação de DOMÍNIO — nenhuma operação de banco", () => {
    const PROIBIDOS = [
      "execute_sql",
      "run_code",
      "call_any_endpoint",
      "update_any_table",
      "delete_any_record",
      "fetch_url_unrestricted",
      "insert",
      "delete",
      "drop",
      "query",
    ];
    for (const t of AI_TOOL_REGISTRY) {
      expect(t.name).toMatch(/^[a-z_]+\.[a-z_]+$/);
      for (const proibido of PROIBIDOS) expect(t.name).not.toContain(proibido);
    }
  });

  it("nenhum inputSchema menciona user_id ou owner_id", () => {
    const cru = JSON.stringify(AI_TOOL_REGISTRY.map((t) => t.inputSchema));
    expect(cru).not.toContain("user_id");
    expect(cru).not.toContain("owner_id");
    expect(cru).not.toContain("userId");
  });

  it("todo inputSchema é fechado (additionalProperties: false)", () => {
    for (const t of AI_TOOL_REGISTRY) {
      expect(
        (t.inputSchema as { additionalProperties?: boolean }).additionalProperties,
        t.name,
      ).toBe(false);
    }
  });

  it("nenhuma descrição de ferramenta usa linguagem de prescrição ou de culpa", () => {
    const PROIBIDO = [
      "você deveria",
      "peso ideal",
      "você falhou",
      "preguiça",
      "carga máxima",
      "diagnóstico",
      "prescrevo",
      "garanto que",
      "recomendo",
    ];
    for (const t of AI_TOOL_REGISTRY) {
      const texto = t.description.toLowerCase();
      for (const termo of PROIBIDO) expect(texto, `${t.name}: ${termo}`).not.toContain(termo);
    }
  });

  it("a allowlist de todo agente é subconjunto do registry", () => {
    const nomes = new Set(AI_TOOL_REGISTRY.map((t) => t.name));
    for (const agente of AI_AGENT_REGISTRY) {
      for (const nome of agente.allowedTools) {
        expect(nomes.has(nome), `${agente.id} → ${nome}`).toBe(true);
      }
    }
  });

  it("allowedAgents e a allowlist do agente concordam nos dois sentidos", () => {
    for (const t of AI_TOOL_REGISTRY) {
      expect(t.allowedAgents.length, `${t.name} sem agente`).toBeGreaterThan(0);
      for (const agentId of t.allowedAgents) {
        const agente = AI_AGENT_REGISTRY.find((a) => a.id === agentId);
        expect(agente, `agente ${agentId} de ${t.name}`).toBeDefined();
        expect(agente?.allowedTools).toContain(t.name);
      }
    }
  });

  it("um nome na allowlist que não existe no registry não vira ferramenta", () => {
    expect(toolDefinitionsFor(["training.nao_existe"])).toEqual([]);
    expect(findTool("training.nao_existe")).toBeNull();
  });
});

// `executors.ts` é server-only: o alias do Vitest (`src/test/server-only-stub.ts`) é o que
// permite importá-lo em teste. Ele NÃO afrouxa o build — vale só no test runner.
const { TOOL_EXECUTORS } = await import("./executors");

describe("registry ↔ executores", () => {
  it("toda ferramenta do registry tem executor", () => {
    for (const t of AI_TOOL_REGISTRY) {
      expect(TOOL_EXECUTORS[t.name], t.name).toBeDefined();
    }
  });

  it("todo executor tem ferramenta no registry — nada executa sem descriptor", () => {
    const nomes = new Set(AI_TOOL_REGISTRY.map((t) => t.name));
    for (const nome of Object.keys(TOOL_EXECUTORS)) {
      expect(nomes.has(nome), nome).toBe(true);
    }
  });
});
