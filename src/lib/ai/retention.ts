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

export function resumoDaExclusao(escopo: EscopoDeExclusao, quantidade: number): string {
  const [um, varios, genero] = SUBSTANTIVO[escopo];
  if (quantidade === 0) {
    return `Nada a apagar: ${genero === "f" ? "nenhuma" : "nenhum"} ${um} neste filtro.`;
  }
  const palavra = quantidade === 1 ? um : varios;
  const particip = genero === "f" ? "apagada" : "apagado";
  const verbo = quantidade === 1 ? `será ${particip}` : `serão ${particip}s`;
  return `${quantidade} ${palavra} ${verbo}.`;
}
