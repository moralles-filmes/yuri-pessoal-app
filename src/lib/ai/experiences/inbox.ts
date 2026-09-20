/**
 * Fase 18-F · Bloco 4 — IA · A CAIXA DE ENTRADA INTELIGENTE.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ ELA NÃO É UM PANORAMA — E POR ISSO NÃO ESTÁ NO CATÁLOGO.                            ║
 * ║                                                                                       ║
 * ║ Os três panoramas têm leitura DIRIGIDA: o servidor sabe o que ler antes de o dono      ║
 * ║ abrir a boca. A caixa de entrada é o contrário: ela parte de um texto que só o dono    ║
 * ║ tem, e classificar o destino é justamente o que o modelo precisa decidir (§7.5).      ║
 * ║                                                                                       ║
 * ║ ⛔ E é por isso que ela usa o LAÇO NORMAL. Passá-la pelo runner dirigido exigiria um   ║
 * ║ agente com as ferramentas dos cinco módulos de escrita ao mesmo tempo — um "agente de  ║
 * ║ tudo", que é exatamente o que a allowlist por agente existe para impedir. No laço      ║
 * ║ normal, `routeAgent` já entrega a pergunta ao especialista que TEM as ferramentas      ║
 * ║ certas, e só elas.                                                                    ║
 * ║                                                                                       ║
 * ║ ⚠️ Ela herda a invariante 27: palavra ambígua DESLIGA o roteamento em vez de errá-lo,  ║
 * ║ e a pergunta cai no orquestrador com `AMBIGUO` — que não tem ferramenta nenhuma e      ║
 * ║ portanto pergunta. "Na dúvida ela pergunta" não é uma promessa do prompt: é o que      ║
 * ║ sobra para o orquestrador poder fazer.                                                ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * ⚠️ Este bloco entra no prompt de sistema ANTES da memória (invariante 98), que é sempre a
 * última seção. `memory/prompt.test.ts` varre essa ordem sobre a fonte do `chat-runner`.
 */

export const VERSAO_DA_CAIXA_DE_ENTRADA = "caixa-v1";

export const BLOCO_DA_CAIXA_DE_ENTRADA = `

---

MODO CAIXA DE ENTRADA

A mensagem do dono é um item solto para guardar no lugar certo — não é uma pergunta.

1. Diga em uma frase onde esse item pertence e por quê.
2. Se houver uma alteração óbvia a preparar, prepare-a com a ferramenta adequada e diga que
   ela está aguardando a confirmação dele na tela. Nada é aplicado por você.
3. Se o item couber em mais de um lugar, ou se algum dado essencial não vier na mensagem,
   PERGUNTE. Não escolha por ele e não preencha a lacuna com suposição.
4. Se o destino for um módulo cuja ferramenta não chegou até aqui, diga qual é o destino e
   que a chave de leitura daquele módulo está desligada.
`;

/**
 * O que vai para `ai_runs.prompt_version` quando o modo está ligado.
 *
 * ⛔ O modo MUDA o comportamento, então a coluna tem de contá-lo. Sem isto, duas respostas
 * gravadas sob `todo-v1` teriam vindo de prompts diferentes — e aquela coluna existe
 * justamente para dizer qual texto produziu qual resposta.
 */
export function versaoComCaixaDeEntrada(versaoDoAgente: string): string {
  return `${versaoDoAgente}+${VERSAO_DA_CAIXA_DE_ENTRADA}`;
}
