/**
 * Fase 18-A — IA · Constantes de navegação e apresentação do módulo.
 *
 * Puro. Importável por componente client — não há nada de servidor aqui.
 */

// `import type` de um módulo PURO (`approval/state.ts` não tem `server-only`): apagado na
// compilação, então nada de servidor entra no bundle do cliente por causa desta linha.
import type { EstadoDaProposta } from "@/lib/ai/approval/state";
import type {
  ToolCallStatus,
  ToolPermission,
  ToolWritePermission,
} from "@/lib/ai/tools/contracts";

export type AiSection = {
  readonly slug: string;
  readonly title: string;
  readonly href: string;
  readonly icon: string;
  readonly description: string;
};

/** Os 4 submódulos da 18-A. Os demais chegam nas subfases seguintes. */
export const AI_SECTIONS: readonly AiSection[] = [
  {
    slug: "chat",
    title: "Conversar",
    href: "/ia",
    icon: "message-square",
    description: "Converse com o Assistente Pessoal.",
  },
  {
    slug: "conversas",
    title: "Conversas",
    href: "/ia/conversas",
    icon: "messages-square",
    description: "Histórico das suas conversas.",
  },
  /**
   * 18-C · Bloco 5. Entra ANTES de "Consumo" de propósito: o que a IA fez com os dados do
   * dono importa mais que quanto ela custou, e a ordem da navegação é uma afirmação sobre isso.
   */
  {
    slug: "acoes",
    title: "Ações",
    href: "/ia/acoes",
    icon: "history",
    description: "O que a IA preparou, o que você decidiu e o que foi aplicado.",
  },
  /**
   * 18-D · Bloco 5 — o 6º item. Entra ao lado de "Ações", e não perto de "Configurações",
   * porque é uma tela de TRABALHO: o dono envia, revisa e decide aqui. A ordem da navegação
   * é uma afirmação sobre o que importa — o que a IA faz com os dados dele vem primeiro.
   */
  {
    slug: "comprovantes",
    title: "Comprovantes",
    href: "/ia/comprovantes",
    icon: "receipt",
    description: "Envie uma nota ou comprovante, revise a leitura e decida o lançamento.",
  },
  /**
   * 18-E — o 7º item. Entra ENTRE Comprovantes e Consumo, pela mesma razão que pôs Ações
   * antes de Consumo: o que a IA faz com os dados do dono vem antes de quanto ela custou.
   *
   * ⛔ E ela é a ÚNICA porta de GERAÇÃO. O card do dashboard só exibe — não há botão de
   * gerar lá, e há teste de import provando que o dashboard não alcança o runner.
   */
  {
    slug: "insights",
    title: "Insights",
    href: "/ia/insights",
    icon: "lightbulb",
    description: "Análises sobre números que o sistema já mediu. Geradas quando você pede.",
  },
  {
    slug: "consumo",
    title: "Consumo",
    href: "/ia/consumo",
    icon: "gauge",
    description: "Custo estimado, orçamento e execuções.",
  },
  {
    slug: "configuracoes",
    title: "Configurações",
    href: "/ia/configuracoes",
    icon: "settings",
    description: "Provedores, modelos, orçamento e preferências.",
  },
];

/**
 * Formatação do custo em USD.
 *
 * ⚠️ Seis casas de propósito: uma resposta curta custa US$ 0,0086, e arredondar para dois
 * decimais mostraria "US$ 0,01" — ou pior, "US$ 0,00", que o usuário leria como grátis.
 * Arredondar só na apresentação, com a precisão que o número merece.
 */
export function formatUsd(valor: number): string {
  return `US$ ${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: valor >= 1 ? 2 : 6,
    maximumFractionDigits: 6,
  })}`;
}

/** Custo indisponível NUNCA vira "US$ 0,00". */
export function formatUsdOrUnavailable(valor: number | null): string {
  return valor === null ? "custo não informado" : formatUsd(valor);
}

