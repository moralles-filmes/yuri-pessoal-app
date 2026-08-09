/**
 * Fase 18-E — IA · O CONTRATO DE UM NÚMERO QUE VAI PARAR NUM INSIGHT. Puro, sem I/O.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE MUDA DE NATUREZA NESTA SUBFASE                                                  ║
 * ║                                                                                       ║
 * ║ Até aqui a IA RELATOU números que outro alguém calculou: `resumoMes` soma, `metrics`  ║
 * ║ agrega, `calc` totaliza, e o adapter repassa. A 18-E cria a primeira grandeza          ║
 * ║ DERIVADA do projeto — média de uma janela, comparação com o período anterior,          ║
 * ║ variação percentual. Números que não existem em tela nenhuma até este módulo existir.  ║
 * ║                                                                                       ║
 * ║ Daí as três regras da subfase: o número é MEDIDO e vem pronto; o texto não contém      ║
 * ║ DÍGITO; e o dashboard nunca chama a IA.                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ **`valor: number | null` COM MOTIVO OBRIGATÓRIO** é a invariante 1 da Dieta subida ao
 * nível do contrato: a ausência não vira zero antes mesmo de o número chegar ao modelo. Um
 * `0` aqui significa "medi e deu zero"; um `null` significa "não medi", e o porquê viaja
 * junto. Sem o motivo obrigatório, a tela escreveria "—" e o dono não saberia qual dos dois é.
 *
 * ⚠️ **`n` e `regra_de_contagem` VIAJAM COM O NÚMERO.** Uma média de 4 semanas em que só 3
 * tiveram registro não é a mesma média; um volume contado com aquecimento não é o mesmo
 * volume (invariante 12 dos Treinos). Sem esses dois campos ao lado, o número não é
 * verificável — e um número não verificável apresentado como fato é o que esta fase inteira
 * existe para não fazer.
 */

import { rotaInternaAceita } from "../tools/sources";

/** Os três módulos da primeira fatia. Cada módulo novo é um coletor, não um campo novo. */
export type ModuloDeInsight = "financeiro" | "treinos" | "dieta";

export const MODULOS_DE_INSIGHT: readonly ModuloDeInsight[] = [
  "financeiro",
  "treinos",
  "dieta",
];

/**
 * A mesma união de `ToolOutput.completude` (18-B), de propósito. Um terceiro vocabulário para
 * dizer "esse total está incompleto" faria a tela de insights e a trilha do chat discordarem
 * sobre a mesma ideia.
 */
export type QualidadeDoIndicador = "exato" | "parcial";

/** Duas datas PURAS (`yyyy-MM-dd`). Sem hora, sem fuso — ver a seção de fuso do CLAUDE.md. */
export type PeriodoDoIndicador = { readonly de: string; readonly ate: string };

/**
 * Um número medido, pronto para virar fonte de um insight e linha de `ai_insight_sources`.
 *
 * Tanto o que o coletor lê do módulo quanto o que `temporal.ts` deriva são `Indicador` — é o
 * que permite um token `{{ind:…}}` apontar para os dois sem a tela precisar saber a diferença.
 */
export type Indicador = {
  /** `"financeiro.gasto_mes"`. Estável: ele é a chave do token e da linha de fontes. */
  readonly id: string;
  readonly modulo: ModuloDeInsight;
  /** pt-BR, vindo do módulo. Pode conter texto do dono — entra como dado não confiável. */
  readonly rotulo: string;
  /** `null` = NÃO MEDIDO. Nunca use `0` para dizer ausência. */
  readonly valor: number | null;
  /** Obrigatório quando `valor` é `null`. É o que a tela escreve no lugar do número. */
  readonly indisponivel_porque?: string;
  /** `"R$"`, `"kg"`, `"kcal"`, `"sessões"`, `"%"`. Some com o número e sem ela ele não se lê. */
  readonly unidade: string;
  readonly qualidade: QualidadeDoIndicador;
  /** Obrigatório quando `qualidade` é `"parcial"`. */
  readonly motivo_incompleto?: string;
  readonly periodo: PeriodoDoIndicador;
  /** Quantos períodos ou registros entraram. Nunca negativo. */
  readonly n: number;
  /** Treinos 12 — a regra que faz o mesmo registro dar totais diferentes. */
  readonly regra_de_contagem?: string;
  /** Deep link interno para o registro real. Passa por `rotaInternaAceita`. */
  readonly rota: string;
};

/** Um ponto da série: o mesmo indicador medido num período. */
export type PontoDaSerie = {
  readonly periodo: PeriodoDoIndicador;
  readonly valor: number | null;
  readonly indisponivel_porque?: string;
  readonly qualidade: QualidadeDoIndicador;
  readonly motivo_incompleto?: string;
};

/**
 * A mesma grandeza ao longo do tempo. Os metadados (rótulo, unidade, rota) ficam UMA vez no
 * cabeçalho: repeti-los por ponto abriria a porta para dois pontos da mesma série declararem
 * unidades diferentes, e a média somaria quilos com segundos.
 *
 * ⚠️ Período sem registro entra como ponto com `valor: null` — **não é omitido**. Omitir faria
 * uma janela de 7 dias com 5 registros parecer uma janela de 5 dias completa.
 */
export type SerieTemporal = {
  readonly id: string;
  readonly modulo: ModuloDeInsight;
  readonly rotulo: string;
  readonly unidade: string;
  readonly rota: string;
  readonly regra_de_contagem?: string;
  /** Em ordem cronológica crescente. */
  readonly pontos: readonly PontoDaSerie[];
};

