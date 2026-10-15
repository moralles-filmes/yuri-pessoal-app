import { describe, expect, it } from "vitest";
import { faseDoEvento } from "./fase-do-chat";

/**
 * REDESIGN-07-D · D3 — o que a região de status do chat anuncia (spec §6.3).
 *
 * A FASE, nunca o texto: com `role="log"` e streaming, o leitor de tela leria cada pedaço da
 * resposta. Quem anuncia é uma região `role="status"` que só muda quando a fase muda.
 */
describe("faseDoEvento", () => {
  it("cada evento vira a sua frase", () => {
    expect(faseDoEvento({ tipo: "start" })).toBe("Respondendo…");
    expect(faseDoEvento({ tipo: "proposta" })).toBe("Uma alteração aguardando você");
    expect(faseDoEvento({ tipo: "done" })).toBe("Resposta concluída");
    expect(faseDoEvento({ tipo: "cancelada" })).toBe("Resposta cancelada");
  });

  it("a consulta diz o MÓDULO, não o nome técnico da ferramenta", () => {
    expect(faseDoEvento({ tipo: "tool", toolName: "training.get_volume" })).toBe(
      "Consultando Treinos…",
    );
    expect(faseDoEvento({ tipo: "tool", toolName: "todo.get_agenda" })).toBe("Consultando TO-DO…");
  });

  it("ferramenta sem rótulo não vaza o identificador", () => {
    const fase = faseDoEvento({ tipo: "tool", toolName: "modulo.inexistente" });
    expect(fase).not.toContain("modulo.inexistente");
    expect(fase).toMatch(/^Consultando /);
  });

  it("troca de provedor e erro anunciam a frase que o servidor já mandou em pt-BR", () => {
    expect(faseDoEvento({ tipo: "switch", motivo: "Tentando outro provedor." })).toBe(
      "Tentando outro provedor.",
    );
    expect(faseDoEvento({ tipo: "error", mensagem: "Orçamento do dia atingido." })).toBe(
      "Orçamento do dia atingido.",
    );
  });
});
