import { describe, expect, it } from "vitest";
import { AGENT_PERMISSION, permissaoDoModulo, moduloDoAgente } from "./routing";

// Permanecem as funções usadas pela memória e pela autorização, depois de aposentar palavras-chave.
describe("permissões e módulo do especialista", () => {
  it("a permissão do módulo continua derivada do registry, inclusive body", () => {
    expect(permissaoDoModulo("body")).toBe("allow_body");
    expect(permissaoDoModulo("training")).toBe("allow_training");
    expect(permissaoDoModulo("calendar")).toBe("allow_calendar");
    expect(permissaoDoModulo("finance")).toBe("allow_finance");
    expect(permissaoDoModulo("nutrition")).toBe("allow_nutrition");
    expect(permissaoDoModulo("modulo_que_nao_existe")).toBeNull();
  });
  it.each([
    ["treinos", "training", "allow_training"], ["todo", "todo", "allow_todo"],
    ["habitos", "habits", "allow_habits"], ["estudos", "studies", "allow_studies"],
    ["agenda", "calendar", "allow_calendar"], ["tarefas", "tasks", "allow_tasks"],
    ["financeiro", "finance", "allow_finance"], ["dieta", "nutrition", "allow_nutrition"],
  ])("%s conserva módulo %s e chave %s", (agente, modulo, chave) => {
    expect(moduloDoAgente(agente)).toBe(modulo);
    expect(AGENT_PERMISSION[agente]).toBe(chave);
  });
  it("o coordenador e agente desconhecido não ganham módulo nem autorização", () => {
    for (const id of ["assistente-pessoal", "desconhecido"]) {
      expect(moduloDoAgente(id)).toBeNull();
      expect(AGENT_PERMISSION[id]).toBeUndefined();
    }
  });
});
