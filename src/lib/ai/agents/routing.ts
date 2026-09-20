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
// `import type`: some na compilação, então não há ciclo em runtime com `validators/ai`.
import type { RotaComContexto } from "@/lib/validators/ai";
import { normalizarTexto } from "@/lib/ai/core/text";
// Valor, não só tipo: a permissão que cada MÓDULO exige é DERIVADA do registry (ver
// `permissaoDoModulo`). `tools/registry.ts` é camada pura, então não há ciclo nem I/O.
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/registry";
import {
  AGENDA_AGENT_ID,
  ASSISTENTE_PESSOAL_ID,
  DIETA_AGENT_ID,
  ESTUDOS_AGENT_ID,
  FINANCEIRO_AGENT_ID,
  HABITOS_AGENT_ID,
  TAREFAS_AGENT_ID,
  TODO_AGENT_ID,
  TREINOS_AGENT_ID,
} from "./registry";

// O id do agente mora em `registry.ts`, junto do perfil. Reexportado aqui por conveniência
// de quem já importa o roteador — DUAS declarações do mesmo texto virariam divergência no
// dia em que uma delas mudasse, e o roteador passaria a apontar para um agente inexistente.
export {
  TREINOS_AGENT_ID,
  TODO_AGENT_ID,
  HABITOS_AGENT_ID,
  ESTUDOS_AGENT_ID,
  AGENDA_AGENT_ID,
  TAREFAS_AGENT_ID,
  FINANCEIRO_AGENT_ID,
  DIETA_AGENT_ID,
};

/** Cada especialista tem EXATAMENTE uma flag de admissão. O orquestrador não tem: ele
 * existe sempre, e sem nenhuma flag ligada simplesmente não recebe ferramenta alguma. */
export const AGENT_PERMISSION: Record<string, ToolPermission | undefined> = {
  [TREINOS_AGENT_ID]: "allow_training",
  [TODO_AGENT_ID]: "allow_todo",
  [HABITOS_AGENT_ID]: "allow_habits",
  [ESTUDOS_AGENT_ID]: "allow_studies",
  [AGENDA_AGENT_ID]: "allow_calendar",
  [TAREFAS_AGENT_ID]: "allow_tasks",
  [FINANCEIRO_AGENT_ID]: "allow_finance",
  [DIETA_AGENT_ID]: "allow_nutrition",
};

/**
 * Módulo (o mesmo vocabulário de `ToolDescriptor.module`) → agente especializado.
 *
 * ⚠️ `body` é o caso que quebra a simetria "1 módulo = 1 agente = 1 flag": ele é MÓDULO
 * CENTRAL, sem tela e sem agente próprios, e o mesmo dado aparece em Dieta e em Treinos.
 * O destino é o agente de Treinos (que já consome peso corporal desde a 17-E), mas a
 * permissão exigida continua sendo `allow_body` — ver `permissaoDoModulo`.
 */
const AGENTE_DO_MODULO: Record<string, string | undefined> = {
  training: TREINOS_AGENT_ID,
  todo: TODO_AGENT_ID,
  habits: HABITOS_AGENT_ID,
  studies: ESTUDOS_AGENT_ID,
  calendar: AGENDA_AGENT_ID,
  tasks: TAREFAS_AGENT_ID,
  finance: FINANCEIRO_AGENT_ID,
  nutrition: DIETA_AGENT_ID,
  /**
   * ⚠️ `body` aponta para TREINOS, e não para Dieta, embora os dois agentes tenham as
   * ferramentas. A escolha é arbitrária por natureza — o dado é o mesmo e a permissão
   * exigida (`allow_body`) também. Treinos ficou porque é quem consome peso corporal como
   * insumo (o peso da sessão, desde a 17-E), então é o destino em que a conversa tende a
   * continuar. Quem estiver na tela de medidas cai aqui pelo contexto de qualquer forma.
   */
  body: TREINOS_AGENT_ID,
};

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A PERMISSÃO É DO MÓDULO PEDIDO, NÃO DO AGENTE QUE ATENDE — e é DERIVADA do registry.  ║
 * ║                                                                                       ║
 * ║ Enquanto cada agente servia um módulo só, `AGENT_PERMISSION` bastava. `body` desfaz    ║
 * ║ isso: quem atende é o agente de Treinos, mas exigir `allow_training` de quem pergunta  ║
 * ║ o próprio peso recusaria a leitura de alguém que ligou `allow_body` e só ela — e o     ║
 * ║ inverso deixaria a pergunta cair no orquestrador, que não tem ferramenta nenhuma.      ║
 * ║                                                                                       ║
 * ║ Derivar do registry em vez de escrever uma segunda tabela é o que impede as duas de    ║
 * ║ divergirem: a permissão que o roteador exige é, por construção, a MESMA que o guard    ║
 * ║ vai exigir da ferramenta depois.                                                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export function permissaoDoModulo(modulo: string): ToolPermission | null {
  return AI_TOOL_REGISTRY.find((t) => t.module === modulo)?.requiredPermission ?? null;
}

