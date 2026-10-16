import { describe, expect, it } from "vitest";
import { SEARCH_TYPE_LABELS } from "@/lib/search/types";
import { allNavItems } from "@/config/nav";

/** Número de fase é vocabulário do projeto, não do dono. */
const VOCABULARIO_INTERNO = /\bFase\s*\d+/i;

describe("V5 — rótulo visível não carrega número de fase", () => {
  it("a regra sabe dizer não (guarda anti-tautologia)", () => {
    expect("Tarefas (Fase 09)").toMatch(VOCABULARIO_INTERNO);
    expect("Tarefas").not.toMatch(VOCABULARIO_INTERNO);
    expect(Object.keys(SEARCH_TYPE_LABELS).length).toBeGreaterThan(10);
    expect(allNavItems.length).toBeGreaterThan(15);
  });

  it.each(Object.entries(SEARCH_TYPE_LABELS))("busca · %s → %s", (_tipo, rotulo) => {
    expect(rotulo).not.toMatch(VOCABULARIO_INTERNO);
  });

  it.each(allNavItems.map((i) => [i.href, i.title] as const))("menu · %s → %s", (_href, titulo) => {
    // `phase` existe no item e NÃO é exibido — só o `title` é.
    expect(titulo).not.toMatch(VOCABULARIO_INTERNO);
  });
});
