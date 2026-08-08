/**
 * Fase 18-A — IA · Constantes de navegação e apresentação do módulo.
 *
 * Puro. Importável por componente client — não há nada de servidor aqui.
 */

import type { RotaComContexto } from "@/lib/validators/ai";
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
 * Fase 18-B — o rótulo de cada rota que pode virar contexto da conversa.
 *
 * `satisfies Record<RotaComContexto, string>` obriga a cadastrar o rótulo no MESMO commit
 * em que uma rota entra na lista estática — senão a tela mostraria um caminho cru, ou pior,
 * `undefined`. A lista em si é de `@/lib/validators/ai`: aqui mora só a apresentação.
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
export const AVISO_SEM_ACESSO =
  "O assistente só consulta o que você autorizar, módulo a módulo, e toda autorização nasce desligada. Ele pode ler Financeiro, Dieta e Alimentação, Treinos, Medidas corporais, TO-DO, Agenda, Tarefas e Rotinas, Hábitos e Estudos — cada um com a sua chave. Para ALTERAR algo ele precisa de uma segunda chave, que hoje existe só para o TO-DO: ele prepara a alteração, mostra exatamente o que vai mudar, e nada acontece até você confirmar aqui na tela.";

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
