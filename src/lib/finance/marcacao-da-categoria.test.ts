import { describe, expect, it } from "vitest";
import {
  aplicarAtalhoDaCategoria,
  marcacaoParaGravar,
  mostrarFiltroDeTerceiros,
  motivoDaListaVazia,
  sugereTerceiros,
  tipoDeCategoriaSugere,
  type ClassificacaoNaTela,
  type ContextoDoAtalho,
} from "@/lib/finance/marcacao-da-categoria";

const PADRAO: ClassificacaoNaTela = { classificacao: "pessoal", origem: "padrao" };
const DO_ATALHO: ClassificacaoNaTela = { classificacao: "terceiro", origem: "atalho" };
const criar = (sobre: Partial<ContextoDoAtalho> = {}): ContextoDoAtalho => ({
  marcacao: "terceiro",
  tipo: "receita",
  modo: "criar",
  ...sobre,
});

describe("03-C2 · A2 — aplicarAtalhoDaCategoria", () => {
  it("receita nova em categoria marcada recebe 'terceiro', com a origem do atalho", () => {
    expect(aplicarAtalhoDaCategoria(PADRAO, criar())).toEqual(DO_ATALHO);
  });

  it("NUNCA age em edição (D10), nem com a origem do atalho", () => {
    expect(aplicarAtalhoDaCategoria(PADRAO, criar({ modo: "editar" }))).toBe(PADRAO);
    expect(aplicarAtalhoDaCategoria(DO_ATALHO, criar({ modo: "editar", marcacao: null }))).toBe(DO_ATALHO);
  });

  it("NUNCA sobrescreve a escolha do usuário", () => {
    for (const classificacao of ["pessoal", "compartilhada", "terceiro"] as const) {
      const doUsuario: ClassificacaoNaTela = { classificacao, origem: "usuario" };
      expect(aplicarAtalhoDaCategoria(doUsuario, criar())).toBe(doUsuario);
      expect(aplicarAtalhoDaCategoria(doUsuario, criar({ marcacao: null }))).toBe(doUsuario);
    }
  });

  it("despesa em categoria marcada nunca recebe 'terceiro', em nenhuma origem (K0)", () => {
    expect(aplicarAtalhoDaCategoria(PADRAO, criar({ tipo: "despesa" })).classificacao).toBe("pessoal");
    expect(aplicarAtalhoDaCategoria(DO_ATALHO, criar({ tipo: "despesa" })).classificacao).toBe("pessoal");
    for (const tipo of ["despesa", "transferencia", "ajuste"] as const) {
      expect(aplicarAtalhoDaCategoria(PADRAO, criar({ tipo }))).not.toEqual(DO_ATALHO);
    }
  });

  it("marcação nula não sugere nada", () => {
    expect(aplicarAtalhoDaCategoria(PADRAO, criar({ marcacao: null }))).toBe(PADRAO);
  });

  it("'pessoal' gravado como marcação é 'sem sugestão'", () => {
    expect(aplicarAtalhoDaCategoria(PADRAO, criar({ marcacao: "pessoal" }))).toBe(PADRAO);
  });

  describe("P1 — a sugestão acompanha a categoria enquanto o usuário não mexeu", () => {
    it("marcada → sem marcação desfaz e volta a pessoal", () => {
      expect(aplicarAtalhoDaCategoria(DO_ATALHO, criar({ marcacao: null }))).toEqual(PADRAO);
    });
    it("marcada → outra marcada mantém (o mesmo objeto)", () => {
      expect(aplicarAtalhoDaCategoria(DO_ATALHO, criar())).toBe(DO_ATALHO);
    });
    it("receita → despesa desfaz a sugestão", () => {
      expect(aplicarAtalhoDaCategoria(DO_ATALHO, criar({ tipo: "despesa" }))).toEqual(PADRAO);
    });
    it("despesa → receita com a categoria marcada aplica a sugestão", () => {
      const comDespesa = aplicarAtalhoDaCategoria(PADRAO, criar({ tipo: "despesa" }));
      expect(aplicarAtalhoDaCategoria(comDespesa, criar({ tipo: "receita" }))).toEqual(DO_ATALHO);
    });
  });
});

describe("03-C2 · A2 — vocabulário", () => {
  it("só 'terceiro' sugere", () => {
    expect(sugereTerceiros("terceiro")).toBe(true);
    for (const v of ["pessoal", "compartilhada", null, undefined, ""]) expect(sugereTerceiros(v)).toBe(false);
  });
  it("K0: só receita e ambos têm o campo", () => {
    expect(tipoDeCategoriaSugere("receita")).toBe(true);
    expect(tipoDeCategoriaSugere("ambos")).toBe(true);
    expect(tipoDeCategoriaSugere("despesa")).toBe(false);
  });
});

describe("03-C2 · A2 — marcacaoParaGravar (P2)", () => {
  it("categoria de despesa nunca grava a marcação", () => {
    expect(marcacaoParaGravar("despesa", "terceiro")).toBeNull();
  });
  it("receita e ambos gravam 'terceiro' quando escolhido", () => {
    expect(marcacaoParaGravar("receita", "terceiro")).toBe("terceiro");
    expect(marcacaoParaGravar("ambos", "terceiro")).toBe("terceiro");
  });
  it("sem escolha (ou com o sentinela do select) grava null", () => {
    for (const kind of ["despesa", "receita", "ambos"]) {
      expect(marcacaoParaGravar(kind, null)).toBeNull();
      expect(marcacaoParaGravar(kind, "nenhuma")).toBeNull();
    }
  });
});

describe("03-C2 · A6 — o filtro, do lado puro", () => {
  it("lista vazia sem categoria marcada diz isso e aponta o caminho", () => {
    expect(motivoDaListaVazia(0)).toBe(
      "Nenhuma categoria está marcada como de terceiros. Marque uma em Categorias.",
    );
  });
  it("lista vazia com categoria marcada diz que não há lançamento nelas", () => {
    expect(motivoDaListaVazia(2)).toBe(
      "Nenhum lançamento nas categorias marcadas como de terceiros, com os filtros atuais.",
    );
  });
  it("P5: o botão aparece com categoria marcada, ou ligado pela URL para poder ser desligado", () => {
    expect(mostrarFiltroDeTerceiros({ ligado: false, categoriasMarcadas: 0 })).toBe(false);
    expect(mostrarFiltroDeTerceiros({ ligado: false, categoriasMarcadas: 1 })).toBe(true);
    expect(mostrarFiltroDeTerceiros({ ligado: true, categoriasMarcadas: 0 })).toBe(true);
  });
});
