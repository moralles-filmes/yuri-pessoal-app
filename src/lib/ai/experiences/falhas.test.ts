import { describe, expect, it } from "vitest";
import { avisoDeLeiturasQueFalharam } from "./falhas";

describe("18-F Bloco 4 — a frase da leitura que FALHOU também é nossa", () => {
  it("sem falha, não há frase", () => {
    expect(avisoDeLeiturasQueFalharam([])).toBe("");
  });

  it("uma só: nomeia o módulo e diz que não foi preferência do dono", () => {
    const f = avisoDeLeiturasQueFalharam(["Treinos"]);
    expect(f).toContain("Treinos");
    expect(f).toContain("a leitura falhou");
    // ⛔ A distinção do outro aviso é o ponto: "desligada nas suas preferências" mandaria o
    // dono a `/ia/configuracoes` mexer numa chave que já está ligada.
    expect(f).not.toContain("/ia/configuracoes");
    expect(f).toContain("Tente de novo");
  });

  it("duas ou mais: uma frase só, com a conjunção em pt-BR e o verbo no plural", () => {
    const f = avisoDeLeiturasQueFalharam(["Treinos", "Dieta"]);
    expect(f).toContain("Treinos e Dieta");
    expect(f).toContain("as leituras falharam");
    expect(f.split("\n")).toHaveLength(1);
  });

  /**
   * ⚠️ Duas ferramentas do MESMO módulo falhando são UM nome — a mesma correção que
   * `avisoDoQueFicouDeFora` precisou para não dizer "Treinos e Treinos".
   */
  it("módulo repetido é nomeado uma vez", () => {
    const f = avisoDeLeiturasQueFalharam(["Treinos", "Treinos"]);
    expect(f.match(/Treinos/g)).toHaveLength(1);
    expect(f).toContain("a leitura falhou");
  });

  /** O tom do projeto: informa, não cobra, e não culpa o dono por uma falha nossa. */
  it("não cobra nem culpa o dono", () => {
    const f = avisoDeLeiturasQueFalharam(["Treinos"]).toLowerCase();
    for (const proibida of ["você deveria", "você não", "falhou em", "esqueceu"]) {
      expect(f).not.toContain(proibida);
    }
  });
});
