/**
 * Fase 18-A — IA · Constantes de navegação e apresentação do módulo.
 *
 * Puro. Importável por componente client — não há nada de servidor aqui.
 */

import type { RotaComContexto } from "@/lib/validators/ai";

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
} as const satisfies Record<RotaComContexto, string>;

/**
 * O aviso do que o assistente NÃO faz. Honestidade é critério de aceite, não gentileza.
 *
 * ⚠️ **Reescrito na 18-B, e pelo mesmo motivo que o prompt-base virou `seguranca-v2`.** O
 * texto da 18-A dizia que o assistente "não vê treinos". Isso era verdade enquanto o Tool
 * Registry estava vazio; deixou de ser quando as três leituras de Treinos entraram nele.
 * Um aviso de honestidade que mente é pior que nenhum.
 *
 * O texto de agora é verdadeiro nos DOIS estados — com `allow_training` desligada (o padrão
 * do banco) e ligada — porque afirma a regra, não o estado: nada é lido sem autorização
 * explícita por módulo, e não existe escrita. Quem acrescentar ferramenta de um módulo novo
 * precisa mexer aqui no MESMO commit.
 */
export const AVISO_SEM_ACESSO =
  "O assistente só consulta o que você autorizar, módulo a módulo, e toda autorização nasce desligada. Nesta versão existem apenas leituras de Treinos — ele não vê finanças, tarefas, agenda nem dieta — e não cria nem altera nada.";
