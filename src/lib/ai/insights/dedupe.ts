/**
 * Fase 18-E — IA · A CHAVE DE DEDUPLICAÇÃO, CALCULADA ANTES DE FALAR COM O MODELO.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE ANTES, E NÃO DEPOIS                                                           ║
 * ║                                                                                       ║
 * ║ "Rodar o job três vezes não gera três insights iguais" é critério de aceite. Deduplicar║
 * ║ DEPOIS da chamada cumpriria a letra e falharia no espírito: as três chamadas teriam    ║
 * ║ acontecido, e o dono teria pago por duas respostas que o sistema jogaria fora. Aqui a  ║
 * ║ chave sai dos INDICADORES — que já estão calculados quando a decisão é tomada — e a    ║
 * ║ segunda rodada nem abre conexão.                                                       ║
 * ║                                                                                       ║
 * ║ ⚠️ `tipo` NÃO ENTRA NA CHAVE. Ele é escolha do modelo e só existe depois da chamada;   ║
 * ║ pô-lo na chave tornaria a deduplicação impossível de calcular antes.                   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Reusa `canonicalizar` de `approval/canonical.ts` — a mesma disciplina que já protege o hash
 * do efeito (prefixo de versão, chaves ordenadas, array na ordem, NFC, `-0` → `0`,
 * `NaN`/`Date`/`BigInt` recusados). Uma segunda serialização canônica no projeto divergiria da
 * primeira na primeira decisão sutil, e nenhuma das duas estaria errada isoladamente.
 *
 * PURO. `node:crypto` não é I/O.
 */

import { createHash } from "node:crypto";

import { canonicalizar } from "../approval/canonical";
import type { Indicador, ModuloDeInsight, PeriodoDoIndicador } from "./contracts";

/**
 * ⚠️ O PREFIXO DE VERSÃO NÃO É ENFEITE — mesma razão de `VERSAO_CANONICA`. Mudar o que entra
 * na chave sem trocar a versão faria uma chave nova coincidir com uma antiga calculada sobre
 * outro conjunto de fatos, e o sistema devolveria um insight que não fala daqueles números.
 */
export const VERSAO_DEDUPE = "ia-insight-v1";

export type EntradaDeDeduplicacao = {
  readonly modulo: ModuloDeInsight;
  readonly periodo: PeriodoDoIndicador;
  readonly indicadores: readonly Indicador[];
};

/**
 * O que entra na chave, escrito com `map` EXPLÍCITO.
 *
 * ⛔ `rotulo`, `rota` e `regra_de_contagem` ficam de FORA de propósito: são apresentação. O
 * dono renomear uma categoria de "Mercado" para "Supermercado" não muda nenhum número, e
 * gerar um insight novo por causa disso seria gastar dinheiro para reescrever a mesma frase.
 *
 * E o `map` explícito é o que impede um campo NOVO de entrar sozinho no dia em que
 * `Indicador` crescer — exatamente a nota que `serializarEfeito` carrega desde a 18-C.
 */
function fatosDoIndicador(i: Indicador) {
  return {
    id: i.id,
    valor: i.valor,
    indisponivel_porque: i.indisponivel_porque ?? null,
    unidade: i.unidade,
    qualidade: i.qualidade,
    motivo_incompleto: i.motivo_incompleto ?? null,
    n: i.n,
    de: i.periodo.de,
    ate: i.periodo.ate,
  };
}

/** A string que a chave cobre. Exposta para o teste poder olhar o que foi hasheado. */
export function serializarParaDeduplicacao(entrada: EntradaDeDeduplicacao): string {
  return `${VERSAO_DEDUPE}\n${canonicalizar({
    modulo: entrada.modulo,
    de: entrada.periodo.de,
    ate: entrada.periodo.ate,
    // ⚠️ ORDENADO POR `id`. A ordem em que os coletores devolvem é estável hoje, mas não é
    // garantida por contrato nenhum — e `canonicalizar` preserva a ordem de array de
    // propósito. Sem esta ordenação, a mesma leitura com os coletores rodando em outra ordem
    // daria chave diferente, e a deduplicação silenciosamente pararia de funcionar.
    indicadores: [...entrada.indicadores]
      .map(fatosDoIndicador)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
  })}`;
}

/** sha256 hex minúsculo, no mesmo formato de `effect_hash`. */
export function chaveDeDeduplicacao(entrada: EntradaDeDeduplicacao): string {
  return createHash("sha256")
    .update(serializarParaDeduplicacao(entrada), "utf8")
    .digest("hex");
}
