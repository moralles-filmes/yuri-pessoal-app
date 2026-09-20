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
 * O desfecho de uma chamada de ferramenta — o MESMO vocabulário de `ai_tool_calls.status`.
 *
 * Mora aqui, e não em `audit.ts`, porque `audit.ts` é `server-only` e a tela de
 * rastreabilidade precisa do tipo. Um `import type` de um módulo `server-only` até some na
 * compilação, mas basta alguém trocá-lo por um import de valor para o bundle do navegador
 * receber o cliente do Supabase inteiro — e o erro aparecer só no build.
 */
export const TOOL_CALL_STATUSES = [
  "executada",
  "rejeitada",
  "falhou",
  "timeout",
] as const;
export type ToolCallStatus = (typeof TOOL_CALL_STATUSES)[number];

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
  /**
   * ⚠️ 18-F Bloco 3 — A DÉCIMA, E ELA NÃO É UM MÓDULO DO DONO.
   *
   * As nove acima autorizam LER um módulo de registros dele. Esta autoriza o assistente a ler
   * as PREFERÊNCIAS que ele escreveu, e a colocá-las no prompt. Ela está aqui, e não solta
   * como `allow_vision`, por uma razão concreta: `memory.lembrar` é uma ferramenta do Tool
   * Registry, e `ToolDescriptor.requiredPermission` é `ToolPermission` — uma chave fora desta
   * lista não teria como ser exigida pelo guard.
   *
   * A consequência a conhecer: `permissaoDoModulo("memory")` passa a existir. O roteador não
   * a alcança (não há vocabulário de "memória" e não há agente do módulo), e é assim que fica.
   */
  "allow_memory",
] as const;
export type ToolPermission = (typeof TOOL_PERMISSIONS)[number];

/**
 * Fase 18-C — A SEGUNDA chave, e ela é de ESCRITA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESCREVER NUM MÓDULO EXIGE AS DUAS CHAVES: a de leitura E a de escrita.                ║
 * ║                                                                                       ║
 * ║ Não é redundância. Propor uma escrita começa lendo — resolver "a tarefa do mercado"    ║
 * ║ para um id é uma consulta —, e autorizar a IA a alterar um módulo que ela não pode nem ║
 * ║ ler descreveria um estado que não existe. A implicação prática é a que importa: quem   ║
 * ║ desliga a leitura de um módulo desliga a escrita dele junto, sem ter de lembrar.       ║
 * ║                                                                                       ║
 * ║ Só existem as chaves dos módulos que TÊM ação de escrita prevista (matriz do Bloco 0). ║
 * ║ Uma chave sem ferramenta que a honre seria um botão que não liga nada — o mesmo        ║
 * ║ defeito que `toolsForPermission` (invariante 24 da 18-B) existe para não cometer.      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export const TOOL_WRITE_PERMISSIONS = [
  "allow_write_todo",
  "allow_write_habits",
  "allow_write_calendar",
  "allow_write_nutrition",
  "allow_write_finance",
  /**
   * 18-F Bloco 3 — a SEXTA. Liga a IA a PROPOR memória; a de leitura (`allow_memory`) liga a
   * IA a USAR as que já existem. A distinção é a que o dono provavelmente quer: usar as
   * preferências dele sem que ela fique criando preferências por conta própria.
   *
   * ⚠️ A ORDEM IMPORTA em um lugar: `constants.test.ts` monta a enumeração do aviso com
   * `Intl.ListFormat` NA ORDEM desta lista. Por último, ela fecha a frase com "e Memória".
   */
  "allow_write_memory",
] as const;
export type ToolWritePermission = (typeof TOOL_WRITE_PERMISSIONS)[number];

/**
 * O que a ferramenta TOCA — declarado, nunca deduzido do nome do módulo.
 *
 * Deduzir seria adivinhação: `nutrition.get_day` e `nutrition.registrar_consumo` estão no
 * mesmo módulo e não têm o mesmo peso, e uma ferramenta de Treinos que gravasse peso
 * corporal tocaria dado de saúde sem ter "saude" em lugar nenhum do nome. Este campo é o
 * que faz `isToolDescriptorCoherent` exigir risco ≥ 3 de quem mexe com dinheiro, saúde ou
 * histórico consolidado (§3.1 do design da 18-C).
 */
/**
 * ⚠️ `externo` entrou no Bloco 4, com `calendar.criar_evento`, e a ausência dela era um buraco
 * real no vocabulário: as três primeiras descrevem o QUE o efeito toca, e nenhuma descrevia
 * ONDE ele para. Um compromisso criado com o Google conectado não fica no banco do dono — ele
 * vai para o calendário dele lá fora e chega aos aparelhos sincronizados. Isso não é
 * "dinheiro", não é "saúde" e não é "histórico consolidado", e ainda assim é a razão mais
 * forte para exigir risco 3 nesta subfase: é o único efeito que não dá para desfazer só
 * mexendo no nosso banco.
 */
