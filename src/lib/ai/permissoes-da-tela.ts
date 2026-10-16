import "server-only";

/**
 * REDESIGN-07-D · D2 — IA · O que a tela de preferências precisa saber do Tool Registry.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O SERVIDOR DERIVA, A TELA RECEBE. O REGISTRY NÃO VAI PARA O NAVEGADOR.               ║
 * ║                                                                                       ║
 * ║ `ai-preferences-form.tsx` importava `@/lib/ai/tools/registry` para saber três coisas: ║
 * ║ o que cada chave de leitura libera, se cada chave de escrita já tem ferramenta e de   ║
 * ║ qual leitura ela depende. Isso levava os 30 descritores inteiros — descrições para o  ║
 * ║ modelo e JSON Schemas — ao bundle de `/ia/configuracoes` (~6,8 KB gz, medido). Agora  ║
 * ║ o Server Component chama esta função e passa o resultado por prop.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Continua DERIVADO do registry (invariantes 24 e 47): nenhuma lista à mão, e a chave sem
 * ferramenta continua desabilitada pelo mesmo motivo de antes. `server-only` torna o caminho
 * de volta ao cliente um erro de build, não uma regressão de orçamento silenciosa.
 */

import {
  TOOL_PERMISSIONS,
  TOOL_WRITE_PERMISSIONS,
  type ToolPermission,
  type ToolWritePermission,
} from "@/lib/ai/tools/contracts";
import {
  permissaoDeLeituraDaEscrita,
  toolsForPermission,
  toolsForWritePermission,
} from "@/lib/ai/tools/registry";

export type EscritaDoCatalogo = {
  /** Existe ferramenta de escrita publicada para esta chave (`toolsForWritePermission`). */
  readonly temFerramenta: boolean;
  /** A chave de leitura de que ela depende (`permissaoDeLeituraDaEscrita`). */
  readonly leitura: ToolPermission | null;
};

export type CatalogoDasPermissoes = {
  /** O que cada chave de leitura libera (`itemLabel` das ferramentas); vazio = nenhuma ainda. */
  readonly leituras: Readonly<Record<ToolPermission, readonly string[]>>;
  readonly escritas: Readonly<Record<ToolWritePermission, EscritaDoCatalogo>>;
};

export function catalogoDasPermissoes(): CatalogoDasPermissoes {
  const leituras = {} as Record<ToolPermission, readonly string[]>;
  for (const chave of TOOL_PERMISSIONS) {
    leituras[chave] = toolsForPermission(chave).map((f) => f.itemLabel);
  }
  const escritas = {} as Record<ToolWritePermission, EscritaDoCatalogo>;
  for (const chave of TOOL_WRITE_PERMISSIONS) {
    escritas[chave] = {
      temFerramenta: toolsForWritePermission(chave).length > 0,
      leitura: permissaoDeLeituraDaEscrita(chave),
    };
  }
  return { leituras, escritas };
}
