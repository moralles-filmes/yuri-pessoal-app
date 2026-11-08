import { describe, expect, it } from "vitest";
import { ACTION_COMMANDS } from "./commands";
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/registry";
import type { ToolDescriptor } from "@/lib/ai/tools/contracts";
import { permissoesDoCommand } from "./commands/permissions";

describe("permissões de commands e inversos", () => {
  it("todos os commands têm leitura e escrita resolvidas", () => {
    expect(ACTION_COMMANDS.length).toBe(15);
    for (const command of ACTION_COMMANDS) expect(permissoesDoCommand(command.name), command.name).not.toBeNull();
  });
  it("deriva as duas chaves da ferramenta e as conserva no inverso", () => {
    for (const ferramenta of AI_TOOL_REGISTRY.filter(t => t.kind === "escrita")) {
      const esperado = { leitura: ferramenta.requiredPermission, escrita: ferramenta.requiredWritePermission };
      expect(permissoesDoCommand(ferramenta.command!)).toEqual(esperado);
      const original = ACTION_COMMANDS.find(c => c.name === ferramenta.command)!;
      if (original.desfazer.kind === "command") expect(permissoesDoCommand(original.desfazer.command)).toEqual(esperado);
    }
  });
  it("Financeiro e Memória não caem em chaves de outro módulo", () => {
    expect(permissoesDoCommand("excluirTransacao")).toEqual({ leitura: "allow_finance", escrita: "allow_write_finance" });
    expect(permissoesDoCommand("esquecerPreferencia")).toEqual({ leitura: "allow_memory", escrita: "allow_write_memory" });
    expect(permissoesDoCommand("inexistente")).toBeNull();
  });
});


it("duas chaves diferentes para o mesmo command recusam por ambiguidade",()=>{
  const tabela=AI_TOOL_REGISTRY as ToolDescriptor[];
  const original=tabela.find(t=>t.command==="lancarTransacao")!;
  const tamanho=tabela.length;
  try {
    tabela.push({...original,name:"teste.ambigua",requiredPermission:"allow_todo",requiredWritePermission:"allow_write_todo"});
    expect(permissoesDoCommand("lancarTransacao")).toBeNull();
  } finally { tabela.length=tamanho; }
});
