/**
 * Fase 18-F · Bloco 1 — a exclusão em massa do módulo de IA. PURO, sem I/O.
 *
 * ⛔ NÃO HÁ RETENÇÃO AUTOMÁTICA, e isso é decisão, não omissão. A decisão 5 da 18-D é "nada
 * some sozinho — descartar é clique do dono", e um job que apaga conversa velha seria a
 * exceção que esvazia a regra. O que existe aqui é exclusão em massa PEDIDA.
 *
 * ⛔ E TODA exclusão declara o que PERMANECE. `ai_action_executions` não tem FK para proposta
 * nem para aprovação (invariante 38), justamente para que apagar a conversa não apague o
 * registro de que a IA lançou uma transação. Esconder isso daria uma tela mais limpa e uma
 * auditoria mentirosa.
 */

export const ESCOPOS_DE_EXCLUSAO = [
  "conversas",
  "conversas_antigas",
  "documentos",
  "insights",
] as const;

export type EscopoDeExclusao = (typeof ESCOPOS_DE_EXCLUSAO)[number];

export function ehEscopoDeExclusao(valor: unknown): valor is EscopoDeExclusao {
  return (
    typeof valor === "string" && (ESCOPOS_DE_EXCLUSAO as readonly string[]).includes(valor)
  );
}

const RASTRO_DE_ACOES =
  "O registro das ações que a IA aplicou nos seus módulos — o que foi feito, quando e em qual registro.";

const PERMANECE: Record<EscopoDeExclusao, readonly string[]> = {
  conversas: [RASTRO_DE_ACOES, "As análises geradas, que não dependem da conversa."],
  conversas_antigas: [
    RASTRO_DE_ACOES,
    "As conversas dentro do período que você escolheu manter.",
  ],
  documentos: [
    RASTRO_DE_ACOES,
    "Os lançamentos que já foram criados a partir dos comprovantes.",
  ],
  insights: [
    RASTRO_DE_ACOES,
    "O registro de que a análise automática rodou, e com qual desfecho.",
  ],
};

/** O que sobrevive a cada exclusão. Nunca devolve lista vazia — há sempre o que explicar. */
export function oQuePermanece(escopo: EscopoDeExclusao): readonly string[] {
  return PERMANECE[escopo];
}

/**
 * O que sai JUNTO, por cascade, sem estar no nome do escopo.
 *
 * ⛔ A linha do consumo não é detalhe. `ai_conversations` → `ai_runs` → `ai_usage_events` é
 * `on delete cascade` (conferido nas migrations 20260807100000 e 20260808100000): apagar as
 * conversas apaga a MEDIÇÃO de custo delas, o gasto some de `/ia/consumo` e deixa de contar
 * no teto do mês. Quem clica para arrumar a casa não imagina que está zerando o próprio
 * controle de orçamento — e um aviso depois do fato não serve para nada.
 *
 * Declarar é a única saída deste bloco: mudar a FK exigiria migration, e o Bloco 1 não cria
 * nem altera schema.
 */
const TAMBEM_SAI: Record<EscopoDeExclusao, readonly string[]> = {
  conversas: [
    "As mensagens e a trilha de cada conversa.",
    "A medição de custo delas: o gasto sai de IA · Consumo e deixa de contar no teto do mês.",
    "As propostas que nasceram nessas conversas — o registro do que foi APLICADO permanece.",
  ],
  conversas_antigas: [
    "As mensagens e a trilha das conversas dentro do período.",
    "A medição de custo delas: o gasto sai de IA · Consumo e deixa de contar no teto do mês.",
    "As propostas que nasceram nessas conversas — o registro do que foi APLICADO permanece.",
  ],
  documentos: [
    "O arquivo em si, do armazenamento privado.",
    "A leitura que a IA fez de cada comprovante.",
  ],
  insights: [
    "Os indicadores que sustentavam cada análise.",
    "O que você respondeu a elas (dispensar, adiar).",
  ],
};

/** O que a exclusão leva junto, além do que o nome do escopo diz. Nunca vazia. */
export function oQueTambemSai(escopo: EscopoDeExclusao): readonly string[] {
  return TAMBEM_SAI[escopo];
}

/**
 * Singular, plural e GÊNERO de cada escopo. O gênero não é preciosismo: "comprovante" é
 * masculino e os outros três são femininos, então uma frase montada com concordância fixa
 * escreveria "1 comprovante será apagada" na tela do dono, bem no momento em que ele está
 * confirmando uma exclusão.
 */
const SUBSTANTIVO: Record<EscopoDeExclusao, readonly [string, string, "f" | "m"]> = {
  conversas: ["conversa", "conversas", "f"],
  conversas_antigas: ["conversa", "conversas", "f"],
  documentos: ["comprovante", "comprovantes", "m"],
  insights: ["análise", "análises", "f"],
};

export function resumoDaExclusao(
  escopo: EscopoDeExclusao,
  quantidade: number,
  tempo: "futuro" | "passado" = "futuro",
): string {
  const [um, varios, genero] = SUBSTANTIVO[escopo];
  if (quantidade === 0) {
    return `Nada a apagar: ${genero === "f" ? "nenhuma" : "nenhum"} ${um} neste filtro.`;
  }
  const palavra = quantidade === 1 ? um : varios;
  const particip = genero === "f" ? "apagada" : "apagado";
  const auxiliar =
    tempo === "futuro"
      ? quantidade === 1
        ? "será"
        : "serão"
      : quantidade === 1
        ? "foi"
        : "foram";
  return `${quantidade} ${palavra} ${auxiliar} ${particip}${quantidade === 1 ? "" : "s"}.`;
}
