import { describe, expect, it } from "vitest";
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/registry";
import { TOOL_PERMISSIONS } from "@/lib/ai/tools/contracts";
import { EXPERIENCIAS, MAX_FERRAMENTAS_POR_EXPERIENCIA } from "./catalog";
import { ATALHOS_DE_EXPERIENCIA } from "./atalhos";

const HOJE = "2026-09-21"; // segunda-feira

describe("18-F Bloco 4 — o catálogo das experiências", () => {
  it("são TRÊS panoramas dirigidos, e os ids são os do atalho", () => {
    // A Caixa de entrada NÃO está aqui: ela usa o laço normal (§7.5). Ver `inbox.ts`.
    expect(EXPERIENCIAS.map((e) => e.id)).toEqual([
      "planejar-dia",
      "encerrar-dia",
      "planejar-semana",
    ]);
    expect(ATALHOS_DE_EXPERIENCIA.map((a) => a.id)).toEqual(EXPERIENCIAS.map((e) => e.id));
  });

  /**
   * ⛔ O TETO É DO CATÁLOGO, NÃO DO RUNTIME. `computeReservation` reserva sobre este número;
   * uma experiência que precise de mais é uma DECISÃO a tomar, não um limite a subir em
   * silêncio.
   */
  it("nenhuma experiência passa do teto de ferramentas", () => {
    for (const e of EXPERIENCIAS) {
      expect(e.ferramentas.length, e.id).toBeLessThanOrEqual(MAX_FERRAMENTAS_POR_EXPERIENCIA);
      expect(e.ferramentas.length, e.id).toBeGreaterThan(0);
    }
  });

  it("toda ferramenta citada EXISTE no registry e é de LEITURA", () => {
    for (const e of EXPERIENCIAS) {
      for (const f of e.ferramentas) {
        const d = AI_TOOL_REGISTRY.find((t) => t.name === f.toolName);
        expect(d, `${e.id} → ${f.toolName}`).toBeDefined();
        // ⛔ Escrita numa experiência criaria proposta sem o dono ter pedido nada.
        expect(d?.kind, `${e.id} → ${f.toolName}`).toBe("leitura");
        expect(TOOL_PERMISSIONS).toContain(d?.requiredPermission);
      }
    }
  });

  it("a mesma ferramenta não aparece duas vezes na mesma experiência", () => {
    for (const e of EXPERIENCIAS) {
      const nomes = e.ferramentas.map((f) => f.toolName);
      expect(new Set(nomes).size, e.id).toBe(nomes.length);
    }
  });

  it("os argumentos saem de `hoje` INJETADO e passam no Zod da própria ferramenta", async () => {
    const { TOOL_EXECUTORS } = await import("@/lib/ai/tools/executors");
    for (const e of EXPERIENCIAS) {
      for (const f of e.ferramentas) {
        const entrada = f.argumentos(HOJE);
        const schema = TOOL_EXECUTORS[f.toolName]?.schema;
        expect(schema, `${e.id} → ${f.toolName}`).toBeDefined();
        const r = schema!.safeParse(entrada);
        expect(r.success, `${e.id} → ${f.toolName}: ${JSON.stringify(entrada)}`).toBe(true);
      }
    }
  });

  it("todo prompt de redação tem versão própria e não é vazio", () => {
    for (const e of EXPERIENCIAS) {
      expect(e.promptVersion, e.id).toMatch(/^experiencia-[a-z-]+-v\d+$/);
      expect(e.prompt.length, e.id).toBeGreaterThan(200);
    }
  });
});
