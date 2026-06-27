import { describe, expect, it } from "vitest";
import { splitSchema } from "@/lib/validators/split";

describe("splitSchema", () => {
  it("aceita valor no padrão BR (vírgula decimal) — regressão do parsing", () => {
    const parsed = splitSchema.safeParse({
      classificacao: "compartilhada",
      parts: [{ person_id: "11111111-1111-4111-8111-111111111111", tipo: "valor", valor: "44,01" }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.parts[0].valor).toBe(44.01);
  });

  it("aceita milhar BR ('1.234,56') e percentual", () => {
    const parsed = splitSchema.safeParse({
      classificacao: "compartilhada",
      parts: [
        { person_id: "11111111-1111-4111-8111-111111111111", tipo: "valor", valor: "1.234,56" },
        { person_id: "22222222-2222-4222-9222-222222222222", tipo: "percentual", percentual: "30" },
      ],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.parts[0].valor).toBe(1234.56);
      expect(parsed.data.parts[1].percentual).toBe(30);
    }
  });

  it("pessoal não admite partes; compartilhada exige ao menos uma", () => {
    expect(
      splitSchema.safeParse({ classificacao: "pessoal", parts: [] }).success,
    ).toBe(true);
    expect(
      splitSchema.safeParse({ classificacao: "compartilhada", parts: [] }).success,
    ).toBe(false);
  });

  it("rejeita pessoa repetida na divisão", () => {
    const parsed = splitSchema.safeParse({
      classificacao: "compartilhada",
      parts: [
        { person_id: "11111111-1111-4111-8111-111111111111", tipo: "valor", valor: "10" },
        { person_id: "11111111-1111-4111-8111-111111111111", tipo: "valor", valor: "20" },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});
