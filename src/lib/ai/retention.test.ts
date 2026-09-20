import { describe, expect, it } from "vitest";
import {
  ESCOPOS_DE_EXCLUSAO,
  ehEscopoDeExclusao,
  oQuePermanece,
  oQueTambemSai,
  resumoDaExclusao,
} from "./retention";

describe("escopos", () => {
  it("reconhece os escopos válidos e recusa o resto", () => {
    expect(ehEscopoDeExclusao("conversas")).toBe(true);
    expect(ehEscopoDeExclusao("tudo")).toBe(false);
    expect(ehEscopoDeExclusao(null)).toBe(false);
  });
});

describe("o que permanece", () => {
  // ⛔ A invariante 38 tirou a FK de `ai_action_executions` de propósito: apagar a conversa
  // não pode apagar o registro de que a IA lançou uma transação. A tela DIZ isso.
  it("apagar conversas preserva o registro das ações aplicadas", () => {
    const permanece = oQuePermanece("conversas");
    expect(permanece.length).toBeGreaterThan(0);
    expect(permanece.join(" ")).toContain("ações");
  });

  it("TODO escopo explica o que permanece — nenhum devolve lista vazia", () => {
    for (const escopo of ESCOPOS_DE_EXCLUSAO) {
      expect(oQuePermanece(escopo).length).toBeGreaterThan(0);
    }
  });
});

describe("o que também sai", () => {
  // ⛔ `ai_conversations` → `ai_runs` → `ai_usage_events` é cascade: apagar conversa apaga a
  // medição de custo dela. Quem clica para arrumar a casa não imagina que está zerando o
  // próprio controle de orçamento, e um aviso depois do fato não serve para nada.
  it("avisa que o consumo medido some junto com as conversas", () => {
    for (const escopo of ["conversas", "conversas_antigas"] as const) {
      expect(oQueTambemSai(escopo).join(" ")).toContain("Consumo");
    }
  });

  it("TODO escopo declara o que leva junto — nenhum devolve lista vazia", () => {
    for (const escopo of ESCOPOS_DE_EXCLUSAO) {
      expect(oQueTambemSai(escopo).length).toBeGreaterThan(0);
    }
  });
});

describe("resumo", () => {
  it("usa singular e plural corretamente", () => {
    expect(resumoDaExclusao("conversas", 1)).toContain("1 conversa");
    expect(resumoDaExclusao("conversas", 3)).toContain("3 conversas");
  });

  it("diz que não há nada a apagar quando a contagem é zero", () => {
    expect(resumoDaExclusao("conversas", 0)).toContain("Nada");
  });

  // O único escopo masculino. Concordância fixa escreveria "1 comprovante será apagada"
  // justamente na tela em que o dono confirma uma exclusão.
  it("concorda em gênero com o escopo", () => {
    expect(resumoDaExclusao("documentos", 1)).toBe("1 comprovante será apagado.");
    expect(resumoDaExclusao("documentos", 2)).toBe("2 comprovantes serão apagados.");
    expect(resumoDaExclusao("documentos", 0)).toBe(
      "Nada a apagar: nenhum comprovante neste filtro.",
    );
    expect(resumoDaExclusao("insights", 1)).toBe("1 análise será apagada.");
    expect(resumoDaExclusao("conversas", 0)).toBe(
      "Nada a apagar: nenhuma conversa neste filtro.",
    );
  });

  // O toast relata o que JÁ aconteceu; o diálogo, o que vai acontecer. Mesma frase, mesmo
  // gênero, mesmo número — só o tempo do verbo muda.
  it("relata no passado o que já foi apagado", () => {
    expect(resumoDaExclusao("conversas", 1, "passado")).toBe("1 conversa foi apagada.");
    expect(resumoDaExclusao("conversas", 4, "passado")).toBe("4 conversas foram apagadas.");
    expect(resumoDaExclusao("documentos", 1, "passado")).toBe("1 comprovante foi apagado.");
    expect(resumoDaExclusao("documentos", 2, "passado")).toBe(
      "2 comprovantes foram apagados.",
    );
  });
});