/** O aviso de moeda, escrito uma vez e reusado — a tela nunca deixa isso implícito. */
export const AVISO_MOEDA =
  "Valores em dólar (USD) e estimados pelo sistema a partir das tarifas publicadas pelos provedores. Não é a cobrança oficial deles, e não há conversão para reais.";

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A LISTA DE ROTAS É ESTÁTICA: UMA ROTA QUE NÃO ESTÁ AQUI NÃO EXISTE PARA A IA.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⛔ **A PÁGINA NÃO MANDA CONTEÚDO.** Nem HTML, nem título, nem estado, nem texto de
 * registro. O único campo que atravessa o transporte é `rota`, e ele é um valor desta lista
 * fechada — não é texto do usuário (invariante 21 da 18-B). Quem valida a entrada continua
 * sendo `pageContextSchema`, em `@/lib/validators/ai`, que consome esta lista.
 *
 * ⚠️ **Ela mora AQUI, e não junto do schema, por uma razão medida:** `chat-client.tsx` precisa
 * da lista para montar o seletor de contexto, e importá-la de `@/lib/validators/ai` arrastava
 * o `zod` inteiro — 62,7 KB gz — para o primeiro byte das três rotas de `/ia`. Este arquivo é
 * puro e não tem um único import de runtime; aquele importa `zod` na primeira linha. A lista é
 * dado, não validação, e é dado que as duas pontas leem.
 */
export const ROTAS_COM_CONTEXTO = [
  "/treinos",
  "/treinos/historico",
  "/treinos/recordes",
  // 18-C · Lote 1. Cada uma destas é a tela ÚNICA do seu módulo — não há rota por registro
  // aqui, pela mesma razão registrada no schema.
  "/todo",
  "/habitos",
  "/estudos",
  // 18-C · Lote 2
  "/agenda",
  "/tarefas",
  "/rotinas",
  // ⚠️ `/nutricao/medidas` mapeia para o módulo `body`, não para `nutrition`: a tela mora
  // dentro de Dieta, mas o dado é do módulo central `body_*` e a permissão é `allow_body`.
  "/nutricao/medidas",
  // 18-C · Lote 3
  "/financeiro",
  "/faturas",
  "/nutricao",
  "/nutricao/diario",
] as const;

export type RotaComContexto = (typeof ROTAS_COM_CONTEXTO)[number];

/** Mesmo vocabulário de `ToolDescriptor.module` — quem entra aqui tem ferramenta lá. */
export const MODULOS_COM_CONTEXTO = [
  "training",
  "todo",
  "habits",
  "studies",
  "calendar",
  "tasks",
  "body",
  "finance",
  "nutrition",
] as const;

export type ModuloComContexto = (typeof MODULOS_COM_CONTEXTO)[number];

/**
 * Limite do texto da mensagem no ROUTE HANDLER. O banco tem um backstop de 32.000 — maior
 * de propósito, porque ele protege o caminho que não passa por aqui (RPC direto).
 *
 * Aqui e não no schema pela mesma razão da lista acima: o contador de caracteres do chat o
 * lê no cliente.
 */
export const MAX_CHAT_TEXT = 16_000;

/**
 * Limite da observação que o dono escreve ao enviar um comprovante, 18-D ("foi no PIX",
 * "metade é do João").
 *
 * ⛔ **É DADO, NUNCA INSTRUÇÃO.** Entra na extração dentro do mesmo bloco `wrapUntrusted`
 * que o conteúdo do arquivo — texto de humano não vira mensagem de sistema só porque foi
 * digitado num campo nosso. O limite curto é parte disso: 500 caracteres não comportam um
 * prompt, e cortam a superfície sem atrapalhar o uso real.
 *
 * Quem o aplica é `observacaoDocumentoSchema`, em `@/lib/validators/ai`; o contador da tela
 * o lê daqui.
 */
export const MAX_OBSERVACAO_DOCUMENTO = 500;

