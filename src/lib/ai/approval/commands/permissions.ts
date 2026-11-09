import "server-only";

import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/registry";
import type { ToolPermission, ToolWritePermission } from "@/lib/ai/tools/contracts";
import { ACTION_COMMANDS } from "./index";

type PermissoesDoCommand = { readonly leitura: ToolPermission; readonly escrita: ToolWritePermission };

/** Deriva as chaves da ferramenta original, inclusive para commands sem ferramenta (inversos). */
export function permissoesDoCommand(command: string): PermissoesDoCommand | null {
  const origens = new Set([command]);
  for (const original of ACTION_COMMANDS) {
    if (original.desfazer.kind === "command" && original.desfazer.command === command) origens.add(original.name);
  }
  const pares = new Map<string, PermissoesDoCommand>();
  for (const ferramenta of AI_TOOL_REGISTRY) {
    if (ferramenta.kind !== "escrita" || !ferramenta.command || !origens.has(ferramenta.command) || !ferramenta.requiredWritePermission) continue;
    const par = { leitura: ferramenta.requiredPermission, escrita: ferramenta.requiredWritePermission };
    pares.set(par.leitura + ":" + par.escrita, par);
  }
  // Ausência ou ambiguidade de autorização nunca permite executar.
  return pares.size === 1 ? [...pares.values()][0] : null;
}
