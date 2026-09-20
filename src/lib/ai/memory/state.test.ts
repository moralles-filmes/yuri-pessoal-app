/**
 * Fase 18-F · Bloco 3 — IA · O estado de uma memória é DERIVADO. Invariante 35 e 70.
 *
 * `ai_memories` não tem coluna de status. Gravar o estado criaria uma segunda verdade que
 * envelhece sozinha — uma memória "vigente" na coluna e vencida no prazo, e nenhuma das duas
 * leituras errada isoladamente.
 */

import { describe, expect, it } from "vitest";
import { AI_TOOL_REGISTRY } from "@/lib/ai/tools/registry";
import { MODULOS_DE_MEMORIA } from "./contracts";
import { entraNoPrompt, estadoDaMemoria } from "./state";

const AGORA = new Date("2026-09-20T15:00:00Z");
const ev = (evento: string, created_at: string) =>
  ({ evento, created_at }) as Parameters<typeof estadoDaMemoria>[1][number];

describe("estadoDaMemoria", () => {
  it("sem evento e sem prazo, é vigente", () => {
    expect(estadoDaMemoria(null, [], AGORA).estado).toBe("vigente");
  });

  it("prazo vencido vira expirada, e diz em que dia venceu", () => {
    const r = estadoDaMemoria("2026-09-18T12:00:00Z", [], AGORA);
    expect(r.estado).toBe("expirada");
    // ⛔ Dia de BRASÍLIA, nunca `.slice(0,10)` num timestamptz.
    expect(r.expirouEm).toBe("2026-09-18");
  });

  /**
   * ⛔ O CASO QUE `.slice(0,10)` ERRARIA. Um prazo que vence às 23h59 de Brasília é 02h59 do
   * DIA SEGUINTE em UTC: o corte diria que a memória venceu amanhã. É a regra de fuso do
   * projeto aplicada ao único `timestamptz` deste bloco.
   */
  it("o dia em que venceu é o de Brasília, não o de UTC", () => {
    const r = estadoDaMemoria("2026-09-19T02:59:00Z", [], AGORA);
    expect(r.estado).toBe("expirada");
    expect(r.expirouEm).toBe("2026-09-18");
  });

  it("prazo no futuro continua vigente", () => {
    expect(estadoDaMemoria("2026-10-01T12:00:00Z", [], AGORA).estado).toBe("vigente");
  });

  it("⛔ expirar NÃO apaga: a memória continua legível, só sai do prompt", () => {
    const r = estadoDaMemoria("2026-09-18T12:00:00Z", [], AGORA);
    expect(entraNoPrompt(r.estado)).toBe(false);
    expect(r.estado).toBe("expirada");
  });

  it("a decisão do dono VENCE o prazo, nos dois sentidos", () => {
    // Desativada dentro do prazo: continua desativada.
    expect(
      estadoDaMemoria("2026-10-01T12:00:00Z", [ev("desativada", "2026-09-19T10:00:00Z")], AGORA)
        .estado,
    ).toBe("desativada");
    // Desativada e já vencida: a decisão dele é o que a tela mostra.
    expect(
      estadoDaMemoria("2026-09-18T12:00:00Z", [ev("desativada", "2026-09-19T10:00:00Z")], AGORA)
        .estado,
    ).toBe("desativada");
  });

  /**
   * ⚠️ E `reativada` DEVOLVE A PALAVRA AO PRAZO — ela não torna a memória vigente para
   * sempre. Reativar uma memória cujo prazo já passou a deixa expirada, que é o que a tela
   * precisa dizer: a decisão dele foi honrada, e o prazo dela acabou.
   */
  it("reativada devolve a palavra ao prazo, em vez de ignorá-lo", () => {
    const r = estadoDaMemoria(
      "2026-09-18T12:00:00Z",
      [ev("desativada", "2026-09-17T10:00:00Z"), ev("reativada", "2026-09-19T10:00:00Z")],
      AGORA,
    );
    expect(r.estado).toBe("expirada");
    expect(r.expirouEm).toBe("2026-09-18");
  });

  it("vale o ÚLTIMO evento, não o primeiro — e a ordem de entrada não importa", () => {
    const eventos = [
      ev("reativada", "2026-09-19T11:00:00Z"),
      ev("criada", "2026-09-01T09:00:00Z"),
      ev("desativada", "2026-09-19T10:00:00Z"),
    ];
    expect(estadoDaMemoria(null, eventos, AGORA).estado).toBe("vigente");
    expect(estadoDaMemoria(null, [...eventos].reverse(), AGORA).estado).toBe("vigente");
  });

  it("esquecida é uma decisão como as outras — e reativar depois a traz de volta", () => {
    expect(
      estadoDaMemoria(null, [ev("esquecida", "2026-09-19T10:00:00Z")], AGORA).estado,
    ).toBe("esquecida");
    expect(
      estadoDaMemoria(
        null,
        [ev("esquecida", "2026-09-19T10:00:00Z"), ev("reativada", "2026-09-19T12:00:00Z")],
        AGORA,
      ).estado,
    ).toBe("vigente");
  });

  it("`criada` e `editada` não mudam estado — são registro, não decisão", () => {
    expect(
      estadoDaMemoria(
        null,
        [ev("criada", "2026-09-01T09:00:00Z"), ev("editada", "2026-09-19T10:00:00Z")],
        AGORA,
      ).estado,
    ).toBe("vigente");
  });

  /**
   * ⚠️ `editada` DEPOIS de `desativada` não reativa nada. Ela é registro de que o texto
   * mudou; quem decide exibição são os três eventos de decisão. Sem esta asserção, alguém
   * "simplificaria" a busca para o último evento de qualquer espécie e a memória voltaria a
   * orientar o assistente porque o dono corrigiu uma vírgula.
   */
  it("editar uma memória desativada não a reativa", () => {
    expect(
      estadoDaMemoria(
        null,
        [ev("desativada", "2026-09-18T09:00:00Z"), ev("editada", "2026-09-19T10:00:00Z")],
        AGORA,
      ).estado,
    ).toBe("desativada");
  });

  it("só `vigente` entra no prompt", () => {
    expect(entraNoPrompt("vigente")).toBe(true);
    for (const e of ["expirada", "desativada", "esquecida"] as const) {
      expect(entraNoPrompt(e), e).toBe(false);
    }
  });
});

/**
 * ⚠️ O vocabulário de módulo é ESCRITO À MÃO em `contracts.ts` (o arquivo não pode importar
 * nada) e repetido no CHECK do banco. Este teste é o que impede os dois de divergirem do
 * registry — uma memória amarrada a um módulo que não existe nunca entraria no prompt, e nada
 * denunciaria isso.
 */
describe("o vocabulário de módulo é o do Tool Registry", () => {
  it("todo módulo de memória tem ferramenta publicada", () => {
    const doRegistry = new Set(
      AI_TOOL_REGISTRY.filter((t) => t.module !== "memory").map((t) => t.module),
    );
    expect([...MODULOS_DE_MEMORIA].sort()).toEqual([...doRegistry].sort());
  });
});
