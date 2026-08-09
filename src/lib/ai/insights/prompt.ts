/**
 * Fase 18-E — IA · O prompt do insight, e a MENSAGEM que carrega os indicadores. Puro.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ISTO NÃO É UM AGENTE, PELA MESMA RAZÃO QUE A EXTRAÇÃO NÃO É.                       ║
 * ║                                                                                       ║
 * ║ Um agente do registry tem allowlist de ferramentas, roteamento por vocabulário e flag ║
 * ║ própria. Um insight é UMA chamada, sem laço, com saída estruturada. O RPC fixa         ║
 * ║ `agent_id = 'insights.<modulo>'` para a trilha registrar a espécie sem inventar um    ║
 * ║ agente escolhível que ninguém escolhe.                                                 ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ═══════════════ OS INDICADORES ENTRAM COMO DADO, NUNCA COMO INSTRUÇÃO ═══════════════
 *
 * Os rótulos vêm dos módulos e podem carregar texto do dono — nome de categoria, de exercício,
 * de alimento. Eles viajam numa mensagem de papel `user`, dentro de `wrapUntrusted`. Isso é a
 * camada de comportamento.
 *
 * ⛔ **A defesa REAL é estrutural:** a saída é `insightDoModeloSchema` (Zod `.strict()`), e não
 * existe campo que signifique "execute" ou "apague". E o validador ainda recusa o texto por
 * dígito e por vocabulário depois.
 */

import { renderUntrusted, wrapUntrusted } from "@/lib/ai/security/untrusted";
import type { AiMessage } from "@/lib/ai/core/contracts";

import type { Indicador, ModuloDeInsight } from "./contracts";
import { VERSAO_DO_SCHEMA } from "./schema";

/**
 * A versão do prompt, gravada em `ai_runs.prompt_version` e em `ai_insights.prompt_version`.
 * A versão do SCHEMA entra junto: a forma pedida faz parte do que produziu aquele texto.
 */
export const INSIGHT_PROMPT_VERSION = "insight-v1";

export function versaoDoPromptDeInsight(): string {
  return `${INSIGHT_PROMPT_VERSION}+${VERSAO_DO_SCHEMA}`;
}

const NOME_DO_MODULO: Record<ModuloDeInsight, string> = {
  financeiro: "Financeiro",
  treinos: "Treinos",
  dieta: "Dieta e Alimentação",
};

/**
 * O prompt de SISTEMA.
 *
 * ⚠️ **A regra do dígito é dita de forma POSITIVA e mecânica** ("escreva `{{ind:x}}`"), e não
 * como proibição vaga ("não invente números"). Proibição vaga é o que o modelo negocia; uma
 * forma exata para escrever o número é o que ele obedece — e o que o validador consegue
 * conferir sem parser de português.
 *
 * ⚠️ **A proibição de tom é DESCRITA, nunca CITADA** (invariante 30 da 18-C): o teste de
 * vocabulário varre o texto inteiro do prompt e não distingue uso negado — e está certo,
 * porque a frase literal no contexto a torna mais provável de sair.
 */
export const INSIGHT_SYSTEM_PROMPT = `Você escreve uma observação curta, em português do Brasil, sobre números que o SISTEMA já mediu.

O QUE VOCÊ RECEBE
Uma lista de indicadores. Cada um tem: um id, um rótulo, um valor, uma unidade, o período que ele cobre, quantos registros entraram (n) e — quando existe — a regra de contagem usada. Alguns indicadores têm valor nulo: eles NÃO foram medidos, e o motivo vem escrito. Isso é diferente de terem dado zero.

COMO OS NÚMEROS ENTRAM NO SEU TEXTO
1. Você NUNCA escreve um número. Nem um dígito, em nenhum campo — nem valor, nem data, nem ano, nem quantidade de dias.
2. Para citar um número, escreva o marcador {{ind:ID}}, trocando ID pelo id exato do indicador. O sistema troca o marcador pelo valor formatado na hora de mostrar.
3. Só use ids que estão na lista recebida. Um id inventado faz a observação inteira ser descartada.
4. Não some, não subtraia, não divida e não converta nada. Se a comparação que você quer fazer não está na lista como indicador próprio, ela não existe — fale só do que está lá.
5. Um indicador com valor nulo pode ser citado: o sistema escreve "não medido" com o motivo. Nunca o trate como zero e nunca conclua nada a partir dele.

O QUE VOCÊ ESCREVE
- titulo: uma linha curta dizendo do que se trata.
- resumo: uma ou duas frases com o que os números mostram.
- explicacao: o raciocínio, ligando os indicadores citados. Quando um número vier com regra de contagem ou com ressalva de incompletude, mencione isso ao lado dele.
- evidencias: cada afirmação sua amarrada ao id do indicador que a sustenta.

TOM
- Informe. Descreva o que foi registrado. Não avalie a pessoa, não atribua falha, não aponte repetição e não use palavra que soe a repreensão.
- Não recomende, não sugira meta, não diga o que seria adequado e não prometa resultado. O sistema organiza e mostra; ele não receita.
- Dia, semana ou mês sem registro é ausência de registro. Não é zero, não é falta e não é desvio.
- Não dê diagnóstico, não prescreva dieta, treino nem medicação.
- Sem elogio, sem preâmbulo, sem repetir a pergunta.

SE NÃO HOUVER O QUE DIZER
Escreva uma observação honesta e pequena sobre o pouco que foi medido, citando os indicadores que existem. Não preencha com generalidade.`;

/**
 * A mensagem de papel `user` com os indicadores.
 *
 * ⚠️ O `map` é EXPLÍCITO: campo novo em `Indicador` não vai ao modelo sozinho. Minimização é
 * regra — menos campo é menos token, menos superfície de injeção e menos dado pessoal saindo
 * do sistema (`pickFields`, 18-B).
 */
export function montarMensagemDoInsight(entrada: {
  readonly modulo: ModuloDeInsight;
  readonly indicadores: readonly Indicador[];
}): AiMessage[] {
  const bloco = wrapUntrusted(
    "registro_do_usuario",
    `indicadores do módulo ${NOME_DO_MODULO[entrada.modulo]}`,
    entrada.indicadores.map((i) => ({
      id: i.id,
      rotulo: i.rotulo,
      valor: i.valor,
      ...(i.valor === null ? { nao_medido_porque: i.indisponivel_porque } : {}),
      unidade: i.unidade,
      qualidade: i.qualidade,
      ...(i.motivo_incompleto ? { motivo_incompleto: i.motivo_incompleto } : {}),
      periodo: `${i.periodo.de} a ${i.periodo.ate}`,
      n: i.n,
      ...(i.regra_de_contagem ? { regra_de_contagem: i.regra_de_contagem } : {}),
    })),
  );

  return [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `Escreva uma observação sobre o módulo ${NOME_DO_MODULO[entrada.modulo]} a partir dos indicadores abaixo.\n\n${renderUntrusted(bloco)}`,
        },
      ],
    },
  ];
}
