import { describe, expect, it } from "vitest";
import {
  sugerirCategoriaId,
  sugerirCategoriaNome,
} from "@/lib/import/categorize";

const categorias = [
  { id: "c-merc", name: "Mercado" },
  { id: "c-aliment", name: "Alimentação" },
  { id: "c-transp", name: "Transporte" },
  { id: "c-deliv", name: "Delivery" },
  { id: "c-comb", name: "Combustível" },
  { id: "c-saude", name: "Saúde" },
];

describe("sugerirCategoriaNome", () => {
  it("reconhece estabelecimentos comuns (sem acento/caixa)", () => {
    expect(sugerirCategoriaNome("SUPERMERCADO EXTRA")).toBe("Mercado");
    expect(sugerirCategoriaNome("Posto Shell")).toBe("Combustível");
    expect(sugerirCategoriaNome("Drogaria São Paulo")).toBe("Saúde");
    expect(sugerirCategoriaNome("PADARIA CENTRAL")).toBe("Alimentação");
  });

  it("prioriza regras mais específicas (iFood = Delivery, não Alimentação)", () => {
    expect(sugerirCategoriaNome("IFOOD *RESTAURANTE")).toBe("Delivery");
    expect(sugerirCategoriaNome("UBER EATS")).toBe("Delivery");
    expect(sugerirCategoriaNome("UBER *TRIP")).toBe("Transporte");
  });

  it("retorna null quando nada casa", () => {
    expect(sugerirCategoriaNome("XPTO 12345")).toBeNull();
    expect(sugerirCategoriaNome("")).toBeNull();
    expect(sugerirCategoriaNome(null)).toBeNull();
  });
});

describe("sugerirCategoriaId", () => {
  it("mapeia a sugestão para o id da categoria do usuário", () => {
    expect(sugerirCategoriaId("SUPERMERCADO EXTRA", categorias)).toBe("c-merc");
    expect(sugerirCategoriaId("Posto Ipiranga", categorias)).toBe("c-comb");
  });

  it("retorna null se a categoria sugerida não existir no usuário", () => {
    expect(
      sugerirCategoriaId("FACEBOOK ADS", categorias), // Marketing não está na lista
    ).toBeNull();
    expect(sugerirCategoriaId("XPTO", categorias)).toBeNull();
  });
});
