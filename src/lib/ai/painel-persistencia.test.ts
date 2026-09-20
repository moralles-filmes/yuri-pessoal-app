/**
 * Fase 18-F · Bloco 2 — IA · O ESTADO DA CONVERSA DO PAINEL VIVE FORA DA GAVETA.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTE TESTE EXISTE POR CAUSA DE UM DEFEITO REAL, RELATADO PELO DONO EM 2026-09-20:     ║
 * ║ *"quando manda uma pergunta e fecha o painel, a pergunta some"*.                       ║
 * ║                                                                                       ║
 * ║ O plano do bloco afirmava que `useLazyDialog` fazia o streaming sobreviver ao          ║
 * ║ fechamento. Ele NÃO faz, e a diferença é sutil: o hook mantém montado o COMPONENTE DO  ║
 * ║ PAINEL, mas o `SheetContent` do Radix é embrulhado em                                  ║
 * ║ `<Presence present={forceMount || context.open}>` — sem `forceMount`, tudo que está    ║
 * ║ DENTRO da gaveta é desmontado ao fechar. O `ChatClient` morava ali, e com ele:         ║
 * ║                                                                                       ║
 * ║   1. o `useState` das bolhas  → a pergunta sumia da tela;                              ║
 * ║   2. o cleanup `abortRef.current?.abort()` → a RESPOSTA EM ANDAMENTO ERA CANCELADA,   ║
 * ║      então o selo do botão nunca chegava a aparecer;                                   ║
 * ║   3. o `conversationId` → reabrir começava outra conversa.                             ║
 * ║                                                                                       ║
 * ║ ⛔ `forceMount` NÃO é a saída: `RemoveScroll`, `hideOthers` e `FocusScope` ficam        ║
 * ║ dentro do mesmo `Presence`, e o app inteiro ficaria com rolagem travada e              ║
 * ║ `aria-hidden` permanentes. A saída é a que o React manda — SUBIR O ESTADO.             ║
 * ║                                                                                       ║
 * ║ Como o projeto não tem infraestrutura de teste de componente (ambiente `node`, zero    ║
 * ║ `.test.tsx` — invariante 25), a fronteira é verificada no CÓDIGO-FONTE, como já faz    ║
 * ║ `chat-events.test.ts`. É fraco, e é melhor que nada: teria pegado este defeito.        ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..", "..");

/**
 * A varredura olha CÓDIGO, não prosa. Sem isto, a primeira versão deste teste casou com o
 * `<Sheet>` citado no comentário que explica a regra — e o comentário existe justamente
 * porque a regra é importante. Um teste que se deixa enganar pela própria documentação
 * reprovaria o conserto e aprovaria a volta do defeito.
 */
function semComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const painel = semComentarios(
  fs.readFileSync(
    path.join(SRC, "components", "ai", "floating-assistant-panel.tsx"),
    "utf8",
  ),
);
const chat = semComentarios(
  fs.readFileSync(path.join(SRC, "components", "ai", "chat-client.tsx"), "utf8"),
);

describe("18-F Bloco 2 — a conversa do painel sobrevive ao fechamento", () => {
  it("a leitura encontrou os dois arquivos de verdade, e sobrou código depois da limpeza", () => {
    // Sem isto, um caminho errado — ou um `semComentarios` que comesse demais — transformaria
    // todo `not.toContain` abaixo em tautologia.
    expect(painel).toContain("FloatingAssistantPanel");
    expect(painel).toContain("<SheetContent");
    expect(chat).toContain("consumirSse");
    expect(chat).toContain("AbortController");
  });

  it("o chat oferece o motor e a vista separados", () => {
    // Sem os dois exports não há como o painel montar a vista dentro da gaveta e guardar o
    // estado fora dela — e a única alternativa seria um SEGUNDO chat, que o projeto proíbe.
    expect(chat).toMatch(/export function useConversaDaIa\b/);
    expect(chat).toMatch(/export function ChatView\b/);
    // A porta antiga continua de pé: `/ia` não muda de import por causa deste conserto.
    expect(chat).toMatch(/export function ChatClient\b/);
  });

  it("o motor do painel nasce ANTES do <Sheet>, nunca dentro dele", () => {
    const motor = painel.indexOf("useConversaDaIa(");
    const gaveta = painel.indexOf("<Sheet");
    expect(motor, "o painel não chama `useConversaDaIa`").toBeGreaterThan(-1);
    expect(gaveta, "o painel não renderiza `<Sheet`").toBeGreaterThan(-1);
    expect(
      motor,
      "o estado da conversa é criado dentro da gaveta — o Radix o desmonta ao fechar",
    ).toBeLessThan(gaveta);
  });

  it("o painel não monta `ChatClient`, que criaria o estado dentro da gaveta", () => {
    // `ChatClient` é o invólucro que CHAMA o hook por dentro. Renderizá-lo aqui devolveria o
    // defeito inteiro, e o teste anterior continuaria verde se alguém deixasse os dois.
    expect(painel).not.toContain("<ChatClient");
  });

  it("abrir o painel reconsulta a prontidão, em vez de confiar no que cacheou", () => {
    /*
      O OUTRO LADO DA MOEDA. O painel agora sobrevive à sessão inteira — logo, o que ele leu
      UMA vez na montagem envelhece junto com ele. São dois prejuízos:

        1. o dono configura um provedor em `/ia/configuracoes`, volta por navegação de
           cliente (que não remonta a casca) e o painel continua dizendo que não dá para
           conversar — para sempre, até um recarregamento completo;
        2. `estadoDoPainelDaIa` é quem chama `reconcileOwnRuns()` (invariante 92). Preso à
           montagem, o gatilho preguiçoso dispararia 1× por carregamento de página, e não a
           cada vez que o dono abre o chat.

      Reconsultar durante um streaming é seguro: a reconciliação só alcança run com heartbeat
      vencido há 5 min (`LEASE_MINUTOS`), e um streaming vivo bate a cada 10 s.
    */
    const chamada = painel.indexOf("estadoDoPainelDaIa()");
    expect(chamada, "o painel não chama `estadoDoPainelDaIa`").toBeGreaterThan(-1);

    const deps = painel.slice(chamada).match(/\}, \[([^\]]*)\]\);/);
    expect(deps, "não achei o array de dependências do efeito").not.toBeNull();
    expect(
      deps?.[1],
      "o efeito está preso à montagem — abrir o painel não reconsulta nada",
    ).toContain("aberto");
  });

  it("o cancelamento por desmontagem pertence ao motor, não à vista", () => {
    // É a linha 2 do defeito. Se `abortRef` (e o efeito que o aborta ao desmontar) voltar para
    // dentro de `ChatView`, fechar a gaveta cancela a resposta de novo — a pergunta ficaria na
    // tela e a resposta morreria pela metade, que é pior, porque parece que funcionou.
    const vista = chat.indexOf("export function ChatView");
    expect(vista).toBeGreaterThan(-1);
    expect(chat.slice(vista)).not.toContain("abortRef");
  });
});
