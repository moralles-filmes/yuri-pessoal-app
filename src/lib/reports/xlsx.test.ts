/**
 * Fase 16-F — o pouco que há de lógica pura na exportação em XLSX.
 *
 * `downloadXlsx` em si toca DOM e carrega a biblioteca por import dinâmico, então não é
 * testável fora do navegador. O que dá para travar — e é onde um arquivo corrompido nasce —
 * é o nome da aba: o Excel recusa nome com mais de 31 caracteres, com `: \ / ? * [ ]`, ou
 * repetido.
 */
import { describe, expect, it } from "vitest";
import { sanitizeSheetName } from "./xlsx";

describe("sanitizeSheetName", () => {
  it("corta em 31 caracteres (limite do Excel)", () => {
    const name = sanitizeSheetName("Alimentos mais consumidos no período selecionado");
    expect(name.length).toBeLessThanOrEqual(31);
    expect(name.startsWith("Alimentos mais consumidos")).toBe(true);
  });

  it("remove os símbolos que o Excel proíbe", () => {
    const name = sanitizeSheetName("Consumo: 01/08 [parcial]?");
    for (const forbidden of [":", "\\", "/", "?", "*", "[", "]"]) {
      expect(name, forbidden).not.toContain(forbidden);
    }
  });

  it("nome vazio vira um rótulo válido em vez de quebrar o arquivo", () => {
    expect(sanitizeSheetName("")).toBe("Planilha");
    expect(sanitizeSheetName("   ")).toBe("Planilha");
    expect(sanitizeSheetName("///")).toBe("Planilha");
  });

  it("preserva acentos — os nomes das abas são em pt-BR", () => {
    expect(sanitizeSheetName("Substituições")).toBe("Substituições");
    expect(sanitizeSheetName("Consumo diário")).toBe("Consumo diário");
  });

  it("é determinística: o mesmo nome sai igual sempre", () => {
    const a = sanitizeSheetName("Nutrientes do período");
    const b = sanitizeSheetName("Nutrientes do período");
    expect(a).toBe(b);
  });
});
