/**
 * Fase 18-A — IA · Contratos do Tool Registry.
 *
 * Os TIPOS existem desde a 18-A; o registry NASCE VAZIO (ver `registry.ts`). Ter o contrato
 * pronto e a lista vazia é diferente de não ter o conceito: é o que permite a 18-B (leitura)
 * e a 18-C (escrita) acrescentarem ferramentas sem reescrever a fronteira — e é o que deixa
 * as regras abaixo já escritas, testadas e difíceis de furar ANTES da primeira ferramenta.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ REGRAS PERMANENTES DE QUALQUER FERRAMENTA, EM QUALQUER SUBFASE                        ║
 * ║                                                                                       ║
 * ║  • `user_id` NUNCA está no schema de entrada. Ele vem de `authContext()`, sempre.     ║
 * ║  • O schema é `.strict()`: campo a mais é erro, não é ignorado.                       ║
 * ║  • Ferramenta é CASCA FINA sobre o serviço que o formulário já usa. Nenhuma regra de  ║
 * ║    negócio é reescrita — não existe uma segunda forma de lançar transação.            ║
 * ║  • Nenhuma ferramenta é criada em runtime, nem montada a partir de texto do modelo.   ║
 * ║  • Nenhuma ferramenta chama rota HTTP interna simulando um formulário.                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro. Nenhum I/O.
 */

/** Os 5 níveis de risco. Consumidos pela Approval Engine na 18-C. */
export const NIVEIS_DE_RISCO = [1, 2, 3, 4, 5] as const;
export type NivelDeRisco = (typeof NIVEIS_DE_RISCO)[number];

export type ToolKind = "leitura" | "escrita";

export type ToolDescriptor = {
  readonly name: string;
  readonly module: string;
  readonly kind: ToolKind;
  readonly risk: NivelDeRisco;
  /** Descrição em pt-BR enviada ao modelo. */
  readonly description: string;
  /** JSON Schema da entrada. `unknown` porque `tools/` também é camada pura. */
  readonly inputSchema: unknown;
  /** Escrita exige confirmação e idempotência — a 18-C liga isso. */
  readonly requiresConfirmation: boolean;
  readonly idempotent: boolean;
};

/** Uma leitura sem confirmação é normal; uma ESCRITA sem confirmação nunca é. */
export function isToolDescriptorCoherent(tool: ToolDescriptor): boolean {
  if (tool.kind === "escrita" && !tool.requiresConfirmation) return false;
  if (tool.kind === "escrita" && tool.risk < 2) return false;
  return true;
}
