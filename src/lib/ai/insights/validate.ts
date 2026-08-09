/**
 * Fase 18-E — IA · A VALIDAÇÃO DO QUE O MODELO ESCREVEU. Puro, ordem fixa.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTA É A PRIMEIRA CHECAGEM DE TOM DO PROJETO QUE RODA EM PRODUÇÃO.                    ║
 * ║                                                                                       ║
 * ║ Nas 16-F e 17-F o texto sai de função pura, então um TESTE basta: a suíte varre todas ║
 * ║ as saídas possíveis e pronto. Aqui o texto vem do MODELO, em runtime, e não existe     ║
 * ║ função para varrer. A checagem tem de rodar no caminho da requisição — a suíte deixa   ║
 * ║ de ser a última linha de defesa e passa a cobrir o validador.                          ║
 * ║                                                                                       ║
 * ║ ⛔ FALHA EM QUALQUER ITEM ⇒ O INSIGHT NÃO É GRAVADO. Erra para "não mostrar nada",     ║
 * ║ nunca para "mostrar algo não conferido" — a mesma direção do claim-first da 18-C.     ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { VOCABULARIO_DE_COBRANCA, VOCABULARIO_DE_PRESCRICAO } from "@/lib/tone/vocabulary";

import {
  type Indicador,
  type InsightGerado,
  textoSemTokens,
  tokensDeIndicadorEm,
} from "./contracts";

export type CodigoDeRecusa =
  | "TOKEN_DESCONHECIDO"
  | "NUMERO_NO_TEXTO"
  | "SEM_EVIDENCIA"
  | "EVIDENCIA_DESCONHECIDA"
  | "VOCABULARIO_DE_COBRANCA"
  | "VOCABULARIO_DE_PRESCRICAO"
  | "TEXTO_VAZIO";

export type Recusa = {
  readonly codigo: CodigoDeRecusa;
  /** pt-BR, para a tela e para `ai_runs`. Nunca contém conteúdo do modelo além do necessário. */
  readonly motivo: string;
};

export type ResultadoDaValidacao =
  | { readonly ok: true; readonly citados: readonly string[] }
  | { readonly ok: false; readonly recusas: readonly Recusa[] };

/**
 * ⚠️ **A BUSCA POR DÍGITO É `/\d/` SOBRE O TEXTO SEM OS TOKENS, e a simplicidade é a decisão.**
 *
 * A alternativa — deixar o modelo escrever o número e o servidor conferir — exigiria casar
 * `R$ 1.234,56` com `1234.56`, decidir o que fazer com `mil duzentos e trinta e quatro`, e
 * ainda deixaria passar "quase o dobro", que é uma afirmação quantitativa sem um dígito. Um
 * parser de português no caminho da requisição seria a parte mais frágil do sistema.
 *
 * Aqui a regra é pobre e total: fora dos tokens, dígito nenhum. O modelo não tem margem para
 * negociar, e o validador não tem margem para errar.
 *
 * ⚠️ Isto proíbe também "nos últimos 7 dias" e "2026" — de propósito. O período é do
 * indicador e aparece ao lado dele na tela; escrito no texto, ele seria mais um número que o
 * modelo poderia errar. "no período analisado" diz a mesma coisa e não pode estar errado.
 */
const TEM_DIGITO = /\d/;

/** Os campos de texto que o dono lê, todos submetidos às mesmas regras. */
function textosDe(insight: InsightGerado): { readonly campo: string; readonly texto: string }[] {
  return [
    { campo: "titulo", texto: insight.titulo },
    { campo: "resumo", texto: insight.resumo },
    { campo: "explicacao", texto: insight.explicacao },
    ...insight.evidencias.map((e, i) => ({
      campo: `evidencias[${i}].afirmacao`,
      texto: e.afirmacao,
    })),
  ];
}

/**
 * Valida o insight contra os indicadores que foram ENVIADOS na chamada.
 *
 * A ordem é fixa e todas as recusas são coletadas (não há curto-circuito): um insight recusado
 * por dois motivos deve registrar os dois, senão consertar o primeiro revelaria o segundo só
 * na tentativa seguinte — e cada tentativa custa dinheiro do dono.
 */
export function validarInsight(
  insight: InsightGerado,
  indicadores: readonly Indicador[],
): ResultadoDaValidacao {
  const recusas: Recusa[] = [];
  const idsConhecidos = new Set(indicadores.map((i) => i.id));
  const textos = textosDe(insight);

  // 1. Nenhum campo lido pelo dono pode vir vazio.
  for (const { campo, texto } of textos) {
    if (texto.trim() === "") {
      recusas.push({ codigo: "TEXTO_VAZIO", motivo: `o campo ${campo} veio vazio` });
    }
  }

  // 2. Todo token citado existe entre os indicadores enviados.
  const citados = tokensDeIndicadorEm(
    textos.map((t) => t.texto).join("\n"),
  );
  for (const id of citados) {
    if (!idsConhecidos.has(id)) {
      recusas.push({
        codigo: "TOKEN_DESCONHECIDO",
        motivo: `o texto cita o indicador "${id}", que não foi enviado nesta análise`,
      });
    }
  }

  // 3. Fora dos tokens, dígito nenhum.
  for (const { campo, texto } of textos) {
    if (TEM_DIGITO.test(textoSemTokens(texto))) {
      recusas.push({
        codigo: "NUMERO_NO_TEXTO",
        motivo: `o campo ${campo} escreve um número fora dos indicadores medidos`,
      });
    }
  }

  // 4. Evidência: existe, e aponta indicador enviado.
  if (insight.evidencias.length === 0) {
    recusas.push({
      codigo: "SEM_EVIDENCIA",
      motivo: "o insight não amarrou nenhuma afirmação a um número medido",
    });
  }
  for (const [i, evidencia] of insight.evidencias.entries()) {
    if (!idsConhecidos.has(evidencia.indicador_id)) {
      recusas.push({
        codigo: "EVIDENCIA_DESCONHECIDA",
        motivo: `a evidência ${i + 1} aponta o indicador "${evidencia.indicador_id}", que não foi enviado`,
      });
    }
  }

  // 5. Vocabulário. Roda EM PRODUÇÃO, não só na suíte — ver o cabeçalho.
  for (const { campo, texto } of textos) {
    for (const termo of VOCABULARIO_DE_COBRANCA) {
      if (texto.toLocaleLowerCase("pt-BR").includes(termo)) {
        recusas.push({
          codigo: "VOCABULARIO_DE_COBRANCA",
          motivo: `o campo ${campo} usa linguagem de cobrança ("${termo}")`,
        });
      }
    }
    for (const termo of VOCABULARIO_DE_PRESCRICAO) {
      if (texto.toLocaleLowerCase("pt-BR").includes(termo)) {
        recusas.push({
          codigo: "VOCABULARIO_DE_PRESCRICAO",
          motivo: `o campo ${campo} prescreve ("${termo}")`,
        });
      }
    }
  }

  return recusas.length > 0 ? { ok: false, recusas } : { ok: true, citados };
}
