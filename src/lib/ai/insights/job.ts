/**
 * Fase 18-E · Bloco 4 — A DECISÃO DA VARREDURA AUTOMÁTICA. Pura, com `hoje` injetado.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ `allow_insight_jobs` NÃO É ANDADA COM AS CHAVES DE MÓDULO — ELA AS PRECEDE.        ║
 * ║                                                                                       ║
 * ║ Diferente de `allow_vision` (18-D), que É ANDada com `allow_finance` +                ║
 * ║ `allow_write_finance`: lá as três chaves servem ao MESMO efeito, e um comprovante que ║
 * ║ não pode virar lançamento é um arquivo que saiu do sistema para nada.                 ║
 * ║                                                                                       ║
 * ║ Aqui os três módulos são efeitos INDEPENDENTES. ANDar faria desligar a leitura de     ║
 * ║ Dieta calar também o insight de Financeiro — uma chave derrubando o que ela não tem   ║
 * ║ nada a ver. Então:                                                                    ║
 * ║                                                                                       ║
 * ║   `allow_insight_jobs` desligada  ⇒ NADA roda (é o interruptor do MECANISMO)          ║
 * ║   `allow_<modulo>`     desligada  ⇒ SÓ aquele módulo é pulado; os outros seguem       ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ Esta função NÃO é a última barreira: `ai_begin_insight_run` confere as duas chaves de
 * novo, dentro da transação (`AI_MODULE_NOT_ALLOWED` e `AI_JOBS_NOT_ALLOWED`). Ela existe
 * para o job não gastar uma ida ao provedor descobrindo o que já dava para saber — e para o
 * motivo do pulo ser escrito em português, que o RPC não tem como fazer.
 */

import { MODULOS_DE_INSIGHT, type ModuloDeInsight } from "./contracts";

/** A chave de leitura de cada módulo da fatia. Derivada, nunca uma segunda lista. */
export const CHAVE_DE_LEITURA: Readonly<Record<ModuloDeInsight, string>> = {
  financeiro: "allow_finance",
  treinos: "allow_training",
  dieta: "allow_nutrition",
};

const NOME_DO_MODULO: Readonly<Record<ModuloDeInsight, string>> = {
  financeiro: "Financeiro",
  treinos: "Treinos",
  dieta: "Dieta e Alimentação",
};

export type PreferenciasDaVarredura = {
  readonly allowInsightJobs: boolean;
  /** As chaves `allow_*` de leitura, como já vêm de `getAiPreferences`. */
  readonly permissions: Readonly<Record<string, boolean>>;
};

/**
 * O que a varredura decidiu sobre um módulo. `tentar: false` SEMPRE carrega motivo — a mesma
 * disciplina do `Indicador` (invariante 65): ausência sem motivo não é representável.
 */
export type DecisaoDoModulo =
  | { readonly modulo: ModuloDeInsight; readonly tentar: true }
  | {
      readonly modulo: ModuloDeInsight;
      readonly tentar: false;
      readonly motivo: string;
    };

/**
 * Decide o que a varredura tenta.
 *
 * ⚠️ **NÃO recebe `hoje`, e a ausência é deliberada.** A cadência é do `vercel.json`, e nada
 * nesta decisão olha o calendário — um parâmetro de data aqui seria a promessa de uma regra
 * temporal que não existe. No dia em que uma entrar (pular fim de semana, respeitar um
 * "adiado até"), ela chega junto com o parâmetro; e a função continua pura, testável sem
 * congelar relógio, porque não há relógio nenhum a congelar.
 */
export function decidirVarredura(
  prefs: PreferenciasDaVarredura,
): readonly DecisaoDoModulo[] {
  // O interruptor do mecanismo vem primeiro, e ele zera a lista inteira.
  if (!prefs.allowInsightJobs) return [];

  return MODULOS_DE_INSIGHT.map((modulo) => {
    const chave = CHAVE_DE_LEITURA[modulo];
    if (prefs.permissions[chave] === true) return { modulo, tentar: true } as const;
    return {
      modulo,
      tentar: false,
      motivo: `a leitura de ${NOME_DO_MODULO[modulo]} pela IA está desligada`,
    } as const;
  });
}

/** Só os módulos que a varredura vai mesmo tentar. Açúcar, para quem chama não filtrar na mão. */
export function modulosATentar(
  decisoes: readonly DecisaoDoModulo[],
): readonly ModuloDeInsight[] {
  return decisoes.filter((d) => d.tentar).map((d) => d.modulo);
}