/**
 * 18-F Bloco 3 — o inverso de `AGENTE_DO_MODULO`, DERIVADO dele.
 *
 * Responde "que módulo este agente serve", que é o que a seção de memória precisa saber para
 * decidir qual preferência amarrada a módulo pode entrar nesta conversa.
 *
 * ⚠️ `body` e `training` apontam para o MESMO agente, então o inverso não é função: a primeira
 * entrada vence, e é `training`. Está certo para o uso que tem — uma preferência de medida
 * corporal amarrada ao agente de Treinos seria arbitrária nos dois sentidos, e quem quiser que
 * ela valha sempre deixa o módulo em branco.
 */
export function moduloDoAgente(agentId: string): string | null {
  return Object.entries(AGENTE_DO_MODULO).find(([, id]) => id === agentId)?.[0] ?? null;
}

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
  todo: [
    "tarefa", "tarefas", "todo", "to-do", "afazer", "afazeres",
    "pendencia", "pendencias", "checklist", "projeto", "projetos",
    "etiqueta", "etiquetas", "subtarefa", "subtarefas", "caixa de entrada",
  ],
  habits: [
    "habito", "habitos", "sequencia", "sequencias", "streak",
    "agua", "consistencia", "check-in", "checkin",
  ],
  studies: [
    "estudo", "estudos", "estudar", "estudei", "curso", "cursos",
    "aula", "aulas", "licao", "licoes", "materia", "materias",
    "vocabulario", "idioma", "idiomas",
  ],
  calendar: [
    "agenda", "compromisso", "compromissos", "evento", "eventos",
    "reuniao", "reunioes", "calendario", "agendado", "marcado",
    "consulta medica", "aniversario",
  ],
  /**
   * ⚠️ "tarefa" e "tarefas" NÃO ESTÃO AQUI, e a ausência é decisão de produto.
   *
   * Elas pertencem ao vocabulário de `todo`, que é o gerenciador PRINCIPAL de execução do
   * sistema (CLAUDE.md). Repeti-las aqui faria toda pergunta sobre tarefa empatar 1 a 1 e
   * cair no orquestrador — trocando um roteamento certo na maioria dos casos por nenhum
   * roteamento em todos. O módulo da Fase 09 é alcançado pelo que ele tem de exclusivo (as
   * rotinas com check-in), pelo contexto da página `/tarefas`, ou pela escolha na tela; e o
   * prompt do TO-DO manda lembrar que o outro módulo existe quando a busca não achar.
   */
  tasks: [
    "rotina", "rotinas", "check-in", "checkin diario", "tarefas antigas",
    "modulo antigo de tarefas",
  ],
  /**
   * ⚠️ "peso" sozinho NÃO entra: ele é ambíguo com a carga do treino ("qual peso eu fiz no
   * supino"), e um empate em toda pergunta de treino seria pior que não rotear. As entradas
   * são as formas que só significam corpo.
   */
  body: [
    "peso corporal", "meu peso", "pesei", "emagreci", "engordei",
    "medida corporal", "medidas corporais", "cintura", "quadril",
    "circunferencia", "gordura corporal", "massa magra",
  ],
  /**
   * ⚠️ "meta" e "metas" NÃO entram aqui: elas existem em Dieta, Treinos e TO-DO, e um empate
   * em toda pergunta sobre meta jogaria tudo no orquestrador. O mesmo vale para "caloria",
   * que é do domínio de Dieta mas também aparece em Treinos (gasto calórico do exercício) —
   * lá ela é uma unidade de medição, aqui é o assunto, e as palavras específicas de comida
   * resolvem sem ambiguidade.
   */
  nutrition: [
    "dieta", "alimentacao", "comi", "comer", "refeicao", "refeicoes",
    "almoco", "jantar", "cafe da manha", "lanche",
    // ⚠️ "gordura" SOZINHA ficaria de fora de propósito: ela casaria dentro de "gordura
    // corporal", que é de `body`, e toda pergunta sobre composição corporal viraria empate.
    // "lipidios" e "gorduras" (plural) não têm essa sobreposição.
    "caloria", "calorias", "proteina", "carboidrato", "lipidios", "gorduras",
    "macros", "nutricao", "diario alimentar", "receita", "receitas",
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
function casamentosPorModulo(texto: string): Map<string, number> {
  const normal = normalizarTexto(texto);
  const contagem = new Map<string, number>();
  for (const [modulo, palavras] of Object.entries(PALAVRAS)) {
    let n = 0;
    for (const palavra of palavras) {
      const regex = new RegExp(`(^|[^a-z0-9])${palavra}([^a-z0-9]|$)`);
      if (regex.test(normal)) n += 1;
    }
    if (n > 0) contagem.set(modulo, n);
  }
  return contagem;
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O DESEMPATE É EXPLÍCITO — E ISSO É CORREÇÃO DE DEFEITO, NÃO ARRUMAÇÃO.                ║
 * ║                                                                                       ║
 * ║ A versão da 18-B devolvia O PRIMEIRO módulo que casasse, na ORDEM DE DECLARAÇÃO do     ║
 * ║ objeto `PALAVRAS`. Com dois vocabulários ninguém percebe; com nove, a ordem em que     ║
 * ║ alguém escreveu as chaves vira o critério de roteamento — e há colisão real e          ║
 * ║ frequente: "conta" (banco), "meta" (dieta/treino/todo), "serie" (treino/todo           ║
 * ║ recorrente), "aula" (estudos/agenda), "projeto" (TO-DO/Tarefas).                        ║
 * ║                                                                                       ║
 * ║ Agora vence quem tiver MAIS palavras distintas casadas. Empate no topo NÃO escolhe o   ║
 * ║ primeiro: devolve ambiguidade, e quem decide o que fazer com ela é `routeAgent`.       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export type ModuloPeloTexto =
  | { readonly tipo: "nenhum" }
  | { readonly tipo: "modulo"; readonly modulo: string }
  | { readonly tipo: "ambiguo"; readonly modulos: readonly string[] };

export function moduloPeloTexto(texto: string): ModuloPeloTexto {
  const contagem = casamentosPorModulo(texto);
  if (contagem.size === 0) return { tipo: "nenhum" };

  const maior = Math.max(...contagem.values());
  // Ordenado para o resultado ser estável entre execuções — a lista aparece em mensagem.
  const empatados = [...contagem.entries()]
    .filter(([, n]) => n === maior)
    .map(([modulo]) => modulo)
    .sort();

  if (empatados.length === 1) return { tipo: "modulo", modulo: empatados[0] };
  return { tipo: "ambiguo", modulos: empatados };
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
  /**
   * ⚠️ Motivo NOVO na 18-C. Existe porque a alternativa era escolher o primeiro módulo da
   * ordem de declaração — o que, com nove vocabulários, é sortear. Cair no orquestrador com
   * a ambiguidade declarada deixa o assistente PERGUNTAR de qual módulo se trata, em vez de
   * responder com confiança sobre o módulo errado.
   */
  AMBIGUO: "A pergunta menciona mais de um módulo, e nenhum deles se destacou.",
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

/**
 * Sem flag mapeada, o agente não exige autorização de módulo (é o caso do orquestrador).
 *
 * `modulo` é opcional porque o caminho da ESCOLHA EXPLÍCITA na tela não tem módulo: ali o
 * usuário pediu o agente, não o assunto, e a flag que vale é a do agente. Quando o módulo é
 * conhecido, ele manda — ver `permissaoDoModulo`.
 */
function autorizado(
  agentId: string,
  permissions: RoutingInput["permissions"],
  modulo?: string,
): boolean {
  const flag =
    (modulo ? permissaoDoModulo(modulo) : null) ?? AGENT_PERMISSION[agentId];
  return flag === undefined || flag === null || permissions[flag] === true;
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

  let modulo: string | null;
  let porTexto: boolean;

  if (doTexto.tipo === "modulo") {
    modulo = doTexto.modulo;
    porTexto = true;
  } else if (doTexto.tipo === "ambiguo") {
    /**
     * A PÁGINA ABERTA desempata — e só ela. É um fato do nosso sistema (a rota vem de uma
     * lista estática validada no servidor), não texto do usuário, então usá-la aqui não abre
     * caminho para ninguém escolher a allowlist. Mas ela só vale se for UM DOS EMPATADOS:
     * usar a página para eleger um módulo que a pergunta nem mencionou seria trocar um chute
     * por outro.
     */
    if (doContexto !== null && doTexto.modulos.includes(doContexto)) {
      modulo = doContexto;
      porTexto = false;
    } else {
      return { agentId: ASSISTENTE_PESSOAL_ID, motivo: ROUTING_MOTIVOS.AMBIGUO };
    }
  } else {
    modulo = doContexto;
    porTexto = false;
  }

  if (!modulo) {
    return { agentId: ASSISTENTE_PESSOAL_ID, motivo: ROUTING_MOTIVOS.SEM_MODULO };
  }

  const agentId = AGENTE_DO_MODULO[modulo];
  if (!agentId) {
    return { agentId: ASSISTENTE_PESSOAL_ID, motivo: ROUTING_MOTIVOS.SEM_ESPECIALISTA };
  }

  if (!autorizado(agentId, input.permissions, modulo)) {
    return { agentId: ASSISTENTE_PESSOAL_ID, motivo: ROUTING_MOTIVOS.SEM_PERMISSAO };
  }

  return {
    agentId,
    motivo: porTexto ? ROUTING_MOTIVOS.PELO_TEXTO : ROUTING_MOTIVOS.PELO_CONTEXTO,
  };
}

/**
 * A descrição de cada página que pode virar contexto — o que o agente lê no lugar do
 * caminho cru.
 *
 * ⚠️ `satisfies Record<RotaComContexto, string>` é o que impede as duas listas de divergirem:
 * uma rota nova em `ROTAS_COM_CONTEXTO` sem entrada aqui é erro de compilação, não uma rota
 * que chega ao roteador e some antes do prompt.
 *
 * ⛔ E é uma ALLOWLIST, não um formatador. O que entra no prompt é o texto escrito aqui,
 * escolhido por igualdade exata da chave; a rota que veio do pedido nunca é interpolada.
 * Mesma disciplina de `MOTIVOS_CONHECIDOS` — e a razão é a mesma: o bloco vai em papel de
 * SISTEMA, onde nada de origem externa pode entrar.
 */
const DESCRICAO_DA_PAGINA = {
  "/treinos": "a visão geral de Treinos",
  "/treinos/historico": "o histórico de sessões de Treinos",
  "/treinos/recordes": "os recordes de Treinos",
  "/todo": "a tela do TO-DO",
  "/habitos": "a tela de Hábitos",
  "/estudos": "a tela de Estudos",
  "/agenda": "a tela da Agenda",
  "/tarefas": "a tela de Tarefas (o módulo da Fase 09, que não é o TO-DO)",
  "/rotinas": "a tela de Rotinas",
  "/nutricao/medidas": "a tela de medidas corporais",
  "/financeiro": "a tela de Finanças",
  "/faturas": "a tela de faturas de cartão",
  "/nutricao": "a visão geral de Dieta e Alimentação",
  "/nutricao/diario": "o diário alimentar",
} as const satisfies Record<RotaComContexto, string>;

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
 *
 * `rota` é opcional e diz QUAL PÁGINA o usuário estava vendo. Ela existe para inclinar a
 * escolha da ferramenta (quem está nos recordes provavelmente pergunta sobre recordes) e
 * para NADA ALÉM DISSO: a última linha do bloco proíbe explicitamente concluir qualquer
 * coisa sobre os registros a partir da página, porque a página é uma tela aberta, não um
 * dado. Sem essa linha, "ele está nos recordes" viraria "ele tem recordes" — que é
 * exatamente a invenção que a trava de honestidade existe para impedir.
 */
export function blocoDeContextoDeRoteamento(motivo: string, rota?: string | null): string {
  if (!MOTIVOS_CONHECIDOS.includes(motivo)) return "";

  const pagina = Object.hasOwn(DESCRICAO_DA_PAGINA, rota ?? "")
    ? DESCRICAO_DA_PAGINA[rota as RotaComContexto]
    : null;

  return [
    "",
    "---",
    "",
    "CONTEXTO DESTA EXECUÇÃO (fato do sistema, não fala do usuário)",
    "",
    `Por que esta conversa chegou a você: ${motivo}`,
    ...(pagina
      ? [
          "",
          `A tela que o usuário tinha aberto ao perguntar: ${pagina}.`,
          "",
          "Isso indica o assunto que ele provavelmente quer — use para escolher por onde começar a consultar. Não é um dado sobre os registros dele: a tela estar aberta não diz que existe registro ali, nem quanto, nem quando. Só o que as ferramentas devolverem diz isso.",
        ]
      : []),
    "",
    "Use esse fato quando precisar explicar por que respondeu você. Não invente outra causa e não afirme nada além do que está escrito acima.",
  ].join("\n");
}
