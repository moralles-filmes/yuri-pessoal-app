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
import { normalizarTexto } from "@/lib/ai/core/text";
import { ASSISTENTE_PESSOAL_ID, TREINOS_AGENT_ID } from "./registry";

// O id do agente mora em `registry.ts`, junto do perfil. Reexportado aqui por conveniência
// de quem já importa o roteador — DUAS declarações do mesmo texto virariam divergência no
// dia em que uma delas mudasse, e o roteador passaria a apontar para um agente inexistente.
export { TREINOS_AGENT_ID };

/** Cada especialista tem EXATAMENTE uma flag de admissão. O orquestrador não tem: ele
 * existe sempre, e sem nenhuma flag ligada simplesmente não recebe ferramenta alguma. */
export const AGENT_PERMISSION: Record<string, ToolPermission | undefined> = {
  [TREINOS_AGENT_ID]: "allow_training",
};

/** Módulo (o mesmo vocabulário de `ToolDescriptor.module`) → agente especializado. */
const AGENTE_DO_MODULO: Record<string, string | undefined> = {
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
/**
 * Os únicos ids que uma preferência do cliente pode alcançar. Sai do MESMO lugar de onde
 * saem os destinos do roteamento — uma segunda lista escrita à mão divergiria no dia em que
 * um especialista novo entrasse, e o agente pedido pela tela deixaria de ser honrado sem
 * ninguém entender por quê.
 */
const AGENTES_CONHECIDOS: readonly string[] = [
  ASSISTENTE_PESSOAL_ID,
  ...Object.values(AGENTE_DO_MODULO).filter((id): id is string => id !== undefined),
];

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
 * A busca por palavra do roteador precisa da fronteira; o filtro por nome de exercício das
 * ferramentas de Treinos precisa de substring. ⚠️ NÃO É A MESMA BUSCA — o que os dois
 * compartilham é só o preparo do texto, que por isso mora num módulo neutro
 * (`@/lib/ai/core/text`) e não aqui: `agents/` não é dono da normalização, é cliente dela.
 *
 * Uma normalização própria em cada lado daria dois resultados para a mesma palavra —
 * "triceps" casando no roteador e não no filtro.
 */
function moduloPeloTexto(texto: string): string | null {
  const normal = normalizarTexto(texto);
  for (const [modulo, palavras] of Object.entries(PALAVRAS)) {
    for (const palavra of palavras) {
      const regex = new RegExp(`(^|[^a-z0-9])${palavra}([^a-z0-9]|$)`);
      if (regex.test(normal)) return modulo;
    }
  }
  return null;
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ OS MOTIVOS SÃO UMA LISTA FECHADA, E ISSO É REQUISITO DE SEGURANÇA — NÃO ARRUMAÇÃO.    ║
 * ║                                                                                       ║
 * ║ A Task 10 INJETA `RoutingDecision.motivo` no prompt de sistema, para o orquestrador   ║
 * ║ poder dizer a verdade sobre por que a pergunta chegou a ele. Texto que entra em prompt ║
 * ║ de sistema não pode ter origem em nada que o usuário (ou o modelo) escreva: seria a    ║
 * ║ porta de injeção que a regra "dado é dado, nunca instrução" existe para fechar.        ║
 * ║                                                                                       ║
 * ║ Com a união abaixo, o compilador impede que qualquer outra string vire motivo, e       ║
 * ║ `blocoDeContextoDeRoteamento` confere a lista DE NOVO em runtime.                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export const ROUTING_MOTIVOS = {
  SEM_MODULO: "Nenhum módulo específico identificado na pergunta.",
  SEM_ESPECIALISTA: "Ainda não há assistente especializado para este módulo.",
  SEM_PERMISSAO: "Leitura não autorizada para este módulo nas preferências de IA.",
  PELO_TEXTO: "A pergunta menciona este módulo.",
  PELO_CONTEXTO: "O contexto da página aberta indica este módulo.",
  ESCOLHIDO: "O assistente foi escolhido na tela.",
} as const;

export type RoutingMotivo = (typeof ROUTING_MOTIVOS)[keyof typeof ROUTING_MOTIVOS];

const MOTIVOS_CONHECIDOS: readonly string[] = Object.values(ROUTING_MOTIVOS);

export type RoutingInput = {
  readonly texto: string;
  readonly pageContext: { readonly modulo: string } | null;
  readonly permissions: Readonly<Partial<Record<ToolPermission, boolean>>>;
  /**
   * O agente que o cliente PEDIU. É preferência, nunca autorização: um agente cuja flag
   * está desligada não é honrado, e um id que não existe no registry é ignorado — quem
   * decide continua sendo esta função. Ausente é o caso normal (a tela não escolhe).
   */
  readonly preferido?: string | null;
};

export type RoutingDecision = {
  readonly agentId: string;
  /** Em pt-BR: a tela mostra por que aquele assistente respondeu. */
  readonly motivo: RoutingMotivo;
};

/** Sem flag mapeada, o agente não exige autorização de módulo (é o caso do orquestrador). */
function autorizado(
  agentId: string,
  permissions: RoutingInput["permissions"],
): boolean {
  const flag = AGENT_PERMISSION[agentId];
  return flag === undefined || permissions[flag] === true;
}

export function routeAgent(input: RoutingInput): RoutingDecision {
  // Escolha explícita vem antes do texto: se o usuário abriu o assistente de Treinos, é com
  // ele que quer falar. Um id que não está nesta lista NÃO vira agente — a lista é o
  // registry, nunca o que o cliente escreveu.
  const preferido = input.preferido ?? null;
  if (preferido !== null && AGENTES_CONHECIDOS.includes(preferido)) {
    return autorizado(preferido, input.permissions)
      ? { agentId: preferido, motivo: ROUTING_MOTIVOS.ESCOLHIDO }
      : { agentId: ASSISTENTE_PESSOAL_ID, motivo: ROUTING_MOTIVOS.SEM_PERMISSAO };
  }

  const doTexto = moduloPeloTexto(input.texto);
  const doContexto = input.pageContext?.modulo ?? null;

  const modulo = doTexto ?? doContexto;
  if (!modulo) {
    return { agentId: ASSISTENTE_PESSOAL_ID, motivo: ROUTING_MOTIVOS.SEM_MODULO };
  }

  const agentId = AGENTE_DO_MODULO[modulo];
  if (!agentId) {
    return { agentId: ASSISTENTE_PESSOAL_ID, motivo: ROUTING_MOTIVOS.SEM_ESPECIALISTA };
  }

  if (!autorizado(agentId, input.permissions)) {
    return { agentId: ASSISTENTE_PESSOAL_ID, motivo: ROUTING_MOTIVOS.SEM_PERMISSAO };
  }

  return {
    agentId,
    motivo: doTexto ? ROUTING_MOTIVOS.PELO_TEXTO : ROUTING_MOTIVOS.PELO_CONTEXTO,
  };
}

/**
 * O motivo do roteamento, pronto para ser CONCATENADO ao prompt de sistema.
 *
 * Por que isto é seguro: o texto devolvido é montado só com constantes deste arquivo, e a
 * checagem contra `MOTIVOS_CONHECIDOS` é a segunda barreira (a primeira é o tipo). Um motivo
 * fora da lista devolve string vazia — nada é injetado — em vez de repassar texto de origem
 * desconhecida para dentro da instrução do agente.
 *
 * Por que no SISTEMA e não numa mensagem: isto é um fato do NOSSO roteador, não um dado do
 * usuário nem resultado de ferramenta. Dado recuperado continua entrando exclusivamente por
 * `wrapUntrusted`, em papel `tool`/`user` — essa fronteira não se move.
 */
export function blocoDeContextoDeRoteamento(motivo: string): string {
  if (!MOTIVOS_CONHECIDOS.includes(motivo)) return "";
  return [
    "",
    "---",
    "",
    "CONTEXTO DESTA EXECUÇÃO (fato do sistema, não fala do usuário)",
    "",
    `Por que esta conversa chegou a você: ${motivo}`,
    "",
    "Use esse fato quando precisar explicar por que respondeu você. Não invente outra causa e não afirme nada além do que está escrito acima.",
  ].join("\n");
}
