/**
 * Fase 18-E — IA · A CONFIANÇA É DO SERVIDOR, E ELE SÓ REBAIXA. Puro.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ `promover` NÃO EXISTE NESTE ARQUIVO, E A AUSÊNCIA É A GARANTIA.                       ║
 * ║                                                                                       ║
 * ║ É a invariante 57 da 18-D inteira, aplicada a outro objeto. Um modelo que declara a    ║
 * ║ própria confiança declara `alta` quase sempre — e o dono leria como aval o que é só    ║
 * ║ fluência. Por isso o campo `confianca` **não está no schema de saída dele**: não é     ║
 * ║ recusado, é irrepresentável. E aqui só existe o caminho para baixo.                    ║
 * ║                                                                                       ║
 * ║ ⚠️ A confiança fala da BASE, não do texto. Ela diz o quanto os números que sustentam o ║
 * ║ insight são completos — nunca o quanto a frase está bem escrita.                       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import type { Indicador } from "./contracts";

export type Confianca = "alta" | "media" | "baixa";

/** Da mais alta para a mais baixa. A ordem é a régua de `rebaixar`. */
const ESCALA: readonly Confianca[] = ["alta", "media", "baixa"];

/**
 * Devolve a MENOR das duas. Não há `promover`, e não há como escrever uma com esta função:
 * o resultado nunca sobe acima de nenhuma das entradas.
 */
export function rebaixar(a: Confianca, b: Confianca): Confianca {
  return ESCALA.indexOf(a) >= ESCALA.indexOf(b) ? a : b;
}

/** Um degrau abaixo, com piso em `baixa`. */
function umDegrauAbaixo(c: Confianca): Confianca {
  return ESCALA[Math.min(ESCALA.indexOf(c) + 1, ESCALA.length - 1)];
}

export type ConfiancaDerivada = {
  readonly confianca: Confianca;
  /** Em pt-BR, para a tela dizer POR QUE a confiança não é alta. Vazio quando é. */
  readonly motivos: readonly string[];
};

/**
 * Deriva a confiança dos indicadores que o insight CITOU.
 *
 * ⚠️ **Só os citados contam.** Um indicador enviado ao modelo e não usado por ele não deveria
 * puxar a confiança para baixo: ele não sustenta nenhuma afirmação do texto. Levar todos em
 * conta faria um insight impecável sobre três números certos ser rebaixado por um quarto
 * número que ninguém mencionou.
 *
 * @param indicadores  os que entraram na chamada
 * @param citados      os ids que o texto cita por token (de `tokensDeIndicadorEm`)
 */
export function confiancaDoInsight(
  indicadores: readonly Indicador[],
  citados: readonly string[],
): ConfiancaDerivada {
  const porId = new Map(indicadores.map((i) => [i.id, i]));
  const usados = citados
    .map((id) => porId.get(id))
    .filter((i): i is Indicador => i !== undefined);

  let confianca: Confianca = "alta";
  const motivos: string[] = [];

  const naoMedidos = usados.filter((i) => i.valor === null);
  if (naoMedidos.length > 0) {
    confianca = umDegrauAbaixo(confianca);
    motivos.push(
      naoMedidos.length === 1
        ? `um dos números citados não foi medido: ${naoMedidos[0].indisponivel_porque}`
        : `${naoMedidos.length} dos números citados não foram medidos`,
    );
  }

  const parciais = usados.filter((i) => i.qualidade === "parcial");
  if (parciais.length > 0) {
    confianca = umDegrauAbaixo(confianca);
    motivos.push(
      parciais.length === 1
        ? `um dos números citados está incompleto: ${parciais[0].motivo_incompleto}`
        : `${parciais.length} dos números citados estão incompletos`,
    );
  }

  /**
   * `n === 0` num indicador MEDIDO é o caso estranho e real: um total de zero apurado sobre
   * zero registros. O número está certo, e a leitura em cima dele é frágil — "você gastou
   * R$ 0,00" sobre nenhuma transação não é a mesma coisa que sobre trinta.
   */
  const semBase = usados.filter((i) => i.valor !== null && i.n === 0);
  if (semBase.length > 0) {
    confianca = umDegrauAbaixo(confianca);
    motivos.push("algum número citado foi apurado sem nenhum registro no período");
  }

  /**
   * Nenhum token no texto: nada sustenta nada. Não é um insight errado — é um insight sobre
   * coisa nenhuma, e a tela precisa poder dizer isso. (O validador recusa o insight sem
   * evidência; este ramo cobre o caso em que ele passa com evidência mas sem citação.)
   */
  if (usados.length === 0) {
    confianca = "baixa";
    motivos.push("o texto não cita nenhum número medido");
  }

  return { confianca, motivos };
}