export const SENSIBILIDADES = [
  "dinheiro",
  "saude",
  "historico_consolidado",
  "externo",
] as const;
export type Sensibilidade = (typeof SENSIBILIDADES)[number];

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
  /**
   * Como se chamam os `itens` desta ferramenta, em pt-BR e no plural.
   *
   * Existe porque a poda do executor precisa NOMEAR o que cortou. "Mostrando 50 de 51
   * registros" ao lado de `contagem: 1` faz o modelo entender "50 de 51 treinos" — e o que
   * foi podado eram os exercícios de um treino só. Rótulo genérico em texto que o modelo lê
   * vira número errado na resposta.
   */
  readonly itemLabel: string;
  readonly requiresConfirmation: boolean;
  readonly idempotent: boolean;

  /**
   * 18-C · Só para `kind: "escrita"`. A chave `allow_write_*` que o dono precisa ter ligado,
   * ALÉM da `requiredPermission` de leitura do mesmo módulo.
   *
   * Opcional no TIPO e obrigatória de FATO: sem ela, `isToolDescriptorCoherent` recusa a
   * ferramenta de escrita, e o guard a rejeita antes de qualquer execução. Torná-la
   * obrigatória no tipo faria as 22 leituras existentes declararem `undefined` por escrito —
   * ruído que esconderia a única declaração que importa.
   */
  readonly requiredWritePermission?: ToolWritePermission;

  /**
   * 18-C · Só para `kind: "escrita"`. O que a ferramenta toca. `[]` é uma declaração válida
   * ("não toca nada disso"); `undefined` numa ferramenta de escrita é omissão, e omissão é
   * incoerência — não silêncio consentido.
   */
  readonly sensibilidades?: readonly Sensibilidade[];

  /**
   * 18-C · Só para `kind: "escrita"`. O command que EXECUTA, resolvido num mapa fechado
   * fora do laço. Fica aqui como declaração; o descriptor não despacha nada, e nome que não
   * exista no mapa é recusado na execução.
   */
  readonly command?: string;
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
  /**
   * A qualidade do AGREGADO — dos números em `agregados`, sobre o período inteiro. Quem a
   * define é o adapter (invariantes 3 e 12 da Fase 17: sem peso corporal do dia a carga
   * efetiva é indisponível, e agregado incompleto é parcial com o motivo).
   */
  readonly completude: "exato" | "parcial";
  /** O motivo de `completude: "parcial"`. Fala do TOTAL, nunca da lista. */
  readonly motivo_incompleto?: string;
  readonly agregados: Readonly<Record<string, unknown>>;
  readonly itens: readonly unknown[];
  readonly refs: readonly ToolRef[];
  /**
   * ╔════════════════════════════════════════════════════════════════════════════════════╗
   * ║ A LISTA foi encurtada — E SÓ A LISTA. CAMPO SEPARADO DE `completude`, DE PROPÓSITO. ║
   * ║                                                                                     ║
   * ║ Enquanto o corte de lista virava `completude: "parcial"`, o modelo lia "o total está ║
   * ║ incompleto" onde o total estava correto: os agregados são calculados sobre o período ║
   * ║ INTEIRO, antes de qualquer poda. Com o orçamento de caracteres isso ficou frequente  ║
   * ║ (97 de 400 sessões numa medição), e o prompt manda "quando o resultado vier marcado  ║
   * ║ como parcial, diga o que ficou de fora" — ou seja, o modelo passaria a hedgear um    ║
   * ║ número certo.                                                                        ║
   * ║                                                                                     ║
   * ║ Quem preenche é o EXECUTOR (`podarSaida`), nunca o adapter: o teto de lista é do     ║
   * ║ descriptor, e o orçamento é do envelope.                                             ║
   * ╚════════════════════════════════════════════════════════════════════════════════════╝
   */
  readonly itens_truncados?: {
    readonly mostrando: number;
    readonly de: number;
    /** Em pt-BR, nomeando os itens e dizendo POR QUE foram cortados. */
    readonly motivo: string;
  };
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
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A TRAVA SUBIU NA 18-C (§3.1 do design), E O QUE ELA GANHOU É ESPECÍFICO.              ║
 * ║                                                                                       ║
 * ║ Até aqui, "escrita exige confirmação e risco ≥ 2" só dizia, traduzido, que escrita não ║
 * ║ é leitura — nada que o próprio `kind` já não dissesse. As três exigências novas são as ║
 * ║ que de fato recusam um descriptor mal declarado, e recusam ANTES de qualquer execução: ║
 * ║                                                                                       ║
 * ║  • `requiredWritePermission` — sem ela não há chave para o dono ligar, e a ferramenta  ║
 * ║    seria autorizada só pela chave de LEITURA do módulo;                                ║
 * ║  • `sensibilidades` declarada (mesmo vazia) — omissão não vira "não toca nada";        ║
 * ║  • risco ≥ 3 quando toca dinheiro, saúde ou histórico consolidado — é o que impede     ║
 * ║    "lançar transação" de nascer com o mesmo peso de "criar tarefa".                    ║
 * ║                                                                                       ║
 * ║ E `command`: sem ele a proposta não teria o que executar, e o defeito só apareceria    ║
 * ║ depois de o dono confirmar — o pior momento possível para descobrir.                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export function isToolDescriptorCoherent(tool: ToolDescriptor): boolean {
  if (tool.maxRecords < 1) return false;
  // Sem rótulo, a mensagem de poda só saberia dizer "registros" — e a poda de exercícios de
  // um treino viraria "50 de 51 treinos" na leitura do modelo.
  if (tool.itemLabel.trim() === "") return false;

  if (tool.kind === "escrita") {
    if (!tool.requiresConfirmation) return false;
    if (tool.risk < 2) return false;
    if (!tool.requiredWritePermission) return false;
    if (!tool.command || tool.command.trim() === "") return false;
    if (tool.sensibilidades === undefined) return false;
    if (tool.sensibilidades.length > 0 && tool.risk < 3) return false;
    return true;
  }

  // Leitura NÃO declara nenhum dos três: declarar chave de escrita, sensibilidade ou command
  // numa leitura é sinal de que o `kind` está errado — e o `kind` é o que o guard consulta.
  if (tool.requiresConfirmation) return false;
  if (tool.requiredWritePermission !== undefined) return false;
  if (tool.command !== undefined) return false;
  if (tool.sensibilidades !== undefined) return false;
  return true;
}
