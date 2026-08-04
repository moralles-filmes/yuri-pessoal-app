import { describe, expect, it } from "vitest";
import { mapServerFieldErrors, serverErrorMessage } from "@/lib/forms/server-errors";

const CAMPOS = ["name", "description", "notes", "sets"] as const;

describe("mapServerFieldErrors", () => {
  it("destaca os campos que existem na tela", () => {
    const { toSet, orphans } = mapServerFieldErrors(
      { name: ["Informe o nome"], description: ["Máximo de 10 caracteres"] },
      CAMPOS,
    );
    expect(toSet).toEqual([
      { name: "name", message: "Informe o nome" },
      { name: "description", message: "Máximo de 10 caracteres" },
    ]);
    expect(orphans).toEqual([]);
  });

  it("não engole erro de campo que a tela não tem — foi esse silêncio que criou o bug", () => {
    const { toSet, orphans } = mapServerFieldErrors({ icon: ["Valor inválido"] }, CAMPOS);
    expect(toSet).toEqual([]);
    expect(orphans).toEqual(["icon: Valor inválido"]);
  });

  it("trata campo aninhado como pertencente à raiz", () => {
    const { toSet } = mapServerFieldErrors({ "sets.0.reps": ["Inválido"] }, CAMPOS);
    expect(toSet).toEqual([{ name: "sets.0.reps", message: "Inválido" }]);
  });

  it("ignora listas vazias e mensagens em branco", () => {
    const { toSet, orphans } = mapServerFieldErrors(
      { name: [], description: ["   "], notes: undefined },
      CAMPOS,
    );
    expect(toSet).toEqual([]);
    expect(orphans).toEqual([]);
  });

  it("aceita ausência total de erros", () => {
    expect(mapServerFieldErrors(undefined, CAMPOS)).toEqual({ toSet: [], orphans: [] });
  });

  it("usa a primeira mensagem não vazia do campo", () => {
    const { toSet } = mapServerFieldErrors({ name: ["", "Informe o nome"] }, CAMPOS);
    expect(toSet).toEqual([{ name: "name", message: "Informe o nome" }]);
  });
});

describe("serverErrorMessage", () => {
  const vazio = { toSet: [], orphans: [] };

  it("mantém a mensagem da action quando tudo é destacável", () => {
    const mapped = mapServerFieldErrors({ name: ["Informe o nome"] }, CAMPOS);
    expect(serverErrorMessage("Verifique os campos destacados.", mapped)).toBe(
      "Verifique os campos destacados.",
    );
  });

  it("substitui a mensagem quando NADA é destacável", () => {
    const mapped = mapServerFieldErrors({ icon: ["Valor inválido"] }, CAMPOS);
    expect(serverErrorMessage("Verifique os campos destacados.", mapped)).toBe(
      "icon: Valor inválido",
    );
  });

  it("soma o detalhe quando parte é destacável e parte não", () => {
    const mapped = mapServerFieldErrors(
      { name: ["Informe o nome"], icon: ["Valor inválido"] },
      CAMPOS,
    );
    expect(serverErrorMessage("Verifique os campos destacados.", mapped)).toBe(
      "Verifique os campos destacados. icon: Valor inválido",
    );
  });

  it("sem erro nenhum, devolve a mensagem original", () => {
    expect(serverErrorMessage("Falhou.", vazio)).toBe("Falhou.");
  });
});