/**
 * Fase 18-B — o rótulo de cada rota que pode virar contexto da conversa.
 *
 * `satisfies Record<RotaComContexto, string>` obriga a cadastrar o rótulo no MESMO commit
 * em que uma rota entra na lista estática — senão a tela mostraria um caminho cru, ou pior,
 * `undefined`. Aqui mora só a apresentação.
 */
export const ROTULO_DA_ROTA_DE_CONTEXTO = {
  "/treinos": "Treinos · visão geral",
  "/treinos/historico": "Treinos · histórico",
  "/treinos/recordes": "Treinos · recordes",
  "/todo": "TO-DO",
  "/habitos": "Hábitos",
  "/estudos": "Estudos",
  "/agenda": "Agenda",
  "/tarefas": "Tarefas",
  "/rotinas": "Rotinas",
  "/nutricao/medidas": "Medidas corporais",
  "/financeiro": "Financeiro",
  "/faturas": "Faturas",
  "/nutricao": "Dieta e Alimentação",
  "/nutricao/diario": "Diário alimentar",
} as const satisfies Record<RotaComContexto, string>;

/**
 * O aviso do que o assistente NÃO faz. Honestidade é critério de aceite, não gentileza.
 *
 * ⚠️ **Reescrito na 18-B, e pelo mesmo motivo que o prompt-base virou `seguranca-v2`.** O
 * texto da 18-A dizia que o assistente "não vê treinos". Isso era verdade enquanto o Tool
 * Registry estava vazio; deixou de ser quando as três leituras de Treinos entraram nele.
 * Um aviso de honestidade que mente é pior que nenhum.
 *
 * O texto de agora é verdadeiro nos DOIS estados — com as flags desligadas (o padrão do
 * banco) e ligadas — porque afirma a regra, não o estado: nada é lido sem autorização
 * explícita por módulo, e não existe escrita.
 *
 * ⚠️ **Atualizado na 18-C** (Lote 1: TO-DO, Hábitos e Estudos entraram).
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A LISTA DE MÓDULOS FICA, E QUEM A MANTÉM VIVA É UM TESTE — NÃO A BOA MEMÓRIA DE       ║
 * ║ QUEM EDITAR ISTO DEPOIS.                                                               ║
 * ║                                                                                       ║
 * ║ A tentação, ao ver este texto envelhecer pela segunda vez, é tirar os nomes e deixar  ║
 * ║ só a regra ("o que você autorizar"). Seria pior: o usuário lê este aviso ANTES da     ║
 * ║ primeira mensagem, e "os módulos que você autorizar" não responde a pergunta que ele  ║
 * ║ tem, que é *quais existem*. O que impede o texto de mentir é                           ║
 * ║ `constants.test.ts` → "todo módulo com ferramenta publicada é NOMEADO no aviso",      ║
 * ║ derivado de `toolsForPermission` sobre o registry real: publicar ferramenta de um     ║
 * ║ módulo novo **deixa a suíte vermelha** até este texto citá-lo.                         ║
 * ║                                                                                       ║
 * ║ ⚠️ A frase de "ainda não lê X" SUMIU no Lote 3, como estava previsto: com os nove      ║
 * ║ módulos publicados, não sobrou nada para enumerar do lado de fora. A parte que o teste ║
 * ║ não sabe verificar deixou de existir, e o que ficou é só o que ele cobre.              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
/**
 * ⚠️ **TERCEIRA REESCRITA — 18-C · Bloco 4, e a mais grave das três.**
 *
 * O texto terminava com "e não cria nem altera nada". Deixou de ser verdade no commit que
 * ligou o primeiro command: a IA passou a PREPARAR alterações no TO-DO. O aviso que mais
 * tranquilizava era o que estava mentindo, e ele fica logo acima do campo de digitar.
 *
 * O que ficou no lugar é verificável: `constants.test.ts` deriva do registry quais módulos
 * têm ferramenta de ESCRITA e exige que a frase "não cria nem altera" tenha sumido enquanto
 * existir uma. Publicar a primeira escrita de outro módulo deixa a suíte vermelha até este
 * texto contá-lo.
 */
