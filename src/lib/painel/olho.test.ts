import { describe, expect, it } from "vitest";
import { COOKIE_DO_OLHO, valoresOcultos } from "./olho";

describe("olho dos valores", () => {
  it("o nome do cookie é fixo", () => {
    expect(COOKIE_DO_OLHO).toBe("fin_ocultar_valores");
  });

  it("só o valor '1' oculta", () => {
    expect(valoresOcultos("1")).toBe(true);
  });

  it("ausente, vazio ou qualquer outro valor deixa os valores visíveis", () => {
    expect(valoresOcultos(undefined)).toBe(false);
    expect(valoresOcultos("")).toBe(false);
    expect(valoresOcultos("0")).toBe(false);
    expect(valoresOcultos("true")).toBe(false);
    expect(valoresOcultos("11")).toBe(false);
    expect(valoresOcultos(" 1")).toBe(false);
  });
});
