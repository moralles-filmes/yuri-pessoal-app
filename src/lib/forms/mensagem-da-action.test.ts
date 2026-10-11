import { describe, expect, it } from "vitest";
import { errosDaAction, mensagemDaAction } from "./mensagem-da-action";

describe("errosDaAction — mensagem sob o campo e aviso geral", () => {
  it("campo da tela vai para porCampo (pela raiz, a primeira mensagem); órfão vai para o texto", () => {
    expect(
      errosDaAction(
        {
          error: "Verifique os campos destacados.",
          fieldErrors: {
            "values.0.value": ["Valor fora do intervalo."],
            "values.1.value": ["Outro."],
            typeId: ["Medida não encontrada."],
            file: ["Arquivo maior que 10 MB."],
          },
        },
        ["values", "typeId"],
      ),
    ).toEqual({
      porCampo: { values: "Valor fora do intervalo.", typeId: "Medida não encontrada." },
      texto: "Verifique os campos destacados. file: Arquivo maior que 10 MB.",
    });
  });

  it("sem fieldErrors: nada sob campo, a mensagem da action no aviso", () => {
    expect(errosDaAction({ error: "Sem conexão." }, ["name"])).toEqual({ porCampo: {}, texto: "Sem conexão." });
  });
});

describe("mensagemDaAction — o erro de campo do servidor nunca some", () => {
  it("sem fieldErrors, a mensagem da action passa como veio", () => {
    expect(mensagemDaAction({ error: "Não foi possível salvar." })).toBe("Não foi possível salvar.");
  });

  it("campo que a tela NÃO tem sobe com o nome e a mensagem real (no lugar de 'Verifique os campos destacados.')", () => {
    expect(
      mensagemDaAction({
        error: "Verifique os campos destacados.",
        fieldErrors: { target_workout_id: ["Escolha o treino substituto."] },
      }),
    ).toBe("target_workout_id: Escolha o treino substituto.");
  });

  it("campo que a tela tem não vira órfão; a mensagem da action fica", () => {
    expect(
      mensagemDaAction(
        { error: "Verifique os campos destacados.", fieldErrors: { name: ["Já existe uma medida com esse nome."] } },
        ["name"],
      ),
    ).toBe("Verifique os campos destacados.");
  });

  it("com campo da tela e órfão juntos, diz os dois", () => {
    expect(
      mensagemDaAction(
        {
          error: "Verifique os campos destacados.",
          fieldErrors: { name: ["Obrigatório."], file: ["Arquivo maior que 10 MB."] },
        },
        ["name"],
      ),
    ).toBe("Verifique os campos destacados. file: Arquivo maior que 10 MB.");
  });

  it("mensagem vazia é ignorada", () => {
    expect(mensagemDaAction({ error: "Erro.", fieldErrors: { a: ["", "  "] } })).toBe("Erro.");
  });
});
