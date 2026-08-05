/**
 * Fase 18-B — IA · Seleção de agente. DETERMINÍSTICA e PURA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE NÃO PEDIR AO MODELO PARA ESCOLHER                                             ║
 * ║                                                                                       ║
 * ║ Uma chamada só para classificar a intenção custaria tokens em TODA mensagem, dobraria ║
 * ║ a latência percebida e não seria testável de forma pura — enquanto a própria fase     ║
 * ║ lista "seleção de agente" entre os testes PUROS.                                       ║
 * ║                                                                                       ║
 * ║ E há uma razão de segurança: se o modelo escolhesse o agente, ele escolheria a         ║
 * ║ allowlist — e a allowlist é justamente o que ele não pode decidir.                     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Precedência: texto explícito > contexto da página > orquestrador. E a flag `allow_*`
 * vence TUDO: sem autorização do usuário, o especialista não existe.
 *
 * Puro. Nenhum I/O, nenhum `Date.now()`.
 */

import type { ToolPermission } from "@/lib/ai/tools/contracts";
import { ASSISTENTE_PESSOAL_ID, TREINOS_AGENT_ID } from "./registry";

// O id do agente mora em `registry.ts`, junto do perfil. Reexportado aqui por conveniência
// de quem já importa o roteador — DUAS declarações do mesmo texto virariam divergência no
// dia em que uma delas mudasse, e o roteador passaria a apontar para um agente inexistente.
export { TREINOS_AGENT_ID };

/** Cada especialista tem EXATAMENTE uma flag de admissão. O orquestrador não tem: ele
 * existe sempre, e sem nenhuma flag ligada simplesmente não recebe ferramenta alguma. */
export const AGENT_PERMISSION: Record<string, ToolPermission> = {
  [TREINOS_AGENT_ID]: "allow_training",
};

/** Módulo (o mesmo vocabulário de `ToolDescriptor.module`) → agente especializado. */
const AGENTE_DO_MODULO: Record<string, string> = {
  training: TREINOS_AGENT_ID,
};

/**
 * Palavras que indicam o módulo. Acentos são removidos na comparação, então escreva sem
 * acento aqui. Radicais curtos ("serie") entram com fronteira de palavra para não casar
 * dentro de outra palavra.
 *
 * `finance` existe aqui SEM ter entrada em `AGENTE_DO_MODULO`: isso é proposital. É o que
 * permite ao texto explícito vencer um contexto de página ambíguo mesmo antes de o
 * especialista Financeiro existir — o texto aponta "finance", `AGENTE_DO_MODULO["finance"]`
 * não existe, e a mensagem cai no orquestrador em vez de ser arrastada para Treinos só
 * porque a página aberta era `/treinos`.
 */
const PALAVRAS: Record<string, readonly string[]> = {
  training: [
    "treino", "treinos", "treinar", "treinei", "malhar", "academia",
    "serie", "series", "repeticao", "repeticoes", "repeticao maxima", "carga", "volume",
    "exercicio", "exercicios", "agachamento", "supino", "levantamento",
    "recorde", "recordes", "1rm", "musculacao", "sessao de treino",
  ],
  finance: [
    "cartao", "cartoes", "fatura", "faturas", "gastei", "gasto", "gastos",
    "financas", "financeiro", "dinheiro", "parcelamento", "parcelas",
    "conta", "contas", "transacao", "transacoes",
  ],
};

/**
 * Tira acento SEM mudar o comprimento, e baixa a caixa.
 *
 * ⚠️ O intervalo dos caracteres combinantes (U+0300–U+036F, diacríticos que o NFD separa
 * da letra-base) é escrito com escape Unicode explícito (`\u0300-\u036f`), nunca com os
 * caracteres combinantes literais: literais correm o risco de chegar corrompidos por
 * cópia/colagem entre editores e encodings, e o bug some no próprio código-fonte sem
 * lançar erro nenhum — a regex só deixa de casar.
 */
function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function moduloPeloTexto(texto: string): string | null {
  const normal = normalizar(texto);
  for (const [modulo, palavras] of Object.entries(PALAVRAS)) {
    for (const palavra of palavras) {
      const regex = new RegExp(`(^|[^a-z0-9])${palavra}([^a-z0-9]|$)`);
      if (regex.test(normal)) return modulo;
    }
  }
  return null;
}

export type RoutingInput = {
  readonly texto: string;
  readonly pageContext: { readonly modulo: string } | null;
  readonly permissions: Readonly<Partial<Record<ToolPermission, boolean>>>;
};

export type RoutingDecision = {
  readonly agentId: string;
  /** Em pt-BR: a tela mostra por que aquele assistente respondeu. */
  readonly motivo: string;
};

export function routeAgent(input: RoutingInput): RoutingDecision {
  const doTexto = moduloPeloTexto(input.texto);
  const doContexto = input.pageContext?.modulo ?? null;

  const modulo = doTexto ?? doContexto;
  if (!modulo) {
    return {
      agentId: ASSISTENTE_PESSOAL_ID,
      motivo: "Nenhum módulo específico identificado na pergunta.",
    };
  }

  const agentId = AGENTE_DO_MODULO[modulo];
  if (!agentId) {
    return {
      agentId: ASSISTENTE_PESSOAL_ID,
      motivo: "Ainda não há assistente especializado para este módulo.",
    };
  }

  const flag = AGENT_PERMISSION[agentId];
  if (input.permissions[flag] !== true) {
    return {
      agentId: ASSISTENTE_PESSOAL_ID,
      motivo: "Leitura não autorizada para este módulo nas preferências de IA.",
    };
  }

  return {
    agentId,
    motivo: doTexto
      ? "A pergunta menciona este módulo."
      : "O contexto da página aberta indica este módulo.",
  };
}