/**
 * ⚠️ **QUARTA REESCRITA — 18-C · Bloco 5.** A terceira dizia que a chave de escrita "hoje
 * existe só para o TO-DO", e isso durou um commit: o Bloco 4 entregou os cinco módulos de uma
 * vez. O teste que existia só cobria a parte de LEITURA da frase, e a metade nova envelheceu
 * livre — a mesma armadilha, na mesma linha, pela terceira vez.
 *
 * Agora a enumeração da ESCRITA também é derivada do registry por `constants.test.ts`
 * (`toolsForWritePermission` + `Intl.ListFormat` em pt-BR): publicar a primeira escrita de
 * outro módulo, ou remover a última de um, deixa a suíte vermelha até este texto acompanhar.
 */
export const AVISO_SEM_ACESSO =
  "O assistente só consulta o que você autorizar, módulo a módulo, e toda autorização nasce desligada. Ele pode ler Financeiro, Dieta e Alimentação, Treinos, Medidas corporais, TO-DO, Agenda, Tarefas e Rotinas, Hábitos e Estudos — cada um com a sua chave. Para ALTERAR algo ele precisa de uma segunda chave, e há chave de alteração para TO-DO, Hábitos, Agenda, Dieta e Alimentação e Financeiro: ele prepara a alteração, mostra exatamente o que vai mudar, e nada acontece até você confirmar na tela.";

/**
 * A versão curta da mesma regra, para a descrição da página. Afirma a REGRA, nunca o estado:
 * continua verdadeira com `allow_training` ligada ou desligada. O texto da 18-A ("sem acesso
 * aos seus registros nesta versão") virou mentira no instante em que as leituras de Treinos
 * entraram no registry.
 */
export const RESUMO_DO_ASSISTENTE =
  "Assistente Pessoal. Ele só consulta os módulos que você autorizar nas preferências, e nunca altera nada sem você confirmar a alteração na tela.";

// ─────────────────── Fase 18-B · Preferências de leitura por módulo ───────────────────

/**
 * O que cada flag `allow_*` autoriza, em pt-BR.
 *
 * `satisfies Record<ToolPermission, …>` obriga a cadastrar o texto no MESMO commit em que
 * uma permissão nova entra em `TOOL_PERMISSIONS` — uma chave sem rótulo apareceria na tela
 * como `allow_algo`, que é pior do que não aparecer.
 *
 * ⚠️ `frase` diz o que a IA PASSA A PODER LER, no indicativo, sem promessa: quem decide se
 * há de fato ferramenta é o registry (`toolsForPermission`), e a tela mostra a lista real.
 */
export const ROTULO_DA_PERMISSAO = {
  allow_finance: {
    titulo: "Financeiro",
    frase: "Ler contas, transações, cartões e faturas.",
  },
  allow_nutrition: {
    titulo: "Dieta e Alimentação",
    frase: "Ler diário alimentar, metas nutricionais, receitas e planejamento.",
  },
  allow_training: {
    titulo: "Treinos",
    frase: "Ler sessões de treino, totais do período e recordes.",
  },
  allow_body: {
    titulo: "Medidas corporais",
    frase: "Ler peso e medidas registradas (a base compartilhada por Dieta e Treinos).",
  },
  allow_todo: {
    titulo: "TO-DO",
    frase: "Ler tarefas, projetos e conclusões do TO-DO.",
  },
  allow_calendar: {
    titulo: "Agenda",
    frase: "Ler eventos e compromissos da agenda.",
  },
  allow_tasks: {
    titulo: "Tarefas e Rotinas",
    frase: "Ler as tarefas legadas e as rotinas com check-in diário.",
  },
  allow_habits: {
    titulo: "Hábitos",
    frase: "Ler hábitos, registros diários e sequências.",
  },
  allow_studies: {
    titulo: "Estudos",
    frase: "Ler cursos, aulas e progresso de estudo.",
  },
} as const satisfies Record<ToolPermission, { titulo: string; frase: string }>;

