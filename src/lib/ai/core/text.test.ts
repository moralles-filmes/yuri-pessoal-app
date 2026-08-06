/**
 * Fase 18-B — IA · O texto de uma mensagem, para MEDIR.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O DEFEITO QUE ESTE ARQUIVO EXISTE PARA IMPEDIR                                        ║
 * ║                                                                                       ║
 * ║ `AiMessage.content` virou união na 18-B. Quem estimava tokens fazia                    ║
 * ║ `mensagens.map(m => m.content).join("\n")` — e uma lista de partes vira                ║
 * ║ `[object Object]`: 15 caracteres onde havia um bloco de milhares. A reserva sairia     ║
 * ║ MENOR que o custo real, sem exceção, sem log e sem teste vermelho.                     ║
 * ║                                                                                       ║
 * ║ Por isso o teste central não é "extrai o texto": é que o resultado NÃO contém          ║
 * ║ `[object Object]` e que ele CRESCE com o tamanho do dado.                              ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { AiMessage } from "./contracts";
import { normalizarTexto, textoDaMensagem, textoDasMensagens } from "./text";

describe("normalizarTexto", () => {
  it("tira acento sem mudar o comprimento", () => {
    const original = "Tríceps à Máquina";
    const normal = normalizarTexto(original);
    expect(normal).toBe("triceps a maquina");
    expect(normal.length).toBe(original.length);
  });
});

describe("textoDaMensagem", () => {
  it("devolve o próprio texto quando o conteúdo é string", () => {
    expect(textoDaMensagem({ role: "user", content: "qual foi meu treino?" })).toBe(
      "qual foi meu treino?",
    );
  });

  it("junta as partes de texto do assistente", () => {
    const m: AiMessage = {
      role: "assistant",
      content: [
        { type: "text", text: "vou consultar" },
        { type: "text", text: "seu histórico" },
      ],
    };
    expect(textoDaMensagem(m)).toBe("vou consultar\nseu histórico");
  });

  it("o pedido de ferramenta entra com os argumentos, não como [object Object]", () => {
    const m: AiMessage = {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          callId: "c1",
          toolName: "training.get_volume",
          input: { dias: 30 },
        },
      ],
    };
    const texto = textoDaMensagem(m);
    expect(texto).not.toContain("[object Object]");
    expect(texto).toContain("training.get_volume");
    expect(texto).toContain('"dias":30');
  });

  it("o resultado de ferramenta entra INTEIRO — é ele que faz o contexto crescer", () => {
    const bloco = "x".repeat(4000);
    const m: AiMessage = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          callId: "c1",
          toolName: "training.get_volume",
          output: { texto: bloco },
          isError: false,
        },
      ],
    };
    const texto = textoDaMensagem(m);
    expect(texto).not.toContain("[object Object]");
    expect(texto.length).toBeGreaterThan(4000);
  });

  it("resultado maior produz texto maior — a estimativa acompanha o dado", () => {
    const monta = (tamanho: number): AiMessage => ({
      role: "tool",
      content: [
        {
          type: "tool-result",
          callId: "c1",
          toolName: "training.get_volume",
          output: { texto: "x".repeat(tamanho) },
          isError: false,
        },
      ],
    });
    expect(textoDaMensagem(monta(8000)).length).toBeGreaterThan(
      textoDaMensagem(monta(100)).length + 7000,
    );
  });

  it("valor circular não derruba a medição — degrada, mas não lança", () => {
    const circular: Record<string, unknown> = {};
    circular.eu = circular;
    const m: AiMessage = {
      role: "tool",
      content: [
        {
          type: "tool-result",
          callId: "c1",
          toolName: "t",
          output: circular,
          isError: false,
        },
      ],
    };
    expect(() => textoDaMensagem(m)).not.toThrow();
  });
});

/**
 * ⚠️ VARREDURA LÉXICA, e assumidamente estreita: ela pega A FORMA EXATA que produziu o
 * defeito (`.map(m => m.content).join(...)` sobre a união), não toda maneira imaginável de
 * reintroduzi-lo. Existe porque o defeito é SILENCIOSO: não lança, não loga, não deixa teste
 * vermelho — só faz a reserva ficar menor que o custo. Um alarme barato para uma falha cara.
 */
describe("ninguém volta a concatenar `content` direto", () => {
  function arquivos(dir: string): string[] {
    const saida: string[] = [];
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) saida.push(...arquivos(completo));
      else if (/\.tsx?$/.test(entrada.name) && !entrada.name.endsWith(".test.ts")) {
        saida.push(completo);
      }
    }
    return saida;
  }

  /**
   * Comentário é onde o defeito é EXPLICADO — em `core/text.ts` e no chat-runner o padrão
   * errado aparece escrito por extenso, de propósito. Sem tirar comentário, o teste acusaria
   * a própria documentação e a "correção" seria apagar a explicação.
   */
  function semComentarios(codigo: string): string {
    return codigo
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((linha) => !/^\s*(\/\/|\*)/.test(linha))
      .join("\n");
  }

  it("nenhum arquivo do módulo de IA faz `.content).join(`", () => {
    const raiz = path.resolve(__dirname, "..");
    const violacoes = arquivos(raiz).filter((arquivo) =>
      /\.content\s*\)\s*\.join\(/.test(semComentarios(fs.readFileSync(arquivo, "utf8"))),
    );
    expect(violacoes.map((v) => path.relative(raiz, v))).toEqual([]);
  });
});

describe("textoDasMensagens", () => {
  it("mistura string e partes sem perder nenhuma das duas", () => {
    const mensagens: AiMessage[] = [
      { role: "user", content: "pergunta do usuário" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "consultando" },
          { type: "tool-call", callId: "c1", toolName: "training.get_records", input: {} },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            callId: "c1",
            toolName: "training.get_records",
            output: { texto: "RECORDE DE SUPINO 100 KG" },
            isError: false,
          },
        ],
      },
    ];

    const texto = textoDasMensagens(mensagens);
    expect(texto).toContain("pergunta do usuário");
    expect(texto).toContain("consultando");
    expect(texto).toContain("training.get_records");
    expect(texto).toContain("RECORDE DE SUPINO 100 KG");
    expect(texto).not.toContain("[object Object]");
  });
});
