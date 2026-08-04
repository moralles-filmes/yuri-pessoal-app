import { describe, expect, it } from "vitest";
import { nextLocalText, shouldCommitText } from "./url-text-sync";

describe("nextLocalText", () => {
  it("não mexe no campo quando a URL não mudou", () => {
    expect(
      nextLocalText({ localText: "supi", previousUrlText: "sup", urlText: "sup" }),
    ).toBeNull();
  });

  it("não mexe no campo quando a URL é o eco da própria digitação", () => {
    // O usuário digitou "supino"; a gravação atrasada chegou. O campo já está certo.
    expect(
      nextLocalText({ localText: "supino", previousUrlText: "sup", urlText: "supino" }),
    ).toBeNull();
  });

  it("preserva o espaço que o usuário acabou de digitar", () => {
    // A URL guarda "supino" (aparado). Roubar o espaço aqui quebraria "supino inclinado".
    expect(
      nextLocalText({ localText: "supino ", previousUrlText: "sup", urlText: "supino" }),
    ).toBeNull();
  });

  it("não engole o que foi digitado enquanto a gravação estava em voo", () => {
    // Digitou "sup", a gravação partiu, e ele seguiu digitando "ino" antes de a URL responder.
    // Quando o "sup" da URL chega, ele é eco de uma gravação NOSSA — o campo já andou.
    expect(
      nextLocalText({
        localText: "supino",
        previousUrlText: "",
        urlText: "sup",
        lastCommittedText: "sup",
      }),
    ).toBeNull();
  });

  it("adota o valor quando a URL muda por fora — limpar filtros", () => {
    expect(
      nextLocalText({ localText: "supino", previousUrlText: "supino", urlText: "" }),
    ).toBe("");
  });

  it("adota o valor quando a URL muda por fora — voltar ou link colado", () => {
    expect(
      nextLocalText({ localText: "", previousUrlText: "", urlText: "agachamento" }),
    ).toBe("agachamento");
  });

  it("a limpeza vence a digitação pendente", () => {
    // Estava digitando "abc" e clicou em Limpar: o campo tem de esvaziar de verdade.
    expect(nextLocalText({ localText: "abc", previousUrlText: "ab", urlText: "" })).toBe("");
  });
});

describe("shouldCommitText", () => {
  it("grava o que ainda não está na URL", () => {
    expect(shouldCommitText("supino", "sup")).toBe(true);
  });

  it("não grava quando a URL já reflete o texto", () => {
    expect(shouldCommitText("supino", "supino")).toBe(false);
  });

  it("não grava de novo só por causa de espaço nas pontas", () => {
    // Senão o campo entraria em laço: grava " x " → URL "x" → difere → grava de novo.
    expect(shouldCommitText("  supino  ", "supino")).toBe(false);
  });

  it("campo vazio com URL vazia não grava nada", () => {
    expect(shouldCommitText("", "")).toBe(false);
  });
});