/**
 * 18-C · Bloco 4 — o que cada chave `allow_write_*` autoriza.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ A FRASE PRECISA DIZER AS DUAS COISAS: o que a IA passa a poder PREPARAR, e que nada    ║
 * ║ é aplicado sem confirmação. Só a primeira metade assustaria com razão; só a segunda    ║
 * ║ esconderia o que a chave faz.                                                          ║
 * ║                                                                                       ║
 * ║ E `aviso` existe porque uma chave sem ferramenta é um botão que não liga nada — o      ║
 * ║ mesmo defeito que `toolsForPermission` (invariante 24) evita do lado da leitura. Quem  ║
 * ║ decide se a chave está clicável é o REGISTRY (`toolsForWritePermission`), nunca uma    ║
 * ║ lista escrita à mão de "módulos prontos".                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export const ROTULO_DA_PERMISSAO_DE_ESCRITA = {
  allow_write_todo: {
    titulo: "TO-DO",
    frase: "Preparar tarefas novas e mudanças de data no TO-DO, para você confirmar na tela.",
  },
  allow_write_habits: {
    titulo: "Hábitos",
    frase: "Preparar check-ins de hábito, para você confirmar na tela.",
  },
  allow_write_calendar: {
    titulo: "Agenda",
    frase: "Preparar compromissos novos na agenda, para você confirmar na tela.",
  },
  allow_write_nutrition: {
    titulo: "Dieta e Alimentação",
    frase: "Preparar registros no diário alimentar, para você confirmar na tela.",
  },
  allow_write_finance: {
    titulo: "Financeiro",
    frase: "Preparar lançamentos de transação, para você confirmar na tela.",
  },
} as const satisfies Record<ToolWritePermission, { titulo: string; frase: string }>;

/**
 * A frase que acompanha TODA chave de escrita na tela de preferências, escrita uma vez.
 *
 * Ela não é decoração: é o resumo do desenho inteiro da subfase, no lugar em que a pessoa
 * decide ligar a chave. Sem ela, "autorizar a IA a alterar o TO-DO" soa como autorizar a IA a
 * alterar o TO-DO sozinha.
 */
export const AVISO_DA_ESCRITA =
  "Ligar uma destas chaves não dá à IA o poder de alterar nada sozinha. Ela passa a poder PREPARAR uma alteração e mostrá-la a você, campo a campo; a alteração só acontece quando você confirma, uma de cada vez, e o pedido expira em 10 minutos.";

/**
 * O nome de cada ferramenta na tela. `Record<string, …>` porque `ToolDescriptor.name` é
 * `string` — não há união fechada para o `satisfies` travar. A cobertura é garantida por
 * TESTE, sobre o registry real: ferramenta nova sem rótulo quebra a suíte.
 */
