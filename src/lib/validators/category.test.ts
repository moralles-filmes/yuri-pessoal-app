import { describe, expect, it } from "vitest";
import { categorySchema, MSG_MARCACAO_SO_EM_RECEITA } from "@/lib/validators/category";

const BASE = { name: "Categoria A", kind: "receita", color: "#112233", icon: "tag" };
const erros = (v: unknown) => {
  const r = categorySchema.safeParse(v);
  return r.success ? {} : r.error.flatten().fieldErrors;
};

describe("03-C2 · A4 — categorySchema e a marcação", () => {
  it("receita e ambos aceitam 'terceiro'; os três tipos aceitam null", () => {
    expect(categorySchema.safeParse({ ...BASE, classificacao_padrao: "terceiro" }).success).toBe(true);
    expect(categorySchema.safeParse({ ...BASE, kind: "ambos", classificacao_padrao: "terceiro" }).success).toBe(true);
    for (const kind of ["despesa", "receita", "ambos"]) {
      expect(categorySchema.safeParse({ ...BASE, kind, classificacao_padrao: null }).success).toBe(true);
    }
  });

  it("P2: despesa com 'terceiro' é recusada NO CAMPO da marcação", () => {
    expect(erros({ ...BASE, kind: "despesa", classificacao_padrao: "terceiro" }).classificacao_padrao).toEqual([
      MSG_MARCACAO_SO_EM_RECEITA,
    ]);
  });

  it("K0: 'pessoal' e 'compartilhada' não são oferecidos", () => {
    for (const v of ["pessoal", "compartilhada"]) {
      expect(erros({ ...BASE, classificacao_padrao: v }).classificacao_padrao).toBeTruthy();
    }
  });

  it("P3: a chave é obrigatória — ausente é recusada", () => {
    expect(erros(BASE).classificacao_padrao).toBeTruthy();
  });
});
