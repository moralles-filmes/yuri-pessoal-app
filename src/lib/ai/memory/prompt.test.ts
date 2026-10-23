/**
 * Fase 18-F · Bloco 3 — IA · A SEÇÃO DE MEMÓRIA DO PROMPT.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ESTE É O PONTO EM QUE TEXTO DO DONO ENTRA NO PROMPT SEM SER BLOCO NÃO CONFIÁVEL.      ║
 * ║                                                                                       ║
 * ║ As duas defesas, e as duas são testadas aqui:                                          ║
 * ║  1. a seção vem DEPOIS das travas e se declara como PREFERÊNCIA, dizendo por escrito   ║
 * ║     que não desliga regra e não autoriza ação (§6.4);                                  ║
 * ║  2. memória de módulo só entra com a chave DAQUELE módulo ligada (§6.5).               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import fs from "node:fs";
import path from "node:path";
import * as ts from "typescript";
import { describe, expect, it } from "vitest";
import { montarSystem } from "@/lib/ai/server/system-prompt";
import { TOOL_PERMISSIONS, type ToolPermission } from "@/lib/ai/tools/contracts";
import { TETO_DE_MEMORIAS_NO_PROMPT } from "./contracts";
import { blocoDeMemorias, memoriasParaOPrompt } from "./prompt";

const SERVER_DIR = path.resolve(__dirname, "..", "server");

const TODAS_DESLIGADAS = Object.fromEntries(
  TOOL_PERMISSIONS.map((p) => [p, false]),
) as Record<ToolPermission, boolean>;

const m = (id: string, conteudo: string, modulo: string | null = null) =>
  ({ id, conteudo, modulo }) as Parameters<typeof memoriasParaOPrompt>[0]["memorias"][number];

describe("memoriasParaOPrompt", () => {
  it("⛔ com allow_memory desligada, NENHUMA memória entra", () => {
    const r = memoriasParaOPrompt({
      memorias: [m("1", "Prefiro respostas curtas")],
      moduloDoAgente: null,
      permissions: { ...TODAS_DESLIGADAS, allow_memory: false },
      allowMemory: false,
    });
    expect(r).toEqual([]);
  });

  it("memória global entra em qualquer agente", () => {
    const r = memoriasParaOPrompt({
      memorias: [m("1", "Prefiro respostas curtas")],
      moduloDoAgente: "training",
      permissions: { ...TODAS_DESLIGADAS, allow_memory: true },
      allowMemory: true,
    });
    expect(r.map((x) => x.id)).toEqual(["1"]);
  });

  /** O orquestrador não tem módulo — e a memória global continua valendo lá. */
  it("memória global entra também no orquestrador, que não tem módulo", () => {
    const r = memoriasParaOPrompt({
      memorias: [m("1", "Me chame de Yuri"), m("2", "Prefiro treinar de manhã", "training")],
      moduloDoAgente: null,
      permissions: { ...TODAS_DESLIGADAS, allow_memory: true, allow_training: true },
      allowMemory: true,
    });
    expect(r.map((x) => x.id)).toEqual(["1"]);
  });

  it("memória de OUTRO módulo não entra", () => {
    const r = memoriasParaOPrompt({
      memorias: [m("1", "Prefiro treinar de manhã", "training")],
      moduloDoAgente: "nutrition",
      permissions: { ...TODAS_DESLIGADAS, allow_memory: true, allow_training: true },
      allowMemory: true,
    });
    expect(r).toEqual([]);
  });

  /**
   * ⛔ §6.5 — A CHAVE DO MÓDULO MANDA. Sem ela, desligar a leitura de Treinos deixaria a
   * preferência sobre Treinos continuar orientando a resposta, o que é ler pela porta dos
   * fundos: o dono desligou o módulo e o módulo continua falando.
   */
  it("memória de módulo NÃO entra com a chave daquele módulo desligada", () => {
    const r = memoriasParaOPrompt({
      memorias: [m("1", "Prefiro treinar de manhã", "training")],
      moduloDoAgente: "training",
      permissions: { ...TODAS_DESLIGADAS, allow_memory: true, allow_training: false },
      allowMemory: true,
    });
    expect(r).toEqual([]);
  });

  it("e entra com ela ligada", () => {
    const r = memoriasParaOPrompt({
      memorias: [m("1", "Prefiro treinar de manhã", "training")],
      moduloDoAgente: "training",
      permissions: { ...TODAS_DESLIGADAS, allow_memory: true, allow_training: true },
      allowMemory: true,
    });
    expect(r.map((x) => x.id)).toEqual(["1"]);
  });

  /**
   * ⚠️ `body` NÃO TEM AGENTE PRÓPRIO: quem atende é o de Treinos. Uma memória de `body` numa
   * conversa de Treinos exige `allow_body`, não `allow_training` — é a invariante 26 (a
   * permissão é do MÓDULO PEDIDO) aplicada à memória.
   */
  it("memória de body exige allow_body, e não a chave do agente que atende", () => {
    const entrada = {
      memorias: [m("1", "Prefiro medir o peso em jejum", "body")],
      moduloDoAgente: "body",
      allowMemory: true,
    };
    expect(
      memoriasParaOPrompt({
        ...entrada,
        permissions: { ...TODAS_DESLIGADAS, allow_memory: true, allow_training: true },
      }),
    ).toEqual([]);
    expect(
      memoriasParaOPrompt({
        ...entrada,
        permissions: { ...TODAS_DESLIGADAS, allow_memory: true, allow_body: true },
      }).map((x) => x.id),
    ).toEqual(["1"]);
  });
});

