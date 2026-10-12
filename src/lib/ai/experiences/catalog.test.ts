import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/registry";
import { TOOL_PERMISSIONS } from "@/lib/ai/tools/contracts";
import { EXPERIENCIAS, MAX_FERRAMENTAS_POR_EXPERIENCIA } from "./catalog";
import { ATALHOS_DE_EXPERIENCIA } from "./atalhos";

/**
 * ⚠️ `await import` no TOPO DO MÓDULO, não dentro do `it` — que é o idioma dos outros
 * quinze testes do módulo de IA (`habits.test.ts`, `todo.test.ts`, `memory.test.ts`,
 * `route.test.ts`, …).
 *
 * `executors.ts` é `server-only` e arrasta a árvore de I/O das 30 ferramentas: carregá-lo
 * custa ~1,6 s numa máquina ociosa. Enquanto esse `await` morava dentro do `it`, o custo
 * contava como TEMPO DE TESTE contra o teto default de 5 s do Vitest (o projeto não
 * declara `testTimeout`), e sob a carga da suíte completa — 192 arquivos disputando o
 * mesmo servidor Vite — ele estourava de vez em quando, com `Test timed out in 5000ms`.
 * Era o único `await import` do repositório dentro de um caso de teste, e por isso o
 * único caso vulnerável: os outros seis deste arquivo são síncronos e levam 0–2 ms.
 *
 * ⛔ Isto NÃO é aumento de orçamento de tempo. O trabalho saiu de onde o relógio do teste
 * o media e foi para o `collect`, que não tem esse teto. Dar um `testTimeout` maior
 * trataria o sintoma e deixaria a corrida de pé, mais longe.
 */
const { TOOL_EXECUTORS } = await import("@/lib/ai/tools/executors");

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

  it("os argumentos saem de `hoje` INJETADO e passam no Zod da própria ferramenta", () => {
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

  /**
   * ⛔ `atalhos.ts` NÃO TEM UM ÚNICO IMPORT, e a ausência é a garantia — a mesma forma do
   * teste de `painel.ts` (invariante 90).
   *
   * `chat-client.tsx` precisa de três títulos para desenhar três botões. Um import daqui
   * para o catálogo arrastaria os prompts de redação inteiros e o Tool Registry para o
   * bundle do cliente, por causa de três strings. Sem import, isso não tem como acontecer.
   */
  it("`atalhos.ts` não tem import nenhum — é DADO, não declaração de servidor", () => {
    const codigo = fs.readFileSync(path.join(__dirname, "atalhos.ts"), "utf8");
    const semComentarios = codigo
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join("\n");

    expect(semComentarios).not.toMatch(/\bimport\b/);
    expect(semComentarios).not.toMatch(/\brequire\s*\(/);
  });
});
