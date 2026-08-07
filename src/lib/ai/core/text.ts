/**
 * Fase 18-B — IA · Normalização de texto. Neutra, sem dono.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ POR QUE ISTO NÃO MORA NO ROTEADOR (nem no adapter de Treinos)                         ║
 * ║                                                                                       ║
 * ║ Dois consumidores precisam da MESMA normalização, e nenhum dos dois é dono dela:      ║
 * ║                                                                                       ║
 * ║  • `agents/routing.ts` normaliza a mensagem e depois procura a palavra com FRONTEIRA  ║
 * ║    (`(^|[^a-z0-9])palavra([^a-z0-9]|$)`) — "serie" não pode casar dentro de "series-  ║
 * ║    tv".                                                                                ║
 * ║  • `tools/adapters/training.ts` normaliza o filtro e procura por SUBSTRING            ║
 * ║    (`.includes`) no nome do exercício — "triceps" tem de encontrar "Tríceps testa".   ║
 * ║                                                                                       ║
 * ║ ⚠️ NÃO É A MESMA BUSCA. O que os dois compartilham é só o preparo do texto: tirar     ║
 * ║ acento e baixar a caixa. Ter isso duplicado é que seria o problema — "triceps" casaria ║
 * ║ num lugar e não no outro. A decisão de COMO procurar continua sendo de cada um.        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Puro. Nenhum I/O, nenhuma dependência de camada.
 */

import type { AiContentPart, AiMessage } from "./contracts";

/**
 * Tira acento SEM mudar o comprimento, e baixa a caixa.
 *
 * ⚠️ O intervalo dos caracteres combinantes (U+0300–U+036F, diacríticos que o NFD separa
 * da letra-base) é escrito com escape Unicode explícito (`\u0300-\u036f`), nunca com os
 * caracteres combinantes literais: literais correm o risco de chegar corrompidos por
 * cópia/colagem entre editores e encodings, e o bug some no próprio código-fonte sem
 * lançar erro nenhum — a regex só deixa de casar.
 *
 * O comprimento é preservado porque quem procura com regex de fronteira depende de os
 * índices do texto normalizado ainda corresponderem aos do original (a mesma disciplina da
 * normalização do TO-DO, em `src/lib/todo/parse.ts`).
 */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O TEXTO DE UMA MENSAGEM, PARA MEDIR — E POR QUE ISSO PRECISA EXISTIR EM `core/`.      ║
 * ║                                                                                       ║
 * ║ `AiMessage.content` virou união (`string | AiContentPart[]`) na 18-B. Quem estimava   ║
 * ║ tokens fazia `mensagens.map(m => m.content).join("\n")` — que, com partes, produz      ║
 * ║ `[object Object]`: 15 caracteres no lugar de um bloco de milhares. A reserva sairia    ║
 * ║ MENOR que o custo real, sem erro, sem aviso e sem teste vermelho.                      ║
 * ║                                                                                       ║
 * ║ Isto NÃO é o texto "para mostrar ao usuário": é o texto para MEDIR. Por isso o pedido  ║
 * ║ de ferramenta e o resultado entram serializados — eles ocupam contexto e são pagos.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
function serializar(valor: unknown): string {
  // O que passa por aqui já é JSON por contrato (`ToolOutput` é serializado pelo executor
  // antes de virar bloco). O `try` é rede: um valor circular derrubaria a estimativa ANTES
  // da admissão, e perder a conversa inteira por causa de uma MEDIÇÃO seria desproporcional.
  try {
    return JSON.stringify(valor ?? null) ?? "";
  } catch {
    return "[valor não serializável]";
  }
}

export function textoDaParte(parte: AiContentPart): string {
  if (parte.type === "text") return parte.text;
  if (parte.type === "tool-call") {
    return `${parte.toolName} ${serializar(parte.input)}`;
  }
  return `${parte.toolName} ${serializar(parte.output)}`;
}

export function textoDaMensagem(mensagem: AiMessage): string {
  return typeof mensagem.content === "string"
    ? mensagem.content
    : mensagem.content.map(textoDaParte).join("\n");
}

/** O prompt inteiro como texto, para a estimativa de tokens de entrada. */
export function textoDasMensagens(mensagens: readonly AiMessage[]): string {
  return mensagens.map(textoDaMensagem).join("\n");
}
