/**
 * Chat livre com coordenador — as frases que o SERVIDOR escreve.
 *
 * Duas famílias, e a diferença é a razão deste arquivo existir:
 *
 *  - blocos de PROMPT (`blocoDaData`, `blocoDoCoordenador`), que entram no `system`;
 *  - avisos DE RESPOSTA (`avisoCruzarModulos`, `avisoDeEspecialistasQueFalharam`,
 *    `avisoSemEspecialista`), que o servidor acrescenta ao texto gravado.
 *
 * ⛔ Os avisos são nossos, não do modelo: pedir ao modelo que diga "não consegui consultar o
 * módulo X" é obediência "quase sempre", e num chat de uso diário uma omissão por mês é uma
 * resposta que parece completa sem ser. A frase fica garantida por construção.
 *
 * Todo texto aqui passa pelo varredor de `src/lib/tone/` (teste). Links vêm de
 * `settingsLink()`, nunca escritos à mão. Puro: `agora` injetado.
 */

import { dateInSaoPaulo } from "@/lib/format";
import { ROTULO_CRUZAR_MODULOS } from "@/lib/ai/constants";
import { settingsLink } from "@/lib/search/ai-links";
import { MAX_ESPECIALISTAS, type EspecialistaOferecido } from "./especialistas";

const DIA_DA_SEMANA = new Intl.DateTimeFormat("pt-BR", {
  weekday: "long",
  timeZone: "America/Sao_Paulo",
});

/**
 * A data de hoje em Brasília, para o modelo não adivinhar "hoje" nem "amanhã". Não depende do
 * `TZ` do processo: data e dia da semana saem do mesmo fuso, explícito.
 */
export function blocoDaData(agora: Date): string {
  return `Hoje é ${DIA_DA_SEMANA.format(agora)}, ${dateInSaoPaulo(agora)} (horário de Brasília).`;
}

function listaDeRotulos(rotulos: readonly string[]): string {
  return new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" }).format(rotulos);
}

/**
 * O bloco do coordenador: o que ele pode acionar, com que limite, e o que está desligado.
 * "Desligado" é descrito pelo lado do dono (a chave dele), nunca como falha do sistema.
 */
export function blocoDoCoordenador(input: {
  readonly ofertas: readonly EspecialistaOferecido[];
  readonly desligados: readonly string[];
  readonly allowCrossModule: boolean;
}): string {
  const linhas: string[] = [
    "Você coordena a conversa. Os dados do dono só chegam por especialistas: cada um lê o próprio módulo e devolve o que encontrou.",
  ];

  if (input.ofertas.length > 0) {
    linhas.push(
      "Para consultar um módulo, acione o especialista dele pela ferramenta correspondente e escreva em `tarefa` o pedido completo — o especialista não vê a conversa.",
      "Especialistas disponíveis:",
      ...input.ofertas.map((o) => `- ${o.rotulo} (ferramenta ${o.ferramenta})`),
    );
  } else {
    linhas.push(
      "Nenhum especialista está disponível nesta conversa, então não há como consultar registro algum.",
    );
  }

  if (input.ofertas.length > 0) {
    linhas.push(
      input.allowCrossModule
        ? `Você pode acionar até ${MAX_ESPECIALISTAS} especialistas distintos por mensagem, cada um uma vez.`
        : "Nesta conversa você aciona um especialista por mensagem; uma pergunta que cruze módulos fica para o dono refazer por partes.",
    );
  }

  if (input.desligados.length > 0) {
    linhas.push(
      `Sem acesso liberado pelo dono: ${listaDeRotulos(input.desligados)}. Não há especialista para esses módulos nesta conversa.`,
    );
  }

  linhas.push(
    "Quando a pergunta não for sobre os registros do dono, responda direto, sem acionar ninguém.",
  );

  return linhas.join("\n");
}

/** Acrescentado quando a pergunta pedia mais de um módulo e o cruzamento está desligado. */
export function avisoCruzarModulos(): string {
  return `Esta pergunta envolve mais de um módulo, e “${ROTULO_CRUZAR_MODULOS}” está desligado nas preferências, então respondi com um só. Para liberar, ligue “${ROTULO_CRUZAR_MODULOS}” em ${settingsLink()}.`;
}

/** Acrescentado quando um ou mais especialistas acionados não conseguiram responder. */
export function avisoDeEspecialistasQueFalharam(rotulos: readonly string[]): string {
  if (rotulos.length === 0) return "";
  const nomes = listaDeRotulos(rotulos);
  return rotulos.length === 1
    ? `Não consegui obter a resposta do especialista ${nomes}; o que está acima não inclui esse módulo.`
    : `Não consegui obter a resposta dos especialistas ${nomes}; o que está acima não inclui esses módulos.`;
}

/**
 * Quando o coordenador pediu um especialista LIBERADO, mas a consulta veio sem forma (tarefa
 * vazia ou longa demais) e nenhum outro pedido valeu. O módulo está ligado: mandar ligar a
 * leitura apontaria para uma causa que não é a real.
 */
export function avisoConsultaNaoMontada(rotulos: readonly string[]): string {
  if (rotulos.length === 0) {
    return "Não consegui montar a consulta aos registros desta vez. Se quiser, envie a pergunta com mais detalhes.";
  }
  const nomes = listaDeRotulos(rotulos);
  return rotulos.length === 1
    ? `Não consegui montar a consulta ao especialista ${nomes} desta vez. Se quiser, envie a pergunta com mais detalhes.`
    : `Não consegui montar a consulta aos especialistas ${nomes} desta vez. Se quiser, envie a pergunta com mais detalhes.`;
}

/** Acrescentado quando a pergunta era sobre registros e nenhum especialista estava liberado. */
export function avisoSemEspecialista(desligados: readonly string[]): string {
  if (desligados.length === 0) {
    return `Nenhum módulo de registros está liberado para leitura. Para eu consultar algum, ligue a leitura em ${settingsLink()}.`;
  }
  return `A leitura destes módulos está desligada: ${listaDeRotulos(desligados)}. Para eu consultar algum deles, ligue a leitura em ${settingsLink()}.`;
}
