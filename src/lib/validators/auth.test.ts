import { describe, expect, it } from "vitest";
import { changeEmailSchema, changePasswordSchema } from "@/lib/validators/auth";

describe("changePasswordSchema", () => {
  it("aceita nova senha válida com confirmação igual", () => {
    const res = changePasswordSchema.safeParse({
      current_password: "antiga123",
      new_password: "novasenha",
      confirm_password: "novasenha",
    });
    expect(res.success).toBe(true);
  });

  it("rejeita quando a confirmação não coincide", () => {
    const res = changePasswordSchema.safeParse({
      current_password: "antiga123",
      new_password: "novasenha",
      confirm_password: "outracoisa",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const fields = res.error.flatten().fieldErrors;
      expect(fields.confirm_password?.[0]).toBe("As senhas não coincidem.");
    }
  });

  it("rejeita nova senha com menos de 6 caracteres", () => {
    const res = changePasswordSchema.safeParse({
      current_password: "antiga123",
      new_password: "123",
      confirm_password: "123",
    });
    expect(res.success).toBe(false);
  });

  it("exige a senha atual", () => {
    const res = changePasswordSchema.safeParse({
      current_password: "",
      new_password: "novasenha",
      confirm_password: "novasenha",
    });
    expect(res.success).toBe(false);
  });
});

describe("changeEmailSchema", () => {
  it("aceita e-mail válido", () => {
    expect(changeEmailSchema.safeParse({ email: "novo@email.com" }).success).toBe(
      true,
    );
  });

  it("rejeita e-mail inválido", () => {
    expect(changeEmailSchema.safeParse({ email: "sem-arroba" }).success).toBe(
      false,
    );
  });
});
