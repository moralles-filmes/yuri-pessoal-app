/**
 * Fase 18-A — IA · Constantes de navegação e apresentação do módulo.
 *
 * Puro. Importável por componente client — não há nada de servidor aqui.
 */

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

/** O aviso do que a 18-A NÃO faz. Honestidade é critério de aceite, não gentileza. */
export const AVISO_SEM_ACESSO =
  "Nesta versão o assistente não consulta seus registros: ele não vê finanças, tarefas, agenda, dieta nem treinos, e não cria nem altera nada.";
