import { describe, expect, it } from "vitest";

import {
  VOCABULARIO_DE_COBRANCA,
  VOCABULARIO_DE_PRESCRICAO,
  VOCABULARIO_PROIBIDO,
  termosProibidosEm,
} from "./vocabulary";

describe("tone/vocabulary — a lista é a UNIÃO das duas que existiam", () => {
  /**
   * Os termos escritos à mão, e não derivados das listas — senão o teste passaria depois de
   * alguém apagar metade delas. São exatamente os que estavam em `nutrition.test.ts:465` e
   * `training.test.ts:365` em 2026-08-04, antes da promoção.
   */
  it("cobre os termos que só a Dieta tinha", () => {
    for (const termo of ["descontrol", "exagerou"]) {
      expect(VOCABULARIO_DE_COBRANCA, termo).toContain(termo);
    }
  });

  it("cobre os termos que só Treinos tinha", () => {
    for (const termo of ["preguiç", "desculpa", "faltou", "sedentár"]) {
      expect(VOCABULARIO_DE_COBRANCA, termo).toContain(termo);
    }
  });

  it("cobre os termos que os dois tinham", () => {
    for (const termo of [
      "falhou",
      "falhando",
      "fracass",
      "de novo",
      "mais uma vez",
      "você não",
      "você deveria",
      "precisa parar",
      "culpa",
      "vergonha",
      "esqueceu",
      "errado",
      "ruim",
    ]) {
      expect(VOCABULARIO_DE_COBRANCA, termo).toContain(termo);
    }
  });

  it("cobre a prescrição da 17-F", () => {
    for (const termo of ["tente", "aumente", "você deve", "recomendamos", "o ideal"]) {
      expect(VOCABULARIO_DE_PRESCRICAO, termo).toContain(termo);
    }
  });

  it("nenhum termo se repete, e nenhum vem em maiúscula", () => {
    expect(new Set(VOCABULARIO_PROIBIDO).size).toBe(VOCABULARIO_PROIBIDO.length);
    for (const termo of VOCABULARIO_PROIBIDO) {
      expect(termo, termo).toBe(termo.toLocaleLowerCase("pt-BR"));
      expect(termo.trim(), termo).toBe(termo);
      expect(termo.length, termo).toBeGreaterThan(2);
    }
  });
});

describe("termosProibidosEm", () => {
  it("acha o termo independentemente da caixa", () => {
    expect(termosProibidosEm("VOCÊ NÃO registrou nada")).toContain("você não");
    expect(termosProibidosEm("Você Falhou de novo")).toEqual(
      expect.arrayContaining(["falhou", "de novo"]),
    );
  });

  it("acha por substring — é o que faz o sufixo não escapar", () => {
    expect(termosProibidosEm("isso foi um fracasso")).toContain("fracass");
    expect(termosProibidosEm("estilo sedentário")).toContain("sedentár");
    expect(termosProibidosEm("vida sedentária")).toContain("sedentár");
    expect(termosProibidosEm("com preguiça")).toContain("preguiç");
  });

  /**
   * ⚠️ HONESTIDADE SOBRE O QUE ESTA LISTA É. Ela casa por substring COM acento, então
   * "sedentarismo" (que não tem acento) escapa. Está registrado aqui de propósito, e não
   * corrigido em silêncio: a lista é um arame de tropeço herdado da 17-F, não um
   * classificador de português. Alargá-la é uma decisão à parte, que mexe no que já passa
   * verde nos dois módulos — e que precisa ser tomada olhando as saídas deles, não aqui.
   */
  it("não pega a forma sem acento — limite conhecido, não defeito escondido", () => {
    expect(termosProibidosEm("sedentarismo")).toEqual([]);
  });

  it("devolve lista vazia para um texto que informa sem cobrar", () => {
    expect(
      termosProibidosEm(
        "Sua média de treinos por semana no período foi menor que a do período anterior.",
      ),
    ).toEqual([]);
  });

  it("aceita restringir a lista — é como os dois testes de notificação a usam", () => {
    expect(termosProibidosEm("o ideal é 3 vezes", VOCABULARIO_DE_COBRANCA)).toEqual([]);
    expect(termosProibidosEm("o ideal é 3 vezes", VOCABULARIO_DE_PRESCRICAO)).toContain(
      "o ideal",
    );
  });
});