export const ROTULO_DA_FERRAMENTA: Record<string, string> = {
  "training.get_last_workout": "Treinos · último treino",
  "training.get_volume": "Treinos · totais do período",
  "training.get_records": "Treinos · recordes",
  // 18-C · Lote 1
  "todo.get_agenda": "TO-DO · agenda de tarefas",
  "todo.search_tasks": "TO-DO · busca de tarefas",
  "todo.get_projects": "TO-DO · projetos",
  "habits.get_today": "Hábitos · situação de hoje",
  "habits.get_streaks": "Hábitos · sequências e consistência",
  "studies.get_courses": "Estudos · cursos",
  "studies.get_study_time": "Estudos · tempo de estudo",
  // 18-C · Lote 2
  "calendar.get_upcoming": "Agenda · próximos compromissos",
  "calendar.get_day": "Agenda · compromissos do dia",
  "tasks.get_pending": "Tarefas · pendentes",
  "tasks.get_routines_today": "Rotinas · situação de hoje",
  "body.get_latest": "Medidas · últimas medições",
  "body.get_series": "Medidas · histórico de uma medida",
  // 18-C · Lote 3
  "finance.get_balances": "Financeiro · saldo das contas",
  "finance.get_spending": "Financeiro · resumo do mês",
  "finance.get_invoice": "Financeiro · faturas de cartão",
  "nutrition.get_day": "Dieta · consumo do dia",
  "nutrition.get_period": "Dieta · consumo do período",
  "nutrition.get_goals": "Dieta · metas nutricionais",
  // 18-C · Bloco 4 — as ferramentas de ESCRITA. O rótulo diz "preparar", porque é o que elas
  // fazem: quem cria e quem reagenda é a confirmação do dono, não a chamada da ferramenta.
  "todo.criar_tarefa": "TO-DO · preparar tarefa nova",
  "todo.concluir_tarefa": "TO-DO · preparar conclusão",
  "todo.reagendar_tarefa": "TO-DO · preparar mudança de data",
  "habits.registrar": "Hábitos · preparar registro do dia",
  "calendar.criar_evento": "Agenda · preparar compromisso novo",
  "nutrition.registrar_consumo": "Dieta · preparar registro no diário",
  "finance.lancar_transacao": "Financeiro · preparar lançamento",
};

/** Ferramenta desconhecida (registry antigo, linha de auditoria de outra versão). */
export function rotuloDaFerramenta(nome: string): string {
  return ROTULO_DA_FERRAMENTA[nome] ?? nome;
}

/**
 * 18-C · Bloco 5 — o nome de cada COMMAND na tela de ações.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ NÃO É O MESMO MAPA DE `ROTULO_DA_FERRAMENTA`, e a diferença tem consequência.         ║
 * ║                                                                                       ║
 * ║ Ferramenta e command não são 1 para 1: seis dos treze commands **não têm ferramenta**  ║
 * ║ (os desfazer), e é assim que o modelo fica impedido de propô-los. Um mapa só forçaria  ║
 * ║ a inventar nome de ferramenta para eles — justamente o que a ausência protege.         ║
 * ║                                                                                       ║
 * ║ E o verbo aqui é o do FATO CONSUMADO ("Tarefa criada"), não o de preparo: esta tela    ║
 * ║ fala do que já foi decidido, não do que está sendo proposto.                            ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A cobertura é garantida por TESTE, sobre `ACTION_COMMANDS` — command novo sem rótulo deixa
 * a suíte vermelha, e a tela nunca mostra `criarTarefaTodo` cru para o dono.
 */
export const ROTULO_DO_COMMAND: Record<string, string> = {
  criarTarefaTodo: "TO-DO · criar tarefa",
  excluirTarefaTodo: "TO-DO · excluir tarefa",
  concluirTarefaTodo: "TO-DO · concluir tarefa",
  reabrirTarefaTodo: "TO-DO · reabrir tarefa",
  reagendarTarefaTodo: "TO-DO · mudar a data da tarefa",
  registrarHabito: "Hábitos · registrar o dia",
  desfazerHabito: "Hábitos · apagar o registro do dia",
  criarEvento: "Agenda · criar compromisso",
  excluirEvento: "Agenda · excluir compromisso",
  registrarConsumo: "Dieta · registrar no diário",
  desfazerConsumo: "Dieta · remover do diário",
  lancarTransacao: "Financeiro · lançar transação",
  excluirTransacao: "Financeiro · excluir lançamento",
};

/** Command desconhecido (linha de auditoria feita por uma versão anterior do sistema). */
export function rotuloDoCommand(nome: string): string {
  return ROTULO_DO_COMMAND[nome] ?? nome;
}

