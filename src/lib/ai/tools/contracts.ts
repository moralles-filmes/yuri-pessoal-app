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

export const NIVEIS_DE_RISCO = [1, 2, 3, 4, 5] as const;
export type NivelDeRisco = (typeof NIVEIS_DE_RISCO)[number];

export type ToolKind = "leitura" | "escrita";

/**
 * A chave de `ai_user_preferences` que autoriza a ferramenta. Uma por ferramenta: duas
 * chaves para o mesmo dado dariam duas respostas diferentes para o mesmo fato.
 */
export const TOOL_PERMISSIONS = [
  "allow_finance",
  "allow_nutrition",
  "allow_training",
  "allow_body",
  "allow_todo",
  "allow_calendar",
  "allow_tasks",
  "allow_habits",
  "allow_studies",
] as const;
export type ToolPermission = (typeof TOOL_PERMISSIONS)[number];

export type ToolDescriptor = {
  readonly name: string;
  readonly version: string;
  readonly module: string;
  readonly kind: ToolKind;
  readonly risk: NivelDeRisco;
  /** Descrição em pt-BR enviada ao modelo. */
  readonly description: string;
  /** JSON Schema da entrada. `unknown` porque `tools/` também é camada pura. */
  readonly inputSchema: unknown;
  readonly outputSchema: unknown;
  readonly allowedAgents: readonly string[];
  readonly requiredPermission: ToolPermission;
  readonly timeoutMs: number;
  /** Teto de registros devolvidos. Zero não é "sem limite" — é incoerente. */
  readonly maxRecords: number;
  readonly requiresConfirmation: boolean;
  readonly idempotent: boolean;
};

/** Uma referência a um registro real, para o "Ver dados usados". */
export type ToolRef = {
  readonly tipo: string;
  readonly id: string;
  /** Rota interna do sistema. Nunca URL externa. */
  readonly rota: string;
};

/**
 * O formato de saída de TODA ferramenta.
 *
 * `agregados` existe porque sem ele a regra "cálculo é do backend, nunca do modelo" não é
 * praticável: entregue uma lista de 50 transações e o modelo soma — e erra. O número pronto
 * é o que torna a proibição de aritmética exequível.
 */
export type ToolOutput = {
  readonly periodo: { readonly de: string; readonly ate: string } | null;
  readonly contagem: number;
  readonly completude: "exato" | "parcial";
  readonly motivo_incompleto?: string;
  readonly agregados: Readonly<Record<string, unknown>>;
  readonly itens: readonly unknown[];
  readonly refs: readonly ToolRef[];
  /** Texto curto em pt-BR para o caso vazio. Nunca substitui um número. */
  readonly observacao?: string;
};

export function emptyToolOutput(observacao: string): ToolOutput {
  return {
    periodo: null,
    contagem: 0,
    completude: "exato",
    agregados: {},
    itens: [],
    refs: [],
    observacao,
  };
}

/**
 * Escrita sem confirmação nunca é coerente; leitura COM confirmação também não, porque
 * criaria na 18-C um caminho de aprovação que ninguém exercitou. E `maxRecords` zero
 * significaria "sem teto", que é justamente o que a subfase existe para impedir.
 */
export function isToolDescriptorCoherent(tool: ToolDescriptor): boolean {
  if (tool.maxRecords < 1) return false;
  if (tool.kind === "escrita") {
    return tool.requiresConfirmation && tool.risk >= 2;
  }
  return !tool.requiresConfirmation;
}
