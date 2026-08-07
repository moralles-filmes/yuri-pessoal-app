/**
 * Fase 18-A — IA · Constantes de navegação e apresentação do módulo.
 *
 * Puro. Importável por componente client — não há nada de servidor aqui.
 */

import type { RotaComContexto } from "@/lib/validators/ai";
import type { ToolCallStatus, ToolPermission } from "@/lib/ai/tools/contracts";

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
 * ║ ⚠️ O teste garante que os módulos COM ferramenta apareçam; ele não sabe verificar a    ║
 * ║ segunda metade da frase. Por isso ela enumera o que NÃO existe em vez de afirmar um   ║
 * ║ conjunto fechado — e some quando o Lote 3 publicar Financeiro e Dieta.                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
export const AVISO_SEM_ACESSO =
  "O assistente só consulta o que você autorizar, módulo a módulo, e toda autorização nasce desligada. Nesta versão ele lê Treinos, TO-DO, Hábitos e Estudos — ainda não lê finanças, dieta, agenda nem medidas corporais — e não cria nem altera nada.";

/**
 * A versão curta da mesma regra, para a descrição da página. Afirma a REGRA, nunca o estado:
 * continua verdadeira com `allow_training` ligada ou desligada. O texto da 18-A ("sem acesso
 * aos seus registros nesta versão") virou mentira no instante em que as leituras de Treinos
 * entraram no registry.
 */
export const RESUMO_DO_ASSISTENTE =
  "Assistente Pessoal. Ele só consulta os módulos que você autorizar nas preferências — e não cria nem altera nada.";

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