/**
 * O rótulo de cada estado da tela de ações — o vocabulário do DONO, não o do banco.
 *
 * ⚠️ `executando` é o único que não afirma desfecho, e a redação é deliberada: a linha
 * reservou a vaga e não voltou (claim-first do Bloco 3). "Em andamento" seria otimista demais
 * e "falhou" seria falso; o que a tela sabe é que o desfecho não foi registrado.
 */
export const ROTULO_DO_ESTADO_DA_ACAO = {
  pendente: "aguardando você",
  expirada: "prazo encerrado",
  recusada: "recusada por você",
  confirmada: "confirmada",
  executando: "sem desfecho registrado",
  executada: "aplicada",
  falhou: "falhou",
  parcial: "aplicada em parte",
} as const satisfies Record<EstadoDaProposta, string>;

/**
 * O aviso da tela de ações. Ele diz as três coisas que a tela PODE afirmar, e nenhuma que ela
 * não pode — mesma disciplina de `AVISO_DA_TRILHA`.
 */
/**
 * 18-E. A frase que impede a tela de insight de prometer o que ela não é.
 *
 * ⚠️ Ela diz as três coisas que o dono precisa saber ANTES de ler um texto escrito por um
 * modelo: os números são medidos pelo sistema (não pela IA), o texto não contém dígito que
 * não venha de uma fonte listada, e nada aqui é recomendação.
 */
export const AVISO_DOS_INSIGHTS =
  "Os números vêm dos seus registros, calculados pelo sistema — o assistente só escreve o texto ao redor deles, e não pode citar nenhum número que não esteja nas fontes de cada análise. Nada aqui é recomendação, meta ou prescrição.";

/** Rótulo pt-BR de cada estado derivado de um insight. */
export const ROTULO_DO_ESTADO_DE_INSIGHT = {
  vigente: "vigente",
  expirado: "expirado",
  dispensado: "dispensado por você",
  adiado: "adiado por você",
  oculto: "oculto por você",
} as const;

/**
 * ⚠️ A confiança fala da BASE, não do texto. Os rótulos dizem isso — "alta" não significa
 * "bem escrito", significa "todos os números citados foram medidos e estão completos".
 */
export const ROTULO_DA_CONFIANCA = {
  alta: "todos os números citados foram medidos e estão completos",
  media: "algum número citado está incompleto ou não foi medido",
  baixa: "vários números citados estão incompletos ou não foram medidos",
} as const;

export const AVISO_DAS_ACOES =
  "Nenhuma linha aqui foi aplicada sem você confirmar. O estado de cada uma é calculado na leitura, a partir do prazo, da sua decisão e do que a execução registrou — nada disso é gravado como situação.";

/** O desfecho de cada chamada, do ponto de vista de QUEM LÊ — não do log. */
export const ROTULO_DO_STATUS_DE_FERRAMENTA = {
  executada: "consultado",
  rejeitada: "não autorizado",
  falhou: "falhou",
  timeout: "demorou demais",
} as const satisfies Record<ToolCallStatus, string>;

/**
 * ⚠️ A frase que impede a tela de mentir nos DOIS sentidos.
 *
 * A auditoria guarda o PEDIDO, nunca o resultado — então esta tela não sabe se o total era
 * exato ou parcial (`completude`, do adapter) nem se a lista enviada ao modelo foi encurtada
 * por tamanho (`itens_truncados`, do executor). São coisas diferentes, e nenhuma das duas
 * está gravada. Dizer "dado incompleto" sem saber assustaria à toa; dizer "dado completo"
 * sem saber é a mentira que a subfase inteira combate. Então dizemos o que é verdade: o que
 * está aqui é a trilha do pedido.
 */
export const AVISO_DA_TRILHA =
  "Esta trilha registra o que foi consultado — a ferramenta, os argumentos pedidos, quantos registros existiam e para onde eles apontam. O conteúdo devolvido não é guardado.";

/** `records_read` é `ToolOutput.contagem`: quantos EXISTEM, não quantos foram enviados. */
export const ROTULO_REGISTROS_ENCONTRADOS = "registros encontrados";