describe("blocoDeMemorias", () => {
  it("sem memória, devolve string vazia — nenhuma seção fantasma no prompt", () => {
    expect(blocoDeMemorias([])).toBe("");
  });

  it("declara que é PREFERÊNCIA e que não desliga regra nem autoriza nada", () => {
    const bloco = blocoDeMemorias([m("1", "Prefiro respostas curtas")]).toLowerCase();
    expect(bloco).toContain("prefer");
    expect(bloco).toContain("não desliga");
    expect(bloco).toContain("não autoriza");
    // §6.4, espelhando a invariante 21: preferência não é dado sobre os registros.
    expect(bloco).toContain("não são dado sobre os registros");
  });

  it("escreve a frase do dono, inteira", () => {
    expect(blocoDeMemorias([m("1", "Prefiro respostas curtas")])).toContain(
      "Prefiro respostas curtas",
    );
  });

  /** ⛔ TETO VISÍVEL — invariante 29 aplicada ao prompt. */
  it("corta no teto e DIZ que cortou", () => {
    const muitas = Array.from({ length: TETO_DE_MEMORIAS_NO_PROMPT + 5 }, (_, i) =>
      m(String(i), `Preferência ${i}`),
    );
    const bloco = blocoDeMemorias(muitas);
    expect(bloco).toContain(`${TETO_DE_MEMORIAS_NO_PROMPT} de ${muitas.length}`);
    expect(bloco).toContain(`Preferência ${TETO_DE_MEMORIAS_NO_PROMPT - 1}`);
    expect(bloco).not.toContain(`Preferência ${TETO_DE_MEMORIAS_NO_PROMPT}`);
  });

  /**
   * ⚠️ A asserção do rascunho era `not.toContain(" de ")`, e o texto fixo da seção tem " de "
   * em várias frases — ela seria vermelha sempre, e a "correção" seria mutilar o texto. O que
   * importa é a AUSÊNCIA DO AVISO DE CORTE, e é ele que se procura.
   */
  it("no teto exato, não diz que cortou", () => {
    const exatas = Array.from({ length: TETO_DE_MEMORIAS_NO_PROMPT }, (_, i) =>
      m(String(i), `Preferência ${i}`),
    );
    expect(blocoDeMemorias(exatas)).not.toContain("Mostrando ");
  });
});

/**
 * Código sem comentários, por um scanner de verdade (o do TypeScript), não por regex.
 *
 * Um regex que corta `//` no meio da linha engole a URL de uma string e o código depois dela;
 * o scanner só descarta comentário de fato. O teste positivo logo abaixo prova que ele não
 * está descartando código útil.
 */
