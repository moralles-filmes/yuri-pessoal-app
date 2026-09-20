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
import { describe, expect, it } from "vitest";
import { TOOL_PERMISSIONS, type ToolPermission } from "@/lib/ai/tools/contracts";
import { TETO_DE_MEMORIAS_NO_PROMPT } from "./contracts";
import { blocoDeMemorias, memoriasParaOPrompt } from "./prompt";

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
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ A MEMÓRIA ENTRA POR ÚLTIMO, E A ORDEM É A GARANTIA (§6.4).                          ║
 * ║                                                                                       ║
 * ║ Uma frase do dono ACIMA das travas de segurança seria injeção com um passo humano no  ║
 * ║ meio: ele confirma um texto proposto a partir de um documento lido, e aquele texto    ║
 * ║ passa a valer mais que o prompt de segurança.                                          ║
 * ║                                                                                       ║
 * ║ Varredura de fonte porque a ordem é uma propriedade da CONCATENAÇÃO, e `chat-runner`  ║
 * ║ não é testável sem provedor. É a mesma técnica de `chat-events.test.ts`.               ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("a ordem da montagem do system prompt", () => {
  const runner = fs.readFileSync(
    path.join(process.cwd(), "src/lib/ai/server/chat-runner.ts"),
    "utf8",
  );

  /**
   * ⚠️ 18-F Bloco 4 — a montagem foi PARTIDA EM DUAS (`perfil.systemBase`, depois
   * `+ blocoDeMemorias`) para o panorama poder trazer o próprio prompt de redação no lugar
   * do perfil do agente. A ordem que este teste protege não mudou; o que mudou é onde ela
   * está escrita, e o bloco da caixa de entrada entrou no meio.
   */
  it("blocoDeMemorias vem DEPOIS do perfil, do roteamento e da caixa de entrada", () => {
    const base = runner.indexOf("buildSystemPrompt(agent");
    const roteamento = runner.indexOf("blocoDeContextoDeRoteamento(");
    // A USADA, não a importada: o nome aparece primeiro no `import` do topo do arquivo.
    const caixa = runner.indexOf("? BLOCO_DA_CAIXA_DE_ENTRADA");
    const memoria = runner.indexOf("const system = perfil.systemBase + blocoDeMemorias(");

    expect(base, "buildSystemPrompt não encontrado").toBeGreaterThan(-1);
    expect(caixa, "o bloco da caixa de entrada não encontrado").toBeGreaterThan(-1);
    expect(memoria, "a montagem final do system não encontrada").toBeGreaterThan(-1);
    expect(base).toBeLessThan(roteamento);
    expect(roteamento).toBeLessThan(caixa);
    expect(caixa).toBeLessThan(memoria);
  });

  /**
   * ⛔ 18-F Bloco 4 — O PANORAMA TAMBÉM CARREGA A MEMÓRIA.
   *
   * "Planejar meu dia" respeitando uma preferência salva é onde a memória do Bloco 3
   * justifica existir. Um `system` de panorama montado sem ela — que é o que a primeira
   * versão do plano desta task esboçava — faria o panorama nascer sem as preferências que
   * ele existe para respeitar. A concatenação é UMA, e os dois caminhos passam por ela.
   */
  it("o caminho do PLANO passa pela mesma concatenação, e a memória é a última", () => {
    const montagem = runner.indexOf("const system = perfil.systemBase + blocoDeMemorias(");
    expect(montagem).toBeGreaterThan(-1);

    // Não existe um segundo lugar que monte `system` — nem no ramo do plano.
    const ocorrencias = runner.match(/blocoDeMemorias\(/g) ?? [];
    expect(ocorrencias, "blocoDeMemorias aparece mais de uma vez").toHaveLength(1);

    // E o `systemBase` do plano vem do próprio plano, não de um agente do registry.
    expect(runner).toContain("systemBase: input.plano.system");
  });

  /** A leitura é condicionada à chave — nenhuma consulta quando o dono não autorizou. */
  it("as memórias só são lidas com allow_memory ligada", () => {
    expect(runner).toMatch(
      /permissions\.allow_memory[\s\S]{0,120}getMemoriasVigentes\(/,
    );
  });
});
