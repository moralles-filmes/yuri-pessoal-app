/**
 * Fase 18-F · Bloco 3 — IA · Os commands de Memória.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ O QUE ESTE ARQUIVO GUARDA: **o dono lê a FRASE EXATA antes de confirmar, e o inverso   ║
 * ║ do "lembrar" não apaga nada.**                                                         ║
 * ║                                                                                       ║
 * ║ A primeira metade é o que torna "nada sensível é salvo automaticamente" verdadeiro por ║
 * ║ construção — nada é salvo automaticamente, e o que ele confirma é o texto que está no  ║
 * ║ cartão. A segunda é a invariante 48: o desfazer PROPÕE, e o que ele propõe tem de ser  ║
 * ║ proporcional. Desfazer um "lembrar" esquece; apagar de vez continua sendo botão dele.  ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MemoriaNaTela } from "@/lib/ai/memory/queries";

let memorias: MemoriaNaTela[] = [];

vi.mock("@/lib/ai/memory/queries", () => ({
  getMemorias: async () => memorias,
}));

vi.mock("@/lib/format", async (original) => {
  const real = await original<typeof import("@/lib/format")>();
  return { ...real, hojeISO: () => "2026-09-20" };
});

const {
  esquecerPreferenciaEntrada,
  lembrarPreferenciaEntrada,
  preverEsquecerPreferencia,
  preverLembrarPreferencia,
} = await import("./memory-preview");
const { EfeitoImpossivel } = await import("../contracts");
const { findCommand } = await import("./index");

const ID = "11111111-2222-4333-8444-555555555555";
const CTX = { supabase: {}, userId: "dono" } as never;

const memoria = (extra: Partial<MemoriaNaTela> = {}): MemoriaNaTela => ({
  id: ID,
  conteudo: "Prefiro respostas curtas",
  modulo: null,
  expiresAt: null,
  origem: "dono",
  criadaEm: "2026-09-01T09:00:00Z",
  estado: "vigente",
  ...extra,
});

beforeEach(() => {
  memorias = [];
});

describe("a entrada é fechada", () => {
  it("aceita conteúdo + módulo + prazo, e recusa campo a mais", () => {
    expect(lembrarPreferenciaEntrada.safeParse({ conteudo: "Me chame de Yuri" }).success).toBe(
      true,
    );
    expect(
      lembrarPreferenciaEntrada.safeParse({
        conteudo: "Prefiro treinar de manhã",
        modulo: "training",
        expira_em: "2026-12-31",
      }).success,
    ).toBe(true);

    // ⛔ `user_id` NUNCA está nos schemas de entrada — invariante 2, e `.strict()` o recusa.
    for (const campo of ["user_id", "origem", "id", "memoria_id"]) {
      expect(
        lembrarPreferenciaEntrada.safeParse({ conteudo: "x", [campo]: ID }).success,
        campo,
      ).toBe(false);
    }
  });

  it("recusa módulo fora do vocabulário, prazo mal formado e conteúdo longo demais", () => {
    expect(
      lembrarPreferenciaEntrada.safeParse({ conteudo: "x", modulo: "memory" }).success,
    ).toBe(false);
    expect(
      lembrarPreferenciaEntrada.safeParse({ conteudo: "x", expira_em: "31/12/2026" }).success,
    ).toBe(false);
    expect(
      lembrarPreferenciaEntrada.safeParse({ conteudo: "a".repeat(301) }).success,
    ).toBe(false);
  });

  it("o esquecer aceita só um uuid", () => {
    expect(esquecerPreferenciaEntrada.safeParse({ memoria_id: ID }).success).toBe(true);
    expect(esquecerPreferenciaEntrada.safeParse({ memoria_id: "abc" }).success).toBe(false);
    expect(
      esquecerPreferenciaEntrada.safeParse({ memoria_id: ID, conteudo: "x" }).success,
    ).toBe(false);
  });
});

describe("preverLembrarPreferencia", () => {
  /** ⛔ A FRASE EXATA no resumo: é o que o dono lê antes de confirmar. */
  it("mostra a frase que será salva, já normalizada", async () => {
    const efeito = await preverLembrarPreferencia(CTX, {
      conteudo: "  Prefiro   respostas curtas  ",
    });
    expect(efeito.command).toBe("lembrarPreferencia");
    expect(efeito.previsao.resumo).toContain('"Prefiro respostas curtas"');
    // O payload leva a frase normalizada — é ela que entra no hash e é ela que será gravada.
    expect((efeito.payload as { conteudo: string }).conteudo).toBe("Prefiro respostas curtas");
  });

  it("declara o alcance e o prazo", async () => {
    const semModulo = await preverLembrarPreferencia(CTX, { conteudo: "Me chame de Yuri" });
    expect(semModulo.previsao.linhas).toContainEqual({
      rotulo: "Vale para",
      valor: "todas as conversas",
    });
    expect(semModulo.previsao.linhas).toContainEqual({ rotulo: "Prazo", valor: "sem prazo" });

    const comModulo = await preverLembrarPreferencia(CTX, {
      conteudo: "Prefiro treinar de manhã",
      modulo: "training",
    });
    expect(comModulo.previsao.ressalvas.join(" ")).toContain("só entra nas conversas daquele");
  });

  /** A ressalva diz o que a memória É no prompt — preferência, nunca regra (§6.4). */
  it("declara que é preferência e que não desliga regra nem autoriza leitura", async () => {
    const efeito = await preverLembrarPreferencia(CTX, { conteudo: "Prefiro respostas curtas" });
    const ressalvas = efeito.previsao.ressalvas.join(" ");
    expect(ressalvas).toContain("PREFERÊNCIA");
    expect(ressalvas).toContain("não desliga");
    expect(ressalvas).toContain("não autoriza");
  });

  /**
   * ⛔ A FORMA É CONFERIDA NA PREVISÃO TAMBÉM. Sem isto, o dono confirmaria uma proposta que o
   * serviço recusaria depois, e a ação apareceria em `/ia/acoes` como falha sem explicação.
   */
  it("recusa o que a forma recusa, com o motivo em pt-BR", async () => {
    for (const conteudo of [
      "veja em https://exemplo.com",
      "guarde sk-proj-7aQ2ZxLm90PdRt41VbNc",
      "a".repeat(301),
      "uma linha\noutra linha",
    ]) {
      await expect(
        preverLembrarPreferencia(CTX, { conteudo }),
        conteudo.slice(0, 20),
      ).rejects.toThrow(EfeitoImpossivel);
    }
  });

  it("recusa prazo no passado e no próprio dia de hoje", async () => {
    for (const expira_em of ["2026-09-19", "2026-09-20"]) {
      await expect(
        preverLembrarPreferencia(CTX, { conteudo: "Vale até a viagem", expira_em }),
        expira_em,
      ).rejects.toThrow(/data futura/);
    }
    // Amanhã passa.
    const ok = await preverLembrarPreferencia(CTX, {
      conteudo: "Vale até a viagem",
      expira_em: "2026-09-21",
    });
    expect(ok.previsao.linhas).toContainEqual({ rotulo: "Prazo", valor: "2026-09-21" });
  });

  it("recusa memória repetida, ignorando caixa e espaço", async () => {
    memorias = [memoria({ conteudo: "Prefiro respostas curtas" })];
    await expect(
      preverLembrarPreferencia(CTX, { conteudo: "  prefiro   RESPOSTAS curtas " }),
    ).rejects.toThrow(/já está salva/);
  });

  /**
   * ⚠️ MAS A ESQUECIDA NÃO BLOQUEIA. O dono já disse que não quer aquela frase orientando o
   * assistente; propô-la de novo é ele reconsiderando, e recusar seria o sistema guardando
   * rancor de uma decisão que ele tomou e pode rever.
   */
  it("memória esquecida NÃO bloqueia uma proposta igual", async () => {
    memorias = [memoria({ conteudo: "Prefiro respostas curtas", estado: "esquecida" })];
    const efeito = await preverLembrarPreferencia(CTX, { conteudo: "Prefiro respostas curtas" });
    expect(efeito.command).toBe("lembrarPreferencia");
  });

  /** Desativada e expirada continuam existindo — propor a mesma frase duplicaria a linha. */
  it("memória desativada ou expirada BLOQUEIA a repetida", async () => {
    for (const estado of ["desativada", "expirada"] as const) {
      memorias = [memoria({ conteudo: "Prefiro respostas curtas", estado })];
      await expect(
        preverLembrarPreferencia(CTX, { conteudo: "Prefiro respostas curtas" }),
        estado,
      ).rejects.toThrow(/já está salva/);
    }
  });

  it("o mesmo pedido produz o mesmo efeito, duas vezes", async () => {
    const a = await preverLembrarPreferencia(CTX, { conteudo: "Me chame de Yuri" });
    const b = await preverLembrarPreferencia(CTX, { conteudo: "Me chame de Yuri" });
    expect(a).toEqual(b);
  });
});