function semComentarios(codigo: string): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    codigo,
  );
  let saida = "";
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue;
    }
    saida += scanner.getTokenText();
  }
  return saida;
}

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ A MEMÓRIA ENTRA POR ÚLTIMO, E A ORDEM É A GARANTIA (§6.4).                          ║
 * ║                                                                                       ║
 * ║ Uma frase do dono ACIMA das travas de segurança seria injeção com um passo humano no  ║
 * ║ meio: ele confirma um texto proposto a partir de um documento lido, e aquele texto    ║
 * ║ passa a valer mais que o prompt de segurança.                                          ║
 * ║                                                                                       ║
 * ║ A concatenação é UMA, em `server/system-prompt.ts` (`montarSystem`). Por ser função    ║
 * ║ pura, a ordem se prova pelo COMPORTAMENTO. A varredura de fonte fica só para garantir  ║
 * ║ que nenhum outro arquivo do servidor monta o `system` por fora dela.                    ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("montarSystem — a concatenação única do system", () => {
  it("põe a memória por último: base < bloco do servidor < memória", () => {
    const sistema = montarSystem({
      base: "BASE-DO-AGENTE",
      blocos: ["BLOCO-DO-SERVIDOR"],
      memorias: [m("1", "Prefiro respostas curtas")],
    });
    const iBase = sistema.indexOf("BASE-DO-AGENTE");
    const iBloco = sistema.indexOf("BLOCO-DO-SERVIDOR");
    const iMemoria = sistema.indexOf("Prefiro respostas curtas");

    expect(iBase).toBeGreaterThan(-1);
    expect(iBloco).toBeGreaterThan(iBase);
    expect(iMemoria).toBeGreaterThan(iBloco);
  });

  it("sem memória, é base + blocos, na ordem dada", () => {
    expect(montarSystem({ base: "B", blocos: ["X", "Y"], memorias: [] })).toBe("BXY");
  });
});

describe("a montagem do system no chat-runner", () => {
  /**
   * ⚠️ `blocoDeMemorias(` em UM arquivo só de `server/`, e é `system-prompt.ts`. Antes da Task 7
   * a varredura olhava o `chat-runner` inteiro, e a ordem vivia escrita nele; agora a ordem é
   * função, e este teste garante que ninguém a remonta por fora.
   */
  it("`blocoDeMemorias(` aparece em UM arquivo de src/lib/ai/server/, e é system-prompt.ts", () => {
    const usam: string[] = [];
    for (const nome of fs.readdirSync(SERVER_DIR)) {
      if (!nome.endsWith(".ts") || nome.endsWith(".test.ts")) continue;
      const codigo = semComentarios(fs.readFileSync(path.join(SERVER_DIR, nome), "utf8"));
      if (/\bblocoDeMemorias\s*\(/.test(codigo)) usam.push(nome);
    }
    expect(usam).toEqual(["system-prompt.ts"]);
  });

  /** Controle positivo: o scanner não pode ter descartado a chamada que o teste procura. */
  it("controle: o scanner enxerga a chamada real dentro de system-prompt.ts", () => {
    const codigo = semComentarios(
      fs.readFileSync(path.join(SERVER_DIR, "system-prompt.ts"), "utf8"),
    );
    expect(codigo).toMatch(/\bblocoDeMemorias\s*\(/);
  });

  it("o chat-runner monta o system SÓ por montarSystem, com a memória selecionada", () => {
    const runner = semComentarios(
      fs.readFileSync(path.join(SERVER_DIR, "chat-runner.ts"), "utf8"),
    );
    expect(runner.match(/\bmontarSystem\(/g) ?? []).toHaveLength(1);
    expect(runner).toMatch(/montarSystem\(\{[\s\S]*?memorias:\s*selecionadas/);
  });

  /** O caminho do PLANO usa o system do próprio plano como base — nunca um agente do registry. */
  it("o caminho do PLANO usa o system do plano como base", () => {
    const runner = fs.readFileSync(path.join(SERVER_DIR, "chat-runner.ts"), "utf8");
    expect(runner).toContain("systemBase: input.plano.system");
  });

  /** A leitura é condicionada à chave — nenhuma consulta quando o dono não autorizou. */
  it("as memórias só são lidas com allow_memory ligada", () => {
    const runner = fs.readFileSync(path.join(SERVER_DIR, "chat-runner.ts"), "utf8");
    expect(runner).toMatch(
      /permissions\.allow_memory[\s\S]{0,120}getMemoriasVigentes\(/,
    );
  });
});