/**
 * O resultado de comparar dois períodos. As duas grandezas derivadas são `Indicador` porque
 * são citáveis por token como qualquer outro número — e porque assim herdam de graça a regra
 * de que ausência carrega motivo.
 */
export type Comparacao = {
  readonly atual: Indicador;
  /** `null` quando não há período anterior medido. */
  readonly anterior: Indicador | null;
  /** Diferença absoluta, na unidade do indicador. */
  readonly diferenca: Indicador;
  /** Variação percentual. Unidade `"%"`. */
  readonly variacao: Indicador;
};

/** Uma afirmação do texto amarrada ao indicador que a sustenta. */
export type Evidencia = {
  readonly afirmacao: string;
  readonly indicador_id: string;
};

export type TipoDeInsight = "observacao" | "comparacao" | "tendencia" | "lembrete";
export type PrioridadeDeInsight = "baixa" | "media" | "alta";

export const TIPOS_DE_INSIGHT: readonly TipoDeInsight[] = [
  "observacao",
  "comparacao",
  "tendencia",
  "lembrete",
];

export const PRIORIDADES_DE_INSIGHT: readonly PrioridadeDeInsight[] = [
  "baixa",
  "media",
  "alta",
];

/**
 * O que o MODELO devolve. Nada além disto.
 *
 * ⛔ **`confianca` NÃO ESTÁ AQUI, e a ausência é a garantia** (§5.6 do design, invariante 57
 * da 18-D). Um modelo que declara a própria confiança declara `alta` quase sempre, e o dono
 * leria como aval o que é só fluência. A confiança é DERIVADA pelo servidor em
 * `confidence.ts`, que só sabe rebaixar. Não está recusada — está irrepresentável.
 *
 * `tipo` e `prioridade` continuam sendo escolha do modelo, e podem ser: nenhum dos dois é
 * afirmação factual sobre os registros do dono.
 */
export type InsightGerado = {
  readonly tipo: TipoDeInsight;
  readonly prioridade: PrioridadeDeInsight;
  readonly titulo: string;
  readonly resumo: string;
  /** ⚠️ COM os tokens `{{ind:…}}` — nunca com o número resolvido. Ver §5.2 do design. */
  readonly explicacao: string;
  readonly evidencias: readonly Evidencia[];
};

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O TOKEN É O CONTRATO. Ele é o único jeito de um número entrar no texto.                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * A forma é fechada e pobre de propósito: `{{ind:<id>}}`, sem espaço, sem argumento, sem
 * formatação embutida. Quem formata é `render.ts`, no servidor, a partir de
 * `ai_insight_sources`. Um token que aceitasse `{{ind:x|2 casas}}` moveria a decisão de
 * apresentação para dentro de um texto que o modelo escreve.
 *
 * ⚠️ `id` limitado a minúsculas, dígitos, `_` e `.` — sem `}`, sem espaço, sem barra. É o que
 * impede um id malformado de fechar o token cedo e deixar lixo virar texto visível.
 */
export const TOKEN_DE_INDICADOR = /\{\{ind:([a-z0-9_.]+)\}\}/g;

/** O formato de um `Indicador.id`: pelo menos um ponto, minúsculo, sem acento. */
export const ID_DE_INDICADOR = /^[a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+$/;

/** Os ids citados por token no texto, na ordem em que aparecem, sem repetir. */
export function tokensDeIndicadorEm(texto: string): string[] {
  const vistos = new Set<string>();
  for (const m of texto.matchAll(TOKEN_DE_INDICADOR)) vistos.add(m[1]);
  return [...vistos];
}

/** O texto sem os tokens — é sobre ele que a busca por dígito roda em `validate.ts`. */
export function textoSemTokens(texto: string): string {
  return texto.replace(TOKEN_DE_INDICADOR, "");
}

/**
 * O coerente do indicador, no molde de `isToolDescriptorCoherent` (18-B).
 *
 * Ele existe porque o `Indicador` vem de um coletor — código nosso, mas escrito uma vez por
 * módulo e depois por módulo novo. O tipo garante a FORMA; isto garante que a forma faça
 * sentido junta: valor ausente sem motivo, parcial sem motivo, `n` negativo, período
 * invertido, rota que não é interna.
 */
export function indicadorCoerente(indicador: Indicador): boolean {
  if (!ID_DE_INDICADOR.test(indicador.id)) return false;
  if (!MODULOS_DE_INSIGHT.includes(indicador.modulo)) return false;
  if (indicador.rotulo.trim() === "") return false;
  if (indicador.unidade.trim() === "") return false;

  // Ausência carrega motivo; presença NÃO carrega motivo de ausência.
  if (indicador.valor === null) {
    if (!indicador.indisponivel_porque?.trim()) return false;
  } else {
    if (indicador.indisponivel_porque !== undefined) return false;
    if (!Number.isFinite(indicador.valor)) return false;
  }

  // Mesma simetria para a qualidade: `parcial` sem motivo é um número sem ressalva.
  if (indicador.qualidade === "parcial") {
    if (!indicador.motivo_incompleto?.trim()) return false;
  } else if (indicador.motivo_incompleto !== undefined) {
    return false;
  }

  if (!Number.isInteger(indicador.n) || indicador.n < 0) return false;
  if (!ehDataPura(indicador.periodo.de) || !ehDataPura(indicador.periodo.ate)) return false;
  if (indicador.periodo.de > indicador.periodo.ate) return false;
  if (!rotaInternaAceita(indicador.rota)) return false;

  return true;
}

/** `yyyy-MM-dd` como TEXTO. Data pura não vira `Date` só para ser conferida. */
export function ehDataPura(valor: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor);
}