describe("preverEsquecerPreferencia", () => {
  it("mostra a frase que vai parar de orientar e diz que ela CONTINUA legível", async () => {
    memorias = [memoria()];
    const efeito = await preverEsquecerPreferencia(CTX, { memoria_id: ID });

    expect(efeito.previsao.resumo).toContain("Prefiro respostas curtas");
    expect(efeito.entidades).toEqual([{ tipo: "memoria", id: ID, rota: "/ia/memoria" }]);
    // ⛔ Esquecer ≠ apagar, e a ressalva é onde essa diferença chega ao dono.
    expect(efeito.previsao.ressalvas.join(" ")).toContain("CONTINUA LEGÍVEL");
  });

  it("memória inexistente cancela a proposta", async () => {
    await expect(preverEsquecerPreferencia(CTX, { memoria_id: ID })).rejects.toThrow(
      EfeitoImpossivel,
    );
  });
});

/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ ⛔ O INVERSO DE "LEMBRAR" É "ESQUECER", NÃO UMA EXCLUSÃO — invariante 48.              ║
 * ║                                                                                       ║
 * ║ `isCommandCoherent` já recusa inverso inexistente e inverso apontando para si mesmo.  ║
 * ║ O que ele NÃO sabe é se o inverso é PROPORCIONAL, e é isso que se afirma aqui: um     ║
 * ║ desfazer que apagasse a linha tiraria do dono a chance de reler o que ele escreveu.   ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */
describe("o inverso declarado", () => {
  it("lembrarPreferencia desfaz com esquecerPreferencia, que existe no registry", () => {
    const lembrar = findCommand("lembrarPreferencia");
    expect(lembrar?.desfazer.kind).toBe("command");
    if (lembrar?.desfazer.kind !== "command") return;

    expect(lembrar.desfazer.command).toBe("esquecerPreferencia");
    expect(lembrar.desfazer.command).not.toBe(lembrar.name);
    expect(findCommand("esquecerPreferencia")).not.toBeNull();
  });

  /** O inverso recebe o que a EXECUÇÃO registrou — `targetId` —, nunca o payload original. */
  it("o payload do inverso sai do targetId, e falta de id devolve null", () => {
    const lembrar = findCommand("lembrarPreferencia");
    if (lembrar?.desfazer.kind !== "command") throw new Error("inverso ausente");

    expect(lembrar.desfazer.payload({ targetId: ID, changedFields: {} })).toEqual({
      memoria_id: ID,
    });
    expect(lembrar.desfazer.payload({ targetId: null, changedFields: {} })).toBeNull();
  });

  /**
   * ⛔ `content` FORA DE `camposAuditaveis`. `ai_action_executions.changed_fields` é auditoria
   * PERMANENTE e não some com a conversa (invariante 38): a frase ali sobreviveria ao "apagar"
   * da tela, num lugar que o dono não sabe que existe. É a mesma razão pela qual
   * `ai_memory_events` não guarda conteúdo.
   */
  it("nenhum command de memória pode detalhar o conteúdo", () => {
    for (const nome of ["lembrarPreferencia", "esquecerPreferencia"]) {
      const cmd = findCommand(nome);
      expect(cmd?.camposAuditaveis, nome).not.toContain("content");
      expect(cmd?.camposAuditaveis, nome).not.toContain("conteudo");
    }
  });

  /** Esquecer não tem inverso automático — e o contrato exige o motivo escrito. */
  it("esquecerPreferencia declara que não há desfazer, com o motivo", () => {
    const esquecer = findCommand("esquecerPreferencia");
    expect(esquecer?.desfazer.kind).toBe("nao-ha");
    if (esquecer?.desfazer.kind !== "nao-ha") return;
    expect(esquecer.desfazer.porque.trim()).not.toBe("");
    expect(esquecer.desfazer.porque).toContain("IA · Memória");
  });
});
